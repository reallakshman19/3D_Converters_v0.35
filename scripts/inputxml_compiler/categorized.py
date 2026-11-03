from .base import *
from .xml import *
from .extension import *
from .counts import *
from .children import *
from .elements import *
from .family import *
from .model import *
def _categorized_original_element(text: str) -> ET._Element:
    if not text.strip():
        raise CompileBlocked("CategorizedInputXML Element lacks OriginalElement evidence.")
    return _parse_xml(text.encode("utf-8"), "CategorizedInputXML/OriginalElement")


def _block_values(element: ET._Element, block_name: str) -> dict[str, str]:
    block = element.find(block_name)
    if block is None:
        return {}
    return {_local(child.tag): (child.text or "").strip() for child in block}


def _categorized_document(root: ET._Element, context: dict[str, Any], ledger: DecisionLedger) -> ET._Element:
    if root.get("schema") != "categorized-inputxml/v3":
        raise CompileBlocked("CategorizedInputXML schema must be categorized-inputxml/v3.")
    version = str(context.get("version") or "").strip()
    north = context.get("north")
    if not version or not isinstance(north, list) or len(north) != 3:
        raise CompileBlocked("CategorizedInputXML compilation requires explicit context version and north[3].")
    wrapper, model = _new_root(version)
    model.set("JOBNAME", str(context.get("jobName") or root.get("sourceName") or "CATEGORIZED_CANONICAL"))
    if context.get("time"):
        model.set("TIME", str(context["time"]))
    model.set("ISSUE_NO", str(context.get("issueNo") or ""))
    for field, value in zip(("NORTH_X", "NORTH_Y", "NORTH_Z"), north):
        model.set(field, _decimal_text(value, f"context {field}"))
    output_ordinal = 0
    for line_index, line in enumerate(root.findall("Line"), 1):
        line_id = (line.get("id") or "").strip()
        line_values = _block_values(line, "LineBlock")
        line_number = line_values.get("LineNo") or line_values.get("Branchname") or line_id
        if not line_number:
            raise CompileBlocked(f"CategorizedInputXML Line[{line_index}] has no line identity.")
        ledger.add(
            source_entity_id=f"CategorizedInputXML/Line[{line_index}]",
            source_type="CATEGORIZED_LINE",
            source_fields=line_values,
            projection_cardinality="1_TO_0",
            disposition="PRESERVE_EXTENSION",
            evidence=["source line grouping retained as categorized evidence; child elements own CII projection"],
        )
        for element_index, element in enumerate(line.findall("Element"), 1):
            output_ordinal += 1
            original_node = element.find("OriginalElement")
            original = _categorized_original_element(original_node.text if original_node is not None else "")
            entity_id = element.get("elementKey") or f"line-{line_index}-element-{element_index}"
            canonical_id = _safe_ncname(original.get("ID") or entity_id or f"E{output_ordinal:06d}", "E")
            canonical_path = f"/CAESARII/PIPINGMODEL[1]/PIPINGELEMENT[{output_ordinal}]"
            ledger.add(
                source_entity_id=f"CategorizedInputXML/Line[{line_index}]/Element[{element_index}]",
                source_type="CATEGORIZED_RECONCILIATION",
                source_fields={"elementKey": entity_id, "fromNode": element.get("fromNode"), "toNode": element.get("toNode")},
                canonical_element_ids=[canonical_id],
                inputxml_element_ids=[canonical_id],
                cii_section="ELEMENTS",
                projection_cardinality="1_TO_1",
                disposition="EMIT_1_TO_1",
            )
            overlays = {
                **_block_values(element, "RouteGeometryBlock"),
                **_block_values(element, "SectionDimensionBlock"),
                **_block_values(element, "ProcessStateBlock"),
                **_block_values(element, "MaterialBlock"),
            }
            overlays["FROM_NODE"] = element.get("fromNode") or original.get("FROM_NODE") or ""
            overlays["TO_NODE"] = element.get("toNode") or original.get("TO_NODE") or ""
            overlays["LINE"] = line_number
            for field, value in overlays.items():
                if value == "":
                    continue
                original_value = original.get(field)
                if original_value is not None:
                    same = _same_numeric(original_value, value) if field not in {"LINE", "FROM_NAME", "TO_NAME"} else original_value.strip() == value.strip()
                    if not same:
                        ledger.add(
                            source_entity_id=f"{canonical_path}@{field}",
                            source_type="CATEGORIZED_CONFLICT",
                            source_fields={"sourceEntityId": entity_id, "normalized": value, "original": original_value},
                            canonical_element_ids=[canonical_id],
                            inputxml_element_ids=[canonical_id],
                            disposition="REJECT_INVALID",
                            diagnostics=["Categorized normalized value conflicts with OriginalElement"],
                        )
                        raise CompileBlocked(f"Categorized conflict at {entity_id}/{field}: normalized={value!r}, original={original_value!r}.")
                original.set(field, value)
                ledger.add(
                    source_entity_id=f"{canonical_path}@{field}",
                    source_type="CATEGORIZED_NORMALIZED_FIELD",
                    source_fields={"sourceEntityId": entity_id, field: value},
                    canonical_element_ids=[canonical_id],
                    inputxml_element_ids=[canonical_id],
                    projection_cardinality="1_TO_1",
                    disposition="EMIT_1_TO_1",
                    evidence=["normalized block reconciled with OriginalElement"],
                )
            piping_class = (element.findtext("PipingClass") or "").strip()
            rating = (element.findtext("Rating") or "").strip()
            if piping_class:
                ET.SubElement(original, "PipingClass").text = piping_class
            if rating:
                ET.SubElement(original, "Rating").text = rating
            _extension_record(
                original,
                producer=ledger.producer,
                dialect=ledger.dialect,
                name="OriginalElement",
                source_path=ledger.source_path,
                source_entity_id=entity_id,
                source_field="OriginalElement",
                value=original_node.text if original_node is not None else "",
                disposition="PRESERVE_EXTENSION",
                criticality="HIGH",
                confidence=1.0,
            )
            _ensure_extension_last(original)
            model.append(original)
    if not model.findall("PIPINGELEMENT"):
        raise CompileBlocked("CategorizedInputXML contains no Element records.")
    _set_model_count_assertions(model)
    return wrapper


__all__ = [name for name in globals() if not name.startswith("__")]
