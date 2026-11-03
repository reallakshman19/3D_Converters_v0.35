#!/usr/bin/env python3
"""
Convert REV text exported by rvmparser into PSI-style XML (`PipeStressExport`).

Functionality:
- Reuses the existing REV parser and primitive->component mapping from `rev_to_pcf.py`.
- Builds XML in the schema shape used by `Doc/PSI116.xsd` and `Doc/GH-PRODUCTION-TY-04.xml`.
- Groups converted components into branches inferred from REV group paths.
- Uses explicit mock values for unavailable process/stress data.
- Supports E3D-like branch temperature/pressure layout (`Temperature1`/`Pressure1` plus separate
  defaults for `2..9`) and optional PSI rigid tagging heuristics.

Parameters expected:
- `--input`: path to input REV file.
- `--output`: path to output XML file.
- `--coord-factor`: scaling factor applied to coordinates/diameters (typically 1000 for m->mm).
- Optional metadata/mocks arguments for project/user-facing fields.

Outputs passed:
- One XML file containing `PipeStressExport > Pipe > Branch > Node` records.
- Summary printed to stdout (branches, nodes, component distribution).

Fallback:
- Unknown component classes are emitted as `PCOM`.
- Missing process/stress data is filled with mock values aligned with sample conventions.
"""

from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
import math
from pathlib import Path
import re
from typing import Iterable
import xml.etree.ElementTree as ET

from rev_to_pcf import (
    PcfComponent,
    RevHeader,
    _assign_support_bore_from_neighbors,
    _primitive_to_component,
    parse_rev,
)


XML_NS = "http://aveva.com/pipeStress116.xsd"


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
    restraint: tuple[str, float, float, float] | None


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


@dataclass
class SharedNodeRegistry:
    """Coordinate-indexed registry used to reuse node numbers at shared junctions."""

    tolerance: float
    buckets: dict[tuple[int, int, int], list[tuple[tuple[float, float, float], int]]] = field(default_factory=dict)


def _q(name: str) -> str:
    return f"{{{XML_NS}}}{name}"


def _add_text(parent: ET.Element, tag: str, value: str) -> ET.Element:
    element = ET.SubElement(parent, _q(tag))
    element.text = value
    return element


def _safe_text(value: str) -> str:
    return value.strip() if isinstance(value, str) else ""


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
    text = value.strip()
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
    match = re.search(r"MK([0-9]+(?:\.[0-9]+)+)", info.upper())
    if match:
        return match.group(1)
    return "0.0.0.0"


def _extract_branch_name(description: str) -> str:
    text = _safe_text(description)
    if not text:
        return "UNSPECIFIED-BRANCH"

    branch_match = re.search(r"BRANCH\s+\d+\s+of\s+PIPE\s+\d+\s+of\s+ZONE\s+[^>]+", text, re.IGNORECASE)
    if branch_match:
        return _safe_text(branch_match.group(0))

    pipe_match = re.search(r"PIPE\s+\d+\s+of\s+ZONE\s+[^>]+", text, re.IGNORECASE)
    if pipe_match:
        return _safe_text(pipe_match.group(0))

    return "UNSPECIFIED-BRANCH"


def _infer_xml_component_type(component: PcfComponent) -> str:
    base = _safe_text(component.get("component_type", "")).upper()
    description = _safe_text(component.get("description", "")).upper()
    item_code = _safe_text(component.get("item_code", "")).upper()
    combined = f"{description} {item_code}"

    if base in {"ELBOW", "BEND"}:
        return "ELBO"
    if base.startswith("REDUCER"):
        return "REDU"
    if base == "TEE":
        return "TEE"
    if base == "VALVE":
        return "VALV"
    if base == "SUPPORT":
        return "ATTA"
    if base == "PIPE":
        return "RIGID"
    if "GASK" in combined:
        return "GASK"
    if "FLANGE" in combined or "FLAN" in combined:
        return "FLAN"
    if "OLET" in combined:
        return "OLET"
    if "BRAN" in combined:
        return "BRAN"
    return "PCOM"


