#!/usr/bin/env python3
"""
Convert PSI116-style XML (`PipeStressExport`) into CII text.

Functionality:
- Parses XML shaped by `Doc/PSI116.xsd` (`Pipe > Branch > Node`).
- Builds CII element connectivity from positive `NodeNumber` values in
  branch order.
- Emits CII sections used by the sample output
  (`VERSION`, `CONTROL`, `ELEMENTS`, `NODENAME`, `BEND`, `RIGID`,
  `RESTRANT`, `SIF&TEES`, `REDUCERS`, `MISCEL_1`, `UNITS`, `COORDS`).

Parameters expected:
- `--input`: path to input XML file.
- `--output`: path to output CII file.
- `--coords-mode`: `first|all|none` for type-1 (open-end) restraint
  coordinate records.

Outputs passed:
- One `.cii` text file and conversion summary printed to stdout.

Fallback:
- Missing process/stress sections are written as zero/default blocks
  compatible with the sample style.
- `RestrainOpenEnds=Yes` adds type-1 end restraints on degree-1 nodes.
"""

from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
import json
import math
from pathlib import Path
from typing import Final
import xml.etree.ElementTree as ET


VERSION_PAYLOAD_LINES: Final[int] = 61
OPEN_END_STIFFNESS: Final[float] = 9.41952e19
DEFAULT_LINEAR_STIFFNESS: Final[float] = 1.75127e12
BEND_FLEXIBILITY_CONSTANT: Final[float] = -2.0202
VERSION_SUFFIX: Final[str] = "psi2cii.exe version 3.1.0.3 (Feb 21 2024)"
DEFAULT_VERSION_LINE: Final[str] = "        5.00000      11.0000    1252"
ELEMENT_BLOCK_LONG_ZERO_LINE: Final[str] = "           0" + (" " * 501)
ELEMENT_BLOCK_NODE_REF_LINE: Final[str] = "             -1           -1"
RESTRAINT_LONG_ZERO_LINE: Final[str] = "           0" + (" " * 101)
RESTRAINT_SLOTS_PER_AUX: Final[int] = 6
NATIVE_RESTRAINT_TYPE_CODES: Final[dict[str, int]] = {
    "ANC": 1, "GUI": 8, "GUIDE": 8, "LIM": 9, "LIMIT": 9, "XSNB": 10, "YSNB": 11, "ZSNB": 12,
    "+X": 13, "+Y": 14, "+Z": 15, "-X": 16, "-Y": 17, "-Z": 18,
    "+RX": 19, "+RY": 20, "+RZ": 21, "-RX": 22, "-RY": 23, "-RZ": 24,
    "+LIM": 25, "-LIM": 26, "XROD": 27, "YROD": 28, "ZROD": 29,
    "+XROD": 30, "+YROD": 31, "+ZROD": 32, "-XROD": 33, "-YROD": 34,
    "-ZROD": 35, "X2": 36, "Y2": 37, "Z2": 38, "RX2": 39, "RY2": 40,
    "RZ2": 41, "+X2": 42, "+Y2": 43, "+Z2": 44, "-X2": 45, "-Y2": 46,
    "-Z2": 47, "+RX2": 48, "+RY2": 49, "+RZ2": 50, "-RX2": 51,
    "-RY2": 52, "-RZ2": 53, "XSPR": 54, "YSPR": 55, "ZSPR": 56,
    "+XSNB": 57, "+YSNB": 58, "+ZSNB": 59, "-XSNB": 60, "-YSNB": 61,
    "-ZSNB": 62,
}


@dataclass(frozen=True)
class RestraintSpec:
    type_code: int
    stiffness: float
    gap: float
    friction: float
    is_open_end: bool


@dataclass(frozen=True)
class XmlNode:
    node_number: int
    node_name: str
    endpoint: int | None
    component_type: str
    rigid: int | None
    weight: float
    material_code: int | None
    outside_diameter: float
    alpha_angle: float | None
    wall_thickness: float
    corrosion_allowance: float
    insulation_thickness: float
    bend_radius: float
    bend_type: int | None
    position: tuple[float, float, float]
    restraint_specs: tuple[RestraintSpec, ...]


@dataclass(frozen=True)
class XmlBranch:
    branch_name: str
    branch_temperature: float
    branch_pressure: float
    branch_fluid_density: float
    material_number: int | None
    temperatures: tuple[float, ...]
    pressures: tuple[float, ...]
    nodes: list[XmlNode]


@dataclass(frozen=True)
class XmlMetadata:
    date_time: str
    source: str
    version: str
    user_name: str
    purpose: str
    project_name: str
    mdb_name: str
    title_lines: list[str]
    restrain_open_ends: bool
    ambient_temperature: float


@dataclass(frozen=True)
class XmlDocument:
    metadata: XmlMetadata
    branches: list[XmlBranch]


@dataclass(frozen=True)
class Edge:
    from_node: XmlNode
    to_node: XmlNode
    branch_temperature: float
    branch_pressure: float
    branch_fluid_density: float
    branch_name: str
    branch_material_number: int | None


@dataclass(frozen=True)
class AssignedRestraint:
    node_number: int
    specs: tuple[RestraintSpec, ...]
    position: tuple[float, float, float]
    node_name: str = ""
    kind: str = ""


@dataclass(frozen=True)
class ConversionModel:
    metadata: XmlMetadata
    edges: list[Edge]
    degrees: Counter[int]
    nodename_lines: list[str]
    edge_to_nodename_index: dict[int, int]
    bend_edges: list[Edge]
    edge_to_bend_index: dict[int, int]
    rigid_edges: list[Edge]
    edge_to_rigid_index: dict[int, int]
    sif_edges: list[Edge]
    edge_to_sif_index: dict[int, int]
    reducer_edges: list[Edge]
    edge_to_reducer_index: dict[int, int]
    restraints: list[AssignedRestraint]
    edge_to_restraint_index: dict[int, int]


def _map_position_to_cii(position: tuple[float, float, float]) -> tuple[float, float, float]:
    # CII benchmark convention maps XML XYZ to CII XZY with Y-axis sign flip.
    return (position[0], position[2], -position[1])


def _safe_text(value: str | None) -> str:
    if value is None:
        return ""
    return value.strip()


def _local_name(tag: str) -> str:
    if tag.startswith("{"):
        return tag.split("}", 1)[1]
    return tag


def _namespace(tag: str) -> str:
    if tag.startswith("{"):
        return tag[1:].split("}", 1)[0]
    return ""


