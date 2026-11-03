#!/usr/bin/env python3
"""Auxiliary normalization for PR-5 InputXML-family profiles."""
from __future__ import annotations

from lxml import etree as ET

from .base import CompileBlocked, DecisionLedger
from .extension import _preserve_attr, _preserve_child
from .xml import (
    _decimal,
    _decimal_text,
    _integer_text,
    _is_sentinel,
    _local,
    _same_numeric,
)


def normalize_family_auxiliary(
    source: ET._Element,
    *,
    target: ET._Element,
    element_id: str,
    source_entity_id: str,
    ledger: DecisionLedger,
) -> None:
    name = _local(source.tag)
    if name == "BEND":
        _normalize_bend(source, target, element_id, source_entity_id, ledger)
    elif name == "RIGID":
        _normalize_rigid(source, target, element_id, source_entity_id, ledger)
    elif name == "SIF":
        _normalize_sif(source, target, element_id, source_entity_id, ledger)
    elif name == "RESTRAINT":
        _normalize_restraint(source, target, element_id, source_entity_id, ledger)
    elif name == "HANGER":
        _normalize_hanger(source, target, element_id, source_entity_id, ledger)
    else:
        raise CompileBlocked(f"Internal family resolver error: unsupported auxiliary {name}.")


def preserve_unresolved_nozzle(
    source: ET._Element,
    *,
    model: ET._Element,
    source_entity_id: str,
    ledger: DecisionLedger,
) -> None:
    _preserve_child(
        model,
        source,
        ledger.source_path,
        source_entity_id,
        ledger,
        blocking=True,
    )
    ledger.diagnostic(
        "BLOCKING",
        "NOZZLE_MAPPING_UNRESOLVED",
        "Nozzle family evidence is retained, but named-field to 22-slot mapping is not authoritative in PR-5.",
        source_entity_id,
        family=_local(source.tag),
    )


def _normalize_bend(
    source: ET._Element,
    target: ET._Element,
    element_id: str,
    source_entity_id: str,
    ledger: DecisionLedger,
) -> None:
    radius = source.get("RADIUS")
    if radius is None or _is_sentinel(radius) or _decimal(radius, "BEND@RADIUS") <= 0:
        _block(ledger, "UNSUPPORTED_ENGINEERING_FIELD", f"{source_entity_id} requires explicit positive RADIUS.", source_entity_id)
    out = ET.Element("BEND", RADIUS=_decimal_text(radius, "BEND@RADIUS"))
    integer_fields = {"TYPE", "NUM_MITER"}
    node_fields = {"NODE1", "NODE2", "NODE3"}
    decimal_fields = {
        "ANGLE1", "ANGLE2", "ANGLE3", "FITTINGTHICKNESS", "KFACTOR"
    }
    allowed = {"RADIUS", *integer_fields, *node_fields, *decimal_fields}
    for attr in (
        "TYPE", "ANGLE1", "NODE1", "ANGLE2", "NODE2", "ANGLE3",
        "NUM_MITER", "FITTINGTHICKNESS", "KFACTOR",
    ):
        value = source.get(attr)
        if value is None or _is_sentinel(value):
            continue
        if attr in node_fields:
            out.set(attr, _integer_text(value, f"BEND@{attr}", positive=True))
        elif attr in integer_fields:
            out.set(attr, _integer_text(value, f"BEND@{attr}"))
        else:
            out.set(attr, _decimal_text(value, f"BEND@{attr}"))
    for attr, value in source.attrib.items():
        if attr not in allowed:
            _preserve_attr(target, ledger.source_path, source_entity_id, attr, value, ledger, blocking=True)
    target.append(out)
    _ledger_auxiliary(ledger, source_entity_id, "BEND", source, element_id, "BEND")


def _normalize_rigid(
    source: ET._Element,
    target: ET._Element,
    element_id: str,
    source_entity_id: str,
    ledger: DecisionLedger,
) -> None:
    weight = source.get("WEIGHT")
    if weight is None or _is_sentinel(weight):
        _block(ledger, "UNSUPPORTED_ENGINEERING_FIELD", f"{source_entity_id} requires explicit WEIGHT.", source_entity_id)
    if _decimal(weight, "RIGID@WEIGHT") < 0:
        _block(ledger, "UNSUPPORTED_ENGINEERING_FIELD", f"{source_entity_id} WEIGHT cannot be negative.", source_entity_id)
    out = ET.Element("RIGID", WEIGHT=_decimal_text(weight, "RIGID@WEIGHT"))
    for attr, value in source.attrib.items():
        if attr == "WEIGHT":
            continue
        _preserve_attr(
            target,
            ledger.source_path,
            source_entity_id,
            attr,
            value,
            ledger,
            blocking=attr != "TYPE",
        )
    target.append(out)
    _ledger_auxiliary(ledger, source_entity_id, "RIGID", source, element_id, "RIGID")


