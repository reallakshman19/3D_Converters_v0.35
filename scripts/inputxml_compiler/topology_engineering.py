#!/usr/bin/env python3
"""Strict engineering-state and coordinate projection for Root topology."""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from .base import DecisionLedger
from .topology_diagnostics import block
from .topology_source import BranchOccurrence, NodeOccurrence
from .xml import _decimal, _decimal_text, _integer_text, _same_numeric


_STATE_FIELDS = {
    "DIAMETER": ("OutsideDiameter", "decimal", "positive"),
    "WALL_THICK": ("WallThickness", "decimal", "nonnegative"),
    "INSUL_THICK": ("InsulationThickness", "decimal", "nonnegative"),
    "CORR_ALLOW": ("CorrosionAllowance", "decimal", "nonnegative"),
}
_REQUIRED_STATE = {"DIAMETER", "WALL_THICK", "MATERIAL_NUM"}


@dataclass(frozen=True)
class BranchEngineeringResolution:
    node_states: dict[str, dict[str, str]]
    branch_attributes: dict[str, str]


def resolve_branch_engineering(
    branch: BranchOccurrence,
    *,
    context: dict[str, Any],
    ledger: DecisionLedger,
) -> BranchEngineeringResolution:
    state: dict[str, str] = {}
    node_states: dict[str, dict[str, str]] = {}
    branch_material = branch.fields.get("MaterialNumber", "").strip()
    branch_attrs = _branch_attributes(branch, context, ledger)
    for node in branch.nodes:
        for canonical, (source_name, _, rule) in _STATE_FIELDS.items():
            raw = node.fields.get(source_name, "").strip()
            if raw:
                value = _decimal_text(raw, node.field_paths.get(source_name, node.path))
                _validate_state_value(canonical, value, rule, node.path, ledger)
                state[canonical] = value
            elif canonical in state:
                _record_branch_inheritance(
                    branch,
                    node,
                    canonical,
                    state[canonical],
                    ledger,
                )
        material = _material_value(branch, node, branch_material, ledger)
        if material is not None:
            state["MATERIAL_NUM"] = material
        elif "MATERIAL_NUM" in state:
            _record_branch_inheritance(
                branch,
                node,
                "MATERIAL_NUM",
                state["MATERIAL_NUM"],
                ledger,
            )
        missing = sorted(_REQUIRED_STATE - set(state))
        if missing:
            block(
                ledger,
                "BRANCH_STATE_SEED_MISSING",
                f"{node.path} lacks required branch-state seed fields {missing}.",
                node.path,
                branchPath=branch.path,
            )
        node_states[node.path] = deepcopy(state)
    return BranchEngineeringResolution(node_states, branch_attrs)


def canonical_edge_attributes(
    branch: BranchOccurrence,
    from_node: NodeOccurrence,
    to_node: NodeOccurrence,
    *,
    element_id: str,
    resolution: BranchEngineeringResolution,
    ledger: DecisionLedger,
) -> dict[str, str]:
    from_point = transform_point(from_node.position)
    to_point = transform_point(to_node.position)
    delta = tuple(to_point[index] - from_point[index] for index in range(3))
    if all(value == 0 for value in delta):
        block(
            ledger,
            "EDGE_ZERO_LENGTH",
            f"{from_node.path} to {to_node.path} resolves to zero-length geometry.",
            to_node.path,
        )
    attrs = {
        "ID": element_id,
        "FROM_NODE": str(from_node.node_number),
        "TO_NODE": str(to_node.node_number),
        "DELTA_X": decimal_value(delta[0]),
        "DELTA_Y": decimal_value(delta[1]),
        "DELTA_Z": decimal_value(delta[2]),
        "LINE": branch.line_identity,
        "FROM_X": decimal_value(from_point[0]),
        "FROM_Y": decimal_value(from_point[1]),
        "FROM_Z": decimal_value(from_point[2]),
        "TO_X": decimal_value(to_point[0]),
        "TO_Y": decimal_value(to_point[1]),
        "TO_Z": decimal_value(to_point[2]),
    }
    attrs.update(resolution.node_states[to_node.path])
    attrs.update(resolution.branch_attributes)
    from_name = from_node.fields.get("NodeName", "").strip()
    to_name = to_node.fields.get("NodeName", "").strip()
    if from_name:
        attrs["FROM_NAME"] = from_name
    if to_name:
        attrs["TO_NAME"] = to_name
    _record_coordinate_evidence(
        branch,
        from_node,
        to_node,
        element_id,
        from_point,
        to_point,
        delta,
        ledger,
    )
    return attrs


def transform_point(position: tuple[str, str, str]) -> tuple[Decimal, Decimal, Decimal]:
    x, y, z = (Decimal(value) for value in position)
    return x, z, -y


