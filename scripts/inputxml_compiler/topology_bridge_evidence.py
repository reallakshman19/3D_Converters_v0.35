#!/usr/bin/env python3
"""Array, metric, proof, and hash verification for the strict topology bridge."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from .base import DecisionLedger
from .topology_bridge_relations import ExpectedTopology
from .topology_diagnostics import block

_PROHIBITED_METRICS = {
    "duplicateNodeDroppedCount": "PROHIBITED_COORDINATE_COALESCING",
    "fillerCount": "PROHIBITED_FILLER_TOPOLOGY",
    "shortFillerCount": "PROHIBITED_FILLER_TOPOLOGY",
    "rayFillerCount": "PROHIBITED_FILLER_TOPOLOGY",
    "raySplitNodeCount": "PROHIBITED_FILLER_TOPOLOGY",
    "syntheticNodeCount": "SYNTHETIC_NODE_PROHIBITED",
    "droppedRouteNodeCount": "BRIDGE_MAPPING_INCOMPLETE",
}


def verify_bridge_evidence(
    request: dict[str, Any],
    result: dict[str, Any],
    expected: ExpectedTopology,
    ledger: DecisionLedger,
) -> None:
    _verify_metrics(request, result, expected, ledger)
    _verify_proof_counts(request, result, expected, ledger)
    _verify_topology_hash(result, ledger)


def topology_hash(result: dict[str, Any]) -> str:
    value = {
        key: result[key]
        for key in (
            "nodes",
            "edges",
            "components",
            "auxiliaries",
            "nodeMappings",
            "elementMappings",
        )
    }
    raw = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _verify_metrics(
    request: dict[str, Any],
    result: dict[str, Any],
    expected: ExpectedTopology,
    ledger: DecisionLedger,
) -> None:
    metrics = result.get("metrics")
    if not isinstance(metrics, dict):
        _contract_block(ledger, "Bridge metrics must be an object.")
    array_counts = {
        "edgeCount": len(result["edges"]),
        "componentCount": len(result["components"]),
        "auxiliaryCount": len(result["auxiliaries"]),
    }
    source_counts = {
        "branchCount": len(request["branches"]),
        "sourceNodeOccurrenceCount": len(expected.nodes),
        "edgeCount": len(expected.edges),
        "componentCount": len(expected.nodes),
        "auxiliaryCount": len(expected.auxiliaries),
        "diagnosticCount": len(result["diagnostics"]),
    }
    for field, count in array_counts.items():
        if source_counts[field] != count:
            _mapping_block(
                ledger,
                f"Returned {field} array count differs from source authority.",
            )
    for field, value in source_counts.items():
        if metrics.get(field) != value:
            _mapping_block(
                ledger,
                f"Bridge metric {field} does not match arrays and source authority.",
            )
    for field, code in _PROHIBITED_METRICS.items():
        if metrics.get(field) != 0:
            block(
                ledger,
                code,
                f"Prohibited strict-topology metric {field}={metrics.get(field)!r}.",
                "topology-bridge",
            )


def _verify_proof_counts(
    request: dict[str, Any],
    result: dict[str, Any],
    expected: ExpectedTopology,
    ledger: DecisionLedger,
) -> None:
    proof = result.get("topologyProof")
    if not isinstance(proof, dict):
        _mapping_block(ledger, "Bridge topology proof is missing.")
    if proof.get("sourceInventorySummary") != request.get(
        "sourceInventorySummary"
    ):
        _mapping_block(
            ledger,
            "Bridge proof inventory summary differs from the request.",
        )
    counts = {
        "logicalNodeCount": len(expected.nodes),
        "logicalEdgeCount": len(expected.edges),
        "nodeMappingCount": len(result["nodeMappings"]),
        "elementMappingCount": len(result["elementMappings"]),
        "unresolvedEdgeCount": 0,
        "unresolvedOwnershipCount": 0,
        "syntheticTopologyCount": 0,
    }
    for field, value in counts.items():
        if proof.get(field) != value:
            _mapping_block(
                ledger,
                f"Bridge topology proof {field} mismatch.",
            )


def _verify_topology_hash(
    result: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    actual = topology_hash(result)
    expected = result["topologyProof"].get("topologyHashSha256")
    if actual != expected:
        _mapping_block(
            ledger,
            "Bridge topology proof hash does not match structured mappings.",
        )


def _mapping_block(ledger: DecisionLedger, message: str) -> None:
    block(
        ledger,
        "BRIDGE_MAPPING_INCOMPLETE",
        message,
        "topology-bridge",
    )


def _contract_block(ledger: DecisionLedger, message: str) -> None:
    block(
        ledger,
        "BRIDGE_CONTRACT_INVALID",
        message,
        "topology-bridge",
    )


__all__ = ["topology_hash", "verify_bridge_evidence"]
