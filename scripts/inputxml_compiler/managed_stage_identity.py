#!/usr/bin/env python3
"""Independent bridge shape, source identity, and artifact-hash closure."""
from __future__ import annotations

from typing import Any

from .base import CompileBlocked, DecisionLedger
from .managed_stage_diagnostics import block, diagnose, diagnostic_policy
from .managed_stage_hashes import (
    HASH_ALGORITHM,
    deterministic_hash,
    source_content_hash,
    source_file_id,
)
from .managed_stage_intake import ManagedStageIntake

_ENGINE_IDENTITY = "component-topology-artifact-producer"
_ENGINE_VERSION = "1.0.0"
_RESULT_SCHEMA = "InputXmlManagedStageBridgeResult.v1"
_RESULT_FIELDS = {
    "schema", "resolutionStatus", "engineIdentity", "engineVersion",
    "profileId", "adapterId", "sourceHashSha256", "sourceIdentity",
    "sourceModel", "sourceEntities", "sourcePorts", "canonicalTopology",
    "engineeringProjection", "traceLedger", "topologyInputXml",
    "parsedInputXmlTopology", "topologySvgScene", "topologyParityReport",
    "metrics", "buildIssues", "diagnostics",
}
_ARTIFACTS = (
    ("canonicalTopology", "CanonicalTopology.v1", "canonicalTopologyHash"),
    ("traceLedger", "TopologyTraceLedger.v1", "topologyTraceLedgerHash"),
    ("parsedInputXmlTopology", "ParsedInputXmlTopology.v1", "parsedInputXmlTopologyHash"),
    ("topologySvgScene", "TopologySvgScene.v1", "svgSceneHash"),
    ("topologyParityReport", "TopologyParityReport.v1", "topologyParityReportHash"),
)


def verify_result_identity(
    intake: ManagedStageIntake,
    result: dict[str, Any],
    ledger: DecisionLedger,
) -> dict[str, Any]:
    _verify_result_shape(intake, result, ledger)
    if result["resolutionStatus"] == "BLOCKED":
        _record_blocked(result, ledger)
    if result["resolutionStatus"] != "RESOLVED" or result["diagnostics"]:
        _contract_block(ledger, "Managed-stage result status and diagnostics conflict.")
    expected_identity = _expected_source_identity(intake)
    _require_identity(result["sourceIdentity"], expected_identity, "bridge result", ledger)
    for field in ("sourceModel", "canonicalTopology", "engineeringProjection", "traceLedger"):
        artifact = _object(result.get(field), field, ledger)
        _require_identity(artifact.get("sourceIdentity"), expected_identity, field, ledger)
    _verify_schemas(result, ledger)
    hashes = _verify_artifact_hashes(result, ledger)
    _verify_hash_chain(result, hashes, ledger)
    ledger.add(
        source_entity_id="managed-stage-artifact-identity",
        source_type="MANAGED_STAGE_ARTIFACT_IDENTITY_CLOSURE",
        source_fields={
            "sourceIdentity": expected_identity,
            "hashAlgorithm": HASH_ALGORITHM,
            "artifactHashes": hashes,
        },
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION",
        evidence=[
            "raw source SHA-256 was computed before transformation",
            "SourceEnvelope identity and all declared semantic hashes were independently recomputed",
        ],
    )
    return {"sourceIdentity": expected_identity, "artifactHashes": hashes}


