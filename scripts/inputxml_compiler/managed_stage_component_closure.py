#!/usr/bin/env python3
"""Independent source-component, port, node, edge, and element conservation."""
from __future__ import annotations

import math
from typing import Any

from .base import DecisionLedger
from .managed_stage_diagnostics import block
from .managed_stage_policy import component_policy

_ROUTE_CATEGORIES = {
    "PIPE", "ELBO/BEND", "TEE", "VALVE", "FLANGE", "GASK", "INST", "REDUCER",
}


def verify_component_topology_closure(
    canonical: dict[str, Any],
    collections: dict[str, list[dict[str, Any]]],
    source: dict[str, Any],
    ledger: DecisionLedger,
) -> dict[str, dict[str, Any]]:
    """Prove exact source-component conservation before trace evidence is used."""
    _finite_nonnegative(canonical.get("toleranceMm"), "canonical tolerance", ledger)
    node_by_port = _verify_node_port_coupling(collections, source, ledger)
    _verify_edge_owner_coupling(collections, source, node_by_port, ledger)
    return _component_mappings(collections, source, node_by_port, ledger)


def attach_verified_trace_elements(
    mappings: dict[str, dict[str, Any]],
    traces: dict[str, dict[str, Any]],
    ledger: DecisionLedger,
) -> None:
    for entity_id, mapping in mappings.items():
        trace = traces.get(entity_id)
        if trace is None:
            _component_block(ledger, f"Source entity {entity_id} has no verified trace relation.")
        elements = _text_array(
            trace.get("inputXmlElementIds") or [],
            "trace inputXmlElementIds",
            ledger,
            allow_empty=True,
        )
        mapping["inputXmlElementIds"] = elements
        mapping["traceCardinality"] = str(trace.get("projectionCardinality") or "")
        if mapping["category"] == "PIPE" and set(elements) != set(mapping["edgeInputXmlElementIds"]):
            _component_block(
                ledger,
                f"PIPE {mapping['sourcePath']} trace elements differ from its exact canonical edges.",
            )


def _verify_node_port_coupling(
    collections: dict[str, list[dict[str, Any]]],
    source: dict[str, Any],
    ledger: DecisionLedger,
) -> dict[str, dict[str, Any]]:
    port_by_id = source["portById"]
    support_positions = _support_attachment_positions(collections["supports"], source)
    node_by_port: dict[str, dict[str, Any]] = {}
    for node in collections["nodes"]:
        node_id = str(node.get("id") or "")
        port_ids = _text_array(node.get("sourcePortIds"), "canonical node sourcePortIds", ledger)
        entity_ids = _text_array(node.get("sourceEntityIds"), "canonical node sourceEntityIds", ledger)
        expected_owners = _unique(port_by_id[port_id]["sourceEntityId"] for port_id in port_ids)
        if set(entity_ids) != set(expected_owners):
            _component_block(
                ledger,
                f"Canonical node {node_id} source entities differ from the owners of its source ports.",
            )
        position = _point(node.get("position"), f"canonical node {node_id} position", ledger)
        effective_positions = []
        for port_id in port_ids:
            port = port_by_id[port_id]
            owner = str(port["sourceEntityId"])
            expected = support_positions.get((owner, node_id), port["position"])
            effective_positions.append(_point(expected, f"source port {port_id} position", ledger))
            node_by_port[port_id] = node
        distances = [_distance(position, value) for value in effective_positions]
        if not distances or min(distances) > 1e-9:
            _component_block(
                ledger,
                f"Canonical node {node_id} position has no producer-owned source-port authority.",
            )
        declared = _finite_nonnegative(
            node.get("connectionResidual", 0),
            f"canonical node {node_id} connectionResidual",
            ledger,
        )
        if not math.isclose(declared, max(distances, default=0.0), rel_tol=0.0, abs_tol=1e-6):
            _component_block(
                ledger,
                f"Canonical node {node_id} residual does not match its source-port positions.",
            )
    return node_by_port


def _support_attachment_positions(
    supports: list[dict[str, Any]],
    source: dict[str, Any],
) -> dict[tuple[str, str], dict[str, Any]]:
    result: dict[tuple[str, str], dict[str, Any]] = {}
    for support in supports:
        node_id = str(support.get("nodeId") or "")
        attachment = support.get("attachmentPosition") or support.get("position")
        for entity_id in support.get("sourceEntityIds") or []:
            entity = source["entityById"].get(str(entity_id))
            if entity and component_policy(entity["sourceType"]).category == "SUPPORT":
                result[(str(entity_id), node_id)] = attachment
    return result


