#!/usr/bin/env python3
"""Build deterministic topology, numbering, reparse, and parity for InputXML imports."""
from __future__ import annotations

import hashlib
import json
import math
from typing import Any

from lxml import etree as ET

MAX_RESTRAINTS_PER_ELEMENT = 6


class InputXmlImportTopologyError(RuntimeError):
    """Raised when imported InputXML cannot produce exact release topology."""


def stable_json_bytes(value: dict[str, Any]) -> bytes:
    """Serialize an evidence object deterministically for SHA-256 hashing."""
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False, allow_nan=False) + "\n").encode("utf-8")


def sha256(data: bytes) -> str:
    """Return a lowercase SHA-256 digest for exact bytes."""
    return hashlib.sha256(data).hexdigest()


def hash_without(value: dict[str, Any], field: str) -> str:
    """Hash deterministic JSON while excluding its self-hash field."""
    return sha256(stable_json_bytes({key: item for key, item in value.items() if key != field}))


def local_name(element: ET._Element) -> str:
    """Return the local name of one XML element tag."""
    return ET.QName(element).localname


def child_elements(root: ET._Element, name: str) -> list[ET._Element]:
    """Return descendants with an exact local name in document order."""
    return [element for element in root.iter() if local_name(element) == name]


def required_node(value: str | None, label: str) -> int:
    """Parse a positive integral engineering node number without coercion."""
    raw = str(value or "").strip()
    try:
        number = int(raw)
    except ValueError as exc:
        raise InputXmlImportTopologyError(f"{label} must be a positive integer: {raw or '(missing)' }.") from exc
    if number < 1 or str(number) != raw:
        raise InputXmlImportTopologyError(f"{label} must be a canonical positive integer: {raw}.")
    return number


def finite_attributes(element: ET._Element, names: tuple[str, str, str]) -> tuple[float, float, float] | None:
    """Read a coordinate triplet only when all fields are finite and present."""
    raw = [element.get(name) for name in names]
    if any(value is None or not str(value).strip() for value in raw):
        return None
    values = tuple(float(str(value)) for value in raw)
    if not all(math.isfinite(value) for value in values):
        raise InputXmlImportTopologyError(f"Non-finite coordinate in fields {', '.join(names)}.")
    return values


def point_dict(point: tuple[float, float, float]) -> dict[str, float]:
    """Convert a coordinate tuple to the canonical point object."""
    return {"x": point[0], "y": point[1], "z": point[2]}


def register_node(
    registry: dict[int, tuple[float, float, float]],
    order: list[int],
    number: int,
    point: tuple[float, float, float],
) -> None:
    """Register one node or block a conflicting coordinate identity."""
    previous = registry.get(number)
    if previous is not None and previous != point:
        raise InputXmlImportTopologyError(f"Engineering node {number} has conflicting coordinates: {previous} versus {point}.")
    if previous is None:
        registry[number] = point
        order.append(number)


def element_geometry(
    element: ET._Element,
    registry: dict[int, tuple[float, float, float]],
) -> tuple[int, int, tuple[float, float, float], tuple[float, float, float]]:
    """Resolve exact endpoints using explicit coordinates or the declared delta."""
    from_node = required_node(element.get("FROM_NODE"), "FROM_NODE")
    to_node = required_node(element.get("TO_NODE"), "TO_NODE")
    from_point = finite_attributes(element, ("FROM_X", "FROM_Y", "FROM_Z")) or registry.get(from_node)
    to_point = finite_attributes(element, ("TO_X", "TO_Y", "TO_Z")) or registry.get(to_node)
    delta = finite_attributes(element, ("DELTA_X", "DELTA_Y", "DELTA_Z"))
    if from_point is None and to_point is not None and delta is not None:
        from_point = tuple(to_point[index] - delta[index] for index in range(3))
    if to_point is None and from_point is not None and delta is not None:
        to_point = tuple(from_point[index] + delta[index] for index in range(3))
    if from_point is None or to_point is None:
        raise InputXmlImportTopologyError(f"Element {from_node}->{to_node} lacks resolvable endpoint coordinates.")
    return from_node, to_node, from_point, to_point


def source_rows(root: ET._Element) -> tuple[list[dict[str, Any]], dict[int, tuple[float, float, float]], list[int]]:
    """Build ordered element rows and a conflict-checked engineering-node registry."""
    registry: dict[int, tuple[float, float, float]] = {}
    order: list[int] = []
    rows: list[dict[str, Any]] = []
    for index, element in enumerate(child_elements(root, "PIPINGELEMENT"), 1):
        restraints = [child for child in element if local_name(child) == "RESTRAINT"]
        if len(restraints) > MAX_RESTRAINTS_PER_ELEMENT:
            raise InputXmlImportTopologyError(f"Element {element.get('FROM_NODE')}->{element.get('TO_NODE')} contains {len(restraints)} restraints; maximum is 6.")
        from_node, to_node, from_point, to_point = element_geometry(element, registry)
        register_node(registry, order, from_node, from_point)
        register_node(registry, order, to_node, to_point)
        rows.append({"index": index, "element": element, "fromNode": from_node, "toNode": to_node, "restraints": restraints})
    if not rows:
        raise InputXmlImportTopologyError("Canonical InputXML contains no PIPINGELEMENT records.")
    return rows, registry, order