def _q(namespace: str, name: str) -> str:
    if namespace:
        return f"{{{namespace}}}{name}"
    return name


def _child_text(parent: ET.Element, namespace: str, name: str) -> str:
    element = parent.find(_q(namespace, name))
    if element is None:
        return ""
    return _safe_text(element.text)


def _parse_optional_int(value: str, field_name: str) -> int | None:
    text = _safe_text(value)
    if not text:
        return None
    try:
        return int(text)
    except ValueError as exc:
        raise ValueError(f"Invalid integer in XML field '{field_name}': '{text}'") from exc


def _parse_optional_float(value: str, field_name: str) -> float | None:
    text = _safe_text(value)
    if not text:
        return None
    try:
        return float(text)
    except ValueError as exc:
        raise ValueError(f"Invalid float in XML field '{field_name}': '{text}'") from exc


def _parse_optional_whole_int(value: str, field_name: str) -> int | None:
    """Parse XML integer fields that may be serialized as whole-number floats."""
    parsed = _parse_optional_float(value, field_name)
    if parsed is None:
        return None
    if not math.isfinite(parsed):
        raise ValueError(f"Invalid non-finite integer in XML field '{field_name}': '{value}'")
    rounded = int(round(parsed))
    if abs(parsed - rounded) > 1e-6:
        raise ValueError(f"Expected a whole-number integer in XML field '{field_name}', got '{value}'")
    return rounded


def _parse_material_id(value: str, field_name: str) -> int | None:
    """Return a positive CII material ID, treating blank/zero fields as missing."""
    parsed = _parse_optional_whole_int(value, field_name)
    if parsed is None or parsed <= 0:
        return None
    return parsed


def _parse_node_material_code(node_element: ET.Element, namespace: str) -> int | None:
    """Parse node-level material IDs from enriched PSI XML node fields."""
    for child_name in ("MaterialCode", "MaterialNumber"):
        parsed = _parse_material_id(_child_text(node_element, namespace, child_name), f"Node/{child_name}")
        if parsed is not None:
            return parsed
    return None


def _parse_position(value: str) -> tuple[float, float, float]:
    text = _safe_text(value)
    parts = text.split()
    if len(parts) != 3:
        raise ValueError(f"Position must have exactly 3 values, got '{text}'")
    try:
        return float(parts[0]), float(parts[1]), float(parts[2])
    except ValueError as exc:
        raise ValueError(f"Invalid numeric value in Position '{text}'") from exc


def _parse_yes_no(value: str, field_name: str) -> bool:
    text = _safe_text(value).upper()
    if not text:
        return False
    if text == "YES":
        return True
    if text == "NO":
        return False
    raise ValueError(f"Expected Yes/No in XML field '{field_name}', got '{value}'")


def _restraint_type_to_code(restraint_type: str) -> int:
    normalized = _safe_text(restraint_type).upper()
    try:
        numeric = float(normalized)
    except ValueError:
        numeric = None
    if numeric is not None and abs(numeric - round(numeric)) < 1e-6 and 1 <= int(round(numeric)) <= 62:
        return int(round(numeric))
    # Explicit/signed restraint axes map straight to their literal CAESAR II
    # type codes (e.g. +Y -> 14, -Z -> 18). Directional supports must keep their
    # own code rather than being collapsed onto a bidirectional axis, so this
    # native lookup runs before the bare-axis frame map below.
    native_code = NATIVE_RESTRAINT_TYPE_CODES.get(normalized)
    if native_code is not None:
        return native_code
    if normalized in {"A", "ANCHOR", "FIXED", "FIX"}:
        return 1
    if normalized.startswith("+") or normalized.startswith("-"):
        normalized = normalized[1:]
    # Bare (unsigned) restraint axes follow the same XML->CII frame map as
    # geometry (_map_position_to_cii: XML XYZ -> CII X,Z,-Y). Otherwise a
    # vertical XML-Z restraint stays on CII-Z while the geometry's vertical moved
    # to CII-Y, i.e. the support points sideways. So: X->X(17), Y->Z(19), Z->Y(18).
    if normalized == "X":
        return 17
    if normalized == "Y":
        return 19
    if normalized == "Z":
        return 18
    raise ValueError(
        f"Unsupported restraint type '{restraint_type}'. "
        "Supported values: numeric CII type 1..62, +/-X, +/-Y, +/-Z, "
        "A/ANCHOR/FIXED, or named CII types such as GUI/LIM/XSNB."
    )


def _parse_restraints(node_element: ET.Element, namespace: str) -> tuple[RestraintSpec, ...]:
    restraint_elements = node_element.findall(_q(namespace, "Restraint"))
    if not restraint_elements:
        return tuple()
    if len(restraint_elements) > RESTRAINT_SLOTS_PER_AUX:
        raise ValueError(
            f"Only {RESTRAINT_SLOTS_PER_AUX} Restraint entries per node are supported by one CII RESTRANT block."
        )

    specs: list[RestraintSpec] = []
    for restraint_element in restraint_elements:
        type_text = _child_text(restraint_element, namespace, "Type")
        if not type_text:
            raise ValueError("Restraint element must contain Type.")
        stiffness = _parse_optional_float(
            _child_text(restraint_element, namespace, "Stiffness"), "Restraint/Stiffness"
        )
        gap = _parse_optional_float(_child_text(restraint_element, namespace, "Gap"), "Restraint/Gap")
        friction = _parse_optional_float(
            _child_text(restraint_element, namespace, "Friction"), "Restraint/Friction"
        )
        specs.append(
            RestraintSpec(
                type_code=_restraint_type_to_code(type_text),
                stiffness=0.0 if stiffness is None else stiffness,
                gap=0.0 if gap is None else gap,
                friction=0.0 if friction is None else friction,
                is_open_end=False,
            )
        )
    return tuple(specs)


def _parse_branch_temperature(branch_element: ET.Element, namespace: str) -> float:
    temperature_element = branch_element.find(_q(namespace, "Temperature"))
    if temperature_element is None:
        return 0.0

    values: list[float] = []
    for index in range(1, 10):
        raw_value = _child_text(temperature_element, namespace, f"Temperature{index}")
        parsed = _parse_optional_float(raw_value, f"Branch/Temperature{index}")
        if parsed is None:
            continue
        values.append(parsed)

    for value in values:
        if abs(value - (-100000.0)) > 1e-9:
            return value
    return 0.0