def _verify_edge_owner_coupling(
    collections: dict[str, list[dict[str, Any]]],
    source: dict[str, Any],
    node_by_port: dict[str, dict[str, Any]],
    ledger: DecisionLedger,
) -> None:
    entity_by_id = source["entityById"]
    port_by_id = source["portById"]
    support_nodes = _support_nodes(collections["supports"])
    for edge in collections["edges"]:
        edge_id = str(edge.get("id") or "")
        port_ids = _text_array(edge.get("sourcePortIds"), "canonical edge sourcePortIds", ledger)
        entity_ids = _text_array(edge.get("sourceEntityIds"), "canonical edge sourceEntityIds", ledger)
        if len(port_ids) != 2:
            _component_block(ledger, f"Canonical edge {edge_id} must cite exactly two source ports.")
        endpoint_nodes = {str(edge.get("fromNodeId") or ""), str(edge.get("toNodeId") or "")}
        if {str(node_by_port[port_id]["id"]) for port_id in port_ids} != endpoint_nodes:
            _component_block(ledger, f"Canonical edge {edge_id} source ports do not own its endpoints.")
        port_owners = {str(port_by_id[port_id]["sourceEntityId"]) for port_id in port_ids}
        if not port_owners.issubset(set(entity_ids)):
            _component_block(ledger, f"Canonical edge {edge_id} omits a source-port owner entity.")
        branch_ids, support_ids, route_ids = _classify_edge_entities(entity_ids, entity_by_id)
        cardinality = str(edge.get("projectionCardinality") or "ONE_TO_ONE")
        merge_ids = set(_text_array(
            edge.get("mergeSourceEntityIds") or [],
            "mergeSourceEntityIds",
            ledger,
            allow_empty=True,
        ))
        if cardinality == "MANY_TO_ONE":
            if route_ids != merge_ids or len(route_ids) < 2 or not str(edge.get("projectionMergeAuthority") or ""):
                _component_block(ledger, f"Managed merge {edge_id} has inconsistent route participants.")
        elif len(route_ids) != 1 or merge_ids:
            _component_block(ledger, f"Canonical edge {edge_id} has ambiguous component ownership.")
        allowed_supports = {
            support_id
            for support_id in support_ids
            if support_nodes.get(support_id) in endpoint_nodes
        }
        if allowed_supports != support_ids:
            _component_block(ledger, f"Canonical edge {edge_id} cites a support not attached to an endpoint.")
        expected_branches = {
            str(entity_by_id[entity_id].get("sourceBranchEntityId") or "")
            for entity_id in route_ids | support_ids
            if str(entity_by_id[entity_id].get("sourceBranchEntityId") or "")
        }
        expected_branches.update(
            owner
            for owner in port_owners
            if owner in entity_by_id and not entity_by_id[owner].get("sourceBranchEntityId")
        )
        if branch_ids != expected_branches:
            _component_block(ledger, f"Canonical edge {edge_id} branch ownership is inconsistent.")


def _component_mappings(
    collections: dict[str, list[dict[str, Any]]],
    source: dict[str, Any],
    node_by_port: dict[str, dict[str, Any]],
    ledger: DecisionLedger,
) -> dict[str, dict[str, Any]]:
    model_by_id = {
        str(row.get("sourceEntityId") or ""): row
        for row in source["sourceModel"].get("entities") or []
    }
    mappings: dict[str, dict[str, Any]] = {}
    for entity_id, entity in source["entityById"].items():
        model_entity = model_by_id.get(entity_id, {})
        category = component_policy(entity["sourceType"]).category
        edges = [row for row in collections["edges"] if entity_id in (row.get("sourceEntityIds") or [])]
        points = [row for row in collections["pointFeatures"] if entity_id in (row.get("sourceEntityIds") or [])]
        junctions = [row for row in collections["junctions"] if entity_id in (row.get("sourceEntityIds") or [])]
        boundaries = [row for row in collections["boundaries"] if entity_id in (row.get("sourceEntityIds") or [])]
        supports = [row for row in collections["supports"] if entity_id in (row.get("sourceEntityIds") or [])]
        rigids = [row for row in collections["rigids"] if str(row.get("sourceEntityId") or "") == entity_id]
        mapping = {
            "sourceEntityId": entity_id,
            "sourcePath": entity["sourcePath"],
            "category": category,
            "edgeIds": _unique(row.get("id") for row in edges),
            "edgeInputXmlElementIds": _unique(
                value for row in edges for value in row.get("inputXmlElementIds") or []
            ),
            "pointFeatureIds": _unique(row.get("id") for row in points),
            "junctionIds": _unique(row.get("id") for row in junctions),
            "boundaryIds": _unique(row.get("id") for row in boundaries),
            "supportIds": _unique(row.get("id") for row in supports),
            "rigidIds": _unique(row.get("id") for row in rigids),
            "inputXmlElementIds": [],
            "traceCardinality": "",
        }
        _verify_component_mapping(
            entity,
            model_entity,
            mapping,
            edges,
            points,
            junctions,
            supports,
            rigids,
            source,
            node_by_port,
            ledger,
        )
        mappings[entity_id] = mapping
    return mappings


