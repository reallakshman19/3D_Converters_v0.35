#!/usr/bin/env python3
"""Remediated TE-014 occurrence/section-to-CII semantic projection evidence."""
from __future__ import annotations

import hashlib
from copy import deepcopy
from typing import Any

from lxml import etree as LET

from scripts.inputxml_compiler.psi116_adapter import build_segments
from scripts.inputxml_compiler.psi116_common import json_hash, load_projection_policy
from scripts.inputxml_compiler.psi116_projection_ownership import build_occurrence_projections, hydro_pressure_policy


class LedgerBuildBlocked(RuntimeError):
    pass


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_te014_projection_ledger(*, production_result: dict[str, Any], boundary: dict[str, Any], intake, canonical: LET._Element, canonical_bytes: bytes, compiler_ledger: dict[str, Any], compiler_validation: dict[str, Any], assured_ledger: dict[str, Any], assured_projection: dict[str, Any], reparse_evidence: dict[str, Any]) -> dict[str, Any]:
    del compiler_validation
    policy, policy_hash = load_projection_policy()
    segments = build_segments(intake)
    projections = build_occurrence_projections(intake, segments, policy)
    canonical_elements = _canonical_elements(canonical)
    assured_elements = {str(row.get("inputXmlElementId") or ""): row for row in assured_projection.get("elements") or []}
    reparsed_elements = {int(row["index"]): row for row in (reparse_evidence.get("reparsed") or {}).get("elements") or []}
    rows: list[dict[str, Any]] = []
    diagnostics: list[dict[str, Any]] = []
    node_mismatches = 0
    for projection in projections:
        if projection.segment is None:
            rows.append(_omitted_occurrence_row(projection, production_result, policy_hash))
            continue
        row, row_errors = _projected_occurrence_row(
            projection=projection,
            canonical_element=canonical_elements.get(projection.segment.element_id),
            assured_element=assured_elements.get(projection.segment.element_id),
            reparsed_elements=reparsed_elements,
            production_result=production_result,
            policy=policy,
            policy_hash=policy_hash,
        )
        rows.append(row)
        node_mismatches += sum(1 for error in row_errors if error["code"] == "NODE_NUMBER_MISMATCH")
        diagnostics.extend(row_errors)
    rows.extend(_reserved_rows(production_result, policy_hash))
    emitted_ids = {str(row["occurrenceId"]) for row in boundary["nodePlan"]["emittedOccurrences"]}
    accounted = {row["occurrenceId"] for row in rows if row["sourceDisposition"] == "EMITTED"}
    unaccounted = sorted(emitted_ids - accounted)
    if unaccounted:
        diagnostics.append(_diagnostic(
            "UNACCOUNTED_EMITTED_OCCURRENCE",
            "Not every emitted TE-013 occurrence has a projection disposition.",
            {"occurrenceIds": unaccounted},
        ))
    diagnostics.extend(_section_claim_diagnostics(rows))
    blocking = [row for row in diagnostics if row.get("severity") in {"ERROR", "BLOCKING"}]
    summary = _projection_summary(rows, node_mismatches, len(unaccounted))
    ledger: dict[str, Any] = {
        "schema": "TopoEnrichedXmlCiiProjectionLedger.v1",
        "status": "PASS" if not blocking else "BLOCKED",
        "chain": {
            "te013ProductionResultHash": boundary["productionResultHash"],
            "selectedBundleHash": boundary["selectedBundleHash"],
            "selectedXmlHash": boundary["selectedXmlHash"],
            "selectedTraceHash": boundary["selectedTraceHash"],
            "nodePlanHash": boundary["nodePlanHash"],
            "topologyIndexHash": boundary["topologyIndexHash"],
            "registrySnapshotHash": boundary["registrySnapshotHash"],
            "registryPatchHash": boundary["registryPatchHash"],
            "psi116ProjectionPolicyHashSha256": policy_hash,
            "psiSourceHashSha256": compiler_ledger.get("sourceHashSha256"),
            "canonicalHashSha256": _sha(canonical_bytes),
            "canonicalizationLedgerHashSha256": json_hash(compiler_ledger),
            "assuranceHashSha256": assured_ledger["assuranceHashSha256"],
            "assuredProjectionHashSha256": assured_projection["projectionHashSha256"],
            "ciiHashSha256": (assured_projection.get("chain") or {}).get("ciiHashSha256"),
            "reparseProofHashSha256": reparse_evidence["reparseProofHashSha256"],
        },
        "authority": {
            "source": "accepted selectable TE-013 ENFORCED production result",
            "canonicalCompilerProfile": "pipesstressexport-psi116-xml",
            "occurrenceOwnership": "policy-hashed adjacent-element section claims",
            "assuredWriter": "converters/scripts/inputxml_to_cii2019.py via accepted assured boundary",
            "reparse": "converters/scripts/cii2019_reparse_proof.py through saved/read bytes",
        },
        "summary": summary,
        "lossAccounting": _loss_rows(rows, segments, policy),
        "records": rows,
        "diagnostics": diagnostics,
    }
    ledger["projectionLedgerHashSha256"] = json_hash(ledger)
    return ledger


