#!/usr/bin/env python3
"""Crash-consistent filesystem publication for InputXML result bundles."""
from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from pathlib import Path

from .publication_state import (
    PublicationError,
    PublicationIntegrityError,
    PublicationLockError,
    PublicationResult,
    PublicationStage,
    PublicationState,
)


class FileOps:
    """Explicit filesystem seam used by production and failure-injection tests."""

    def checkpoint(self, event: str) -> None:
        del event

    def ensure_dir(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)

    def transaction_dirs(self, output_dir: Path, prefix: str) -> list[Path]:
        if not output_dir.exists():
            return []
        return sorted(
            path
            for path in output_dir.iterdir()
            if path.is_dir() and path.name.startswith(prefix)
        )

    def acquire_lock(self, path: Path) -> int:
        try:
            return os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError as exc:
            raise PublicationLockError(
                f"Concurrent publication blocked by existing lock: {path.name}."
            ) from exc
        except OSError as exc:
            raise PublicationLockError(
                f"Publication lock could not be created: {path.name}."
            ) from exc

    def release_lock(self, descriptor: int, path: Path) -> None:
        os.close(descriptor)
        path.unlink(missing_ok=True)

    def write_fsync(self, path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())

    def read_bytes(self, path: Path) -> bytes:
        return path.read_bytes()

    def replace(self, source: Path, destination: Path) -> None:
        os.replace(source, destination)

    def unlink(self, path: Path) -> None:
        path.unlink(missing_ok=True)

    def exists(self, path: Path) -> bool:
        return path.exists()

    def is_file(self, path: Path) -> bool:
        return path.is_file()

    def fsync_dir(self, path: Path) -> None:
        if os.name != "posix":
            return
        descriptor = os.open(path, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

    def remove_tree(self, path: Path) -> None:
        shutil.rmtree(path)


@dataclass(frozen=True)
class PriorBundleState:
    canonical: bool
    ledger: bool
    validation: bool


def _prior_bundle_state(plan, ops: FileOps) -> PriorBundleState:
    return PriorBundleState(
        canonical=ops.is_file(plan.canonical_path),
        ledger=ops.is_file(plan.ledger_path),
        validation=ops.is_file(plan.validation_path),
    )


def _stage_plan(plan, ops: FileOps) -> None:
    ops.checkpoint("create_transaction")
    ops.ensure_dir(plan.transaction_dir / "new")
    ops.ensure_dir(plan.transaction_dir / "backup")
    if plan.canonical_bytes is not None and plan.staged_canonical_path is not None:
        ops.checkpoint("write_canonical")
        ops.write_fsync(plan.staged_canonical_path, plan.canonical_bytes)
    ops.checkpoint("write_ledger")
    ops.write_fsync(plan.staged_ledger_path, plan.ledger_bytes)
    ops.checkpoint("write_validation")
    ops.write_fsync(plan.staged_validation_path, plan.validation_bytes)
    ops.checkpoint("verify_stage")
    _verify_staged(plan, ops)


def _verify_staged(plan, ops: FileOps) -> None:
    expected = [
        (plan.staged_ledger_path, plan.ledger_bytes),
        (plan.staged_validation_path, plan.validation_bytes),
    ]
    if plan.canonical_bytes is not None and plan.staged_canonical_path is not None:
        expected.append((plan.staged_canonical_path, plan.canonical_bytes))
    for path, data in expected:
        if not ops.is_file(path) or ops.read_bytes(path) != data:
            raise PublicationIntegrityError(f"Staged bytes do not match: {path.name}.")


def _backup_old_bundle(plan, ops: FileOps) -> None:
    ops.checkpoint("invalidate_validation")
    if ops.is_file(plan.validation_path):
        ops.replace(plan.validation_path, plan.backup_validation_path)
    ops.checkpoint("backup_canonical")
    if ops.is_file(plan.canonical_path):
        ops.replace(plan.canonical_path, plan.backup_canonical_path)
    ops.checkpoint("backup_ledger")
    if ops.is_file(plan.ledger_path):
        ops.replace(plan.ledger_path, plan.backup_ledger_path)


def _install_new_bundle(plan, ops: FileOps) -> None:
    if plan.canonical_bytes is not None and plan.staged_canonical_path is not None:
        ops.checkpoint("install_canonical")
        ops.replace(plan.staged_canonical_path, plan.canonical_path)
    else:
        ops.checkpoint("remove_stale_canonical")
        ops.unlink(plan.canonical_path)
    ops.checkpoint("install_ledger")
    ops.replace(plan.staged_ledger_path, plan.ledger_path)
    ops.checkpoint("install_validation")
    ops.replace(plan.staged_validation_path, plan.validation_path)
    ops.checkpoint("fsync_directory")
    ops.fsync_dir(plan.output_dir)


def _restore_destination(
    *,
    prior_exists: bool,
    backup: Path,
    destination: Path,
    ops: FileOps,
) -> None:
    if ops.is_file(backup):
        ops.unlink(destination)
        ops.replace(backup, destination)
    elif not prior_exists:
        ops.unlink(destination)


def _rollback(
    plan,
    prior: PriorBundleState,
    ops: FileOps,
    state: PublicationState,
) -> None:
    try:
        ops.checkpoint("rollback_restore_canonical")
        _restore_destination(
            prior_exists=prior.canonical,
            backup=plan.backup_canonical_path,
            destination=plan.canonical_path,
            ops=ops,
        )
        ops.checkpoint("rollback_restore_ledger")
        _restore_destination(
            prior_exists=prior.ledger,
            backup=plan.backup_ledger_path,
            destination=plan.ledger_path,
            ops=ops,
        )
        ops.checkpoint("rollback_restore_validation")
        _restore_destination(
            prior_exists=prior.validation,
            backup=plan.backup_validation_path,
            destination=plan.validation_path,
            ops=ops,
        )
        ops.checkpoint("rollback_fsync_directory")
        ops.fsync_dir(plan.output_dir)
        state.rollback()
    except Exception as exc:
        try:
            ops.unlink(plan.validation_path)
        except Exception:
            pass
        raise PublicationIntegrityError(
            "Publication rollback failed; no committed marker can be trusted."
        ) from exc


def _cleanup(plan, ops: FileOps) -> bool:
    try:
        ops.checkpoint("cleanup")
        if ops.exists(plan.transaction_dir):
            ops.remove_tree(plan.transaction_dir)
        return False
    except Exception:
        return True


def _assert_no_unresolved_transaction(plan, ops: FileOps) -> None:
    unresolved = ops.transaction_dirs(plan.output_dir, plan.transaction_prefix)
    if unresolved:
        names = ", ".join(path.name for path in unresolved)
        raise PublicationIntegrityError(
            f"Unresolved prior publication transaction blocks this stem: {names}."
        )


def publish_result_bundle(
    view,
    output_dir: Path,
    *,
    ops: FileOps | None = None,
) -> PublicationResult:
    """Publish a compiler result using a validation-commit-marker protocol."""
    from .publication import build_publication_plan
    from .publication_verify import verify_committed_bundle

    operations = ops or FileOps()
    plan = build_publication_plan(view, output_dir)
    state = PublicationState()
    operations.ensure_dir(plan.output_dir)
    operations.checkpoint("acquire_lock")
    lock_descriptor = operations.acquire_lock(plan.lock_path)
    mutation_started = False
    prior = _prior_bundle_state(plan, operations)
    try:
        state.transition(PublicationStage.LOCK_ACQUIRED)
        _assert_no_unresolved_transaction(plan, operations)
        _stage_plan(plan, operations)
        state.transition(PublicationStage.STAGED)
        mutation_started = True
        _backup_old_bundle(plan, operations)
        state.transition(PublicationStage.OLD_COMMIT_INVALIDATED)
        _install_new_bundle(plan, operations)
        state.transition(PublicationStage.CONTENT_REPLACED)
        verify_committed_bundle(plan.output_dir, plan.stem, ops=operations)
        state.transition(PublicationStage.COMMITTED)
        cleanup_pending = _cleanup(plan, operations)
        canonical_path = plan.canonical_path if plan.canonical_bytes is not None else None
        return PublicationResult(
            terminal_status=view.terminal_status,
            bundle_kind=plan.bundle_kind,
            canonical_path=canonical_path,
            ledger_path=plan.ledger_path,
            validation_path=plan.validation_path,
            cleanup_pending=cleanup_pending,
        )
    except Exception as exc:
        if mutation_started:
            _rollback(plan, prior, operations, state)
            _cleanup(plan, operations)
            raise PublicationError(
                "Publication failed and the previous bundle was restored."
            ) from exc
        _cleanup(plan, operations)
        raise
    finally:
        operations.release_lock(lock_descriptor, plan.lock_path)


__all__ = ["FileOps", "publish_result_bundle"]
