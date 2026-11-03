from __future__ import annotations

import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

import cii_syntax_check_2019 as cii_check

SCHEMA = "xml-to-cii-inputxml-sidecar-diagnostics/v1"
MODULE = "xml_to_cii_inputxml_sidecar"


def make_record(
    severity: str,
    code: str,
    message: str,
    *,
    stage: str,
    source_field: str = "",
    output_field: str = "",
    source_row: object = None,
    element: object = None,
    action: str = "",
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "severity": str(severity).upper(),
        "code": code,
        "message": message,
        "module": MODULE,
        "stage": stage,
        "sourceField": source_field,
        "outputField": output_field,
        "sourceRow": source_row,
        "element": element,
        "action": action,
        "context": context or {},
    }


def _summary(records: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"total": len(records), "info": 0, "warning": 0, "error": 0}
    for item in records:
        key = str(item.get("severity", "INFO")).lower()
        if key in counts:
            counts[key] += 1
    return counts


def _section_map(path: Path) -> tuple[dict[str, Any], dict[str, int]]:
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    sections = cii_check._parse_sections(lines)
    section_map = {section.name: section for section in sections}
    metrics = cii_check._validate_control(section_map.get("CONTROL"), [])
    return section_map, metrics


def _float(token: str) -> float:
    value = float(token)
    if not math.isfinite(value):
        raise ValueError(f"Non-finite CII token: {token}")
    return value


def _cii_elements(section: Any, count: int) -> list[dict[str, Any]]:
    if section is None or count <= 0:
        return []
    rows = [entry for entry in section.payload if entry[1].strip()]
    if len(rows) < count * 15:
        raise ValueError(f"ELEMENTS has {len(rows)} rows; expected {count * 15}.")
    result = []
    for index in range(count):
        fields = cii_check._fixed_fortran_fields(rows[index * 15][1], 6)
        result.append({
            "index": index + 1,
            "fromNode": int(round(_float(fields[0]))),
            "toNode": int(round(_float(fields[1]))),
            "delta": [_float(fields[2]), _float(fields[3]), _float(fields[4])],
        })
    return result


def _sidecar_elements(tree: ET.ElementTree) -> list[dict[str, Any]]:
    model = tree.getroot().find("PIPINGMODEL")
    if model is None:
        return []
    result = []
    for index, element in enumerate(model.findall("PIPINGELEMENT"), start=1):
        result.append({
            "index": index,
            "fromNode": int(round(float(element.get("FROM_NODE", "0")))),
            "toNode": int(round(float(element.get("TO_NODE", "0")))),
            "delta": [float(element.get(key, "0")) for key in ("DELTA_X", "DELTA_Y", "DELTA_Z")],
            "bend": element.find("BEND") is not None,
            "rigid": element.find("RIGID") is not None,
            "restraintBlock": bool(element.findall("RESTRAINT")),
            "restraintSlots": len(element.findall("RESTRAINT")),
            "sif": element.find("SIF") is not None,
        })
    return result


def _count_metrics(elements: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "elements": len(elements),
        "bends": sum(bool(item.get("bend")) for item in elements),
        "rigids": sum(bool(item.get("rigid")) for item in elements),
        "restraintBlocks": sum(bool(item.get("restraintBlock")) for item in elements),
        "restraintSlots": sum(int(item.get("restraintSlots", 0)) for item in elements),
        "sifTees": sum(bool(item.get("sif")) for item in elements),
    }


def _compare_count(
    records: list[dict[str, Any]],
    label: str,
    cii_value: int,
    sidecar_value: int,
) -> None:
    matched = cii_value == sidecar_value
    records.append(make_record(
        "INFO" if matched else "ERROR",
        "SIDECAR_BLOCK_COUNT_MATCH" if matched else "SIDECAR_BLOCK_COUNT_MISMATCH",
        f"{label}: CII={cii_value}, sidecar={sidecar_value}.",
        stage="parity",
        output_field=label,
        action="verified" if matched else "reported-mismatch",
        context={"cii": cii_value, "sidecar": sidecar_value},
    ))


def _compare_pairs(
    records: list[dict[str, Any]],
    cii_elements: list[dict[str, Any]],
    sidecar_elements: list[dict[str, Any]],
) -> None:
    for index, (cii_row, xml_row) in enumerate(zip(cii_elements, sidecar_elements), start=1):
        cii_pair = [cii_row["fromNode"], cii_row["toNode"]]
        xml_pair = [xml_row["fromNode"], xml_row["toNode"]]
        matched = cii_pair == xml_pair
        records.append(make_record(
            "INFO" if matched else "ERROR",
            "SIDECAR_NODE_PAIR_MATCH" if matched else "SIDECAR_NODE_PAIR_MISMATCH",
            f"Element {index}: CII {cii_pair[0]}→{cii_pair[1]}, sidecar {xml_pair[0]}→{xml_pair[1]}.",
            stage="parity",
            element=index,
            output_field="FROM_NODE/TO_NODE",
            action="verified" if matched else "reported-mismatch",
            context={"cii": cii_pair, "sidecar": xml_pair},
        ))


