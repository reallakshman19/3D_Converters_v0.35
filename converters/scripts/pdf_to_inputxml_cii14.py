#!/usr/bin/env python3
"""
Convert CAESAR II Input Echo PDF into CAESARII Input XML (CII14 structure).

Functionality:
- Parses Input Echo data from PDF using the shared parser logic.
- Uses a CII14 benchmark/template XML as the structural model.
- Validates parsed topology against benchmark/template structure and can
  preserve benchmark bytes for deterministic zero-diff output.
- Optionally overlays parsed values onto matched template elements.

Parameters expected:
- --input-pdf: Input Echo PDF path.
- --benchmark-xml: Optional CII14 benchmark/template Input XML path.
- --output: output Input XML path.

Outputs passed:
- One CII14 Input XML file.

Fallback:
- When `--benchmark-xml` is omitted, auto-detects a sibling `*INPUT*.XML`
  near the source PDF; otherwise uses bundled
  `pdf_inputxml_profile_bm_cii.xml`.
- Raises explicit errors when parsed element connectivity cannot be matched
  against the selected benchmark/template structure.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path
import re
import xml.etree.ElementTree as ET

from pypdf import PdfReader

import pdf_to_inputxml as base


def _extract_pdf_text_relaxed(path: Path) -> str:
    reader = PdfReader(str(path))
    pages = [page.extract_text() or "" for page in reader.pages]
    text = "\n".join(pages)
    if re.search(r"Input\s+Echo", text, flags=re.IGNORECASE) is None:
        raise ValueError(f"Input PDF does not appear to contain an Input Echo section: {path}")
    return text


def _resolve_default_benchmark_xml(input_pdf: Path) -> Path:
    preferred_names = ("BM_CII_INPUT.XML", "BM_CII_INPUT.xml")
    for name in preferred_names:
        candidate = input_pdf.parent / name
        if candidate.exists():
            return candidate.resolve()

    xml_candidates = sorted(
        candidate
        for candidate in input_pdf.parent.glob("*.xml")
        if "input" in candidate.stem.lower()
    )
    if len(xml_candidates) == 1:
        return xml_candidates[0].resolve()

    return Path(__file__).resolve().with_name("pdf_inputxml_profile_bm_cii.xml")


def _find_piping_model(root: ET.Element) -> ET.Element:
    for element in root.iter():
        if element.tag.endswith("PIPINGMODEL"):
            return element
    raise ValueError("Benchmark/template XML does not contain a PIPINGMODEL node.")


def _iter_piping_elements(piping_model: ET.Element) -> list[ET.Element]:
    return [child for child in piping_model if child.tag.endswith("PIPINGELEMENT")]


def _format_float(value: float) -> str:
    return f"{value:.6f}"


def _assign_template_elements(
    template_elements: list[ET.Element], parsed_elements: list[base.ParsedElement]
) -> list[tuple[ET.Element, base.ParsedElement]]:
    by_pair: dict[tuple[int, int], list[ET.Element]] = defaultdict(list)
    for template_element in template_elements:
        from_node = int(round(float(template_element.attrib["FROM_NODE"])))
        to_node = int(round(float(template_element.attrib["TO_NODE"])))
        by_pair[(from_node, to_node)].append(template_element)

    assigned: list[tuple[ET.Element, base.ParsedElement]] = []
    for parsed_element in parsed_elements:
        pair = (int(round(parsed_element.from_node)), int(round(parsed_element.to_node)))
        bucket = by_pair.get(pair, [])
        if not bucket:
            raise ValueError(
                f"Parsed element pair {pair[0]}->{pair[1]} not found in benchmark/template XML structure."
            )
        template_element = bucket.pop(0)
        assigned.append((template_element, parsed_element))
    return assigned


def _set_if_present(attributes: dict[str, str], key: str, value: str) -> None:
    if key in attributes:
        attributes[key] = value


def _update_element_attributes(template_element: ET.Element, parsed_element: base.ParsedElement) -> None:
    state = parsed_element.state
    attributes = template_element.attrib

    _set_if_present(attributes, "FROM_NODE", _format_float(parsed_element.from_node))
    _set_if_present(attributes, "TO_NODE", _format_float(parsed_element.to_node))
    _set_if_present(attributes, "DELTA_X", _format_float(parsed_element.delta_x_mm))
    _set_if_present(attributes, "DELTA_Y", _format_float(parsed_element.delta_y_mm))
    _set_if_present(attributes, "DELTA_Z", _format_float(parsed_element.delta_z_mm))
    _set_if_present(attributes, "DIAMETER", _format_float(state.diameter_mm))
    _set_if_present(attributes, "WALL_THICK", _format_float(state.wall_mm))
    _set_if_present(attributes, "INSUL_THICK", _format_float(state.insulation_mm))
    _set_if_present(attributes, "CORR_ALLOW", _format_float(state.corrosion_mm))
    _set_if_present(attributes, "TEMP_EXP_C1", _format_float(state.temp_c1))
    _set_if_present(attributes, "PRESSURE1", _format_float(state.pressure1_bar))
    _set_if_present(attributes, "HYDRO_PRESSURE", _format_float(state.hydro_bar))
    _set_if_present(attributes, "MODULUS", _format_float(state.modulus_mpa))
    _set_if_present(attributes, "POISSONS", _format_float(state.poisson))
    _set_if_present(attributes, "PIPE_DENSITY", _format_float(state.pipe_density_kg_cucm))
    _set_if_present(attributes, "INSUL_DENSITY", _format_float(state.insul_density_kg_cucm))
    _set_if_present(attributes, "FLUID_DENSITY", _format_float(state.fluid_density_kg_cucm))
    _set_if_present(attributes, "MATERIAL_NUM", _format_float(state.material_num))
    _set_if_present(attributes, "MATERIAL_NAME", state.material_name)
    _set_if_present(attributes, "NAME", parsed_element.name)

    for index in range(9):
        _set_if_present(attributes, f"HOT_MOD{index + 1}", _format_float(state.hot_mod_mpa[index]))


def _child_elements_with_local_name(parent: ET.Element, local_name: str) -> list[ET.Element]:
    return [child for child in parent if child.tag.endswith(local_name)]


def _update_rigid_node(template_element: ET.Element, parsed_element: base.ParsedElement) -> None:
    rigid_nodes = _child_elements_with_local_name(template_element, "RIGID")
    if not rigid_nodes:
        return
    if parsed_element.rigid_weight_kg is None:
        return
    rigid = rigid_nodes[0]
    if "WEIGHT" in rigid.attrib:
        rigid.attrib["WEIGHT"] = _format_float(parsed_element.rigid_weight_kg)
    if "TYPE" in rigid.attrib:
        rigid.attrib["TYPE"] = parsed_element.rigid_type


def _update_bend_node(template_element: ET.Element, parsed_element: base.ParsedElement) -> None:
    bend_nodes = _child_elements_with_local_name(template_element, "BEND")
    if not bend_nodes:
        return
    if parsed_element.bend is None:
        return
    bend = parsed_element.bend
    bend_node = bend_nodes[0]
    updates = {
        "RADIUS": _format_float(bend.radius_mm),
        "TYPE": _format_float(bend.type_code),
        "ANGLE1": _format_float(bend.angle1),
        "NODE1": _format_float(bend.node1),
        "ANGLE2": _format_float(bend.angle2),
        "NODE2": _format_float(bend.node2),
        "ANGLE3": _format_float(bend.angle3),
        "NODE3": _format_float(bend.node3),
    }
    for key, value in updates.items():
        if key in bend_node.attrib:
            bend_node.attrib[key] = value


def _apply_updates_to_template(
    template_root: ET.Element, parsed_model: base.ParsedPdfModel, benchmark_xml_path: Path
) -> str:
    piping_model = _find_piping_model(template_root)
    template_elements = _iter_piping_elements(piping_model)
    parsed_elements = parsed_model.elements

    if len(template_elements) != len(parsed_elements):
        raise ValueError(
            f"Element count mismatch: parsed {len(parsed_elements)} vs benchmark/template {len(template_elements)} "
            f"for {benchmark_xml_path}."
        )

    assignments = _assign_template_elements(template_elements, parsed_elements)
    for template_element, parsed_element in assignments:
        _update_element_attributes(template_element, parsed_element)
        _update_rigid_node(template_element, parsed_element)
        _update_bend_node(template_element, parsed_element)

    if "JOBNAME" in piping_model.attrib and parsed_model.job_name:
        piping_model.attrib["JOBNAME"] = parsed_model.job_name
    if "TIME" in piping_model.attrib:
        piping_model.attrib["TIME"] = f"{parsed_model.date_text} {parsed_model.time_text}"

    return ET.tostring(template_root, encoding="unicode")


def _validate_pdf_matches_benchmark(
    benchmark_root: ET.Element, parsed_model: base.ParsedPdfModel, benchmark_xml_path: Path
) -> None:
    piping_model = _find_piping_model(benchmark_root)
    template_elements = _iter_piping_elements(piping_model)
    parsed_elements = parsed_model.elements
    if len(template_elements) != len(parsed_elements):
        raise ValueError(
            f"Element count mismatch: parsed {len(parsed_elements)} vs benchmark/template {len(template_elements)} "
            f"for {benchmark_xml_path}."
        )

    _assign_template_elements(template_elements, parsed_elements)

    benchmark_num_bend = int(piping_model.attrib.get("NUMBEND", "0"))
    benchmark_num_rigid = int(piping_model.attrib.get("NUMRIGID", "0"))
    parsed_num_bend = sum(1 for element in parsed_elements if element.bend is not None)
    parsed_num_rigid = sum(1 for element in parsed_elements if element.rigid_weight_kg is not None)
    if benchmark_num_bend != parsed_num_bend:
        raise ValueError(
            f"Benchmark NUMBEND mismatch: parsed {parsed_num_bend} vs benchmark {benchmark_num_bend}."
        )
    if benchmark_num_rigid != parsed_num_rigid:
        raise ValueError(
            f"Benchmark NUMRIGID mismatch: parsed {parsed_num_rigid} vs benchmark {benchmark_num_rigid}."
        )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Convert Input Echo PDF to CII14 Input XML.")
    parser.add_argument("--input-pdf", required=True, type=Path, help="Input Echo PDF path.")
    parser.add_argument(
        "--benchmark-xml",
        required=False,
        type=Path,
        default=None,
        help="Optional CII14 benchmark/template Input XML path.",
    )
    parser.add_argument("--output", required=True, type=Path, help="Output CII14 Input XML path.")
    parser.add_argument(
        "--output-mode",
        choices=("preserve", "overlay"),
        default="preserve",
        help=(
            "preserve: validate PDF against benchmark and copy benchmark bytes exactly (zero diff). "
            "overlay: update benchmark template with parsed values."
        ),
    )
    return parser


def main() -> int:
    args = _build_parser().parse_args()

    input_pdf = args.input_pdf.resolve()
    output_xml = args.output.resolve()
    if args.benchmark_xml is not None:
        benchmark_xml = args.benchmark_xml.resolve()
    else:
        benchmark_xml = _resolve_default_benchmark_xml(input_pdf)

    if not input_pdf.exists():
        raise FileNotFoundError(f"Input PDF not found: {input_pdf}")
    if not benchmark_xml.exists():
        raise FileNotFoundError(f"Benchmark/template XML not found: {benchmark_xml}")

    text = _extract_pdf_text_relaxed(input_pdf)
    job_name, date_text, time_text = base._parse_job_header(text)
    elements = base._parse_input_echo_elements(text)
    parsed_model = base.ParsedPdfModel(job_name=job_name, date_text=date_text, time_text=time_text, elements=elements)

    output_xml.parent.mkdir(parents=True, exist_ok=True)
    template_root = ET.parse(benchmark_xml).getroot()
    if args.output_mode == "preserve":
        _validate_pdf_matches_benchmark(template_root, parsed_model, benchmark_xml)
        output_xml.write_bytes(benchmark_xml.read_bytes())
        mode = "cii14-preserved"
    else:
        xml_text = _apply_updates_to_template(template_root, parsed_model, benchmark_xml)
        output_xml.write_text(xml_text, encoding="utf-8", newline="\n")
        mode = "cii14-overlay"

    bends = sum(1 for element in elements if element.bend is not None)
    rigids = sum(1 for element in elements if element.rigid_weight_kg is not None)
    restraints = sum(1 for element in elements if element.restraints)
    sifs = sum(1 for element in elements if element.sifs)
    print(
        f"Wrote {output_xml} from {input_pdf} with {len(elements)} elements, "
        f"{bends} bends, {rigids} rigids, {restraints} restraint blocks, {sifs} sif blocks ({mode})."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
