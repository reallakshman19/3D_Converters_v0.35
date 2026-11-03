#!/usr/bin/env python3
"""
Convert rvmparser hierarchy JSON (`--output-json`) into PSI-style XML (`PipeStressExport`).

Functionality:
- Parses hierarchy JSON produced by rvmparser.
- Extracts leaf geometry/group entries with bounding boxes.
- Groups components by inferred branch key and emits synthetic node chains.
- Writes XML aligned with PSI116 shape (`Pipe > Branch > Node`).

Parameters expected:
- `--input`: input JSON path from rvmparser.
- `--output`: output XML path.
- Optional controls for scaling, node numbering, and defaults.

Outputs passed:
- One XML file containing `PipeStressExport` with synthetic topology.

Fallback:
- When exact geometric endpoints are unavailable in JSON, node endpoints are
  approximated from bbox min/max corners. [GUESSED]
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime
import json
import math
from pathlib import Path
import re
from typing import Any, Iterable
import xml.etree.ElementTree as ET


XML_NS = "http://aveva.com/pipeStress116.xsd"


@dataclass(frozen=True)
class ComponentSeed:
    branch_key: str
    component_name: str
    component_type: str
    bbox: tuple[float, float, float, float, float, float]
    item_code: str


@dataclass(frozen=True)
class BranchMockConfig:
    temperatures: tuple[float, ...]
    pressures: tuple[float, ...]
    material_number: int
    insulation_density: float
    fluid_density: float


@dataclass(frozen=True)
class NodeMockConfig:
    wall_thickness: float
    corrosion_allowance: float
    insulation_thickness: float
    diameter: float


@dataclass(frozen=True)
class HeaderInfo:
    date_time: str
    source: str
    version: str
    user_name: str
    purpose: str
    project_name: str
    mdb_name: str
    title_line: str


@dataclass(frozen=True)
class NodeRecord:
    node_number: int
    node_name: str
    endpoint: int
    component_type: str
    weight: float
    component_ref_no: str
    connection_type: str
    outside_diameter: float
    wall_thickness: float
    corrosion_allowance: float
    insulation_thickness: float
    position: tuple[float, float, float]
    bend_radius: float
    sif: int
    rigid: int | None
    alpha_angle: float | None
    bend_type: int | None


def _q(name: str) -> str:
    return f"{{{XML_NS}}}{name}"


def _safe_text(value: str | None) -> str:
    if value is None:
        return ""
    return value.strip()


def _add_text(parent: ET.Element, tag: str, value: str) -> ET.Element:
    element = ET.SubElement(parent, _q(tag))
    element.text = value
    return element


def _fmt_number(value: float, decimals: int) -> str:
    if not math.isfinite(value):
        return "0"
    rounded = round(value, decimals)
    if abs(rounded - round(rounded)) < 1e-12:
        return str(int(round(rounded)))
    text = f"{rounded:.{decimals}f}"
    return text.rstrip("0").rstrip(".")


def _fmt_position(position: tuple[float, float, float]) -> str:
    return (
        f"{_fmt_number(position[0], 2)} "
        f"{_fmt_number(position[1], 2)} "
        f"{_fmt_number(position[2], 2)}"
    )


def _parse_header_datetime(value: str) -> str:
    text = _safe_text(value)
    if not text:
        now = datetime.now()
        return f"{now:%H:%M:%S} {now.day} {now:%B %Y}"
    try:
        parsed = datetime.strptime(text, "%a %b %d %H:%M:%S %Y")
    except ValueError:
        now = datetime.now()
        return f"{now:%H:%M:%S} {now.day} {now:%B %Y}"
    return f"{parsed:%H:%M:%S} {parsed.day} {parsed:%B %Y}"


def _extract_version(info: str) -> str:
    match = re.search(r"MK([0-9]+(?:\.[0-9]+)+)", _safe_text(info).upper())
    if match:
        return match.group(1)
    return "0.0.0.0"


def _component_type_from_name(name: str) -> str:
    upper = _safe_text(name).upper()
    if "ELBOW" in upper or "BEND" in upper:
        return "ELBO"
    if "REDUCER" in upper or upper.startswith("REDU"):
        return "REDU"
    if "TEE" in upper:
        return "TEE"
    if "VALVE" in upper or "VALV" in upper:
        return "VALV"
    if "GASK" in upper:
        return "GASK"
    if "FLANGE" in upper or "FLAN" in upper:
        return "FLAN"
    if "SUPPORT" in upper or "PIPESUPP" in upper:
        return "ATTA"
    return "RIGID"


def _extract_branch_key(path_or_name: str) -> str:
    text = _safe_text(path_or_name)
    match = re.search(r"BRANCH\s+([^ ]+)", text, re.IGNORECASE)
    if match:
        return _safe_text(match.group(1))
    path_match = re.search(r"(/[^ ]+/B[0-9]+)", text)
    if path_match:
        return _safe_text(path_match.group(1))
    return "UNSPECIFIED-BRANCH"


def _bbox_to_diameter_mm(
    bbox: tuple[float, float, float, float, float, float],
    coord_factor: float,
    fallback: float,
) -> float:
    dx = abs(bbox[3] - bbox[0]) * coord_factor
    dy = abs(bbox[4] - bbox[1]) * coord_factor
    dz = abs(bbox[5] - bbox[2]) * coord_factor
    candidates = [value for value in [dx, dy, dz] if value > 1e-9]
    if not candidates:
        return fallback
    candidates.sort()
    return max(fallback, candidates[0])


def _bbox_endpoints_mm(
    bbox: tuple[float, float, float, float, float, float],
    coord_factor: float,
) -> tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]:
    min_point = (bbox[0] * coord_factor, bbox[1] * coord_factor, bbox[2] * coord_factor)
    max_point = (bbox[3] * coord_factor, bbox[4] * coord_factor, bbox[5] * coord_factor)
    center = (
        ((bbox[0] + bbox[3]) * 0.5) * coord_factor,
        ((bbox[1] + bbox[4]) * 0.5) * coord_factor,
        ((bbox[2] + bbox[5]) * 0.5) * coord_factor,
    )
    return min_point, max_point, center


def _walk_tree(
    node: dict[str, Any],
    parent_path: str,
    out: list[ComponentSeed],
) -> None:
    name = _safe_text(node.get("name")) or parent_path
    current_path = f"{parent_path}/{name}" if parent_path else name
    children = node.get("children")
    bbox = node.get("bbox")
    is_leaf = not isinstance(children, list) or len(children) == 0

    if is_leaf and isinstance(bbox, list) and len(bbox) == 6:
        bbox_tuple = (
            float(bbox[0]),
            float(bbox[1]),
            float(bbox[2]),
            float(bbox[3]),
            float(bbox[4]),
            float(bbox[5]),
        )
        branch_key = _extract_branch_key(name if name else current_path)
        item_code = name[:40] if name else "ITEM"
        out.append(
            ComponentSeed(
                branch_key=branch_key,
                component_name=name or "COMPONENT",
                component_type=_component_type_from_name(name),
                bbox=bbox_tuple,
                item_code=item_code,
            )
        )

    if isinstance(children, list):
        for child in children:
            if isinstance(child, dict):
                _walk_tree(child, current_path, out)


def _extract_header_and_components(payload: Any) -> tuple[HeaderInfo, list[ComponentSeed]]:
    roots: list[dict[str, Any]] = []
    if isinstance(payload, list):
        roots = [entry for entry in payload if isinstance(entry, dict)]
    elif isinstance(payload, dict):
        roots = [payload]
    else:
        raise ValueError("Input JSON must be an object or array.")

    if not roots:
        raise ValueError("Input JSON contains no root objects.")

    header_source = roots[0]
    info_text = _safe_text(header_source.get("info"))
    date_text = _safe_text(header_source.get("date"))
    user_text = _safe_text(header_source.get("user"))
    note_text = _safe_text(header_source.get("note"))

    components: list[ComponentSeed] = []
    for root in roots:
        _walk_tree(root, "", components)

    if not components:
        raise ValueError("No bbox-backed leaf components were found in JSON input.")

    project_name = ""
    mdb_name = ""
    for root in roots:
        children = root.get("children")
        if not isinstance(children, list):
            continue
        for first in children:
            if not isinstance(first, dict):
                continue
            project_name = _safe_text(first.get("project")) or project_name
            mdb_name = _safe_text(first.get("name")) or mdb_name
            if project_name or mdb_name:
                break
        if project_name or mdb_name:
            break

    header = HeaderInfo(
        date_time=_parse_header_datetime(date_text),
        source="RVM JSON",
        version=_extract_version(info_text),
        user_name=user_text,
        purpose=note_text or "Converted from RVM JSON",
        project_name=project_name,
        mdb_name=mdb_name if mdb_name.startswith("/") else (f"/{mdb_name}" if mdb_name else ""),
        title_line="RVM JSON to PSI XML",
    )
    return header, components


def _build_nodes_for_component(
    component: ComponentSeed,
    component_id: int,
    node_number: int,
    node_step: int,
    coord_factor: float,
    node_defaults: NodeMockConfig,
) -> tuple[list[NodeRecord], int]:
    p0, p1, pc = _bbox_endpoints_mm(component.bbox, coord_factor)
    diameter = _bbox_to_diameter_mm(component.bbox, coord_factor, node_defaults.diameter)
    ref_no = f"=JSON/{component_id}"
    nodes: list[NodeRecord] = []

    nodes.append(
        NodeRecord(
            node_number=node_number,
            node_name=component.item_code,
            endpoint=1,
            component_type=component.component_type,
            weight=0.0,
            component_ref_no=ref_no,
            connection_type="",
            outside_diameter=diameter,
            wall_thickness=node_defaults.wall_thickness,
            corrosion_allowance=node_defaults.corrosion_allowance,
            insulation_thickness=node_defaults.insulation_thickness,
            position=p0,
            bend_radius=0.0,
            sif=0,
            rigid=1 if component.component_type == "RIGID" else None,
            alpha_angle=None,
            bend_type=None,
        )
    )
    node_number += node_step

    nodes.append(
        NodeRecord(
            node_number=node_number,
            node_name="",
            endpoint=2,
            component_type=component.component_type,
            weight=0.0,
            component_ref_no=ref_no,
            connection_type="",
            outside_diameter=diameter,
            wall_thickness=node_defaults.wall_thickness,
            corrosion_allowance=node_defaults.corrosion_allowance,
            insulation_thickness=node_defaults.insulation_thickness,
            position=p1,
            bend_radius=0.0,
            sif=0,
            rigid=2 if component.component_type == "RIGID" else None,
            alpha_angle=None,
            bend_type=None,
        )
    )
    node_number += node_step

    if component.component_type == "ELBO":
        radius = math.sqrt(
            (pc[0] - p0[0]) ** 2 + (pc[1] - p0[1]) ** 2 + (pc[2] - p0[2]) ** 2
        )
        nodes.append(
            NodeRecord(
                node_number=node_number,
                node_name="",
                endpoint=0,
                component_type=component.component_type,
                weight=0.0,
                component_ref_no=ref_no,
                connection_type="",
                outside_diameter=diameter,
                wall_thickness=node_defaults.wall_thickness,
                corrosion_allowance=node_defaults.corrosion_allowance,
                insulation_thickness=node_defaults.insulation_thickness,
                position=pc,
                bend_radius=radius,
                sif=0,
                rigid=None,
                alpha_angle=None,
                bend_type=0,
            )
        )
        node_number += node_step

    return nodes, node_number


def _create_units(parent: ET.Element) -> None:
    units = ET.SubElement(parent, _q("Units"))
    _add_text(units, "DistanceUnits", "mm")
    _add_text(units, "BoreUnits", "mm")
    _add_text(units, "PressureUnits", "pascal")
    _add_text(units, "TemperatureUnits", "degC")
    _add_text(units, "WeightUnits", "kg")
    _add_text(units, "ForceUnits", "newton")
    _add_text(units, "WallThicknessUnits", "mm")
    _add_text(units, "FluidDensityUnits", "kg/m3")


def _create_temperature_pressure(branch_element: ET.Element, mock: BranchMockConfig) -> None:
    temperature = ET.SubElement(branch_element, _q("Temperature"))
    pressure = ET.SubElement(branch_element, _q("Pressure"))
    for index, value in enumerate(mock.temperatures, start=1):
        _add_text(temperature, f"Temperature{index}", _fmt_number(value, 0))
    for index, value in enumerate(mock.pressures, start=1):
        _add_text(pressure, f"Pressure{index}", _fmt_number(value, 0))
    _add_text(branch_element, "MaterialNumber", str(mock.material_number))
    _add_text(branch_element, "InsulationDensity", _fmt_number(mock.insulation_density, 0))
    _add_text(branch_element, "FluidDensity", _fmt_number(mock.fluid_density, 0))


def _create_node_xml(branch_element: ET.Element, node: NodeRecord) -> None:
    node_element = ET.SubElement(branch_element, _q("Node"))
    _add_text(node_element, "NodeNumber", str(node.node_number))
    _add_text(node_element, "NodeName", node.node_name)
    _add_text(node_element, "Endpoint", str(node.endpoint))
    if node.rigid is not None:
        _add_text(node_element, "Rigid", str(node.rigid))
    _add_text(node_element, "ComponentType", node.component_type)
    _add_text(node_element, "Weight", _fmt_number(node.weight, 3))
    _add_text(node_element, "ComponentRefNo", node.component_ref_no)
    _add_text(node_element, "ConnectionType", node.connection_type)
    _add_text(node_element, "OutsideDiameter", _fmt_number(node.outside_diameter, 3))
    _add_text(node_element, "WallThickness", _fmt_number(node.wall_thickness, 3))
    _add_text(node_element, "CorrosionAllowance", _fmt_number(node.corrosion_allowance, 3))
    _add_text(node_element, "InsulationThickness", _fmt_number(node.insulation_thickness, 3))
    _add_text(node_element, "Position", _fmt_position(node.position))
    _add_text(node_element, "BendRadius", _fmt_number(node.bend_radius, 3))
    if node.bend_type is not None:
        _add_text(node_element, "BendType", str(node.bend_type))
    _add_text(node_element, "SIF", str(node.sif))


def _group_by_branch(components: Iterable[ComponentSeed]) -> list[tuple[str, list[ComponentSeed]]]:
    order: list[str] = []
    groups: dict[str, list[ComponentSeed]] = {}
    for component in components:
        key = component.branch_key or "UNSPECIFIED-BRANCH"
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(component)
    return [(key, groups[key]) for key in order]


def _build_xml(
    header: HeaderInfo,
    components: list[ComponentSeed],
    output_path: Path,
    coord_factor: float,
    node_start: int,
    node_step: int,
    branch_mock: BranchMockConfig,
    node_defaults: NodeMockConfig,
) -> tuple[int, int]:
    ET.register_namespace("", XML_NS)
    root = ET.Element(_q("PipeStressExport"))
    _add_text(root, "DateTime", header.date_time)
    _add_text(root, "Source", header.source)
    _add_text(root, "Version", header.version)
    _add_text(root, "UserName", header.user_name)
    _add_text(root, "Purpose", header.purpose)
    _add_text(root, "ProjectName", header.project_name)
    _add_text(root, "MDBName", header.mdb_name)
    _add_text(root, "TitleLine", header.title_line)
    root.append(ET.Comment(" Configuration information "))
    _create_units(root)
    _add_text(root, "RestrainOpenEnds", "Yes")
    _add_text(root, "AmbientTemperature", "")

    pipe = ET.SubElement(root, _q("Pipe"))
    _add_text(pipe, "FullName", header.mdb_name if header.mdb_name else "/RVM/JSON")
    _add_text(pipe, "Ref", "=RVM/JSON/1")

    grouped = _group_by_branch(components)
    next_node_number = node_start
    total_nodes = 0

    for branch_index, (branch_name, branch_components) in enumerate(grouped, start=1):
        branch_element = ET.SubElement(pipe, _q("Branch"))
        _add_text(branch_element, "Branchname", branch_name or f"BRANCH-{branch_index}")
        _create_temperature_pressure(branch_element, branch_mock)

        for offset, component in enumerate(branch_components, start=1):
            component_id = (branch_index * 100000) + offset
            nodes, next_node_number = _build_nodes_for_component(
                component=component,
                component_id=component_id,
                node_number=next_node_number,
                node_step=node_step,
                coord_factor=coord_factor,
                node_defaults=node_defaults,
            )
            total_nodes += len(nodes)
            for node in nodes:
                _create_node_xml(branch_element, node)

    tree = ET.ElementTree(root)
    if hasattr(ET, "indent"):
        ET.indent(tree, space="  ")
    tree.write(output_path, encoding="utf-8", xml_declaration=True)
    return len(grouped), total_nodes


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Convert rvmparser JSON to PSI-style XML.")
    parser.add_argument("--input", required=True, type=Path, help="Input JSON path.")
    parser.add_argument("--output", required=True, type=Path, help="Output XML path.")
    parser.add_argument(
        "--coord-factor",
        required=False,
        type=float,
        default=1000.0,
        help="Multiplier applied to bbox coordinates (default: 1000).",
    )
    parser.add_argument("--node-start", required=False, type=int, default=10, help="First node number.")
    parser.add_argument("--node-step", required=False, type=int, default=10, help="Node step increment.")
    parser.add_argument(
        "--default-diameter",
        required=False,
        type=float,
        default=100.0,
        help="Fallback outside diameter in mm when bbox-based estimate is unavailable.",
    )
    parser.add_argument(
        "--default-wall-thickness",
        required=False,
        type=float,
        default=0.01,
        help="Default wall thickness in mm.",
    )
    parser.add_argument(
        "--default-corrosion-allowance",
        required=False,
        type=float,
        default=0.0,
        help="Default corrosion allowance in mm.",
    )
    parser.add_argument(
        "--default-insulation-thickness",
        required=False,
        type=float,
        default=0.0,
        help="Default insulation thickness in mm.",
    )
    parser.add_argument(
        "--mock-temperature",
        required=False,
        type=float,
        default=-100000.0,
        help="Branch Temperature1 default.",
    )
    parser.add_argument(
        "--mock-temperature-other",
        required=False,
        type=float,
        default=-100000.0,
        help="Branch Temperature2..9 default.",
    )
    parser.add_argument(
        "--mock-pressure",
        required=False,
        type=float,
        default=0.0,
        help="Branch Pressure1 default.",
    )
    parser.add_argument(
        "--mock-pressure-other",
        required=False,
        type=float,
        default=0.0,
        help="Branch Pressure2..9 default.",
    )
    parser.add_argument(
        "--mock-material-number",
        required=False,
        type=int,
        default=0,
        help="Branch MaterialNumber default.",
    )
    parser.add_argument(
        "--mock-insulation-density",
        required=False,
        type=float,
        default=0.0,
        help="Branch insulation density default.",
    )
    parser.add_argument(
        "--mock-fluid-density",
        required=False,
        type=float,
        default=0.0,
        help="Branch fluid density default.",
    )
    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    if args.coord_factor <= 0.0:
        raise ValueError("--coord-factor must be greater than zero.")
    if args.node_start <= 0:
        raise ValueError("--node-start must be greater than zero.")
    if args.node_step <= 0:
        raise ValueError("--node-step must be greater than zero.")
    if args.default_diameter <= 0.0:
        raise ValueError("--default-diameter must be greater than zero.")

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    header, components = _extract_header_and_components(payload)

    branch_mock = BranchMockConfig(
        temperatures=(args.mock_temperature,) + tuple(args.mock_temperature_other for _ in range(8)),
        pressures=(args.mock_pressure,) + tuple(args.mock_pressure_other for _ in range(8)),
        material_number=args.mock_material_number,
        insulation_density=args.mock_insulation_density,
        fluid_density=args.mock_fluid_density,
    )
    node_defaults = NodeMockConfig(
        wall_thickness=args.default_wall_thickness,
        corrosion_allowance=args.default_corrosion_allowance,
        insulation_thickness=args.default_insulation_thickness,
        diameter=args.default_diameter,
    )

    branch_count, node_count = _build_xml(
        header=header,
        components=components,
        output_path=args.output,
        coord_factor=args.coord_factor,
        node_start=args.node_start,
        node_step=args.node_step,
        branch_mock=branch_mock,
        node_defaults=node_defaults,
    )
    print(
        f"Wrote {args.output} from {args.input} with "
        f"{branch_count} branch(es), {node_count} node(s), {len(components)} seed components."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