def _compare_deltas(
    records: list[dict[str, Any]],
    cii_elements: list[dict[str, Any]],
    sidecar_elements: list[dict[str, Any]],
    tolerance: float,
) -> None:
    for index, (cii_row, xml_row) in enumerate(zip(cii_elements, sidecar_elements), start=1):
        diffs = [abs(a - b) for a, b in zip(cii_row["delta"], xml_row["delta"])]
        matched = max(diffs, default=0.0) <= tolerance
        records.append(make_record(
            "INFO" if matched else "ERROR",
            "SIDECAR_DELTA_MATCH" if matched else "SIDECAR_DELTA_MISMATCH",
            f"Element {index}: maximum delta difference is {max(diffs, default=0.0):.6g} mm.",
            stage="parity",
            element=index,
            output_field="DELTA_X/DELTA_Y/DELTA_Z",
            action="verified" if matched else "reported-mismatch",
            context={"cii": cii_row["delta"], "sidecar": xml_row["delta"], "tolerance": tolerance},
        ))


def _parity_records(
    cii_path: Path,
    tree: ET.ElementTree,
    tolerance: float,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    section_map, metrics = _section_map(cii_path)
    cii_elements = _cii_elements(section_map.get("ELEMENTS"), int(metrics.get("elements", 0)))
    sidecar_elements = _sidecar_elements(tree)
    side_metrics = _count_metrics(sidecar_elements)
    records: list[dict[str, Any]] = []
    _compare_count(records, "elements", int(metrics.get("elements", 0)), side_metrics["elements"])
    _compare_count(records, "bends", int(metrics.get("bends", 0)), side_metrics["bends"])
    _compare_count(records, "rigids", int(metrics.get("rigids", 0)), side_metrics["rigids"])
    _compare_count(records, "restraintBlocks", int(metrics.get("restraints", 0)), side_metrics["restraintBlocks"])
    _compare_count(records, "sifTees", int(metrics.get("sif_tees", 0)), side_metrics["sifTees"])
    _compare_pairs(records, cii_elements, sidecar_elements)
    _compare_deltas(records, cii_elements, sidecar_elements, tolerance)
    return records, {"cii": metrics, "sidecar": side_metrics}


def _classification_record() -> dict[str, Any]:
    return make_record(
        "WARNING",
        "SIDECAR_DIAGNOSTIC_RECONSTRUCTION",
        "This InputXML is a post-run diagnostic reconstruction, not the model used to write the CII.",
        stage="classification",
        action="declared",
    )


def _unavailable_record(message: str) -> dict[str, Any]:
    return make_record(
        "WARNING",
        "SIDECAR_PARITY_UNAVAILABLE",
        message,
        stage="parity",
        action="reported",
    )


def _resolve_parity(
    cii_path: Path | None,
    tree: ET.ElementTree,
    tolerance: float,
) -> tuple[list[dict[str, Any]], dict[str, Any], bool]:
    side_metrics = {"sidecar": _count_metrics(_sidecar_elements(tree))}
    if not cii_path or not cii_path.exists():
        return [_unavailable_record("CII output was not supplied; artifact parity was not evaluated.")], side_metrics, False
    try:
        records, metrics = _parity_records(cii_path, tree, tolerance)
        return records, metrics, True
    except Exception as exc:
        message = f"CII parity could not be evaluated: {exc}"
        return [_unavailable_record(message)], side_metrics, False


def _build_document(
    source_name: str,
    sidecar_name: str,
    tree: ET.ElementTree,
    records: list[dict[str, Any]],
    metrics: dict[str, Any],
    parity_checked: bool,
    options: dict[str, Any] | None,
) -> dict[str, Any]:
    summary = _summary(records)
    status = "ERROR" if summary["error"] else ("WARNING" if summary["warning"] else "PASS")
    return {
        "schema": SCHEMA,
        "artifactRole": "diagnostic-reconstruction",
        "sourceName": source_name,
        "sidecarName": sidecar_name,
        "parityChecked": parity_checked,
        "parityStatus": status,
        "outputReady": bool(_sidecar_elements(tree)),
        "summary": summary,
        "metrics": metrics,
        "options": options or {},
        "records": records,
    }


def build_diagnostics(
    *,
    source_name: str,
    sidecar_name: str,
    tree: ET.ElementTree,
    cii_path: Path | None,
    generation_records: list[dict[str, Any]] | None = None,
    options: dict[str, Any] | None = None,
    tolerance: float = 0.001,
) -> dict[str, Any]:
    parity_records, metrics, parity_checked = _resolve_parity(cii_path, tree, tolerance)
    records = [_classification_record(), *list(generation_records or []), *parity_records]
    return _build_document(
        source_name,
        sidecar_name,
        tree,
        records,
        metrics,
        parity_checked,
        options,
    )


def write_diagnostics(path: Path, document: dict[str, Any]) -> None:
    path.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")
