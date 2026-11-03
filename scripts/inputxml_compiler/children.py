from .base import *
from .xml import *
from .extension import *
from .counts import *
def _normalize_child(source: ET._Element, target: ET._Element, element_id: str, ledger: DecisionLedger) -> None:
    name = _local(source.tag)
    entity_id = f"{element_id}/{name}"
    if name == "BEND":
        radius = source.get("RADIUS")
        if radius is None or _is_sentinel(radius) or _decimal(radius, "BEND@RADIUS") <= 0:
            raise CompileBlocked(f"{entity_id} requires explicit positive RADIUS.")
        out = ET.Element("BEND", RADIUS=_decimal_text(radius, "BEND@RADIUS"))
        allowed = {"RADIUS", "TYPE", "ANGLE1", "NODE1", "ANGLE2", "NODE2", "ANGLE3", "NODE3", "NUM_MITER", "FITTINGTHICKNESS", "KFACTOR"}
        for attr in allowed - {"RADIUS"}:
            value = source.get(attr)
            if value is None or _is_sentinel(value):
                continue
            if attr.startswith("NODE"):
                out.set(attr, _integer_text(value, f"BEND@{attr}", positive=True))
            elif attr in {"TYPE", "NUM_MITER"}:
                out.set(attr, _integer_text(value, f"BEND@{attr}"))
            else:
                out.set(attr, _decimal_text(value, f"BEND@{attr}"))
        for attr, value in source.attrib.items():
            if attr not in allowed:
                _preserve_attr(target, ledger.source_path, entity_id, attr, value, ledger, blocking=True)
        target.append(out)
        ledger.add(source_entity_id=entity_id, source_type="BEND", source_fields=dict(source.attrib), canonical_element_ids=[element_id], inputxml_element_ids=[element_id], cii_section="BEND")
        return
    if name == "RIGID":
        weight = source.get("WEIGHT")
        if weight is None or _is_sentinel(weight):
            raise CompileBlocked(f"{entity_id} requires explicit WEIGHT.")
        out = ET.Element("RIGID", WEIGHT=_decimal_text(weight, "RIGID@WEIGHT"))
        if _decimal(weight, "RIGID@WEIGHT") < 0:
            raise CompileBlocked(f"{entity_id} WEIGHT cannot be negative.")
        for attr, value in source.attrib.items():
            if attr == "WEIGHT":
                continue
            if attr == "TYPE":
                _preserve_attr(target, ledger.source_path, entity_id, attr, value, ledger, blocking=False)
            else:
                _preserve_attr(target, ledger.source_path, entity_id, attr, value, ledger, blocking=True)
        target.append(out)
        ledger.add(source_entity_id=entity_id, source_type="RIGID", source_fields=dict(source.attrib), canonical_element_ids=[element_id], inputxml_element_ids=[element_id], cii_section="RIGID")
        return
    if name == "SIF":
        node = source.get("NODE")
        if node is None or _is_sentinel(node):
            raise CompileBlocked(f"{entity_id} requires explicit NODE.")
        out = ET.Element("SIF", NODE=_integer_text(node, "SIF@NODE", positive=True))
        for attr, value in source.attrib.items():
            if attr != "NODE" and not _is_sentinel(value):
                _preserve_attr(target, ledger.source_path, entity_id, attr, value, ledger, blocking=True)
        target.append(out)
        ledger.add(source_entity_id=entity_id, source_type="SIF", source_fields=dict(source.attrib), canonical_element_ids=[element_id], inputxml_element_ids=[element_id], cii_section="SIF&TEES")
        return
    if name == "RESTRAINT":
        allowed = {"NUM", "NODE", "TYPE", "STIFFNESS", "GAP", "FRIC_COEF", "MU", "CNODE", "XCOSINE", "YCOSINE", "ZCOSINE", "TAG", "GUID"}
        values: dict[str, str] = {}
        for required in ("NUM", "NODE", "TYPE", "STIFFNESS", "GAP", "CNODE", "XCOSINE", "YCOSINE", "ZCOSINE"):
            raw = source.get(required)
            if raw is None or _is_sentinel(raw):
                raise CompileBlocked(f"{entity_id} requires explicit {required}; compatibility defaults are not canonical.")
            values[required] = raw
        friction = source.get("FRIC_COEF")
        mu = source.get("MU")
        if friction is not None and mu is not None and not _same_numeric(friction, mu):
            raise CompileBlocked(f"{entity_id} has conflicting FRIC_COEF and MU.")
        friction = friction if friction is not None else mu
        if friction is None or _is_sentinel(friction):
            raise CompileBlocked(f"{entity_id} requires explicit FRIC_COEF/MU.")
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
            raise CompileBlocked(f"{entity_id} NUM exceeds canonical capacity 6.")
        if int(out.get("TYPE")) > 62:
            raise CompileBlocked(f"{entity_id} TYPE exceeds CII range 62.")
        for optional in ("TAG", "GUID"):
            if source.get(optional) is not None:
                out.set(optional, source.get(optional) or "")
        for attr, value in source.attrib.items():
            if attr not in allowed:
                _preserve_attr(target, ledger.source_path, entity_id, attr, value, ledger, blocking=True)
        target.append(out)
        ledger.add(source_entity_id=entity_id, source_type="RESTRAINT", source_fields=dict(source.attrib), canonical_element_ids=[element_id], inputxml_element_ids=[element_id], cii_section="RESTRANT")
        return
    if name == "HANGER":
        numeric = ("NODE", "STIFFNESS", "LOAD_VAR", "OPERATING_LOAD", "RIGID_SUP", "AVAIL_SPACE", "COLD_LOAD", "HOT_LOAD", "MAX_TRAVEL", "HARDWARE_WEIGHT", "CONST_EFF_LOAD", "MULTI_LC", "FREEANCHOR1", "FREEANCHOR2", "DOFTYPE1", "NUM_HGR", "HGR_TABLE", "SHORT_RANGE", "CNODE")
        for required in numeric:
            raw = source.get(required)
            if raw is None or _is_sentinel(raw):
                raise CompileBlocked(f"{entity_id} requires explicit {required}; compatibility defaults are not canonical.")
        out = ET.Element("HANGER")
        integer_fields = {"NODE", "MULTI_LC", "FREEANCHOR1", "FREEANCHOR2", "DOFTYPE1", "NUM_HGR", "HGR_TABLE", "SHORT_RANGE", "CNODE"}
        for attr in numeric:
            if attr == "NODE":
                out.set(attr, _integer_text(source.get(attr), f"HANGER@{attr}", positive=True))
            elif attr in integer_fields:
                out.set(attr, _integer_text(source.get(attr), f"HANGER@{attr}", nonnegative=attr in {"FREEANCHOR1", "FREEANCHOR2", "NUM_HGR", "HGR_TABLE", "CNODE"}))
            else:
                out.set(attr, _decimal_text(source.get(attr), f"HANGER@{attr}"))
        for optional in ("TAG", "GUID"):
            if source.get(optional) is not None:
                out.set(optional, source.get(optional) or "")
        allowed = set(numeric) | {"TAG", "GUID"}
        for attr, value in source.attrib.items():
            if attr not in allowed:
                _preserve_attr(target, ledger.source_path, entity_id, attr, value, ledger, blocking=True)
        target.append(out)
        ledger.add(source_entity_id=entity_id, source_type="HANGER", source_fields=dict(source.attrib), canonical_element_ids=[element_id], inputxml_element_ids=[element_id], cii_section="MISCEL_1")
        return
    raise CompileBlocked(f"Internal adapter error: unsupported canonical child {name}.")



__all__ = [name for name in globals() if not name.startswith("__")]
