#!/usr/bin/env python3
"""Independent semantic verification for the strict Root topology bridge."""
from __future__ import annotations

from typing import Any

from .base import CompileBlocked, DecisionLedger
from .topology_bridge_evidence import verify_bridge_evidence
from .topology_bridge_io import (
    node_executable,
    request_bytes,
    run_bridge,
    strict_json_object,
)
from .topology_bridge_relations import verify_bridge_relations
from .topology_diagnostics import block, diagnose, diagnostic_policy

_ENGINE_IDENTITY = "strict-root-topology-engine"
_ENGINE_VERSION = "1.0.0"
_RESULT_SCHEMA = "InputXmlTopologyBridgeResult.v1"
_MAX_DIAGNOSTICS = 1000
_RESULT_FIELDS = {
    "schema",
    "resolutionStatus",
    "engineIdentity",
    "engineVersion",
    "profileId",
    "adapterId",
    "sourceHashSha256",
    "nodes",
    "edges",
    "components",
    "auxiliaries",
    "elementMappings",
    "nodeMappings",
    "topologyProof",
    "diagnostics",
    "metrics",
}


def invoke_topology_bridge(
    request: dict[str, Any],
    *,
    context: dict[str, Any],
    ledger: DecisionLedger,
) -> dict[str, Any]:
    completed = run_bridge(
        node_executable(context, ledger),
        request_bytes(request),
        ledger,
    )
    result = strict_json_object(completed.stdout, ledger)
    _verify_result(request, result, ledger)
    _record_bridge_proof(result, ledger)
    return result


def _verify_result(
    request: dict[str, Any],
    result: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    _verify_result_shape(request, result, ledger)
    diagnostics = result.get("diagnostics")
    if not isinstance(diagnostics, list) or len(diagnostics) > _MAX_DIAGNOSTICS:
        _contract_block(ledger, "Bridge diagnostics must be a bounded array.")
    if result.get("resolutionStatus") == "BLOCKED":
        _record_blocked_result(diagnostics, ledger)
    if result.get("resolutionStatus") != "RESOLVED" or diagnostics:
        _contract_block(
            ledger,
            "Bridge result status/diagnostics are contradictory.",
        )
    expected = verify_bridge_relations(request, result, ledger)
    verify_bridge_evidence(request, result, expected, ledger)


def _verify_result_shape(
    request: dict[str, Any],
    result: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    missing = sorted(_RESULT_FIELDS - set(result))
    extra = sorted(set(result) - _RESULT_FIELDS)
    if missing or extra:
        _contract_block(
            ledger,
            f"Bridge result field mismatch: missing={missing}, extra={extra}.",
        )
    expected = {
        "schema": _RESULT_SCHEMA,
        "engineIdentity": _ENGINE_IDENTITY,
        "engineVersion": _ENGINE_VERSION,
        "profileId": request["profileId"],
        "adapterId": request["adapterId"],
    }
    for field, value in expected.items():
        if result.get(field) != value:
            block(
                ledger,
                "BRIDGE_CONTRACT_INVALID",
                f"Bridge result {field} does not match request/runtime authority.",
                "topology-bridge",
                expected=value,
                actual=result.get(field),
            )
    if result.get("sourceHashSha256") != request.get("sourceHashSha256"):
        block(
            ledger,
            "BRIDGE_SOURCE_HASH_MISMATCH",
            "Bridge result source hash differs from the request source hash.",
            "topology-bridge",
        )


def _record_blocked_result(
    diagnostics: list[dict[str, Any]],
    ledger: DecisionLedger,
) -> None:
    if not diagnostics:
        _contract_block(
            ledger,
            "A blocked bridge result requires structured diagnostics.",
        )
    for row in diagnostics:
        if not isinstance(row, dict):
            _contract_block(
                ledger,
                "Bridge diagnostic entries must be objects.",
            )
        code = _registered_bridge_code(row)
        source_id = str(row.get("sourceEntityId") or "topology-bridge")
        message = str(row.get("message") or code)
        ledger.add(
            source_entity_id=source_id,
            source_type="STRICT_TOPOLOGY_BRIDGE_DIAGNOSTIC",
            source_fields=row,
            projection_cardinality="1_TO_0",
            disposition="REJECT_INVALID",
            diagnostics=[message],
        )
        diagnose(ledger, code, message, source_id)
    raise CompileBlocked("Strict topology bridge returned a blocked result.")


def _registered_bridge_code(row: dict[str, Any]) -> str:
    code = str(row.get("code") or "")
    try:
        diagnostic_policy(code)
    except RuntimeError:
        return "BRIDGE_CONTRACT_INVALID"
    return code


def _contract_block(ledger: DecisionLedger, message: str) -> None:
    block(
        ledger,
        "BRIDGE_CONTRACT_INVALID",
        message,
        "topology-bridge",
    )


def _record_bridge_proof(
    result: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    verified_proof = dict(result["topologyProof"])
    verified_proof.update(
        {
            "componentMappingCount": len(result["components"]),
            "auxiliaryMappingCount": len(result["auxiliaries"]),
        }
    )
    ledger.add(
        source_entity_id="topology-bridge-proof",
        source_type="STRICT_TOPOLOGY_BRIDGE_PROOF",
        source_fields={
            "engineIdentity": result["engineIdentity"],
            "engineVersion": result["engineVersion"],
            "sourceHashSha256": result["sourceHashSha256"],
            "topologyProof": verified_proof,
            "metrics": result["metrics"],
        },
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION",
        evidence=[
            "Python independently reconciled every bridge array and relation",
            "component and auxiliary mappings exactly cover source occurrences",
            "all prohibited topology-operation metrics are exactly zero",
        ],
    )


_strict_json_object = strict_json_object


__all__ = ["invoke_topology_bridge"]
