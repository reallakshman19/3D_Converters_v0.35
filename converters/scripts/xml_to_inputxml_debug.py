#!/usr/bin/env python3
from __future__ import annotations

import argparse
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

import xml_to_cii2019 as base
import xml_to_cii2019_patched as patched
import xml_to_cii_inputxml_sidecar_diagnostics as sidecar_diag

POINT_FIELDS = ("ComponentType", "DTXR_POS", "DTXR_PS", "TEEDESC_POS", "TEEDESC", "PipingClass", "Rating", "Position")

DEFAULT_TEE_SIF_TYPE_MAPPING = [
    {"code": 1, "patterns": [r"\bREINF(?:ORCED)?\b.*\bTEE\b"]},
    {"code": 2, "patterns": [r"\bUN[-\s]?REINF(?:ORCED)?\b.*\bTEE\b"]},
    {"code": 3, "patterns": [r"\bWELD(?:ING)?\s+TEE\b", r"\bTEE\b.*\bB\s*\.?\s*W\.?\b", r"\bTEE\b.*\bBUTT\s*[- ]?\s*WELD\b", r"\bTEE\b.*\bBUTTWELD\b", r"\bTEE\s+(?:EQUAL|REDUC(?:ING|ER)?)\b"]},
    {"code": 4, "patterns": [r"\bSWEEPOLET\b", r"\bSWEEP\s*OLET\b"]},
    {"code": 5, "patterns": [r"\bWELDOLET\b", r"\bWELD\s*OLET\b", r"\bWOLET\b", r"\bBRANCH\s+OUTLET\b.*\bB\s*\.?\s*W\.?\b", r"\bBRANCH\s+FITTING\b.*\bB\s*\.?\s*W\.?\b", r"\bOLET\b.*\bB\s*\.?\s*W\.?\b"]},
    {"code": 6, "patterns": [r"\bEXTRUDED\b.*\bTEE\b", r"\bEXT(?:RUDED)?\s+TEE\b"]},
]


def _safe_text(value: object) -> str:
    return "" if value is None else str(value).strip()


def _local_name(tag: str) -> str:
    return tag.split("}", 1)[1] if tag.startswith("{") else tag


def _namespace(tag: str) -> str:
    return tag[1:].split("}", 1)[0] if tag.startswith("{") else ""


def _q(namespace: str, name: str) -> str:
    return f"{{{namespace}}}{name}" if namespace else name


def _child_text(parent: ET.Element | None, namespace: str, name: str) -> str:
    if parent is None:
        return ""
    child = parent.find(_q(namespace, name))
    return _safe_text(child.text if child is not None else "")


def _fmt(value: float | int | None, decimals: int = 6) -> str:
    if value is None:
        return "-1.0101"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "-1.0101"
    if not math.isfinite(number):
        return "-1.0101"
    if abs(number - round(number)) < 1e-9:
        return str(int(round(number)))
    text = f"{number:.{decimals}f}".rstrip("0").rstrip(".")
    return text or "0"


def _case(values: tuple[float, ...], index: int) -> float:
    if index < len(values):
        value = values[index]
        if abs(value - patched.SENTINEL_TEMPERATURE) > 1e-9:
            return value
    return -1.0101


def _edge_delta(edge: base.Edge) -> tuple[float, float, float]:
    mapped_from = base._map_position_to_cii(edge.from_node.position)
    mapped_to = base._map_position_to_cii(edge.to_node.position)
    return tuple(mapped_to[i] - mapped_from[i] for i in range(3))


def _inputxml_friction_value(restraint: base.RestraintSpec, support_config: dict[str, Any]) -> float:
    if patched._truthy(support_config.get("useFrictionSentinelForNonYSupports", True)) and restraint.type_code != 14:
        return -1.0101
    return restraint.friction


