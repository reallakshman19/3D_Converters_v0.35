#!/usr/bin/env python3
"""Secure topology InputXML reconciliation and managed-stage candidate builder."""
from __future__ import annotations

import json
from typing import Any

from lxml import etree as ET

from .base import COADE_NS, DecisionLedger
from .extension import _ensure_extension_last, _extension_record
from .managed_stage_diagnostics import block
from .managed_stage_inputxml_control import apply_document_context, reconcile_counts
from .managed_stage_inputxml_elements import sanitize_element
from .managed_stage_intake import ManagedStageIntake
from .xml import _local, _namespace, _parse_xml


def build_managed_stage_candidate(
    result: dict[str, Any],
    intake: ManagedStageIntake,
    topology: dict[str, Any],
    ledger: DecisionLedger,
) -> ET._Element:
    root = _parse_xml(
        result["topologyInputXml"].encode("utf-8"),
        "managed-stage.topology.input.xml",
    )
    if _namespace(root.tag) != COADE_NS or _local(root.tag) != "CAESARII":
        _inputxml_block(ledger, "Topology InputXML root is not {COADE}CAESARII.")
    if root.get("XML_TYPE") != "Input":
        _inputxml_block(ledger, "Topology InputXML XML_TYPE is not Input.")
    model = _direct_one(root, "PIPINGMODEL", ledger)
    parsed_elements = {
        str(row.get("inputXmlElementId") or row.get("id") or ""): row
        for row in result["parsedInputXmlTopology"].get("elements") or []
    }
    canonical_edges = {
        str(row["inputXmlElementIds"][0]): row
        for row in topology["collections"]["edges"]
    }
    elements = [
        child for child in model
        if _namespace(child.tag) == "" and _local(child.tag) == "PIPINGELEMENT"
    ]
    if [str(row.get("ID") or "") for row in elements] != list(canonical_edges):
        _inputxml_block(
            ledger,
            "Topology InputXML element order/population differs from canonical edges.",
        )
    node_index = topology["indexes"]["nodes"]
    for element in elements:
        element_id = str(element.get("ID") or "")
        parsed = parsed_elements.get(element_id)
        if parsed is None or dict(element.attrib) != parsed.get("attributes"):
            _inputxml_block(
                ledger,
                f"Securely parsed element {element_id} differs from ParsedInputXmlTopology.v1.",
            )
        sanitize_element(
            element,
            canonical_edges[element_id],
            parsed,
            node_index,
            ledger,
        )
    reconcile_counts(model, elements, topology, ledger)
    apply_document_context(root, model, intake, result, ledger)
    _preserve_artifact_evidence(model, intake, result, ledger)
    _ensure_extension_last(model)
    _ensure_extension_last(root)
    return root


def _preserve_artifact_evidence(
    model: ET._Element,
    intake: ManagedStageIntake,
    result: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    values: dict[str, Any] = {
        "ManagedStageSourceDocument": intake.source_text,
        "ManagedStageSourceIdentity": result["sourceIdentity"],
        "ManagedStageArtifactHashes": {
            "canonicalTopologyHash": result["canonicalTopology"]["canonicalTopologyHash"],
            "topologyTraceLedgerHash": result["traceLedger"]["topologyTraceLedgerHash"],
            "parsedInputXmlTopologyHash": result["parsedInputXmlTopology"]["parsedInputXmlTopologyHash"],
            "svgSceneHash": result["topologySvgScene"]["svgSceneHash"],
            "topologyParityReportHash": result["topologyParityReport"]["topologyParityReportHash"],
        },
    }
    for name, value in values.items():
        _extension_record(
            model,
            producer=ledger.producer,
            dialect="managed-stage-json",
            name=name,
            source_path=ledger.source_path,
            source_entity_id="$",
            source_field=name,
            value=(
                value if isinstance(value, str)
                else json.dumps(value, sort_keys=True, separators=(",", ":"))
            ),
            disposition="PRESERVE_EXTENSION",
            criticality="HIGH",
            confidence=1.0,
        )


def _direct_one(
    root: ET._Element,
    name: str,
    ledger: DecisionLedger,
) -> ET._Element:
    rows = [
        child for child in root
        if _namespace(child.tag) == "" and _local(child.tag) == name
    ]
    if len(rows) != 1:
        _inputxml_block(ledger, f"Topology InputXML requires exactly one direct {name}.")
    return rows[0]


def _inputxml_block(ledger: DecisionLedger, message: str) -> None:
    block(
        ledger,
        "MANAGED_STAGE_INPUTXML_RELATION_MISMATCH",
        message,
        "topologyInputXml",
    )


__all__ = ["build_managed_stage_candidate"]