def _parse_branch_pressure(branch_element: ET.Element, namespace: str) -> float:
    # Operating pressure P1, mirroring _parse_branch_temperature: take the first
    # meaningful (non-zero) pressure case so it lands in the element block the
    # same way the temperature does.
    pressure_element = branch_element.find(_q(namespace, "Pressure"))
    if pressure_element is None:
        return 0.0
    for index in range(1, 10):
        raw_value = _child_text(pressure_element, namespace, f"Pressure{index}")
        parsed = _parse_optional_float(raw_value, f"Branch/Pressure{index}")
        if parsed is not None and abs(parsed) > 1e-9:
            return parsed
    return 0.0


def _parse_branch_fluid_density(branch_element: ET.Element, namespace: str) -> float:
    # Fluid density (specific gravity) is a direct Branch child; emitted to
    # element-block position 32 (row 6, col 2). Defaults to 0 when absent.
    raw_value = _child_text(branch_element, namespace, "FluidDensity")
    parsed = _parse_optional_float(raw_value, "Branch/FluidDensity")
    return 0.0 if parsed is None else parsed


def _parse_branch_temperatures(branch_element: ET.Element, namespace: str) -> tuple[float, ...]:
    values: list[float] = [0.0] * 9
    temperature_element = branch_element.find(_q(namespace, "Temperature"))
    if temperature_element is None:
        return tuple(values)

    for index in range(1, 10):
        raw_value = _child_text(temperature_element, namespace, f"Temperature{index}")
        parsed = _parse_optional_float(raw_value, f"Branch/Temperature{index}")
        if parsed is None or abs(parsed - (-100000.0)) < 1e-9:
            values[index - 1] = 0.0
        else:
            values[index - 1] = parsed
    return tuple(values)


def _parse_branch_pressures(branch_element: ET.Element, namespace: str) -> tuple[float, ...]:
    values: list[float] = [0.0] * 9
    pressure_element = branch_element.find(_q(namespace, "Pressure"))
    if pressure_element is None:
        return tuple(values)

    for index in range(1, 10):
        raw_value = _child_text(pressure_element, namespace, f"Pressure{index}")
        parsed = _parse_optional_float(raw_value, f"Branch/Pressure{index}")
        values[index - 1] = 0.0 if parsed is None else parsed
    return tuple(values)


def _parse_xml_document(path: Path) -> XmlDocument:
    root = ET.parse(path).getroot()
    if _local_name(root.tag) != "PipeStressExport":
        raise ValueError(
            f"Unexpected root element '{_local_name(root.tag)}'; expected 'PipeStressExport'."
        )

    namespace = _namespace(root.tag)
    metadata = XmlMetadata(
        date_time=_child_text(root, namespace, "DateTime"),
        source=_child_text(root, namespace, "Source"),
        version=_child_text(root, namespace, "Version"),
        user_name=_child_text(root, namespace, "UserName"),
        purpose=_child_text(root, namespace, "Purpose"),
        project_name=_child_text(root, namespace, "ProjectName"),
        mdb_name=_child_text(root, namespace, "MDBName"),
        title_lines=[_safe_text(element.text) for element in root.findall(_q(namespace, "TitleLine"))],
        restrain_open_ends=_parse_yes_no(_child_text(root, namespace, "RestrainOpenEnds"), "RestrainOpenEnds"),
        ambient_temperature=(
            _parse_optional_float(_child_text(root, namespace, "AmbientTemperature"), "AmbientTemperature")
            or 0.0
        ),
    )

    pipes = root.findall(_q(namespace, "Pipe"))
    if not pipes:
        raise ValueError("Input XML does not contain any Pipe elements.")

    branches: list[XmlBranch] = []
    for pipe in pipes:
        for branch_element in pipe.findall(_q(namespace, "Branch")):
            branch_name = _child_text(branch_element, namespace, "Branchname")
            branch_temperature = _parse_branch_temperature(branch_element, namespace)
            branch_pressure = _parse_branch_pressure(branch_element, namespace)
            branch_fluid_density = _parse_branch_fluid_density(branch_element, namespace)
            branch_material_number = _parse_material_id(
                _child_text(branch_element, namespace, "MaterialNumber"), "Branch/MaterialNumber"
            )
            branch_temperatures = _parse_branch_temperatures(branch_element, namespace)
            branch_pressures = _parse_branch_pressures(branch_element, namespace)
            parsed_nodes: list[XmlNode] = []
            for node_element in branch_element.findall(_q(namespace, "Node")):
                node_number = _parse_optional_int(
                    _child_text(node_element, namespace, "NodeNumber"), "Node/NodeNumber"
                )
                if node_number is None or node_number <= 0:
                    continue

                position_text = _child_text(node_element, namespace, "Position")
                if not position_text:
                    raise ValueError(f"Node {node_number} is missing Position.")

                endpoint = _parse_optional_int(_child_text(node_element, namespace, "Endpoint"), "Node/Endpoint")
                rigid = _parse_optional_int(_child_text(node_element, namespace, "Rigid"), "Node/Rigid")
                alpha_angle = _parse_optional_float(
                    _child_text(node_element, namespace, "AlphaAngle"), "Node/AlphaAngle"
                )
                wall_thickness_value = _parse_optional_float(
                    _child_text(node_element, namespace, "WallThickness"),
                    "Node/WallThickness",
                )
                if wall_thickness_value is None:
                    wall_thickness_value = 0.0
                corrosion_allowance_value = _parse_optional_float(
                    _child_text(node_element, namespace, "CorrosionAllowance"),
                    "Node/CorrosionAllowance",
                )
                if corrosion_allowance_value is None:
                    corrosion_allowance_value = 0.0
                insulation_thickness_value = _parse_optional_float(
                    _child_text(node_element, namespace, "InsulationThickness"),
                    "Node/InsulationThickness",
                )
                if insulation_thickness_value is None:
                    insulation_thickness_value = 0.0
                bend_radius_value = _parse_optional_float(
                    _child_text(node_element, namespace, "BendRadius"),
                    "Node/BendRadius",
                )
                if bend_radius_value is None:
                    bend_radius_value = 0.0
                bend_type_value = _parse_optional_int(
                    _child_text(node_element, namespace, "BendType"),
                    "Node/BendType",
                )
                outside_diameter_value = _parse_optional_float(
                    _child_text(node_element, namespace, "OutsideDiameter"),
                    "Node/OutsideDiameter",
                )
                if outside_diameter_value is None:
                    outside_diameter_value = 0.0
                weight_value = _parse_optional_float(
                    _child_text(node_element, namespace, "Weight"),
                    "Node/Weight",
                )
                if weight_value is None:
                    weight_value = 0.0

                parsed_nodes.append(
                    XmlNode(
                        node_number=node_number,
                        node_name=_child_text(node_element, namespace, "NodeName"),
                        endpoint=endpoint,
                        component_type=_child_text(node_element, namespace, "ComponentType").upper(),
                        rigid=rigid,
                        weight=weight_value,
                        material_code=_parse_node_material_code(node_element, namespace),
                        outside_diameter=outside_diameter_value,
                        alpha_angle=alpha_angle,
                        wall_thickness=wall_thickness_value,
                        corrosion_allowance=corrosion_allowance_value,
                        insulation_thickness=insulation_thickness_value,
                        bend_radius=bend_radius_value,
                        bend_type=bend_type_value,
                        position=_parse_position(position_text),
                        restraint_specs=_parse_restraints(node_element, namespace),
                    )
                )

            if parsed_nodes:
                branches.append(
                    XmlBranch(
                        branch_name=branch_name,
                        branch_temperature=branch_temperature,
                        branch_pressure=branch_pressure,
                        branch_fluid_density=branch_fluid_density,
                        material_number=branch_material_number,
                        temperatures=branch_temperatures,
                        pressures=branch_pressures,
                        nodes=parsed_nodes,
                    )
                )

    if not branches:
        raise ValueError("Input XML does not contain any positive NodeNumber nodes.")

    return XmlDocument(metadata=metadata, branches=branches)