def _component_type_to_xml_type(component_type: str, support_config: dict[str, Any]) -> str:
    comp = _safe_text(component_type).upper()
    component_map = support_config.get("componentTypeToXmlType", {})
    if isinstance(component_map, dict):
        mapped = _safe_text(component_map.get(comp) or component_map.get(component_type))
        if mapped:
            return mapped.upper()
    if comp == "ANCI":
        return "+Y"
    return ""


def _component_type_restraint_specs(document: base.XmlDocument, support_config: dict[str, Any]) -> dict[int, tuple[base.RestraintSpec, ...]]:
    stiffness = patched._to_float(support_config.get("defaultStiffness"), base.DEFAULT_LINEAR_STIFFNESS)
    gap = patched._to_float(support_config.get("defaultGap"), 0.0)
    friction = patched._to_float(support_config.get("defaultFriction"), 0.3)
    specs: dict[int, tuple[base.RestraintSpec, ...]] = {}
    for branch in document.branches:
        for node in branch.nodes:
            if node.node_number is None or node.node_number <= 0:
                continue
            xml_type = _component_type_to_xml_type(node.component_type, support_config)
            if not xml_type:
                continue
            specs[node.node_number] = (
                base.RestraintSpec(
                    type_code=base._restraint_type_to_code(xml_type),
                    stiffness=stiffness,
                    gap=gap,
                    friction=friction,
                    is_open_end=False,
                ),
            )
    return specs


def _merge_spec_maps(*maps: dict[int, tuple[base.RestraintSpec, ...]]) -> dict[int, tuple[base.RestraintSpec, ...]]:
    merged: dict[int, tuple[base.RestraintSpec, ...]] = {}
    for spec_map in maps:
        for node_number, specs in spec_map.items():
            merged[node_number] = patched._merge_specs(merged.get(node_number, tuple()), specs)
    return merged


def _prefer_xml_spec_map(
    xml_specs: dict[int, tuple[base.RestraintSpec, ...]],
    *fallback_maps: dict[int, tuple[base.RestraintSpec, ...]],
) -> dict[int, tuple[base.RestraintSpec, ...]]:
    merged = dict(xml_specs)
    for spec_map in fallback_maps:
        for node_number, specs in spec_map.items():
            if node_number not in merged or not merged[node_number]:
                merged[node_number] = specs
    return merged


def _add_restraint(
    parent: ET.Element,
    restraint: base.RestraintSpec,
    node_number: int,
    support_config: dict[str, Any],
    tag: str,
) -> None:
    fric = _inputxml_friction_value(restraint, support_config)
    ET.SubElement(parent, "RESTRAINT", {
        "NUM": "1",
        "NODE": _fmt(node_number),
        "TYPE": _fmt(restraint.type_code),
        "STIFFNESS": _fmt(restraint.stiffness),
        "GAP": _fmt(restraint.gap),
        "FRIC_COEF": _fmt(fric),
        "CNODE": "0",
        "XCOSINE": "-1.0101",
        "YCOSINE": "-1.0101",
        "ZCOSINE": "-1.0101",
        "TAG": tag,
        "GUID": "",
    })


def _regex_or_contains(pattern: str, text: str) -> bool:
    try:
        return re.search(pattern, text, flags=re.I) is not None
    except re.error:
        return pattern.upper() in text.upper()


