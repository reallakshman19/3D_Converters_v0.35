#!/usr/bin/env python3
"""Assured canonical InputXML -> CII(2019) projection.

This module delegates CII generation to the production writer
``inputxml_to_cii2019.py``. It adds a strict preflight and parses the actual
serialized CII to prove section/index and pointer integrity. It is not a
second neutral-file writer.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import re
import sys
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

WRITER_PATH = Path(__file__).with_name("inputxml_to_cii2019.py")
COADE_NS = "COADE"
SENTINEL = -1.0101
ELEMENT_BLOCK_LINES = 15
SECTION_HEADER_RE = re.compile(r"^#\$\s+([A-Z0-9&_]+)")
TIME_RE = re.compile(r"^\d{4}/\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2}$")
AUX_POINTERS = {
    "BEND": (12, 0),
    "RIGID": (12, 1),
    "RESTRANT": (12, 3),
    "SIF&TEES": (13, 4),
    "NODENAME": (13, 5),
    "REDUCERS": (14, 0),
}
AUX_RECORD_WIDTH = {
    "BEND": 3,
    "RIGID": 1,
    "RESTRANT": 24,
    "SIF&TEES": 10,
    "NODENAME": 1,
    "REDUCERS": 1,
}
GLOBAL_SECTIONS = {"VERSION", "CONTROL", "AUX_DATA", "UNITS"}
STRICT_REQUIRED_ELEMENT_FIELDS = (
    "ID", "FROM_NODE", "TO_NODE", "DELTA_X", "DELTA_Y", "DELTA_Z",
    "DIAMETER", "WALL_THICK", "MATERIAL_NUM", "LINE",
    "FROM_X", "FROM_Y", "FROM_Z", "TO_X", "TO_Y", "TO_Z",
    "FROM_NAME", "TO_NAME",
)
BLOCKED_CHILDREN = {
    "HANGER", "ALLOWABLESTRESS", "DISPLACEMENTS", "FORCESMOMENTS",
    "UNIFORM", "WIND", "OFFSETS", "EXPANSION_JOINT", "REDUCER", "FLANGES",
}
NOZZLE_NAMES = {"WRC_297_NOZZLE", "API650_NOZZLE", "PD5500_NOZZLE", "CUSTOM_NOZZLE"}


class ProjectionBlocked(RuntimeError):
    pass


@dataclass(frozen=True)
class CanonicalElement:
    element_id: str
    ordinal: int
    from_node: str
    to_node: str
    child_names: tuple[str, ...]


def _load_writer():
    spec = importlib.util.spec_from_file_location("inputxml_to_cii2019_assured_writer", WRITER_PATH)
    if spec is None or spec.loader is None:
        raise ProjectionBlocked(f"Unable to load production writer at {WRITER_PATH}.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _stable_json_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _json_hash(value: Any) -> str:
    return _sha256(_stable_json_bytes(value))


def _local(tag: str) -> str:
    return tag.split("}", 1)[1] if tag.startswith("{") and "}" in tag else tag


def _namespace(tag: str) -> str:
    return tag[1:].split("}", 1)[0] if tag.startswith("{") and "}" in tag else ""


def _finite_number(raw: str | None, field: str, *, allow_zero: bool = True) -> float:
    text = str(raw or "").strip()
    if not text:
        raise ProjectionBlocked(f"Assured projection requires explicit {field}.")
    try:
        value = float(text)
    except ValueError as exc:
        raise ProjectionBlocked(f"Invalid numeric value for {field}: {text!r}.") from exc
    if not math.isfinite(value) or abs(value - SENTINEL) < 1e-7:
        raise ProjectionBlocked(f"Assured projection forbids missing/non-finite {field}: {text!r}.")
    if not allow_zero and abs(value) < 1e-12:
        raise ProjectionBlocked(f"Assured projection requires nonzero {field}.")
    return value


def _parse_canonical(raw: bytes) -> tuple[ET.Element, ET.Element, list[CanonicalElement]]:
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        raise ProjectionBlocked(f"Canonical InputXML parse failed: {exc}.") from exc
    if _local(root.tag) != "CAESARII" or _namespace(root.tag) != COADE_NS:
        raise ProjectionBlocked("Assured projection requires the {COADE}CAESARII root.")
    if root.attrib.get("XML_TYPE") != "Input":
        raise ProjectionBlocked("Assured projection requires XML_TYPE='Input'.")
    models = [child for child in root if _namespace(child.tag) == "" and _local(child.tag) == "PIPINGMODEL"]
    if len(models) != 1:
        raise ProjectionBlocked("Assured projection requires exactly one direct unqualified PIPINGMODEL.")
    model = models[0]
    time_text = str(model.attrib.get("TIME") or "").strip()
    if not TIME_RE.fullmatch(time_text):
        raise ProjectionBlocked(
            "Assured projection requires explicit PIPINGMODEL@TIME in YYYY/MM/DD HH:MM:SS format; "
            "current-clock fallback is forbidden."
        )
    if any(_local(child.tag) in NOZZLE_NAMES and _namespace(child.tag) == "" for child in model):
        raise ProjectionBlocked("Nozzle projection is not yet approved for the PR-F assured writer path.")

    elements: list[CanonicalElement] = []
    ids: set[str] = set()
    for ordinal, element in enumerate(
        [child for child in model if _namespace(child.tag) == "" and _local(child.tag) == "PIPINGELEMENT"],
        1,
    ):
        for field in STRICT_REQUIRED_ELEMENT_FIELDS:
            if not str(element.attrib.get(field) or "").strip():
                raise ProjectionBlocked(f"PIPINGELEMENT[{ordinal}] is missing assured field {field}.")
        element_id = element.attrib["ID"].strip()
        if element_id in ids:
            raise ProjectionBlocked(f"Duplicate PIPINGELEMENT ID {element_id}.")
        ids.add(element_id)
        for field in (
            "FROM_NODE", "TO_NODE", "DELTA_X", "DELTA_Y", "DELTA_Z",
            "DIAMETER", "WALL_THICK", "MATERIAL_NUM",
            "FROM_X", "FROM_Y", "FROM_Z", "TO_X", "TO_Y", "TO_Z",
        ):
            _finite_number(element.attrib.get(field), f"{element_id}@{field}", allow_zero=field != "DIAMETER")
        child_names = tuple(
            _local(child.tag) for child in element
            if _namespace(child.tag) == ""
        )
        forbidden = sorted(set(child_names) & BLOCKED_CHILDREN)
        if forbidden:
            raise ProjectionBlocked(
                f"{element_id} contains unapproved assured auxiliary data: {', '.join(forbidden)}."
            )
        for sif in [child for child in element if _namespace(child.tag) == "" and _local(child.tag) == "SIF"]:
            meaningful = [name for name, value in sif.attrib.items() if name != "NODE" and str(value).strip() not in {"", "0", "0.0", "-1.0101"}]
            if meaningful:
                raise ProjectionBlocked(
                    f"{element_id}/SIF has fields not projected by the production writer: {', '.join(meaningful)}."
                )
        elements.append(CanonicalElement(
            element_id=element_id,
            ordinal=ordinal,
            from_node=element.attrib["FROM_NODE"].strip(),
            to_node=element.attrib["TO_NODE"].strip(),
            child_names=child_names,
        ))
    if not elements:
        raise ProjectionBlocked("Canonical InputXML contains no PIPINGELEMENT records.")
    return root, model, elements


def _validate_assurance(assurance: dict[str, Any], canonical_hash: str) -> None:
    if assurance.get("schema") != "InputXmlCiiAssuranceLedger.v1":
        raise ProjectionBlocked("Assurance input must be InputXmlCiiAssuranceLedger.v1.")
    if assurance.get("status") != "PASS":
        raise ProjectionBlocked("Assurance ledger status must be PASS.")
    chain = assurance.get("chain") or {}
    if chain.get("canonicalHashSha256") != canonical_hash:
        raise ProjectionBlocked("Assurance canonical hash does not match the supplied canonical InputXML bytes.")
    gates = assurance.get("gates") or {}
    for gate in ("canonicalization", "canonicalValidation", "ciiProjectionReadiness"):
        if gates.get(gate) != "PASS":
            raise ProjectionBlocked(f"Assurance gate {gate} must be PASS.")
    for record in assurance.get("records") or []:
        if record.get("status") == "BLOCKED":
            raise ProjectionBlocked(f"Assurance record {record.get('assuranceRecordId')} is BLOCKED.")
        projection = record.get("projection") or {}
        if projection.get("ciiIndex") is not None:
            raise ProjectionBlocked("Pre-writer assurance records must not contain a CII index.")


def _strict_layout(writer) -> dict[str, object]:
    config = writer._load_2019_layout_config()
    config = deepcopy(config)
    compatibility = config.setdefault("compatibility", {})
    compatibility["raw_override_mode"] = writer.RAW_OVERRIDE_MODE_SCHEMA
    sections = config.setdefault("sections", {})
    sections["raw_payload_overrides"] = {}
    sections["include_nodename"] = True
    nodename = config.setdefault("nodename", {})
    nodename["mode"] = "auto"
    allowbls = config.setdefault("allowbls", {})
    allowbls["lines"] = []
    displmnt = config.setdefault("displmnt", {})
    displmnt["node_ids"] = []
    displmnt["auto_from_equipmnt_nodes"] = False
    equipmnt = config.setdefault("equipmnt", {})
    equipmnt["entries"] = []
    miscel = config.setdefault("miscel_1", {})
    material = miscel.setdefault("material", {})
    material["source"] = "xml"
    material["fallback_default"] = str(SENTINEL)
    nozzles = miscel.setdefault("nozzles", {})
    nozzles["source"] = "none"
    nozzles["entries"] = []
    hangers = miscel.setdefault("hangers", {})
    hangers["source"] = "none"
    hangers["entries"] = []
    coords = config.setdefault("coords", {})
    coords["mode"] = "all_nodes"
    coords["origin_offset"] = ["0", "0", "0"]
    return config


def _parse_sections(cii_text: str) -> tuple[list[str], dict[str, list[str]]]:
    order: list[str] = []
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for raw_line in cii_text.splitlines():
        match = SECTION_HEADER_RE.match(raw_line.strip())
        if match:
            current = match.group(1)
            if current in sections:
                raise ProjectionBlocked(f"Duplicate CII section {current}.")
            order.append(current)
            sections[current] = []
            continue
        if current is None:
            if raw_line.strip():
                raise ProjectionBlocked("CII payload appears before the first section header.")
            continue
        sections[current].append(raw_line)
    if not order:
        raise ProjectionBlocked("Production writer emitted no CII sections.")
    return order, sections


def _parse_int_tokens(line: str, expected: int, label: str) -> list[int]:
    tokens = line.split()
    if len(tokens) < expected:
        raise ProjectionBlocked(f"{label} contains {len(tokens)} values; expected at least {expected}.")
    values: list[int] = []
    for token in tokens[:expected]:
        try:
            raw = float(token)
        except ValueError as exc:
            raise ProjectionBlocked(f"{label} has non-numeric pointer token {token!r}.") from exc
        integer = int(round(raw))
        if abs(raw - integer) > 1e-6 or integer < 0:
            raise ProjectionBlocked(f"{label} has invalid nonnegative integer pointer {token!r}.")
        values.append(integer)
    return values


def _record_count(section: str, payload: list[str]) -> int:
    if section == "ELEMENTS":
        if len(payload) % ELEMENT_BLOCK_LINES:
            raise ProjectionBlocked(
                f"ELEMENTS payload has {len(payload)} lines; expected a multiple of {ELEMENT_BLOCK_LINES}."
            )
        return len(payload) // ELEMENT_BLOCK_LINES
    if section == "COORDS":
        if not payload:
            return 0
        count = _parse_int_tokens(payload[0], 1, "COORDS count")[0]
        if len(payload) - 1 != count:
            raise ProjectionBlocked(
                f"COORDS declares {count} records but contains {len(payload) - 1} rows."
            )
        return count
    width = AUX_RECORD_WIDTH.get(section)
    if width:
        if len(payload) % width:
            raise ProjectionBlocked(f"{section} payload line count {len(payload)} is not divisible by record width {width}.")
        return len(payload) // width
    return 1 if payload else 0


def _extract_element_projection(
    elements: list[CanonicalElement],
    sections: dict[str, list[str]],
) -> tuple[list[dict[str, Any]], dict[str, int], dict[str, list[int]], dict[str, int]]:
    payload = sections.get("ELEMENTS")
    if payload is None:
        raise ProjectionBlocked("CII output has no ELEMENTS section.")
    if len(payload) != len(elements) * ELEMENT_BLOCK_LINES:
        raise ProjectionBlocked(
            f"ELEMENTS contains {len(payload)} lines for {len(elements)} canonical elements."
        )
    record_counts = {name: _record_count(name, data) for name, data in sections.items()}
    references: dict[str, list[int]] = {name: [] for name in AUX_POINTERS}
    element_rows: list[dict[str, Any]] = []
    for index, element in enumerate(elements):
        block = payload[index * ELEMENT_BLOCK_LINES : (index + 1) * ELEMENT_BLOCK_LINES]
        row12 = _parse_int_tokens(block[12], 6, f"ELEMENTS[{index + 1}] row12")
        row13 = _parse_int_tokens(block[13], 6, f"ELEMENTS[{index + 1}] row13")
        row14 = _parse_int_tokens(block[14], 3, f"ELEMENTS[{index + 1}] row14")
        pointer_rows = {12: row12, 13: row13, 14: row14}
        pointers: dict[str, int] = {}
        for section, (row_number, slot) in AUX_POINTERS.items():
            pointer = pointer_rows[row_number][slot]
            pointers[section] = pointer
            if pointer:
                references[section].append(pointer)
        element_rows.append({
            "inputXmlElementId": element.element_id,
            "elementIndex": index + 1,
            "fromNode": element.from_node,
            "toNode": element.to_node,
            "pointers": pointers,
        })

    for section, pointers in references.items():
        count = record_counts.get(section, 0)
        for pointer in pointers:
            if pointer > count:
                raise ProjectionBlocked(
                    f"ELEMENTS pointer {pointer} for {section} exceeds actual record count {count}."
                )
        referenced = sorted(set(pointers))
        expected = list(range(1, count + 1))
        if referenced != expected:
            raise ProjectionBlocked(
                f"{section} ownership mismatch: referenced indexes {referenced}, actual contiguous indexes {expected}."
            )

    coords_index: dict[str, int] = {}
    coords = sections.get("COORDS") or []
    if coords:
        for ordinal, line in enumerate(coords[1:], 1):
            tokens = line.split()
            if len(tokens) < 4:
                raise ProjectionBlocked(f"COORDS record {ordinal} is incomplete.")
            node_id = tokens[0]
            if node_id in coords_index:
                raise ProjectionBlocked(f"Duplicate COORDS node {node_id}.")
            coords_index[node_id] = ordinal
    return element_rows, record_counts, references, coords_index


def _element_ids_for_assurance(record: dict[str, Any], elements: list[CanonicalElement]) -> list[str]:
    known = {element.element_id for element in elements}
    canonical = record.get("canonical") or {}
    explicit = [str(value) for value in canonical.get("inputXmlElementIds") or [] if str(value) in known]
    if explicit:
        return sorted(set(explicit), key=lambda value: next(e.ordinal for e in elements if e.element_id == value))
    source_entity_id = str(record.get("sourceEntityId") or "")
    match = re.search(r"/PIPINGELEMENT\[(\d+)\]", source_entity_id)
    if match:
        ordinal = int(match.group(1))
        if 1 <= ordinal <= len(elements):
            return [elements[ordinal - 1].element_id]
    return []


def _targets_for_section(
    section: str,
    owner_ids: list[str],
    element_projection: dict[str, dict[str, Any]],
    coords_index: dict[str, int],
) -> list[dict[str, Any]]:
    if section in GLOBAL_SECTIONS:
        return [{"section": section, "index": 1, "indexBasis": "GLOBAL_SECTION"}]
    targets: list[dict[str, Any]] = []
    for element_id in owner_ids:
        row = element_projection[element_id]
        element_index = row["elementIndex"]
        if section == "ELEMENTS":
            targets.append({
                "section": section,
                "index": element_index,
                "indexBasis": "ELEMENT_ORDINAL",
                "ownerElementId": element_id,
            })
        elif section == "COORDS":
            for role, node in (("FROM", row["fromNode"]), ("TO", row["toNode"])):
                index = coords_index.get(node)
                if index is None:
                    raise ProjectionBlocked(f"{element_id} {role}_NODE {node} has no actual COORDS record.")
                targets.append({
                    "section": section,
                    "index": index,
                    "indexBasis": "NODE_RECORD_ORDINAL",
                    "ownerElementId": element_id,
                    "nodeRole": role,
                    "nodeId": node,
                })
        elif section in AUX_POINTERS:
            pointer = int(row["pointers"].get(section) or 0)
            if pointer:
                targets.append({
                    "section": section,
                    "index": pointer,
                    "indexBasis": "ELEMENT_AUX_POINTER",
                    "ownerElementId": element_id,
                })
        elif section == "MISCEL_1":
            targets.append({
                "section": section,
                "index": element_index,
                "indexBasis": "MATERIAL_ELEMENT_ORDINAL",
                "ownerElementId": element_id,
                "payloadLine": ((element_index - 1) // 6) + 1,
                "payloadSlot": ((element_index - 1) % 6) + 1,
            })
    return targets


def _build_projection_records(
    assurance: dict[str, Any],
    elements: list[CanonicalElement],
    element_rows: list[dict[str, Any]],
    coords_index: dict[str, int],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    element_projection = {row["inputXmlElementId"]: row for row in element_rows}
    diagnostics: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []
    for ordinal, assurance_record in enumerate(assurance.get("records") or [], 1):
        status = str(assurance_record.get("status") or "")
        planned = [str(value) for value in (assurance_record.get("projection") or {}).get("sections") or []]
        owner_ids = _element_ids_for_assurance(assurance_record, elements)
        targets: list[dict[str, Any]] = []
        record_diagnostics: list[str] = []
        if status == "READY":
            for section in planned:
                section_targets = _targets_for_section(section, owner_ids, element_projection, coords_index)
                if not section_targets:
                    record_diagnostics.append(
                        f"READY section {section} has no proven target in actual writer output."
                    )
                targets.extend(section_targets)
        elif status == "EVIDENCE_ONLY" and planned:
            record_diagnostics.append("EVIDENCE_ONLY record unexpectedly declares CII sections.")
        projection_status = "PASS" if not record_diagnostics else "BLOCKED"
        if record_diagnostics:
            diagnostics.append({
                "severity": "BLOCKING",
                "code": "ASSURANCE_TARGET_UNRESOLVED",
                "message": f"Unable to resolve actual CII targets for {assurance_record.get('assuranceRecordId')}.",
                "context": {"diagnostics": record_diagnostics},
            })
        records.append({
            "projectionRecordId": f"IXPL-{ordinal:07d}",
            "assuranceRecordId": assurance_record.get("assuranceRecordId"),
            "sourceEntityId": assurance_record.get("sourceEntityId"),
            "sourceType": assurance_record.get("sourceType"),
            "inputXmlElementIds": owner_ids,
            "plannedSections": planned,
            "targets": targets,
            "status": projection_status if status == "READY" else status,
            "diagnostics": record_diagnostics,
        })
    return records, diagnostics


def build_assured_projection(
    *,
    canonical_xml: bytes,
    assurance: dict[str, Any],
    projection_contract: dict[str, Any],
    canonical_path: Path,
) -> tuple[str | None, dict[str, Any]]:
    canonical_hash = _sha256(canonical_xml)
    diagnostics: list[dict[str, Any]] = []
    cii_text: str | None = None
    element_rows: list[dict[str, Any]] = []
    section_rows: list[dict[str, Any]] = []
    projection_records: list[dict[str, Any]] = []
    stats: dict[str, int] = {}
    try:
        if projection_contract.get("schema") != "InputXmlCiiProjectionContract.v1":
            raise ProjectionBlocked("Projection contract must be InputXmlCiiProjectionContract.v1.")
        _, _, elements = _parse_canonical(canonical_xml)
        _validate_assurance(assurance, canonical_hash)
        writer = _load_writer()
        writer._STRICT_DIAGNOSTICS = True
        writer._reset_diagnostics()
        defaults = writer.ConverterDefaults(
            diameter=0.0,
            wall_thickness=0.0,
            insulation_thickness=0.0,
            corrosion_allowance=0.0,
            temperature1=0.0,
            temperature2=0.0,
            temperature3=0.0,
            pressure1=0.0,
            pressure2=0.0,
            pressure3=0.0,
            reducer_angle=0.0,
        )
        model = writer._parse_model(canonical_path, defaults)
        layout = _strict_layout(writer)
        cii_text, stats = writer._build_cii_text(
            model=model,
            defaults=defaults,
            infer_reducer_angle_from_geometry=False,
            reference_overrides=None,
            coord_reconstruction_tolerance=0.0,
            layout_config=layout,
        )
        if writer._DIAGNOSTICS:
            raise ProjectionBlocked(f"Production writer emitted strict diagnostics: {writer._DIAGNOSTICS}.")
        if stats.get("reducers", 0):
            raise ProjectionBlocked(
                "Production writer inferred REDUCERS from diameter transitions; assured projection requires an approved explicit reducer contract."
            )
        writer._assert_cii2019_compatible(cii_text, canonical_path.with_suffix(".assured.cii"))
        order, sections = _parse_sections(cii_text)
        contract_order = [str(value) for value in projection_contract.get("sectionOrder") or []]
        positions = [contract_order.index(name) for name in order if name in contract_order]
        unknown_sections = [name for name in order if name not in contract_order]
        if unknown_sections:
            raise ProjectionBlocked(f"Writer emitted sections absent from projection contract: {unknown_sections}.")
        if positions != sorted(positions):
            raise ProjectionBlocked("Writer section order differs from InputXmlCiiProjectionContract.v1.")
        element_rows, record_counts, references, coords_index = _extract_element_projection(elements, sections)
        section_rows = [
            {
                "section": name,
                "order": index + 1,
                "payloadLineCount": len(sections[name]),
                "recordCount": record_counts.get(name, _record_count(name, sections[name])),
                "referencedIndexes": sorted(set(references.get(name, []))),
            }
            for index, name in enumerate(order)
        ]
        projection_records, record_diagnostics = _build_projection_records(
            assurance, elements, element_rows, coords_index
        )
        diagnostics.extend(record_diagnostics)
    except (OSError, ValueError, ProjectionBlocked) as exc:
        diagnostics.append({
            "severity": "BLOCKING",
            "code": "ASSURED_PROJECTION_BLOCKED",
            "message": str(exc),
        })
        cii_text = None

    blocking = [row for row in diagnostics if row.get("severity") in {"ERROR", "BLOCKING"}]
    status = "PASS" if cii_text is not None and not blocking else "BLOCKED"
    ledger: dict[str, Any] = {
        "schema": "InputXmlCiiProjectionLedger.v1",
        "authority": {
            "repository": "reallaksh19/3D_Converters",
            "writer": "converters/scripts/inputxml_to_cii2019.py",
            "wrapper": "converters/scripts/inputxml_to_cii2019_assured.py",
            "mode": "ASSURED_STRICT",
            "rule": "CII indexes are parsed from the actual production-writer output and must satisfy pointer ownership.",
        },
        "status": status,
        "chain": {
            "canonicalHashSha256": canonical_hash,
            "assuranceHashSha256": assurance.get("assuranceHashSha256"),
            "projectionContractHashSha256": _json_hash(projection_contract),
            "ciiHashSha256": _sha256(cii_text.encode("utf-8")) if cii_text is not None else None,
        },
        "writerPolicy": {
            "strictDiagnostics": True,
            "currentClockFallbackAllowed": False,
            "partialCoordinateFallbackAllowed": False,
            "coordinateReconstructionTolerance": 0.0,
            "rawOverridesAllowed": False,
            "referenceOverridesAllowed": False,
            "reducerInferenceAllowed": False,
            "hangerDefaultsAllowed": False,
            "nozzleDefaultsAllowed": False,
        },
        "summary": {
            "elementCount": len(element_rows),
            "sectionCount": len(section_rows),
            "projectionRecordCount": len(projection_records),
            "resolvedTargetCount": sum(len(row.get("targets") or []) for row in projection_records),
            "blockedProjectionRecordCount": sum(1 for row in projection_records if row.get("status") == "BLOCKED"),
            "diagnosticCount": len(diagnostics),
            "blockingDiagnosticCount": len(blocking),
        },
        "writerStats": stats,
        "sections": section_rows,
        "elements": element_rows,
        "records": projection_records,
        "diagnostics": diagnostics,
    }
    ledger["projectionHashSha256"] = _json_hash(ledger)
    return cii_text, ledger


def validate_projection_ledger(value: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if value.get("schema") != "InputXmlCiiProjectionLedger.v1":
        errors.append("schema must be InputXmlCiiProjectionLedger.v1")
    if value.get("status") not in {"PASS", "BLOCKED"}:
        errors.append("status must be PASS or BLOCKED")
    records = value.get("records")
    if not isinstance(records, list):
        errors.append("records must be an array")
        return errors
    ids: set[str] = set()
    for row in records:
        record_id = str(row.get("projectionRecordId") or "")
        if not record_id or record_id in ids:
            errors.append("projectionRecordId missing or duplicate")
        ids.add(record_id)
        for target in row.get("targets") or []:
            index = target.get("index")
            if not isinstance(index, int) or index < 1:
                errors.append(f"{record_id}: target index must be a positive integer")
    if (value.get("summary") or {}).get("projectionRecordCount") != len(records):
        errors.append("summary projectionRecordCount mismatch")
    return errors


def _load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ProjectionBlocked(f"{path} must contain a JSON object.")
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Canonical InputXML v1.")
    parser.add_argument("--assurance-ledger", type=Path, required=True)
    parser.add_argument("--projection-contract", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--projection-ledger", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        canonical_xml = args.input.read_bytes()
        assurance = _load_json(args.assurance_ledger)
        contract = _load_json(args.projection_contract)
        cii_text, ledger = build_assured_projection(
            canonical_xml=canonical_xml,
            assurance=assurance,
            projection_contract=contract,
            canonical_path=args.input,
        )
        errors = validate_projection_ledger(ledger)
        if errors:
            ledger["status"] = "BLOCKED"
            ledger["diagnostics"].append({
                "severity": "BLOCKING",
                "code": "PROJECTION_LEDGER_INVALID",
                "message": "; ".join(errors),
            })
            cii_text = None
        args.projection_ledger.parent.mkdir(parents=True, exist_ok=True)
        args.projection_ledger.write_text(
            json.dumps(ledger, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        if cii_text is None or ledger["status"] != "PASS":
            return 2
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(cii_text, encoding="utf-8")
        print(json.dumps({
            "status": "PASS",
            "output": str(args.output),
            "projectionLedger": str(args.projection_ledger),
            "ciiHashSha256": ledger["chain"]["ciiHashSha256"],
            "projectionHashSha256": ledger["projectionHashSha256"],
        }, indent=2))
        return 0
    except (OSError, json.JSONDecodeError, ProjectionBlocked) as exc:
        print(f"ASSURED PROJECTION ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
