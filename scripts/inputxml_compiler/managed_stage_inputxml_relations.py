#!/usr/bin/env python3
"""Independent RESTRAINT and RIGID ownership reconstruction."""
from __future__ import annotations

import math
from typing import Any

from .base import DecisionLedger
from .managed_stage_diagnostics import block


def verify_inputxml_child_relations(
    parsed: dict[str, Any],
    topology: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    collections = topology["collections"]
    edges = collections["edges"]
    expected_restraints = _expected_restraints(collections["supports"], edges, ledger)
    expected_rigids = _expected_rigids(collections["rigids"], edges, ledger)
    actual_restraints = _unique_index(parsed.get("restraints"), "RESTRAINT", ledger)
    actual_rigids = _unique_index(parsed.get("rigids"), "RIGID", ledger)
    _verify_population(actual_restraints, expected_restraints, "RESTRAINT", ledger)
    _verify_population(actual_rigids, expected_rigids, "RIGID", ledger)
    for child_id, expected in expected_restraints.items():
        _verify_restraint(actual_restraints[child_id], expected, ledger)
    for child_id, expected in expected_rigids.items():
        _verify_rigid(actual_rigids[child_id], expected, ledger)


def _expected_restraints(
    supports: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    ledger: DecisionLedger,
) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for support in supports:
        owner = _support_owner_edge(support, edges, ledger)
        element_ids = owner.get("inputXmlElementIds") or []
        for index, _ in enumerate(support.get("restraints") or []):
            child_id = f"RESTRAINT:{support.get('id')}:{index + 1}"
            result[child_id] = {
                "id": child_id,
                "supportId": str(support.get("id") or ""),
                "ownerInputXmlElementId": str(element_ids[0]),
                "inputXmlNodeId": str(support.get("inputXmlNodeId") or ""),
                "canonicalNodeId": str(support.get("nodeId") or ""),
                "sourceEntityIds": list(support.get("sourceEntityIds") or []),
                "sourcePaths": list(support.get("sourcePaths") or []),
                "branchIds": list(support.get("branchIds") or support.get("sourceBranchEntityIds") or []),
                "tag": str(support.get("tag") or ""),
                "attachmentAuthority": str(support.get("attachmentAuthority") or ""),
                "attachmentReferences": list(support.get("attachmentReferences") or []),
                "connectionResidual": _number(support.get("connectionResidual")),
                "sourcePosition": support.get("sourcePosition"),
                "attachmentPosition": support.get("attachmentPosition") or support.get("position"),
            }
    return result


def _support_owner_edge(
    support: dict[str, Any],
    edges: list[dict[str, Any]],
    ledger: DecisionLedger,
) -> dict[str, Any]:
    node_id = str(support.get("nodeId") or "")
    source_ids = set(str(value) for value in support.get("sourceEntityIds") or [])
    incident = [
        edge for edge in edges
        if node_id in {str(edge.get("fromNodeId") or ""), str(edge.get("toNodeId") or "")}
        and source_ids.intersection(str(value) for value in edge.get("sourceEntityIds") or [])
    ]
    owner = next((edge for edge in incident if str(edge.get("toNodeId") or "") == node_id), None)
    owner = owner or (incident[0] if incident else None)
    if owner is None or len(owner.get("inputXmlElementIds") or []) != 1:
        _child_block(ledger, f"Support {support.get('id')} has no exact owning InputXML element.")
    return owner


def _expected_rigids(
    rigids: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    ledger: DecisionLedger,
) -> dict[str, dict[str, Any]]:
    edge_by_id = {str(row.get("id") or ""): row for row in edges}
    grouped: dict[str, list[dict[str, Any]]] = {}
    for rigid in rigids:
        grouped.setdefault(str(rigid.get("edgeId") or ""), []).append(rigid)
    result: dict[str, dict[str, Any]] = {}
    for edge_id, bodies in grouped.items():
        edge = edge_by_id.get(edge_id)
        if edge is None or len(edge.get("inputXmlElementIds") or []) != 1:
            _child_block(ledger, f"Rigid group {edge_id} has no exact owning InputXML element.")
        weights = [row.get("weightKg") for row in bodies]
        weight = sum(float(value) for value in weights) if all(_finite(value) for value in weights) else None
        result[f"RIGID:{edge_id}"] = {
            "id": f"RIGID:{edge_id}",
            "ownerInputXmlElementId": str(edge["inputXmlElementIds"][0]),
            "canonicalEdgeId": edge_id,
            "sourceEntityIds": _unique(row.get("sourceEntityId") for row in bodies),
            "sourcePaths": _unique(row.get("sourcePath") for row in bodies),
            "branchIds": _unique(
                value for row in bodies
                for value in row.get("branchIds") or row.get("sourceBranchEntityIds") or []
            ),
            "assignmentAuthorities": _unique(row.get("assignmentAuthority") for row in bodies),
            "weightAuthorities": _unique(row.get("weightAuthority") for row in bodies),
            "connectionResidual": max(
                [0.0, *[_number(row.get("connectionResidual")) or 0.0 for row in bodies]]
            ),
            "sourceBodyCount": len(bodies),
            "weight": weight,
        }
    return result


def _verify_restraint(actual: dict[str, Any], expected: dict[str, Any], ledger: DecisionLedger) -> None:
    fields = (
        "id", "supportId", "ownerInputXmlElementId", "inputXmlNodeId",
        "canonicalNodeId", "sourceEntityIds", "sourcePaths", "branchIds",
        "tag", "attachmentAuthority", "attachmentReferences",
    )
    _verify_fields(actual, expected, fields, "RESTRAINT", ledger)
    _verify_number(actual, expected, "connectionResidual", "RESTRAINT", ledger)
    _verify_point(actual.get("sourcePosition"), expected.get("sourcePosition"), "RESTRAINT sourcePosition", ledger)
    _verify_point(actual.get("attachmentPosition"), expected.get("attachmentPosition"), "RESTRAINT attachmentPosition", ledger)


def _verify_rigid(actual: dict[str, Any], expected: dict[str, Any], ledger: DecisionLedger) -> None:
    fields = (
        "id", "ownerInputXmlElementId", "canonicalEdgeId", "sourceEntityIds",
        "sourcePaths", "branchIds", "assignmentAuthorities", "weightAuthorities",
        "sourceBodyCount",
    )
    _verify_fields(actual, expected, fields, "RIGID", ledger)
    _verify_number(actual, expected, "connectionResidual", "RIGID", ledger)
    _verify_number(actual, expected, "weight", "RIGID", ledger)


def _verify_fields(actual, expected, fields, label, ledger):
    for field in fields:
        if actual.get(field) != expected.get(field):
            _child_block(ledger, f"{label} {expected['id']} has wrong {field} ownership evidence.")


def _verify_number(actual, expected, field, label, ledger):
    left = actual.get(field)
    right = expected.get(field)
    if right is None:
        if left is not None:
            _child_block(ledger, f"{label} {expected['id']} fabricates missing {field}.")
        return
    if not _finite(left) or round(float(left), 6) != round(float(right), 6):
        _child_block(ledger, f"{label} {expected['id']} has wrong {field}.")


def _verify_point(actual, expected, label, ledger):
    if not isinstance(actual, dict) or not isinstance(expected, dict):
        _child_block(ledger, f"{label} is missing.")
    if any(round(float(actual[axis]), 6) != round(float(expected[axis]), 6) for axis in ("x", "y", "z")):
        _child_block(ledger, f"{label} differs from canonical ownership evidence.")


def _unique_index(value: Any, label: str, ledger: DecisionLedger) -> dict[str, dict[str, Any]]:
    if not isinstance(value, list) or any(not isinstance(row, dict) for row in value):
        _child_block(ledger, f"Parsed {label} collection is not an object array.")
    ids = [str(row.get("id") or "") for row in value]
    if not all(ids) or len(ids) != len(set(ids)):
        _child_block(ledger, f"Parsed {label} IDs are empty or duplicated.")
    return {str(row["id"]): row for row in value}


def _verify_population(actual, expected, label, ledger):
    if set(actual) != set(expected):
        _child_block(ledger, f"Parsed {label} identity population differs from canonical ownership.")


def _number(value: Any) -> float | None:
    return float(value) if _finite(value) else None


def _finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def _unique(values) -> list[str]:
    return list(dict.fromkeys(str(value) for value in values if str(value or "")))


def _child_block(ledger: DecisionLedger, message: str) -> None:
    block(ledger, "MANAGED_STAGE_INPUTXML_RELATION_MISMATCH", message, "parsedInputXmlTopology.children")


__all__ = ["verify_inputxml_child_relations"]
