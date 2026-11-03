#!/usr/bin/env python3
"""Remediated deterministic PSI116 PipeStressExport -> canonical InputXML adapter."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from lxml import etree as ET

from .base import COADE_NS, CompileBlocked, DecisionLedger
from .psi116_common import decimal_text, load_projection_policy
from .psi116_intake import Psi116Branch, Psi116Intake, Psi116Node, Psi116Restraint
from .psi116_projection_ownership import (
    OccurrenceProjection,
    build_occurrence_projections,
    hydro_pressure_policy,
    owns_bend,
    owns_rigid,
    projection_index,
    require_selectable_production_result,
)


@dataclass(frozen=True)
class CanonicalSegment:
    element_id: str
    branch: Psi116Branch
    branch_index: int
    segment_index: int
    from_node: Psi116Node
    to_node: Psi116Node


def canonical_element_id(branch_index: int, segment_index: int) -> str:
    return f"PSI_B{branch_index + 1:04d}_E{segment_index + 1:06d}"


def compile_psi116_source(source: bytes, *, intake: Psi116Intake, ledger: DecisionLedger) -> ET._Element:
    del source
    policy, policy_hash = load_projection_policy()
    if policy_hash != intake.policy_hash:
        raise CompileBlocked("PSI116 intake policy hash changed before canonical projection.")
    require_selectable_production_result(intake.production_result)
    segments = build_segments(intake)
    projections = build_occurrence_projections(intake, segments, policy)
    by_segment = _claims_by_segment(projections)
    root = ET.Element(f"{{{COADE_NS}}}CAESARII", nsmap={None: COADE_NS})
    root.set("VERSION", str(policy["canonicalVersion"]))
    root.set("XML_TYPE", "Input")
    model = ET.SubElement(root, "PIPINGMODEL", nsmap={None: ""})
    elements = tuple(_build_element(row, by_segment[row.element_id], policy) for row in segments)
    _set_model_attributes(model, intake, elements, policy)
    for element in elements:
        model.append(element)
    _record_document_fields(intake, segments, ledger, policy_hash)
    for branch in intake.branches:
        branch_ids = [row.element_id for row in segments if row.branch_index == branch.branch_index]
        _record_branch_fields(branch, branch_ids, ledger)
    index = projection_index(projections)
    for branch in intake.branches:
        for node in branch.nodes:
            _record_occurrence(node, index[node.trace["occurrenceId"]], ledger, policy, policy_hash)
    _record_segments(segments, ledger, policy)
    _record_hydro_policy(segments, ledger, policy, policy_hash)
    return root


def build_segments(intake: Psi116Intake) -> tuple[CanonicalSegment, ...]:
    result: list[CanonicalSegment] = []
    for branch in intake.branches:
        for index, (left, right) in enumerate(zip(branch.nodes, branch.nodes[1:])):
            result.append(CanonicalSegment(
                element_id=canonical_element_id(branch.branch_index, index),
                branch=branch, branch_index=branch.branch_index, segment_index=index,
                from_node=left, to_node=right,
            ))
    if not result:
        raise CompileBlocked("PSI116 canonical adapter cannot form a PIPINGELEMENT.")
    return tuple(result)


def _claims_by_segment(rows: tuple[OccurrenceProjection, ...]) -> dict[str, tuple[OccurrenceProjection, ...]]:
    grouped: dict[str, list[OccurrenceProjection]] = {}
    for row in rows:
        if row.segment is not None:
            grouped.setdefault(row.segment.element_id, []).append(row)
    return {
        key: tuple(sorted(value, key=lambda row: (row.node.node_index, row.occurrence_id)))
        for key, value in grouped.items()
    }


def _set_model_attributes(model: ET._Element, intake: Psi116Intake, elements: tuple[ET._Element, ...], policy: dict[str, Any]) -> None:
    counts = {
        "NUMELT": len(elements), "NUMNOZ": 0, "NOHGRS": 0,
        "NUMBEND": sum(len(row.findall("BEND")) for row in elements),
        "NUMRIGID": sum(len(row.findall("RIGID")) for row in elements),
        "NUMEXPJNT": 0,
        "NUMREST": sum(len(row.findall("RESTRAINT")) for row in elements),
        "NUMFORCMNT": 0, "NUMUNFLOAD": 0, "NUMWIND": 0,
        "NUMELEOFF": 0, "NUMALLOW": 0, "NUMISECT": 0,
    }
    model.set("JOBNAME", intake.project_name)
    model.set("TIME", intake.canonical_time)
    model.set("ISSUE_NO", str(policy["canonicalIssueNo"]))
    for name, value in counts.items():
        model.set(name, str(value))
    for name, value in zip(("NORTH_X", "NORTH_Y", "NORTH_Z"), policy["canonicalNorth"]):
        model.set(name, str(value))


def _build_element(segment: CanonicalSegment, claims: tuple[OccurrenceProjection, ...], policy: dict[str, Any]) -> ET._Element:
    left, right = segment.from_node, segment.to_node
    delta = tuple(right.position[index] - left.position[index] for index in range(3))
    hydro = hydro_pressure_policy(policy)
    element = ET.Element("PIPINGELEMENT")
    attributes = {
        "ID": segment.element_id,
        "FROM_NODE": str(left.node_number), "TO_NODE": str(right.node_number),
        "DELTA_X": _decimal(delta[0]), "DELTA_Y": _decimal(delta[1]), "DELTA_Z": _decimal(delta[2]),
        "DIAMETER": right.outside_diameter, "WALL_THICK": right.wall_thickness,
        "INSUL_THICK": right.insulation_thickness, "CORR_ALLOW": right.corrosion_allowance,
        "HYDRO_PRESSURE": hydro["canonicalValue"],
        "INSUL_DENSITY": _branch_value(segment, "insulation_density"),
        "FLUID_DENSITY": _branch_value(segment, "fluid_density"),
        "MATERIAL_NUM": str(_branch_value(segment, "material_number")),
        "FROM_NAME": left.node_name, "TO_NAME": right.node_name,
        "LINE": _branch_value(segment, "branch_name"),
        "FROM_X": _decimal(left.position[0]), "FROM_Y": _decimal(left.position[1]),
        "FROM_Z": _decimal(left.position[2]), "TO_X": _decimal(right.position[0]),
        "TO_Y": _decimal(right.position[1]), "TO_Z": _decimal(right.position[2]),
    }
    for index, value in enumerate(segment.branch.temperatures, 1):
        attributes[f"TEMP_EXP_C{index}"] = value
    for index, value in enumerate(segment.branch.pressures, 1):
        attributes[f"PRESSURE_C{index}"] = value
    for name, value in attributes.items():
        element.set(name, str(value))
    bend_claims = [row for row in claims if "BEND" in row.sections]
    rigid_claims = [row for row in claims if "RIGID" in row.sections]
    restraint_claims = [row for row in claims if "RESTRANT" in row.sections]
    if len(bend_claims) > 1 or len(rigid_claims) > 1:
        raise CompileBlocked(f"PSI116 auxiliary ownership conflict on {segment.element_id}.")
    if bend_claims:
        owner = bend_claims[0].node
        bend = ET.SubElement(element, "BEND")
        bend.set("RADIUS", owner.bend_radius)
        if owner.bend_type is not None:
            bend.set("TYPE", str(owner.bend_type))
    if rigid_claims:
        owner = rigid_claims[0].node
        rigid = ET.SubElement(element, "RIGID")
        rigid.set("WEIGHT", owner.weight)
    slot = 0
    for claim in restraint_claims:
        for restraint in claim.node.restraints:
            slot += 1
            element.append(_build_restraint(restraint, claim.node.node_number, slot, policy))
    return element


def _build_restraint(restraint: Psi116Restraint, node_number: int, slot: int, policy: dict[str, Any]) -> ET._Element:
    row = ET.Element("RESTRAINT")
    values = {
        "NUM": slot, "NODE": node_number,
        "TYPE": policy["restraintPolicy"]["typeCodes"][restraint.type_name],
        "STIFFNESS": restraint.stiffness, "GAP": restraint.gap,
        "FRIC_COEF": restraint.friction, "CNODE": policy["restraintPolicy"]["cnode"],
    }
    cosines = policy["restraintPolicy"]["directionCosines"]
    values.update({"XCOSINE": cosines[0], "YCOSINE": cosines[1], "ZCOSINE": cosines[2]})
    for name, value in values.items():
        row.set(name, str(value))
    return row


def _record_document_fields(intake: Psi116Intake, segments: tuple[CanonicalSegment, ...], ledger: DecisionLedger, policy_hash: str) -> None:
    _add(ledger, "/PipeStressExport/DateTime[1]", "PSI116_FIELD", {"DateTime": intake.canonical_time},
         section="VERSION", evidence=["deterministic DD/MM/YYYY to YYYY/MM/DD lexical mapping"])
    _add(ledger, "/PipeStressExport/ProjectName[1]", "PSI116_FIELD", {"ProjectName": intake.project_name},
         section="CONTROL", evidence=["exact JOBNAME projection"])
    _add(ledger, "/PipeStressExport/Pipe[1]/FullName[1]", "PSI116_FIELD", {"FullName": intake.pipe_name},
         disposition="PRESERVE_EXTENSION", evidence=["pipe identity retained in TE-014 projection ledger"])
    _add(ledger, "/PipeStressExport/RestrainOpenEnds[1]", "PSI116_OPEN_END_POLICY", {
        "value": intake.restrain_open_ends, "policyHash": policy_hash,
        "syntheticRestraintsAllowed": False,
    }, disposition="PRESERVE_EXTENSION", evidence=["open-end compatibility behavior is not projected"])
    _add(ledger, "/PipeStressExport/Units[1]", "PSI116_UNIT_POLICY", {
        "units": dict(intake.units), "policyHash": policy_hash,
    }, disposition="PRESERVE_EXTENSION", evidence=["exact registered unit map validated before projection"])
    for name in ("Source", "Version", "Purpose", "MDBName", "TitleLine", "AmbientTemperature"):
        _add(ledger, f"/PipeStressExport/{name}[1]", "PSI116_METADATA", {"field": name},
             disposition="PRESERVE_EXTENSION", evidence=["source metadata retained as proof evidence"])
    for unit_name, unit_value in intake.units:
        _add(ledger, f"/PipeStressExport/Units[1]/{unit_name}[1]", "PSI116_UNIT_FIELD", {
            "field": unit_name, "value": unit_value, "policyHash": policy_hash,
        }, disposition="PRESERVE_EXTENSION", evidence=["unit mapping is identity under the registered policy"])
    _add(ledger, "/PipeStressExport/Pipe[1]", "PSI116_PIPE", {
        "branchCount": len(intake.branches), "canonicalElementCount": len(segments),
    }, disposition="PRESERVE_EXTENSION", evidence=["container accounted; child records own canonical projection"])


def _record_branch_fields(branch: Psi116Branch, ids: list[str], ledger: DecisionLedger) -> None:
    section = "ELEMENTS" if ids else None
    disposition = "EMIT_1_TO_1" if ids else "PRESERVE_EXTENSION"
    _add(ledger, branch.source_path, "PSI116_BRANCH", {"branchName": branch.branch_name},
         element_ids=ids, section=section, disposition=disposition,
         evidence=["exact LINE scope" if ids else "payload-free isolated branch retained as evidence"])
    fields = {
        "Branchname": branch.branch_name, "MaterialNumber": branch.material_number,
        "InsulationDensity": branch.insulation_density, "FluidDensity": branch.fluid_density,
    }
    for name, value in fields.items():
        _add(ledger, f"{branch.source_path}/{name}[1]", "PSI116_BRANCH_FIELD", {"field": name, "value": value},
             element_ids=ids, section=section, disposition=disposition,
             evidence=["explicit branch context projected" if ids else "payload-free branch context retained"])
    for stem, values in (("Temperature", branch.temperatures), ("Pressure", branch.pressures)):
        _add(ledger, f"{branch.source_path}/{stem}[1]", "PSI116_CASE_CONTAINER", {"field": stem, "count": len(values)},
             element_ids=ids, section=section, disposition=disposition, evidence=["exact nine-case container"])
        for index, value in enumerate(values, 1):
            _add(ledger, f"{branch.source_path}/{stem}[1]/{stem}{index}[1]", "PSI116_CASE_FIELD", {
                "field": f"{stem}{index}", "value": value,
            }, element_ids=ids, section=section, disposition=disposition,
            evidence=["identity unit projection" if ids else "payload-free branch case retained"])


def _record_occurrence(node: Psi116Node, projection: OccurrenceProjection, ledger: DecisionLedger, policy: dict[str, Any], policy_hash: str) -> None:
    ids = [] if projection.segment is None else [projection.segment.element_id]
    primary = _primary_section(projection.sections)
    disposition = "EMIT_1_TO_1" if ids else "PRESERVE_EXTENSION"
    _add(ledger, node.source_path, "PSI116_NODE", {
        "occurrenceId": node.trace["occurrenceId"], "logicalNodeId": node.trace["logicalNodeId"],
        "engineeringNodeNumber": node.node_number, "componentType": node.component_type,
        "projectionRole": projection.role, "projectionSections": list(projection.sections), "policyHash": policy_hash,
    }, element_ids=ids, section=primary, disposition=disposition,
    evidence=[projection.reason, "exact TE-013 occurrence and section ownership"])
    for name, value in _node_field_values(node).items():
        section = _node_field_section(node, name, projection, policy)
        field_ids = ids if section else []
        _add(ledger, f"{node.source_path}/{name}[1]", "PSI116_NODE_FIELD", {
            "field": name, "value": value, "occurrenceId": projection.occurrence_id,
            "projectionRole": projection.role, "policyHash": policy_hash,
        }, element_ids=field_ids, section=section,
        disposition="EMIT_1_TO_1" if section else "PRESERVE_EXTENSION",
        evidence=["exact registered source-field disposition; no fallback"])
    for name, value in node.evidence_fields:
        _add(ledger, f"{node.source_path}/{name}[1]", "PSI116_TRACE_EVIDENCE_FIELD", {
            "field": name, "value": value,
        }, disposition="PRESERVE_EXTENSION", evidence=["trace-only source evidence; no CII semantic claim"])
    for restraint in node.restraints:
        if "RESTRANT" not in projection.sections or not ids:
            raise CompileBlocked(f"PSI116_UNPROJECTABLE_ENGINEERING_CONTENT: unowned restraint at {restraint.source_path}.")
        _add(ledger, restraint.source_path, "PSI116_RESTRAINT", {
            "type": restraint.type_name, "gap": restraint.gap, "stiffness": restraint.stiffness,
            "friction": restraint.friction, "occurrenceId": projection.occurrence_id, "policyHash": policy_hash,
        }, element_ids=ids, section="RESTRANT", evidence=["explicit occurrence-owned restraint rule"])
        for field in ("Type", "Gap", "Stiffness", "Friction"):
            _add(ledger, f"{restraint.source_path}/{field}[1]", "PSI116_RESTRAINT_FIELD", {
                "field": field, "occurrenceId": projection.occurrence_id,
            }, element_ids=ids, section="RESTRANT", evidence=["exact source restraint field ownership"])


def _record_segments(segments: tuple[CanonicalSegment, ...], ledger: DecisionLedger, policy: dict[str, Any]) -> None:
    for segment in segments:
        _add(ledger, f"{segment.branch.source_path}/segment[{segment.segment_index + 1}]", "PSI116_SEGMENT", {
            "fromOccurrenceId": segment.from_node.trace["occurrenceId"],
            "toOccurrenceId": segment.to_node.trace["occurrenceId"],
            "fromNode": segment.from_node.node_number, "toNode": segment.to_node.node_number,
            "ownershipRule": policy["occurrenceOwnershipPolicy"]["elementRule"],
        }, element_ids=[segment.element_id], section="ELEMENTS",
        evidence=["consecutive source nodes; explicit endpoint ownership; no topology inference"])


def _record_hydro_policy(segments: tuple[CanonicalSegment, ...], ledger: DecisionLedger, policy: dict[str, Any], policy_hash: str) -> None:
    hydro = hydro_pressure_policy(policy)
    for segment in segments:
        _add(ledger, f"policy:HYDRO_PRESSURE:{segment.element_id}", "POLICY_NORMALIZED_FIELD", {
            "field": "HYDRO_PRESSURE", "canonicalValue": hydro["canonicalValue"],
            "canonicalUnit": hydro["canonicalUnit"], "authority": hydro["authority"],
            "sourceDisposition": hydro["sourceDisposition"],
            "projectionDisposition": hydro["projectionDisposition"], "policyHash": policy_hash,
        }, element_ids=[segment.element_id], section=hydro["ciiSection"],
        disposition=hydro["projectionDisposition"],
        evidence=["policy-hashed explicit source absence", "fallbackAllowed=false"])


def _node_field_section(node: Psi116Node, name: str, projection: OccurrenceProjection, policy: dict[str, Any]) -> str | None:
    del policy
    sections = set(projection.sections)
    if name in {"NodeNumber", "OutsideDiameter", "WallThickness", "CorrosionAllowance", "InsulationThickness", "Position"} and "ELEMENTS" in sections:
        return "ELEMENTS"
    if name == "NodeName" and node.node_name and "ELEMENTS" in sections:
        return "NODENAME"
    if name in {"Weight", "Rigid"} and "RIGID" in sections:
        return "RIGID"
    if name in {"BendRadius", "BendType"} and "BEND" in sections:
        return "BEND"
    if name in {"ComponentType", "Endpoint"}:
        for section in ("BEND", "RIGID", "RESTRANT", "ELEMENTS"):
            if section in sections:
                return section
    return None


def _node_field_values(node: Psi116Node) -> dict[str, Any]:
    values: dict[str, Any] = {
        "NodeNumber": node.node_number, "NodeName": node.node_name, "Endpoint": node.endpoint,
        "ComponentType": node.component_type, "Weight": node.weight,
        "ComponentRefNo": node.component_ref_no, "ConnectionType": node.connection_type,
        "OutsideDiameter": node.outside_diameter, "WallThickness": node.wall_thickness,
        "CorrosionAllowance": node.corrosion_allowance, "InsulationThickness": node.insulation_thickness,
        "Position": [_decimal(value) for value in node.position], "BendRadius": node.bend_radius, "SIF": node.sif,
    }
    if node.rigid is not None:
        values["Rigid"] = node.rigid
    if node.bend_type is not None:
        values["BendType"] = node.bend_type
    if node.alpha_angle is not None:
        values["AlphaAngle"] = node.alpha_angle
    return values


def _primary_section(sections: tuple[str, ...]) -> str | None:
    for name in ("BEND", "RIGID", "RESTRANT", "ELEMENTS"):
        if name in sections:
            return name
    return None


def _add(ledger: DecisionLedger, source_id: str, source_type: str, fields: dict[str, Any], *, element_ids: list[str] | None = None, section: str | None = None, disposition: str = "EMIT_1_TO_1", evidence: list[str] | None = None) -> None:
    ids = element_ids or []
    ledger.add(
        source_entity_id=source_id, source_type=source_type, source_fields=fields,
        canonical_element_ids=ids, inputxml_element_ids=ids, cii_section=section,
        projection_cardinality="1_TO_1" if ids or section else "1_TO_0",
        disposition=disposition, evidence=evidence or [],
    )


def _branch_value(segment: CanonicalSegment, field: str) -> Any:
    return getattr(segment.branch, field)


def _decimal(value: Decimal) -> str:
    return decimal_text(value, "canonical decimal")


__all__ = ["CanonicalSegment", "_build_element", "build_segments", "canonical_element_id", "compile_psi116_source"]
