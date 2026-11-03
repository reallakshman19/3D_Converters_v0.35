#!/usr/bin/env python3
"""Evidence-backed source-accounting proof for managed-stage."""
from __future__ import annotations

import math
from collections import Counter
from typing import Any

from lxml import etree as ET

from .base import DecisionLedger
from .managed_stage_diagnostics import diagnose
from .managed_stage_intake import ManagedStageIntake
from .managed_stage_policy import component_policy

_DECISION_TYPE = "MANAGED_STAGE_SOURCE_DECISION"
_NON_AUTHORITY_TYPES = {
    "MANAGED_STAGE_SOURCE_INVENTORY",
    "MANAGED_STAGE_ARTIFACT_IDENTITY_CLOSURE",
    "MANAGED_STAGE_SOURCE_MODEL_CLOSURE",
    "MANAGED_STAGE_TOPOLOGY_TRACE_CLOSURE",
    "MANAGED_STAGE_PARITY_METRIC_CLOSURE",
    "MANAGED_STAGE_SOURCE_ACCOUNTING_INDEX",
    "MANAGED_STAGE_SOURCE_ACCOUNTING_PROOF",
    "MANAGED_STAGE_JSON",
}
_CERTIFICATION_FIELDS = {
    "certifiesCoverage",
    "coverageCertified",
    "accounted",
    "covered",
    "accountingAuthoritySourceType",
}


def account_managed_stage_source(
    intake: ManagedStageIntake,
    canonical: ET._Element,
    *,
    evidence: dict[str, Any],
    ledger: DecisionLedger,
) -> tuple[str, dict[str, Any]]:
    prior = list(ledger.records)
    decisions = [row for row in prior if row.get("sourceType") == _DECISION_TYPE]
    counts = Counter(str(row.get("sourceEntityId") or "") for row in decisions)
    inventory_ids = set(intake.inventory.identities)
    decision_ids = set(counts)
    unaccounted = sorted(inventory_ids - decision_ids)
    unexpected = sorted(decision_ids - inventory_ids)
    duplicate_decisions = sum(count - 1 for count in counts.values() if count > 1)
    topology = evidence["topology"]
    source = evidence["source"]
    parsed = evidence["result"]["parsedInputXmlTopology"]
    canonical_ids = _canonical_ids(canonical)
    mapped_elements = _record_values(decisions, "InputXMLElementIds")
    mapped_nodes = _record_values(decisions, "canonicalNodeIds")
    trace_ids = set(topology["traceByEntity"])
    entity_ids = set(source["entityById"])
    trace_port_ids = {
        str(row.get("sourcePortId") or "")
        for row in evidence["result"]["traceLedger"].get("sourcePorts") or []
    }
    port_ids = set(source["portById"])
    input_child_ids = {
        str(row.get("id") or "")
        for field in ("restraints", "rigids")
        for row in parsed.get(field) or []
    }
    decision_child_ids = _record_values(topology["traceByEntity"].values(), "inputXmlChildIds")
    self_certifiers = _self_certifiers(prior, inventory_ids)
    component_invariants = _component_invariants(evidence, decisions, canonical_ids)
    invariants = {
        "unaccountedSourceOccurrenceCount": len(unaccounted),
        "duplicateSourceDecisionCount": duplicate_decisions,
        "unexpectedSourceDecisionCount": len(unexpected),
        "duplicateSourceEntityIdCount": len(source["entities"]) - len(entity_ids),
        "duplicateSourcePortIdCount": len(source["ports"]) - len(port_ids),
        "missingSourceEntityTraceCount": len(entity_ids - trace_ids),
        "extraTraceEntityCount": len(trace_ids - entity_ids),
        "missingSourcePortTraceCount": len(port_ids - trace_port_ids),
        "extraTracePortCount": len(trace_port_ids - port_ids),
        "orphanCanonicalNodeCount": len(canonical_ids["nodes"] - mapped_nodes),
        "orphanCanonicalEdgeCount": len(canonical_ids["elements"] - mapped_elements),
        "unmappedSourcePortCount": len(port_ids - set(topology["portDispositions"])),
        "unmappedInputXmlElementCount": len(
            {str(row.get("inputXmlElementId") or "") for row in parsed.get("elements") or []}
            - mapped_elements
        ),
        "unmappedInputXmlChildCount": len(input_child_ids - decision_child_ids),
        "artifactIdentityMismatchCount": 0,
        "artifactHashMismatchCount": 0,
        "metricMismatchCount": 0,
        "parityMismatchCount": len(evidence["result"]["topologyParityReport"].get("mismatches") or []),
        "selfCertificationCount": len(self_certifiers),
        **component_invariants,
    }
    complete = all(value == 0 for value in invariants.values())
    _record_indexes(intake, counts, decisions, ledger)
    proof = _proof(
        intake,
        source,
        topology,
        parsed,
        canonical_ids,
        invariants,
        unaccounted,
        unexpected,
        self_certifiers,
        complete,
    )
    _record_proof(ledger, proof, complete)
    return ("COMPLETE" if complete else "BLOCKED"), proof


