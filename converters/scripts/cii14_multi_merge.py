#!/usr/bin/env python3
"""Merge qualified CAESAR II Version 14 CII neutral files.

The merger is intentionally format-aware rather than a text concatenator.  It
applies per-file node namespace offsets, rebases 1-based auxiliary pointers in
ELEMENT records, rebuilds CONTROL, preserves engineering payload that does not
need identity changes, repacks RRMAT, merges COORDS, and validates the result
against the independent Ver 14 profile.

Qualification boundary
----------------------
The initial profile is grounded in Benchmarks/v11-v14.zip (SYS-0001-v14.CII).
It supports the non-zero constructs represented there: ELEMENTS, NODENAME,
BEND, RIGID, RESTRANT, SIF&TEES and REDUCERS, plus MISCEL_1 material/execution
payload, UNITS and COORDS.  Other non-zero auxiliary constructs fail closed
until separate Ver 14 fixtures qualify their record/node semantics.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
import math
from pathlib import Path
import re
from typing import Sequence

import cii14_section_rules as rules

SECTION_RX = re.compile(r"^\s*#\$\s+([A-Z0-9_&]+)\b.*$")
PREFIX, WIDTH = 2, 13
ELEMENT_LINES = rules.ELEMENT_LINES_PER_BLOCK
ORDER = rules.SECTION_ORDER_14
OPTIONAL = {"NODENAME", "COORDS"}
REQUIRED = set(ORDER) - OPTIONAL

# 1-based auxiliary pointers carried by the final three ELEMENT integer rows.
# The paired Ver 11/Ver 14 benchmark keeps this pointer placement aligned.
POINTER_LAYOUT = (
    (12, ("BEND", "RIGID", "EXPJT", "RESTRANT", "DISPLMNT", "FORCMNT")),
    (13, ("UNIFORM", "WIND", "OFFSETS", "ALLOWBLS", "SIF&TEES", "NODENAME")),
    (14, ("REDUCERS", "FLANGES", "EQUIPMNT")),
)

# Non-zero records not independently qualified by the supplied Ver 14 fixture.
UNQUALIFIED_CONTROL_FIELDS = {
    "numnoz": "NOZZLES / MISCEL_1 VFLEX",
    "nohgrs": "HANGERS / MISCEL_1 hanger arrays",
    "expjts": "EXPJT",
    "displmnt": "DISPLMNT",
    "forcmnt": "FORCMNT",
    "uniform": "UNIFORM",
    "wind": "WIND",
    "offsets": "OFFSETS",
    "allowbls": "ALLOWBLS",
    "numflg": "FLANGES",
    "equipmnt": "EQUIPMNT",
}


class MergeError(ValueError):
    pass


@dataclass
class InputModel:
    label: str
    offset: int
    sections: dict[str, list[str]]
    control: rules.ControlCounts
    version: tuple[int, int, int | None]


@dataclass(frozen=True)
class MergeSummary:
    profile: str
    inputs: int
    elements: int
    unique_nodes: int
    offsets: tuple[int, ...]
    warnings: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "profile": self.profile,
            "inputs": self.inputs,
            "elements": self.elements,
            "unique_nodes": self.unique_nodes,
            "offsets": list(self.offsets),
            "warnings": list(self.warnings),
        }


def _span(index: int) -> tuple[int, int]:
    start = PREFIX + WIDTH * index
    return start, start + WIDTH


def _field(line: str, index: int) -> str:
    start, end = _span(index)
    return (line + " " * max(0, end - len(line)))[start:end]


def _splice(line: str, index: int, cell: str) -> str:
    start, end = _span(index)
    padded = line + " " * max(0, end - len(line))
    return padded[:start] + cell + padded[end:]


def _float(text: str, label: str) -> float:
    try:
        value = float(text.strip())
    except ValueError as exc:
        raise MergeError(f"{label}: invalid numeric token {text!r}") from exc
    if not math.isfinite(value):
        raise MergeError(f"{label}: non-finite numeric token {text!r}")
    return value


def _integer(text: str, label: str, *, allow_negative: bool = False) -> int:
    value = _float(text, label)
    integer = int(round(value))
    if abs(value - integer) > 1e-6 or (integer < 0 and not allow_negative):
        raise MergeError(f"{label}: expected integer-valued token, got {text!r}")
    return integer


def _g13(value: float) -> str:
    """Ver 14 real-field convention seen in the paired benchmark: 13.6E."""
    return f"{float(value):13.6E}"


def _irow(values: Sequence[int]) -> str:
    return "  " + "".join(f"{int(value):13d}" for value in values)


def _grow(values: Sequence[float]) -> str:
    return "  " + "".join(_g13(value) for value in values)


def _token_row(tokens: Sequence[str]) -> str:
    out = []
    for token in tokens:
        text = str(token).strip()
        if len(text) > WIDTH:
            raise MergeError(f"Token {text!r} exceeds the qualified {WIDTH}-column field width")
        out.append(text.rjust(WIDTH))
    return "  " + "".join(out)


def _mapped_node(value: float, offset: int, label: str, *, sentinel: bool = False) -> int | None:
    if sentinel and abs(value - 9999.99) <= 1e-6:
        return None
    node = int(round(value))
    if abs(value - node) > 1e-6:
        raise MergeError(f"{label}: node must be integer-valued, got {value}")
    if node <= 0:
        return node
    mapped = node + offset
    if mapped <= 0:
        raise MergeError(f"{label}: offset {offset} maps node {node} to invalid {mapped}")
    return mapped


def _offset_field(line: str, index: int, offset: int, label: str, *, sentinel: bool = False) -> str:
    value = _float(_field(line, index), label)
    mapped = _mapped_node(value, offset, label, sentinel=sentinel)
    if mapped is None or mapped <= 0:
        return line
    return _splice(line, index, _g13(float(mapped)))


def _offset_int(value: int, offset: int, label: str) -> int:
    if value <= 0:
        return value
    mapped = value + offset
    if mapped <= 0:
        raise MergeError(f"{label}: offset maps {value} to invalid {mapped}")
    return mapped


def _sections(text: str, label: str) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for raw in text.splitlines():
        line = raw.rstrip("\r\n")
        match = SECTION_RX.match(line.lstrip("\ufeff"))
        if match:
            current = match.group(1)
            if current in sections:
                raise MergeError(f"{label}: duplicate #$ {current}")
            sections[current] = []
        elif current is None:
            if line.strip():
                raise MergeError(f"{label}: payload before first CII section")
        else:
            sections[current].append(line)
    missing = sorted(REQUIRED - set(sections))
    if missing:
        raise MergeError(f"{label}: missing sections: {', '.join(missing)}")
    unknown = sorted(set(sections) - set(ORDER))
    if unknown:
        raise MergeError(f"{label}: unsupported Ver 14 sections: {', '.join(unknown)}")
    return sections


def _pointer_counts(control: rules.ControlCounts) -> dict[str, int]:
    return {
        "BEND": control.bends,
        "RIGID": control.rigids,
        "EXPJT": control.expjts,
        "RESTRANT": control.restraints,
        "DISPLMNT": control.displmnt,
        "FORCMNT": control.forcmnt,
        "UNIFORM": control.uniform,
        "WIND": control.wind,
        "OFFSETS": control.offsets,
        "ALLOWBLS": control.allowbls,
        "SIF&TEES": control.sif_tees,
        "NODENAME": control.nonam,
        "REDUCERS": control.nored,
        "FLANGES": control.numflg,
        "EQUIPMNT": control.equipmnt,
    }


def _validate(model: InputModel) -> None:
    report = rules.validate_control_against_sections(model.sections, model.control, list(model.sections))
    if not report.ok:
        errors = [f"{issue.code}[{issue.section}]: {issue.message}" for issue in report.issues if issue.severity == "error"]
        raise MergeError(f"{model.label}: invalid CII Ver 14 structure: {' | '.join(errors)}")

    major, release, _build = model.version
    if (major, release) != (5, 14):
        raise MergeError(f"{model.label}: expected Ver 14 signature 5 / 14, got {major} / {release}")

    if len(model.sections.get("NODENAME", [])) != model.control.nonam:
        raise MergeError(
            f"{model.label}: NODENAME rows={len(model.sections.get('NODENAME', []))}, CONTROL NONAM={model.control.nonam}"
        )

    if any(row.strip() for row in model.sections.get("AUX_DATA", [])):
        raise MergeError(f"{model.label}: non-empty AUX_DATA is not Ver 14 merge-qualified")

    coords = model.sections.get("COORDS", [])
    if coords:
        declared = _integer(coords[0], f"{model.label}: COORDS count")
        if len(coords) - 1 != declared:
            raise MergeError(f"{model.label}: COORDS count mismatch: declared {declared}, rows {len(coords)-1}")

    for field_name, section_label in UNQUALIFIED_CONTROL_FIELDS.items():
        count = getattr(model.control, field_name)
        if count:
            raise MergeError(
                f"{model.label}: {section_label} count={count} is not yet independently qualified for Ver 14 merge"
            )


def _units(rows: Sequence[str], label: str) -> tuple[tuple[float, ...], tuple[str, ...]]:
    if len(rows) != rules.UNITS_TOTAL_LINES:
        raise MergeError(f"{label}: UNITS must contain {rules.UNITS_TOTAL_LINES} rows")
    numeric: list[float] = []
    for row in rows[:rules.UNITS_CONSTANT_LINES]:
        numeric.extend(_float(token, f"{label}: UNITS") for token in row.split())
    labels = tuple(" ".join(row.split()).casefold() for row in rows[rules.UNITS_CONSTANT_LINES:])
    return tuple(numeric), labels


def _same_units(left, right) -> bool:
    lv, ll = left
    rv, rl = right
    return ll == rl and len(lv) == len(rv) and all(
        math.isclose(a, b, rel_tol=1e-10, abs_tol=1e-12) for a, b in zip(lv, rv)
    )


def _material_payload(model: InputModel) -> tuple[list[str], list[str]]:
    rows = [row for row in model.sections["MISCEL_1"] if row.strip()]
    rr_rows = rules.rrmat_line_count(model.control.numelt)
    if len(rows) != rr_rows + rules.MISCEL_EXECUTION_OPTION_LINES:
        raise MergeError(
            f"{model.label}: qualified Ver 14 MISCEL_1 expects RRMAT({rr_rows} rows) + "
            f"{rules.MISCEL_EXECUTION_OPTION_LINES} execution rows; found {len(rows)} nonblank rows"
        )
    tokens: list[str] = []
    for row in rows[:rr_rows]:
        for token in row.split():
            _float(token, f"{model.label}: RRMAT")
            tokens.append(token)
    if len(tokens) < model.control.numelt:
        raise MergeError(f"{model.label}: RRMAT contains {len(tokens)} tokens for {model.control.numelt} elements")
    if len(tokens) > model.control.numelt:
        # Packed final rows may not contain unrelated values under the qualified profile.
        extras = tokens[model.control.numelt:]
        if any(abs(_float(token, f"{model.label}: RRMAT padding")) > 1e-12 for token in extras):
            raise MergeError(f"{model.label}: RRMAT contains unexpected non-zero padding tokens")
    return tokens[:model.control.numelt], list(rows[rr_rows:])


def _normalize_rows(rows: Sequence[str]) -> tuple[str, ...]:
    return tuple(" ".join(row.split()) for row in rows)


def _merge_miscel(models: Sequence[InputModel]) -> list[str]:
    all_materials: list[str] = []
    execution_ref: list[str] | None = None
    for model in models:
        materials, execution = _material_payload(model)
        all_materials.extend(materials)
        if execution_ref is None:
            execution_ref = execution
        elif _normalize_rows(execution) != _normalize_rows(execution_ref):
            raise MergeError(f"{model.label}: MISCEL_1 global execution options differ between inputs")
    rows = [_token_row(all_materials[i:i+6]) for i in range(0, len(all_materials), 6)]
    rows.extend(execution_ref or [])
    return rows


def _elements(model: InputModel, base: dict[str, int]) -> tuple[list[str], set[int]]:
    rows = list(model.sections["ELEMENTS"])
    if len(rows) != model.control.numelt * ELEMENT_LINES:
        raise MergeError(f"{model.label}: ELEMENTS row count changed during validation")
    output: list[str] = []
    nodes: set[int] = set()
    for start in range(0, len(rows), ELEMENT_LINES):
        block = list(rows[start:start + ELEMENT_LINES])
        for field_index, node_name in ((0, "from"), (1, "to")):
            raw = _float(_field(block[0], field_index), f"{model.label}: ELEMENT {node_name} node")
            mapped = _mapped_node(raw, model.offset, f"{model.label}: ELEMENT {node_name} node")
            if mapped is not None and mapped > 0:
                nodes.add(mapped)
                block[0] = _splice(block[0], field_index, _g13(float(mapped)))

        for row_index, names in POINTER_LAYOUT:
            values: list[int] = []
            for field_index, section_name in enumerate(names):
                pointer = _integer(_field(block[row_index], field_index), f"{model.label}: {section_name} pointer")
                values.append(pointer + base[section_name] if pointer else 0)
            block[row_index] = _irow(values)
        output.extend(block)
    return output, nodes


def _bend(rows: Sequence[str], offset: int, label: str) -> list[str]:
    output = list(rows)
    for start in range(0, len(output), rules.LINES_PER_AUX_BLOCK["BEND"]):
        output[start] = _offset_field(output[start], 3, offset, f"{label}: BEND node1")
        output[start] = _offset_field(output[start], 5, offset, f"{label}: BEND node2")
        output[start + 1] = _offset_field(output[start + 1], 1, offset, f"{label}: BEND node3")
    return output


def _restrant(rows: Sequence[str], offset: int, label: str) -> list[str]:
    output = list(rows)
    width = rules.LINES_PER_AUX_BLOCK["RESTRANT"]
    for start in range(0, len(output), width):
        # Six 4-row restraint slots per 24-row record.  Field 0 is support node;
        # field 5 is connecting node.  This is the node-bearing layout retained
        # in the paired Ver 14 fixture.
        for slot in range(6):
            row_index = start + slot * 4
            output[row_index] = _offset_field(output[row_index], 0, offset, f"{label}: RESTRANT node")
            output[row_index] = _offset_field(output[row_index], 5, offset, f"{label}: RESTRANT cnode")
    return output


def _sif(rows: Sequence[str], offset: int, label: str) -> list[str]:
    output = list(rows)
    width = rules.LINES_PER_AUX_BLOCK["SIF&TEES"]
    for start in range(0, len(output), width):
        # Ver 14 adds four payload rows but the record's leading node identity is
        # still the first field of the first row in the paired benchmark.
        output[start] = _offset_field(output[start], 0, offset, f"{label}: SIF&TEES node")
    return output


def _coords(models: Sequence[InputModel], allow_overlap: bool) -> list[str]:
    merged: dict[int, tuple[float, float, float]] = {}
    for model in models:
        rows = model.sections.get("COORDS", [])
        for row in rows[1:]:
            tokens = row.split()
            if len(tokens) < 4:
                raise MergeError(f"{model.label}: incomplete COORDS row")
            node = _offset_int(_integer(tokens[0], f"{model.label}: COORDS node"), model.offset, f"{model.label}: COORDS node")
            xyz = tuple(_float(token, f"{model.label}: COORDS") for token in tokens[1:4])
            if node in merged:
                if not allow_overlap:
                    raise MergeError(f"{model.label}: duplicate COORDS node {node}")
                if not all(math.isclose(a, b, rel_tol=1e-10, abs_tol=1e-6) for a, b in zip(merged[node], xyz)):
                    raise MergeError(f"{model.label}: overlapping node {node} has conflicting coordinates")
            else:
                merged[node] = xyz
    if not merged:
        return []
    rows = [_irow([len(merged)])]
    for node, xyz in merged.items():
        rows.append(_irow([node]) + "".join(_g13(value) for value in xyz))
    return rows


def _aggregate_control(models: Sequence[InputModel]) -> rules.ControlCounts:
    izup = models[0].control.izup
    if any(model.control.izup != izup for model in models[1:]):
        raise MergeError("CONTROL IZUP differs between inputs")
    names = (
        "numelt", "numnoz", "nohgrs", "nonam", "nored", "numflg",
        "bends", "rigids", "expjts", "restraints", "displmnt", "forcmnt",
        "uniform", "wind", "offsets", "allowbls", "sif_tees", "equipmnt",
    )
    values = {name: sum(getattr(model.control, name) for model in models) for name in names}
    return rules.ControlCounts(izup=izup, **values)


def _serialize(sections: dict[str, list[str]]) -> str:
    output: list[str] = []
    for name in ORDER:
        if name in OPTIONAL and name not in sections:
            continue
        output.append(f"#$ {name}")
        output.extend(sections.get(name, []))
    return "\n".join(output) + "\n"


def merge_cii14_texts(texts: Sequence[str], *, offsets: Sequence[int] | None = None,
                      labels: Sequence[str] | None = None,
                      allow_node_overlap: bool = False) -> tuple[str, MergeSummary]:
    if len(texts) < 2:
        raise MergeError("At least two Ver 14 CII inputs are required")
    offsets = tuple([0] * len(texts) if offsets is None else offsets)
    labels = tuple([f"input[{index + 1}]" for index in range(len(texts))] if labels is None else labels)
    if len(offsets) != len(texts) or len(labels) != len(texts):
        raise MergeError("input/offset/label counts differ")

    models: list[InputModel] = []
    for text, offset, label in zip(texts, offsets, labels):
        sections = _sections(text, label)
        try:
            control = rules.parse_control_counts(sections["CONTROL"])
            version = rules.version_signature(sections["VERSION"])
        except ValueError as exc:
            raise MergeError(f"{label}: {exc}") from exc
        model = InputModel(label, int(offset), sections, control, version)
        _validate(model)
        models.append(model)

    version_ref = models[0].version
    units_ref = _units(models[0].sections["UNITS"], models[0].label)
    for model in models[1:]:
        if model.version != version_ref:
            raise MergeError(
                f"{model.label}: VERSION signature {model.version} differs from first input {version_ref}; "
                "cross-build Ver 14 merging is not qualified"
            )
        if not _same_units(units_ref, _units(model.sections["UNITS"], model.label)):
            raise MergeError(f"{model.label}: UNITS differ from the first Ver 14 input")

    total = _aggregate_control(models)
    merged: dict[str, list[str]] = {name: [] for name in ORDER if name not in OPTIONAL}
    merged["VERSION"] = list(models[0].sections["VERSION"])
    merged["CONTROL"] = rules.format_control_rows(total)
    merged["UNITS"] = list(models[0].sections["UNITS"])
    if total.nonam or any("NODENAME" in model.sections for model in models):
        merged["NODENAME"] = []

    base = {section_name: 0 for _row, names in POINTER_LAYOUT for section_name in names}
    seen_nodes: set[int] = set()
    for model in models:
        element_rows, nodes = _elements(model, base)
        overlap = seen_nodes & nodes
        if overlap and not allow_node_overlap:
            sample = ", ".join(str(node) for node in sorted(overlap)[:8])
            raise MergeError(f"{model.label}: node collision after offset {model.offset}: {sample}")
        seen_nodes |= nodes

        merged["ELEMENTS"].extend(element_rows)
        if "NODENAME" in merged:
            merged["NODENAME"].extend(model.sections.get("NODENAME", []))
        merged["BEND"].extend(_bend(model.sections["BEND"], model.offset, model.label))
        merged["RIGID"].extend(model.sections["RIGID"])
        merged["RESTRANT"].extend(_restrant(model.sections["RESTRANT"], model.offset, model.label))
        merged["SIF&TEES"].extend(_sif(model.sections["SIF&TEES"], model.offset, model.label))
        merged["REDUCERS"].extend(model.sections["REDUCERS"])

        # These are guaranteed zero by _validate; preserve empty sections so the
        # neutral-file section sequence remains complete.
        for name in ("EXPJT", "DISPLMNT", "FORCMNT", "UNIFORM", "WIND", "OFFSETS", "ALLOWBLS", "FLANGES", "EQUIPMNT"):
            merged[name].extend(model.sections[name])

        for section_name, count in _pointer_counts(model.control).items():
            base[section_name] += count

    merged["MISCEL_1"] = _merge_miscel(models)
    coords = _coords(models, allow_node_overlap)
    if coords or any("COORDS" in model.sections for model in models):
        merged["COORDS"] = coords

    output = _serialize(merged)
    report = rules.validate_cii14_sections(output)
    if not report.ok:
        errors = [f"{issue.code}[{issue.section}]: {issue.message}" for issue in report.issues if issue.severity == "error"]
        raise MergeError("merged output failed CII Ver 14 section rules: " + " | ".join(errors))

    return output, MergeSummary(
        profile="CAESAR-II-CII-VER14/qualified-v1",
        inputs=len(models),
        elements=total.numelt,
        unique_nodes=len(seen_nodes),
        offsets=tuple(int(value) for value in offsets),
        warnings=(),
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", action="append", required=True, type=Path,
                        help="Input Ver 14 CII; repeat for every model")
    parser.add_argument("--offset", action="append", type=int,
                        help="Node offset corresponding to each --input")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--allow-node-overlap", action="store_true")
    parser.add_argument("--report", type=Path, help="Optional JSON merge receipt")
    args = parser.parse_args(argv)

    offsets = [0] * len(args.input) if args.offset is None else args.offset
    if len(offsets) != len(args.input):
        parser.error("provide no offsets or exactly one --offset per --input")

    try:
        output, summary = merge_cii14_texts(
            [path.read_text(encoding="utf-8", errors="replace") for path in args.input],
            offsets=offsets,
            labels=[str(path) for path in args.input],
            allow_node_overlap=args.allow_node_overlap,
        )
    except (MergeError, ValueError) as exc:
        parser.error(str(exc))

    args.output.write_text(output, encoding="utf-8")
    if args.report:
        args.report.write_text(json.dumps(summary.to_dict(), indent=2) + "\n", encoding="utf-8")
    print(
        f"Merged {summary.inputs} Ver 14 CII files -> {args.output}; "
        f"elements={summary.elements}; nodes={summary.unique_nodes}; offsets={list(summary.offsets)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