def _projected_occurrence_row(*, projection, canonical_element: LET._Element | None, assured_element: dict[str, Any] | None, reparsed_elements: dict[int, dict[str, Any]], production_result: dict[str, Any], policy: dict[str, Any], policy_hash: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    errors: list[dict[str, Any]] = []
    segment = projection.segment
    node = projection.node
    occurrence = node.trace
    plan = _node_plan_row(production_result, projection.occurrence_id)
    ports = _source_ports(production_result, occurrence)
    if canonical_element is None or assured_element is None:
        errors.append(_blocking("CANONICAL_OR_CII_ELEMENT_MISSING", projection.occurrence_id))
        cii_index = None
    else:
        cii_index = int(assured_element["elementIndex"])
        reparsed = reparsed_elements.get(cii_index)
        if reparsed is None:
            errors.append(_blocking("CII_ELEMENT_REPARSE_MISSING", projection.occurrence_id))
        else:
            expected = (str(segment.from_node.node_number), str(segment.to_node.node_number))
            actual = (str(reparsed.get("fromNode")), str(reparsed.get("toNode")))
            if expected != actual:
                errors.append(_blocking("NODE_NUMBER_MISMATCH", projection.occurrence_id, {"expected": expected, "actual": actual}))
        errors.extend(_verify_occurrence_semantics(projection, canonical_element, assured_element, policy))
    if not ports:
        errors.append(_blocking("SOURCE_PORT_OWNERSHIP_MISSING", projection.occurrence_id))
    return ({
        "recordId": f"TE014-PROJ-{node.branch_index + 1:04d}-{node.node_index + 1:06d}",
        "occurrenceId": projection.occurrence_id,
        "sourceDisposition": "EMITTED",
        "disposition": "PROJECTED",
        "logicalNodeId": occurrence["logicalNodeId"],
        "historyNodeId": plan.get("historyNodeId"),
        "engineeringNodeNumber": occurrence["engineeringNodeNumber"],
        "sourceEntityId": occurrence["sourceEntityId"],
        "sourcePortIds": ports,
        "componentProjectionId": occurrence["componentProjectionId"],
        "componentType": occurrence["psiComponentType"],
        "endpoint": occurrence["endpoint"],
        "branchName": occurrence["branchName"],
        "psiBranchIndex": occurrence["branchIndex"],
        "psiNodeIndex": occurrence["nodeIndexInBranch"],
        "canonicalElementId": segment.element_id,
        "canonicalElementIndex": cii_index,
        "ciiElementIndex": cii_index,
        "projectionRole": projection.role,
        "projectionSections": _ledger_sections(projection),
        "projectionRule": projection.reason,
        "governingPolicyHashSha256": policy_hash,
        "evidence": {
            "segmentFromOccurrenceId": segment.from_node.trace["occurrenceId"],
            "segmentToOccurrenceId": segment.to_node.trace["occurrenceId"],
            "assuredElement": assured_element,
        },
    }, errors)


def _verify_occurrence_semantics(projection, element, assured, policy) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    node = projection.node
    segment = projection.segment
    occurrence_id = projection.occurrence_id
    if projection.role == "INCOMING_ELEMENT_OWNER":
        expected = {
            "TO_NODE": str(node.node_number), "DIAMETER": node.outside_diameter,
            "WALL_THICK": node.wall_thickness, "INSUL_THICK": node.insulation_thickness,
            "CORR_ALLOW": node.corrosion_allowance,
            "MATERIAL_NUM": str(segment.branch.material_number), "LINE": segment.branch.branch_name,
        }
    else:
        expected = {
            "FROM_NODE": str(node.node_number), "FROM_X": _decimal(node.position[0]),
            "FROM_Y": _decimal(node.position[1]), "FROM_Z": _decimal(node.position[2]),
            "LINE": segment.branch.branch_name,
        }
    hydro = hydro_pressure_policy(policy)
    expected["HYDRO_PRESSURE"] = hydro["canonicalValue"]
    for name, value in expected.items():
        if element.get(name) != str(value):
            errors.append(_blocking("CANONICAL_ENGINEERING_FIELD_MISMATCH", occurrence_id, {
                "field": name, "expected": str(value), "actual": element.get(name),
            }))
    pointers = assured.get("pointers") or {}
    for section in set(projection.sections) - {"ELEMENTS"}:
        children = element.findall("RESTRAINT" if section == "RESTRANT" else section)
        if section == "BEND":
            matches = [row for row in children if row.get("RADIUS") == node.bend_radius]
        elif section == "RIGID":
            matches = [row for row in children if row.get("WEIGHT") == node.weight]
        else:
            matches = [row for row in children if row.get("NODE") == str(node.node_number)]
        if not matches or int(pointers.get(section) or 0) <= 0:
            errors.append(_blocking("AUXILIARY_PROJECTION_MISMATCH", occurrence_id, {
                "section": section, "canonicalMatchCount": len(matches), "ciiPointer": pointers.get(section),
            }))
    return errors


def _omitted_occurrence_row(projection, result, policy_hash):
    node = projection.node
    plan = _node_plan_row(result, projection.occurrence_id)
    return {
        "recordId": f"TE014-OMIT-{node.branch_index + 1:04d}-{node.node_index + 1:06d}",
        "occurrenceId": projection.occurrence_id,
        "sourceDisposition": "EMITTED",
        "disposition": projection.disposition,
        "logicalNodeId": node.trace["logicalNodeId"],
        "historyNodeId": plan.get("historyNodeId"),
        "engineeringNodeNumber": node.node_number,
        "sourceEntityId": node.trace["sourceEntityId"],
        "sourcePortIds": _source_ports(result, node.trace),
        "componentProjectionId": node.trace["componentProjectionId"],
        "componentType": node.component_type,
        "endpoint": node.endpoint,
        "branchName": node.trace["branchName"],
        "psiBranchIndex": node.branch_index,
        "psiNodeIndex": node.node_index,
        "canonicalElementId": None,
        "canonicalElementIndex": None,
        "ciiElementIndex": None,
        "projectionRole": projection.role,
        "projectionSections": [],
        "projectionRule": projection.reason,
        "governingPolicyHashSha256": policy_hash,
        "evidence": {"payloadFree": True, "reason": projection.reason},
    }


def _reserved_rows(result, policy_hash):
    rows = []
    for index, row in enumerate((result.get("nodePlan") or {}).get("reservedOccurrences") or [], 1):
        occurrence_id = str(row.get("occurrenceId") or "")
        topology = _topology_occurrence(result, occurrence_id)
        trace_like = {"occurrenceId": occurrence_id, "sourceEntityId": topology.get("sourceEntityId"), "logicalNodeId": row.get("logicalNodeId")}
        rows.append({
            "recordId": f"TE014-RESERVED-{index:07d}", "occurrenceId": occurrence_id,
            "sourceDisposition": "RESERVED", "disposition": "RESERVED",
            "logicalNodeId": row.get("logicalNodeId"), "historyNodeId": row.get("historyNodeId"),
            "engineeringNodeNumber": row.get("engineeringNodeNumber"), "sourceEntityId": topology.get("sourceEntityId"),
            "sourcePortIds": _source_ports(result, trace_like), "componentProjectionId": row.get("componentProjectionId"),
            "componentType": row.get("psiComponentType"), "endpoint": row.get("endpoint"),
            "branchName": None, "psiBranchIndex": None, "psiNodeIndex": None,
            "canonicalElementId": None, "canonicalElementIndex": None, "ciiElementIndex": None,
            "projectionRole": "RESERVED", "projectionSections": [],
            "projectionRule": "TE013_RESERVED_OCCURRENCE_MUST_NOT_APPEAR_IN_PSI_OR_CII",
            "governingPolicyHashSha256": policy_hash,
            "evidence": {"nodePlanDisposition": row.get("disposition")},
        })
    return rows


def _section_claim_diagnostics(rows):
    diagnostics = []
    grouped: dict[int, list[dict[str, Any]]] = {}
    for row in rows:
        if row.get("disposition") == "PROJECTED" and row.get("ciiElementIndex") is not None:
            grouped.setdefault(int(row["ciiElementIndex"]), []).append(row)
    for index, claims in grouped.items():
        incoming = [row for row in claims if row.get("projectionRole") == "INCOMING_ELEMENT_OWNER"]
        if len(incoming) != 1:
            diagnostics.append(_diagnostic(
                "ELEMENT_BASE_OWNER_CONFLICT", "CII element requires exactly one incoming/base owner.",
                {"ciiElementIndex": index, "occurrenceIds": [row["occurrenceId"] for row in claims]},
            ))
        section_owners: dict[str, list[str]] = {}
        for row in claims:
            for section in row.get("projectionSections") or []:
                if section in {"ELEMENTS_FROM", "ELEMENTS_TO", "RESTRANT"}:
                    continue
                section_owners.setdefault(section, []).append(row["occurrenceId"])
        for section, owners in section_owners.items():
            if len(owners) > 1:
                diagnostics.append(_diagnostic(
                    "SECTION_OWNER_CONFLICT", "Multiple occurrences claim one singleton CII section.",
                    {"ciiElementIndex": index, "section": section, "occurrenceIds": owners},
                ))
    return diagnostics


def _ledger_sections(projection) -> list[str]:
    result = []
    for section in projection.sections:
        if section == "ELEMENTS":
            result.append("ELEMENTS_FROM" if projection.role == "OUTGOING_ENDPOINT_OWNER" else "ELEMENTS_TO")
        else:
            result.append(section)
    return sorted(result)


def _canonical_elements(root: LET._Element) -> dict[str, LET._Element]:
    model = next(child for child in root if LET.QName(child).localname == "PIPINGMODEL" and (LET.QName(child).namespace or "") == "")
    return {str(child.get("ID") or ""): child for child in model if LET.QName(child).localname == "PIPINGELEMENT" and (LET.QName(child).namespace or "") == ""}


def _node_plan_row(result: dict[str, Any], occurrence_id: str) -> dict[str, Any]:
    plan = result.get("nodePlan") or {}
    rows = (plan.get("emittedOccurrences") or []) + (plan.get("reservedOccurrences") or [])
    matches = [row for row in rows if row.get("occurrenceId") == occurrence_id]
    if len(matches) != 1:
        raise LedgerBuildBlocked(f"TE-013 node plan has {len(matches)} rows for {occurrence_id}.")
    return matches[0]


def _topology_occurrence(result: dict[str, Any], occurrence_id: str) -> dict[str, Any]:
    rows = (result.get("topologyIndex") or {}).get("occurrences") or []
    if isinstance(rows, dict):
        value = rows.get(occurrence_id)
        return value if isinstance(value, dict) else {}
    return next((row for row in rows if isinstance(row, dict) and row.get("occurrenceId") == occurrence_id), {})


def _source_ports(result: dict[str, Any], trace: dict[str, Any]) -> list[str]:
    topology = result.get("topologyIndex") or {}
    occurrence_rows = topology.get("occurrences") or []
    if isinstance(occurrence_rows, dict):
        occurrence = occurrence_rows.get(trace.get("occurrenceId")) or {}
    else:
        occurrence = next((row for row in occurrence_rows if row.get("occurrenceId") == trace.get("occurrenceId")), {})
    explicit = occurrence.get("sourcePortIds") or occurrence.get("exactSourcePortIds") or []
    if explicit:
        return sorted({str(value) for value in explicit if str(value)})
    result_ids = []
    for row in topology.get("sourcePorts") or []:
        if row.get("sourceEntityId") == trace.get("sourceEntityId"):
            logical = row.get("logicalNodeId") or row.get("ownerLogicalNodeId")
            if not logical or logical == trace.get("logicalNodeId"):
                value = row.get("sourcePortId") or row.get("id")
                if value:
                    result_ids.append(str(value))
    return sorted(set(result_ids))


def _projection_summary(rows, node_mismatches, unaccounted):
    dispositions: dict[str, int] = {}
    for row in rows:
        dispositions[row["disposition"]] = dispositions.get(row["disposition"], 0) + 1
    return {
        "emittedOccurrenceCount": sum(row["sourceDisposition"] == "EMITTED" for row in rows),
        "reservedOccurrenceCount": sum(row["sourceDisposition"] == "RESERVED" for row in rows),
        "projectedOccurrenceCount": dispositions.get("PROJECTED", 0),
        "intentionallyOmittedOccurrenceCount": dispositions.get("INTENTIONALLY_OMITTED_PAYLOAD_FREE_ENDPOINT", 0),
        "blockedOccurrenceCount": dispositions.get("BLOCKED", 0),
        "nodeNumberMismatchCount": node_mismatches,
        "unaccountedOccurrenceCount": unaccounted,
    }


def _loss_rows(rows, segments, policy):
    hydro = hydro_pressure_policy(policy)
    return {
        "projected": [row["occurrenceId"] for row in rows if row["disposition"] == "PROJECTED"],
        "intentionallyOmitted": [row["occurrenceId"] for row in rows if row["disposition"] == "INTENTIONALLY_OMITTED_PAYLOAD_FREE_ENDPOINT"],
        "defaulted": [f"HYDRO_PRESSURE:{segment.element_id}:{hydro['projectionDisposition']}:{hydro['authority']}" for segment in segments],
        "blocked": [row["occurrenceId"] for row in rows if row["disposition"] == "BLOCKED"],
        "reserved": [row["occurrenceId"] for row in rows if row["disposition"] == "RESERVED"],
        "unexplained": [],
    }


def loss_accounting(ledger):
    if not isinstance(ledger, dict):
        return {"projected": [], "intentionallyOmitted": [], "defaulted": [], "blocked": [], "reserved": [], "unexplained": []}
    return deepcopy(ledger.get("lossAccounting") or {})


def summary_value(ledger, field):
    return int(((ledger or {}).get("summary") or {}).get(field, 0))


def _blocking(code: str, occurrence_id: str, context: dict[str, Any] | None = None):
    return _diagnostic(code, f"{code} for occurrence {occurrence_id}.", {"occurrenceId": occurrence_id, **(context or {})})


def _diagnostic(code: str, message: str, context: dict[str, Any]):
    return {"severity": "BLOCKING", "code": code, "message": message, "context": context}


def _decimal(value) -> str:
    return format(value, "f")


def validate_projection_ledger(value: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if value.get("schema") != "TopoEnrichedXmlCiiProjectionLedger.v1":
        errors.append("schema must be TopoEnrichedXmlCiiProjectionLedger.v1")
    if value.get("status") not in {"PASS", "BLOCKED"}:
        errors.append("status must be PASS or BLOCKED")
    records = value.get("records")
    if not isinstance(records, list):
        return errors + ["records must be an array"]
    ids = [str(row.get("recordId") or "") for row in records]
    occurrences = [str(row.get("occurrenceId") or "") for row in records]
    if any(not item for item in ids) or len(ids) != len(set(ids)):
        errors.append("recordId values must be nonblank and unique")
    if any(not item for item in occurrences) or len(occurrences) != len(set(occurrences)):
        errors.append("occurrenceId values must be nonblank and unique")
    projected = [row for row in records if row.get("disposition") == "PROJECTED"]
    if any(not row.get("projectionSections") or not row.get("projectionRole") for row in projected):
        errors.append("projected occurrences require explicit role and section claims")
    summary = value.get("summary") or {}
    if summary.get("unaccountedOccurrenceCount") != 0 and value.get("status") == "PASS":
        errors.append("PASS requires zero unaccounted occurrences")
    if summary.get("nodeNumberMismatchCount") != 0 and value.get("status") == "PASS":
        errors.append("PASS requires zero node-number mismatches")
    loss = value.get("lossAccounting") or {}
    if loss.get("unexplained") and value.get("status") == "PASS":
        errors.append("PASS requires zero unexplained losses")
    if _section_claim_diagnostics(records) and value.get("status") == "PASS":
        errors.append("PASS requires conflict-free occurrence section claims")
    expected_hash = json_hash({key: item for key, item in value.items() if key != "projectionLedgerHashSha256"})
    if value.get("projectionLedgerHashSha256") != expected_hash:
        errors.append("projectionLedgerHashSha256 mismatch")
    return errors


__all__ = ["LedgerBuildBlocked", "build_te014_projection_ledger", "loss_accounting", "summary_value", "validate_projection_ledger"]