def _build_edges(branches: list[XmlBranch]) -> list[Edge]:
    edges: list[Edge] = []
    for branch in branches:
        if len(branch.nodes) < 2:
            continue
        for index in range(len(branch.nodes) - 1):
            edges.append(
                Edge(
                    from_node=branch.nodes[index],
                    to_node=branch.nodes[index + 1],
                    branch_temperature=branch.branch_temperature,
                    branch_pressure=branch.branch_pressure,
                    branch_fluid_density=branch.branch_fluid_density,
                    branch_name=branch.branch_name,
                    branch_material_number=branch.material_number,
                )
            )
    if not edges:
        raise ValueError("No element edges could be formed from branch node order.")
    return edges


def _build_degree_map(edges: list[Edge]) -> Counter[int]:
    degrees: Counter[int] = Counter()
    for edge in edges:
        degrees[edge.from_node.node_number] += 1
        degrees[edge.to_node.node_number] += 1
    return degrees


def _build_nodename_lines(edges: list[Edge]) -> tuple[list[str], dict[int, int]]:
    lines: list[str] = []
    edge_to_index: dict[int, int] = {}

    for edge_index, edge in enumerate(edges):
        left = _safe_text(edge.from_node.node_name)[:25]
        right = _safe_text(edge.to_node.node_name)[:25]
        if not left and not right:
            continue
        lines.append(f"  {left:<26}{right:<25}")
        edge_to_index[edge_index] = len(lines)

    return lines, edge_to_index


def _build_bend_indices(edges: list[Edge]) -> tuple[list[Edge], dict[int, int]]:
    bend_edges: list[Edge] = []
    edge_to_index: dict[int, int] = {}
    for edge_index, edge in enumerate(edges):
        if edge.to_node.component_type == "ELBO" and edge.to_node.endpoint == 0:
            bend_edges.append(edge)
            edge_to_index[edge_index] = len(bend_edges)
    return bend_edges, edge_to_index


def _build_rigid_indices(edges: list[Edge]) -> tuple[list[Edge], dict[int, int]]:
    rigid_edges: list[Edge] = []
    edge_to_index: dict[int, int] = {}
    for edge_index, edge in enumerate(edges):
        if edge.to_node.rigid == 2 or (
            edge.from_node.rigid == 2 and edge.to_node.component_type == "FLAN"
        ):
            rigid_edges.append(edge)
            edge_to_index[edge_index] = len(rigid_edges)
    return rigid_edges, edge_to_index


def _build_sif_indices(edges: list[Edge]) -> tuple[list[Edge], dict[int, int]]:
    sif_edges: list[Edge] = []
    edge_to_index: dict[int, int] = {}
    for edge_index, edge in enumerate(edges):
        if edge.to_node.endpoint == 0 and edge.to_node.component_type in {"TEE", "OLET"}:
            sif_edges.append(edge)
            edge_to_index[edge_index] = len(sif_edges)
    return sif_edges, edge_to_index


def _build_reducer_indices(edges: list[Edge]) -> tuple[list[Edge], dict[int, int]]:
    reducer_edges: list[Edge] = []
    edge_to_index: dict[int, int] = {}
    for edge_index, edge in enumerate(edges):
        if edge.to_node.alpha_angle is not None and abs(edge.to_node.alpha_angle) > 1e-9:
            reducer_edges.append(edge)
            edge_to_index[edge_index] = len(reducer_edges)
    return reducer_edges, edge_to_index


def _build_explicit_restraint_specs(branches: list[XmlBranch]) -> dict[int, tuple[RestraintSpec, ...]]:
    specs: dict[int, tuple[RestraintSpec, ...]] = {}
    for branch in branches:
        for node in branch.nodes:
            if not node.restraint_specs:
                continue
            existing = specs.get(node.node_number)
            if existing is None:
                specs[node.node_number] = node.restraint_specs
                continue
            if existing != node.restraint_specs:
                raise ValueError(
                    f"Conflicting restraint definitions for NodeNumber {node.node_number}."
                )
    return specs


