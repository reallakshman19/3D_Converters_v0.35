#!/usr/bin/env python3
"""Exact-byte publication contract for completed compiler results."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from lxml import etree as ET

from .publication_state import PublicationInvariantError
from .serialization import (
    hash_canonical_bytes,
    hash_ledger_bytes,
    serialize_canonical_xml,
    serialize_decision_ledger,
    serialize_validation_report,
)
from .serialization_policy import (
    normalized_policy_bytes,
    serialization_policy_metadata,
    validate_serialization_policy,
)
from .xml import _xml_bytes

PUBLICATION_SCHEMA = "InputXmlArtifactPublication.v1"
PUBLICATION_PROTOCOL = "VALIDATION_COMMIT_MARKER_V1"
VALID_STATUSES = {"PASS", "BLOCKED"}
VALID_BUNDLE_KINDS = {
    "PASS_WITH_CANONICAL",
    "BLOCKED_WITH_CANONICAL",
    "BLOCKED_NO_CANONICAL",
}


@dataclass(frozen=True)
class CompilationView:
    """Immutable exact-byte view of one completed compiler result."""

    stem: str
    source_hash: str
    dialect: str
    terminal_status: str
    resolver_outcome_kind: str | None
    canonical_bytes: bytes | None
    ledger_bytes: bytes
    validation_base_bytes: bytes
    serialization_policy_bytes: bytes | None
    serialization_policy_meta: dict[str, str] | None

    @classmethod
    def from_compiler_result(
        cls,
        *,
        stem: str,
        source_hash: str,
        canonical: ET._Element | None,
        ledger: dict[str, Any],
        validation: dict[str, Any],
        policy: dict[str, Any] | None = None,
    ) -> "CompilationView":
        _validate_stem(stem)
        policy_bytes: bytes | None = None
        policy_meta: dict[str, str] | None = None
        if policy is not None:
            validate_serialization_policy(policy)
            policy_bytes = normalized_policy_bytes(policy)
            policy_meta = serialization_policy_metadata(policy)
            canonical_bytes = (
                serialize_canonical_xml(canonical, policy)
                if canonical is not None
                else None
            )
            ledger_bytes = serialize_decision_ledger(ledger, policy)
            validation_bytes = serialize_validation_report(validation, policy)
        else:
            canonical_bytes = (
                _xml_bytes(canonical) if canonical is not None else None
            )
            ledger_bytes = json_bytes(ledger)
            validation_bytes = json_bytes(validation)
        resolver = validation.get("resolverOutcome") or {}
        view = cls(
            stem=stem,
            source_hash=source_hash,
            dialect=str(validation.get("dialect", "unresolved")),
            terminal_status=str(validation.get("status", "FAILED")),
            resolver_outcome_kind=resolver.get("outcomeKind"),
            canonical_bytes=canonical_bytes,
            ledger_bytes=ledger_bytes,
            validation_base_bytes=validation_bytes,
            serialization_policy_bytes=policy_bytes,
            serialization_policy_meta=policy_meta,
        )
        validate_compilation_view(view)
        return view


def json_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(
        payload,
        indent=2,
        sort_keys=True,
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def json_payload(data: bytes, label: str) -> dict[str, Any]:
    try:
        payload = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PublicationInvariantError(
            f"{label} is not valid UTF-8 JSON."
        ) from exc
    if not isinstance(payload, dict):
        raise PublicationInvariantError(f"{label} must be a JSON object.")
    return payload


def view_policy(view: CompilationView) -> dict[str, Any] | None:
    if view.serialization_policy_bytes is None:
        return None
    payload = json_payload(
        view.serialization_policy_bytes,
        "Serialization policy",
    )
    return validate_serialization_policy(payload)


def serialize_committed_validation(
    view: CompilationView,
    payload: dict[str, Any],
) -> bytes:
    policy = view_policy(view)
    return (
        serialize_validation_report(payload, policy)
        if policy is not None
        else json_bytes(payload)
    )


def bundle_kind(view: CompilationView) -> str:
    if view.terminal_status == "PASS":
        return "PASS_WITH_CANONICAL"
    if view.canonical_bytes is not None:
        return "BLOCKED_WITH_CANONICAL"
    return "BLOCKED_NO_CANONICAL"


def publication_metadata(
    view: CompilationView,
    kind: str,
) -> dict[str, Any]:
    canonical_meta: dict[str, Any] | None = None
    if view.canonical_bytes is not None:
        canonical_meta = {
            "name": f"{view.stem}.canonical.input.xml",
            "sha256": hash_canonical_bytes(view.canonical_bytes),
            "bytes": len(view.canonical_bytes),
        }
    metadata: dict[str, Any] = {
        "schema": PUBLICATION_SCHEMA,
        "state": "COMMITTED",
        "protocol": PUBLICATION_PROTOCOL,
        "bundleKind": kind,
        "terminalStatus": view.terminal_status,
        "sourceHashSha256": view.source_hash,
        "dialect": view.dialect,
        "canonicalCandidatePublished": view.canonical_bytes is not None,
        "files": {
            "canonical": canonical_meta,
            "ledger": {
                "name": f"{view.stem}.canonicalization-ledger.json",
                "sha256": hash_ledger_bytes(view.ledger_bytes),
                "bytes": len(view.ledger_bytes),
            },
            "validation": {
                "name": f"{view.stem}.canonical-validation.json",
            },
        },
    }
    if view.serialization_policy_meta is not None:
        metadata["serializationPolicy"] = view.serialization_policy_meta
    return metadata


def _contract_policy(payload: dict[str, Any]) -> Any:
    bundle = payload.get("contractBundle") or {}
    return bundle.get("serializationPolicy")


def validate_compilation_view(view: CompilationView) -> None:
    if view.terminal_status not in VALID_STATUSES:
        raise PublicationInvariantError(
            f"Unsupported compiler terminal status: {view.terminal_status}."
        )
    ledger = json_payload(view.ledger_bytes, "Decision ledger")
    validation = json_payload(
        view.validation_base_bytes,
        "Validation report",
    )
    if ledger.get("status") != view.terminal_status:
        raise PublicationInvariantError(
            "Ledger status does not match compiler status."
        )
    if validation.get("status") != view.terminal_status:
        raise PublicationInvariantError(
            "Validation status does not match compiler status."
        )
    if ledger.get("sourceHashSha256") != view.source_hash:
        raise PublicationInvariantError(
            "Ledger source hash does not match source bytes."
        )
    orchestration = validation.get("orchestration") or {}
    if orchestration.get("terminalStatus") != view.terminal_status:
        raise PublicationInvariantError(
            "Compiler orchestration status does not match validation status."
        )
    if view.terminal_status == "PASS" and view.canonical_bytes is None:
        raise PublicationInvariantError("PASS requires a canonical candidate.")
    canonical_hash = ledger.get("canonicalHashSha256")
    if view.canonical_bytes is None and canonical_hash is not None:
        raise PublicationInvariantError(
            "A result without a candidate cannot carry a canonical hash."
        )
    if (
        view.canonical_bytes is not None
        and canonical_hash != hash_canonical_bytes(view.canonical_bytes)
    ):
        raise PublicationInvariantError(
            "Ledger canonical hash does not match exact canonical bytes."
        )
    _validate_resolver_candidate(view)
    expected_policy = view.serialization_policy_meta
    ledger_policy = _contract_policy(ledger)
    validation_policy = _contract_policy(validation)
    if expected_policy is None:
        contract_failure = (
            view.terminal_status == "BLOCKED"
            and validation.get("blockedAt") == "CONTRACT_BUNDLE_GATE"
            and ledger_policy is None
            and validation_policy is None
        )
        legacy_synthetic = (
            "contractBundle" not in ledger
            and "contractBundle" not in validation
        )
        if not (contract_failure or legacy_synthetic):
            raise PublicationInvariantError(
                "Verified compiler results require serialization policy evidence."
            )
    elif (
        ledger_policy != expected_policy
        or validation_policy != expected_policy
    ):
        raise PublicationInvariantError(
            "Serialization policy evidence is inconsistent."
        )


def _validate_resolver_candidate(view: CompilationView) -> None:
    if (
        view.resolver_outcome_kind == "BLOCKED_NO_CANDIDATE"
        and view.canonical_bytes is not None
    ):
        raise PublicationInvariantError(
            "Resolver declared no candidate but canonical bytes exist."
        )
    if (
        view.resolver_outcome_kind == "BLOCKED_WITH_CANDIDATE"
        and view.canonical_bytes is None
    ):
        raise PublicationInvariantError(
            "Resolver declared a blocked candidate but none was returned."
        )


def _validate_stem(stem: str) -> None:
    if not stem or stem in {".", ".."}:
        raise PublicationInvariantError(
            "A non-empty safe output stem is required."
        )
    if any(character in stem for character in ("/", "\\", "\0")):
        raise PublicationInvariantError(
            "Output stem contains a path separator or NUL."
        )


__all__ = [
    "CompilationView",
    "PUBLICATION_PROTOCOL",
    "PUBLICATION_SCHEMA",
    "VALID_BUNDLE_KINDS",
    "VALID_STATUSES",
    "bundle_kind",
    "json_bytes",
    "json_payload",
    "publication_metadata",
    "serialize_committed_validation",
    "validate_compilation_view",
    "view_policy",
]
