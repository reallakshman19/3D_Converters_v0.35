#!/usr/bin/env python3
"""Independent source-to-canonical trace relation reconstruction."""
from __future__ import annotations

from typing import Any

from .managed_stage_policy import component_policy

_DEFERRED_ENGINEERING = (
    "OD", "WALL", "MATERIAL", "TEMPERATURE", "PRESSURE", "INSULATION",
)
_RELATION_FIELDS = (
    "primaryDisposition",
    "canonicalNodeIds",
    "canonicalEdgeIds",
    "pointFeatureIds",
    "junctionIds",
    "boundaryIds",
    "affectedEdgeIds",
    "branchEdgeIds",
    "affectedSourceEntityIds",
    "inputXmlElementIds",
    "inputXmlChildIds",
    "inputXmlFromNode",
    "inputXmlToNode",
    "projectionCardinality",
    "deferredProperties",
    "lossClassification",
    "operation",
    "status",
)


def expected_trace_relation(
    entity_id: str,
    source: dict[str, Any],
    collections: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    entity = _source_entity(entity_id, source)
    objects = _objects_for_source(collections, entity_id)
    disposition = _disposition(entity, objects)
    header_edges = _affected_header_edges(entity, collections, objects)
    reference_edges = [
        row for row in objects["edges"]
        if row.get("segmentRole") == "CREF_BRANCH_CONNECTION"
    ]
    rigid_edges = [
        row for row in collections["edges"]
        if any(rigid.get("edgeId") == row.get("id") for rigid in objects["rigids"])
    ]
    effective_rows = [*objects["edges"], *header_edges, *rigid_edges]
    effective_edge_ids = _unique(row.get("id") for row in effective_rows)
    node_ids = _unique([
        *[value for row in objects["edges"] for value in (row.get("fromNodeId"), row.get("toNodeId"))],
        *[row.get("nodeId") for row in objects["junctions"]],
        *[row.get("nodeId") for row in objects["boundaries"]],
        *[row.get("nodeId") for row in objects["supports"]],
    ])
    merge_edge = next((
        row for row in objects["edges"]
        if row.get("projectionCardinality") == "MANY_TO_ONE"
        and entity_id in (row.get("mergeSourceEntityIds") or [])
    ), None)
    is_merge = merge_edge is not None
    single_edge = effective_rows[0] if len(effective_rows) == 1 else None
    nodes = {str(row.get("id")): row for row in collections["nodes"]}
    return {
        "primaryDisposition": disposition,
        "canonicalNodeIds": node_ids,
        "canonicalEdgeIds": _unique(row.get("id") for row in objects["edges"]),
        "pointFeatureIds": _unique(row.get("id") for row in objects["points"]),
        "junctionIds": _unique(row.get("id") for row in objects["junctions"]),
        "boundaryIds": _unique(row.get("id") for row in objects["boundaries"]),
        "affectedEdgeIds": _unique(row.get("id") for row in header_edges),
        "branchEdgeIds": _unique(row.get("id") for row in reference_edges),
        "affectedSourceEntityIds": _affected_sources(entity_id, objects),
        "inputXmlElementIds": _unique(
            value for row in effective_rows for value in row.get("inputXmlElementIds") or []
        ),
        "inputXmlChildIds": _child_ids(objects),
        "inputXmlFromNode": _input_node(single_edge, "fromNodeId", nodes),
        "inputXmlToNode": _input_node(single_edge, "toNodeId", nodes),
        "projectionCardinality": _cardinality(len(effective_edge_ids), disposition, is_merge),
        "deferredProperties": _deferred_properties(entity, disposition),
        "lossClassification": _loss_classification(disposition, is_merge),
        "operation": _operation(disposition),
        "status": "ERROR" if disposition == "BLOCK_AMBIGUOUS" else "ACCEPTED",
        "mergeAuthority": str((merge_edge or {}).get("projectionMergeAuthority") or ""),
    }


def relation_fields() -> tuple[str, ...]:
    return _RELATION_FIELDS


def _source_entity(entity_id: str, source: dict[str, Any]) -> dict[str, Any]:
    rows = source["sourceModel"].get("entities") or []
    return next(row for row in rows if str(row.get("sourceEntityId")) == entity_id)


def _objects_for_source(
    collections: dict[str, list[dict[str, Any]]],
    entity_id: str,
) -> dict[str, list[dict[str, Any]]]:
    contains = lambda row: entity_id in (row.get("sourceEntityIds") or [])
    return {
        "edges": [row for row in collections["edges"] if contains(row)],
        "points": [row for row in collections["pointFeatures"] if contains(row)],
        "junctions": [row for row in collections["junctions"] if contains(row)],
        "boundaries": [row for row in collections["boundaries"] if contains(row)],
        "supports": [row for row in collections["supports"] if contains(row)],
        "rigids": [
            row for row in collections["rigids"]
            if str(row.get("sourceEntityId") or "") == entity_id
        ],
    }


def _disposition(entity: dict[str, Any], objects: dict[str, list[dict[str, Any]]]) -> str:
    category = component_policy(str(entity.get("sourceType") or "")).category
    if category == "SUPPORT":
        if objects["supports"]:
            return "EMIT_SUPPORT_ATTACHMENT"
        policy = entity.get("supportProjection") or {}
        return "DEFER_SUPPORT" if policy.get("disposition") == "DEFER_SUPPORT" else "BLOCK_AMBIGUOUS"
    if category == "TEE":
        return "EMIT_TEE_JUNCTION"
    if category == "OLET":
        return "EMIT_OLET_JUNCTION"
    if str(entity.get("sourceType") or "") == "BRANCH":
        if objects["boundaries"]:
            return "EXTERNAL_BOUNDARY"
        if objects["edges"]:
            return "EMIT_ROUTE_EDGE"
        if objects["junctions"]:
            return "EMIT_OLET_JUNCTION" if objects["junctions"][0].get("kind") == "OLET" else "EMIT_TEE_JUNCTION"
        if objects["points"]:
            return "EMIT_POINT_FEATURE"
        return "BLOCK_AMBIGUOUS"
    geometry = str(entity.get("geometryClassification") or "")
    if geometry == "POINT":
        return "EMIT_POINT_FEATURE"
    if geometry == "UNKNOWN":
        return "BLOCK_AMBIGUOUS"
    if category == "PIPE":
        return "EMIT_ROUTE_EDGE"
    if category == "ELBO/BEND":
        return "EMIT_BEND_EDGE_SET"
    return "EMIT_INLINE_COMPONENT_EDGE"


def _deferred_properties(entity: dict[str, Any], disposition: str) -> list[str]:
    category = component_policy(str(entity.get("sourceType") or "")).category
    if disposition == "EMIT_SUPPORT_ATTACHMENT":
        return []
    if disposition == "DEFER_SUPPORT":
        return ["SUPPORT_ATTACHMENT", "RESTRAINT"]
    if category in {"TEE", "OLET"}:
        return ["SIF_VALUES"]
    if category in {"VALVE", "FLANGE"}:
        return [*_DEFERRED_ENGINEERING, "RIGID", "WEIGHT"]
    if category == "GASK":
        return [*_DEFERRED_ENGINEERING, "RIGID_MERGE_POLICY"]
    if category == "INST":
        return [*_DEFERRED_ENGINEERING, "RIGID", "WEIGHT", "INSTRUMENT_SEMANTICS"]
    if category == "REDUCER":
        return [*_DEFERRED_ENGINEERING, "DIAMETER_TRANSITION"]
    if category == "ELBO/BEND":
        return [*_DEFERRED_ENGINEERING, "BEND_ENGINEERING_PROPERTIES"]
    return [] if str(entity.get("sourceType") or "") == "BRANCH" else list(_DEFERRED_ENGINEERING)


def _affected_header_edges(entity, collections, objects):
    if component_policy(str(entity.get("sourceType") or "")).category != "OLET" or not objects["junctions"]:
        return []
    node_id = objects["junctions"][0].get("nodeId")
    return [
        row for row in collections["edges"]
        if row.get("segmentRole") != "CREF_BRANCH_CONNECTION"
        and node_id in {row.get("fromNodeId"), row.get("toNodeId")}
    ]


def _affected_sources(entity_id: str, objects: dict[str, list[dict[str, Any]]]) -> list[str]:
    return [value for value in _unique(
        source_id
        for name in ("edges", "junctions", "boundaries")
        for row in objects[name]
        for source_id in row.get("sourceEntityIds") or []
    ) if value != entity_id]


def _child_ids(objects: dict[str, list[dict[str, Any]]]) -> list[str]:
    restraint_ids = [
        f"RESTRAINT:{support.get('id')}:{index + 1}"
        for support in objects["supports"]
        for index, _ in enumerate(support.get("restraints") or [])
    ]
    rigid_ids = [f"RIGID:{row.get('edgeId')}" for row in objects["rigids"]]
    return _unique([*restraint_ids, *rigid_ids])


def _input_node(edge, field: str, nodes: dict[str, dict[str, Any]]) -> str:
    if edge is None:
        return ""
    values = nodes.get(str(edge.get(field)), {}).get("inputXmlNodeIds") or []
    return str(values[0]) if values else ""


def _cardinality(edge_count: int, disposition: str, is_merge: bool) -> str:
    if disposition == "BLOCK_AMBIGUOUS":
        return "BLOCKED"
    if disposition == "DEFER_SUPPORT":
        return "DEFERRED"
    if disposition in {"EMIT_POINT_FEATURE", "EXTERNAL_BOUNDARY"} and edge_count == 0:
        return "POINT_ONLY"
    if edge_count == 1 and is_merge:
        return "MANY_TO_ONE"
    if edge_count > 1:
        return "ONE_TO_MANY"
    if edge_count == 1:
        return "ONE_TO_ONE"
    if disposition in {"EMIT_TEE_JUNCTION", "EMIT_OLET_JUNCTION"}:
        return "JUNCTION_ONLY"
    return "POINT_ONLY"


def _loss_classification(disposition: str, is_merge: bool) -> str:
    if is_merge:
        return "EXPLICIT_CANONICAL_OVERLAP"
    values = {
        "EMIT_SUPPORT_ATTACHMENT": "LOSSLESS_SUPPORT_ATTACHMENT",
        "DEFER_SUPPORT": "DEFERRED_NON_RESTRAINT_ATTACHMENT",
        "EMIT_POINT_FEATURE": "POINT_FEATURE_ONLY",
        "EMIT_TEE_JUNCTION": "JUNCTION_CONNECTIVITY",
        "EMIT_OLET_JUNCTION": "JUNCTION_CONNECTIVITY",
        "EXTERNAL_BOUNDARY": "EXTERNAL_BOUNDARY",
        "BLOCK_AMBIGUOUS": "BLOCKED_AMBIGUOUS",
        "EMIT_BEND_EDGE_SET": "LOSSLESS_MULTI_EDGE",
    }
    return values.get(disposition, "LOSSLESS_TOPOLOGY")


def _operation(disposition: str) -> str:
    return {
        "EMIT_ROUTE_EDGE": "emit-route-edge-set",
        "EMIT_INLINE_COMPONENT_EDGE": "emit-inline-component-edge",
        "EMIT_BEND_EDGE_SET": "emit-bend-edge-set",
        "EMIT_POINT_FEATURE": "emit-point-feature",
        "EMIT_TEE_JUNCTION": "emit-tee-junction",
        "EMIT_OLET_JUNCTION": "emit-olet-junction",
        "EMIT_SUPPORT_ATTACHMENT": "emit-support-restraint",
        "DEFER_SUPPORT": "defer-support",
        "EXTERNAL_BOUNDARY": "emit-external-boundary",
        "BLOCK_AMBIGUOUS": "block-ambiguous",
    }.get(disposition, "record-topology-decision")


def _unique(values) -> list[str]:
    return list(dict.fromkeys(str(value) for value in values if str(value or "")))


__all__ = ["expected_trace_relation", "relation_fields"]