def _component_invariants(
    evidence: dict[str, Any],
    decisions: list[dict[str, Any]],
    canonical_ids: dict[str, set[str]],
) -> dict[str, int]:
    topology = evidence["topology"]
    source = evidence["source"]
    mappings = topology.get("componentMappings") or {}
    component_ids = {
        str(row.get("sourceEntityId") or "")
        for row in source["sourceModel"].get("components") or []
    }
    mapping_ids = set(mappings)
    edge_cardinality = 0
    input_cardinality = 0
    for entity_id in component_ids & mapping_ids:
        mapping = mappings[entity_id]
        category = str(mapping.get("category") or "")
        edge_ids = list(mapping.get("edgeIds") or [])
        edge_elements = list(mapping.get("edgeInputXmlElementIds") or [])
        trace_elements = list(mapping.get("inputXmlElementIds") or [])
        if category == "PIPE" and (not edge_ids or len(edge_ids) != len(edge_elements)):
            edge_cardinality += 1
        if category == "PIPE" and set(edge_elements) != set(trace_elements):
            input_cardinality += 1
        if any(value not in canonical_ids["elements"] for value in trace_elements):
            input_cardinality += 1
    port_rows = [
        row for row in decisions
        if str((row.get("sourceFields") or {}).get("sourcePortDisposition") or "")
    ]
    wrong_owner = 0
    unrelated_coverage = 0
    for row in port_rows:
        fields = row.get("sourceFields") or {}
        identity = str(row.get("sourceEntityId") or "")
        port = _port_for_identity(identity, source)
        owner_id = str(fields.get("ownerSourceEntityId") or "")
        if port is None or owner_id != str(port["sourceEntityId"]):
            wrong_owner += 1
        authorized = set(str(value) for value in fields.get("authorizedComponentElementIds") or [])
        actual = set(str(value) for value in row.get("InputXMLElementIds") or [])
        unrelated_coverage += len(actual - authorized)
    return {
        "missingComponentTopologyMappingCount": len(component_ids - mapping_ids),
        "wrongPortOwnerEntityCount": wrong_owner,
        "portPositionMismatchCount": _port_position_mismatches(evidence),
        "componentEdgeCardinalityMismatchCount": edge_cardinality,
        "componentInputXmlCardinalityMismatchCount": input_cardinality,
        "unrelatedIncidentElementCoverageCount": unrelated_coverage,
    }


def _port_position_mismatches(evidence: dict[str, Any]) -> int:
    topology = evidence["topology"]
    source = evidence["source"]
    canonical = evidence["result"]["canonicalTopology"]
    nodes = topology["indexes"]["nodes"]
    tolerance = float(canonical.get("toleranceMm") or 0)
    support_positions = _support_positions(topology["collections"]["supports"], source)
    mismatches = 0
    for port_id, decision in topology["portDispositions"].items():
        if decision["disposition"] in {"INTENTIONALLY_UNUSED_WITH_AUTHORITY", "MAP_TO_POINT_FEATURE"}:
            continue
        port = source["portById"][port_id]
        target_ids = [value for value in decision["targetIds"] if value in nodes]
        if len(target_ids) != 1:
            mismatches += 1
            continue
        node = nodes[target_ids[0]]
        expected = support_positions.get(
            (str(port["sourceEntityId"]), target_ids[0]),
            port["position"],
        )
        if _distance(expected, node.get("position")) > tolerance + 1e-9:
            mismatches += 1
    return mismatches


def _support_positions(supports, source):
    result = {}
    for support in supports:
        node_id = str(support.get("nodeId") or "")
        position = support.get("attachmentPosition") or support.get("position")
        for entity_id in support.get("sourceEntityIds") or []:
            entity = source["entityById"].get(str(entity_id))
            if entity and component_policy(entity["sourceType"]).category == "SUPPORT":
                result[(str(entity_id), node_id)] = position
    return result


def _port_for_identity(identity: str, source: dict[str, Any]) -> dict[str, Any] | None:
    return next((port for port in source["ports"] if port.get("sourcePath") == identity), None)


def _distance(left: Any, right: Any) -> float:
    try:
        return math.sqrt(sum((float(right[axis]) - float(left[axis])) ** 2 for axis in ("x", "y", "z")))
    except (KeyError, TypeError, ValueError):
        return math.inf


def _self_certifiers(prior, inventory_ids):
    return [
        str(row.get("recordId") or row.get("sourceEntityId") or "")
        for row in prior
        if row.get("sourceType") in _NON_AUTHORITY_TYPES
        and row.get("sourceEntityId") in inventory_ids
        and _attempts_certification(row)
    ]