def _verify_component_mapping(
    entity: dict[str, Any],
    model_entity: dict[str, Any],
    mapping: dict[str, Any],
    edges: list[dict[str, Any]],
    points: list[dict[str, Any]],
    junctions: list[dict[str, Any]],
    supports: list[dict[str, Any]],
    rigids: list[dict[str, Any]],
    source: dict[str, Any],
    node_by_port: dict[str, dict[str, Any]],
    ledger: DecisionLedger,
) -> None:
    category = mapping["category"]
    if not entity.get("sourceBranchEntityId"):
        return
    geometry = str(model_entity.get("geometryClassification") or "")
    if category == "SUPPORT":
        deferred = (model_entity.get("supportProjection") or {}).get("disposition") == "DEFER_SUPPORT"
        if len(supports) != 1 and not (not supports and deferred):
            _component_block(ledger, f"Support {entity['sourcePath']} has no exact support disposition.")
        return
    if category == "RIGID":
        if len(rigids) != 1 or len(mapping["edgeInputXmlElementIds"]) != 1:
            _component_block(ledger, f"Rigid {entity['sourcePath']} lacks one exact edge and child owner.")
        return
    if category == "OLET":
        if len(junctions) != 1:
            _component_block(ledger, f"Olet {entity['sourcePath']} lacks one exact canonical junction.")
        _require_ports_on_nodes(entity, ("P",), source, node_by_port, ledger)
        return
    if category == "TEE":
        if len(junctions) != 1 or len(edges) < 2:
            _component_block(ledger, f"Tee {entity['sourcePath']} lacks its run edges and junction.")
        _require_ports_on_edges(entity, ("A", "P", "L"), edges, source, node_by_port, ledger)
        return
    if geometry == "POINT":
        if len(points) != 1 or edges:
            _component_block(ledger, f"Point component {entity['sourcePath']} lacks one point-feature mapping.")
        return
    if category in _ROUTE_CATEGORIES:
        if not edges:
            _component_block(ledger, f"Route component {entity['sourcePath']} has no canonical edge mapping.")
        _verify_route_roles(category, edges, entity, ledger)
        required = component_policy(entity["sourceType"]).required_ports
        _require_ports_on_edges(entity, required, edges, source, node_by_port, ledger)
        if len(mapping["edgeInputXmlElementIds"]) != len(edges):
            _component_block(ledger, f"Route component {entity['sourcePath']} loses InputXML element identity.")
        return
    if category == "UNKNOWN" or geometry == "UNKNOWN":
        _component_block(ledger, f"Unknown component {entity['sourcePath']} has no authorized topology mapping.")