def _tee_sif_type_from_meta(meta: dict[str, str], support_config: dict[str, Any]) -> int:
    text = _safe_text(meta.get("TEEDESC_POS") or meta.get("TEEDESC") or meta.get("DTXR_POS") or meta.get("DTXR_PS"))
    normalized = re.sub(r"\s+", " ", text).upper()
    normalized = re.sub(r"\bB\s*\.?\s*W\.?\b", "BW", normalized)
    normalized = re.sub(r"\bBUTT\s*[- ]?\s*WELD\b", "BUTT WELD", normalized)
    if not normalized:
        return int(float(support_config.get("defaultTeeSifType", 0) or 0))
    mapping = support_config.get("teeSifTypeMapping")
    if not isinstance(mapping, list) or not mapping:
        mapping = DEFAULT_TEE_SIF_TYPE_MAPPING
    for entry in mapping:
        if not isinstance(entry, dict):
            continue
        try:
            code = int(float(entry.get("code")))
        except (TypeError, ValueError):
            continue
        patterns = entry.get("patterns") if isinstance(entry.get("patterns"), list) else []
        if any(_regex_or_contains(str(pattern), normalized) for pattern in patterns):
            return code
    if re.search(r"\b(?:BRANCH\s+OUTLET|BRANCH\s+FITTING|OLET)\b", normalized) and re.search(r"\b(BW|BUTT\s*WELD|BUTTWELD|WELD(?:ING)?)\b", normalized):
        return 5
    if re.search(r"\bTEE\b", normalized) and re.search(r"\b(BW|BUTT\s*WELD|BUTTWELD|WELD(?:ING)?|EQUAL|REDUC(?:ING|ER)?)\b", normalized):
        return 3
    return int(float(support_config.get("defaultTeeSifType", 0) or 0))


def _node_meta(final_xml: Path) -> tuple[dict[int, dict[str, str]], dict[str, dict[str, str]], dict[str, float]]:
    root = ET.parse(final_xml).getroot()
    namespace = _namespace(root.tag)
    by_number: dict[int, dict[str, str]] = {}
    by_name: dict[str, dict[str, str]] = {}
    hydro_by_branch: dict[str, float] = {}
    for branch in root.iter():
        if _local_name(branch.tag) != "Branch":
            continue
        pressure = branch.find(_q(namespace, "Pressure"))
        hydro_by_branch[_child_text(branch, namespace, "Branchname")] = patched._to_float(_child_text(pressure, namespace, "HydroPressure"), 0.0)
    for node in root.iter():
        if _local_name(node.tag) != "Node":
            continue
        meta = {field: _child_text(node, namespace, field) for field in POINT_FIELDS}
        name = _child_text(node, namespace, "NodeName")
        number_text = _child_text(node, namespace, "NodeNumber")
        try:
            number = int(float(number_text))
        except ValueError:
            number = None
        if number is not None:
            by_number[number] = meta
        if name:
            by_name[name] = meta
    return by_number, by_name, hydro_by_branch


def _point_meta(edge: base.Edge, by_number: dict[int, dict[str, str]], by_name: dict[str, dict[str, str]]) -> tuple[str, dict[str, str]]:
    meta = by_number.get(edge.to_node.node_number) or by_name.get(edge.to_node.node_name)
    if meta:
        return "TO", meta
    return "FROM", by_number.get(edge.from_node.node_number) or by_name.get(edge.from_node.node_name) or {}


def _add_point_properties(element: ET.Element, edge: base.Edge, by_number: dict[int, dict[str, str]], by_name: dict[str, dict[str, str]]) -> None:
    basis, meta = _point_meta(edge, by_number, by_name)
    ET.SubElement(element, "Point_properties_basis").text = basis
    fallback_position = edge.to_node.position if basis == "TO" else edge.from_node.position
    fallback_component = edge.to_node.component_type if basis == "TO" else edge.from_node.component_type
    fallback = {
        "ComponentType": fallback_component,
        "Position": " ".join(_fmt(value, 6) for value in fallback_position),
    }
    for field in POINT_FIELDS:
        value = _safe_text(meta.get(field)) or _safe_text(fallback.get(field))
        if value:
            ET.SubElement(element, field).text = value


def _restraint_source_label(
    node_number: int,
    restraint: base.RestraintSpec,
    source_maps: dict[str, dict[int, tuple[base.RestraintSpec, ...]]],
) -> str:
    labels = []
    for key, label in (("xml", "XML-explicit"), ("component", "ComponentType-derived"), ("dtxr", "DTXR-derived")):
        if restraint in source_maps.get(key, {}).get(node_number, tuple()):
            labels.append(label)
    return "+".join(labels) if labels else "Merged-unknown"


