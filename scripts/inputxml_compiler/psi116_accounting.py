#!/usr/bin/env python3
"""Independent source-accounting proof for the strict PSI116 compiler profile."""
from __future__ import annotations

from collections import Counter
from decimal import Decimal
from typing import Any

from lxml import etree as ET

from .base import COADE_NS, DecisionLedger
from .psi116_adapter import build_segments
from .psi116_common import local_name, namespace
from .psi116_intake import Psi116Intake, Psi116Node


def account_psi116_source(
    intake: Psi116Intake,
    canonical: ET._Element,
    *,
    ledger: DecisionLedger,
) -> tuple[str, dict[str, Any]]:
    expected_paths = _expected_source_paths(intake)
    observed_counts = Counter(str(row.get("sourceEntityId") or "") for row in ledger.records)
    missing = sorted(path for path in expected_paths if observed_counts[path] == 0)
    duplicate = sorted(path for path in expected_paths if observed_counts[path] > 1)
    mappings, canonical_errors = _validate_canonical(intake, canonical)
    if missing or duplicate or canonical_errors:
        ledger.diagnostic(
            "BLOCKING",
            "PSI116_SOURCE_ACCOUNTING_INCOMPLETE",
            "Strict PSI116 source accounting or canonical reconciliation failed.",
            "psi116-source-accounting",
            missing=missing,
            duplicate=duplicate,
            canonicalErrors=canonical_errors,
        )
    status = "COMPLETE" if not (missing or duplicate or canonical_errors) else "INCOMPLETE"
    proof = {
        "schema": "Psi116SourceAccountingProof.v1",
        "status": status,
        "sourceHash": intake.source_hash,
        "policyHash": intake.policy_hash,
        "expectedSourceEntityCount": len(expected_paths),
        "accountedSourceEntityCount": len(expected_paths) - len(missing),
        "duplicateSourceEntityCount": len(duplicate),
        "canonicalElementCount": len(mappings),
        "emittedOccurrenceCount": len(intake.emitted_occurrence_ids),
        "reservedOccurrenceCount": len(intake.reserved_occurrence_ids),
        "mappings": mappings,
        "missingSourceEntities": missing,
        "duplicateSourceEntities": duplicate,
        "canonicalErrors": canonical_errors,
    }
    ledger.add(
        source_entity_id="psi116-source-accounting-proof",
        source_type="SOURCE_ACCOUNTING_PROOF",
        source_fields=proof,
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION",
        evidence=["complete exact-path accounting over the registered PSI116 intake tree"],
    )
    return status, proof


def _expected_source_paths(intake: Psi116Intake) -> set[str]:
    paths = {
        "/PipeStressExport[1]",
        "/PipeStressExport/DateTime[1]",
        "/PipeStressExport/Source[1]",
        "/PipeStressExport/Version[1]",
        "/PipeStressExport/Purpose[1]",
        "/PipeStressExport/ProjectName[1]",
        "/PipeStressExport/MDBName[1]",
        "/PipeStressExport/TitleLine[1]",
        "/PipeStressExport/Units[1]",
        "/PipeStressExport/RestrainOpenEnds[1]",
        "/PipeStressExport/AmbientTemperature[1]",
        "/PipeStressExport/Pipe[1]",
        "/PipeStressExport/Pipe[1]/FullName[1]",
    }
    for name, _ in intake.units:
        paths.add(f"/PipeStressExport/Units[1]/{name}[1]")
    for branch in intake.branches:
        paths.add(branch.source_path)
        for name in ("Branchname", "MaterialNumber", "InsulationDensity", "FluidDensity"):
            paths.add(f"{branch.source_path}/{name}[1]")
        for stem in ("Temperature", "Pressure"):
            paths.add(f"{branch.source_path}/{stem}[1]")
            for index in range(1, 10):
                paths.add(f"{branch.source_path}/{stem}[1]/{stem}{index}[1]")
        for node in branch.nodes:
            paths.update(_node_paths(node))
    return paths


def _node_paths(node: Psi116Node) -> set[str]:
    paths = {node.source_path}
    fields = {
        "NodeNumber", "NodeName", "Endpoint", "ComponentType", "Weight",
        "ComponentRefNo", "ConnectionType", "OutsideDiameter", "WallThickness",
        "CorrosionAllowance", "InsulationThickness", "Position", "BendRadius", "SIF",
    }
    if node.rigid is not None:
        fields.add("Rigid")
    if node.bend_type is not None:
        fields.add("BendType")
    if node.alpha_angle is not None:
        fields.add("AlphaAngle")
    fields.update(name for name, _ in node.evidence_fields)
    paths.update(f"{node.source_path}/{name}[1]" for name in fields)
    for restraint in node.restraints:
        paths.add(restraint.source_path)
        paths.update(f"{restraint.source_path}/{name}[1]" for name in ("Type", "Gap", "Stiffness", "Friction"))
    return paths


def _validate_canonical(
    intake: Psi116Intake,
    canonical: ET._Element,
) -> tuple[list[dict[str, Any]], list[str]]:
    errors: list[str] = []
    if local_name(canonical.tag) != "CAESARII" or namespace(canonical.tag) != COADE_NS:
        return [], ["canonical root is not {COADE}CAESARII"]
    models = [child for child in canonical if local_name(child.tag) == "PIPINGMODEL" and namespace(child.tag) == ""]
    if len(models) != 1:
        return [], [f"canonical PIPINGMODEL count is {len(models)}"]
    elements = [child for child in models[0] if local_name(child.tag) == "PIPINGELEMENT" and namespace(child.tag) == ""]
    expected = build_segments(intake)
    if len(elements) != len(expected):
        errors.append(f"canonical element count {len(elements)} differs from expected {len(expected)}")
    mappings: list[dict[str, Any]] = []
    for index, segment in enumerate(expected):
        if index >= len(elements):
            break
        element = elements[index]
        checks = {
            "ID": segment.element_id,
            "FROM_NODE": str(segment.from_node.node_number),
            "TO_NODE": str(segment.to_node.node_number),
            "LINE": segment.branch.branch_name,
        }
        mismatches = {
            name: {"expected": value, "actual": element.get(name)}
            for name, value in checks.items() if element.get(name) != value
        }
        for field, expected_delta in zip(
            ("DELTA_X", "DELTA_Y", "DELTA_Z"),
            (segment.to_node.position[i] - segment.from_node.position[i] for i in range(3)),
        ):
            try:
                actual = Decimal(str(element.get(field)))
            except Exception:
                actual = Decimal("NaN")
            if actual != expected_delta:
                mismatches[field] = {"expected": str(expected_delta), "actual": element.get(field)}
        if mismatches:
            errors.append(f"{segment.element_id}: {mismatches}")
        mappings.append({
            "canonicalElementId": segment.element_id,
            "branchIndex": segment.branch_index,
            "segmentIndex": segment.segment_index,
            "branchName": segment.branch.branch_name,
            "fromOccurrenceId": segment.from_node.trace["occurrenceId"],
            "toOccurrenceId": segment.to_node.trace["occurrenceId"],
            "fromEngineeringNodeNumber": segment.from_node.node_number,
            "toEngineeringNodeNumber": segment.to_node.node_number,
            "sourceEntityId": segment.to_node.trace["sourceEntityId"],
            "logicalNodeId": segment.to_node.trace["logicalNodeId"],
        })
    return mappings, errors


__all__ = ["account_psi116_source"]
