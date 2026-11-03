#!/usr/bin/env python3
"""Fail-closed verifier for committed InputXML result bundles."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .publication_contract import (
    PUBLICATION_PROTOCOL,
    PUBLICATION_SCHEMA,
    VALID_BUNDLE_KINDS,
    VALID_STATUSES,
)
from .publication_state import PublicationIntegrityError
from .serialization import hash_canonical_bytes, hash_ledger_bytes


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise PublicationIntegrityError(f"Duplicate JSON key: {key}.")
        result[key] = value
    return result


def _load_json(data: bytes, label: str) -> dict[str, Any]:
    try:
        payload = json.loads(
            data.decode("utf-8"),
            object_pairs_hook=_reject_duplicate_keys,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PublicationIntegrityError(
            f"{label} is not valid UTF-8 JSON."
        ) from exc
    if not isinstance(payload, dict):
        raise PublicationIntegrityError(f"{label} must be a JSON object.")
    return payload


def _require_file_meta(
    metadata: dict[str, Any],
    key: str,
    expected_name: str,
) -> dict[str, Any]:
    files = metadata.get("files")
    item = files.get(key) if isinstance(files, dict) else None
    if not isinstance(item, dict):
        raise PublicationIntegrityError(
            f"Publication metadata lacks {key}."
        )
    if item.get("name") != expected_name:
        raise PublicationIntegrityError(
            f"Unexpected {key} filename in metadata."
        )
    return item


def _verify_hashed_file(
    path: Path,
    metadata: dict[str, Any],
    ops,
) -> bytes:
    if not ops.is_file(path):
        raise PublicationIntegrityError(
            f"Committed file is missing: {path.name}."
        )
    data = ops.read_bytes(path)
    if metadata.get("bytes") != len(data):
        raise PublicationIntegrityError(
            f"Committed byte length mismatch: {path.name}."
        )
    hash_fn = (
        hash_ledger_bytes
        if "ledger" in path.name
        else hash_canonical_bytes
    )
    if metadata.get("sha256") != hash_fn(data):
        raise PublicationIntegrityError(
            f"Committed hash mismatch: {path.name}."
        )
    return data


def _expected_kind(status: str, has_canonical: bool) -> str:
    if status == "PASS":
        return "PASS_WITH_CANONICAL"
    return (
        "BLOCKED_WITH_CANONICAL"
        if has_canonical
        else "BLOCKED_NO_CANONICAL"
    )


def _verify_status(
    validation: dict[str, Any],
    ledger: dict[str, Any],
    metadata: dict[str, Any],
) -> tuple[str, bool]:
    status = validation.get("status")
    if status not in VALID_STATUSES:
        raise PublicationIntegrityError(
            f"Invalid validation status: {status}."
        )
    if ledger.get("status") != status:
        raise PublicationIntegrityError(
            "Ledger status does not match validation status."
        )
    if metadata.get("terminalStatus") != status:
        raise PublicationIntegrityError(
            "Publication terminal status does not match validation status."
        )
    orchestration = validation.get("orchestration") or {}
    if orchestration.get("terminalStatus") != status:
        raise PublicationIntegrityError(
            "Compiler orchestration status does not match validation status."
        )
    has_canonical = metadata.get("canonicalCandidatePublished")
    if not isinstance(has_canonical, bool):
        raise PublicationIntegrityError(
            "Canonical publication flag must be boolean."
        )
    kind = metadata.get("bundleKind")
    if kind not in VALID_BUNDLE_KINDS or kind != _expected_kind(
        status, has_canonical
    ):
        raise PublicationIntegrityError(
            "Bundle kind is invalid or inconsistent."
        )
    if status == "PASS" and not has_canonical:
        raise PublicationIntegrityError(
            "PASS bundle has no canonical candidate."
        )
    return status, has_canonical


def _verify_identity(
    validation: dict[str, Any],
    ledger: dict[str, Any],
    metadata: dict[str, Any],
) -> None:
    source_hash = metadata.get("sourceHashSha256")
    if not source_hash or source_hash != ledger.get("sourceHashSha256"):
        raise PublicationIntegrityError(
            "Publication source hash does not match ledger."
        )
    dialect = metadata.get("dialect")
    if (
        not dialect
        or dialect != validation.get("dialect")
        or dialect != ledger.get("dialect")
    ):
        raise PublicationIntegrityError(
            "Publication dialect identity is inconsistent."
        )
    resolver = validation.get("resolverOutcome")
    if resolver is None:
        return
    if not isinstance(resolver, dict):
        raise PublicationIntegrityError(
            "Resolver outcome must be a JSON object."
        )
    if resolver.get("profileId") != dialect or not resolver.get("adapterId"):
        raise PublicationIntegrityError(
            "Resolver identity does not match dialect."
        )


def _bundle_policy(payload: dict[str, Any]) -> Any:
    return (payload.get("contractBundle") or {}).get(
        "serializationPolicy"
    )


def _verify_policy(
    validation: dict[str, Any],
    ledger: dict[str, Any],
    metadata: dict[str, Any],
) -> dict[str, Any] | None:
    policy = metadata.get("serializationPolicy")
    if validation.get("blockedAt") == "CONTRACT_BUNDLE_GATE":
        if policy is not None:
            raise PublicationIntegrityError(
                "Unverified contract failure cannot publish policy authority."
            )
        return None
    if (
        "contractBundle" not in validation
        and "contractBundle" not in ledger
        and policy is None
    ):
        return None
    required = {"policyId", "policySchema", "policySha256"}
    if not isinstance(policy, dict) or set(policy) != required:
        raise PublicationIntegrityError(
            "Serialization policy metadata is missing or malformed."
        )
    if _bundle_policy(validation) != policy or _bundle_policy(ledger) != policy:
        raise PublicationIntegrityError(
            "Serialization policy evidence is inconsistent."
        )
    return policy


def _verify_canonical(
    path: Path,
    validation: dict[str, Any],
    ledger: dict[str, Any],
    metadata: dict[str, Any],
    has_canonical: bool,
    status: str,
    ops,
) -> None:
    canonical_meta = (metadata.get("files") or {}).get("canonical")
    if has_canonical:
        if not isinstance(canonical_meta, dict):
            raise PublicationIntegrityError(
                "Canonical metadata is missing."
            )
        if canonical_meta.get("name") != path.name:
            raise PublicationIntegrityError(
                "Unexpected canonical filename in metadata."
            )
        data = _verify_hashed_file(path, canonical_meta, ops)
        if ledger.get("canonicalHashSha256") != hash_canonical_bytes(data):
            raise PublicationIntegrityError(
                "Canonical hash does not match decision ledger."
            )
    else:
        if canonical_meta is not None or ops.exists(path):
            raise PublicationIntegrityError(
                "No-candidate bundle contains canonical evidence."
            )
        if ledger.get("canonicalHashSha256") is not None:
            raise PublicationIntegrityError(
                "No-candidate bundle carries a canonical hash."
            )
    outcome = (validation.get("resolverOutcome") or {}).get("outcomeKind")
    if outcome == "BLOCKED_WITH_CANDIDATE" and not has_canonical:
        raise PublicationIntegrityError(
            "Blocked candidate outcome lost its canonical file."
        )
    if outcome == "BLOCKED_NO_CANDIDATE" and has_canonical:
        raise PublicationIntegrityError(
            "No-candidate outcome published canonical XML."
        )
    if status == "PASS" and outcome not in {
        None,
        "CANONICAL_CANDIDATE",
    }:
        raise PublicationIntegrityError(
            "PASS has a non-accepting resolver outcome."
        )


def verify_committed_bundle(
    output_dir: Path,
    stem: str,
    *,
    ops=None,
) -> dict[str, Any]:
    """Verify a committed bundle without invoking the CII writer."""
    if ops is None:
        from .publication_io import FileOps
        ops = FileOps()
    validation_path = output_dir / f"{stem}.canonical-validation.json"
    ledger_path = output_dir / f"{stem}.canonicalization-ledger.json"
    canonical_path = output_dir / f"{stem}.canonical.input.xml"
    if not ops.is_file(validation_path):
        raise PublicationIntegrityError(
            "Validation commit marker is missing; bundle is not committed."
        )
    validation = _load_json(
        ops.read_bytes(validation_path),
        "Validation report",
    )
    metadata = validation.get("publication")
    if not isinstance(metadata, dict):
        raise PublicationIntegrityError("Publication metadata is missing.")
    if (
        metadata.get("schema") != PUBLICATION_SCHEMA
        or metadata.get("protocol") != PUBLICATION_PROTOCOL
        or metadata.get("state") != "COMMITTED"
    ):
        raise PublicationIntegrityError(
            "Publication marker contract is invalid."
        )
    validation_meta = _require_file_meta(
        metadata, "validation", validation_path.name
    )
    if set(validation_meta) != {"name"}:
        raise PublicationIntegrityError(
            "Validation self-hash or byte length is not permitted."
        )
    ledger_meta = _require_file_meta(
        metadata, "ledger", ledger_path.name
    )
    ledger = _load_json(
        _verify_hashed_file(ledger_path, ledger_meta, ops),
        "Decision ledger",
    )
    status, has_canonical = _verify_status(
        validation, ledger, metadata
    )
    _verify_identity(validation, ledger, metadata)
    policy = _verify_policy(validation, ledger, metadata)
    _verify_canonical(
        canonical_path,
        validation,
        ledger,
        metadata,
        has_canonical,
        status,
        ops,
    )
    return {
        "schema": "InputXmlCommittedBundleVerification.v1",
        "verified": True,
        "stem": stem,
        "status": status,
        "bundleKind": metadata["bundleKind"],
        "sourceHashSha256": metadata["sourceHashSha256"],
        "canonicalPublished": has_canonical,
        "serializationPolicy": policy,
    }


__all__ = ["verify_committed_bundle"]