def decimal_value(value: Decimal) -> str:
    if value == 0:
        return "0"
    text = format(value, "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def _branch_attributes(
    branch: BranchOccurrence,
    context: dict[str, Any],
    ledger: DecisionLedger,
) -> dict[str, str]:
    result: dict[str, str] = {}
    for index in range(1, 10):
        temperature = branch.fields.get(f"Temperature{index}", "").strip()
        pressure = branch.fields.get(f"Pressure{index}", "").strip()
        if temperature:
            result[f"TEMP_EXP_C{index}"] = _decimal_text(
                temperature,
                branch.field_paths[f"Temperature{index}"],
            )
        if pressure:
            result[f"PRESSURE_C{index}"] = _decimal_text(
                pressure,
                branch.field_paths[f"Pressure{index}"],
            )
    hydro = branch.fields.get("HydroPressure", "").strip()
    if hydro:
        result["HYDRO_PRESSURE"] = _decimal_text(
            hydro,
            branch.field_paths["HydroPressure"],
        )
    insulation_density = branch.fields.get("InsulationDensity", "").strip()
    if insulation_density:
        result["INSUL_DENSITY"] = _decimal_text(
            insulation_density,
            branch.field_paths["InsulationDensity"],
        )
    fluid_density = branch.fields.get("FluidDensity", "").strip()
    if fluid_density:
        if "fluidDensityScale" not in context:
            block(
                ledger,
                "HIDDEN_DEFAULT_PROHIBITED",
                f"{branch.path} FluidDensity requires explicit fluidDensityScale authority.",
                branch.field_paths["FluidDensity"],
            )
        scale = _decimal(context["fluidDensityScale"], "fluidDensityScale")
        result["FLUID_DENSITY"] = decimal_value(
            _decimal(fluid_density, branch.field_paths["FluidDensity"]) * scale
        )
        _record_context_scale(
            ledger,
            "fluidDensityScale",
            scale,
            branch.field_paths["FluidDensity"],
        )
    return result


def _material_value(
    branch: BranchOccurrence,
    node: NodeOccurrence,
    branch_material: str,
    ledger: DecisionLedger,
) -> str | None:
    node_material = node.fields.get("MaterialCode", "").strip()
    if node_material and branch_material and not _same_numeric(
        node_material,
        branch_material,
    ):
        block(
            ledger,
            "LOGICAL_NODE_EVIDENCE_CONFLICT",
            f"{node.path} MaterialCode conflicts with branch MaterialNumber.",
            node.field_paths.get("MaterialCode", node.path),
            branchMaterial=branch_material,
            nodeMaterial=node_material,
        )
    raw = node_material or branch_material
    if not raw:
        return None
    return _integer_text(raw, node.field_paths.get("MaterialCode", branch.path), positive=True)


def _validate_state_value(
    canonical: str,
    value: str,
    rule: str,
    source_path: str,
    ledger: DecisionLedger,
) -> None:
    number = Decimal(value)
    invalid = rule == "positive" and number <= 0
    invalid = invalid or (rule == "nonnegative" and number < 0)
    if invalid:
        block(
            ledger,
            "BRANCH_STATE_SEED_MISSING",
            f"{source_path} resolves invalid {canonical}={value}.",
            source_path,
        )


def _record_branch_inheritance(
    branch: BranchOccurrence,
    node: NodeOccurrence,
    field: str,
    value: str,
    ledger: DecisionLedger,
) -> None:
    ledger.add(
        source_entity_id=f"{node.path}/resolved::{field}",
        source_type="BRANCH_OCCURRENCE_STATE_INHERITANCE",
        source_fields={
            "branchPath": branch.path,
            "nodePath": node.path,
            "field": field,
            "value": value,
        },
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION",
        evidence=[
            "state is inherited only within the exact source branch occurrence",
            "branch line text is not used as a cross-occurrence state key",
        ],
    )


def _record_context_scale(
    ledger: DecisionLedger,
    key: str,
    value: Decimal,
    source_path: str,
) -> None:
    ledger.add(
        source_entity_id=f"compiler-context@{key}",
        source_type="TOPOLOGY_CONTEXT_SCALE",
        source_fields={"key": key, "value": decimal_value(value), "sourcePath": source_path},
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION",
        evidence=["explicit caller-supplied unit conversion authority"],
    )


def _record_coordinate_evidence(
    branch: BranchOccurrence,
    from_node: NodeOccurrence,
    to_node: NodeOccurrence,
    element_id: str,
    from_point: tuple[Decimal, Decimal, Decimal],
    to_point: tuple[Decimal, Decimal, Decimal],
    delta: tuple[Decimal, Decimal, Decimal],
    ledger: DecisionLedger,
) -> None:
    independently_computed = tuple(
        to_point[index] - from_point[index] for index in range(3)
    )
    if independently_computed != delta:
        block(
            ledger,
            "COORDINATE_TRANSFORM_MISMATCH",
            "Independent transformed coordinate subtraction disagrees with delta.",
            to_node.path,
        )
    ledger.add(
        source_entity_id=f"{branch.path}/edge::{from_node.sequence}->{to_node.sequence}/coordinates",
        source_type="COORDINATE_FRAME_TRANSFORM",
        source_fields={
            "sourceFrame": "ROOT_XYZ_MM",
            "targetFrame": "CAESAR_X_Z_NEGATIVE_Y_MM",
            "matrix": [[1, 0, 0], [0, 0, 1], [0, -1, 0]],
            "fromSourcePath": from_node.path,
            "toSourcePath": to_node.path,
            "fromTarget": [decimal_value(value) for value in from_point],
            "toTarget": [decimal_value(value) for value in to_point],
            "delta": [decimal_value(value) for value in delta],
        },
        canonical_element_ids=[element_id],
        canonical_node_ids=[str(from_node.node_number), str(to_node.node_number)],
        inputxml_element_ids=[element_id],
        cii_section="COORDS",
        projection_cardinality="1_TO_1",
        disposition="EMIT_1_TO_1",
        evidence=[
            "repository producer coordinate contract uses millimetres",
            "project frame transform is (x,y,z) -> (x,z,-y)",
            "true zero components remain lexical zero; no tolerance or sentinel",
        ],
    )


__all__ = [
    "BranchEngineeringResolution",
    "canonical_edge_attributes",
    "decimal_value",
    "resolve_branch_engineering",
    "transform_point",
]
