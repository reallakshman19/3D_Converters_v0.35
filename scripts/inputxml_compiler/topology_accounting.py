#!/usr/bin/env python3
"""Exact source and topology accounting for PR-6 profiles."""
from __future__ import annotations

from collections import Counter
from typing import Any

from lxml import etree as ET

from .base import DecisionLedger
from .topology_diagnostics import diagnose
from .topology_inventory import build_source_inventory
from .xml import _local, _namespace

_DECISION_TYPE = "TOPOLOGY_SOURCE_DECISION"
_ACCOUNTING_TYPES = {
    "TOPOLOGY_SOURCE_ACCOUNTING_INDEX",
    "TOPOLOGY_SOURCE_ACCOUNTING_PROOF",
}
_BLANKET_TYPES = {
    "TOPOLOGY_SOURCE_ELEMENT",
    "TOPOLOGY_SOURCE_ATTRIBUTE",
}


def account_topology_profile_source(
    root: ET._Element,
    canonical: ET._Element,
    *,
    profile_id: str,
    ledger: DecisionLedger,
) -> tuple[str, dict[str, Any]]:
    inventory = build_source_inventory(root)
    prior_records = list(ledger.records)
    decisions = [
        row for row in prior_records
        if row.get("sourceType") == _DECISION_TYPE
    ]
    decision_counts = Counter(
        str(row.get("sourceEntityId") or "")
        for row in decisions
        if row.get("sourceEntityId")
    )
    inventory_ids = set(inventory.identities)
    decision_ids = set(decision_counts)
    unaccounted = sorted(inventory_ids - decision_ids)
    unexpected = sorted(decision_ids - inventory_ids)
    duplicate_decisions = sum(
        count - 1 for count in decision_counts.values() if count > 1
    )

    canonical_elements, canonical_nodes = _canonical_identities(canonical)
    mapped_elements = _mapped_values(
        prior_records,
        "TOPOLOGY_EDGE_MAPPING",
        "canonicalElementIds",
    )
    mapped_nodes = _mapped_values(
        prior_records,
        "TOPOLOGY_NODE_MAPPING",
        "canonicalNodeIds",
    )
    proof = _bridge_proof(prior_records)
    source_nodes = _decision_owners(decisions, "NODE_OCCURRENCE")
    source_components = _decision_owners(
        decisions,
        "NODE_FIELD",
        source_name="ComponentType",
    )
    source_auxiliaries = _decision_identities(
        decisions,
        "AUXILIARY_OCCURRENCE",
    )
    node_mappings = _mapping_sources(
        prior_records,
        "TOPOLOGY_NODE_MAPPING",
        "sourceNodePath",
    )
    component_mappings = _mapping_sources(
        prior_records,
        "TOPOLOGY_COMPONENT_MAPPING",
        "sourceNodePath",
    )
    auxiliary_mappings = _mapping_sources(
        prior_records,
        "TOPOLOGY_RESTRAINT_MAPPING",
        "sourcePath",
    )
    invariants = {
        "unaccountedSourceOccurrenceCount": len(unaccounted),
        "duplicateSourceDecisionIdentityCount": duplicate_decisions,
        "unexpectedSourceDecisionIdentityCount": len(unexpected),
        "blanketInventoryAuthorityCount": sum(
            1 for row in prior_records
            if row.get("sourceType") in _BLANKET_TYPES
        ),
        "duplicateInventoryIdentityCount": inventory.duplicate_identity_count,
        "unmappedCanonicalNodeCount": len(canonical_nodes - mapped_nodes),
        "unmappedCanonicalElementCount": len(canonical_elements - mapped_elements),
        "unmappedSourceNodeCount": len(source_nodes - node_mappings),
        "unmappedSourceComponentCount": len(
            source_components - component_mappings
        ),
        "unmappedSourceAuxiliaryCount": len(
            source_auxiliaries - auxiliary_mappings
        ),
        "duplicateSourceNodeMappingCount": _duplicate_source_count(
            prior_records,
            "TOPOLOGY_NODE_MAPPING",
            "sourceNodePath",
        ),
        "duplicateSourceComponentMappingCount": _duplicate_source_count(
            prior_records,
            "TOPOLOGY_COMPONENT_MAPPING",
            "sourceNodePath",
        ),
        "duplicateSourceAuxiliaryMappingCount": _duplicate_source_count(
            prior_records,
            "TOPOLOGY_RESTRAINT_MAPPING",
            "sourcePath",
        ),
        "bridgeComponentMappingCountMismatch": abs(
            int(proof.get("componentMappingCount") or 0)
            - len(source_components)
        ),
        "bridgeAuxiliaryMappingCountMismatch": abs(
            int(proof.get("auxiliaryMappingCount") or 0)
            - len(source_auxiliaries)
        ),
        "unresolvedEdgeCount": int(proof.get("unresolvedEdgeCount") or 0),
        "unresolvedOwnershipCount": int(
            proof.get("unresolvedOwnershipCount") or 0
        ),
        "syntheticTopologyCount": int(
            proof.get("syntheticTopologyCount") or 0
        ),
        "duplicateCanonicalNodeMappingCount": _duplicate_count(
            prior_records,
            "TOPOLOGY_NODE_MAPPING",
            "canonicalNodeIds",
        ),
        "duplicateCanonicalElementMappingCount": _duplicate_count(
            prior_records,
            "TOPOLOGY_EDGE_MAPPING",
            "canonicalElementIds",
        ),
        "accountingIndexSelfCertificationCount": 0,
    }
    complete = all(value == 0 for value in invariants.values())
    _record_indexes(
        inventory.entries,
        decision_counts,
        decisions,
        ledger,
    )
    accounting_proof = {
        "schema": "InputXmlTopologySourceAccountingProof.v1",
        "profileId": profile_id,
        "status": "COMPLETE" if complete else "INCOMPLETE",
        "coverageRule": "PRIOR_TRANSFORMATION_DECISION_REQUIRED",
        "accountingAuthoritySourceType": _DECISION_TYPE,
        "sourceOccurrenceCount": len(inventory.entries),
        "sourceBranchOccurrenceCount": _source_count(root, "Branch"),
        "sourceNodeOccurrenceCount": len(source_nodes),
        "sourceComponentEvidenceCount": len(source_components),
        "sourceRestraintEvidenceCount": len(source_auxiliaries),
        "logicalNodeCount": int(proof.get("logicalNodeCount") or 0),
        "logicalEdgeCount": int(proof.get("logicalEdgeCount") or 0),
        "canonicalNodeCount": len(canonical_nodes),
        "canonicalElementCount": len(canonical_elements),
        "accountedSourceOccurrenceCount": len(inventory_ids) - len(unaccounted),
        "invariants": invariants,
        "unaccountedSourceIdentities": unaccounted,
        "unexpectedDecisionIdentities": unexpected,
    }
    ledger.add(
        source_entity_id="topology-source-accounting-proof",
        source_type="TOPOLOGY_SOURCE_ACCOUNTING_PROOF",
        source_fields=accounting_proof,
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION" if complete else "REJECT_INVALID",
        evidence=[
            "only exact semantic source decisions are accounting authority",
            "generic inventory records cannot satisfy coverage",
            "component and auxiliary mappings reconcile independently",
        ],
        diagnostics=[] if complete else [
            "topology source accounting is incomplete"
        ],
    )
    if not complete:
        diagnose(
            ledger,
            "TOPOLOGY_SOURCE_ACCOUNTING_INCOMPLETE",
            "Strict topology source-accounting invariants did not all resolve to zero.",
            "topology-source-accounting-proof",
            invariants=invariants,
        )
    resolver_status = "COMPLETE" if complete else "BLOCKED"
    return resolver_status, accounting_proof