def _build_restraints(
    metadata: XmlMetadata,
    edges: list[Edge],
    degrees: Counter[int],
    explicit_specs: dict[int, tuple[RestraintSpec, ...]],
    support_map: dict | None = None,
) -> tuple[list[AssignedRestraint], dict[int, int]]:
    node_specs: dict[int, tuple[RestraintSpec, ...]] = dict(explicit_specs)

    if metadata.restrain_open_ends:
        for node_number, degree in degrees.items():
            if degree != 1:
                continue
            if node_number in node_specs:
                continue
            node_specs[node_number] = (
                RestraintSpec(
                    type_code=1,
                    stiffness=OPEN_END_STIFFNESS,
                    gap=0.0,
                    friction=0.0,
                    is_open_end=True,
                ),
            )

    if not node_specs:
        return [], {}

    assigned_node_numbers: set[int] = set()
    restraints: list[AssignedRestraint] = []
    edge_to_index: dict[int, int] = {}

    def assign(edge_index: int, node: XmlNode) -> bool:
        if node.node_number in assigned_node_numbers:
            return False
        specs = node_specs.get(node.node_number)
        if not specs:
            return False
        if edge_index in edge_to_index:
            raise ValueError(
                f"Edge {edge_index + 1} received multiple restraints; unsupported mapping."
            )
        kind = ""
        if support_map:
            raw = support_map.get(_safe_text(node.node_name))
            if isinstance(raw, dict):
                raw = raw.get("kind") or raw.get("SUPPORT_KIND") or raw.get("supportKind")
            kind = _safe_text(raw).upper()
        restraints.append(
            AssignedRestraint(
                node_number=node.node_number,
                specs=specs,
                position=node.position,
                node_name=_safe_text(node.node_name),
                kind=kind,
            )
        )
        edge_to_index[edge_index] = len(restraints)
        assigned_node_numbers.add(node.node_number)
        return True

    for edge_index, edge in enumerate(edges):
        if assign(edge_index, edge.to_node):
            continue
        from_is_open_end = degrees[edge.from_node.node_number] == 1
        if from_is_open_end:
            assign(edge_index, edge.from_node)

    unresolved = [node_number for node_number in node_specs if node_number not in assigned_node_numbers]
    for node_number in unresolved:
        matched = False
        for edge_index, edge in enumerate(edges):
            if edge.to_node.node_number == node_number:
                if assign(edge_index, edge.to_node):
                    matched = True
                    break
            if edge.from_node.node_number == node_number:
                if assign(edge_index, edge.from_node):
                    matched = True
                    break
        if not matched:
            raise ValueError(f"Unable to assign restraint for NodeNumber {node_number}.")

    return restraints, edge_to_index


def _build_conversion_model(document: XmlDocument, support_map: dict | None = None) -> ConversionModel:
    edges = _build_edges(document.branches)
    degrees = _build_degree_map(edges)

    nodename_lines, edge_to_nodename_index = _build_nodename_lines(edges)
    bend_edges, edge_to_bend_index = _build_bend_indices(edges)
    rigid_edges, edge_to_rigid_index = _build_rigid_indices(edges)
    sif_edges, edge_to_sif_index = _build_sif_indices(edges)
    reducer_edges, edge_to_reducer_index = _build_reducer_indices(edges)

    explicit_specs = _build_explicit_restraint_specs(document.branches)
    restraints, edge_to_restraint_index = _build_restraints(
        document.metadata,
        edges,
        degrees,
        explicit_specs,
        support_map,
    )

    return ConversionModel(
        metadata=document.metadata,
        edges=edges,
        degrees=degrees,
        nodename_lines=nodename_lines,
        edge_to_nodename_index=edge_to_nodename_index,
        bend_edges=bend_edges,
        edge_to_bend_index=edge_to_bend_index,
        rigid_edges=rigid_edges,
        edge_to_rigid_index=edge_to_rigid_index,
        sif_edges=sif_edges,
        edge_to_sif_index=edge_to_sif_index,
        reducer_edges=reducer_edges,
        edge_to_reducer_index=edge_to_reducer_index,
        restraints=restraints,
        edge_to_restraint_index=edge_to_restraint_index,
    )


def _format_auto_float(value: float) -> str:
    if not math.isfinite(value):
        raise ValueError(f"Non-finite numeric value encountered: {value}")
    absolute = abs(value)
    if absolute < 1e-12:
        return "0.000000"
    if absolute >= 1e9:
        return f"{value:.6E}"
    if absolute < 0.1:
        return f"{value:.6E}"
    return f"{value:#.6G}"


def _format_fixed_float(value: float, decimals: int) -> str:
    if not math.isfinite(value):
        raise ValueError(f"Non-finite numeric value encountered: {value}")
    return f"{value:.{decimals}f}"


def _row(values: list[str]) -> str:
    if not values:
        return ""
    widths = [15] + [13] * (len(values) - 1)
    chunks = [f"{values[index]:>{widths[index]}}" for index in range(len(values))]
    return "".join(chunks)


def _section_header(name: str) -> str:
    return f"#$ {name}"


def _resolve_template_version_line(template_cii: Path | None) -> str:
    def _format_template_tokens(line: str) -> str:
        tokens = line.split()
        if len(tokens) < 3:
            return line
        try:
            major = float(tokens[0])
            minor = float(tokens[1])
            build = int(float(tokens[2]))
        except ValueError:
            return line
        return f"{major:15.5f}{minor:13.4f}{build:8d}"

    if template_cii is None:
        return DEFAULT_VERSION_LINE
    template_lines = template_cii.read_text(encoding="utf-8").splitlines()
    try:
        version_index = template_lines.index("#$ VERSION")
    except ValueError:
        return DEFAULT_VERSION_LINE
    if version_index + 1 >= len(template_lines):
        return DEFAULT_VERSION_LINE
    line = template_lines[version_index + 1]
    if not _safe_text(line):
        return DEFAULT_VERSION_LINE
    return _format_template_tokens(line)


def _build_version_payload(metadata: XmlMetadata, version_header_line: str) -> list[str]:
    payload: list[str] = []
    payload.append(version_header_line)
    payload.append(f"  DateTime: {metadata.date_time}")
    payload.append(f"  Source: {metadata.source}")
    payload.append(f"  Version: {metadata.version} ({VERSION_SUFFIX})")
    payload.append(f"  UserName: {metadata.user_name}")
    payload.append(f"  Purpose: {metadata.purpose}")
    payload.append(f"  ProjectName: {metadata.project_name}")
    payload.append(f"  MDBName: {metadata.mdb_name}")
    if metadata.title_lines:
        for title_line in metadata.title_lines:
            payload.append(f"  {title_line}")
    else:
        payload.append("  ")

    while len(payload) < VERSION_PAYLOAD_LINES:
        payload.append("  ")
    if len(payload) > VERSION_PAYLOAD_LINES:
        payload = payload[:VERSION_PAYLOAD_LINES]

    return payload


def _element_outside_diameter(edge: Edge) -> float:
    if edge.to_node.component_type == "BRAN" and edge.to_node.endpoint == 2:
        return edge.to_node.outside_diameter
    return edge.from_node.outside_diameter


def _element_line_number_field(name: str) -> str:
    """CII element line-number A100 field: length-prefixed branch name.

    Format matches the empty ELEMENT_BLOCK_LONG_ZERO_LINE column width: a
    5-wide integer length, a space, then the name (e.g.
    '          37 /ASIM-1885-10"-S8810101-91261M7-HC/B1'). Empty name -> length 0.
    """
    text = _safe_text(name)[:100]
    base = f"{'':7}{len(text):5d} {text}"
    return base.ljust(len(ELEMENT_BLOCK_LONG_ZERO_LINE))


