from .base import *
from .xml import *
from .extension import *
from .counts import *
from .children import *
from .elements import *
def _normalize_nozzle(source: ET._Element, model: ET._Element, index: int, ledger: DecisionLedger) -> None:
    name = _local(source.tag)
    entity_id = source.get("SOURCE_ENTITY_ID") or f"{name}-{index}"
    target = ET.Element(name, SOURCE_ENTITY_ID=entity_id)
    for i in range(1, 23):
        field = f"VALUE{i}"
        raw = source.get(field)
        if raw is None or _is_sentinel(raw):
            raise CompileBlocked(f"Nozzle {entity_id} requires explicit {field}; family defaults are not canonical.")
        target.set(field, _decimal_text(raw, f"{name}@{field}"))
    allowed = {"SOURCE_ENTITY_ID", *{f"VALUE{i}" for i in range(1, 23)}}
    for attr, value in source.attrib.items():
        if attr not in allowed:
            _preserve_attr(model, ledger.source_path, entity_id, attr, value, ledger, blocking=True)
    model.append(target)
    ledger.add(source_entity_id=entity_id, source_type=name, source_fields=dict(source.attrib), cii_section="MISCEL_1", disposition="ATTACH_AUXILIARY")


def _compile_inputxml_family(
    source_root: ET._Element,
    *,
    dialect: str,
    ledger: DecisionLedger,
    aliases: dict[str, dict[str, str]],
    context: dict[str, Any],
) -> ET._Element:
    if _local(source_root.tag) != "CAESARII" or _namespace(source_root.tag) != COADE_NS:
        raise CompileBlocked("InputXML-family adapter requires the {COADE}CAESARII root.")
    if source_root.get("XML_TYPE") != "Input":
        raise CompileBlocked("CAESARII XML_TYPE must be exactly 'Input'.")
    direct_models = [child for child in source_root if _local(child.tag) == "PIPINGMODEL" and _namespace(child.tag) == ""]
    all_models = [element for element in source_root.iter() if _local(element.tag) == "PIPINGMODEL"]
    if len(direct_models) != 1 or len(all_models) != 1:
        raise CompileBlocked("Exactly one direct unqualified PIPINGMODEL is required; nested or duplicate models are forbidden.")
    source_model = direct_models[0]
    _verify_source_counts(source_model, ledger)

    version = (source_root.get("VERSION") or context.get("version") or "").strip()
    if not version:
        raise CompileBlocked("VERSION is required in source or explicit context.")
    root, model = _new_root(version)
    job_name = (source_model.get("JOBNAME") or context.get("jobName") or "").strip()
    if not job_name:
        raise CompileBlocked("PIPINGMODEL JOBNAME is required in source or explicit context.")
    model.set("JOBNAME", job_name)
    if source_model.get("TIME"):
        model.set("TIME", source_model.get("TIME"))
    elif context.get("time"):
        model.set("TIME", str(context["time"]))
    if source_model.get("ISSUE_NO") is not None:
        model.set("ISSUE_NO", source_model.get("ISSUE_NO") or "")
    elif context.get("issueNo") is not None:
        model.set("ISSUE_NO", str(context.get("issueNo") or ""))

    north: list[str] = []
    context_north = context.get("north")
    for idx, field in enumerate(("NORTH_X", "NORTH_Y", "NORTH_Z")):
        raw = source_model.get(field)
        if raw is None and isinstance(context_north, list) and len(context_north) == 3:
            raw = context_north[idx]
        if raw is None:
            raise CompileBlocked(f"{field} is required in source or explicit context north vector.")
        north.append(_decimal_text(raw, f"PIPINGMODEL@{field}"))
        model.set(field, north[-1])
    magnitude = sum(float(value) ** 2 for value in north)
    if not 0.9 < magnitude < 1.1:
        raise CompileBlocked(f"NORTH vector magnitude squared must be approximately 1, got {magnitude}.")

    for attr, value in source_root.attrib.items():
        if attr not in ROOT_ATTRS:
            _preserve_attr(root, ledger.source_path, "CAESARII", attr, value, ledger, blocking=True)
    for attr, value in source_model.attrib.items():
        if attr not in MODEL_ATTRS:
            _preserve_attr(model, ledger.source_path, "PIPINGMODEL", attr, value, ledger, blocking=True)

    line_state: dict[str, dict[str, str]] = {}
    source_elements = [child for child in source_model if _local(child.tag) == "PIPINGELEMENT" and _namespace(child.tag) == ""]
    if not source_elements:
        raise CompileBlocked("PIPINGMODEL contains no direct PIPINGELEMENT records.")
    for index, source_element in enumerate(source_elements, 1):
        model.append(_normalize_element(source_element, index, model, ledger, aliases, line_state, context))

    for index, child in enumerate(source_model, 1):
        name = _local(child.tag)
        ns = _namespace(child.tag)
        if ns == "" and name == "PIPINGELEMENT":
            continue
        if ns == "" and name in NOZZLE_NAMES:
            _normalize_nozzle(child, model, index, ledger)
            continue
        if ns == EXT_NS and name == "Extension":
            _copy_existing_extension(source_model, model, ledger, "PIPINGMODEL")
            continue
        _preserve_child(model, child, ledger.source_path, "PIPINGMODEL", ledger, blocking=True)

    for child in source_root:
        if child is source_model:
            continue
        if _namespace(child.tag) == EXT_NS and _local(child.tag) == "Extension":
            _copy_existing_extension(source_root, root, ledger, "CAESARII")
            continue
        _preserve_child(root, child, ledger.source_path, "CAESARII", ledger, blocking=True)

    counts = _canonical_counts(model)
    for field in COUNT_FIELDS:
        model.set(field, str(counts[field]))
    _ensure_extension_last(model)
    _ensure_extension_last(root)
    ledger.add(source_entity_id="CAESARII", source_type="ROOT", source_fields=dict(source_root.attrib), disposition="EMIT_1_TO_1", cii_section="VERSION")
    ledger.add(source_entity_id="PIPINGMODEL", source_type="MODEL", source_fields=dict(source_model.attrib), disposition="EMIT_1_TO_1", cii_section="CONTROL")
    return root

__all__ = [name for name in globals() if not name.startswith("__")]
