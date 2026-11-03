#!/usr/bin/env python3
"""Canonical candidate builder for strict Root topology profiles."""
from __future__ import annotations

import json
from typing import Any

from lxml import etree as ET

from .base import COUNT_FIELDS, DecisionLedger, EXT_NS
from .counts import _new_root
from .extension import _ensure_extension_last, _extension_record
from .family_counts import apply_canonical_counts
from .topology_components import apply_component_evidence
from .topology_engineering import (
    canonical_edge_attributes,
    resolve_branch_engineering,
)
from .topology_profiles import TopologyProfileContract
from .topology_restraints import attach_restraint
from .topology_source_model import TopologySourceDocument
from .xml import _decimal_text, _local, _namespace

_CHILD_ORDER = {
    "BEND": 0,
    "RIGID": 1,
    "SIF": 2,
    "RESTRAINT": 3,
    "HANGER": 4,
}


def build_topology_candidate(
    source: bytes,
    source_document: TopologySourceDocument,
    bridge_result: dict[str, Any],
    *,
    profile: TopologyProfileContract,
    context: dict[str, Any],
    ledger: DecisionLedger,
) -> ET._Element:
    canonical, model = _new_root(str(context["version"]).strip())
    _apply_model_context(model, context, ledger)
    branch_by_path = {row.path: row for row in source_document.branches}
    node_by_path = {
        node.path: node
        for branch in source_document.branches
        for node in branch.nodes
    }
    restraint_by_path = {
        restraint.path: restraint
        for node in node_by_path.values()
        for restraint in node.restraints
    }
    engineering = {
        branch.path: resolve_branch_engineering(
            branch,
            context=context,
            ledger=ledger,
        )
        for branch in source_document.branches
    }
    element_by_id: dict[str, ET._Element] = {}
    for edge in bridge_result["edges"]:
        branch = branch_by_path[edge["sourceBranchPath"]]
        from_node = node_by_path[edge["sourceFromNodePath"]]
        to_node = node_by_path[edge["sourceToNodePath"]]
        element_id = str(edge["canonicalElementId"])
        target = ET.Element(
            "PIPINGELEMENT",
            **canonical_edge_attributes(
                branch,
                from_node,
                to_node,
                element_id=element_id,
                resolution=engineering[branch.path],
                ledger=ledger,
            ),
        )
        model.append(target)
        element_by_id[element_id] = target
        _record_edge_mapping(edge, ledger)
    _record_node_mappings(bridge_result["nodeMappings"], ledger)
    for mapping in bridge_result["components"]:
        apply_component_evidence(
            element_by_id[str(mapping["canonicalElementId"])],
            node_by_path[str(mapping["sourceNodePath"])],
            mapping=mapping,
            profile_id=profile.profile_id,
            context=context,
            ledger=ledger,
        )
    slots: dict[str, int] = {}
    for mapping in bridge_result["auxiliaries"]:
        element_id = str(mapping["canonicalElementId"])
        slots[element_id] = slots.get(element_id, 0) + 1
        node = node_by_path[str(mapping["sourceNodePath"])]
        restraint = restraint_by_path[str(mapping["sourcePath"])]
        attach_restraint(
            element_by_id[element_id],
            node,
            restraint,
            slot=slots[element_id],
            mapping=mapping,
            ledger=ledger,
        )
    for element in element_by_id.values():
        _order_element_children(element)
        _ensure_extension_last(element)
    apply_canonical_counts(model, ledger)
    _preserve_document_evidence(
        model,
        source,
        source_document,
        bridge_result,
        profile,
        ledger,
    )
    _ensure_extension_last(model)
    _ensure_extension_last(canonical)
    _record_document_projection(
        source_document,
        bridge_result,
        profile,
        element_by_id,
        ledger,
    )
    return canonical