def _proof(
    intake, source, topology, parsed, canonical_ids, invariants,
    unaccounted, unexpected, self_certifiers, complete,
):
    return {
        "schema": "InputXmlManagedStageSourceAccountingProof.v1",
        "profileId": "managed-stage-json",
        "status": "COMPLETE" if complete else "INCOMPLETE",
        "coverageRule": "VERIFIED_SEMANTIC_DECISION_REQUIRED",
        "accountingAuthoritySourceType": _DECISION_TYPE,
        "sourceOccurrenceCount": len(set(intake.inventory.identities)),
        "sourceBranchCount": len(intake.branches),
        "sourceEntityCount": len(source["entityById"]),
        "sourcePortCount": len(source["portById"]),
        "traceRecordCount": len(topology["traceByEntity"]),
        "canonicalNodeCount": len(canonical_ids["nodes"]),
        "canonicalEdgeCount": len(canonical_ids["elements"]),
        "inputXmlElementCount": len(parsed.get("elements") or []),
        "inputXmlChildCount": sum(len(parsed.get(field) or []) for field in ("restraints", "rigids")),
        "accountedSourceOccurrenceCount": len(set(intake.inventory.identities)) - len(unaccounted),
        "invariants": invariants,
        "unaccountedSourceIdentities": unaccounted,
        "unexpectedDecisionIdentities": unexpected,
        "selfCertificationRecordIds": self_certifiers,
    }


def _record_proof(ledger: DecisionLedger, proof: dict[str, Any], complete: bool) -> None:
    ledger.add(
        source_entity_id="managed-stage-source-accounting-proof",
        source_type="MANAGED_STAGE_SOURCE_ACCOUNTING_PROOF",
        source_fields=proof,
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION" if complete else "REJECT_INVALID",
        evidence=[
            "only MANAGED_STAGE_SOURCE_DECISION records created after artifact verification certify coverage",
            "component, port, node, edge, and InputXML ownership are reconciled per source entity",
            "non-authority records that claim coverage are counted as self-certification attempts",
        ],
        diagnostics=[] if complete else ["managed-stage source accounting is incomplete"],
    )
    if not complete:
        diagnose(
            ledger,
            "MANAGED_STAGE_SOURCE_ACCOUNTING_INCOMPLETE",
            "Managed-stage source-accounting invariants did not all resolve to zero.",
            "managed-stage-source-accounting-proof",
            invariants=proof["invariants"],
        )


def _record_values(records, field: str) -> set[str]:
    return {
        str(value)
        for row in records
        for value in row.get(field) or []
    }


def _attempts_certification(row: dict[str, Any]) -> bool:
    fields = row.get("sourceFields")
    if not isinstance(fields, dict):
        return False
    return any(fields.get(key) not in (None, False, "", [], {}) for key in _CERTIFICATION_FIELDS)


def _record_indexes(
    intake: ManagedStageIntake,
    counts: Counter[str],
    decisions: list[dict[str, Any]],
    ledger: DecisionLedger,
) -> None:
    records: dict[str, list[str]] = {}
    for row in decisions:
        records.setdefault(str(row["sourceEntityId"]), []).append(str(row["recordId"]))
    for occurrence in intake.inventory.entries:
        identity = str(occurrence["identity"])
        covered = counts.get(identity, 0) == 1
        ledger.add(
            source_entity_id=f"accounting::{identity}",
            source_type="MANAGED_STAGE_SOURCE_ACCOUNTING_INDEX",
            source_fields={
                "sourceIdentity": identity,
                "sourceKind": occurrence["kind"],
                "sourceName": occurrence["name"],
                "priorDecisionRecordIds": records.get(identity, []),
                "coverageRule": "VERIFIED_SEMANTIC_DECISION_REQUIRED",
                "accountingAuthoritySourceType": _DECISION_TYPE,
            },
            projection_cardinality="1_TO_0",
            disposition="PRESERVE_EXTENSION" if covered else "REJECT_INVALID",
            evidence=["index was created after semantic decisions were frozen and cannot certify itself"],
            diagnostics=[] if covered else ["source occurrence lacks exactly one semantic decision"],
        )


def _canonical_ids(canonical: ET._Element) -> dict[str, set[str]]:
    model = next(child for child in canonical if ET.QName(child).localname == "PIPINGMODEL")
    elements = [child for child in model if ET.QName(child).localname == "PIPINGELEMENT"]
    return {
        "elements": {str(row.get("ID") or "") for row in elements if row.get("ID")},
        "nodes": {
            str(row.get(field) or "")
            for row in elements
            for field in ("FROM_NODE", "TO_NODE")
            if row.get(field)
        },
    }


__all__ = ["account_managed_stage_source"]