def _record_indexes(
    entries: tuple[dict[str, Any], ...],
    counts: Counter[str],
    decisions: list[dict[str, Any]],
    ledger: DecisionLedger,
) -> None:
    records_by_identity: dict[str, list[str]] = {}
    for row in decisions:
        identity = str(row.get("sourceEntityId") or "")
        records_by_identity.setdefault(identity, []).append(
            str(row["recordId"])
        )
    for row in entries:
        identity = str(row["identity"])
        covered = counts.get(identity, 0) == 1
        ledger.add(
            source_entity_id=f"accounting::{identity}",
            source_type="TOPOLOGY_SOURCE_ACCOUNTING_INDEX",
            source_fields={
                "sourceIdentity": identity,
                "parentIdentity": row["parentIdentity"],
                "kind": row["kind"],
                "name": row["name"],
                "priorDecisionRecordIds": records_by_identity.get(identity, []),
                "coverageRule": "PRIOR_TRANSFORMATION_DECISION_REQUIRED",
                "accountingAuthoritySourceType": _DECISION_TYPE,
            },
            projection_cardinality="1_TO_0",
            disposition="PRESERVE_EXTENSION" if covered else "REJECT_INVALID",
            evidence=[
                "index was created only after semantic decisions were frozen",
                "inventory and accounting records cannot certify coverage",
            ],
            diagnostics=[] if covered else [
                "source occurrence lacks exactly one semantic decision"
            ],
        )


