#!/usr/bin/env python3
"""One semantic accounting decision per strict managed-stage source occurrence."""
from __future__ import annotations

from typing import Any

from .base import DecisionLedger
from .managed_stage_intake import ManagedStageIntake

_REFERENCE_FIELDS = {
    "REF", "OWNER", "CREF", "HREF", "TREF", "ATTACHED_COMPONENT_REF",
    "COMPRE", "MDSSREF", "MDSGUIDEREF", "PREV-NAME",
}
_ENGINEERING_PATH_TOKENS = {
    ".enrichedAttributes", ".attributes.ABORE", ".attributes.LBORE",
    ".attributes.HBORE", ".attributes.TBORE", ".attributes.WTHK",
    ".attributes.WTXX", ".attributes.MESC", ".attributes.PRES",
    ".attributes.TEMP", ".attributes.FDENSITY", ".attributes.MDEN",
}


def record_managed_stage_source_decisions(
    intake: ManagedStageIntake,
    source: dict[str, Any],
    topology: dict[str, Any],
    engineering: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    del engineering
    entity_by_path = {
        str(row["sourcePath"]): row
        for row in source["entities"]
    }
    port_by_path = {
        str(row["sourcePath"]): row
        for row in source["ports"]
    }
    for occurrence in intake.inventory.entries:
        identity = str(occurrence["identity"])
        owner = _owner_entity(identity, entity_by_path)
        decision = _decision(
            identity,
            owner,
            port_by_path,
            topology,
        )
        ledger.add(
            source_entity_id=identity,
            source_type="MANAGED_STAGE_SOURCE_DECISION",
            source_fields={
                "sourceOccurrenceKind": occurrence["kind"],
                "sourceName": occurrence["name"],
                "sourceValue": occurrence["value"],
                "parentIdentity": occurrence["parentIdentity"],
                "decisionKind": decision["kind"],
                "decisionRule": decision["rule"],
                "ownerSourceEntityId": decision["ownerSourceEntityId"],
                "ownerSourcePath": decision["ownerSourcePath"],
                "sourcePortDisposition": decision.get("sourcePortDisposition", ""),
                "canonicalTopologyNodeIds": decision["topologyNodeIds"],
                "canonicalTopologyEdgeIds": decision["topologyEdgeIds"],
            },
            canonical_element_ids=decision["topologyEdgeIds"],
            canonical_node_ids=decision["canonicalNodeIds"],
            inputxml_element_ids=decision["inputXmlElementIds"],
            cii_section=decision.get("ciiSection"),
            projection_cardinality=decision["cardinality"],
            disposition=decision["disposition"],
            evidence=[
                "decision was created after independent artifact, identity, trace, parity, and metric verification",
                "canonical topology UUID ancestry remains distinct from canonical InputXML node identity",
                "raw inventory and accounting indexes are not coverage authority",
            ],
        )


def _decision(
    identity: str,
    owner: dict[str, Any] | None,
    ports: dict[str, dict[str, Any]],
    topology: dict[str, Any],
) -> dict[str, Any]:
    base = _empty_decision()
    if identity == "$":
        base.update(kind="SOURCE_ROOT", rule="STRICT_ROOT_PROFILE_ACCEPTED")
        return base
    if identity == topology.get("branchCollectionPath"):
        base.update(kind="BRANCH_COLLECTION", rule="AUTHORITATIVE_BRANCH_ARRAY_ORDER")
        return base
    port = ports.get(identity)
    if port:
        return _port_decision(port, topology, base)
    if owner:
        return _owner_decision(identity, owner, topology, base)
    if identity.startswith("$.") and ".children[" not in identity:
        base.update(
            kind="WRAPPER_METADATA",
            rule="VALIDATE_AND_PRESERVE_WRAPPER_METADATA",
        )
    else:
        base.update(
            kind="STRUCTURAL_COLLECTION",
            rule="PRESERVE_SOURCE_ARRAY_STRUCTURE",
        )
    return base


def _empty_decision() -> dict[str, Any]:
    return {
        "kind": "SOURCE_DOCUMENT_OCCURRENCE",
        "rule": "PRESERVE_STRICT_SOURCE_EVIDENCE",
        "ownerSourceEntityId": "",
        "ownerSourcePath": "",
        "topologyEdgeIds": [],
        "topologyNodeIds": [],
        "canonicalNodeIds": [],
        "inputXmlElementIds": [],
        "cardinality": "1_TO_0",
        "disposition": "PRESERVE_EXTENSION",
    }


def _port_decision(
    port: dict[str, Any],
    topology: dict[str, Any],
    base: dict[str, Any],
) -> dict[str, Any]:
    decision = topology["portDispositions"][port["sourcePortId"]]
    disposition = decision["disposition"]
    topology_nodes = [
        target for target in decision["targetIds"]
        if target in topology["indexes"]["nodes"]
    ]
    canonical_nodes = _input_node_ids(topology_nodes, topology)
    base.update(
        kind="SOURCE_PORT",
        rule=disposition,
        ownerSourceEntityId=port["sourceEntityId"],
        ownerSourcePath=source_path_for_port(port),
        topologyNodeIds=topology_nodes,
        canonicalNodeIds=canonical_nodes,
        cardinality="1_TO_1" if decision["targetIds"] else "1_TO_0",
        disposition=(
            "PRESERVE_EXTENSION"
            if disposition == "INTENTIONALLY_UNUSED_WITH_AUTHORITY"
            else "PROJECT_WITH_AUTHORITATIVE_TOPOLOGY_ENGINE"
        ),
        sourcePortDisposition=disposition,
    )
    return base


def _owner_decision(
    identity: str,
    owner: dict[str, Any],
    topology: dict[str, Any],
    base: dict[str, Any],
) -> dict[str, Any]:
    trace = topology["traceByEntity"][owner["sourceEntityId"]]
    topology_edges = list(trace.get("canonicalEdgeIds") or [])
    topology_nodes = list(trace.get("canonicalNodeIds") or [])
    input_elements = list(trace.get("inputXmlElementIds") or [])
    if identity == owner["sourcePath"]:
        base.update(
            kind="SOURCE_ENTITY",
            rule=f"TRACE_{trace.get('primaryDisposition')}",
            cardinality=str(trace.get("projectionCardinality") or "1_TO_0"),
        )
    elif _field_name(identity) in _REFERENCE_FIELDS:
        base.update(kind="SOURCE_REFERENCE", rule="RECONCILE_REGISTERED_REFERENCE")
    elif any(token in identity for token in _ENGINEERING_PATH_TOKENS):
        base.update(kind="ENGINEERING_FIELD", rule="RECONCILE_EXACT_COMPONENT_ENGINEERING")
    else:
        base.update(kind="SOURCE_FIELD", rule="PRESERVE_OR_PROJECT_OWNER_FIELD")
    base.update(
        ownerSourceEntityId=owner["sourceEntityId"],
        ownerSourcePath=owner["sourcePath"],
        topologyEdgeIds=topology_edges,
        topologyNodeIds=topology_nodes,
        canonicalNodeIds=_input_node_ids(topology_nodes, topology),
        inputXmlElementIds=input_elements,
        cardinality=(
            base["cardinality"]
            if identity == owner["sourcePath"]
            else "MERGE_INTO" if topology_edges else "1_TO_0"
        ),
        disposition=_entity_disposition(trace),
        ciiSection="ELEMENTS" if input_elements else None,
    )
    return base


def _input_node_ids(
    topology_node_ids: list[str],
    topology: dict[str, Any],
) -> list[str]:
    return [
        str(input_id)
        for node_id in topology_node_ids
        for input_id in topology["indexes"]["nodes"][node_id].get("inputXmlNodeIds") or []
    ]


def _entity_disposition(trace: dict[str, Any]) -> str:
    primary = str(trace.get("primaryDisposition") or "")
    if (
        primary == "DEFER_SUPPORT"
        and trace.get("lossClassification") == "DEFERRED_NON_RESTRAINT_ATTACHMENT"
        and trace.get("status") == "ACCEPTED"
    ):
        return "PRESERVE_EXTENSION"
    if primary == "EMIT_SUPPORT_ATTACHMENT":
        return "ATTACH_AUXILIARY"
    if primary == "BLOCK_AMBIGUOUS" or trace.get("status") == "ERROR":
        return "DEFER_EXPLICITLY"
    return "PROJECT_WITH_AUTHORITATIVE_TOPOLOGY_ENGINE"


def _owner_entity(
    identity: str,
    entities: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    candidates = [
        row for path, row in entities.items()
        if identity == path
        or identity.startswith(f"{path}.")
        or identity.startswith(f"{path}[")
    ]
    return max(candidates, key=lambda row: len(row["sourcePath"])) if candidates else None


def _field_name(path: str) -> str:
    return path.rsplit(".", 1)[-1].split("[", 1)[0]


def source_path_for_port(port: dict[str, Any]) -> str:
    return str(port["sourcePath"]).rsplit(".attributes.", 1)[0]


__all__ = ["record_managed_stage_source_decisions"]