def _normalize_sif(
    source: ET._Element,
    target: ET._Element,
    element_id: str,
    source_entity_id: str,
    ledger: DecisionLedger,
) -> None:
    node = source.get("NODE")
    if node is not None and _is_sentinel(node):
        _preserve_child(target, source, ledger.source_path, source_entity_id, ledger, blocking=False)
        ledger.add(
            source_entity_id=source_entity_id,
            source_type="INACTIVE_SIF_SENTINEL",
            source_fields=dict(source.attrib),
            canonical_element_ids=[element_id],
            inputxml_element_ids=[element_id],
            projection_cardinality="1_TO_0",
            disposition="PRESERVE_EXTENSION",
            evidence=["SIF NODE sentinel marks an inactive intake record"],
        )
        return
    if node is None:
        _block(ledger, "UNSUPPORTED_ENGINEERING_FIELD", f"{source_entity_id} requires explicit NODE.", source_entity_id)
    if target.find("SIF") is not None:
        _block(
            ledger,
            "COUNT_AUTHORITY_UNRESOLVED",
            f"{source_entity_id} is an additional active SIF record; the unchanged writer has no proven independent projection for it.",
            source_entity_id,
        )
    out = ET.Element("SIF", NODE=_integer_text(node, "SIF@NODE", positive=True))
    for attr, value in source.attrib.items():
        if attr != "NODE" and not _is_sentinel(value):
            _preserve_attr(target, ledger.source_path, source_entity_id, attr, value, ledger, blocking=True)
    target.append(out)
    _ledger_auxiliary(ledger, source_entity_id, "SIF", source, element_id, "SIF&TEES")


def _normalize_restraint(
    source: ET._Element,
    target: ET._Element,
    element_id: str,
    source_entity_id: str,
    ledger: DecisionLedger,
) -> None:
    required = (
        "NUM", "NODE", "TYPE", "STIFFNESS", "GAP", "CNODE",
        "XCOSINE", "YCOSINE", "ZCOSINE",
    )
    values: dict[str, str] = {}
    for field in required:
        raw = source.get(field)
        if raw is None or _is_sentinel(raw):
            _block(
                ledger,
                "UNSUPPORTED_ENGINEERING_FIELD",
                f"{source_entity_id} requires explicit {field}; compatibility defaults are not canonical.",
                source_entity_id,
            )
        values[field] = raw
    friction = source.get("FRIC_COEF")
    alias = source.get("MU")
    if friction is not None and alias is not None and not _same_numeric(friction, alias):
        _block(ledger, "ALIAS_VALUE_CONFLICT", f"{source_entity_id} has conflicting FRIC_COEF and MU.", source_entity_id)
    friction = friction if friction is not None else alias
    if friction is None or _is_sentinel(friction):
        _block(ledger, "UNSUPPORTED_ENGINEERING_FIELD", f"{source_entity_id} requires explicit FRIC_COEF/MU.", source_entity_id)
    out = ET.Element(
        "RESTRAINT",
        NUM=_integer_text(values["NUM"], "RESTRAINT@NUM", positive=True),
        NODE=_integer_text(values["NODE"], "RESTRAINT@NODE", positive=True),
        TYPE=_integer_text(values["TYPE"], "RESTRAINT@TYPE", positive=True),
        STIFFNESS=_decimal_text(values["STIFFNESS"], "RESTRAINT@STIFFNESS"),
        GAP=_decimal_text(values["GAP"], "RESTRAINT@GAP"),
        FRIC_COEF=_decimal_text(friction, "RESTRAINT@FRIC_COEF"),
        CNODE=_integer_text(values["CNODE"], "RESTRAINT@CNODE", nonnegative=True),
        XCOSINE=_decimal_text(values["XCOSINE"], "RESTRAINT@XCOSINE"),
        YCOSINE=_decimal_text(values["YCOSINE"], "RESTRAINT@YCOSINE"),
        ZCOSINE=_decimal_text(values["ZCOSINE"], "RESTRAINT@ZCOSINE"),
    )
    if int(out.get("NUM")) > 6:
        _block(ledger, "UNSUPPORTED_ENGINEERING_FIELD", f"{source_entity_id} NUM exceeds canonical capacity 6.", source_entity_id)
    if int(out.get("TYPE")) > 62:
        _block(ledger, "UNSUPPORTED_ENGINEERING_FIELD", f"{source_entity_id} TYPE exceeds CII range 62.", source_entity_id)
    for optional in ("TAG", "GUID"):
        if source.get(optional) is not None:
            out.set(optional, source.get(optional) or "")
    allowed = {*required, "FRIC_COEF", "MU", "TAG", "GUID"}
    for attr, value in source.attrib.items():
        if attr not in allowed:
            _preserve_attr(target, ledger.source_path, source_entity_id, attr, value, ledger, blocking=True)
    target.append(out)
    _ledger_auxiliary(ledger, source_entity_id, "RESTRAINT", source, element_id, "RESTRANT")