def _emit_restraints(
    parent: ET.Element,
    *,
    node_number: int,
    specs: tuple[base.RestraintSpec, ...],
    source_maps: dict[str, dict[int, tuple[base.RestraintSpec, ...]]],
    kind_map: dict[int, str],
    support_config: dict[str, Any],
    records: list[dict[str, Any]],
) -> int:
    retained = specs[:6]
    for slot, restraint in enumerate(retained, start=1):
        label = _restraint_source_label(node_number, restraint, source_maps)
        _add_restraint(parent, restraint, node_number, support_config, label)
        parent[-1].set("NUM", str(slot))
        records.append(sidecar_diag.make_record(
            "INFO", "SIDECAR_RESTRAINT_SOURCE",
            f"Node {node_number} restraint slot {slot} uses {label} evidence.",
            stage="restraint", source_row=node_number, element=node_number,
            output_field=f"RESTRAINT[{slot}]", action="emitted",
            context={"tag": label, "type": restraint.type_code, "dtxrKind": kind_map.get(node_number, "")},
        ))
    if len(specs) > 6:
        records.append(sidecar_diag.make_record(
            "WARNING", "SIDECAR_RESTRAINT_TRUNCATED",
            f"Node {node_number} supplied {len(specs)} restraints; retained 6 and reported {len(specs) - 6} dropped rows.",
            stage="restraint", source_row=node_number, element=node_number,
            output_field="RESTRAINT", action="truncated",
            context={"retained": 6, "dropped": len(specs) - 6},
        ))
    return len(retained)


def _element_attributes(
    edge: base.Edge,
    branch: Any,
    hydro_by_branch: dict[str, float],
    insulation_density_map: dict[str, float],
    support_config: dict[str, Any],
) -> dict[str, str]:
    from_node, to_node = edge.from_node, edge.to_node
    dx, dy, dz = _edge_delta(edge)
    material = to_node.material_code or from_node.material_code or branch.material_number
    fluid_density = patched._density_for_output(branch.branch_fluid_density, support_config)
    insulation_density = patched._density_for_output(insulation_density_map.get(branch.branch_name, 0.0), support_config)
    attrs = {
        "FROM_NODE": _fmt(from_node.node_number), "TO_NODE": _fmt(to_node.node_number),
        "FROM_NAME": from_node.node_name, "TO_NAME": to_node.node_name,
        "LINE_ID": branch.branch_name, "DELTA_X": _fmt(dx, 4), "DELTA_Y": _fmt(dy, 4), "DELTA_Z": _fmt(dz, 4),
        "DIAMETER": _fmt(base._element_outside_diameter(edge), 5),
        "WALL_THICK": _fmt(from_node.wall_thickness if from_node.wall_thickness > 0 else to_node.wall_thickness, 6),
        "INSUL_THICK": _fmt(to_node.insulation_thickness, 6), "CORR_ALLOW": _fmt(to_node.corrosion_allowance, 6),
        "MATERIAL_NUM": _fmt(material), "FLUID_DENSITY": _fmt(fluid_density, 9),
        "INSUL_DENSITY": _fmt(insulation_density, 9),
        "HYDRO_PRESSURE": _fmt(hydro_by_branch.get(branch.branch_name, 0.0), 6),
    }
    for index in range(9):
        attrs[f"TEMP_EXP_C{index + 1}"] = _fmt(_case(branch.temperatures, index), 6)
        attrs[f"PRESSURE_C{index + 1}"] = _fmt(_case(branch.pressures, index), 6)
    return attrs