def _verify_route_roles(
    category: str,
    edges: list[dict[str, Any]],
    entity: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    roles = [str(row.get("segmentRole") or "") for row in edges]
    if category == "PIPE":
        if any(not role.startswith("PIPE") for role in roles):
            _component_block(ledger, f"PIPE {entity['sourcePath']} owns a non-PIPE edge.")
        if len(edges) > 1 and any("SUPPORT_SPLIT" not in role for role in roles):
            _component_block(ledger, f"PIPE {entity['sourcePath']} has an unauthorized multi-edge projection.")
    if category == "ELBO/BEND":
        if len(edges) < 2 or not any("RUN_IN" in role for role in roles) or not any("RUN_OUT" in role for role in roles):
            _component_block(ledger, f"Bend {entity['sourcePath']} lacks both authoritative bend arms.")


def _require_ports_on_edges(
    entity: dict[str, Any],
    roles: tuple[str, ...],
    edges: list[dict[str, Any]],
    source: dict[str, Any],
    node_by_port: dict[str, dict[str, Any]],
    ledger: DecisionLedger,
) -> None:
    ports = _ports_by_role(entity["sourceEntityId"], source)
    endpoint_nodes = {
        str(value)
        for edge in edges
        for value in (edge.get("fromNodeId"), edge.get("toNodeId"))
    }
    edge_ports = {
        str(value)
        for edge in edges
        for value in edge.get("sourcePortIds") or []
    }
    merge_only = all(
        str(edge.get("projectionCardinality") or "") == "MANY_TO_ONE"
        and entity["sourceEntityId"] in (edge.get("mergeSourceEntityIds") or [])
        for edge in edges
    )
    for role in roles:
        port = ports.get(role)
        if port is None:
            _component_block(ledger, f"{entity['sourcePath']} lacks required port role {role}.")
        port_id = str(port["sourcePortId"])
        node = node_by_port.get(port_id)
        if node is None or str(node.get("id") or "") not in endpoint_nodes:
            _component_block(ledger, f"{entity['sourcePath']} port {role} is not on its edge endpoints.")
        if not merge_only and port_id not in edge_ports:
            _component_block(ledger, f"{entity['sourcePath']} port {role} is absent from its edge ancestry.")


def _require_ports_on_nodes(
    entity: dict[str, Any],
    roles: tuple[str, ...],
    source: dict[str, Any],
    node_by_port: dict[str, dict[str, Any]],
    ledger: DecisionLedger,
) -> None:
    ports = _ports_by_role(entity["sourceEntityId"], source)
    for role in roles:
        port = ports.get(role)
        if port is None or str(port["sourcePortId"]) not in node_by_port:
            _component_block(ledger, f"{entity['sourcePath']} port {role} has no canonical node.")


def _ports_by_role(entity_id: str, source: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(port["role"]): port
        for port in source["ports"]
        if str(port["sourceEntityId"]) == entity_id
    }


def _classify_edge_entities(entity_ids, entity_by_id):
    branches, supports, routes = set(), set(), set()
    for entity_id in entity_ids:
        entity = entity_by_id[str(entity_id)]
        if not entity.get("sourceBranchEntityId"):
            branches.add(str(entity_id))
        elif component_policy(entity["sourceType"]).category == "SUPPORT":
            supports.add(str(entity_id))
        else:
            routes.add(str(entity_id))
    return branches, supports, routes


def _support_nodes(supports: list[dict[str, Any]]) -> dict[str, str]:
    return {
        str(entity_id): str(row.get("nodeId") or "")
        for row in supports
        for entity_id in row.get("sourceEntityIds") or []
    }


def _point(value: Any, label: str, ledger: DecisionLedger) -> dict[str, float]:
    if not isinstance(value, dict):
        _component_block(ledger, f"{label} is missing.")
    try:
        result = {axis: float(value[axis]) for axis in ("x", "y", "z")}
    except (KeyError, TypeError, ValueError):
        _component_block(ledger, f"{label} is invalid.")
    if not all(math.isfinite(item) for item in result.values()):
        _component_block(ledger, f"{label} is non-finite.")
    return result


def _finite_nonnegative(value: Any, label: str, ledger: DecisionLedger) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        _component_block(ledger, f"{label} is invalid.")
    if not math.isfinite(result) or result < 0:
        _component_block(ledger, f"{label} is invalid.")
    return result


def _text_array(
    value: Any,
    label: str,
    ledger: DecisionLedger,
    *,
    allow_empty: bool = False,
) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(item, str) or not item for item in value):
        _component_block(ledger, f"{label} must be a nonblank string array.")
    if not allow_empty and not value:
        _component_block(ledger, f"{label} must not be empty.")
    if len(value) != len(set(value)):
        _component_block(ledger, f"{label} contains duplicate values.")
    return value


def _distance(left: dict[str, float], right: dict[str, float]) -> float:
    return math.sqrt(sum((right[axis] - left[axis]) ** 2 for axis in ("x", "y", "z")))


def _unique(values) -> list[str]:
    return list(dict.fromkeys(str(value) for value in values if str(value or "")))


def _component_block(ledger: DecisionLedger, message: str) -> None:
    block(
        ledger,
        "MANAGED_STAGE_COMPONENT_MAPPING_INCOMPLETE",
        message,
        "managed-stage-component-closure",
    )


__all__ = ["attach_verified_trace_elements", "verify_component_topology_closure"]
