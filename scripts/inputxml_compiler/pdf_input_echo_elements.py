from __future__ import annotations

from typing import Any

from .base import DecisionLedger, Decimal, ET
from .extension import _ensure_extension_last
from .pdf_input_echo_auxiliary import (
    append_pdf_bend,
    append_pdf_rigid,
    preserve_incomplete_auxiliaries,
    preserve_report_record,
)
from .xml import _decimal_text, _integer_text


def build_pdf_element(row: dict[str, Any], ledger: DecisionLedger) -> ET._Element:
    element = row["element"]
    block = row["block"]
    block_index = int(row["blockIndex"])
    block_id = str(row["blockId"])
    entity_id = str(row["entityId"])
    scope = row["lineScope"]
    target = ET.Element(
        "PIPINGELEMENT",
        ID=entity_id,
        FROM_NODE=_integer_text(element.from_node, f"{entity_id}@FROM_NODE", positive=True),
        TO_NODE=_integer_text(element.to_node, f"{entity_id}@TO_NODE", positive=True),
        LINE=str(scope["lineId"]),
    )
    _set_geometry(target, element, row, ledger)
    for field, value in row["stateValues"].items():
        target.set(field, value)
    target.set(
        "MATERIAL_NUM",
        _integer_text(
            target.get("MATERIAL_NUM"),
            f"{entity_id}@MATERIAL_NUM",
            nonnegative=True,
        ),
    )
    _preserve_mechanical(
        target,
        row["mechanicalValues"],
        ledger,
        entity_id,
    )
    if element.name:
        preserve_report_record(
            target,
            name="PdfElementName",
            value=element.name,
            ledger=ledger,
            entity_id=entity_id,
        )
    if element.bend is not None:
        append_pdf_bend(target, element.bend, ledger, entity_id)
    append_pdf_rigid(target, element, ledger, entity_id)
    preserve_incomplete_auxiliaries(target, element, ledger, entity_id)
    _ensure_extension_last(target)
    ledger.add(
        source_entity_id=block_id,
        source_type="PDF_PIPE_DATA_BLOCK",
        source_fields={
            "blockIndex": block_index,
            "blockId": block_id,
            "header": block["header"],
            "lines": list(block.get("lines") or []),
            "lineScopeId": scope["lineScopeId"],
            "lineId": scope["lineId"],
        },
        canonical_element_ids=[entity_id],
        inputxml_element_ids=[entity_id],
        projection_cardinality="1_TO_1",
        disposition="PARSE_AUTHORITATIVE_INPUT_ECHO_GRAMMAR",
    )
    ledger.add(
        source_entity_id=entity_id,
        source_type="PDF_PIPE_DATA_ELEMENT",
        source_fields={
            "sourceBlockId": block_id,
            "lineScopeId": scope["lineScopeId"],
            "lineId": scope["lineId"],
            "explicitFields": row["explicitFields"],
            "fromNode": element.from_node,
            "toNode": element.to_node,
            "axisPresent": list(element.axis_present),
        },
        canonical_element_ids=[entity_id],
        canonical_node_ids=[target.get("FROM_NODE"), target.get("TO_NODE")],
        inputxml_element_ids=[entity_id],
        cii_section="ELEMENTS",
        projection_cardinality="1_TO_1",
        disposition="EMIT_1_TO_1",
    )
    return target


def set_pdf_counts(model: ET._Element, resolved: list[dict[str, Any]]) -> None:
    counts = {
        "NUMELT": len(resolved),
        "NUMNOZ": 0,
        "NOHGRS": 0,
        "NUMBEND": sum(1 for row in resolved if row["element"].bend is not None),
        "NUMRIGID": sum(
            1 for row in resolved if row["element"].rigid_weight_kg is not None
        ),
        "NUMEXPJNT": 0,
        "NUMREST": 0,
        "NUMFORCMNT": 0,
        "NUMUNFLOAD": 0,
        "NUMWIND": 0,
        "NUMELEOFF": 0,
        "NUMALLOW": 0,
        "NUMISECT": 0,
    }
    for field, value in counts.items():
        model.set(field, str(value))


def _set_geometry(
    target: ET._Element,
    element: Any,
    row: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    explicit = set(row["explicitFields"])
    entity_id = str(row["entityId"])
    scope = row["lineScope"]
    for axis, value in (
        ("DELTA_X", element.delta_x_mm),
        ("DELTA_Y", element.delta_y_mm),
        ("DELTA_Z", element.delta_z_mm),
    ):
        if axis in explicit:
            target.set(axis, _decimal_text(value, f"{entity_id}@{axis}"))
            continue
        target.set(axis, "0")
        ledger.add(
            source_entity_id=f"{entity_id}@{axis}",
            source_type="PDF_OMITTED_DELTA_AXIS",
            source_fields={
                "axis": axis,
                "sourceBlockId": row["blockId"],
                "lineScopeId": scope["lineScopeId"],
                "lineId": scope["lineId"],
                "normalizationPolicy": "OMITTED_AXIS_IS_ZERO_V1",
            },
            canonical_element_ids=[entity_id],
            canonical_node_ids=[target.get("FROM_NODE"), target.get("TO_NODE")],
            cii_section="ELEMENTS",
            projection_cardinality="1_TO_1",
            disposition="NORMALIZE_EXPLICIT_ABSENCE",
            evidence=["profile-defined omitted delta axis normalization"],
        )
    if all(
        Decimal(target.get(field)) == 0
        for field in ("DELTA_X", "DELTA_Y", "DELTA_Z")
    ):
        ledger.add(
            source_entity_id=entity_id,
            source_type="PDF_ZERO_LENGTH_ELEMENT",
            source_fields={
                "sourceBlockId": row["blockId"],
                "lineScopeId": scope["lineScopeId"],
            },
            canonical_element_ids=[entity_id],
            projection_cardinality="1_TO_0",
            disposition="UNSUPPORTED_BLOCKING",
            diagnostics=["Input Echo element resolves to zero-length geometry"],
        )


def _preserve_mechanical(
    target: ET._Element,
    mechanical: dict[str, str],
    ledger: DecisionLedger,
    entity_id: str,
) -> None:
    for name, value in mechanical.items():
        preserve_report_record(
            target,
            name=f"Pdf{name}",
            value=value,
            ledger=ledger,
            entity_id=entity_id,
        )


__all__ = ["build_pdf_element", "set_pdf_counts"]
