#!/usr/bin/env python3
"""Reconcile and sanitize trace-bearing managed-stage PIPINGELEMENT records."""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from lxml import etree as ET

from .base import EXT_NS, DecisionLedger
from .extension import _extension_record
from .managed_stage_diagnostics import block
from .xml import _local, _namespace

_SENTINEL = Decimal("-1.0101")
_ELEMENT_TRACE = {
    "CANONICAL_EDGE_ID", "FROM_CANONICAL_NODE_ID", "TO_CANONICAL_NODE_ID",
    "SOURCE_ENTITY_IDS", "SOURCE_PORT_IDS", "FROM_SOURCE_ENTITY_IDS",
    "TO_SOURCE_ENTITY_IDS", "FROM_SOURCE_PORT_IDS", "TO_SOURCE_PORT_IDS",
    "BRANCH_IDS", "TOPOLOGY_OPERATION", "PROJECTION_CARDINALITY",
    "MERGE_AUTHORITY",
}
_ELEMENT_COMPAT = {
    "MODULUS", "POISSONS", "PIPE_DENSITY", "MATERIAL_NAME", "NAME",
    "GLOBAL_COORD_BASIS_NODE", "SOURCE_TYPE",
}
_ELEMENT_CANONICAL = {
    "ID", "FROM_NODE", "TO_NODE", "DELTA_X", "DELTA_Y", "DELTA_Z",
    "DIAMETER", "WALL_THICK", "INSUL_THICK", "CORR_ALLOW",
    *{f"TEMP_EXP_C{i}" for i in range(1, 10)},
    *{f"PRESSURE_C{i}" for i in range(1, 10)},
    "HYDRO_PRESSURE", "INSUL_DENSITY", "FLUID_DENSITY", "MATERIAL_NUM",
    "FROM_NAME", "TO_NAME", "LINE", "FROM_X", "FROM_Y", "FROM_Z",
    "TO_X", "TO_Y", "TO_Z",
}
_REQUIRED_NUMERIC = {
    "FROM_NODE", "TO_NODE", "DELTA_X", "DELTA_Y", "DELTA_Z",
    "DIAMETER", "WALL_THICK", "TEMP_EXP_C1", "PRESSURE_C1",
    "MATERIAL_NUM", "FROM_X", "FROM_Y", "FROM_Z", "TO_X", "TO_Y", "TO_Z",
}
_RESTRAINT_TRACE = {
    "SUPPORT_ID", "CANONICAL_NODE_ID", "SOURCE_ENTITY_IDS", "SOURCE_PATHS",
    "BRANCH_IDS", "ATTACHMENT_AUTHORITY", "ATTACHMENT_REFERENCES",
    "CONNECTION_RESIDUAL", "SOURCE_X", "SOURCE_Y", "SOURCE_Z",
    "ATTACHMENT_X", "ATTACHMENT_Y", "ATTACHMENT_Z",
}
_RIGID_TRACE = {
    "CANONICAL_EDGE_ID", "SOURCE_ENTITY_IDS", "SOURCE_PATHS", "BRANCH_IDS",
    "ASSIGNMENT_AUTHORITY", "WEIGHT_AUTHORITY", "CONNECTION_RESIDUAL",
}
_CHILD_CANONICAL = {
    "BEND": {
        "RADIUS", "TYPE", "ANGLE1", "NODE1", "ANGLE2", "NODE2",
        "ANGLE3", "NODE3", "NUM_MITER", "FITTINGTHICKNESS", "KFACTOR",
    },
    "RIGID": {"WEIGHT"},
    "RESTRAINT": {
        "NUM", "NODE", "TYPE", "STIFFNESS", "GAP", "FRIC_COEF", "CNODE",
        "XCOSINE", "YCOSINE", "ZCOSINE", "TAG", "GUID",
    },
}


def sanitize_element(
    element: ET._Element,
    edge: dict[str, Any],
    parsed: dict[str, Any],
    node_index: dict[str, dict[str, Any]],
    ledger: DecisionLedger,
) -> None:
    _verify_trace(element, edge, node_index, parsed, ledger)
    _apply_aliases(element, ledger)
    for name in list(element.attrib):
        value = element.get(name) or ""
        if name in _ELEMENT_TRACE:
            _retain(element, name, value, "TRACE_RECONCILED", ledger)
            del element.attrib[name]
        elif name in _ELEMENT_COMPAT:
            _retain(element, name, value, "COMPATIBILITY_EVIDENCE", ledger)
            del element.attrib[name]
        elif name not in _ELEMENT_CANONICAL:
            _inputxml_block(ledger, f"Element {element.get('ID')} has unknown attribute {name}.")
    _normalize_element_values(element, ledger)
    _sanitize_children(element, parsed, ledger)