def _build_elements_payload(model: ConversionModel) -> list[str]:
    lines: list[str] = []
    zero_line = _row(
        [
            _format_fixed_float(0.0, 6),
            _format_fixed_float(0.0, 6),
            _format_fixed_float(0.0, 6),
            _format_fixed_float(0.0, 6),
            _format_fixed_float(0.0, 6),
            _format_fixed_float(0.0, 6),
        ]
    )

    for edge_index, edge in enumerate(model.edges):
        from_node = edge.from_node
        to_node = edge.to_node
        mapped_from = _map_position_to_cii(from_node.position)
        mapped_to = _map_position_to_cii(to_node.position)
        dx = mapped_to[0] - mapped_from[0]
        dy = mapped_to[1] - mapped_from[1]
        dz = mapped_to[2] - mapped_from[2]
        outside_diameter = _element_outside_diameter(edge)

        line1 = _row(
            [
                _format_auto_float(float(from_node.node_number)),
                _format_auto_float(float(to_node.node_number)),
                _format_auto_float(dx),
                _format_auto_float(dy),
                _format_auto_float(dz),
                _format_auto_float(outside_diameter),
            ]
        )
        line2 = _row(
            [
                "1.000000E-02" if from_node.wall_thickness <= 0.0 else _format_auto_float(from_node.wall_thickness),
                _format_auto_float(to_node.insulation_thickness),
                _format_auto_float(to_node.corrosion_allowance),
                _format_auto_float(edge.branch_temperature),
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
            ]
        )
        # Operating pressure P1 follows the temperature cases (T1-T9 = reals
        # 10-18, P1-P9 = reals 19-27), so P1 is the first value of the 4th
        # element row. Emitted the same way as branch_temperature; a zero
        # pressure renders byte-identical to the previous all-zero row.
        pressure_line = _row(
            [
                _format_auto_float(edge.branch_pressure),
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
            ]
        )
        # Fluid density at element-block position 32 (row 6, col 2). Position 31
        # (col 1) is the thermal-expansion slot, left at zero here. A zero density
        # renders byte-identical to the previous all-zero row.
        fluid_density_line = _row(
            [
                _format_fixed_float(0.0, 6),
                _format_auto_float(edge.branch_fluid_density),
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
            ]
        )

        bend_index = model.edge_to_bend_index.get(edge_index, 0)
        rigid_index = model.edge_to_rigid_index.get(edge_index, 0)
        restraint_index = model.edge_to_restraint_index.get(edge_index, 0)
        sif_index = model.edge_to_sif_index.get(edge_index, 0)
        nodename_index = model.edge_to_nodename_index.get(edge_index, 0)
        reducer_index = model.edge_to_reducer_index.get(edge_index, 0)

        line13 = _row(
            [
                str(bend_index),
                str(rigid_index),
                "0",
                str(restraint_index),
                "0",
                "0",
            ]
        )
        line14 = _row(
            [
                "0",
                "0",
                "0",
                "0",
                str(sif_index),
                str(nodename_index),
            ]
        )
        line15 = _row([str(reducer_index), "0", "0"])

        lines.extend(
            [
                line1,
                line2,
                zero_line,           # row3: T4-T9
                pressure_line,       # row4: P1-P6 (P1 = first value)
                zero_line,           # row5: P7-P9 + spares
                fluid_density_line,  # row6: pos 31 expansion, pos 32 fluid density
                zero_line,           # row7
                zero_line,       # row8
                _row(
                    [
                        _format_fixed_float(0.0, 6),
                        _format_fixed_float(0.0, 6),
                        _format_fixed_float(0.0, 6),
                        _format_fixed_float(0.0, 6),
                        _format_fixed_float(0.0, 6),
                    ]
                ),
                ELEMENT_BLOCK_LONG_ZERO_LINE,
                _element_line_number_field(edge.branch_name),
                ELEMENT_BLOCK_NODE_REF_LINE,
                line13,
                line14,
                line15,
            ]
        )

    return lines


def _build_bend_payload(model: ConversionModel) -> list[str]:
    lines: list[str] = []
    for edge in model.bend_edges:
        bend_type_value = 0.0 if edge.to_node.bend_type is None else float(edge.to_node.bend_type)
        line1 = _row(
            [
                _format_auto_float(edge.to_node.bend_radius if edge.to_node.bend_radius > 0.0 else _element_outside_diameter(edge)),
                _format_auto_float(bend_type_value),
                _format_fixed_float(BEND_FLEXIBILITY_CONSTANT, 5),
                _format_auto_float(float(edge.to_node.node_number - 1)),
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
            ]
        )
        line2 = _row(
            [
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
            ]
        )
        line3 = _row(
            [
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
            ]
        )
        lines.extend([line1, line2, line3])
    return lines


def _rigid_weight_for_edge(edge: Edge) -> float:
    """Return the RIGID auxiliary weight for an edge; missing XML weight stays zero."""
    if edge.to_node.rigid == 2:
        return edge.to_node.weight
    if edge.from_node.rigid == 2 and edge.to_node.component_type == "FLAN":
        if abs(edge.from_node.weight) > 1e-12:
            return edge.from_node.weight
        return edge.to_node.weight
    return 0.0


def _build_rigid_payload(model: ConversionModel, weight_scale: float = 1.0) -> list[str]:
    lines: list[str] = []
    for edge in model.rigid_edges:
        weight = _rigid_weight_for_edge(edge) * weight_scale
        lines.append(_row([_format_auto_float(weight), _format_fixed_float(0.0, 6)]))
    return lines


def _restraint_tag_line(kind: str) -> str:
    """A100 tag field for a restraint, carrying the resolved support kind.
    Empty kind reproduces RESTRAINT_LONG_ZERO_LINE byte-for-byte."""
    text = _safe_text(kind)[:100]
    if not text:
        return RESTRAINT_LONG_ZERO_LINE
    base = f"{'':7}{len(text):5d} {text}"
    return base.ljust(len(RESTRAINT_LONG_ZERO_LINE))


def _restraint_code_to_axis(code: float) -> str:
    return {1: "ANCHOR", 8: "GUI", 9: "LIM", 17: "X", 18: "Y", 19: "Z"}.get(int(round(code)), str(code))


