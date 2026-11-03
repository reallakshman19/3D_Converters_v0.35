#!/usr/bin/env python3
"""Bind source-port decisions only to verified owner-component InputXML elements."""
from __future__ import annotations

from typing import Any

from .base import DecisionLedger
from .managed_stage_diagnostics import block

_PORT_DECISION_TYPE = "MANAGED_STAGE_SOURCE_DECISION"
_EVIDENCE_ONLY_PORTS = {
    "INTENTIONALLY_UNUSED_WITH_AUTHORITY",
    "MAP_TO_POINT_FEATURE",
}


def bind_source_port_element_coverage(
    topology: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    """Attach exact owner-authorized incident elements after topology verification."""
    node_elements = _node_element_index(topology)
    mappings = topology["componentMappings"]
    for record in ledger.records:
        if record.get("sourceType") != _PORT_DECISION_TYPE:
            continue
        fields = record.get("sourceFields") or {}
        disposition = str(fields.get("sourcePortDisposition") or "")
        if not disposition:
            continue
        if disposition in _EVIDENCE_ONLY_PORTS:
            _mark_evidence_only(record, disposition)
            continue
        owner_id = str(fields.get("ownerSourceEntityId") or "")
        mapping = mappings.get(owner_id)
        if mapping is None:
            _coverage_block(record, ledger, "Source port has no verified owner-component mapping.")
        authorized = set(str(value) for value in mapping.get("inputXmlElementIds") or [])
        node_ids = [str(value) for value in fields.get("canonicalTopologyNodeIds") or []]
        incident = _ordered_unique(
            element_id
            for node_id in node_ids
            for element_id in node_elements.get(node_id, ())
        )
        element_ids = [value for value in incident if value in authorized]
        if not element_ids:
            _coverage_block(
                record,
                ledger,
                "Mapped source port has no incident InputXML element owned by its source component.",
                ownerSourceEntityId=owner_id,
                sourcePortDisposition=disposition,
                canonicalTopologyNodeIds=node_ids,
                incidentElementIds=incident,
                authorizedComponentElementIds=sorted(authorized),
            )
        unrelated = [value for value in incident if value not in authorized]
        record["canonicalElementIds"] = element_ids
        record["InputXMLElementIds"] = element_ids
        record["CIISection"] = "ELEMENTS"
        fields["authorizedComponentElementIds"] = sorted(authorized)
        fields["unrelatedIncidentElementIds"] = unrelated
        fields["portElementCoverageStatus"] = "VERIFIED_OWNER_INTERSECTION"
        record.setdefault("evidence", []).append(
            "source-port coverage is restricted to the verified owner component or authorized managed merge"
        )


def _node_element_index(topology: dict[str, Any]) -> dict[str, tuple[str, ...]]:
    result: dict[str, list[str]] = {}
    for edge in topology["collections"]["edges"]:
        element_ids = [str(value) for value in edge.get("inputXmlElementIds") or []]
        for node_field in ("fromNodeId", "toNodeId"):
            node_id = str(edge.get(node_field) or "")
            result.setdefault(node_id, []).extend(element_ids)
    return {
        node_id: tuple(_ordered_unique(element_ids))
        for node_id, element_ids in result.items()
    }


def _mark_evidence_only(record: dict[str, Any], disposition: str) -> None:
    record["canonicalElementIds"] = []
    record["InputXMLElementIds"] = []
    record["CIISection"] = None
    record["disposition"] = "PRESERVE_EXTENSION"
    fields = record.get("sourceFields") or {}
    fields["authorizedComponentElementIds"] = []
    fields["unrelatedIncidentElementIds"] = []
    fields["portElementCoverageStatus"] = "VERIFIED_INTENTIONAL_NONPROJECTION"
    record.setdefault("evidence", []).append(
        f"explicit source-port disposition {disposition} requires no CII element"
    )


def _coverage_block(
    record: dict[str, Any],
    ledger: DecisionLedger,
    message: str,
    **context: Any,
) -> None:
    block(
        ledger,
        "MANAGED_STAGE_COMPONENT_MAPPING_INCOMPLETE",
        message,
        str(record.get("sourceEntityId") or "sourcePort"),
        **context,
    )


def _ordered_unique(values) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


__all__ = ["bind_source_port_element_coverage"]
