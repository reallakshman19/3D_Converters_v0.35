#!/usr/bin/env python3
"""Exact source-occurrence decisions for PR-6 topology accounting."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .base import DecisionLedger
from .topology_source_model import TopologySourceDocument


@dataclass(frozen=True)
class _Decision:
    kind: str
    rule: str
    disposition: str
    cardinality: str
    canonical_elements: tuple[str, ...] = ()
    canonical_nodes: tuple[str, ...] = ()
    owner_source_path: str = ""


def record_topology_source_decisions(
    source: TopologySourceDocument,
    bridge_result: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    """Create one semantic decision for every inventoried source occurrence."""
    descriptors = _descriptors(source, bridge_result)
    for row in source.inventory.entries:
        identity = str(row["identity"])
        decision = descriptors.get(identity)
        if decision is None:
            decision = _Decision(
                kind="UNRECOGNIZED_SOURCE_OCCURRENCE",
                rule="FULL_SOURCE_EXTENSION_WITH_BLOCKER",
                disposition="DEFER_EXPLICITLY",
                cardinality="1_TO_0",
                owner_source_path=str(row.get("parentIdentity") or ""),
            )
        ledger.add(
            source_entity_id=identity,
            source_type="TOPOLOGY_SOURCE_DECISION",
            source_fields={
                "sourceKind": row["kind"],
                "sourceName": row["name"],
                "sourceValue": row["value"],
                "parentIdentity": row["parentIdentity"],
                "decisionKind": decision.kind,
                "decisionRule": decision.rule,
                "ownerSourcePath": decision.owner_source_path,
            },
            canonical_element_ids=list(decision.canonical_elements),
            canonical_node_ids=list(decision.canonical_nodes),
            inputxml_element_ids=list(decision.canonical_elements),
            projection_cardinality=decision.cardinality,
            disposition=decision.disposition,
            evidence=[
                "decision derives from the verified source model and bridge ownership",
                "generic inventory presence is not accounting authority",
            ],
        )


def _descriptors(
    source: TopologySourceDocument,
    result: dict[str, Any],
) -> dict[str, _Decision]:
    node_mapping = {
        str(row["sourceNodePath"]): str(row["canonicalNodeId"])
        for row in result["nodeMappings"]
    }
    component_mapping = {
        str(row["sourceNodePath"]): row
        for row in result["components"]
    }
    auxiliary_mapping = {
        str(row["sourcePath"]): row
        for row in result["auxiliaries"]
    }
    branch_elements: dict[str, list[str]] = {}
    for edge in result["edges"]:
        branch_elements.setdefault(
            str(edge["sourceBranchPath"]),
            [],
        ).append(str(edge["canonicalElementId"]))

    values: dict[str, _Decision] = {
        "/Root[1]": _Decision(
            "SOURCE_DOCUMENT",
            "PRESERVE_FULL_SOURCE_EXTENSION",
            "PRESERVE_EXTENSION",
            "1_TO_0",
        )
    }
    _metadata_descriptors(source, values)
    for branch in source.branches:
        elements = tuple(branch_elements.get(branch.path, ()))
        nodes = tuple(str(node.node_number) for node in branch.nodes)
        values[branch.path] = _Decision(
            "BRANCH_OCCURRENCE",
            "SOURCE_PATH_BRANCH_TO_VERIFIED_EDGES",
            "PROJECT_WITH_AUTHORITATIVE_TOPOLOGY_ENGINE",
            "1_TO_MANY",
            elements,
            nodes,
            branch.path,
        )
        _branch_field_descriptors(branch, elements, nodes, values)
        for node in branch.nodes:
            owner = component_mapping[node.path]
            owner_element = str(owner["canonicalElementId"])
            canonical_node = node_mapping[node.path]
            values[node.path] = _Decision(
                "NODE_OCCURRENCE",
                "SOURCE_NODE_TO_LOGICAL_AND_CANONICAL_NODE",
                "PROJECT_WITH_AUTHORITATIVE_TOPOLOGY_ENGINE",
                "1_TO_1",
                (owner_element,),
                (canonical_node,),
                node.path,
            )
            for name, path in node.field_paths.items():
                values[path] = _Decision(
                    "NODE_FIELD",
                    _node_field_rule(name),
                    "MERGE_INTO",
                    "MERGE_INTO",
                    (owner_element,),
                    (canonical_node,),
                    node.path,
                )
            for restraint in node.restraints:
                mapping = auxiliary_mapping[restraint.path]
                owner_element = str(mapping["canonicalElementId"])
                values[restraint.path] = _Decision(
                    "AUXILIARY_OCCURRENCE",
                    "CONTAINING_NODE_TO_VERIFIED_INCIDENT_EDGE",
                    "ATTACH_AUXILIARY",
                    "ATTACH_AUXILIARY",
                    (owner_element,),
                    (canonical_node,),
                    node.path,
                )
                for name, path in restraint.field_paths.items():
                    values[path] = _Decision(
                        "AUXILIARY_FIELD",
                        f"PROJECT_RESTRAINT_{name.upper()}",
                        "ATTACH_AUXILIARY",
                        "ATTACH_AUXILIARY",
                        (owner_element,),
                        (canonical_node,),
                        restraint.path,
                    )
    return values


def _metadata_descriptors(
    source: TopologySourceDocument,
    values: dict[str, _Decision],
) -> None:
    for name in source.metadata:
        path = f"/Root[1]/{name}[1]"
        values[path] = _Decision(
            "PROFILE_METADATA_FIELD",
            f"VALIDATE_AND_PRESERVE_{name.upper()}",
            "PRESERVE_EXTENSION",
            "1_TO_0",
            owner_source_path="/Root[1]",
        )


def _branch_field_descriptors(
    branch: Any,
    elements: tuple[str, ...],
    nodes: tuple[str, ...],
    values: dict[str, _Decision],
) -> None:
    containers: set[str] = set()
    for name, path in branch.field_paths.items():
        parent = path.rsplit("/", 1)[0]
        if parent != branch.path:
            containers.add(parent)
        values[path] = _Decision(
            "BRANCH_FIELD",
            _branch_field_rule(name),
            "MERGE_INTO",
            "MERGE_INTO",
            elements,
            nodes,
            branch.path,
        )
    for container in containers:
        values[container] = _Decision(
            "BRANCH_CONTEXT_CONTAINER",
            "PRESERVE_CASE_CONTAINER_STRUCTURE",
            "PRESERVE_EXTENSION",
            "1_TO_0",
            elements,
            nodes,
            branch.path,
        )


def _branch_field_rule(name: str) -> str:
    if name == "Branchname":
        return "PRESERVE_BRANCH_DISPLAY_PATH_SEPARATELY"
    if name in {"LineNo", "LINE_ID"}:
        return "RECONCILE_COMPATIBLE_LINE_IDENTITY"
    return f"PROJECT_BRANCH_SCOPED_{name.upper()}"


def _node_field_rule(name: str) -> str:
    rules = {
        "NodeNumber": "PROJECT_EXPLICIT_NODE_IDENTITY",
        "Position": "PROJECT_EXACT_POSITION_AND_EDGE_GEOMETRY",
        "ComponentType": "PROJECT_OR_EXPLICITLY_BLOCK_COMPONENT",
        "ConnectionType": "PRESERVE_CONNECTION_CLASSIFICATION",
        "ComponentRefNo": "PRESERVE_COMPONENT_REFERENCE_IDENTITY",
    }
    return rules.get(name, f"PROJECT_OR_PRESERVE_NODE_{name.upper()}")


__all__ = ["record_topology_source_decisions"]