def _build_diagnostics_report(model: ConversionModel) -> str:
    """Human-readable running log / table of the conversion enrichment:
    restraints (node, name, CII type, axis, kind, stiffness/gap/friction) and a
    per-element summary (line number, converted bore/OD, wall, corr, insulation)."""
    lines: list[str] = []
    lines.append("XML -> CII (2019) DIAGNOSTICS")
    lines.append(
        f"elements={len(model.edges)} restraints={len(model.restraints)} "
        f"bends={len(model.bend_edges)} sif/tees={len(model.sif_edges)} "
        f"reducers={len(model.reducer_edges)}"
    )
    lines.append("")
    lines.append("RESTRAINTS")
    hdr = f"{'Node':>10} {'Slot':>4} {'NodeName':<22} {'CIIType':>7} {'Axis':<6} {'Kind':<10} {'Stiffness':>14} {'Gap':>8} {'Fric':>6}"
    lines.append(hdr)
    lines.append("-" * len(hdr))
    for r in model.restraints:
        for slot, spec in enumerate(r.specs, 1):
            lines.append(
                f"{r.node_number:>10} {slot:>4} {(_safe_text(r.node_name)[:22]):<22} "
                f"{int(round(spec.type_code)):>7} {_restraint_code_to_axis(spec.type_code):<6} "
                f"{(r.kind or '-'):<10} {spec.stiffness:>14.6g} {spec.gap:>8.3g} {spec.friction:>6.3g}"
            )
    lines.append("")
    lines.append("ELEMENTS")
    hdr2 = f"{'From':>8} {'To':>8} {'OD/Bore':>10} {'Wall':>8} {'Corr':>6} {'Insul':>6} {'LineNo (branch)':<40}"
    lines.append(hdr2)
    lines.append("-" * len(hdr2))
    for e in model.edges:
        od = _element_outside_diameter(e)
        lines.append(
            f"{e.from_node.node_number:>8} {e.to_node.node_number:>8} {od:>10.4g} "
            f"{e.from_node.wall_thickness:>8.4g} {e.from_node.corrosion_allowance:>6.3g} "
            f"{e.to_node.insulation_thickness:>6.3g} {(_safe_text(e.branch_name)[:40]):<40}"
        )
    return "\n".join(lines) + "\n"


def _build_restraint_payload(model: ConversionModel) -> list[str]:
    lines: list[str] = []
    for assigned in model.restraints:
        for slot_index in range(RESTRAINT_SLOTS_PER_AUX):
            if slot_index < len(assigned.specs):
                spec = assigned.specs[slot_index]
                secondary_flag = _format_fixed_float(0.0, 6) if spec.is_open_end else _format_fixed_float(1.0, 5)
                line1 = _row([
                    _format_auto_float(float(assigned.node_number)),
                    _format_auto_float(float(spec.type_code)),
                    _format_auto_float(spec.stiffness),
                    _format_fixed_float(spec.gap, 6),
                    _format_fixed_float(spec.friction, 6),
                    _format_fixed_float(0.0, 6),
                ])
                tag_line = _restraint_tag_line(assigned.kind) if slot_index == 0 else RESTRAINT_LONG_ZERO_LINE
            else:
                secondary_flag = _format_fixed_float(0.0, 6)
                line1 = _row([
                    _format_fixed_float(0.0, 6),
                    _format_fixed_float(0.0, 6),
                    _format_auto_float(DEFAULT_LINEAR_STIFFNESS),
                    _format_fixed_float(0.0, 6),
                    _format_fixed_float(0.0, 6),
                    _format_fixed_float(0.0, 6),
                ])
                tag_line = RESTRAINT_LONG_ZERO_LINE
            line2 = _row([
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
                secondary_flag,
            ])
            lines.extend([line1, line2, tag_line, RESTRAINT_LONG_ZERO_LINE])
    return lines


def _build_sif_payload(model: ConversionModel) -> list[str]:
    lines: list[str] = []
    zero_row = _row(
        [
            _format_fixed_float(0.0, 6),
            _format_fixed_float(0.0, 6),
            _format_fixed_float(0.0, 6),
            _format_fixed_float(0.0, 6),
            _format_fixed_float(0.0, 6),
            _format_fixed_float(0.0, 6),
        ]
    )
    for edge in model.sif_edges:
        first = _row(
            [
                _format_auto_float(float(edge.to_node.node_number)),
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
                _format_fixed_float(0.0, 6),
            ]
        )
        lines.append(first)
        for _ in range(9):
            lines.append(zero_row)
    return lines


def _build_reducer_payload(model: ConversionModel) -> list[str]:
    lines: list[str] = []
    for edge in model.reducer_edges:
        alpha_angle = edge.to_node.alpha_angle
        if alpha_angle is None:
            raise ValueError("Reducer edge without AlphaAngle encountered.")
        lines.append(
            _row(
                [
                    _format_auto_float(edge.to_node.outside_diameter),
                    _format_fixed_float(0.0, 6),
                    _format_fixed_float(alpha_angle, 4),
                    _format_fixed_float(0.0, 6),
                    _format_fixed_float(0.0, 6),
                ]
            )
        )
    return lines


def _material_id_for_edge(edge: Edge, previous_material: int) -> int:
    """Return the CII RRMAT material ID for one edge, carrying prior material when missing."""
    for candidate in (edge.to_node.material_code, edge.from_node.material_code, edge.branch_material_number):
        if candidate is not None and candidate > 0:
            return candidate
    return previous_material


def _build_miscel_material_rows(edges: list[Edge]) -> list[str]:
    material_values: list[str] = []
    current_material = 1
    for edge in edges:
        current_material = _material_id_for_edge(edge, current_material)
        material_values.append(_format_fixed_float(float(current_material), 5))
    return [_row(material_values[index:index + 6]) for index in range(0, len(material_values), 6)]


def _build_miscel_payload(model: ConversionModel) -> list[str]:
    lines: list[str] = []
    lines.extend(_build_miscel_material_rows(model.edges))

    lines.append("              0            0            0            0     0.000000            0")
    lines.append(
        _row(
            [
                "0",
                "0",
                _format_fixed_float(model.metadata.ambient_temperature, 4),
                _format_fixed_float(0.0, 6),
                "0",
                "0",
            ]
        )
    )
    lines.append("              0            0            0            0            0            0")
    lines.append(_row(["3"]))
    return lines