def _apply_model_context(
    model: ET._Element,
    context: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    model.set("JOBNAME", str(context["jobName"]).strip())
    if "time" in context and str(context["time"]).strip():
        model.set("TIME", str(context["time"]).strip())
    if "issueNo" in context:
        model.set("ISSUE_NO", str(context["issueNo"]))
    north = tuple(
        _decimal_text(value, f"compiler-context@north[{index}]")
        for index, value in enumerate(context["north"])
    )
    for field, value in zip(("NORTH_X", "NORTH_Y", "NORTH_Z"), north):
        model.set(field, value)
    for field in COUNT_FIELDS:
        model.set(field, "0")
    for key in ("version", "jobName", "time", "issueNo", "north"):
        if key not in context:
            continue
        ledger.add(
            source_entity_id=f"compiler-context@{key}",
            source_type="TOPOLOGY_CONTEXT_FIELD",
            source_fields={"key": key, "value": context[key]},
            cii_section="VERSION",
            projection_cardinality="1_TO_1",
            disposition="EMIT_1_TO_1",
            evidence=[
                "profile contract explicitly permits and requires this context authority"
            ],
        )


def _record_edge_mapping(edge: dict[str, Any], ledger: DecisionLedger) -> None:
    element_id = str(edge["canonicalElementId"])
    ledger.add(
        source_entity_id=(
            f"{edge['sourceBranchPath']}/edge::"
            f"{edge['sourceFromNodePath']}->{edge['sourceToNodePath']}"
        ),
        source_type="TOPOLOGY_EDGE_MAPPING",
        source_fields={
            "sourceBranchPath": edge["sourceBranchPath"],
            "sourceFromNodePath": edge["sourceFromNodePath"],
            "sourceToNodePath": edge["sourceToNodePath"],
            "logicalEdgeId": edge["logicalEdgeId"],
            "logicalFromNodeId": edge["logicalFromNodeId"],
            "logicalToNodeId": edge["logicalToNodeId"],
            "topologyRule": edge["topologyRule"],
        },
        canonical_element_ids=[element_id],
        canonical_node_ids=[
            str(edge["canonicalFromNodeId"]),
            str(edge["canonicalToNodeId"]),
        ],
        inputxml_element_ids=[element_id],
        cii_section="ELEMENTS",
        projection_cardinality="EMIT_1_TO_1",
        disposition="EMIT_1_TO_1",
        evidence=[
            "direct adjacent Node occurrence paths are declared route sequence by the registered producer contract",
            "no invalid occurrence was skipped or connected around",
        ],
    )


def _record_node_mappings(
    mappings: list[dict[str, Any]],
    ledger: DecisionLedger,
) -> None:
    for mapping in mappings:
        ledger.add(
            source_entity_id=(
                f"{mapping['sourceNodePath']}/logical-node-mapping"
            ),
            source_type="TOPOLOGY_NODE_MAPPING",
            source_fields={
                "sourceNodePath": mapping["sourceNodePath"],
                "logicalNodeId": mapping["logicalNodeId"],
                "canonicalNodeId": mapping["canonicalNodeId"],
            },
            canonical_node_ids=[str(mapping["canonicalNodeId"])],
            projection_cardinality="1_TO_0",
            disposition="PRESERVE_EXTENSION",
            evidence=[
                "logical and canonical node identity derives from explicit source NodeNumber",
                "coordinates did not create or merge node identity",
            ],
        )


def _preserve_document_evidence(
    model: ET._Element,
    source: bytes,
    source_document: TopologySourceDocument,
    bridge_result: dict[str, Any],
    profile: TopologyProfileContract,
    ledger: DecisionLedger,
) -> None:
    _extension_record(
        model,
        producer=ledger.producer,
        dialect=profile.profile_id,
        name=profile.extension_name,
        source_path=ledger.source_path,
        source_entity_id="/Root[1]",
        source_field="sourceXml",
        value=source.decode("utf-8", errors="strict"),
        disposition="PRESERVE_EXTENSION",
        criticality="HIGH",
        confidence=1.0,
    )
    _extension_record(
        model,
        producer=ledger.producer,
        dialect=profile.profile_id,
        name="StrictTopologyProof",
        source_path=ledger.source_path,
        source_entity_id="topology-bridge-proof",
        source_field="topologyProof",
        value=json.dumps(
            bridge_result["topologyProof"],
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ),
        disposition="PRESERVE_EXTENSION",
        criticality="HIGH",
        confidence=1.0,
    )
    for name, value in source_document.metadata.items():
        if not value:
            continue
        _extension_record(
            model,
            producer=ledger.producer,
            dialect=profile.profile_id,
            name=f"Source{name}",
            source_path=ledger.source_path,
            source_entity_id=f"/Root[1]/{name}[1]",
            source_field=name,
            value=value,
            disposition="PRESERVE_EXTENSION",
            criticality="MEDIUM",
            confidence=1.0,
        )


def _record_document_projection(
    source_document: TopologySourceDocument,
    bridge_result: dict[str, Any],
    profile: TopologyProfileContract,
    elements: dict[str, ET._Element],
    ledger: DecisionLedger,
) -> None:
    element_ids = list(elements)
    node_ids = [
        str(row["canonicalNodeId"])
        for row in bridge_result["nodeMappings"]
    ]
    ledger.add(
        source_entity_id=f"/Root[1]/profile::{profile.profile_id}",
        source_type=profile.document_source_type,
        source_fields={
            "profileId": profile.profile_id,
            "adapterId": profile.adapter_id,
            "sourceHashSha256": source_document.source_hash_sha256,
            "branchOccurrenceCount": len(source_document.branches),
            "nodeOccurrenceCount": len(node_ids),
            "edgeCount": len(element_ids),
        },
        canonical_element_ids=element_ids,
        canonical_node_ids=node_ids,
        inputxml_element_ids=element_ids,
        cii_section="ELEMENTS",
        projection_cardinality="1_TO_MANY",
        disposition="PROJECT_WITH_AUTHORITATIVE_TOPOLOGY_ENGINE",
        evidence=[
            "profile-specific source identity was established before shared topology resolution",
            "strict JSON bridge contains no XML parser or synthetic topology operations",
        ],
    )


def _order_element_children(element: ET._Element) -> None:
    children = list(element)
    ordered = sorted(
        enumerate(children),
        key=lambda pair: (
            99
            if _namespace(pair[1].tag) == EXT_NS
            else _CHILD_ORDER.get(_local(pair[1].tag), 90),
            pair[0],
        ),
    )
    if [child for _, child in ordered] == children:
        return
    for child in children:
        element.remove(child)
    for _, child in ordered:
        element.append(child)


__all__ = ["build_topology_candidate"]