def build_canonical_topology(root: ET._Element, source_hash: str) -> dict[str, Any]:
    """Build number-free CanonicalTopology.v2 from the compiler candidate tree."""
    rows, registry, order = source_rows(root)
    node_id = {number: f"CN-{index:06d}" for index, number in enumerate(order, 1)}
    nodes = [{"id": node_id[number], "position": point_dict(registry[number]), "sourcePortIds": [f"INPUTXML-NODE:{number}"], "sourceEntityIds": [f"INPUTXML-NODE:{number}"]} for number in order]
    edges = [{"id": f"CE-{row['index']:06d}", "fromNodeId": node_id[row["fromNode"]], "toNodeId": node_id[row["toNode"]], "sourceEntityIds": [str(row["element"].get("ID") or f"PIPINGELEMENT:{row['index']}")], "inputXmlElementIds": [str(row["element"].get("ID") or f"PE-{row['index']:06d}")]} for row in rows]
    supports = [{"id": str(restraint.get("ID") or f"RESTRAINT:{row['index']}:{index}"), "nodeId": node_id[required_node(restraint.get("NODE"), "RESTRAINT NODE")], "sourceEntityIds": [str(restraint.get("ID") or f"RESTRAINT:{row['index']}:{index}")]} for row in rows for index, restraint in enumerate(row["restraints"], 1)]
    rigids = [{"id": str(child.get("ID") or f"RIGID:{row['index']}:{index}"), "edgeId": f"CE-{row['index']:06d}", "sourceEntityIds": [str(child.get("ID") or f"RIGID:{row['index']}:{index}")]} for row in rows for index, child in enumerate([item for item in row["element"] if local_name(item) == "RIGID"], 1)]
    base = {"schema": "CanonicalTopology.v2", "sourceIdentity": {"sourceHashSha256": source_hash, "dialect": "canonical-inputxml-v1"}, "coordinateFrame": {"unit": "source"}, "nodes": nodes, "edges": edges, "supports": supports, "pointFeatures": [], "junctions": [], "boundaries": [], "rigids": rigids, "buildIssues": [], "summary": {"nodes": len(nodes), "edges": len(edges), "supports": len(supports)}}
    return {**base, "canonicalTopologyHashSha256": hash_without(base, "canonicalTopologyHashSha256")}