def _add_component_children(
    element: ET.Element,
    edge: base.Edge,
    by_number: dict[int, dict[str, str]],
    by_name: dict[str, dict[str, str]],
    support_config: dict[str, Any],
    weight_scale: float,
) -> None:
    from_node, to_node = edge.from_node, edge.to_node
    _add_point_properties(element, edge, by_number, by_name)
    if to_node.bend_radius > 0:
        ET.SubElement(element, "BEND", {"RADIUS": _fmt(to_node.bend_radius, 6), "TYPE": _fmt(to_node.bend_type or 0), "ANGLE1": "0", "NODE1": _fmt(to_node.node_number), "ANGLE2": "0", "NODE2": _fmt(to_node.node_number), "ANGLE3": "0", "NODE3": _fmt(to_node.node_number), "NUM_MITER": "0", "FITTINGTHICKNESS": _fmt(to_node.wall_thickness, 6), "KFACTOR": "0"})
    rigid_at_to = to_node.rigid == 2 or (from_node.rigid == 2 and to_node.component_type.upper() == "FLAN")
    rigid_without_endpoint = to_node.rigid is None and abs(to_node.weight) > 1e-9
    if rigid_at_to or rigid_without_endpoint:
        source_weight = from_node.weight if from_node.rigid == 2 and abs(from_node.weight) > 1e-12 else to_node.weight
        ET.SubElement(element, "RIGID", {"WEIGHT": _fmt(source_weight * weight_scale, 6)})
    if to_node.component_type.upper() in {"TEE", "OLET", "BRAN"}:
        meta = by_number.get(to_node.node_number) or by_name.get(to_node.node_name) or {}
        ET.SubElement(element, "SIF", {"NODE": _fmt(to_node.node_number), "TYPE": _fmt(_tee_sif_type_from_meta(meta, support_config))})


