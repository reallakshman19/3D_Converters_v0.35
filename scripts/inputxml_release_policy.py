#!/usr/bin/env python3
"""Pure builders for InputXML compatibility, source, relationship, and normalization evidence."""
from __future__ import annotations

import hashlib
import json
from typing import Any

VALID_MODES = {"CANONICAL_STRICT", "ADAPTED_CANONICAL", "DIAGNOSTIC_ONLY"}


class InputXmlReleasePolicyError(RuntimeError):
    """Raised when a release policy request is incomplete or contradictory."""


def stable_json_bytes(value: Any) -> bytes:
    """Serialize JSON-compatible evidence deterministically."""
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False, allow_nan=False) + "\n").encode("utf-8")


def sha256(data: bytes) -> str:
    """Return a lowercase SHA-256 digest for exact bytes."""
    return hashlib.sha256(data).hexdigest()


def hash_without(value: dict[str, Any], field: str) -> str:
    """Hash an object after excluding one self-hash field."""
    return sha256(stable_json_bytes({key: item for key, item in value.items() if key != field}))


def build_compatibility_policy(
    mode: str,
    detected_dialect: str,
    source_hash: str,
    approval_id: str | None,
    compiler_status: str,
) -> dict[str, Any]:
    """Resolve strict/adapted/diagnostic policy without selecting a fallback dialect."""
    if mode not in VALID_MODES:
        raise InputXmlReleasePolicyError(f"Unsupported compatibility mode: {mode}.")
    diagnostics: list[dict[str, Any]] = []
    status = "PASS"
    if mode == "DIAGNOSTIC_ONLY":
        status = "DIAGNOSTIC"
    elif compiler_status != "PASS":
        status = "BLOCKED"
        diagnostics.append({"severity": "BLOCKING", "code": "STRUCTURAL_COMPILER_BLOCKED", "message": "Structural compiler status must be PASS."})
    if mode == "CANONICAL_STRICT" and detected_dialect != "canonical-inputxml-v1":
        status = "BLOCKED"
        diagnostics.append({"severity": "BLOCKING", "code": "STRICT_DIALECT_BLOCKED", "message": "Canonical strict mode requires canonical-inputxml-v1.", "context": {"detectedDialect": detected_dialect}})
    if approval_id is not None and mode != "ADAPTED_CANONICAL":
        status = "BLOCKED"
        diagnostics.append({"severity": "BLOCKING", "code": "APPROVAL_MODE_INVALID", "message": "Approved semantic splits require ADAPTED_CANONICAL mode."})
    return {"schema": "InputXmlCompatibilityPolicy.v1", "mode": mode, "detectedDialect": detected_dialect or "unresolved", "sourceHashSha256": source_hash, "status": status, "approvedSemanticSplitId": approval_id, "diagnostics": diagnostics}


def operation_disposition(record: dict[str, Any], approval_id: str | None) -> str:
    """Map one compiler decision to a release normalization disposition."""
    if approval_id is not None:
        return "APPROVED_REPLACEMENT"
    disposition = str(record.get("disposition") or "")
    if disposition.startswith("REJECT") or disposition.startswith("BLOCK"):
        return "BLOCK"
    if disposition in {"DIRECT", "RETAIN", "PRESERVE", "PRESERVE_EXTENSION"}:
        return "RETAIN"
    return "NORMALIZE"


def build_normalization_plan(
    source_hash: str,
    canonical_hash: str | None,
    policy: dict[str, Any],
    canonicalization_ledger: dict[str, Any],
    approval_id: str | None,
) -> dict[str, Any]:
    """Record every compiler decision as an explicit normalization operation."""
    operations = []
    for index, record in enumerate(canonicalization_ledger.get("records") or [], 1):
        operations.append({
            "operationId": str(record.get("recordId") or f"INP-{index:07d}"),
            "code": str(record.get("disposition") or "UNSPECIFIED"),
            "sourceIdentity": str(record.get("sourceEntityId") or record.get("sourcePath") or f"record:{index}"),
            "disposition": operation_disposition(record, approval_id),
            "beforeHashSha256": None,
            "afterHashSha256": None,
            "approvalId": approval_id,
        })
    base = {
        "schema": "InputXmlNormalizationPlan.v1",
        "status": policy["status"],
        "sourceHashSha256": source_hash,
        "canonicalHashSha256": canonical_hash,
        "compatibilityPolicyHashSha256": sha256(stable_json_bytes(policy)),
        "operations": operations,
        "diagnostics": list(policy.get("diagnostics") or []) + list(canonicalization_ledger.get("diagnostics") or []),
    }
    return {**base, "normalizationPlanHashSha256": hash_without(base, "normalizationPlanHashSha256")}


def build_canonical_source_model(
    source_hash: str,
    dialect: str,
    canonicalization_ledger: dict[str, Any],
    relationship_ids: list[str],
) -> dict[str, Any]:
    """Project compiler decision records into a stable source-accounting model."""
    records = [{
        "sourceEntityId": str(row.get("sourceEntityId") or row.get("recordId") or "unidentified"),
        "sourceType": str(row.get("sourceType") or "UNKNOWN"),
        "fields": row.get("sourceFields") if isinstance(row.get("sourceFields"), dict) else {},
        "sourcePaths": [str(row.get("sourcePath"))] if row.get("sourcePath") else [],
    } for row in canonicalization_ledger.get("records") or []]
    return {"schema": "CanonicalSourceModel.v1", "sourceHashSha256": source_hash, "dialect": dialect, "records": records, "relationships": relationship_ids, "diagnostics": list(canonicalization_ledger.get("diagnostics") or [])}


def build_resolved_relationships(topology: dict[str, Any]) -> list[dict[str, Any]]:
    """Create explicit PASS relationships from proven canonical edge incidence."""
    return [{
        "schema": "ResolvedRelationship.v1",
        "relationshipId": f"RR-{index:07d}",
        "kind": "PIPINGELEMENT_INCIDENCE",
        "sourceEntityIds": list(edge.get("sourceEntityIds") or [edge["id"]]),
        "targetEntityIds": [edge["fromNodeId"], edge["toNodeId"]],
        "outcome": "PASS",
        "evidence": [{"canonicalEdgeId": edge["id"]}],
        "diagnostics": [],
    } for index, edge in enumerate(topology.get("edges") or [], 1)]