def _verify_trace(
    element: ET._Element,
    edge: dict[str, Any],
    nodes: dict[str, dict[str, Any]],
    parsed: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    from_node = nodes[str(edge["fromNodeId"])]
    to_node = nodes[str(edge["toNodeId"])]
    expected = {
        "CANONICAL_EDGE_ID": str(edge["id"]),
        "FROM_CANONICAL_NODE_ID": str(edge["fromNodeId"]),
        "TO_CANONICAL_NODE_ID": str(edge["toNodeId"]),
        "SOURCE_ENTITY_IDS": _csv(edge.get("sourceEntityIds")),
        "SOURCE_PORT_IDS": _csv(edge.get("sourcePortIds")),
        "FROM_SOURCE_ENTITY_IDS": _csv(from_node.get("sourceEntityIds")),
        "TO_SOURCE_ENTITY_IDS": _csv(to_node.get("sourceEntityIds")),
        "FROM_SOURCE_PORT_IDS": _csv(from_node.get("sourcePortIds")),
        "TO_SOURCE_PORT_IDS": _csv(to_node.get("sourcePortIds")),
        "BRANCH_IDS": _csv(edge.get("branchIds") or edge.get("sourceBranchEntityIds")),
        "TOPOLOGY_OPERATION": str(edge.get("topologyOperation") or edge.get("segmentRole") or ""),
        "PROJECTION_CARDINALITY": str(edge.get("projectionCardinality") or "ONE_TO_ONE"),
        "MERGE_AUTHORITY": str(edge.get("projectionMergeAuthority") or ""),
    }
    for name, value in expected.items():
        if element.get(name, "") != value:
            _inputxml_block(
                ledger,
                f"Element {element.get('ID')} trace attribute {name} contradicts canonical topology.",
            )
    if parsed.get("canonicalEdgeId") != edge["id"]:
        _inputxml_block(ledger, f"Parsed element {element.get('ID')} has wrong canonical edge ID.")


def _apply_aliases(element: ET._Element, ledger: DecisionLedger) -> None:
    aliases = {
        "LINE_ID": "LINE",
        "FROM_GLOBAL_X": "FROM_X", "FROM_GLOBAL_Y": "FROM_Y",
        "FROM_GLOBAL_Z": "FROM_Z", "TO_GLOBAL_X": "TO_X",
        "TO_GLOBAL_Y": "TO_Y", "TO_GLOBAL_Z": "TO_Z",
        **{f"PRESSURE{i}": f"PRESSURE_C{i}" for i in range(1, 10)},
    }
    for source_name, target_name in aliases.items():
        if source_name not in element.attrib:
            continue
        value = element.attrib.pop(source_name)
        if target_name in element.attrib and not same_decimal(element.get(target_name), value):
            _inputxml_block(
                ledger,
                f"Element {element.get('ID')} alias {source_name}/{target_name} conflicts.",
            )
        element.set(target_name, value)
        _retain(element, source_name, value, "ALIAS_RENAMED", ledger)


def _normalize_element_values(
    element: ET._Element,
    ledger: DecisionLedger,
) -> None:
    for name in list(element.attrib):
        value = element.get(name) or ""
        if name in {"FROM_NODE", "TO_NODE", "MATERIAL_NUM"}:
            if is_sentinel(value):
                _inputxml_block(ledger, f"Element {element.get('ID')} required {name} uses a sentinel.")
            element.set(name, integer_lexical(value, f"{element.get('ID')}@{name}", ledger, positive=True))
        elif name in {"ID", "FROM_NAME", "TO_NAME", "LINE"}:
            if name == "LINE" and not value.strip():
                _inputxml_block(ledger, f"Element {element.get('ID')} has no line identity.")
        elif is_sentinel(value):
            if name in _REQUIRED_NUMERIC:
                _inputxml_block(ledger, f"Element {element.get('ID')} required {name} uses a sentinel.")
            _retain(element, name, value, "EXPLICIT_SOURCE_ABSENCE", ledger)
            del element.attrib[name]
        else:
            element.set(name, decimal_lexical(value, f"{element.get('ID')}@{name}", ledger))


def _sanitize_children(
    element: ET._Element,
    parsed: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    parsed_children = {
        str(row.get("id") or ""): row
        for field in ("restraints", "rigids", "otherChildren")
        for row in parsed.get(field) or []
    }
    for child in list(element):
        name = _local(child.tag)
        if _namespace(child.tag) == EXT_NS:
            continue
        if name not in _CHILD_CANONICAL:
            _inputxml_block(ledger, f"Element {element.get('ID')} has unsupported child {name}.")
        child_id = str(child.get("ID") or "")
        parsed_child = parsed_children.get(child_id)
        if parsed_child is None or dict(child.attrib) != parsed_child.get("attributes"):
            _inputxml_block(ledger, f"Child {child_id or name} differs from parsed topology evidence.")
        _strip_child_evidence(element, child, name, ledger)
        _normalize_child(child, name, child_id or name, ledger)


def _strip_child_evidence(
    owner: ET._Element,
    child: ET._Element,
    name: str,
    ledger: DecisionLedger,
) -> None:
    trace = _RESTRAINT_TRACE if name == "RESTRAINT" else _RIGID_TRACE if name == "RIGID" else set()
    evidence = {"ID", *trace}
    if name == "BEND":
        evidence.add("RADIUS_AUTHORITY")
    if name == "RIGID":
        evidence.update({"TYPE", "SOURCE_BODY_COUNT"})
    for attr in list(child.attrib):
        value = child.get(attr) or ""
        if attr in evidence:
            _retain(owner, f"{name}.{attr}", value, "CHILD_EVIDENCE_RECONCILED", ledger)
            del child.attrib[attr]
        elif attr not in _CHILD_CANONICAL[name]:
            _inputxml_block(ledger, f"Child {child.get('ID') or name} has unknown attribute {attr}.")


def _normalize_child(
    child: ET._Element,
    name: str,
    identity: str,
    ledger: DecisionLedger,
) -> None:
    integer_fields = {
        "NUM", "NODE", "TYPE", "CNODE", "NODE1", "NODE2", "NODE3", "NUM_MITER",
    }
    for attr in list(child.attrib):
        value = child.get(attr) or ""
        if attr in integer_fields:
            if is_sentinel(value):
                if name == "RESTRAINT" and attr == "CNODE":
                    child.set(attr, "0")
                elif name == "BEND" and attr in {"TYPE", "NODE2", "NODE3", "NUM_MITER"}:
                    del child.attrib[attr]
                else:
                    _inputxml_block(ledger, f"Child {identity} required {attr} uses a sentinel.")
            else:
                child.set(
                    attr,
                    integer_lexical(
                        value,
                        f"{identity}@{attr}",
                        ledger,
                        positive=attr not in {"CNODE", "NUM_MITER"},
                    ),
                )
        elif attr not in {"TAG", "GUID"}:
            if is_sentinel(value):
                if attr in {"RADIUS", "WEIGHT", "STIFFNESS"}:
                    _inputxml_block(ledger, f"Child {identity} required {attr} uses a sentinel.")
                del child.attrib[attr]
            else:
                child.set(attr, decimal_lexical(value, f"{identity}@{attr}", ledger))


def _retain(
    owner: ET._Element,
    name: str,
    value: str,
    reason: str,
    ledger: DecisionLedger,
) -> None:
    _extension_record(
        owner,
        producer=ledger.producer,
        dialect="managed-stage-json",
        name="ManagedStageTopologyInputXmlAttribute",
        source_path=ledger.source_path,
        source_entity_id=f"topologyInputXml::{owner.get('ID') or _local(owner.tag)}@{name}",
        source_field=name,
        value=value,
        disposition="PRESERVE_EXTENSION",
        criticality="MEDIUM",
        confidence=1.0,
    )


def integer_lexical(
    value: Any,
    field: str,
    ledger: DecisionLedger,
    *,
    positive: bool,
) -> str:
    try:
        number = Decimal(str(value))
        integral = number.to_integral_value()
    except InvalidOperation:
        _inputxml_block(ledger, f"{field} is not integer-like.")
    if (
        not number.is_finite()
        or number != integral
        or (positive and integral <= 0)
        or (not positive and integral < 0)
    ):
        _inputxml_block(ledger, f"{field} is outside its integer contract.")
    return str(int(integral))


def decimal_lexical(value: Any, field: str, ledger: DecisionLedger) -> str:
    try:
        number = Decimal(str(value))
    except InvalidOperation:
        _inputxml_block(ledger, f"{field} is not a finite decimal.")
    if not number.is_finite():
        _inputxml_block(ledger, f"{field} is not a finite decimal.")
    if number == 0:
        return "0"
    text = format(number, "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def is_sentinel(value: Any) -> bool:
    try:
        return Decimal(str(value)) == _SENTINEL
    except InvalidOperation:
        return False


def same_decimal(left: Any, right: Any) -> bool:
    try:
        return Decimal(str(left)) == Decimal(str(right))
    except InvalidOperation:
        return str(left).strip() == str(right).strip()


def _csv(value: Any) -> str:
    return ",".join(str(item) for item in (value or []))


def _inputxml_block(ledger: DecisionLedger, message: str) -> None:
    block(ledger, "MANAGED_STAGE_INPUTXML_RELATION_MISMATCH", message, "topologyInputXml")


__all__ = [
    "decimal_lexical",
    "integer_lexical",
    "is_sentinel",
    "same_decimal",
    "sanitize_element",
]
