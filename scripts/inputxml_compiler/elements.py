from .base import *
from .xml import *
from .extension import *
from .counts import *
from .children import *
def _normalize_element(
    source: ET._Element,
    index: int,
    model: ET._Element,
    ledger: DecisionLedger,
    aliases: dict[str, dict[str, str]],
    line_state: dict[str, dict[str, str]],
    context: dict[str, Any],
) -> ET._Element:
    source_id = source.get("ID") or f"source-element-{index}"
    generated_id = _safe_ncname(source.get("ID") or f"E{index:06d}", "E")
    canonical_path = f"/CAESARII/PIPINGMODEL[1]/PIPINGELEMENT[{index}]"
    target = ET.Element("PIPINGELEMENT", ID=generated_id)
    element_aliases = aliases.get("PIPINGELEMENT", {})

    def source_field(field: str) -> tuple[str | None, str | None]:
        return _source_field(
            source,
            field,
            element_aliases,
            ledger,
            source_id,
            canonical_element_id=generated_id,
            canonical_path=canonical_path,
        )

    for field in ("FROM_NODE", "TO_NODE"):
        raw, _ = source_field(field)
        if raw is None:
            raise CompileBlocked(f"{source_id} missing required {field}.")
        target.set(field, _integer_text(raw, f"PIPINGELEMENT@{field}", positive=True))
    if target.get("FROM_NODE") == target.get("TO_NODE"):
        raise CompileBlocked(f"{source_id} has identical FROM_NODE and TO_NODE.")

    for field in ("DELTA_X", "DELTA_Y", "DELTA_Z"):
        raw, _ = source_field(field)
        if raw is None:
            raise CompileBlocked(f"{source_id} missing required {field}.")
        if _is_sentinel(raw):
            target.set(field, "0")
            ledger.add(
                source_entity_id=f"{canonical_path}@{field}",
                source_type="GEOMETRY_SENTINEL",
                source_fields={"sourceEntityId": source_id, field: raw},
                canonical_element_ids=[generated_id],
                canonical_node_ids=[target.get("FROM_NODE"), target.get("TO_NODE")],
                inputxml_element_ids=[generated_id],
                cii_section="ELEMENTS",
                disposition="EMIT_1_TO_1",
                evidence=["InputXML missing-sentinel deterministically means zero component in delta vector"],
                confidence={"identity":1.0,"topology":1.0,"geometry":0.95,"dimensions":1.0,"attributes":1.0,"ciiProjection":1.0},
            )
        else:
            target.set(field, _decimal_text(raw, f"PIPINGELEMENT@{field}"))
    if all(Decimal(target.get(field)) == 0 for field in ("DELTA_X", "DELTA_Y", "DELTA_Z")):
        raise CompileBlocked(f"{source_id} resolves to zero-length geometry.")

    line_raw, line_source = source_field("LINE")
    if line_raw is None:
        line_raw = context.get("defaultLine")
        if line_raw:
            ledger.add(
                source_entity_id=f"{canonical_path}@LINE",
                source_type="CONTEXT_FIELD",
                source_fields={"sourceEntityId": source_id, "defaultLine": line_raw},
                canonical_element_ids=[generated_id],
                inputxml_element_ids=[generated_id],
                disposition="EMIT_1_TO_1",
                evidence=["explicit compiler context"],
            )
    line = str(line_raw or "").strip()
    if not line:
        raise CompileBlocked(f"{source_id} has no explicit LINE/LINE_ID and no explicit context defaultLine.")
    target.set("LINE", line)
    state = line_state.setdefault(line, {})

    for field in INHERITED_DECIMAL_FIELDS:
        raw, raw_name = source_field(field)
        if raw is not None and not _is_sentinel(raw):
            value = _decimal_text(raw, f"PIPINGELEMENT@{field}")
            if field == "DIAMETER" and Decimal(value) <= 0:
                raise CompileBlocked(f"{source_id} DIAMETER must be positive.")
            if field in {"WALL_THICK", "INSUL_THICK", "CORR_ALLOW"} and Decimal(value) < 0:
                raise CompileBlocked(f"{source_id} {field} cannot be negative.")
            state[field] = value
            target.set(field, value)
            continue
        if field in state:
            target.set(field, state[field])
            ledger.add(
                source_entity_id=f"{canonical_path}@{field}",
                source_type="INHERITED_FIELD",
                source_fields={"sourceEntityId": source_id, raw_name or field: raw},
                canonical_element_ids=[generated_id],
                inputxml_element_ids=[generated_id],
                cii_section="ELEMENTS",
                disposition="EMIT_1_TO_1",
                evidence=[f"inherited within explicit LINE scope {line}"],
                confidence={"identity":1.0,"topology":1.0,"geometry":1.0,"dimensions":0.95,"attributes":0.95,"ciiProjection":1.0},
            )
        elif field in {"DIAMETER", "WALL_THICK"}:
            raise CompileBlocked(f"First element of LINE {line!r} lacks explicit {field}.")

    for field in INHERITED_INTEGER_FIELDS:
        raw, raw_name = source_field(field)
        if raw is not None and not _is_sentinel(raw):
            value = _integer_text(raw, f"PIPINGELEMENT@{field}", nonnegative=True)
            state[field] = value
            target.set(field, value)
        elif field in state:
            target.set(field, state[field])
            ledger.add(
                source_entity_id=f"{canonical_path}@{field}",
                source_type="INHERITED_FIELD",
                source_fields={"sourceEntityId": source_id, raw_name or field: raw},
                canonical_element_ids=[generated_id],
                inputxml_element_ids=[generated_id],
                disposition="EMIT_1_TO_1",
                evidence=[f"inherited within explicit LINE scope {line}"],
                confidence={"identity":1.0,"topology":1.0,"geometry":1.0,"dimensions":1.0,"attributes":0.95,"ciiProjection":1.0},
            )

    for field in ("FROM_NAME", "TO_NAME"):
        raw, _ = source_field(field)
        if raw is not None:
            target.set(field, raw.strip())

    coord_values: dict[str, str] = {}
    for field in ("FROM_X", "FROM_Y", "FROM_Z", "TO_X", "TO_Y", "TO_Z"):
        raw, _ = source_field(field)
        if raw is not None and not _is_sentinel(raw):
            coord_values[field] = _decimal_text(raw, f"PIPINGELEMENT@{field}")
    if coord_values and len(coord_values) != 6:
        raise CompileBlocked(f"{source_id} has partial endpoint coordinate seeds; supply all six or none.")
    for field, value in coord_values.items():
        target.set(field, value)

    consumed_names = set(ELEMENT_CORE_ATTRS) | set(PRESERVE_ELEMENT_ATTRS) | set(element_aliases)
    for attr, value in source.attrib.items():
        if attr in ELEMENT_CORE_ATTRS or attr in element_aliases:
            continue
        if attr == "ID":
            if source.get("ID") != generated_id:
                _preserve_attr(target, ledger.source_path, source_id, "SOURCE_ID", value, ledger, blocking=False)
            continue
        _preserve_attr(target, ledger.source_path, source_id, attr, value, ledger, blocking=attr not in PRESERVE_ELEMENT_ATTRS)

    children = [child for child in source if _namespace(child.tag) == "" and _local(child.tag) in ELEMENT_CHILD_ORDER]
    if sum(1 for child in children if _local(child.tag) == "BEND") > 1:
        raise CompileBlocked(f"{source_id} contains more than one BEND.")
    if sum(1 for child in children if _local(child.tag) == "RIGID") > 1:
        raise CompileBlocked(f"{source_id} contains more than one RIGID.")
    if sum(1 for child in children if _local(child.tag) == "SIF") > 2:
        raise CompileBlocked(f"{source_id} contains more than two SIF records.")
    if sum(1 for child in children if _local(child.tag) == "RESTRAINT") > 6:
        raise CompileBlocked(f"{source_id} contains more than six RESTRAINT records.")
    for child in sorted(children, key=lambda item: ELEMENT_CHILD_ORDER[_local(item.tag)]):
        _normalize_child(child, target, generated_id, ledger)

    for child in source:
        name = _local(child.tag)
        ns = _namespace(child.tag)
        if ns == EXT_NS and name == "Extension":
            _copy_existing_extension(source, target, ledger, source_id)
            break
    for child in source:
        name = _local(child.tag)
        ns = _namespace(child.tag)
        if ns == EXT_NS and name == "Extension":
            continue
        if ns == "" and name in ELEMENT_CHILD_ORDER:
            continue
        if ns == "" and name in KNOWN_ENRICHMENT_CHILDREN:
            _preserve_child(target, child, ledger.source_path, source_id, ledger, blocking=False)
        else:
            _preserve_child(target, child, ledger.source_path, source_id, ledger, blocking=True)

    owned_nodes = {target.get("FROM_NODE"), target.get("TO_NODE")}
    for child in target:
        if _namespace(child.tag) != "":
            continue
        if _local(child.tag) in {"RESTRAINT", "SIF", "HANGER"} and child.get("NODE") not in owned_nodes:
            raise CompileBlocked(f"{generated_id}/{_local(child.tag)} NODE {child.get('NODE')} is not owned by element endpoints {sorted(owned_nodes)}.")
    restraint_slots = [child.get("NUM") for child in target.findall("RESTRAINT")]
    if len(restraint_slots) != len(set(restraint_slots)):
        raise CompileBlocked(f"{generated_id} has duplicate RESTRAINT NUM slots.")

    _ensure_extension_last(target)
    ledger.add(
        source_entity_id=source_id,
        source_type="PIPINGELEMENT",
        source_fields={"attributes": dict(source.attrib), "childCount": len(source)},
        canonical_element_ids=[generated_id],
        canonical_node_ids=[target.get("FROM_NODE"), target.get("TO_NODE")],
        inputxml_element_ids=[generated_id],
        cii_section="ELEMENTS",
        disposition="EMIT_1_TO_1",
    )
    return target



__all__ = [name for name in globals() if not name.startswith("__")]