def plan_hash(value: dict[str, Any]) -> str:
    """Apply the TopoNodePlan semantic-hash field policy."""
    fields = ("schema", "projectId", "zoneId", "sourceInventoryHash", "logicalTopologyHash", "sequencePlanHash", "baseRegistrySnapshotHash", "configHash", "logicalNodes", "emittedOccurrences", "reservedOccurrences", "rawPortMappings", "componentProjection")
    selected = {field: value[field] for field in fields}
    raw = json.dumps(selected, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return f"sha256:{sha256(raw)}"


def build_node_plan(topology: dict[str, Any]) -> dict[str, Any]:
    """Preserve imported engineering numbers in the sole TopoNodePlan authority."""
    anchor = f"sha256:{topology['sourceIdentity']['sourceHashSha256']}"
    logical_nodes, occurrences, mappings, projections = [], [], [], []
    for index, node in enumerate(topology["nodes"], 1):
        number = required_node(node["sourcePortIds"][0].split(":", 1)[1], "Imported node")
        logical_id, occurrence_id, projection_id = f"LN-{index:06d}", f"NO-{index:06d}", f"CP-{index:06d}"
        logical_nodes.append({"logicalNodeId": logical_id, "historyNodeId": node["id"], "engineeringNodeNumber": number, "allocationKind": "SOURCE_INPUTXML", "matchDisposition": "MATCHED"})
        occurrences.append({"occurrenceId": occurrence_id, "logicalNodeId": logical_id, "componentProjectionId": projection_id, "engineeringNodeNumber": number, "disposition": "EMITTED", "sourceEntityId": node["sourceEntityIds"][0]})
        mappings.append({"sourcePortId": node["sourcePortIds"][0], "logicalNodeId": logical_id})
        projections.append({"componentProjectionId": projection_id, "sourceEntityId": node["sourceEntityIds"][0], "emittedOccurrenceIds": [occurrence_id], "reservedOccurrenceIds": []})
    plan = {"schema": "TopoNodePlan.v1", "projectId": "inputxml-import", "zoneId": "inputxml-import", "sourceInventoryHash": anchor, "logicalTopologyHash": f"sha256:{topology['canonicalTopologyHashSha256']}", "sequencePlanHash": anchor, "baseRegistrySnapshotHash": anchor, "configHash": anchor, "logicalNodes": logical_nodes, "emittedOccurrences": occurrences, "reservedOccurrences": [], "rawPortMappings": mappings, "componentProjection": projections, "validation": {"status": "PASS", "blockers": [], "reviewItems": [], "warnings": []}}
    return {**plan, "nodePlanHash": plan_hash(plan)}


def build_projection(topology: dict[str, Any], plan: dict[str, Any]) -> dict[str, Any]:
    """Bind canonical node IDs to logical IDs and source engineering numbers."""
    logical_by_port = {row["sourcePortId"]: row["logicalNodeId"] for row in plan["rawPortMappings"]}
    number_by_logical = {row["logicalNodeId"]: row["engineeringNodeNumber"] for row in plan["logicalNodes"]}
    nodes = [{"canonicalNodeId": node["id"], "logicalNodeId": logical_by_port[node["sourcePortIds"][0]], "engineeringNodeNumber": number_by_logical[logical_by_port[node["sourcePortIds"][0]]]} for node in topology["nodes"]]
    base = {"schema": "NumberedTopologyProjection.v1", "canonicalTopologyHashSha256": topology["canonicalTopologyHashSha256"], "topoNodePlanHashSha256": plan["nodePlanHash"].removeprefix("sha256:"), "authority": "TopoNodePlan.v1", "nodes": nodes}
    return {**base, "numberedTopologyProjectionHashSha256": hash_without(base, "numberedTopologyProjectionHashSha256")}


def parsed_topology(topology: dict[str, Any], input_xml: bytes) -> dict[str, Any]:
    """Reparse exact serialized bytes and return an independently hashed topology view."""
    root = ET.fromstring(input_xml, ET.XMLParser(resolve_entities=False, no_network=True, recover=False))
    rebuilt = build_canonical_topology(root, sha256(input_xml))
    base = {"schema": "ParsedInputXmlTopology.v1", "inputXmlHashSha256": sha256(input_xml), "canonicalTopologyHashSha256": topology["canonicalTopologyHashSha256"], "nodes": rebuilt["nodes"], "elements": rebuilt["edges"], "restraints": rebuilt["supports"], "rigids": rebuilt["rigids"], "issues": [], "summary": {"nodes": len(rebuilt["nodes"]), "elements": len(rebuilt["edges"]), "restraints": len(rebuilt["supports"]), "rigids": len(rebuilt["rigids"]), "issues": 0}}
    return {**base, "parsedInputXmlTopologyHashSha256": hash_without(base, "parsedInputXmlTopologyHashSha256")}


def build_parity(topology: dict[str, Any], plan: dict[str, Any], projection: dict[str, Any], parsed: dict[str, Any], input_xml: bytes) -> dict[str, Any]:
    """Compare pre-serialization canonical identities with exact-byte reparse identities."""
    expected_edges = [(row["fromNodeId"], row["toNodeId"]) for row in topology["edges"]]
    actual_edges = [(row["fromNodeId"], row["toNodeId"]) for row in parsed["elements"]]
    mismatches = [] if expected_edges == actual_edges and len(topology["supports"]) == len(parsed["restraints"]) and len(topology["rigids"]) == len(parsed["rigids"]) else [{"severity": "BLOCKING", "category": "IMPORTED_TOPOLOGY_MISMATCH", "expected": {"edges": len(expected_edges), "supports": len(topology["supports"]), "rigids": len(topology["rigids"])}, "actual": {"edges": len(actual_edges), "supports": len(parsed["restraints"]), "rigids": len(parsed["rigids"])}, "status": "OPEN"}]
    base = {"schema": "TopologyParityReport.v2", "status": "PASS" if not mismatches else "BLOCKED", "canonicalTopologyHashSha256": topology["canonicalTopologyHashSha256"], "topoNodePlanHashSha256": plan["nodePlanHash"].removeprefix("sha256:"), "numberedTopologyProjectionHashSha256": projection["numberedTopologyProjectionHashSha256"], "inputXmlHashSha256": sha256(input_xml), "parsedInputXmlTopologyHashSha256": parsed["parsedInputXmlTopologyHashSha256"], "svgSceneHash": "NOT_APPLICABLE:INPUTXML_IMPORT", "summary": {"topologyMismatchCount": len(mismatches)}, "mismatches": mismatches}
    return {**base, "topologyParityReportHashSha256": hash_without(base, "topologyParityReportHashSha256")}


def build_import_topology_evidence(candidate_root: ET._Element, canonical_xml: bytes, source_hash: str) -> dict[str, dict[str, Any]]:
    """Build the complete mandatory topology evidence set for one compiler result."""
    topology = build_canonical_topology(candidate_root, source_hash)
    plan = build_node_plan(topology)
    projection = build_projection(topology, plan)
    parsed = parsed_topology(topology, canonical_xml)
    parity = build_parity(topology, plan, projection, parsed, canonical_xml)
    if parity["status"] != "PASS":
        raise InputXmlImportTopologyError("Exact-byte InputXML topology parity failed.")
    return {"canonicalTopology": topology, "topoNodePlan": plan, "numberedTopologyProjection": projection, "parsedInputXmlTopology": parsed, "topologyParityReport": parity}