def _normalize_hanger(
    source: ET._Element,
    target: ET._Element,
    element_id: str,
    source_entity_id: str,
    ledger: DecisionLedger,
) -> None:
    fields = (
        "NODE", "STIFFNESS", "LOAD_VAR", "OPERATING_LOAD", "RIGID_SUP",
        "AVAIL_SPACE", "COLD_LOAD", "HOT_LOAD", "MAX_TRAVEL",
        "HARDWARE_WEIGHT", "CONST_EFF_LOAD", "MULTI_LC", "FREEANCHOR1",
        "FREEANCHOR2", "DOFTYPE1", "NUM_HGR", "HGR_TABLE", "SHORT_RANGE",
        "CNODE",
    )
    for field in fields:
        raw = source.get(field)
        if raw is None or _is_sentinel(raw):
            _block(
                ledger,
                "UNSUPPORTED_ENGINEERING_FIELD",
                f"{source_entity_id} requires explicit {field}; compatibility defaults are not canonical.",
                source_entity_id,
            )
    integer_fields = {
        "NODE", "MULTI_LC", "FREEANCHOR1", "FREEANCHOR2", "DOFTYPE1",
        "NUM_HGR", "HGR_TABLE", "SHORT_RANGE", "CNODE",
    }
    nonnegative_fields = {"FREEANCHOR1", "FREEANCHOR2", "NUM_HGR", "HGR_TABLE", "CNODE"}
    out = ET.Element("HANGER")
    for field in fields:
        if field == "NODE":
            out.set(field, _integer_text(source.get(field), f"HANGER@{field}", positive=True))
        elif field in integer_fields:
            out.set(
                field,
                _integer_text(
                    source.get(field),
                    f"HANGER@{field}",
                    nonnegative=field in nonnegative_fields,
                ),
            )
        else:
            out.set(field, _decimal_text(source.get(field), f"HANGER@{field}"))
    for optional in ("TAG", "GUID"):
        if source.get(optional) is not None:
            out.set(optional, source.get(optional) or "")
    allowed = set(fields) | {"TAG", "GUID"}
    for attr, value in source.attrib.items():
        if attr not in allowed:
            _preserve_attr(target, ledger.source_path, source_entity_id, attr, value, ledger, blocking=True)
    target.append(out)
    _ledger_auxiliary(ledger, source_entity_id, "HANGER", source, element_id, "MISCEL_1")


def _ledger_auxiliary(
    ledger: DecisionLedger,
    source_entity_id: str,
    source_type: str,
    source: ET._Element,
    element_id: str,
    cii_section: str,
) -> None:
    ledger.add(
        source_entity_id=source_entity_id,
        source_type=source_type,
        source_fields=dict(source.attrib),
        canonical_element_ids=[element_id],
        inputxml_element_ids=[element_id],
        cii_section=cii_section,
        projection_cardinality="ATTACH_AUXILIARY",
        disposition="ATTACH_AUXILIARY",
    )


def _block(
    ledger: DecisionLedger,
    code: str,
    message: str,
    source_entity_id: str,
) -> None:
    ledger.diagnostic("BLOCKING", code, message, source_entity_id)
    raise CompileBlocked(message)


__all__ = ["normalize_family_auxiliary", "preserve_unresolved_nozzle"]
