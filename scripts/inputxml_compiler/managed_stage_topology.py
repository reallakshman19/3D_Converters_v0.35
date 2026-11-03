#!/usr/bin/env python3
"""Independent CanonicalTopology, trace-ledger, and port-disposition closure."""
from __future__ import annotations

import math
from collections import Counter
from typing import Any

from .base import DecisionLedger
from .managed_stage_diagnostics import block, retain_blocker
from .managed_stage_policy import component_policy, policy_rows
from .managed_stage_trace_relations import expected_trace_relation, relation_fields

_LIMITS = {
    "nodes": 150000,
    "edges": 150000,
    "pointFeatures": 100000,
    "junctions": 50000,
    "boundaries": 50000,
    "supports": 100000,
    "rigids": 100000,
}


def verify_topology_and_trace(
    result: dict[str, Any],
    source: dict[str, Any],
    ledger: DecisionLedger,
) -> dict[str, Any]:
    canonical = result["canonicalTopology"]
    trace = result["traceLedger"]
    collections = {
        name: _object_array(canonical.get(name), f"canonicalTopology.{name}", ledger)
        for name in _LIMITS
    }
    for name, rows in collections.items():
        if len(rows) > _LIMITS[name]:
            _topology_block(ledger, f"Canonical {name} exceeds the PR-7 containment limit.")
    _verify_source_port_node_owners(collections["nodes"], source, ledger)
    indexes = _canonical_indexes(collections, ledger)
    _verify_nodes(collections["nodes"], source, ledger)
    _verify_edges(collections["edges"], indexes, source, ledger)
    _verify_special_objects(collections, indexes, source, ledger)
    _verify_build_issues(result.get("buildIssues") or [], canonical.get("buildIssues") or [], ledger)
    trace_index = _verify_trace(trace, source, collections, ledger)
    dispositions = _port_dispositions(source, collections, trace_index, ledger)
    _apply_component_policy(source, trace_index, collections, ledger)
    ledger.add(
        source_entity_id="managed-stage-topology-closure",
        source_type="MANAGED_STAGE_TOPOLOGY_TRACE_CLOSURE",
        source_fields={
            "canonicalNodeCount": len(collections["nodes"]),
            "canonicalEdgeCount": len(collections["edges"]),
            "traceRecordCount": len(trace_index),
            "sourcePortDispositionCount": len(dispositions),
            "componentPolicy": policy_rows(),
        },
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION",
        evidence=[
            "canonical objects were verified from returned arrays rather than metrics",
            "trace relations were independently reconstructed from canonical ownership",
            "every mapped source port has exactly one canonical node owner",
        ],
    )
    return {
        "collections": collections,
        "indexes": indexes,
        "traceByEntity": trace_index,
        "portDispositions": dispositions,
    }


def _canonical_indexes(
    collections: dict[str, list[dict[str, Any]]],
    ledger: DecisionLedger,
) -> dict[str, dict[str, dict[str, Any]]]:
    indexes: dict[str, dict[str, dict[str, Any]]] = {}
    for name, rows in collections.items():
        ids = [str(row.get("id") or "") for row in rows]
        if not all(ids) or len(ids) != len(set(ids)):
            _topology_block(ledger, f"Canonical {name} IDs are empty or duplicated.")
        indexes[name] = {str(row["id"]): row for row in rows}
    input_nodes = [
        str(value)
        for row in collections["nodes"]
        for value in row.get("inputXmlNodeIds") or []
    ]
    input_elements = [
        str(value)
        for row in collections["edges"]
        for value in row.get("inputXmlElementIds") or []
    ]
    if not all(input_nodes) or len(input_nodes) != len(set(input_nodes)):
        _topology_block(ledger, "Canonical InputXML node IDs are empty or duplicated.")
    if not all(input_elements) or len(input_elements) != len(set(input_elements)):
        _topology_block(ledger, "Canonical InputXML element IDs are empty or duplicated.")
    indexes["inputNodes"] = {value: {} for value in input_nodes}
    indexes["inputElements"] = {value: {} for value in input_elements}
    return indexes


