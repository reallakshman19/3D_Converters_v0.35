#!/usr/bin/env python3
"""Relational verification of strict Root topology bridge mappings."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .base import DecisionLedger
from .topology_diagnostics import block

_ADJACENCY_RULE = "DIRECT_NODE_CHILD_ORDER_REGISTERED_PRODUCER_V1"


@dataclass(frozen=True)
class ExpectedNode:
    source: dict[str, Any]
    owner_edge_index: int
    ownership_rule: str


@dataclass(frozen=True)
class ExpectedTopology:
    nodes: tuple[ExpectedNode, ...]
    edges: tuple[dict[str, Any], ...]
    auxiliaries: tuple[dict[str, Any], ...]


def verify_bridge_relations(
    request: dict[str, Any],
    result: dict[str, Any],
    ledger: DecisionLedger,
) -> ExpectedTopology:
    expected = _expected_topology(request)
    _verify_nodes(expected.nodes, result, ledger)
    _verify_edges(expected, result, ledger)
    _verify_components(expected.nodes, result, ledger)
    _verify_auxiliaries(expected.auxiliaries, result, ledger)
    return expected


def _expected_topology(request: dict[str, Any]) -> ExpectedTopology:
    nodes: list[ExpectedNode] = []
    edges: list[dict[str, Any]] = []
    auxiliaries: list[dict[str, Any]] = []
    for branch in request["branches"]:
        branch_nodes = branch["nodes"]
        edge_start = len(edges)
        for index, source_node in enumerate(branch_nodes):
            node = ExpectedNode(
                source_node,
                edge_start + max(index - 1, 0),
                (
                    "FIRST_NODE_OUTGOING_EDGE"
                    if index == 0
                    else "NODE_INCOMING_EDGE"
                ),
            )
            nodes.append(node)
            for restraint in source_node.get("restraints") or []:
                auxiliaries.append({"node": node, "restraint": restraint})
        for index in range(1, len(branch_nodes)):
            edges.append(
                {
                    "branchPath": str(branch["sourcePath"]),
                    "from": branch_nodes[index - 1],
                    "to": branch_nodes[index],
                    "sequence": len(edges) + 1,
                }
            )
    return ExpectedTopology(tuple(nodes), tuple(edges), tuple(auxiliaries))


def _verify_nodes(
    expected: tuple[ExpectedNode, ...],
    result: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    nodes = _object_array(result.get("nodes"), "nodes", ledger)
    mappings = _object_array(
        result.get("nodeMappings"),
        "nodeMappings",
        ledger,
    )
    if len(nodes) != len(expected) or len(mappings) != len(expected):
        _mapping_block(ledger, "Node and node-mapping counts are incomplete.")
    for wanted, node, mapping in zip(expected, nodes, mappings):
        source = wanted.source
        number = int(source["nodeNumber"])
        logical = f"LN-{number}"
        canonical = str(number)
        _require_relation(
            node,
            {
                "sourcePath": source["sourcePath"],
                "logicalNodeId": logical,
                "canonicalNodeId": canonical,
                "nodeNumber": number,
                "nodeNumberLexical": str(source["nodeNumberLexical"]),
                "position": source["position"],
            },
            "node",
            ledger,
        )
        _require_relation(
            mapping,
            {
                "sourceNodePath": source["sourcePath"],
                "logicalNodeId": logical,
                "canonicalNodeId": canonical,
            },
            "node mapping",
            ledger,
        )
    _require_unique(
        [str(row["sourceNodePath"]) for row in mappings],
        "Node mappings contain duplicate source paths.",
        ledger,
    )


def _verify_edges(
    expected: ExpectedTopology,
    result: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    edges = _object_array(result.get("edges"), "edges", ledger)
    mappings = _object_array(
        result.get("elementMappings"),
        "elementMappings",
        ledger,
    )
    if len(edges) != len(expected.edges) or len(mappings) != len(edges):
        _mapping_block(ledger, "Edge and element-mapping counts are incomplete.")
    canonical_ids: list[str] = []
    logical_ids: list[str] = []
    for wanted, edge, mapping in zip(expected.edges, edges, mappings):
        from_number = int(wanted["from"]["nodeNumber"])
        to_number = int(wanted["to"]["nodeNumber"])
        required = {
            "sourceBranchPath": wanted["branchPath"],
            "sourceFromNodePath": wanted["from"]["sourcePath"],
            "sourceToNodePath": wanted["to"]["sourcePath"],
            "logicalFromNodeId": f"LN-{from_number}",
            "logicalToNodeId": f"LN-{to_number}",
            "canonicalFromNodeId": str(from_number),
            "canonicalToNodeId": str(to_number),
            "topologyRule": _ADJACENCY_RULE,
            "sequence": wanted["sequence"],
        }
        _require_relation(edge, required, "edge", ledger)
        element_id = _identity(edge, "canonicalElementId", ledger)
        logical_id = _identity(edge, "logicalEdgeId", ledger)
        canonical_ids.append(element_id)
        logical_ids.append(logical_id)
        _require_relation(
            mapping,
            {
                "sourceBranchPath": required["sourceBranchPath"],
                "sourceFromNodePath": required["sourceFromNodePath"],
                "sourceToNodePath": required["sourceToNodePath"],
                "logicalEdgeId": logical_id,
                "canonicalElementId": element_id,
            },
            "element mapping",
            ledger,
        )
    _require_unique(canonical_ids, "Canonical edge owners are duplicated.", ledger)
    _require_unique(logical_ids, "Logical edge identities are duplicated.", ledger)
    for node in expected.nodes:
        if not 0 <= node.owner_edge_index < len(edges):
            _mapping_block(ledger, "A source node has no valid incident edge owner.")


def _verify_components(
    expected: tuple[ExpectedNode, ...],
    result: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    components = _object_array(result.get("components"), "components", ledger)
    if len(components) != len(expected):
        _mapping_block(
            ledger,
            "Every source node requires exactly one component mapping.",
        )
    seen: list[str] = []
    for wanted, mapping in zip(expected, components):
        source = wanted.source
        owner = result["edges"][wanted.owner_edge_index]
        number = int(source["nodeNumber"])
        _require_relation(
            mapping,
            {
                "sourceNodePath": source["sourcePath"],
                "sourceFieldPath": (
                    source.get("fieldPaths", {}).get("ComponentType")
                    or source["sourcePath"]
                ),
                "componentType": str(
                    source.get("fields", {}).get("ComponentType") or ""
                ).upper(),
                "connectionType": str(
                    source.get("fields", {}).get("ConnectionType") or ""
                ).upper(),
                "componentRefNo": str(
                    source.get("fields", {}).get("ComponentRefNo") or ""
                ),
                "logicalNodeId": f"LN-{number}",
                "canonicalElementId": owner["canonicalElementId"],
                "ownershipRule": wanted.ownership_rule,
            },
            "component mapping",
            ledger,
        )
        seen.append(str(mapping["sourceNodePath"]))
    _require_unique(seen, "Component mappings contain duplicate source nodes.", ledger)


def _verify_auxiliaries(
    expected: tuple[dict[str, Any], ...],
    result: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    mappings = _object_array(result.get("auxiliaries"), "auxiliaries", ledger)
    if len(mappings) != len(expected):
        _mapping_block(
            ledger,
            "Every source restraint requires exactly one auxiliary mapping.",
        )
    seen: list[str] = []
    for wanted, mapping in zip(expected, mappings):
        node = wanted["node"]
        source = node.source
        restraint = wanted["restraint"]
        owner = result["edges"][node.owner_edge_index]
        number = int(source["nodeNumber"])
        _require_relation(
            mapping,
            {
                "sourcePath": restraint["sourcePath"],
                "sourceNodePath": source["sourcePath"],
                "sourceName": restraint["sourceName"],
                "logicalNodeId": f"LN-{number}",
                "canonicalNodeId": str(number),
                "canonicalElementId": owner["canonicalElementId"],
                "ownershipRule": node.ownership_rule,
            },
            "auxiliary mapping",
            ledger,
        )
        seen.append(str(mapping["sourcePath"]))
    _require_unique(seen, "Auxiliary mappings contain duplicate source restraints.", ledger)


def _object_array(
    value: Any,
    name: str,
    ledger: DecisionLedger,
) -> list[dict[str, Any]]:
    if not isinstance(value, list) or any(
        not isinstance(row, dict) for row in value
    ):
        block(
            ledger,
            "BRIDGE_CONTRACT_INVALID",
            f"Bridge {name} must be an object array.",
            "topology-bridge",
        )
    return value


def _require_relation(
    actual: dict[str, Any],
    expected: dict[str, Any],
    name: str,
    ledger: DecisionLedger,
) -> None:
    for field, value in expected.items():
        if actual.get(field) != value:
            _mapping_block(
                ledger,
                f"Bridge {name} field {field} does not match source authority.",
            )


def _identity(
    row: dict[str, Any],
    field: str,
    ledger: DecisionLedger,
) -> str:
    value = str(row.get(field) or "")
    if not value:
        _mapping_block(ledger, f"Bridge identity {field} is empty.")
    return value


def _require_unique(
    values: list[str],
    message: str,
    ledger: DecisionLedger,
) -> None:
    if len(values) != len(set(values)):
        _mapping_block(ledger, message)


def _mapping_block(ledger: DecisionLedger, message: str) -> None:
    block(
        ledger,
        "BRIDGE_MAPPING_INCOMPLETE",
        message,
        "topology-bridge",
    )


__all__ = ["ExpectedTopology", "verify_bridge_relations"]
