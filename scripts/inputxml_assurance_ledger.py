#!/usr/bin/env python3
"""Build and validate InputXmlCiiAssuranceLedger.v1.

PR-E assurance is intentionally pre-writer. It proves source/canonical/topology
continuity and CII section readiness, but it never invents a CII record index.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from copy import deepcopy
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

COADE_NS = "COADE"
EXT_NS = "urn:reallaksh19:inputxml:extension:v1"
BLOCKING_DISPOSITIONS = {
    "DEFER_EXPLICITLY",
    "UNSUPPORTED_BLOCKING",
    "REJECT_INVALID",
    "BLOCK_AMBIGUOUS",
    "DEFER_SUPPORT",
}
TOPOLOGY_BLOCKING_DISPOSITIONS = {"BLOCK_AMBIGUOUS", "DEFER_SUPPORT"}
READY_CONFIDENCE_FIELDS = ("identity", "topology", "ciiProjection")
GLOBAL_CII_SECTIONS = {"VERSION", "CONTROL", "UNITS"}
AUX_SECTION_BY_ELEMENT = {
    "BEND": "BEND",
    "RIGID": "RIGID",
    "SIF": "SIF&TEES",
    "RESTRAINT": "RESTRANT",
    "HANGER": "MISCEL_1",
    "WRC_297_NOZZLE": "MISCEL_1",
    "API650_NOZZLE": "MISCEL_1",
    "PD5500_NOZZLE": "MISCEL_1",
    "CUSTOM_NOZZLE": "MISCEL_1",
}


class AssuranceError(RuntimeError):
    pass


def _stable_json_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _json_hash(value: Any) -> str:
    return _sha256(_stable_json_bytes(value))


def _load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AssuranceError(f"{path}: unable to load JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise AssuranceError(f"{path}: expected a JSON object")
    return value


def _local(tag: str) -> str:
    return tag.split("}", 1)[1] if tag.startswith("{") and "}" in tag else tag


def _namespace(tag: str) -> str:
    return tag[1:].split("}", 1)[0] if tag.startswith("{") and "}" in tag else ""


def _path_attr(source_entity_id: str) -> str | None:
    if "@" not in source_entity_id:
        return None
    return source_entity_id.rsplit("@", 1)[1]


def _base_source_entity_id(source_entity_id: str) -> str:
    value = source_entity_id.split("@", 1)[0]
    for suffix in ("/BEND", "/RIGID", "/RESTRAINTS", "/RESTRAINT", "/SIF", "/HANGER"):
        if value.endswith(suffix):
            return value[: -len(suffix)]
    return value


def _candidate_source_ids(source_entity_id: str) -> list[str]:
    candidates = [source_entity_id]
    base = _base_source_entity_id(source_entity_id)
    if base not in candidates:
        candidates.append(base)
    if "@" in source_entity_id:
        no_attr = source_entity_id.split("@", 1)[0]
        if no_attr not in candidates:
            candidates.append(no_attr)
    return candidates


def _index_canonical_xml(raw: bytes) -> dict[str, Any]:
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        raise AssuranceError(f"canonical InputXML parse failed: {exc}") from exc
    if _local(root.tag) != "CAESARII" or _namespace(root.tag) != COADE_NS:
        raise AssuranceError("canonical InputXML must have {COADE}CAESARII root")
    if root.attrib.get("XML_TYPE") != "Input":
        raise AssuranceError("canonical InputXML XML_TYPE must be Input")
    models = [child for child in root if _namespace(child.tag) == "" and _local(child.tag) == "PIPINGMODEL"]
    if len(models) != 1:
        raise AssuranceError("canonical InputXML must have exactly one direct unqualified PIPINGMODEL")
    model = models[0]
    elements: dict[str, dict[str, Any]] = {}
    nodes: set[str] = set()
    canonical_paths: list[dict[str, Any]] = []
    canonical_paths.append({"path": "/CAESARII", "kind": "element", "name": "CAESARII", "ownerElementId": None})
    for attr in root.attrib:
        canonical_paths.append({"path": f"/CAESARII@{attr}", "kind": "attribute", "name": attr, "ownerElementId": None})
    canonical_paths.append({"path": "/CAESARII/PIPINGMODEL[1]", "kind": "element", "name": "PIPINGMODEL", "ownerElementId": None})
    for attr in model.attrib:
        canonical_paths.append({"path": f"/CAESARII/PIPINGMODEL[1]@{attr}", "kind": "attribute", "name": attr, "ownerElementId": None})
    element_ordinal = 0
    for child in model:
        name = _local(child.tag)
        if _namespace(child.tag) == EXT_NS:
            continue
        if name != "PIPINGELEMENT":
            canonical_paths.append({"path": f"/CAESARII/PIPINGMODEL[1]/{name}", "kind": "element", "name": name, "ownerElementId": None})
            continue
        element_ordinal += 1
        element_id = (child.attrib.get("ID") or "").strip()
        if not element_id:
            raise AssuranceError(f"canonical PIPINGELEMENT #{element_ordinal} is missing ID")
        if element_id in elements:
            raise AssuranceError(f"duplicate canonical PIPINGELEMENT ID {element_id}")
        node_pair = [child.attrib.get("FROM_NODE", ""), child.attrib.get("TO_NODE", "")]
        nodes.update(value for value in node_pair if value)
        base_path = f"/CAESARII/PIPINGMODEL[1]/PIPINGELEMENT[{element_ordinal}]"
        canonical_paths.append({"path": base_path, "kind": "element", "name": "PIPINGELEMENT", "ownerElementId": element_id})
        for attr in child.attrib:
            canonical_paths.append({"path": f"{base_path}@{attr}", "kind": "attribute", "name": attr, "ownerElementId": element_id})
        auxiliaries: list[dict[str, Any]] = []
        child_counts: dict[str, int] = defaultdict(int)
        for aux in child:
            aux_name = _local(aux.tag)
            if _namespace(aux.tag) == EXT_NS:
                continue
            child_counts[aux_name] += 1
            aux_path = f"{base_path}/{aux_name}[{child_counts[aux_name]}]"
            canonical_paths.append({"path": aux_path, "kind": "element", "name": aux_name, "ownerElementId": element_id})
            for attr in aux.attrib:
                canonical_paths.append({"path": f"{aux_path}@{attr}", "kind": "attribute", "name": attr, "ownerElementId": element_id})
            auxiliaries.append({"name": aux_name, "attributes": dict(aux.attrib), "path": aux_path})
        elements[element_id] = {
            "id": element_id,
            "attributes": dict(child.attrib),
            "nodes": node_pair,
            "auxiliaries": auxiliaries,
            "path": base_path,
        }
    if not elements:
        raise AssuranceError("canonical InputXML contains no PIPINGELEMENT records")
    return {
        "root": root,
        "model": model,
        "elements": elements,
        "elementIds": sorted(elements),
        "nodeIds": sorted(nodes),
        "canonicalPaths": canonical_paths,
    }


def _field_section_index(field_catalog: dict[str, Any]) -> dict[str, list[str]]:
    encoding = field_catalog.get("recordEncoding") or {}
    columns = encoding.get("columns") or []
    records = field_catalog.get("records") or []
    if not columns or not isinstance(records, list):
        raise AssuranceError("field catalog has no record encoding")
    index: dict[str, set[str]] = defaultdict(set)
    for row in records:
        if not isinstance(row, list) or len(row) != len(columns):
            raise AssuranceError("field catalog row shape mismatch")
        record = dict(zip(columns, row))
        names: list[str] = []
        canonical_name = str(record.get("canonicalName") or "")
        expansions = record.get("expandsTo") or []
        if expansions and all(isinstance(item, str) for item in expansions):
            names.extend(expansions)
        elif "{n}" in canonical_name and expansions:
            names.extend(canonical_name.replace("{n}", str(item)) for item in expansions)
        elif canonical_name and "*" not in canonical_name and "{" not in canonical_name:
            names.append(canonical_name)
        target = str(record.get("ciiTargetSection") or "")
        sections = [part for part in re.split(r"[/|]", target) if part and part not in {"EXTENSION", "VALIDATION"}]
        for name in names:
            index[name].update(sections)
    return {name: sorted(values) for name, values in index.items()}


def _infer_sections(record: dict[str, Any], field_sections: dict[str, list[str]]) -> list[str]:
    explicit = record.get("CIISection")
    if explicit:
        return [str(explicit)]
    source_type = str(record.get("sourceType") or "")
    source_entity_id = str(record.get("sourceEntityId") or "")
    attr = _path_attr(source_entity_id)
    if source_type == "ATTRIBUTE" and attr:
        if attr in {"VERSION", "XML_TYPE", "JOBNAME", "TIME", "ISSUE_NO", "NORTH_X", "NORTH_Y", "NORTH_Z"}:
            return ["VERSION"]
        if attr.startswith("NUM") or attr == "NOHGRS":
            return ["CONTROL"]
    if attr and attr in field_sections:
        return field_sections[attr]
    if source_type.startswith("ELEMENT:"):
        name = source_type.split(":", 1)[1]
        if name == "CAESARII":
            return ["VERSION"]
        if name == "PIPINGMODEL":
            return ["CONTROL"]
        if name == "PIPINGELEMENT":
            return ["ELEMENTS"]
        if name in AUX_SECTION_BY_ELEMENT:
            return [AUX_SECTION_BY_ELEMENT[name]]
    return []


def _topology_records(topology_trace: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    if topology_trace is None:
        return {}
    if topology_trace.get("schema") != "TopologyTraceLedger.v1":
        raise AssuranceError("topology trace ledger schema must be TopologyTraceLedger.v1")
    result: dict[str, dict[str, Any]] = {}
    for row in topology_trace.get("records") or []:
        entity_id = str(row.get("sourceEntityId") or "")
        if not entity_id:
            raise AssuranceError("topology trace record is missing sourceEntityId")
        if entity_id in result:
            raise AssuranceError(f"duplicate topology sourceEntityId {entity_id}")
        result[entity_id] = row
    return result


def _find_topology_record(source_entity_id: str, topology_index: dict[str, dict[str, Any]]) -> tuple[str | None, dict[str, Any] | None]:
    for candidate in _candidate_source_ids(source_entity_id):
        if candidate in topology_index:
            return candidate, topology_index[candidate]
    return None, None


def _validate_hash_anchors(topology_trace: dict[str, Any] | None, parity: dict[str, Any] | None, diagnostics: list[dict[str, Any]]) -> str:
    if topology_trace is None and parity is None:
        return "NOT_APPLICABLE"
    if topology_trace is None or parity is None:
        diagnostics.append({"severity": "BLOCKING", "code": "TOPOLOGY_ARTIFACT_PAIR_REQUIRED", "message": "topology trace ledger and parity report must be supplied together"})
        return "BLOCKED"
    if parity.get("schema") != "TopologyParityReport.v1":
        diagnostics.append({"severity": "BLOCKING", "code": "TOPOLOGY_PARITY_SCHEMA_INVALID", "message": "topology parity report schema must be TopologyParityReport.v1"})
        return "BLOCKED"
    anchors = parity.get("sourceAnchors") or {}
    comparisons = (
        ("canonicalTopologyHash", topology_trace.get("canonicalTopologyHash"), anchors.get("canonicalTopologyHash")),
        ("topologyTraceLedgerHash", topology_trace.get("topologyTraceLedgerHash"), anchors.get("topologyTraceLedgerHash")),
    )
    status = "PASS"
    for name, trace_value, parity_value in comparisons:
        if not trace_value or not parity_value or trace_value != parity_value:
            diagnostics.append({"severity": "BLOCKING", "code": "TOPOLOGY_HASH_ANCHOR_MISMATCH", "message": f"{name} differs between topology trace and parity report", "context": {"trace": trace_value, "parity": parity_value}})
            status = "BLOCKED"
    if parity.get("ok") is not True or int(parity.get("mismatchCount") or 0) != 0:
        diagnostics.append({"severity": "BLOCKING", "code": "TOPOLOGY_PARITY_FAILED", "message": "three-way topology parity is not exact", "context": {"mismatchCount": parity.get("mismatchCount"), "summary": parity.get("summary")}})
        status = "BLOCKED"
    return status


def _coverage_mode(record: dict[str, Any], canonical_index: dict[str, Any]) -> str:
    source_entity_id = str(record.get("sourceEntityId") or "")
    if source_entity_id.startswith("/CAESARII"):
        return "FIELD_LEVEL" if "@" in source_entity_id else "ENTITY_LEVEL"
    xml_ids = [str(value) for value in record.get("InputXMLElementIds") or []]
    if xml_ids:
        return "ENTITY_LEVEL"
    canonical_ids = [str(value) for value in record.get("canonicalElementIds") or []]
    if any(value in canonical_index["elements"] for value in canonical_ids):
        return "ENTITY_LEVEL"
    if record.get("CIISection") in GLOBAL_CII_SECTIONS:
        return "FIELD_LEVEL"
    if record.get("disposition") in {"PRESERVE_EXTENSION", "FILTER_INACTIVE_PADDING", "FILTER_COMPATIBILITY_DEFAULT", "NORMALIZE_EXPLICIT_ABSENCE"}:
        return "EVIDENCE_ONLY"
    return "UNTRACED"


def _record_readiness(record: dict[str, Any], topology: dict[str, Any] | None, sections: list[str], mapping_errors: list[str]) -> str:
    disposition = str(record.get("disposition") or "")
    if disposition in BLOCKING_DISPOSITIONS or mapping_errors:
        return "BLOCKED"
    if topology is not None:
        if str(topology.get("status") or "").upper() == "ERROR":
            return "BLOCKED"
        if str(topology.get("primaryDisposition") or "") in TOPOLOGY_BLOCKING_DISPOSITIONS:
            return "BLOCKED"
    if sections:
        confidence = record.get("confidence") or {}
        for key in READY_CONFIDENCE_FIELDS:
            try:
                if float(confidence.get(key, 0)) < 1.0:
                    return "BLOCKED"
            except (TypeError, ValueError):
                return "BLOCKED"
        return "READY"
    return "EVIDENCE_ONLY"


def build_assurance_ledger(
    *,
    canonical_xml: bytes,
    canonicalization_ledger: dict[str, Any],
    canonical_validation: dict[str, Any],
    field_catalog: dict[str, Any],
    projection_contract: dict[str, Any],
    topology_trace: dict[str, Any] | None = None,
    topology_parity: dict[str, Any] | None = None,
) -> dict[str, Any]:
    diagnostics: list[dict[str, Any]] = []
    if canonicalization_ledger.get("schema") != "InputXmlCanonicalizationDecisionLedger.v1":
        raise AssuranceError("canonicalization ledger schema must be InputXmlCanonicalizationDecisionLedger.v1")
    if canonical_validation.get("schema") != "InputXmlCanonicalValidation.v1":
        raise AssuranceError("canonical validation schema must be InputXmlCanonicalValidation.v1")
    canonical_index = _index_canonical_xml(canonical_xml)
    canonical_hash = _sha256(canonical_xml)
    declared_hash = canonicalization_ledger.get("canonicalHashSha256")
    if declared_hash != canonical_hash:
        diagnostics.append({"severity": "BLOCKING", "code": "CANONICAL_HASH_MISMATCH", "message": "canonical XML hash differs from canonicalization ledger", "context": {"declared": declared_hash, "actual": canonical_hash}})
    projection_sections = set(projection_contract.get("sectionOrder") or [])
    if projection_contract.get("schema") != "InputXmlCiiProjectionContract.v1":
        raise AssuranceError("projection contract schema must be InputXmlCiiProjectionContract.v1")
    field_sections = _field_section_index(field_catalog)
    topology_index = _topology_records(topology_trace)
    topology_gate = _validate_hash_anchors(topology_trace, topology_parity, diagnostics)

    assurance_records: list[dict[str, Any]] = []
    topology_mapped: set[str] = set()
    mapped_inputxml_ids: set[str] = set()
    for index, source_record in enumerate(canonicalization_ledger.get("records") or [], 1):
        record = deepcopy(source_record)
        source_entity_id = str(record.get("sourceEntityId") or "")
        topology_id, topology = _find_topology_record(source_entity_id, topology_index)
        if topology_id:
            topology_mapped.add(topology_id)
        sections = _infer_sections(record, field_sections)
        mapping_errors: list[str] = []
        for section in sections:
            if section not in projection_sections:
                mapping_errors.append(f"CII section {section} is not declared by projection contract")
        if record.get("CIIIndex") is not None:
            mapping_errors.append("PR-E forbids non-null CIIIndex before writer projection")
        xml_ids = [str(value) for value in record.get("InputXMLElementIds") or []]
        for element_id in xml_ids:
            mapped_inputxml_ids.add(element_id)
            if element_id not in canonical_index["elements"]:
                mapping_errors.append(f"InputXMLElementId {element_id} does not exist in canonical XML")
        if topology is not None:
            topology_xml_ids = {str(value) for value in topology.get("inputXmlElementIds") or []}
            if topology_xml_ids and xml_ids and not set(xml_ids).issubset(topology_xml_ids):
                mapping_errors.append("canonicalization InputXMLElementIds are not a subset of topology trace InputXML identities")
        coverage = _coverage_mode(record, canonical_index)
        if coverage == "UNTRACED" and record.get("disposition") not in BLOCKING_DISPOSITIONS:
            mapping_errors.append("record has no canonical field/entity coverage or explicit evidence-only disposition")
        readiness = _record_readiness(record, topology, sections, mapping_errors)
        if readiness == "BLOCKED" and mapping_errors:
            diagnostics.append({"severity": "BLOCKING", "code": "ASSURANCE_RECORD_MAPPING_FAILED", "message": f"assurance mapping failed for {source_entity_id or record.get('recordId')}", "context": {"errors": mapping_errors}})
        assurance_records.append({
            "assuranceRecordId": f"IXAL-{index:07d}",
            "canonicalizationRecordId": record.get("recordId"),
            "sourceRepository": record.get("sourceRepository") or canonicalization_ledger.get("sourceRepository"),
            "sourcePath": record.get("sourcePath") or canonicalization_ledger.get("sourcePath"),
            "producer": record.get("producer") or canonicalization_ledger.get("producer"),
            "dialect": record.get("dialect") or canonicalization_ledger.get("dialect"),
            "sourceEntityId": source_entity_id,
            "sourceType": record.get("sourceType"),
            "sourceFields": record.get("sourceFields"),
            "topology": None if topology is None else {
                "traceRecordId": topology.get("recordId"),
                "sourceEntityId": topology_id,
                "status": topology.get("status"),
                "primaryDisposition": topology.get("primaryDisposition"),
                "lossClassification": topology.get("lossClassification"),
                "canonicalNodeIds": topology.get("canonicalNodeIds") or [],
                "canonicalEdgeIds": topology.get("canonicalEdgeIds") or [],
                "junctionIds": topology.get("junctionIds") or [],
                "boundaryNodeIds": topology.get("boundaryNodeIds") or [],
                "inputXmlElementIds": topology.get("inputXmlElementIds") or [],
                "inputXmlChildIds": topology.get("inputXmlChildIds") or [],
                "deferredProperties": topology.get("deferredProperties") or [],
            },
            "canonical": {
                "componentIds": record.get("canonicalComponentIds") or [],
                "nodeIds": record.get("canonicalNodeIds") or [],
                "elementIds": record.get("canonicalElementIds") or [],
                "inputXmlElementIds": xml_ids,
                "coverageMode": coverage,
            },
            "projection": {
                "sections": sections,
                "ciiIndex": None,
                "indexStatus": "PENDING_WRITER_ADAPTER" if sections else "NOT_APPLICABLE",
                "projectionCardinality": record.get("projectionCardinality"),
                "disposition": record.get("disposition"),
                "readiness": readiness,
            },
            "confidence": record.get("confidence") or {},
            "evidence": record.get("evidence") or [],
            "diagnostics": list(record.get("diagnostics") or []) + mapping_errors,
            "status": readiness,
        })

    for topology_id, topology in topology_index.items():
        if topology_id not in topology_mapped:
            diagnostics.append({"severity": "BLOCKING", "code": "ORPHAN_TOPOLOGY_TRACE_RECORD", "message": f"topology source entity {topology_id} has no canonicalization decision record", "context": {"topologyRecordId": topology.get("recordId")}})

    direct_canonical = canonicalization_ledger.get("dialect") == "canonical-inputxml-v1"
    if not direct_canonical:
        for element_id in canonical_index["elementIds"]:
            if element_id not in mapped_inputxml_ids:
                diagnostics.append({"severity": "BLOCKING", "code": "UNMAPPED_CANONICAL_ELEMENT", "message": f"canonical element {element_id} is absent from all InputXMLElementIds"})

    record_counts = defaultdict(int)
    for row in assurance_records:
        record_counts[row["status"]] += 1
    canonicalization_gate = "PASS" if canonicalization_ledger.get("status") == "PASS" else "BLOCKED"
    validation_gate = "PASS" if canonical_validation.get("status") == "PASS" else "BLOCKED"
    projection_gate = "PASS" if record_counts["BLOCKED"] == 0 else "BLOCKED"
    blocking_diagnostics = [row for row in diagnostics if row.get("severity") in {"ERROR", "BLOCKING"}]
    overall = "PASS" if (
        canonicalization_gate == "PASS"
        and validation_gate == "PASS"
        and topology_gate in {"PASS", "NOT_APPLICABLE"}
        and projection_gate == "PASS"
        and not blocking_diagnostics
    ) else "BLOCKED"
    chain = {
        "sourceHashSha256": canonicalization_ledger.get("sourceHashSha256"),
        "canonicalHashSha256": canonical_hash,
        "canonicalizationLedgerHashSha256": _json_hash(canonicalization_ledger),
        "canonicalValidationHashSha256": _json_hash(canonical_validation),
        "fieldCatalogHashSha256": _json_hash(field_catalog),
        "projectionContractHashSha256": _json_hash(projection_contract),
        "topologyTraceLedgerHashSha256": None if topology_trace is None else _json_hash(topology_trace),
        "topologyParityReportHashSha256": None if topology_parity is None else _json_hash(topology_parity),
    }
    result = {
        "schema": "InputXmlCiiAssuranceLedger.v1",
        "authority": {
            "repository": "reallaksh19/3D_Converters",
            "builder": "scripts/inputxml_assurance_ledger.py",
            "projectionPhase": "PRE_WRITER_READINESS",
            "rule": "CII sections may be declared; CII indexes remain null until a writer projection proves them.",
        },
        "status": overall,
        "chain": chain,
        "gates": {
            "canonicalization": canonicalization_gate,
            "canonicalValidation": validation_gate,
            "topologyTrace": "NOT_APPLICABLE" if topology_trace is None else ("BLOCKED" if any(str(row.get("status") or "").upper() == "ERROR" for row in topology_index.values()) else "PASS"),
            "topologyParity": topology_gate,
            "ciiProjectionReadiness": projection_gate,
        },
        "summary": {
            "sourceRecordCount": len(canonicalization_ledger.get("records") or []),
            "assuranceRecordCount": len(assurance_records),
            "topologyTraceRecordCount": len(topology_index),
            "canonicalElementCount": len(canonical_index["elements"]),
            "canonicalNodeCount": len(canonical_index["nodeIds"]),
            "readyRecordCount": record_counts["READY"],
            "evidenceOnlyRecordCount": record_counts["EVIDENCE_ONLY"],
            "blockedRecordCount": record_counts["BLOCKED"],
            "diagnosticCount": len(diagnostics),
            "blockingDiagnosticCount": len(blocking_diagnostics),
        },
        "records": assurance_records,
        "diagnostics": diagnostics,
    }
    result["assuranceHashSha256"] = _json_hash(result)
    return result


def validate_assurance_ledger(value: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if value.get("schema") != "InputXmlCiiAssuranceLedger.v1":
        errors.append("schema must be InputXmlCiiAssuranceLedger.v1")
    if value.get("status") not in {"PASS", "BLOCKED"}:
        errors.append("status must be PASS or BLOCKED")
    records = value.get("records")
    if not isinstance(records, list):
        errors.append("records must be an array")
        return errors
    ids: set[str] = set()
    for index, row in enumerate(records, 1):
        record_id = str(row.get("assuranceRecordId") or "")
        if not record_id or record_id in ids:
            errors.append(f"record {index}: assuranceRecordId missing or duplicate")
        ids.add(record_id)
        projection = row.get("projection") or {}
        if projection.get("ciiIndex") is not None:
            errors.append(f"record {record_id}: CII index must remain null in PR-E")
        if projection.get("readiness") not in {"READY", "EVIDENCE_ONLY", "BLOCKED"}:
            errors.append(f"record {record_id}: invalid readiness")
        if row.get("status") != projection.get("readiness"):
            errors.append(f"record {record_id}: status/readiness mismatch")
    summary = value.get("summary") or {}
    if summary.get("assuranceRecordCount") != len(records):
        errors.append("summary assuranceRecordCount mismatch")
    return errors


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--canonical-xml", type=Path, required=True)
    parser.add_argument("--canonicalization-ledger", type=Path, required=True)
    parser.add_argument("--canonical-validation", type=Path, required=True)
    parser.add_argument("--field-catalog", type=Path, required=True)
    parser.add_argument("--projection-contract", type=Path, required=True)
    parser.add_argument("--topology-trace-ledger", type=Path)
    parser.add_argument("--topology-parity-report", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        value = build_assurance_ledger(
            canonical_xml=args.canonical_xml.read_bytes(),
            canonicalization_ledger=_load_json(args.canonicalization_ledger),
            canonical_validation=_load_json(args.canonical_validation),
            field_catalog=_load_json(args.field_catalog),
            projection_contract=_load_json(args.projection_contract),
            topology_trace=_load_json(args.topology_trace_ledger) if args.topology_trace_ledger else None,
            topology_parity=_load_json(args.topology_parity_report) if args.topology_parity_report else None,
        )
        errors = validate_assurance_ledger(value)
        if errors:
            raise AssuranceError("; ".join(errors))
        _write_json(args.output, value)
        print(json.dumps({"status": value["status"], "output": str(args.output), "assuranceHashSha256": value["assuranceHashSha256"]}, indent=2))
        return 0 if value["status"] == "PASS" else 2
    except (OSError, AssuranceError) as exc:
        print(f"ASSURANCE ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
