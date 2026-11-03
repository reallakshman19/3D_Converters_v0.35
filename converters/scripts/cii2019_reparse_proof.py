#!/usr/bin/env python3
"""Independent CII(2019) reparser and projection-ledger proof.

This module is read-only. It does not import the production writer or the PR-F
writer verifier. It reparses the serialized neutral file and independently
checks the indexes recorded by InputXmlCiiProjectionLedger.v1.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path
from typing import Any

SECTION_RE = re.compile(r"^#\$\s+([A-Z0-9&_]+)")
ELEMENT_BLOCK_LINES = 15
POINTER_LOCATIONS = {
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


class ReparseError(RuntimeError):
    pass


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _stable_json_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _json_hash(value: Any) -> str:
    return _sha256(_stable_json_bytes(value))


def _canonical_number(token: str) -> str:
    try:
        value = float(token)
    except ValueError as exc:
        raise ReparseError(f"Invalid numeric token {token!r}.") from exc
    if not math.isfinite(value):
        raise ReparseError(f"Non-finite numeric token {token!r}.")
    rounded = round(value)
    if abs(value - rounded) <= 1e-9:
        return str(int(rounded))
    return format(value, ".12g")


def _int_tokens(line: str, count: int, label: str) -> list[int]:
    tokens = line.split()
    if len(tokens) < count:
        raise ReparseError(f"{label} has {len(tokens)} token(s); expected at least {count}.")
    result: list[int] = []
    for token in tokens[:count]:
        try:
            value = float(token)
        except ValueError as exc:
            raise ReparseError(f"{label} contains non-numeric token {token!r}.") from exc
        integer = int(round(value))
        if abs(value - integer) > 1e-6 or integer < 0:
            raise ReparseError(f"{label} contains invalid pointer {token!r}.")
        result.append(integer)
    return result


def _split_sections(cii_text: str) -> tuple[list[str], dict[str, list[str]]]:
    order: list[str] = []
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for raw_line in cii_text.splitlines():
        match = SECTION_RE.match(raw_line.strip())
        if match:
            current = match.group(1)
            if current in sections:
                raise ReparseError(f"Duplicate section {current}.")
            order.append(current)
            sections[current] = []
            continue
        if current is None:
            if raw_line.strip():
                raise ReparseError("Payload appears before the first CII section.")
            continue
        sections[current].append(raw_line)
    if not order:
        raise ReparseError("No CII sections were found.")
    return order, sections


def _section_record_count(name: str, payload: list[str]) -> int:
    if name == "ELEMENTS":
        if len(payload) % ELEMENT_BLOCK_LINES:
            raise ReparseError(
                f"ELEMENTS has {len(payload)} lines; expected a multiple of {ELEMENT_BLOCK_LINES}."
            )
        return len(payload) // ELEMENT_BLOCK_LINES
    if name == "COORDS":
        if not payload:
            return 0
        declared = _int_tokens(payload[0], 1, "COORDS count")[0]
        if len(payload) - 1 != declared:
            raise ReparseError(
                f"COORDS declares {declared} record(s) but contains {len(payload) - 1}."
            )
        return declared
    width = AUX_RECORD_WIDTH.get(name)
    if width:
        if len(payload) % width:
            raise ReparseError(
                f"{name} has {len(payload)} lines; record width is {width}."
            )
        return len(payload) // width
    return 1 if payload else 0


def parse_cii2019(cii_text: str) -> dict[str, Any]:
    order, sections = _split_sections(cii_text)
    section_rows = [
        {
            "name": name,
            "order": ordinal,
            "payloadLineCount": len(sections[name]),
            "recordCount": _section_record_count(name, sections[name]),
        }
        for ordinal, name in enumerate(order, 1)
    ]
    elements_payload = sections.get("ELEMENTS")
    if elements_payload is None:
        raise ReparseError("CII output has no ELEMENTS section.")
    elements: list[dict[str, Any]] = []
    for offset in range(0, len(elements_payload), ELEMENT_BLOCK_LINES):
        block = elements_payload[offset : offset + ELEMENT_BLOCK_LINES]
        first = block[0].split()
        if len(first) < 2:
            raise ReparseError(f"ELEMENTS record {offset // ELEMENT_BLOCK_LINES + 1} lacks node pair.")
        row12 = _int_tokens(block[12], 6, "ELEMENTS row12")
        row13 = _int_tokens(block[13], 6, "ELEMENTS row13")
        row14 = _int_tokens(block[14], 3, "ELEMENTS row14")
        row_map = {12: row12, 13: row13, 14: row14}
        elements.append(
            {
                "index": offset // ELEMENT_BLOCK_LINES + 1,
                "fromNode": _canonical_number(first[0]),
                "toNode": _canonical_number(first[1]),
                "pointers": {
                    section: row_map[row_number][slot]
                    for section, (row_number, slot) in POINTER_LOCATIONS.items()
                },
            }
        )

    coordinates: list[dict[str, Any]] = []
    coordinate_by_node: dict[str, int] = {}
    coords_payload = sections.get("COORDS") or []
    for ordinal, line in enumerate(coords_payload[1:], 1):
        tokens = line.split()
        if len(tokens) < 4:
            raise ReparseError(f"COORDS record {ordinal} is incomplete.")
        node = _canonical_number(tokens[0])
        if node in coordinate_by_node:
            raise ReparseError(f"Duplicate COORDS node {node}.")
        xyz = [_canonical_number(token) for token in tokens[1:4]]
        coordinate_by_node[node] = ordinal
        coordinates.append({"index": ordinal, "node": node, "x": xyz[0], "y": xyz[1], "z": xyz[2]})

    model: dict[str, Any] = {
        "schema": "ReparsedCii2019.v1",
        "sectionOrder": order,
        "sections": section_rows,
        "elements": elements,
        "coordinates": coordinates,
    }
    model["reparsedModelHashSha256"] = _json_hash(model)
    return model


def _section_index(section_rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(row["name"]): row for row in section_rows}


def build_reparse_proof(
    *,
    cii_text: str,
    projection_ledger: dict[str, Any],
) -> dict[str, Any]:
    diagnostics: list[dict[str, Any]] = []
    cii_hash = _sha256(cii_text.encode("utf-8"))
    if projection_ledger.get("schema") != "InputXmlCiiProjectionLedger.v1":
        raise ReparseError("Projection ledger must be InputXmlCiiProjectionLedger.v1.")
    if projection_ledger.get("status") != "PASS":
        diagnostics.append(
            {
                "severity": "BLOCKING",
                "code": "PROJECTION_LEDGER_NOT_PASS",
                "message": "Reparse proof requires a PASS projection ledger.",
            }
        )
    if (projection_ledger.get("chain") or {}).get("ciiHashSha256") != cii_hash:
        diagnostics.append(
            {
                "severity": "BLOCKING",
                "code": "CII_HASH_MISMATCH",
                "message": "CII bytes do not match the projection ledger hash.",
            }
        )

    reparsed = parse_cii2019(cii_text)
    sections = _section_index(reparsed["sections"])
    element_by_index = {int(row["index"]): row for row in reparsed["elements"]}
    projection_elements = {
        int(row["elementIndex"]): row for row in projection_ledger.get("elements") or []
    }
    if set(element_by_index) != set(projection_elements):
        diagnostics.append(
            {
                "severity": "BLOCKING",
                "code": "ELEMENT_INDEX_SET_MISMATCH",
                "message": "Reparsed element indexes differ from projection-ledger element indexes.",
                "context": {
                    "reparsed": sorted(element_by_index),
                    "projection": sorted(projection_elements),
                },
            }
        )
    for index in sorted(set(element_by_index) & set(projection_elements)):
        actual = element_by_index[index]
        expected = projection_elements[index]
        for key in ("fromNode", "toNode"):
            if _canonical_number(str(expected.get(key))) != actual[key]:
                diagnostics.append(
                    {
                        "severity": "BLOCKING",
                        "code": "ELEMENT_NODE_MISMATCH",
                        "message": f"Element {index} {key} differs after CII reparse.",
                        "context": {"expected": expected.get(key), "actual": actual[key]},
                    }
                )
        for section, pointer in (expected.get("pointers") or {}).items():
            if int(pointer) != int(actual["pointers"].get(section, -1)):
                diagnostics.append(
                    {
                        "severity": "BLOCKING",
                        "code": "ELEMENT_POINTER_MISMATCH",
                        "message": f"Element {index} {section} pointer differs after CII reparse.",
                        "context": {"expected": pointer, "actual": actual["pointers"].get(section)},
                    }
                )

    coords_by_index = {int(row["index"]): row for row in reparsed["coordinates"]}
    for record in projection_ledger.get("records") or []:
        for target in record.get("targets") or []:
            section = str(target.get("section") or "")
            index = int(target.get("index") or 0)
            section_row = sections.get(section)
            if section_row is None:
                diagnostics.append(
                    {
                        "severity": "BLOCKING",
                        "code": "TARGET_SECTION_MISSING",
                        "message": f"Projection target section {section} is absent after reparse.",
                    }
                )
                continue
            if section in GLOBAL_SECTIONS:
                valid = index == 1
            elif section == "ELEMENTS":
                valid = index in element_by_index
            elif section == "COORDS":
                valid = index in coords_by_index
                if valid and target.get("nodeId") is not None:
                    valid = coords_by_index[index]["node"] == _canonical_number(str(target["nodeId"]))
            else:
                valid = 1 <= index <= int(section_row["recordCount"])
            if not valid:
                diagnostics.append(
                    {
                        "severity": "BLOCKING",
                        "code": "TARGET_INDEX_INVALID",
                        "message": f"Projection target {section}[{index}] is not present in reparsed CII.",
                        "context": {"target": target, "projectionRecordId": record.get("projectionRecordId")},
                    }
                )

    blocking = [row for row in diagnostics if row.get("severity") in {"ERROR", "BLOCKING"}]
    proof: dict[str, Any] = {
        "schema": "Cii2019ReparseProof.v1",
        "status": "PASS" if not blocking else "BLOCKED",
        "chain": {
            "ciiHashSha256": cii_hash,
            "projectionHashSha256": projection_ledger.get("projectionHashSha256"),
            "reparsedModelHashSha256": reparsed["reparsedModelHashSha256"],
        },
        "summary": {
            "sectionCount": len(reparsed["sections"]),
            "elementCount": len(reparsed["elements"]),
            "coordinateCount": len(reparsed["coordinates"]),
            "projectionRecordCount": len(projection_ledger.get("records") or []),
            "diagnosticCount": len(diagnostics),
            "blockingDiagnosticCount": len(blocking),
        },
        "reparsed": reparsed,
        "diagnostics": diagnostics,
    }
    proof["reparseProofHashSha256"] = _json_hash(proof)
    return proof


def validate_reparse_proof(value: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if value.get("schema") != "Cii2019ReparseProof.v1":
        errors.append("schema must be Cii2019ReparseProof.v1")
    if value.get("status") not in {"PASS", "BLOCKED"}:
        errors.append("status must be PASS or BLOCKED")
    reparsed = value.get("reparsed") or {}
    if reparsed.get("schema") != "ReparsedCii2019.v1":
        errors.append("reparsed schema must be ReparsedCii2019.v1")
    element_indexes = [row.get("index") for row in reparsed.get("elements") or []]
    if element_indexes != list(range(1, len(element_indexes) + 1)):
        errors.append("reparsed element indexes must be contiguous and one-based")
    return errors


def _load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ReparseError(f"{path} must contain a JSON object.")
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cii", type=Path, required=True)
    parser.add_argument("--projection-ledger", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        proof = build_reparse_proof(
            cii_text=args.cii.read_text(encoding="utf-8"),
            projection_ledger=_load_json(args.projection_ledger),
        )
        errors = validate_reparse_proof(proof)
        if errors:
            proof["status"] = "BLOCKED"
            proof["diagnostics"].append(
                {
                    "severity": "BLOCKING",
                    "code": "REPARSE_PROOF_INVALID",
                    "message": "; ".join(errors),
                }
            )
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(proof, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        return 0 if proof["status"] == "PASS" else 2
    except (OSError, json.JSONDecodeError, ReparseError) as exc:
        print(f"REPARSE ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
