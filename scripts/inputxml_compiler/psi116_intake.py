#!/usr/bin/env python3
"""Strict intake contract for TE-013 PSI116 PipeStressExport XML."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from lxml import etree as ET

from .base import CompileBlocked, DecisionLedger, SUPPORTED_COMPILER_DIALECTS
from .psi116_te013_evidence import ProjectionBoundaryError, validate_te013_production_result
from .psi116_common import (
    PROFILE_ID,
    PSI116_NS,
    canonical_time,
    child_elements,
    child_map,
    decimal_text,
    exact_dict_equal,
    finite_decimal,
    integer_value,
    load_projection_policy,
    local_name,
    namespace,
    optional_single,
    parse_position,
    positive_integer,
    prefixed_sha256,
    require_no_attributes,
    require_single,
    text_value,
)

SUPPORTED_COMPILER_DIALECTS.add(PROFILE_ID)

_ROOT_REQUIRED = {
    "DateTime", "Source", "Version", "Purpose", "ProjectName", "MDBName",
    "TitleLine", "Units", "RestrainOpenEnds", "AmbientTemperature", "Pipe",
}
_UNIT_FIELDS = (
    "DistanceUnits", "BoreUnits", "PressureUnits", "TemperatureUnits",
    "WeightUnits", "ForceUnits", "WallThicknessUnits", "FluidDensityUnits",
)
_BRANCH_FIELDS = {
    "Branchname", "Temperature", "Pressure", "MaterialNumber",
    "InsulationDensity", "FluidDensity", "Node",
}
_NODE_REQUIRED = {
    "NodeNumber", "NodeName", "Endpoint", "ComponentType", "Weight",
    "ComponentRefNo", "ConnectionType", "OutsideDiameter", "WallThickness",
    "CorrosionAllowance", "InsulationThickness", "Position", "BendRadius", "SIF",
}
_NODE_OPTIONAL = {"Rigid", "BendType", "AlphaAngle", "DTXR_POS", "DTXR_PS", "DTXR_SOURCE"}
_RESTRAINT_FIELDS = {"Type", "Gap", "Stiffness", "Friction"}


@dataclass(frozen=True)
class Psi116Restraint:
    source_path: str
    type_name: str
    gap: str
    stiffness: str
    friction: str


@dataclass(frozen=True)
class Psi116Node:
    source_path: str
    branch_index: int
    node_index: int
    node_number: int
    node_name: str
    endpoint: int
    component_type: str
    rigid: int | None
    weight: str
    component_ref_no: str
    connection_type: str
    outside_diameter: str
    wall_thickness: str
    corrosion_allowance: str
    insulation_thickness: str
    position: tuple[Decimal, Decimal, Decimal]
    bend_radius: str
    bend_type: int | None
    alpha_angle: str | None
    sif: str
    restraints: tuple[Psi116Restraint, ...]
    evidence_fields: tuple[tuple[str, str], ...]
    trace: dict[str, Any]


@dataclass(frozen=True)
class Psi116Branch:
    source_path: str
    branch_index: int
    branch_name: str
    temperatures: tuple[str, ...]
    pressures: tuple[str, ...]
    material_number: int
    insulation_density: str
    fluid_density: str
    nodes: tuple[Psi116Node, ...]


@dataclass(frozen=True)
class Psi116Intake:
    schema: str
    profile_id: str
    source_hash: str
    policy_hash: str
    canonical_time: str
    project_name: str
    pipe_name: str
    restrain_open_ends: str
    ambient_temperature: str
    units: tuple[tuple[str, str], ...]
    branches: tuple[Psi116Branch, ...]
    emitted_occurrence_ids: tuple[str, ...]
    reserved_occurrence_ids: tuple[str, ...]
    production_result: dict[str, Any]


def validate_psi116_profile_intake(
    source: bytes,
    *,
    root: ET._Element | None,
    context: dict[str, Any],
    explicit_override: bool,
    ledger: DecisionLedger,
) -> Psi116Intake:
    del explicit_override
    if root is None or local_name(root.tag) != "PipeStressExport" or namespace(root.tag) != PSI116_NS:
        actual = "none" if root is None else f"{{{namespace(root.tag)}}}{local_name(root.tag)}"
        raise CompileBlocked(f"{PROFILE_ID} requires exact root {{{PSI116_NS}}}PipeStressExport; got {actual}.")
    if set(context) != {"te013ProductionResult"}:
        raise CompileBlocked(
            "PSI116 profile context must contain only te013ProductionResult; hidden defaults and switches are prohibited."
        )
    result = context.get("te013ProductionResult")
    if not isinstance(result, dict):
        raise CompileBlocked("PSI116 profile requires complete TE-013 production result evidence.")
    try:
        boundary = validate_te013_production_result(result)
    except ProjectionBoundaryError as exc:
        raise CompileBlocked(f"TE-013 production evidence is invalid: {exc}") from exc
    if boundary["xmlBytes"] != source:
        raise CompileBlocked("Exact PSI116 source bytes differ from the validated TE-013 selected bundle.")
    policy, policy_hash = load_projection_policy()
    root_map = _validate_root(root)
    units = _parse_units(require_single(root_map, "Units", "/PipeStressExport"), policy)
    traces = result["productionBundle"]["trace"]
    branches = _parse_branches(
        require_single(root_map, "Pipe", "/PipeStressExport"), traces, policy
    )
    emitted, reserved = _validate_occurrence_coverage(branches, result)
    intake = Psi116Intake(
        schema="Psi116StrictIntake.v1",
        profile_id=PROFILE_ID,
        source_hash=prefixed_sha256(source),
        policy_hash=policy_hash,
        canonical_time=canonical_time(text_value(root_map["DateTime"][0], "DateTime")),
        project_name=text_value(root_map["ProjectName"][0], "ProjectName"),
        pipe_name=_parse_pipe_name(root_map["Pipe"][0]),
        restrain_open_ends=text_value(root_map["RestrainOpenEnds"][0], "RestrainOpenEnds"),
        ambient_temperature=decimal_text(
            text_value(root_map["AmbientTemperature"][0], "AmbientTemperature"),
            "AmbientTemperature",
        ),
        units=tuple(sorted(units.items())),
        branches=branches,
        emitted_occurrence_ids=emitted,
        reserved_occurrence_ids=reserved,
        production_result=result,
    )
    ledger.add(
        source_entity_id="/PipeStressExport[1]",
        source_type="PSI116_PROFILE_INTAKE",
        source_fields={
            "profileId": PROFILE_ID,
            "namespace": PSI116_NS,
            "sourceHash": intake.source_hash,
            "policyHash": policy_hash,
            "productionResultHash": result.get("productionResultHash"),
        },
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION",
        evidence=[
            "exact namespaced root predicate",
            "exact TE-013 production-result and selected-bundle byte binding",
            "strict no-fallback profile policy",
        ],
    )
    return intake


def _validate_root(root: ET._Element) -> dict[str, list[ET._Element]]:
    require_no_attributes(root, "/PipeStressExport")
    mapping = child_map(root)
    unknown = sorted(set(mapping) - _ROOT_REQUIRED)
    missing = sorted(_ROOT_REQUIRED - set(mapping))
    duplicates = sorted(name for name, rows in mapping.items() if name != "TitleLine" and len(rows) != 1)
    if unknown or missing or duplicates:
        raise CompileBlocked(
            f"PSI116 root shape invalid: unknown={unknown}, missing={missing}, duplicate={duplicates}."
        )
    if len(mapping.get("TitleLine") or []) != 1:
        raise CompileBlocked("PSI116 root requires exactly one TitleLine.")
    for name, rows in mapping.items():
        for row in rows:
            require_no_attributes(row, f"/PipeStressExport/{name}")
    if text_value(mapping["Source"][0], "Source") != "StagedJSON→EnrichXML":
        raise CompileBlocked("PSI116 Source must identify the accepted TE-013 writer.")
    if text_value(mapping["Version"][0], "Version") != "1.0":
        raise CompileBlocked("PSI116 Version must be 1.0.")
    return mapping


def _parse_units(element: ET._Element, policy: dict[str, Any]) -> dict[str, str]:
    mapping = child_map(element)
    if set(mapping) != set(_UNIT_FIELDS) or any(len(rows) != 1 for rows in mapping.values()):
        raise CompileBlocked("PSI116 Units must contain each registered unit field exactly once.")
    expected = policy["unitPolicy"]
    result: dict[str, str] = {}
    for name in _UNIT_FIELDS:
        require_no_attributes(mapping[name][0], f"/PipeStressExport/Units/{name}")
        actual = text_value(mapping[name][0], f"Units/{name}")
        if actual != expected[name]["requiredSource"]:
            raise CompileBlocked(f"PSI116 Units/{name} must be {expected[name]['requiredSource']!r}.")
        result[name] = actual
    return result


def _parse_pipe_name(pipe: ET._Element) -> str:
    mapping = child_map(pipe)
    full_name = require_single(mapping, "FullName", "/PipeStressExport/Pipe")
    return text_value(full_name, "Pipe/FullName")


def _parse_branches(
    pipe: ET._Element,
    traces: list[dict[str, Any]],
    policy: dict[str, Any],
) -> tuple[Psi116Branch, ...]:
    require_no_attributes(pipe, "/PipeStressExport/Pipe")
    mapping = child_map(pipe)
    unknown = sorted(set(mapping) - {"FullName", "Branch"})
    if unknown or len(mapping.get("FullName") or []) != 1 or not mapping.get("Branch"):
        raise CompileBlocked(f"PSI116 Pipe shape invalid: unknown={unknown}.")
    branches: list[Psi116Branch] = []
    trace_offset = 0
    for branch_index, branch in enumerate(mapping["Branch"]):
        parsed = _parse_branch(branch, branch_index, traces, trace_offset, policy)
        branches.append(parsed)
        trace_offset += len(parsed.nodes)
    if trace_offset != len(traces):
        raise CompileBlocked(
            f"PSI116 node count {trace_offset} differs from TE-013 trace count {len(traces)}."
        )
    if not any(len(branch.nodes) >= 2 for branch in branches):
        raise CompileBlocked("PSI116 source contains no branch capable of producing a canonical element.")
    return tuple(branches)


def _parse_branch(
    branch: ET._Element,
    branch_index: int,
    traces: list[dict[str, Any]],
    trace_offset: int,
    policy: dict[str, Any],
) -> Psi116Branch:
    path = f"/PipeStressExport/Pipe/Branch[{branch_index + 1}]"
    require_no_attributes(branch, path)
    mapping = child_map(branch)
    unknown = sorted(set(mapping) - _BRANCH_FIELDS)
    missing = sorted((_BRANCH_FIELDS - {"Node"}) - set(mapping))
    duplicates = sorted(name for name, rows in mapping.items() if name != "Node" and len(rows) != 1)
    if unknown or missing or duplicates or not mapping.get("Node"):
        raise CompileBlocked(
            f"PSI116 branch shape invalid at {path}: unknown={unknown}, missing={missing}, duplicate={duplicates}."
        )
    name = text_value(mapping["Branchname"][0], f"{path}/Branchname")
    temperatures = _parse_cases(mapping["Temperature"][0], "Temperature", path)
    pressures = _parse_cases(mapping["Pressure"][0], "Pressure", path)
    material = integer_value(text_value(mapping["MaterialNumber"][0], "MaterialNumber"), "MaterialNumber")
    if material < 0:
        raise CompileBlocked("PSI116 MaterialNumber cannot be negative.")
    insulation = decimal_text(
        text_value(mapping["InsulationDensity"][0], "InsulationDensity"),
        "InsulationDensity", nonnegative=True,
    )
    fluid = decimal_text(
        text_value(mapping["FluidDensity"][0], "FluidDensity"),
        "FluidDensity", nonnegative=True,
    )
    nodes: list[Psi116Node] = []
    for node_index, element in enumerate(mapping["Node"]):
        trace_index = trace_offset + node_index
        if trace_index >= len(traces):
            raise CompileBlocked("PSI116 source has more nodes than TE-013 trace rows.")
        nodes.append(_parse_node(element, branch_index, node_index, name, traces[trace_index], policy))
    _validate_branch_segments(nodes, policy, path)
    return Psi116Branch(
        source_path=path,
        branch_index=branch_index,
        branch_name=name,
        temperatures=temperatures,
        pressures=pressures,
        material_number=material,
        insulation_density=insulation,
        fluid_density=fluid,
        nodes=tuple(nodes),
    )


def _parse_cases(element: ET._Element, stem: str, path: str) -> tuple[str, ...]:
    require_no_attributes(element, f"{path}/{stem}")
    mapping = child_map(element)
    expected = {f"{stem}{index}" for index in range(1, 10)}
    if set(mapping) != expected or any(len(rows) != 1 for rows in mapping.values()):
        raise CompileBlocked(f"{path}/{stem} must contain exact {stem}1..9 fields.")
    return tuple(
        decimal_text(text_value(mapping[f"{stem}{index}"][0], f"{stem}{index}"), f"{stem}{index}")
        for index in range(1, 10)
    )


def _parse_node(
    element: ET._Element,
    branch_index: int,
    node_index: int,
    branch_name: str,
    trace: dict[str, Any],
    policy: dict[str, Any],
) -> Psi116Node:
    path = f"/PipeStressExport/Pipe/Branch[{branch_index + 1}]/Node[{node_index + 1}]"
    require_no_attributes(element, path)
    mapping = child_map(element)
    allowed = _NODE_REQUIRED | _NODE_OPTIONAL | {"Restraint"}
    unknown = sorted(set(mapping) - allowed)
    missing = sorted(_NODE_REQUIRED - set(mapping))
    duplicates = sorted(name for name, rows in mapping.items() if name != "Restraint" and len(rows) > 1)
    if unknown or missing or duplicates:
        raise CompileBlocked(
            f"PSI116 node shape invalid at {path}: unknown={unknown}, missing={missing}, duplicate={duplicates}."
        )
    number = positive_integer(text_value(mapping["NodeNumber"][0], "NodeNumber"), "NodeNumber")
    endpoint = integer_value(text_value(mapping["Endpoint"][0], "Endpoint"), "Endpoint", allowed=(0, 1))
    component = text_value(mapping["ComponentType"][0], "ComponentType").upper()
    supported = set(policy["componentPolicy"]["supported"])
    blocked = set(policy["componentPolicy"]["unsupportedBlocking"])
    if component in blocked or component not in supported:
        raise CompileBlocked(f"PSI116 component type {component!r} has no accepted canonical projection rule.")
    rigid_element = optional_single(mapping, "Rigid", path)
    rigid = None if rigid_element is None else integer_value(
        text_value(rigid_element, "Rigid"), "Rigid", allowed=policy["componentPolicy"]["rigidValues"]
    )
    restraints = tuple(
        _parse_restraint(row, path, index, policy)
        for index, row in enumerate(mapping.get("Restraint") or [])
    )
    if len(restraints) > int(policy["restraintPolicy"]["maxPerOwner"]):
        raise CompileBlocked(f"{path} exceeds the approved restraint capacity.")
    evidence_fields = tuple(
        (name, text_value(rows[0], f"{path}/{name}", allow_blank=True))
        for name, rows in sorted(mapping.items())
        if name.startswith("DTXR_")
    )
    _validate_trace(trace, branch_index, node_index, branch_name, number, component, endpoint, path)
    return Psi116Node(
        source_path=path,
        branch_index=branch_index,
        node_index=node_index,
        node_number=number,
        node_name=text_value(mapping["NodeName"][0], "NodeName", allow_blank=True),
        endpoint=endpoint,
        component_type=component,
        rigid=rigid,
        weight=decimal_text(text_value(mapping["Weight"][0], "Weight"), "Weight", nonnegative=True),
        component_ref_no=text_value(mapping["ComponentRefNo"][0], "ComponentRefNo", allow_blank=True),
        connection_type=text_value(mapping["ConnectionType"][0], "ConnectionType", allow_blank=True),
        outside_diameter=decimal_text(
            text_value(mapping["OutsideDiameter"][0], "OutsideDiameter"),
            "OutsideDiameter", positive=True,
        ),
        wall_thickness=decimal_text(
            text_value(mapping["WallThickness"][0], "WallThickness"),
            "WallThickness", nonnegative=True,
        ),
        corrosion_allowance=decimal_text(
            text_value(mapping["CorrosionAllowance"][0], "CorrosionAllowance"),
            "CorrosionAllowance", nonnegative=True,
        ),
        insulation_thickness=decimal_text(
            text_value(mapping["InsulationThickness"][0], "InsulationThickness"),
            "InsulationThickness", nonnegative=True,
        ),
        position=parse_position(text_value(mapping["Position"][0], "Position"), "Position"),
        bend_radius=decimal_text(
            text_value(mapping["BendRadius"][0], "BendRadius"), "BendRadius", nonnegative=True,
        ),
        bend_type=(
            None if optional_single(mapping, "BendType", path) is None else integer_value(
                text_value(optional_single(mapping, "BendType", path), "BendType"), "BendType"
            )
        ),
        alpha_angle=(
            None if optional_single(mapping, "AlphaAngle", path) is None else decimal_text(
                text_value(optional_single(mapping, "AlphaAngle", path), "AlphaAngle"), "AlphaAngle"
            )
        ),
        sif=decimal_text(text_value(mapping["SIF"][0], "SIF"), "SIF", nonnegative=True),
        restraints=restraints,
        evidence_fields=evidence_fields,
        trace=trace,
    )


def _parse_restraint(
    element: ET._Element,
    node_path: str,
    index: int,
    policy: dict[str, Any],
) -> Psi116Restraint:
    path = f"{node_path}/Restraint[{index + 1}]"
    require_no_attributes(element, path)
    mapping = child_map(element)
    if set(mapping) != _RESTRAINT_FIELDS:
        raise CompileBlocked(
            f"PSI116 restraint at {path} requires exact Type, Gap, Stiffness, and Friction fields."
        )
    for name, rows in mapping.items():
        if len(rows) != 1:
            raise CompileBlocked(f"PSI116 restraint field {name} is duplicated at {path}.")
    type_name = text_value(mapping["Type"][0], f"{path}/Type").upper()
    if type_name not in policy["restraintPolicy"]["typeCodes"]:
        raise CompileBlocked(f"PSI116 restraint type {type_name!r} is not policy registered.")
    return Psi116Restraint(
        source_path=path,
        type_name=type_name,
        gap=decimal_text(text_value(mapping["Gap"][0], f"{path}/Gap"), "Gap", nonnegative=True),
        stiffness=decimal_text(text_value(mapping["Stiffness"][0], f"{path}/Stiffness"), "Stiffness", nonnegative=True),
        friction=decimal_text(text_value(mapping["Friction"][0], f"{path}/Friction"), "Friction", nonnegative=True),
    )


def _validate_trace(
    trace: dict[str, Any],
    branch_index: int,
    node_index: int,
    branch_name: str,
    number: int,
    component: str,
    endpoint: int,
    path: str,
) -> None:
    if not isinstance(trace, dict):
        raise CompileBlocked(f"TE-013 trace row for {path} is not an object.")
    expected = {
        "branchIndex": branch_index,
        "nodeIndexInBranch": node_index,
        "branchName": branch_name,
        "engineeringNodeNumber": number,
        "psiComponentType": component,
        "endpoint": endpoint,
    }
    mismatches = {
        key: {"expected": value, "actual": trace.get(key)}
        for key, value in expected.items() if trace.get(key) != value
    }
    for field in ("occurrenceId", "componentProjectionId", "sourceEntityId", "logicalNodeId"):
        if not str(trace.get(field) or "").strip():
            mismatches[field] = {"expected": "NONBLANK", "actual": trace.get(field)}
    if mismatches:
        raise CompileBlocked(f"TE-013 trace/PSI mismatch at {path}: {mismatches}.")


def _validate_branch_segments(nodes: list[Psi116Node], policy: dict[str, Any], path: str) -> None:
    for index, (left, right) in enumerate(zip(nodes, nodes[1:]), 1):
        if left.node_number == right.node_number:
            raise CompileBlocked(f"{path} segment {index} reuses engineering node number {left.node_number}.")
        if left.position == right.position:
            raise CompileBlocked(f"{path} segment {index} is zero-length.")
        if left.outside_diameter != right.outside_diameter or left.wall_thickness != right.wall_thickness:
            raise CompileBlocked(
                f"{path} segment {index} changes diameter/thickness without an accepted reducer rule."
            )
        bend = policy["componentPolicy"]["bend"]
        if right.component_type == bend["componentType"] and right.endpoint == bend["endpoint"]:
            finite_decimal(right.bend_radius, f"{right.source_path}/BendRadius", positive=True)
        if right.component_type == "ATTA" and not right.restraints:
            raise CompileBlocked(f"{right.source_path} support has no explicit restraint evidence.")
        if finite_decimal(right.sif, f"{right.source_path}/SIF") != 0:
            raise CompileBlocked(f"{right.source_path} has non-zero SIF without an accepted PSI116-to-canonical rule.")


def _validate_occurrence_coverage(
    branches: tuple[Psi116Branch, ...],
    result: dict[str, Any],
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    traces = [node.trace for branch in branches for node in branch.nodes]
    emitted_ids = [str(row.get("occurrenceId") or "") for row in traces]
    if len(emitted_ids) != len(set(emitted_ids)):
        raise CompileBlocked("TE-013 trace contains duplicate emitted occurrence IDs.")
    node_plan = result["nodePlan"]
    emitted_plan = node_plan.get("emittedOccurrences") or []
    reserved_plan = node_plan.get("reservedOccurrences") or []
    emitted_by_id = {str(row.get("occurrenceId") or ""): row for row in emitted_plan}
    reserved_ids = tuple(str(row.get("occurrenceId") or "") for row in reserved_plan)
    if set(emitted_ids) != set(emitted_by_id):
        raise CompileBlocked("PSI116 trace occurrence coverage differs from TE-013 emitted node plan.")
    if set(emitted_ids) & set(reserved_ids):
        raise CompileBlocked("Reserved TE-013 occurrence appears in selected PSI XML/trace.")
    for trace in traces:
        row = emitted_by_id[str(trace["occurrenceId"])]
        expected = {
            "logicalNodeId": trace["logicalNodeId"],
            "componentProjectionId": trace["componentProjectionId"],
            "engineeringNodeNumber": trace["engineeringNodeNumber"],
        }
        if any(row.get(key) != value for key, value in expected.items()):
            raise CompileBlocked(f"TE-013 node-plan/trace mismatch for {trace['occurrenceId']}.")
    topology = result["topologyIndex"]
    if topology.get("nodePlanHash") != node_plan.get("nodePlanHash"):
        raise CompileBlocked("TE-013 topology index is not bound to the selected node plan.")
    return tuple(emitted_ids), reserved_ids


__all__ = [
    "Psi116Branch", "Psi116Intake", "Psi116Node", "Psi116Restraint",
    "validate_psi116_profile_intake",
]