def _bridge_proof(records: list[dict[str, Any]]) -> dict[str, Any]:
    record = next(
        (
            row for row in records
            if row.get("sourceType") == "STRICT_TOPOLOGY_BRIDGE_PROOF"
        ),
        None,
    )
    return (
        ((record or {}).get("sourceFields") or {}).get("topologyProof")
        or {}
    )


def _decision_identities(
    records: list[dict[str, Any]],
    decision_kind: str,
) -> set[str]:
    return {
        str(row.get("sourceEntityId") or "")
        for row in records
        if ((row.get("sourceFields") or {}).get("decisionKind"))
        == decision_kind
    }


def _decision_owners(
    records: list[dict[str, Any]],
    decision_kind: str,
    *,
    source_name: str | None = None,
) -> set[str]:
    result: set[str] = set()
    for row in records:
        fields = row.get("sourceFields") or {}
        if fields.get("decisionKind") != decision_kind:
            continue
        if source_name is not None and fields.get("sourceName") != source_name:
            continue
        owner = str(fields.get("ownerSourcePath") or "")
        if owner:
            result.add(owner)
    return result


def _mapping_sources(
    records: list[dict[str, Any]],
    source_type: str,
    field: str,
) -> set[str]:
    return {
        str((row.get("sourceFields") or {}).get(field) or "")
        for row in records
        if row.get("sourceType") == source_type
        and (row.get("sourceFields") or {}).get(field)
    }


def _duplicate_source_count(
    records: list[dict[str, Any]],
    source_type: str,
    field: str,
) -> int:
    values = [
        str((row.get("sourceFields") or {}).get(field) or "")
        for row in records
        if row.get("sourceType") == source_type
        and (row.get("sourceFields") or {}).get(field)
    ]
    return len(values) - len(set(values))


def _canonical_identities(
    canonical: ET._Element,
) -> tuple[set[str], set[str]]:
    model = next(
        child
        for child in canonical
        if _namespace(child.tag) == ""
        and _local(child.tag) == "PIPINGMODEL"
    )
    elements = {
        str(child.get("ID") or "")
        for child in model
        if _namespace(child.tag) == ""
        and _local(child.tag) == "PIPINGELEMENT"
    }
    nodes = {
        str(child.get(field) or "")
        for child in model
        if _namespace(child.tag) == ""
        and _local(child.tag) == "PIPINGELEMENT"
        for field in ("FROM_NODE", "TO_NODE")
    }
    return (
        {value for value in elements if value},
        {value for value in nodes if value},
    )


def _mapped_values(
    records: list[dict[str, Any]],
    source_type: str,
    field: str,
) -> set[str]:
    return {
        str(value)
        for row in records
        if row.get("sourceType") == source_type
        for value in row.get(field) or []
        if str(value)
    }


def _duplicate_count(
    records: list[dict[str, Any]],
    source_type: str,
    field: str,
) -> int:
    values = [
        str(value)
        for row in records
        if row.get("sourceType") == source_type
        for value in row.get(field) or []
        if str(value)
    ]
    return len(values) - len(set(values))


def _source_count(root: ET._Element, *names: str) -> int:
    accepted = set(names)
    return sum(
        1
        for element in root.iter()
        if _namespace(element.tag) == ""
        and _local(element.tag) in accepted
    )


__all__ = ["account_topology_profile_source"]