def _verify_result_shape(
    intake: ManagedStageIntake,
    result: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    missing = sorted(_RESULT_FIELDS - set(result))
    extra = sorted(set(result) - _RESULT_FIELDS)
    if missing or extra:
        _contract_block(ledger, f"Managed-stage result fields mismatch: missing={missing}, extra={extra}.")
    expected = {
        "schema": _RESULT_SCHEMA,
        "engineIdentity": _ENGINE_IDENTITY,
        "engineVersion": _ENGINE_VERSION,
        "profileId": "managed-stage-json",
        "adapterId": "managed-stage-to-canonical",
        "sourceHashSha256": intake.raw_source_hash_sha256,
    }
    for field, value in expected.items():
        if result.get(field) != value:
            code = (
                "MANAGED_STAGE_BRIDGE_SOURCE_HASH_MISMATCH"
                if field == "sourceHashSha256"
                else "MANAGED_STAGE_BRIDGE_CONTRACT_INVALID"
            )
            block(
                ledger,
                code,
                f"Managed-stage bridge {field} does not match request authority.",
                "managed-stage-bridge",
                expected=value,
                actual=result.get(field),
            )
    if result.get("resolutionStatus") not in {"RESOLVED", "BLOCKED"}:
        _contract_block(ledger, "Managed-stage resolutionStatus is invalid.")
    for field in ("sourceEntities", "sourcePorts", "buildIssues", "diagnostics"):
        if not isinstance(result.get(field), list):
            _contract_block(ledger, f"Managed-stage {field} must be an array.")
    if not isinstance(result.get("topologyInputXml"), str):
        _contract_block(ledger, "Managed-stage topologyInputXml must be text.")


def _record_blocked(result: dict[str, Any], ledger: DecisionLedger) -> None:
    diagnostics = result.get("diagnostics") or []
    if not diagnostics:
        _contract_block(ledger, "A blocked managed-stage result requires diagnostics.")
    for row in diagnostics:
        if not isinstance(row, dict):
            _contract_block(ledger, "Managed-stage diagnostic entries must be objects.")
        code = str(row.get("code") or "")
        try:
            diagnostic_policy(code)
        except RuntimeError:
            code = "MANAGED_STAGE_BRIDGE_CONTRACT_INVALID"
        diagnose(
            ledger,
            code,
            str(row.get("message") or code),
            str(row.get("sourceEntityId") or "$"),
        )
    raise CompileBlocked("Managed-stage producer returned a blocked result.")


def _expected_source_identity(intake: ManagedStageIntake) -> dict[str, Any]:
    return {
        "schema": "SourceEnvelope.v1",
        "entityIdentitySchema": "UniversalSourceGraph.v1",
        "sourceFileId": source_file_id(intake.source_text),
        "contentHash": source_content_hash(intake.source_text),
        "sourceName": intake.source_name,
        "sourceKind": "stagedjson",
        "sourceRevision": intake.source_context["sourceRevision"],
    }


def _require_identity(
    actual: Any,
    expected: dict[str, Any],
    artifact: str,
    ledger: DecisionLedger,
) -> None:
    if not isinstance(actual, dict) or actual != expected:
        block(
            ledger,
            "MANAGED_STAGE_SOURCE_IDENTITY_MISMATCH",
            f"{artifact} source identity does not match strict intake authority.",
            artifact,
            expected=expected,
            actual=actual,
        )


def _verify_schemas(result: dict[str, Any], ledger: DecisionLedger) -> None:
    expected = {
        "sourceModel": "ComponentTopologySourceModel.v1",
        "engineeringProjection": "TopologyEngineeringProjection.v1",
        "canonicalTopology": "CanonicalTopology.v1",
        "traceLedger": "TopologyTraceLedger.v1",
        "parsedInputXmlTopology": "ParsedInputXmlTopology.v1",
        "topologySvgScene": "TopologySvgScene.v1",
        "topologyParityReport": "TopologyParityReport.v1",
    }
    for field, schema in expected.items():
        artifact = _object(result.get(field), field, ledger)
        if artifact.get("schema") != schema:
            block(
                ledger,
                "MANAGED_STAGE_ARTIFACT_SCHEMA_INVALID",
                f"Managed-stage {field} schema must be {schema}.",
                field,
                actual=artifact.get("schema"),
            )


def _verify_artifact_hashes(
    result: dict[str, Any],
    ledger: DecisionLedger,
) -> dict[str, str]:
    hashes: dict[str, str] = {}
    for field, _, hash_field in _ARTIFACTS:
        artifact = result[field]
        declared = artifact.get(hash_field)
        actual = deterministic_hash(artifact, hash_field=hash_field)
        if not declared or declared != actual:
            block(
                ledger,
                "MANAGED_STAGE_ARTIFACT_HASH_MISMATCH",
                f"Managed-stage {field} hash is missing or stale.",
                field,
                hashField=hash_field,
                declared=declared,
                actual=actual,
            )
        if artifact.get("hashAlgorithm", HASH_ALGORITHM) != HASH_ALGORITHM:
            block(
                ledger,
                "MANAGED_STAGE_ARTIFACT_HASH_MISMATCH",
                f"Managed-stage {field} hash algorithm is not registered.",
                field,
            )
        hashes[hash_field] = actual
    return hashes


def _verify_hash_chain(
    result: dict[str, Any],
    hashes: dict[str, str],
    ledger: DecisionLedger,
) -> None:
    canonical = hashes["canonicalTopologyHash"]
    trace = hashes["topologyTraceLedgerHash"]
    expected = (
        ("traceLedger", "canonicalTopologyHash", canonical),
        ("parsedInputXmlTopology", "canonicalTopologyHash", canonical),
        ("parsedInputXmlTopology", "topologyTraceLedgerHash", trace),
        ("topologySvgScene", "canonicalTopologyHash", canonical),
        ("topologySvgScene", "topologyTraceLedgerHash", trace),
        ("topologyParityReport", "canonicalTopologyHash", canonical),
        ("topologyParityReport", "topologyTraceLedgerHash", trace),
        ("topologyParityReport", "parsedInputXmlTopologyHash", hashes["parsedInputXmlTopologyHash"]),
        ("topologyParityReport", "svgSceneHash", hashes["svgSceneHash"]),
    )
    for artifact_name, field, value in expected:
        if result[artifact_name].get(field) != value:
            block(
                ledger,
                "MANAGED_STAGE_ARTIFACT_HASH_MISMATCH",
                f"Managed-stage {artifact_name}.{field} breaks artifact hash closure.",
                artifact_name,
                expected=value,
                actual=result[artifact_name].get(field),
            )


def _object(value: Any, name: str, ledger: DecisionLedger) -> dict[str, Any]:
    if not isinstance(value, dict):
        _contract_block(ledger, f"Managed-stage {name} must be an object.")
    return value


def _contract_block(ledger: DecisionLedger, message: str) -> None:
    block(
        ledger,
        "MANAGED_STAGE_BRIDGE_CONTRACT_INVALID",
        message,
        "managed-stage-bridge",
    )


__all__ = ["verify_result_identity"]
