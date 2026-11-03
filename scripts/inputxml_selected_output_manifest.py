#!/usr/bin/env python3
"""Build and verify exact-byte SelectedOutputManifest.v1 release bundles."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

BASE_REQUIRED_ARTIFACTS = (
    "canonicalInputXml", "cii", "compatibilityRequest", "compatibilityPolicy",
    "canonicalizationLedger", "canonicalValidation", "normalizationPlan",
    "diagnosticReport", "resolverTrace", "canonicalSourceModel", "resolvedRelationships",
    "canonicalTopology", "topoNodePlan", "numberedTopologyProjection",
    "parsedInputXmlTopology", "topologyParityReport", "assuranceLedger",
    "ciiProjectionLedger",
)


class SelectedOutputManifestError(RuntimeError):
    """Raised when selected release bytes are missing, stale, or non-PASS."""


def selected_artifact_names(approval: dict[str, Any] | None) -> tuple[str, ...]:
    """Return the complete selected artifact set for strict or adapted release."""
    if approval is None:
        return BASE_REQUIRED_ARTIFACTS
    return (*BASE_REQUIRED_ARTIFACTS, "approvedSemanticSplitEvidence")


def stable_json_bytes(value: dict[str, Any]) -> bytes:
    """Serialize one manifest deterministically for hashing and publication."""
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False, allow_nan=False) + "\n").encode("utf-8")


def sha256(data: bytes) -> str:
    """Return a lowercase SHA-256 digest for exact bytes."""
    return hashlib.sha256(data).hexdigest()


def hash_without(value: dict[str, Any], field: str) -> str:
    """Hash an object after excluding one self-hash field."""
    return sha256(stable_json_bytes({key: item for key, item in value.items() if key != field}))


def artifact_descriptor(path: Path) -> dict[str, Any]:
    """Describe one selected artifact by safe file name, exact hash, and bytes."""
    if not path.is_file():
        raise SelectedOutputManifestError(f"Selected artifact does not exist: {path}.")
    if path.name != str(path.name) or path.name in {"", ".", ".."}:
        raise SelectedOutputManifestError(f"Selected artifact file name is invalid: {path.name}.")
    raw = path.read_bytes()
    return {"fileName": path.name, "sha256": sha256(raw), "bytes": len(raw)}


def validate_pass_evidence(
    compatibility_policy: dict[str, Any],
    assurance_ledger: dict[str, Any],
    projection_ledger: dict[str, Any],
) -> None:
    """Require strict/adapted release policy and PASS assurance/projection evidence."""
    if compatibility_policy.get("schema") != "InputXmlCompatibilityPolicy.v1" or compatibility_policy.get("status") != "PASS":
        raise SelectedOutputManifestError("Selected output requires a PASS compatibility policy.")
    if compatibility_policy.get("mode") not in {"CANONICAL_STRICT", "ADAPTED_CANONICAL"}:
        raise SelectedOutputManifestError("Diagnostic-only mode cannot publish selected output.")
    if assurance_ledger.get("schema") != "InputXmlCiiAssuranceLedger.v2" or assurance_ledger.get("status") != "PASS":
        raise SelectedOutputManifestError("Selected output requires PASS InputXmlCiiAssuranceLedger.v2 evidence.")
    required_gates = {
        "compatibility", "canonicalization", "canonicalValidation", "topologyTrace",
        "topologyParity", "diagnostics", "resolverTrace", "ciiProjectionReadiness",
    }
    failed = sorted(gate for gate in required_gates if (assurance_ledger.get("gates") or {}).get(gate) != "PASS")
    if failed:
        raise SelectedOutputManifestError(f"Selected output assurance gates are not PASS: {', '.join(failed)}.")
    if projection_ledger.get("schema") != "InputXmlCiiProjectionLedger.v1" or projection_ledger.get("status") != "PASS":
        raise SelectedOutputManifestError("Selected output requires a PASS CII projection ledger.")


def build_selected_output_manifest(
    source_hash: str,
    compatibility_policy: dict[str, Any],
    assurance_ledger: dict[str, Any],
    projection_ledger: dict[str, Any],
    artifact_paths: dict[str, Path],
) -> dict[str, Any]:
    """Build a PASS manifest selecting every exact release artifact."""
    validate_pass_evidence(compatibility_policy, assurance_ledger, projection_ledger)
    approval = assurance_ledger.get("approvedSemanticSplit")
    names = selected_artifact_names(approval)
    missing = [name for name in names if name not in artifact_paths]
    if missing:
        raise SelectedOutputManifestError(f"Selected output artifact paths are missing: {', '.join(missing)}.")
    if approval is None and "approvedSemanticSplitEvidence" in artifact_paths:
        raise SelectedOutputManifestError("Unselected approval evidence cannot be added to a strict release manifest.")
    artifacts = {name: artifact_descriptor(artifact_paths[name]) for name in names}
    base = {
        "schema": "SelectedOutputManifest.v1",
        "status": "PASS",
        "contractVersion": "inputxml-v2",
        "sourceHashSha256": source_hash,
        "compatibilityMode": compatibility_policy["mode"],
        "artifacts": artifacts,
        "approvedSemanticSplit": approval,
    }
    return {**base, "manifestHashSha256": hash_without(base, "manifestHashSha256")}


def verify_selected_output_files(
    manifest: dict[str, Any],
    bundle_dir: Path,
) -> None:
    """Verify manifest self-hash and every selected file within one bundle directory."""
    if manifest.get("schema") != "SelectedOutputManifest.v1" or manifest.get("status") != "PASS":
        raise SelectedOutputManifestError("Selected-output manifest schema or status is invalid.")
    if manifest.get("manifestHashSha256") != hash_without(manifest, "manifestHashSha256"):
        raise SelectedOutputManifestError("Selected-output manifest hash is stale.")
    if manifest.get("approvedSemanticSplit") is None and "approvedSemanticSplitEvidence" in (manifest.get("artifacts") or {}):
        raise SelectedOutputManifestError("Strict release manifest contains unselected approval evidence.")
    for name in selected_artifact_names(manifest.get("approvedSemanticSplit")):
        descriptor = (manifest.get("artifacts") or {}).get(name)
        if not isinstance(descriptor, dict):
            raise SelectedOutputManifestError(f"Selected artifact descriptor is missing: {name}.")
        path = bundle_dir / str(descriptor.get("fileName") or "")
        if path.parent.resolve() != bundle_dir.resolve():
            raise SelectedOutputManifestError(f"Selected artifact escapes the bundle directory: {name}.")
        actual = artifact_descriptor(path)
        if actual != descriptor:
            raise SelectedOutputManifestError(f"Selected artifact differs from its manifest: {name}.")
