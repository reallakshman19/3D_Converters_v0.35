from __future__ import annotations

from typing import Any

from .base import CompileBlocked, Decimal, DecisionLedger, ET
from .counts import _new_root
from . import pdf_input_echo as _implementation

_COORD_FIELDS = ("FROM_X", "FROM_Y", "FROM_Z", "TO_X", "TO_Y", "TO_Z")
_TOLERANCE_MM = Decimal("0.001")


def _node_id(value: Any, field: str) -> str:
    try:
        number = Decimal(str(value))
    except Exception as exc:
        raise CompileBlocked(f"PDF coordinate anchor {field} has invalid node {value!r}.") from exc
    integral = number.to_integral_value()
    if number != integral or integral <= 0:
        raise CompileBlocked(f"PDF coordinate anchor {field} requires a positive integer node.")
    return str(int(integral))


def _point(value: Any, field: str) -> tuple[Decimal, Decimal, Decimal]:
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        raise CompileBlocked(f"PDF coordinate anchor {field} requires [x,y,z].")
    try:
        point = tuple(Decimal(str(component)) for component in value)
    except Exception as exc:
        raise CompileBlocked(f"PDF coordinate anchor {field} contains a non-numeric coordinate.") from exc
    if not all(component.is_finite() for component in point):
        raise CompileBlocked(f"PDF coordinate anchor {field} contains a non-finite coordinate.")
    return point  # type: ignore[return-value]


def _same_point(left: tuple[Decimal, Decimal, Decimal], right: tuple[Decimal, Decimal, Decimal]) -> bool:
    return all(abs(a - b) <= _TOLERANCE_MM for a, b in zip(left, right))


def _apply_coordinate_anchors(root: ET._Element, context: dict[str, Any], ledger: DecisionLedger) -> None:
    raw_anchors = context.get("coordinateAnchors")
    if raw_anchors is None:
        return
    if not isinstance(raw_anchors, dict) or not raw_anchors:
        raise CompileBlocked("PDF coordinateAnchors must be a non-empty node->[x,y,z] object.")

    positions: dict[str, tuple[Decimal, Decimal, Decimal]] = {}
    for raw_node, raw_point in raw_anchors.items():
        node = _node_id(raw_node, "node")
        point = _point(raw_point, node)
        if node in positions and not _same_point(positions[node], point):
            raise CompileBlocked(f"PDF coordinate anchor node {node} has conflicting points.")
        positions[node] = point

    model = next(
        child for child in root
        if ET.QName(child.tag).localname == "PIPINGMODEL" and not (ET.QName(child.tag).namespace or "")
    )
    elements = [
        child for child in model
        if ET.QName(child.tag).localname == "PIPINGELEMENT" and not (ET.QName(child.tag).namespace or "")
    ]
    edges: list[tuple[ET._Element, str, str, tuple[Decimal, Decimal, Decimal]]] = []
    for element in elements:
        from_node = _node_id(element.get("FROM_NODE"), "FROM_NODE")
        to_node = _node_id(element.get("TO_NODE"), "TO_NODE")
        delta = tuple(
            Decimal(str(element.get(field) or "0"))
            for field in ("DELTA_X", "DELTA_Y", "DELTA_Z")
        )
        edges.append((element, from_node, to_node, delta))  # type: ignore[arg-type]

    changed = True
    while changed:
        changed = False
        for _, from_node, to_node, delta in edges:
            from_point = positions.get(from_node)
            to_point = positions.get(to_node)
            if from_point is not None and to_point is None:
                positions[to_node] = tuple(value + step for value, step in zip(from_point, delta))  # type: ignore[assignment]
                changed = True
            elif to_point is not None and from_point is None:
                positions[from_node] = tuple(value - step for value, step in zip(to_point, delta))  # type: ignore[assignment]
                changed = True
            elif from_point is not None and to_point is not None:
                expected = tuple(value + step for value, step in zip(from_point, delta))
                if not _same_point(expected, to_point):
                    raise CompileBlocked(
                        f"PDF coordinate anchors conflict with element {from_node}->{to_node} delta."
                    )

    required_nodes = {node for _, from_node, to_node, _ in edges for node in (from_node, to_node)}
    unresolved = sorted(required_nodes - set(positions), key=int)
    if unresolved:
        raise CompileBlocked(
            "PDF coordinate anchors do not resolve every connected component; "
            f"missing anchor reachability for nodes {unresolved}."
        )

    node_names = context.get("nodeNames")
    if node_names is not None and not isinstance(node_names, dict):
        raise CompileBlocked("PDF nodeNames must be a node->name object when supplied.")
    node_names = node_names or {}
    for element, from_node, to_node, _ in edges:
        from_point = positions[from_node]
        to_point = positions[to_node]
        for field, value in zip(_COORD_FIELDS, (*from_point, *to_point)):
            element.set(field, _implementation._decimal_text(value, f"PDF {field}"))
        if str(node_names.get(from_node) or "").strip():
            element.set("FROM_NAME", str(node_names[from_node]).strip())
        if str(node_names.get(to_node) or "").strip():
            element.set("TO_NAME", str(node_names[to_node]).strip())

    element_ids = [str(element.get("ID") or "") for element in elements]
    ledger.add(
        source_entity_id="pdf-coordinate-anchors",
        source_type="PDF_EXPLICIT_COORDINATE_ANCHORS",
        source_fields={
            "anchors": {node: [str(value) for value in point] for node, point in sorted(positions.items(), key=lambda row: int(row[0]))},
            "inputAnchors": sorted(str(node) for node in raw_anchors),
        },
        canonical_element_ids=element_ids,
        canonical_node_ids=sorted(required_nodes, key=int),
        inputxml_element_ids=element_ids,
        cii_section="COORDS",
        projection_cardinality="MANY_TO_MANY",
        disposition="PROJECT_EXPLICIT_COORDINATE_ANCHORS",
        evidence=[
            "caller-supplied coordinateAnchors",
            "coordinates propagated only through explicit PDF Input Echo element deltas",
            "every connected component requires at least one explicit anchor",
        ],
    )


def _compile_pdf_input_echo_source(
    source: bytes,
    *,
    source_name: str,
    ledger: DecisionLedger,
    context: dict[str, Any],
) -> ET._Element:
    _implementation._new_root = _new_root
    root = _implementation._compile_pdf_input_echo_source(
        source,
        source_name=source_name,
        ledger=ledger,
        context=context,
    )
    _apply_coordinate_anchors(root, context, ledger)
    return root


__all__ = ["_compile_pdf_input_echo_source"]