def _verify_source_port_node_owners(
    nodes: list[dict[str, Any]],
    source: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    known = set(source["portById"])
    owners: dict[str, list[str]] = {}
    for node in nodes:
        node_id = str(node.get("id") or "")
        values = node.get("sourcePortIds")
        if not isinstance(values, list):
            _topology_block(ledger, f"Canonical node {node_id} sourcePortIds must be an array.")
        for value in values:
            port_id = str(value or "")
            if port_id not in known:
                _topology_block(ledger, f"Canonical node {node_id} references unknown source port {port_id}.")
            owners.setdefault(port_id, []).append(node_id)
    ambiguous = {port_id: node_ids for port_id, node_ids in owners.items() if len(node_ids) != 1}
    if ambiguous:
        block(
            ledger,
            "MANAGED_STAGE_SOURCE_PORT_OWNER_AMBIGUOUS",
            "A mapped source port belongs to more than one canonical node.",
            "canonicalTopology.nodes",
            canonicalNodeOwnersBySourcePort=ambiguous,
        )


def _verify_nodes(
    nodes: list[dict[str, Any]],
    source: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    port_ids = set(source["portById"])
    entity_ids = set(source["entityById"])
    for row in nodes:
        if not _point(row.get("position")):
            _topology_block(ledger, f"Canonical node {row.get('id')} has invalid coordinates.")
        source_ports = _string_array(row.get("sourcePortIds"), "canonical node sourcePortIds", ledger)
        source_entities = _string_array(row.get("sourceEntityIds"), "canonical node sourceEntityIds", ledger)
        input_ids = _string_array(row.get("inputXmlNodeIds"), "canonical node inputXmlNodeIds", ledger)
        if not source_ports or any(value not in port_ids for value in source_ports):
            _topology_block(ledger, f"Canonical node {row.get('id')} lacks valid source-port ancestry.")
        if not source_entities or any(value not in entity_ids for value in source_entities):
            _topology_block(ledger, f"Canonical node {row.get('id')} has invalid source-entity ancestry.")
        if len(input_ids) != 1 or not input_ids[0].isdigit() or int(input_ids[0]) <= 0:
            _topology_block(ledger, f"Canonical node {row.get('id')} has invalid InputXML node identity.")


def _verify_edges(
    edges: list[dict[str, Any]],
    indexes: dict[str, dict[str, dict[str, Any]]],
    source: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    nodes = indexes["nodes"]
    entity_ids = set(source["entityById"])
    port_ids = set(source["portById"])
    for row in edges:
        from_id = str(row.get("fromNodeId") or "")
        to_id = str(row.get("toNodeId") or "")
        if from_id not in nodes or to_id not in nodes:
            _topology_block(ledger, f"Canonical edge {row.get('id')} references a missing endpoint.")
        if from_id == to_id:
            _topology_block(ledger, f"Canonical edge {row.get('id')} is a self-loop.")
        if _distance(nodes[from_id]["position"], nodes[to_id]["position"]) == 0:
            _topology_block(ledger, f"Canonical edge {row.get('id')} is zero length.")
        entities = _string_array(row.get("sourceEntityIds"), "canonical edge sourceEntityIds", ledger)
        ports = _string_array(row.get("sourcePortIds"), "canonical edge sourcePortIds", ledger)
        if not entities or any(value not in entity_ids for value in entities):
            _topology_block(ledger, f"Canonical edge {row.get('id')} has invalid source entities.")
        if len(ports) < 2 or any(value not in port_ids for value in ports):
            _topology_block(ledger, f"Canonical edge {row.get('id')} lacks two valid endpoint-port ancestors.")
        endpoint_ports = set(nodes[from_id]["sourcePortIds"]) | set(nodes[to_id]["sourcePortIds"])
        if not set(ports).issubset(endpoint_ports):
            _topology_block(ledger, f"Canonical edge {row.get('id')} source ports disagree with endpoint groups.")
        input_ids = _string_array(row.get("inputXmlElementIds"), "canonical edge InputXML IDs", ledger)
        if len(input_ids) != 1:
            _topology_block(ledger, f"Canonical edge {row.get('id')} must own exactly one InputXML element.")
        cardinality = str(row.get("projectionCardinality") or "ONE_TO_ONE")
        merge_ids = _string_array(row.get("mergeSourceEntityIds") or [], "mergeSourceEntityIds", ledger)
        if cardinality == "MANY_TO_ONE":
            if len(merge_ids) < 2 or not str(row.get("projectionMergeAuthority") or ""):
                _topology_block(ledger, f"Managed merge {row.get('id')} lacks explicit participants or authority.")
            if not set(merge_ids).issubset(set(entities)):
                _topology_block(ledger, f"Managed merge {row.get('id')} loses source participants.")
        elif merge_ids:
            _topology_block(ledger, f"Canonical edge {row.get('id')} declares merge participants without MANY_TO_ONE.")


def _verify_special_objects(
    collections: dict[str, list[dict[str, Any]]],
    indexes: dict[str, dict[str, dict[str, Any]]],
    source: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    nodes = indexes["nodes"]
    edges = indexes["edges"]
    entities = set(source["entityById"])
    for name in ("junctions", "boundaries"):
        for row in collections[name]:
            if str(row.get("nodeId") or "") not in nodes:
                _topology_block(ledger, f"Canonical {name[:-1]} {row.get('id')} references a missing node.")
            _require_source_ancestry(row, entities, name, ledger)
            for edge_id in row.get("participatingEdgeIds") or []:
                if str(edge_id) not in edges:
                    _topology_block(ledger, f"Canonical {name[:-1]} {row.get('id')} references a missing edge.")
    for row in collections["pointFeatures"]:
        if not _point(row.get("position")):
            _topology_block(ledger, f"Point feature {row.get('id')} has invalid coordinates.")
        _require_source_ancestry(row, entities, "pointFeature", ledger)
    for support in collections["supports"]:
        node_id = str(support.get("nodeId") or "")
        if node_id not in nodes:
            _support_block(ledger, f"Support {support.get('id')} references a missing node.")
        _require_source_ancestry(support, entities, "support", ledger)
        if support.get("inputXmlNodeId") not in nodes[node_id].get("inputXmlNodeIds", []):
            _support_block(ledger, f"Support {support.get('id')} InputXML node ownership is inconsistent.")
        if not str(support.get("attachmentAuthority") or ""):
            _support_block(ledger, f"Support {support.get('id')} has no attachment authority.")
        if not _point(support.get("sourcePosition")) or not _point(support.get("attachmentPosition")):
            _support_block(ledger, f"Support {support.get('id')} lacks source/projected datum evidence.")
        if not math.isfinite(float(support.get("connectionResidual") or 0)):
            _support_block(ledger, f"Support {support.get('id')} residual is invalid.")
    for rigid in collections["rigids"]:
        if str(rigid.get("edgeId") or "") not in edges:
            _rigid_block(ledger, f"Rigid source {rigid.get('sourceEntityId')} references a missing edge.")
        if str(rigid.get("sourceEntityId") or "") not in entities:
            _rigid_block(ledger, "Canonical rigid references a missing source entity.")
        if str(rigid.get("assignmentAuthority") or "") == "GLOBAL_PROXIMITY_FALLBACK":
            _rigid_block(ledger, "Rigid assignment uses prohibited global proximity fallback.")
        weight = rigid.get("weightKg")
        if not isinstance(weight, (int, float)) or not math.isfinite(weight) or weight <= 0:
            _rigid_block(ledger, "Canonical rigid lacks an explicit positive weight.")
        if str(rigid.get("weightAuthority") or "") in {"", "MISSING"}:
            _rigid_block(ledger, "Canonical rigid lacks explicit weight authority.")


def _verify_trace(
    trace: dict[str, Any],
    source: dict[str, Any],
    collections: dict[str, list[dict[str, Any]]],
    ledger: DecisionLedger,
) -> dict[str, dict[str, Any]]:
    rows = _object_array(trace.get("records"), "traceLedger.records", ledger)
    ids = [str(row.get("sourceEntityId") or "") for row in rows]
    counts = Counter(ids)
    if any(not value for value in ids) or any(count > 1 for count in counts.values()):
        block(ledger, "MANAGED_STAGE_TRACE_RECORD_DUPLICATE", "Trace records contain duplicate source entity IDs.", "traceLedger.records")
    source_ids = set(source["entityById"])
    missing = sorted(source_ids - set(ids))
    extra = sorted(set(ids) - source_ids)
    if missing:
        block(ledger, "MANAGED_STAGE_TRACE_RECORD_MISSING", "Trace ledger omits source entities.", "traceLedger.records", missing=missing)
    if extra:
        block(ledger, "MANAGED_STAGE_TRACE_RECORD_EXTRA", "Trace ledger contains unknown source entities.", "traceLedger.records", extra=extra)
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        entity_id = str(row["sourceEntityId"])
        entity = source["entityById"][entity_id]
        for field in ("sourcePath", "sourceType", "sourceRef"):
            if row.get(field, "") != entity.get(field, ""):
                _trace_block(ledger, f"Trace {entity_id} field {field} differs from source authority.")
        expected = expected_trace_relation(entity_id, source, collections)
        for field in relation_fields():
            actual = row.get(field)
            wanted = expected[field]
            if isinstance(wanted, list):
                actual = _string_array(actual or [], f"trace {field}", ledger)
            if actual != wanted:
                _trace_block(ledger, f"Trace {entity_id} relation {field} differs from canonical ownership.")
        evidence = row.get("evidence")
        if not isinstance(evidence, dict) or str(evidence.get("mergeAuthority") or "") != expected["mergeAuthority"]:
            _trace_block(ledger, f"Trace {entity_id} mergeAuthority differs from canonical merge ownership.")
        result[entity_id] = row
    return result


def _port_dispositions(
    source: dict[str, Any],
    collections: dict[str, list[dict[str, Any]]],
    traces: dict[str, dict[str, Any]],
    ledger: DecisionLedger,
) -> dict[str, dict[str, Any]]:
    node_by_port = {
        str(port_id): node
        for node in collections["nodes"]
        for port_id in node.get("sourcePortIds") or []
    }
    junction_nodes = {str(row.get("nodeId") or "") for row in collections["junctions"]}
    boundary_nodes = {str(row.get("nodeId") or "") for row in collections["boundaries"]}
    support_nodes = {str(row.get("nodeId") or "") for row in collections["supports"]}
    point_entities = {
        str(entity_id)
        for row in collections["pointFeatures"]
        for entity_id in row.get("sourceEntityIds") or []
    }
    result: dict[str, dict[str, Any]] = {}
    for port in source["ports"]:
        port_id = str(port["sourcePortId"])
        entity_id = str(port["sourceEntityId"])
        trace = traces[entity_id]
        node = node_by_port.get(port_id)
        disposition = ""
        targets: list[str] = []
        if node:
            node_id = str(node["id"])
            targets = [node_id]
            if node_id in junction_nodes:
                disposition = "MAP_TO_JUNCTION"
            elif node_id in boundary_nodes:
                disposition = "MAP_TO_BOUNDARY"
            elif node_id in support_nodes:
                disposition = "MAP_TO_SUPPORT_ATTACHMENT"
            else:
                disposition = "MAP_TO_CANONICAL_NODE"
        elif entity_id in point_entities:
            disposition = "MAP_TO_POINT_FEATURE"
            targets = [
                str(row["id"])
                for row in collections["pointFeatures"]
                if entity_id in (row.get("sourceEntityIds") or [])
            ]
        elif trace.get("primaryDisposition") == "DEFER_SUPPORT" and trace.get("lossClassification") == "DEFERRED_NON_RESTRAINT_ATTACHMENT" and trace.get("status") == "ACCEPTED":
            disposition = "INTENTIONALLY_UNUSED_WITH_AUTHORITY"
        else:
            policy = component_policy(source["entityById"][entity_id]["sourceType"])
            if str(port.get("role") or "") in policy.intentionally_unused_ports:
                disposition = "INTENTIONALLY_UNUSED_WITH_AUTHORITY"
            else:
                block(
                    ledger,
                    "MANAGED_STAGE_SOURCE_PORT_ORPHAN",
                    f"Source port {port_id} has no canonical or intentional-nonprojection disposition.",
                    port["sourcePath"],
                )
        result[port_id] = {
            "sourcePortId": port_id,
            "sourceEntityId": entity_id,
            "sourcePath": port["sourcePath"],
            "disposition": disposition,
            "targetIds": targets,
        }
    return result


def _apply_component_policy(
    source: dict[str, Any],
    traces: dict[str, dict[str, Any]],
    collections: dict[str, list[dict[str, Any]]],
    ledger: DecisionLedger,
) -> None:
    bend_children = sum(
        1
        for row in collections["edges"]
        if str(row.get("segmentRole") or "").startswith("ELBO/BEND")
    )
    for entity_id, entity in source["entityById"].items():
        policy = component_policy(entity["sourceType"])
        trace = traces[entity_id]
        if trace.get("primaryDisposition") not in policy.trace_dispositions:
            _trace_block(ledger, f"Trace disposition for {entity['sourcePath']} violates component policy.")
        roles = {
            str(port["role"])
            for port in source["ports"]
            if port["sourceEntityId"] == entity_id
        }
        missing = sorted(set(policy.required_ports) - roles)
        if missing and policy.category not in {"BRANCH", "RIGID", "SUPPORT"}:
            _topology_block(ledger, f"{entity['sourcePath']} lacks required source ports {missing}.")
        if policy.category in {"ELBO/BEND", "TEE", "OLET", "VALVE", "FLANGE", "GASK", "INST", "REDUCER", "UNKNOWN"}:
            code = (
                "MANAGED_STAGE_BEND_PROJECTION_GAP"
                if policy.category == "ELBO/BEND" and bend_children
                else "MANAGED_STAGE_UNSUPPORTED_ENGINEERING"
            )
            retain_blocker(
                ledger,
                code,
                f"{policy.category} topology is retained but its production engineering projection is not authorized by PR-7.",
                entity["sourcePath"],
                category=policy.category,
            )


def _verify_build_issues(
    result_issues: list[Any],
    canonical_issues: list[Any],
    ledger: DecisionLedger,
) -> None:
    if result_issues != canonical_issues:
        _topology_block(ledger, "Bridge buildIssues differ from CanonicalTopology buildIssues.")
    blocking = [row for row in result_issues if isinstance(row, dict) and row.get("blocking") is not False]
    if blocking:
        _topology_block(ledger, "Canonical topology contains blocking build issues.")


def _require_source_ancestry(row: dict[str, Any], entities: set[str], name: str, ledger: DecisionLedger) -> None:
    values = _string_array(row.get("sourceEntityIds"), f"{name} sourceEntityIds", ledger)
    if not values or any(value not in entities for value in values):
        _topology_block(ledger, f"Canonical {name} {row.get('id')} has invalid source ancestry.")


def _object_array(value: Any, name: str, ledger: DecisionLedger) -> list[dict[str, Any]]:
    if not isinstance(value, list) or any(not isinstance(row, dict) for row in value):
        block(ledger, "MANAGED_STAGE_ARTIFACT_SCHEMA_INVALID", f"{name} must be an object array.", name)
    return value


def _string_array(value: Any, name: str, ledger: DecisionLedger) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(row, str) for row in value):
        _topology_block(ledger, f"{name} must be a string array.")
    if len(value) != len(set(value)):
        _topology_block(ledger, f"{name} contains duplicate values.")
    return value


def _point(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    try:
        return all(math.isfinite(float(value[axis])) for axis in ("x", "y", "z"))
    except (KeyError, TypeError, ValueError):
        return False


def _distance(left: dict[str, Any], right: dict[str, Any]) -> float:
    return math.sqrt(sum((float(right[axis]) - float(left[axis])) ** 2 for axis in ("x", "y", "z")))


def _topology_block(ledger: DecisionLedger, message: str) -> None:
    block(ledger, "MANAGED_STAGE_TOPOLOGY_RELATION_MISMATCH", message, "canonicalTopology")


def _trace_block(ledger: DecisionLedger, message: str) -> None:
    block(ledger, "MANAGED_STAGE_TRACE_RELATION_MISMATCH", message, "traceLedger")


def _support_block(ledger: DecisionLedger, message: str) -> None:
    block(ledger, "MANAGED_STAGE_SUPPORT_OWNERSHIP_UNRESOLVED", message, "canonicalTopology.supports")


def _rigid_block(ledger: DecisionLedger, message: str) -> None:
    block(ledger, "MANAGED_STAGE_RIGID_OWNERSHIP_UNRESOLVED", message, "canonicalTopology.rigids")


__all__ = ["verify_topology_and_trace"]
