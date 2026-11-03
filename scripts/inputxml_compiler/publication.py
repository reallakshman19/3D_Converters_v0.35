#!/usr/bin/env python3
"""Immutable publication planning for InputXML compiler result bundles."""
from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from pathlib import Path

from .publication_contract import (
    CompilationView,
    PUBLICATION_SCHEMA,
    VALID_BUNDLE_KINDS,
    bundle_kind,
    json_payload,
    publication_metadata,
    serialize_committed_validation,
)
from .publication_state import (
    PublicationError,
    PublicationIntegrityError,
    PublicationInvariantError,
    PublicationLockError,
    PublicationResult,
    PublicationStage,
    PublicationState,
)
from .xml import _sha256


@dataclass(frozen=True)
class PublicationPlan:
    """Complete immutable plan built before final destination mutation."""

    output_dir: Path
    stem: str
    bundle_kind: str
    transaction_prefix: str
    transaction_dir: Path
    lock_path: Path
    canonical_path: Path
    ledger_path: Path
    validation_path: Path
    staged_canonical_path: Path | None
    staged_ledger_path: Path
    staged_validation_path: Path
    backup_canonical_path: Path
    backup_ledger_path: Path
    backup_validation_path: Path
    canonical_bytes: bytes | None
    ledger_bytes: bytes
    validation_bytes: bytes


def build_publication_plan(
    view: CompilationView,
    output_dir: Path,
) -> PublicationPlan:
    kind = bundle_kind(view)
    validation = json_payload(
        view.validation_base_bytes,
        "Validation report",
    )
    validation["publication"] = publication_metadata(view, kind)
    validation_bytes = serialize_committed_validation(view, validation)
    output_dir = output_dir.resolve()
    lock_key = hashlib.sha256(view.stem.encode("utf-8")).hexdigest()[:24]
    prefix = f".inputxml-txn-{lock_key}-"
    transaction_dir = output_dir / f"{prefix}{uuid.uuid4().hex}"
    new_dir = transaction_dir / "new"
    backup_dir = transaction_dir / "backup"
    plan = PublicationPlan(
        output_dir=output_dir,
        stem=view.stem,
        bundle_kind=kind,
        transaction_prefix=prefix,
        transaction_dir=transaction_dir,
        lock_path=output_dir / f".inputxml-publish-{lock_key}.lock",
        canonical_path=output_dir / f"{view.stem}.canonical.input.xml",
        ledger_path=output_dir / f"{view.stem}.canonicalization-ledger.json",
        validation_path=output_dir / f"{view.stem}.canonical-validation.json",
        staged_canonical_path=(
            new_dir / f"{view.stem}.canonical.input.xml"
            if view.canonical_bytes is not None
            else None
        ),
        staged_ledger_path=(
            new_dir / f"{view.stem}.canonicalization-ledger.json"
        ),
        staged_validation_path=(
            new_dir / f"{view.stem}.canonical-validation.json"
        ),
        backup_canonical_path=backup_dir / "canonical.previous",
        backup_ledger_path=backup_dir / "ledger.previous",
        backup_validation_path=backup_dir / "validation.previous",
        canonical_bytes=view.canonical_bytes,
        ledger_bytes=view.ledger_bytes,
        validation_bytes=validation_bytes,
    )
    validate_publication_plan(plan)
    return plan


def validate_publication_plan(plan: PublicationPlan) -> None:
    if plan.bundle_kind not in VALID_BUNDLE_KINDS:
        raise PublicationInvariantError(
            f"Unknown bundle kind: {plan.bundle_kind}."
        )
    validation = json_payload(
        plan.validation_bytes,
        "Committed validation report",
    )
    metadata = validation.get("publication") or {}
    if metadata.get("schema") != PUBLICATION_SCHEMA:
        raise PublicationInvariantError(
            "Publication schema is missing or invalid."
        )
    if metadata.get("state") != "COMMITTED":
        raise PublicationInvariantError(
            "Validation must be the COMMITTED marker."
        )
    if metadata.get("bundleKind") != plan.bundle_kind:
        raise PublicationInvariantError(
            "Publication bundle kind does not match plan."
        )
    ledger_meta = (metadata.get("files") or {}).get("ledger") or {}
    if ledger_meta.get("sha256") != _sha256(plan.ledger_bytes):
        raise PublicationInvariantError(
            "Planned ledger hash is inconsistent."
        )
    if ledger_meta.get("bytes") != len(plan.ledger_bytes):
        raise PublicationInvariantError(
            "Planned ledger byte length is inconsistent."
        )
    canonical_meta = (metadata.get("files") or {}).get("canonical")
    if plan.canonical_bytes is None:
        if canonical_meta is not None or plan.staged_canonical_path is not None:
            raise PublicationInvariantError(
                "No-candidate plan carries canonical metadata."
            )
    else:
        if not isinstance(canonical_meta, dict):
            raise PublicationInvariantError(
                "Candidate plan lacks canonical metadata."
            )
        if canonical_meta.get("sha256") != _sha256(plan.canonical_bytes):
            raise PublicationInvariantError(
                "Planned canonical hash is inconsistent."
            )
        if canonical_meta.get("bytes") != len(plan.canonical_bytes):
            raise PublicationInvariantError(
                "Planned canonical byte length is inconsistent."
            )
    if str(plan.transaction_dir) in plan.validation_bytes.decode("utf-8"):
        raise PublicationInvariantError(
            "Transient transaction paths entered committed validation."
        )


from .publication_io import FileOps, publish_result_bundle  # noqa: E402
from .publication_verify import verify_committed_bundle  # noqa: E402


__all__ = [
    "CompilationView",
    "FileOps",
    "PublicationError",
    "PublicationIntegrityError",
    "PublicationInvariantError",
    "PublicationLockError",
    "PublicationPlan",
    "PublicationResult",
    "PublicationStage",
    "PublicationState",
    "build_publication_plan",
    "publish_result_bundle",
    "validate_publication_plan",
    "verify_committed_bundle",
]