def _build_units_payload() -> list[str]:
    return [
        "        25.4000      4.44822     0.453592     0.112985     0.112985      6.89476",
        "       0.555556     -17.7778      6.89476      6.89476 2.768000E-02 2.768000E-02",
        "   2.768000E-02      1.75127     0.112985      1.75127      1.00000      6.89476",
        "   2.540000E-02      25.4000      25.4000      25.4000",
        "  SI (mm)        ",
        "  on ",
        "  mm.",
        "  N. ",
        "  Kg.",
        "  N.m.  ",
        "  N.m.. ",
        "  KPa       ",
        "  C",
        "  C",
        "  KPa       ",
        "  KPa       ",
        "  kg.cu.cm. ",
        "  kg.cu.cm. ",
        "  kg.cu.cm. ",
        "  N./cm. ",
        "  N.m./deg  ",
        "  N./cm. ",
        "  g's",
        "  Kpa       ",
        "  m. ",
        "  mm.",
        "  mm.",
        "  mm.",
    ]


def _build_coords_payload(model: ConversionModel, coords_mode: str) -> list[str]:
    open_end_restraints = [
        restraint for restraint in model.restraints
        if any(spec.is_open_end for spec in restraint.specs)
    ]
    if coords_mode == "none" or not open_end_restraints:
        return [_row(["0"])]

    selected: list[AssignedRestraint]
    if coords_mode == "first":
        selected = [open_end_restraints[0]]
    else:
        selected = list(open_end_restraints)

    payload = [_row([str(len(selected))])]
    for restraint in selected:
        mapped = _map_position_to_cii(restraint.position)
        payload.append(
            _row(
                [
                    str(restraint.node_number),
                    _format_fixed_float(mapped[0], 4),
                    _format_fixed_float(mapped[1], 4),
                    _format_fixed_float(mapped[2], 4),
                ]
            )
        )
    return payload


def _build_cii_text(
    model: ConversionModel,
    coords_mode: str,
    version_header_line: str,
    weight_scale: float = 1.0,
) -> str:
    version_payload = _build_version_payload(model.metadata, version_header_line)
    elements_payload = _build_elements_payload(model)
    bend_payload = _build_bend_payload(model)
    rigid_payload = _build_rigid_payload(model, weight_scale)
    restraint_payload = _build_restraint_payload(model)
    sif_payload = _build_sif_payload(model)
    reducer_payload = _build_reducer_payload(model)
    miscel_payload = _build_miscel_payload(model)
    units_payload = _build_units_payload()
    coords_payload = _build_coords_payload(model, coords_mode)

    control_line_1 = _row(
        [
            str(len(model.edges)),
            "0",
            "0",
            str(len(model.nodename_lines)),
            str(len(model.reducer_edges)),
            "0",
        ]
    )
    control_line_2 = _row(
        [
            str(len(model.bend_edges)),
            str(len(model.rigid_edges)),
            "0",
            str(len(model.restraints)),
            "0",
            "0",
        ]
    )
    control_line_3 = _row(
        [
            "0",
            "0",
            "0",
            "0",
            str(len(model.sif_edges)),
            "0",
        ]
    )
    control_line_4 = _row(["0"])

    sections: list[tuple[str, list[str]]] = [
        ("VERSION", version_payload),
        ("CONTROL", [control_line_1, control_line_2, control_line_3, control_line_4]),
        ("ELEMENTS", elements_payload),
        ("AUX_DATA", []),
        ("NODENAME", model.nodename_lines),
        ("BEND", bend_payload),
        ("RIGID", rigid_payload),
        ("EXPJT", []),
        ("RESTRANT", restraint_payload),
        ("DISPLMNT", []),
        ("FORCMNT", []),
        ("UNIFORM", []),
        ("WIND", []),
        ("OFFSETS", []),
        ("ALLOWBLS", []),
        ("SIF&TEES", sif_payload),
        ("REDUCERS", reducer_payload),
        ("FLANGES", []),
        ("EQUIPMNT", []),
        ("MISCEL_1", miscel_payload),
        ("UNITS", units_payload),
        ("COORDS", coords_payload),
    ]

    lines: list[str] = []
    for name, payload in sections:
        lines.append(_section_header(name))
        lines.extend(payload)

    return "\n".join(lines) + "\n"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert PSI116 XML to CII.")
    parser.add_argument("--input", required=True, type=Path, help="Input XML file path.")
    parser.add_argument("--output", required=True, type=Path, help="Output CII file path.")
    parser.add_argument(
        "--template-cii",
        required=False,
        type=Path,
        default=None,
        help="Optional template CII file used to source the VERSION header first line.",
    )
    parser.add_argument(
        "--coords-mode",
        required=False,
        default="first",
        choices=["first", "all", "none"],
        help="How many type-1 restraint coordinates to write in COORDS (default: first).",
    )
    parser.add_argument(
        "--support-map-json",
        required=False,
        type=Path,
        default=None,
        help="Optional JSON mapping NodeName -> support kind (or {kind:..}). "
             "Resolved kind is written into the RESTRANT tag and the diagnostics.",
    )
    parser.add_argument(
        "--diagnostics-out",
        required=False,
        type=Path,
        default=None,
        help="Optional path to write a human-readable diagnostics table "
             "(restraints + element bore/wall/line-number).",
    )
    parser.add_argument(
        "--weight-scale",
        required=False,
        type=float,
        default=1.0,
        help="Multiplier applied to component (RIGID) weights on output. Use 10 "
             "to convert kgf masses to Newtons (kg -> N) for the CII weight field.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    document = _parse_xml_document(args.input)
    support_map = None
    if args.support_map_json:
        support_map = json.loads(args.support_map_json.read_text(encoding="utf-8"))
        if not isinstance(support_map, dict):
            raise ValueError("--support-map-json must contain a JSON object {NodeName: kind}.")
    model = _build_conversion_model(document, support_map)
    version_header_line = _resolve_template_version_line(args.template_cii)
    cii_text = _build_cii_text(model, args.coords_mode, version_header_line, args.weight_scale)

    args.output.write_text(cii_text, encoding="utf-8")
    if args.diagnostics_out:
        args.diagnostics_out.write_text(_build_diagnostics_report(model), encoding="utf-8")
        print(f"Wrote diagnostics to {args.diagnostics_out}")
    print(
        f"Wrote {args.output} with {len(model.edges)} elements, "
        f"{len(model.restraints)} restraints, {len(model.bend_edges)} bends, "
        f"{len(model.sif_edges)} SIF/tee entries, {len(model.reducer_edges)} reducers."
    )


if __name__ == "__main__":
    main()