def _inputxml_from_final_xml(
    final_xml: Path,
    support_config: dict[str, Any],
    use_json_restraints: bool,
    weight_scale: float = 1.0,
    diagnostics_records: list[dict[str, Any]] | None = None,
) -> ET.ElementTree:
    records = diagnostics_records if diagnostics_records is not None else []
    document = base._parse_xml_document(final_xml)
    by_number, by_name, hydro_by_branch = _node_meta(final_xml)
    insulation_density_map = patched._branch_insulation_density_map(final_xml)
    dtxr_specs, kind_map = patched._build_keyword_restraint_specs(final_xml, support_config)
    xml_specs = base._build_explicit_restraint_specs(document.branches)
    component_specs = _component_type_restraint_specs(document, support_config)
    if use_json_restraints and patched._xml_restraints_are_authoritative(final_xml, support_config):
        explicit_specs = dict(xml_specs)
    elif use_json_restraints:
        explicit_specs = _prefer_xml_spec_map(xml_specs, component_specs, dtxr_specs)
    else:
        explicit_specs = _merge_spec_maps(component_specs, xml_specs, dtxr_specs)
    source_maps = {"xml": xml_specs, "component": component_specs, "dtxr": dtxr_specs}
    root = ET.Element("CAESARII", {"XML_TYPE": "Input", "VERSION": "2019", "SOURCE": "XML->CII diagnostic reconstruction", "ARTIFACT_ROLE": "diagnostic-reconstruction", "PARITY_AUTHORITY": "generated CII"})
    model = ET.SubElement(root, "PIPINGMODEL", {"JOBNAME": document.metadata.project_name or Path(final_xml).stem, "TIME": document.metadata.date_time, "NORTH_Y": "1", "NORTH_Z": "0", "NUMELEMENTS": "0", "NUMREST": "0"})
    element_count = restraint_count = 0
    for branch in document.branches:
        nodes = [node for node in branch.nodes if node.node_number is not None]
        for from_node, to_node in zip(nodes, nodes[1:]):
            if from_node.node_number <= 0 or to_node.node_number <= 0:
                continue
            edge = base.Edge(from_node=from_node, to_node=to_node, branch_temperature=branch.branch_temperature, branch_pressure=branch.branch_pressure, branch_fluid_density=branch.branch_fluid_density, branch_name=branch.branch_name, branch_material_number=branch.material_number)
            element = ET.SubElement(model, "PIPINGELEMENT", _element_attributes(edge, branch, hydro_by_branch, insulation_density_map, support_config))
            _add_component_children(element, edge, by_number, by_name, support_config, weight_scale)
            restraint_count += _emit_restraints(parent=element, node_number=to_node.node_number, specs=explicit_specs.get(to_node.node_number, tuple()), source_maps=source_maps, kind_map=kind_map, support_config=support_config, records=records)
            element_count += 1
    model.set("NUMELEMENTS", str(element_count))
    model.set("NUMREST", str(restraint_count))
    return ET.ElementTree(root)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export XML->CII final enriched data as CAESAR InputXML.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--staged-json", required=False, type=Path, default=None)
    parser.add_argument("--support-config-json", required=False, default="")
    parser.add_argument("--use-restraint-type-based-on-json", dest="use_restraint_type_based_on_json", action="store_true", default=True)
    parser.add_argument("--no-use-restraint-type-based-on-json", dest="use_restraint_type_based_on_json", action="store_false")
    parser.add_argument("--split-condensed-valve-flange", dest="split_condensed_valve_flange", action="store_true", default=None)
    parser.add_argument("--no-split-condensed-valve-flange", dest="split_condensed_valve_flange", action="store_false")
    parser.add_argument("--weight-scale", dest="weight_scale", type=float, default=1.0,
                        help="Multiplier applied to RIGID element weights (e.g. 10 to convert kgf → N).")
    parser.add_argument("--cii-output", type=Path, default=None)
    parser.add_argument("--diagnostics-output", type=Path, default=None)
    parser.add_argument("--coords-mode", choices=("first", "all", "none"), default="first")
    parser.add_argument("--parity-tolerance", type=float, default=0.001)
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    support_config = patched._load_support_config(args.support_config_json)
    if args.split_condensed_valve_flange is not None:
        support_config["splitCondensedValveFlange"] = bool(args.split_condensed_valve_flange)
    final_xml = patched._maybe_enrich_from_staged_json(args.input, args.staged_json, support_config)
    final_xml = patched._apply_process_data_to_xml(final_xml, support_config)
    records: list[dict[str, Any]] = []
    tree = _inputxml_from_final_xml(final_xml, support_config, args.use_restraint_type_based_on_json, weight_scale=args.weight_scale, diagnostics_records=records)
    ET.indent(tree, space="  ")
    tree.write(args.output, encoding="unicode", xml_declaration=True)
    diagnostics_path = args.diagnostics_output or args.output.with_name(f"{args.output.stem}_diagnostics.json")
    records.append(sidecar_diag.make_record(
        "INFO", "SIDECAR_OPTION_FORWARDED",
        "XML→CII sidecar received the resolved topology and conversion options.",
        stage="options", action="forwarded",
        context={"splitCondensedValveFlange": args.split_condensed_valve_flange, "coordsMode": args.coords_mode, "weightScale": args.weight_scale, "useJsonRestraints": args.use_restraint_type_based_on_json},
    ))
    diagnostics = sidecar_diag.build_diagnostics(source_name=args.input.name, sidecar_name=args.output.name, tree=tree, cii_path=args.cii_output, generation_records=records, options={"splitCondensedValveFlange": args.split_condensed_valve_flange, "coordsMode": args.coords_mode, "weightScale": args.weight_scale, "useJsonRestraints": args.use_restraint_type_based_on_json}, tolerance=args.parity_tolerance)
    sidecar_diag.write_diagnostics(diagnostics_path, diagnostics)
    print(f"Wrote enriched InputXML diagnostic reconstruction: {args.output}")
    print(f"Wrote InputXML sidecar parity diagnostics: {diagnostics_path}")


if __name__ == "__main__":
    main()