def _distance(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    dx = a[0] - b[0]
    dy = a[1] - b[1]
    dz = a[2] - b[2]
    return math.sqrt(dx * dx + dy * dy + dz * dz)


def _scale_endpoint(
    endpoint: tuple[float, float, float, float], coord_factor: float
) -> tuple[float, float, float, float]:
    return (
        endpoint[0] * coord_factor,
        endpoint[1] * coord_factor,
        endpoint[2] * coord_factor,
        endpoint[3] * coord_factor,
    )


def _compute_reducer_angle_deg(
    p0: tuple[float, float, float, float], p1: tuple[float, float, float, float]
) -> float | None:
    length = _distance((p0[0], p0[1], p0[2]), (p1[0], p1[1], p1[2]))
    if length < 1e-9:
        return None
    diameter_delta = abs(p1[3] - p0[3])
    angle = math.degrees(math.atan(diameter_delta / (2.0 * length)))
    return angle


def _allocate_unique_node_number(next_node_number: int, node_step: int) -> tuple[int, int]:
    return next_node_number, next_node_number + node_step


def _bucket_index(position: tuple[float, float, float], tolerance: float) -> tuple[int, int, int]:
    return (
        int(math.floor(position[0] / tolerance)),
        int(math.floor(position[1] / tolerance)),
        int(math.floor(position[2] / tolerance)),
    )


def _get_shared_node_number(
    position: tuple[float, float, float],
    registry: SharedNodeRegistry,
) -> int | None:
    base_bucket = _bucket_index(position, registry.tolerance)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                bucket = (base_bucket[0] + dx, base_bucket[1] + dy, base_bucket[2] + dz)
                entries = registry.buckets.get(bucket)
                if not entries:
                    continue
                for existing_position, existing_number in entries:
                    if _distance(position, existing_position) <= registry.tolerance:
                        return existing_number
    return None


def _register_shared_node_number(
    position: tuple[float, float, float],
    node_number: int,
    registry: SharedNodeRegistry,
) -> None:
    bucket = _bucket_index(position, registry.tolerance)
    registry.buckets.setdefault(bucket, []).append((position, node_number))


def _allocate_shared_or_unique_node_number(
    position: tuple[float, float, float],
    allow_share: bool,
    registry: SharedNodeRegistry,
    next_node_number: int,
    node_step: int,
) -> tuple[int, int]:
    if allow_share:
        shared_number = _get_shared_node_number(position=position, registry=registry)
        if shared_number is not None:
            return shared_number, next_node_number
        allocated, new_next = _allocate_unique_node_number(next_node_number=next_node_number, node_step=node_step)
        _register_shared_node_number(position=position, node_number=allocated, registry=registry)
        return allocated, new_next
    return _allocate_unique_node_number(next_node_number=next_node_number, node_step=node_step)


def _validate_duplicate_node_numbers(
    branch_nodes: list[list[NodeRecord]],
    tolerance: float,
) -> None:
    by_number: dict[int, tuple[float, float, float]] = {}
    for nodes in branch_nodes:
        for node in nodes:
            if node.node_number <= 0:
                raise ValueError(f"Encountered non-positive NodeNumber {node.node_number}.")
            existing = by_number.get(node.node_number)
            if existing is None:
                by_number[node.node_number] = node.position
                continue
            if _distance(existing, node.position) > tolerance:
                raise ValueError(
                    "Duplicate NodeNumber mapped to different coordinates: "
                    f"{node.node_number} at {_fmt_position(existing)} and {_fmt_position(node.position)}"
                )


def _build_nodes_for_component(
    component: PcfComponent,
    component_id: int,
    start_node_number: int,
    node_step: int,
    coord_factor: float,
    node_mock: NodeMockConfig,
    enable_psi_rigid_logic: bool,
    shared_registry: SharedNodeRegistry,
) -> tuple[list[NodeRecord], int]:
    nodes: list[NodeRecord] = []
    xml_type = _infer_xml_component_type(component)
    component_ref = f"=REV/{component_id}"
    next_node_number = start_node_number

    support_coords = component.get("support_coords")
    if support_coords is not None:
        sx = support_coords[0] * coord_factor
        sy = support_coords[1] * coord_factor
        sz = support_coords[2] * coord_factor
        sd = support_coords[3] * coord_factor
        node_number, next_node_number = _allocate_unique_node_number(
            next_node_number=next_node_number,
            node_step=node_step,
        )
        nodes.append(
            NodeRecord(
                node_number=node_number,
                node_name=_safe_text(component.get("item_code", "")),
                endpoint=0,
                component_type="ATTA",
                weight=0.0,
                component_ref_no=component_ref,
                connection_type="",
                outside_diameter=sd if sd > 0.0 else 0.0,
                wall_thickness=node_mock.wall_thickness,
                corrosion_allowance=node_mock.corrosion_allowance,
                insulation_thickness=node_mock.insulation_thickness,
                position=(sx, sy, sz),
                bend_radius=0.0,
                sif=0,
                rigid=None,
                alpha_angle=None,
                bend_type=None,
                restraint=("Z", 0.0, 0.0, 0.3),
            )
        )
        return nodes, next_node_number

    end_points_raw = component.get("end_points", [])
    if not end_points_raw:
        return nodes, next_node_number

    end_points = [_scale_endpoint(endpoint, coord_factor) for endpoint in end_points_raw]
    reducer_angle = None
    if xml_type == "REDU" and len(end_points) >= 2:
        reducer_angle = _compute_reducer_angle_deg(end_points[0], end_points[1])

    center_point_raw = component.get("center_point")
    center_point = None
    if center_point_raw is not None:
        center_point = (
            center_point_raw[0] * coord_factor,
            center_point_raw[1] * coord_factor,
            center_point_raw[2] * coord_factor,
        )

    elbow_radius = 0.0
    if xml_type == "ELBO" and center_point is not None and end_points:
        elbow_radius = _distance(center_point, (end_points[0][0], end_points[0][1], end_points[0][2]))

    rigid_end_types = {"GASK", "FLAN"}
    rigid_end_or_center_types = {"VALV", "FILT", "INST", "PCOM", "TRAP"}

    for endpoint_index, endpoint in enumerate(end_points):
        endpoint_no = endpoint_index + 1
        rigid_flag = None
        if xml_type == "RIGID":
            if endpoint_no == 1:
                rigid_flag = 1
            elif endpoint_no == 2:
                rigid_flag = 2
        elif enable_psi_rigid_logic:
            if endpoint_no == 1 and (xml_type in rigid_end_types or xml_type in rigid_end_or_center_types):
                rigid_flag = 1
            elif endpoint_no == 2 and (xml_type in rigid_end_types or xml_type in rigid_end_or_center_types):
                rigid_flag = 2

        alpha_angle = None
        if reducer_angle is not None and endpoint_no == 2:
            alpha_angle = reducer_angle

        bend_type = None
        if xml_type == "ELBO" and endpoint_no == 1:
            bend_type = 0

        node_name = _safe_text(component.get("item_code", "")) if endpoint_no == 1 else ""
        node_number, next_node_number = _allocate_shared_or_unique_node_number(
            position=(endpoint[0], endpoint[1], endpoint[2]),
            allow_share=(xml_type != "ATTA"),
            registry=shared_registry,
            next_node_number=next_node_number,
            node_step=node_step,
        )
        nodes.append(
            NodeRecord(
                node_number=node_number,
                node_name=node_name,
                endpoint=endpoint_no,
                component_type=xml_type,
                weight=0.0,
                component_ref_no=component_ref,
                connection_type=xml_type if xml_type == "BRAN" else "",
                outside_diameter=endpoint[3],
                wall_thickness=node_mock.wall_thickness,
                corrosion_allowance=node_mock.corrosion_allowance,
                insulation_thickness=node_mock.insulation_thickness,
                position=(endpoint[0], endpoint[1], endpoint[2]),
                bend_radius=elbow_radius if xml_type == "ELBO" else 0.0,
                sif=0,
                rigid=rigid_flag,
                alpha_angle=alpha_angle,
                bend_type=bend_type,
                restraint=None,
            )
        )

    if xml_type in {"ELBO", "TEE"} and center_point is not None:
        mean_diameter = sum(endpoint[3] for endpoint in end_points) / float(len(end_points))
        node_number, next_node_number = _allocate_unique_node_number(
            next_node_number=next_node_number,
            node_step=node_step,
        )
        nodes.append(
            NodeRecord(
                node_number=node_number,
                node_name="",
                endpoint=0,
                component_type=xml_type,
                weight=0.0,
                component_ref_no=component_ref,
                connection_type=xml_type if xml_type == "BRAN" else "",
                outside_diameter=mean_diameter,
                wall_thickness=node_mock.wall_thickness,
                corrosion_allowance=node_mock.corrosion_allowance,
                insulation_thickness=node_mock.insulation_thickness,
                position=center_point,
                bend_radius=0.0,
                sif=0,
                rigid=2 if (enable_psi_rigid_logic and xml_type in rigid_end_or_center_types) else None,
                alpha_angle=None,
                bend_type=None,
                restraint=None,
            )
        )

    return nodes, next_node_number


def _group_components_by_branch(components: Iterable[PcfComponent]) -> list[tuple[str, list[PcfComponent]]]:
    ordered_branch_names: list[str] = []
    grouped: dict[str, list[PcfComponent]] = {}

    for component in components:
        description = _safe_text(component.get("description", ""))
        branch_name = _extract_branch_name(description)
        if branch_name not in grouped:
            grouped[branch_name] = []
            ordered_branch_names.append(branch_name)
        grouped[branch_name].append(component)

    return [(branch_name, grouped[branch_name]) for branch_name in ordered_branch_names]


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
    if len(mock.temperatures) != 9:
        raise ValueError(f"Expected 9 branch temperatures, got {len(mock.temperatures)}.")
    if len(mock.pressures) != 9:
        raise ValueError(f"Expected 9 branch pressures, got {len(mock.pressures)}.")

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
    if node.alpha_angle is not None:
        _add_text(node_element, "AlphaAngle", _fmt_number(node.alpha_angle, 2))
    _add_text(node_element, "InsulationThickness", _fmt_number(node.insulation_thickness, 3))
    _add_text(node_element, "Position", _fmt_position(node.position))
    _add_text(node_element, "BendRadius", _fmt_number(node.bend_radius, 3))
    if node.bend_type is not None:
        _add_text(node_element, "BendType", str(node.bend_type))
    _add_text(node_element, "SIF", str(node.sif))

    if node.restraint is not None:
        restraint = ET.SubElement(node_element, _q("Restraint"))
        _add_text(restraint, "Type", node.restraint[0])
        _add_text(restraint, "Stiffness", _fmt_number(node.restraint[1], 3))
        _add_text(restraint, "Gap", _fmt_number(node.restraint[2], 3))
        _add_text(restraint, "Friction", _fmt_number(node.restraint[3], 3))


def _build_xml(
    output_path: Path,
    header: RevHeader,
    components: list[PcfComponent],
    coord_factor: float,
    source_name: str,
    version_text: str,
    purpose_text: str,
    project_name: str,
    mdb_name: str,
    title_line: str,
    branch_mock: BranchMockConfig,
    node_mock: NodeMockConfig,
    restrain_open_ends: str,
    ambient_temperature: str,
    node_start: int,
    node_step: int,
    node_merge_tolerance: float,
    enable_psi_rigid_logic: bool,
) -> tuple[int, int]:
    ET.register_namespace("", XML_NS)
    root = ET.Element(_q("PipeStressExport"))

    _add_text(root, "DateTime", _parse_header_datetime(header.get("date", "")))
    _add_text(root, "Source", source_name)
    _add_text(root, "Version", version_text)
    _add_text(root, "UserName", _safe_text(header.get("user", "")))
    _add_text(root, "Purpose", purpose_text)
    _add_text(root, "ProjectName", project_name)
    _add_text(root, "MDBName", mdb_name)
    _add_text(root, "TitleLine", title_line)
    root.append(ET.Comment(" Configuration information "))
    _create_units(root)
    _add_text(root, "RestrainOpenEnds", restrain_open_ends)
    _add_text(root, "AmbientTemperature", ambient_temperature)

    pipe = ET.SubElement(root, _q("Pipe"))
    pipeline_name = _safe_text(header.get("model_name", ""))
    _add_text(pipe, "FullName", pipeline_name if pipeline_name.startswith("/") else f"/{pipeline_name}")
    _add_text(pipe, "Ref", "=REV/PIPE/1")

    grouped_branches = _group_components_by_branch(components)
    total_nodes = 0
    shared_registry = SharedNodeRegistry(tolerance=node_merge_tolerance)
    next_node_number = node_start
    branch_node_records: list[list[NodeRecord]] = []

    for branch_index, (branch_name, branch_components) in enumerate(grouped_branches, start=1):
        branch_element = ET.SubElement(pipe, _q("Branch"))
        _add_text(branch_element, "Branchname", branch_name or f"BRANCH-{branch_index}")
        _create_temperature_pressure(branch_element, branch_mock)

        current_branch_nodes: list[NodeRecord] = []
        for component_offset, component in enumerate(branch_components, start=1):
            component_id = (branch_index * 100000) + component_offset
            node_records, next_node_number = _build_nodes_for_component(
                component=component,
                component_id=component_id,
                start_node_number=next_node_number,
                node_step=node_step,
                coord_factor=coord_factor,
                node_mock=node_mock,
                enable_psi_rigid_logic=enable_psi_rigid_logic,
                shared_registry=shared_registry,
            )
            total_nodes += len(node_records)
            current_branch_nodes.extend(node_records)
            for node_record in node_records:
                _create_node_xml(branch_element, node_record)
        branch_node_records.append(current_branch_nodes)

    _validate_duplicate_node_numbers(branch_nodes=branch_node_records, tolerance=node_merge_tolerance)

    tree = ET.ElementTree(root)
    if hasattr(ET, "indent"):
        ET.indent(tree, space="  ")
    tree.write(output_path, encoding="utf-8", xml_declaration=True)
    return len(grouped_branches), total_nodes


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Convert REV text exported by rvmparser to PSI-style XML.")
    parser.add_argument("--input", required=True, type=Path, help="Input REV file path.")
    parser.add_argument("--output", required=True, type=Path, help="Output XML file path.")
    parser.add_argument(
        "--coord-factor",
        required=False,
        type=float,
        default=1000.0,
        help="Multiplier applied to coordinates/diameters before writing XML (default: 1000).",
    )
    parser.add_argument("--source", required=False, type=str, default="AVEVA PSI", help="XML Source field.")
    parser.add_argument(
        "--purpose",
        required=False,
        type=str,
        default="Preliminary stress run",
        help="XML Purpose field.",
    )
    parser.add_argument(
        "--title-line",
        required=False,
        type=str,
        default="PSI stress Output",
        help="XML TitleLine field.",
    )
    parser.add_argument(
        "--project-name",
        required=False,
        type=str,
        default="",
        help="Override ProjectName. Default: REV MODL project.",
    )
    parser.add_argument(
        "--mdb-name",
        required=False,
        type=str,
        default="",
        help="Override MDBName. Default: '/' + project name.",
    )
    parser.add_argument(
        "--restrain-open-ends",
        required=False,
        type=str,
        default="Yes",
        help="RestrainOpenEnds value.",
    )
    parser.add_argument(
        "--ambient-temperature",
        required=False,
        type=str,
        default="",
        help="AmbientTemperature raw value (empty string allowed).",
    )
    parser.add_argument(
        "--mock-temperature",
        required=False,
        type=float,
        default=-100000.0,
        help="Mock temperature used for Temperature1.",
    )
    parser.add_argument(
        "--mock-temperature-other",
        required=False,
        type=float,
        default=-100000.0,
        help="Mock temperature used for Temperature2..Temperature9 (E3D unset sentinel is -100000).",
    )
    parser.add_argument(
        "--mock-pressure",
        required=False,
        type=float,
        default=0.0,
        help="Mock pressure used for Pressure1.",
    )
    parser.add_argument(
        "--mock-pressure-other",
        required=False,
        type=float,
        default=0.0,
        help="Mock pressure used for Pressure2..Pressure9.",
    )
    parser.add_argument(
        "--mock-material-number",
        required=False,
        type=int,
        default=0,
        help="Mock MaterialNumber.",
    )
    parser.add_argument(
        "--mock-insulation-density",
        required=False,
        type=float,
        default=0.0,
        help="Mock InsulationDensity.",
    )
    parser.add_argument(
        "--mock-fluid-density",
        required=False,
        type=float,
        default=0.0,
        help="Mock FluidDensity.",
    )
    parser.add_argument(
        "--mock-wall-thickness",
        required=False,
        type=float,
        default=0.0,
        help="Mock WallThickness applied to generated nodes.",
    )
    parser.add_argument(
        "--mock-corrosion-allowance",
        required=False,
        type=float,
        default=0.0,
        help="Mock CorrosionAllowance applied to generated nodes.",
    )
    parser.add_argument(
        "--mock-insulation-thickness",
        required=False,
        type=float,
        default=0.0,
        help="Mock InsulationThickness applied to generated nodes.",
    )
    parser.add_argument(
        "--enable-psi-rigid-logic",
        action="store_true",
        help=(
            "Apply PSI-style rigid tagging heuristics for FLAN/GASK/VALV/FILT/INST/PCOM/TRAP "
            "in addition to explicit RIGID components."
        ),
    )
    parser.add_argument(
        "--node-start",
        required=False,
        type=int,
        default=10,
        help="First node number in each branch.",
    )
    parser.add_argument(
        "--node-step",
        required=False,
        type=int,
        default=10,
        help="Node number increment in each branch.",
    )
    parser.add_argument(
        "--node-merge-tolerance",
        required=False,
        type=float,
        default=0.5,
        help=(
            "Distance tolerance (in output coordinate units) for reusing node numbers at "
            "shared physical junctions."
        ),
    )
    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()
    if args.coord_factor <= 0.0:
        raise ValueError("--coord-factor must be greater than zero.")
    if args.node_step <= 0:
        raise ValueError("--node-step must be greater than zero.")
    if args.node_start <= 0:
        raise ValueError("--node-start must be greater than zero.")
    if args.node_merge_tolerance <= 0.0:
        raise ValueError("--node-merge-tolerance must be greater than zero.")

    header, primitives = parse_rev(args.input)
    components = [_primitive_to_component(primitive) for primitive in primitives]
    _assign_support_bore_from_neighbors(components)

    project_name = args.project_name.strip() if args.project_name.strip() else header.get("project", "").strip()
    mdb_name = args.mdb_name.strip() if args.mdb_name.strip() else f"/{project_name}" if project_name else ""

    branch_mock = BranchMockConfig(
        temperatures=(args.mock_temperature,) + tuple(args.mock_temperature_other for _ in range(8)),
        pressures=(args.mock_pressure,) + tuple(args.mock_pressure_other for _ in range(8)),
        material_number=args.mock_material_number,
        insulation_density=args.mock_insulation_density,
        fluid_density=args.mock_fluid_density,
    )
    node_mock = NodeMockConfig(
        wall_thickness=args.mock_wall_thickness,
        corrosion_allowance=args.mock_corrosion_allowance,
        insulation_thickness=args.mock_insulation_thickness,
    )

    version = _extract_version(header.get("info", ""))
    branch_count, node_count = _build_xml(
        output_path=args.output,
        header=header,
        components=components,
        coord_factor=args.coord_factor,
        source_name=args.source,
        version_text=version,
        purpose_text=args.purpose,
        project_name=project_name,
        mdb_name=mdb_name,
        title_line=args.title_line,
        branch_mock=branch_mock,
        node_mock=node_mock,
        restrain_open_ends=args.restrain_open_ends,
        ambient_temperature=args.ambient_temperature,
        node_start=args.node_start,
        node_step=args.node_step,
        node_merge_tolerance=args.node_merge_tolerance,
        enable_psi_rigid_logic=args.enable_psi_rigid_logic,
    )

    component_counts = Counter(_infer_xml_component_type(component) for component in components)
    print(
        f"Wrote {args.output} from {args.input} "
        f"with {branch_count} branch(es), {node_count} node(s), {len(components)} component(s)."
    )
    for component_type, count in sorted(component_counts.items()):
        print(f"  {component_type}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
