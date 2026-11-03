#!/usr/bin/env python3
"""Strict restraint type, ownership, and cosine projection for PR-6."""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from lxml import etree as ET

from .base import DecisionLedger
from .topology_diagnostics import block
from .topology_engineering import decimal_value
from .topology_source_model import NodeOccurrence, RestraintOccurrence
from .xml import _decimal_text, _integer_text

_RESTRAINT_CODES = {
    "ANC": 1,
    "A": 1,
    "ANCHOR": 1,
    "FIXED": 1,
    "FIX": 1,
    "GUI": 8,
    "GUIDE": 8,
    "LIM": 9,
    "LIMIT": 9,
    "XSNB": 10,
    "YSNB": 11,
    "ZSNB": 12,
    "+X": 13,
    "+Y": 14,
    "+Z": 15,
    "-X": 16,
    "-Y": 17,
    "-Z": 18,
    "+RX": 19,
    "+RY": 20,
    "+RZ": 21,
    "-RX": 22,
    "-RY": 23,
    "-RZ": 24,
    "+LIM": 25,
    "-LIM": 26,
    "XROD": 27,
    "YROD": 28,
    "ZROD": 29,
    "+XROD": 30,
    "+YROD": 31,
    "+ZROD": 32,
    "-XROD": 33,
    "-YROD": 34,
    "-ZROD": 35,
    "X2": 36,
    "Y2": 37,
    "Z2": 38,
    "RX2": 39,
    "RY2": 40,
    "RZ2": 41,
    "+X2": 42,
    "+Y2": 43,
    "+Z2": 44,
    "-X2": 45,
    "-Y2": 46,
    "-Z2": 47,
    "+RX2": 48,
    "+RY2": 49,
    "+RZ2": 50,
    "-RX2": 51,
    "-RY2": 52,
    "-RZ2": 53,
    "XSPR": 54,
    "YSPR": 55,
    "ZSPR": 56,
    "+XSNB": 57,
    "+YSNB": 58,
    "+ZSNB": 59,
    "-XSNB": 60,
    "-YSNB": 61,
    "-ZSNB": 62,
    "X": 17,
    "Y": 19,
    "Z": 18,
}
_REQUIRED_FIELDS = {
    "Stiffness": "STIFFNESS",
    "Gap": "GAP",
    "Friction": "FRIC_COEF",
    "DirectionCosineX": "XCOSINE",
    "DirectionCosineY": "YCOSINE",
    "DirectionCosineZ": "ZCOSINE",
}


def attach_restraint(
    target: ET._Element,
    node: NodeOccurrence,
    restraint: RestraintOccurrence,
    *,
    slot: int,
    mapping: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    if slot > 6:
        block(
            ledger,
            "RESTRAINT_CARDINALITY_EXCEEDED",
            f"{target.get('ID')} exceeds six active restraint records.",
            restraint.path,
        )
    type_code, resolution = _restraint_type(restraint, ledger)
    values = _required_values(restraint, ledger)
    x, y, z = _transform_cosines(
        values["XCOSINE"],
        values["YCOSINE"],
        values["ZCOSINE"],
        restraint,
        ledger,
    )
    values.update({"XCOSINE": x, "YCOSINE": y, "ZCOSINE": z})
    attrs = {
        "NUM": str(slot),
        "NODE": str(node.node_number),
        "TYPE": str(type_code),
        "STIFFNESS": values["STIFFNESS"],
        "GAP": values["GAP"],
        "FRIC_COEF": values["FRIC_COEF"],
        "CNODE": "0",
        "XCOSINE": values["XCOSINE"],
        "YCOSINE": values["YCOSINE"],
        "ZCOSINE": values["ZCOSINE"],
    }
    for source_name, canonical_name in (("Tag", "TAG"), ("GUID", "GUID")):
        value = restraint.fields.get(source_name, "").strip()
        if value:
            attrs[canonical_name] = value
    ET.SubElement(target, "RESTRAINT", **attrs)
    _ledger_restraint(target, node, restraint, resolution, mapping, ledger)


def _required_values(
    restraint: RestraintOccurrence,
    ledger: DecisionLedger,
) -> dict[str, str]:
    values: dict[str, str] = {}
    for source_name, canonical_name in _REQUIRED_FIELDS.items():
        raw = restraint.fields.get(source_name, "").strip()
        if not raw:
            block(
                ledger,
                "RESTRAINT_TYPE_UNRESOLVED",
                f"{restraint.path} requires explicit {source_name}.",
                restraint.path,
            )
        values[canonical_name] = _decimal_text(
            raw,
            restraint.field_paths.get(source_name, restraint.path),
        )
    return values


def _ledger_restraint(
    target: ET._Element,
    node: NodeOccurrence,
    restraint: RestraintOccurrence,
    resolution: str,
    mapping: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    element_id = str(mapping["canonicalElementId"])
    ledger.add(
        source_entity_id=f"{restraint.path}/canonical-restraint",
        source_type="TOPOLOGY_RESTRAINT_MAPPING",
        source_fields={
            "sourcePath": restraint.path,
            "sourceName": restraint.source_name,
            "typeResolution": resolution,
            "ownershipRule": mapping["ownershipRule"],
            "slotAuthority": "SOURCE_OCCURRENCE_ORDER_WITHIN_OWNER",
            "connectingNodeAbsenceRepresentation": 0,
        },
        canonical_element_ids=[element_id],
        canonical_node_ids=[str(node.node_number)],
        inputxml_element_ids=[element_id],
        cii_section="RESTRANT",
        projection_cardinality="ATTACH_AUXILIARY",
        disposition="ATTACH_AUXILIARY",
        evidence=[
            "restraint ownership derives from containing source node and verified incident edge",
            "CNODE=0 represents absent optional connecting-node evidence",
            "no inactive padding records are emitted",
        ],
    )


def _restraint_type(
    restraint: RestraintOccurrence,
    ledger: DecisionLedger,
) -> tuple[int, str]:
    for field, resolution in (("Type", "type"), ("Direction", "direction")):
        raw = restraint.fields.get(field, "").strip().upper()
        if not raw:
            continue
        try:
            numeric = int(
                _integer_text(
                    raw,
                    restraint.field_paths.get(field, restraint.path),
                    positive=True,
                )
            )
        except Exception:
            numeric = _RESTRAINT_CODES.get(raw, 0)
        if 1 <= numeric <= 62:
            return numeric, resolution
    block(
        ledger,
        "RESTRAINT_TYPE_UNRESOLVED",
        f"{restraint.path} Type/Direction cannot be resolved to CII range 1..62.",
        restraint.path,
    )
    raise RuntimeError("unreachable")


def _transform_cosines(
    x: str,
    y: str,
    z: str,
    restraint: RestraintOccurrence,
    ledger: DecisionLedger,
) -> tuple[str, str, str]:
    source = tuple(Decimal(value) for value in (x, y, z))
    magnitude = sum(value * value for value in source)
    if not Decimal("0.9") < magnitude < Decimal("1.1"):
        block(
            ledger,
            "RESTRAINT_TYPE_UNRESOLVED",
            f"{restraint.path} direction-cosine vector is not approximately unit length.",
            restraint.path,
            magnitudeSquared=decimal_value(magnitude),
        )
    target = source[0], source[2], -source[1]
    return tuple(decimal_value(value) for value in target)


__all__ = ["attach_restraint"]
