#!/usr/bin/env python3
"""Merge CAESAR II 2019 CII models without changing the InputXML->CII engine.

The adapter preserves the neutral-file contract: it offsets node namespaces,
rebases 1-based auxiliary pointers in ELEMENTS, rebuilds CONTROL, repacks
MISCEL_1 material/hanger arrays, merges COORDS, and fails closed on incompatible
units/global settings or unqualified node-bearing sections.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
import math
from pathlib import Path
import re
from typing import Sequence

import cii2019_section_rules as rules

SECTION_RX = re.compile(r"^\s*#\$\s+([A-Z0-9_&]+)\b.*$")
PREFIX, WIDTH = 2, 13
ELEMENT_LINES = rules.ELEMENT_LINES_PER_BLOCK
ORDER = rules.SECTION_ORDER_2019
OPTIONAL = {"NODENAME", "COORDS"}
REQUIRED = set(ORDER) - OPTIONAL
POINTER_LAYOUT = (
    (12, ("BEND", "RIGID", "EXPJT", "RESTRANT", "DISPLMNT", "FORCMNT")),
    (13, ("UNIFORM", "WIND", "OFFSETS", "ALLOWBLS", "SIF&TEES", "NODENAME")),
    (14, ("REDUCERS", "FLANGES", "EQUIPMNT")),
)


class MergeError(ValueError):
    pass


@dataclass
class InputModel:
    label: str
    offset: int
    sections: dict[str, list[str]]
    control: rules.ControlCounts


@dataclass
class Hanger:
    node: int
    hgrdat: list[str]
    tag: str
    guid: str
    free: list[int]
    number: int
    table: int
    short: int
    cnode: int


@dataclass
class Miscel:
    materials: list[float]
    nozzles: list[str]
    defaults: list[str]
    hangers: list[Hanger]
    execution: list[str]


@dataclass(frozen=True)
class MergeSummary:
    inputs: int
    elements: int
    unique_nodes: int
    offsets: tuple[int, ...]
    warnings: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {"inputs": self.inputs, "elements": self.elements, "unique_nodes": self.unique_nodes,
                "offsets": list(self.offsets), "warnings": list(self.warnings)}


def _span(index: int) -> tuple[int, int]:
    a = PREFIX + WIDTH * index
    return a, a + WIDTH


def _field(line: str, index: int) -> str:
    a, b = _span(index)
    return (line + " " * max(0, b - len(line)))[a:b]


def _splice(line: str, index: int, cell: str) -> str:
    a, b = _span(index)
    line += " " * max(0, b - len(line))
    return line[:a] + cell + line[b:]


def _f(text: str, label: str) -> float:
    try:
        value = float(text.strip())
    except ValueError as exc:
        raise MergeError(f"{label}: invalid numeric token {text!r}") from exc
    if not math.isfinite(value):
        raise MergeError(f"{label}: non-finite numeric token {text!r}")
    return value


def _i(text: str, label: str, *, negative: bool = False) -> int:
    value = _f(text, label)
    out = int(round(value))
    if abs(value - out) > 1e-6 or (out < 0 and not negative):
        raise MergeError(f"{label}: expected integer-valued token, got {text!r}")
    return out


def _g13(value: float) -> str:
    x = float(value)
    ax = abs(x)
    if ax != 0.0 and (ax < 0.1 or ax >= 1e6):
        exp = int(math.floor(math.log10(ax))) + 1
        body = f"{x/(10.0**exp):.6f}E{'+' if exp >= 0 else '-'}{abs(exp):02d}"
        return f"{body:>13}"
    if ax == 0.0:
        return f"{'0.00000':>9}    "
    digits = 1 if ax < 1 else int(math.floor(math.log10(ax))) + 1
    return f"{x:.{max(6-digits, 0)}f}".rjust(9) + "    "


def _grow(values: Sequence[float]) -> str:
    return "  " + "".join(_g13(v) for v in values)


def _irow(values: Sequence[int]) -> str:
    return "  " + "".join(f"{int(v):13d}" for v in values)


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
    value = _f(_field(line, index), label)
    mapped = _mapped_node(value, offset, label, sentinel=sentinel)
    if mapped is None or mapped <= 0:
        return line
    return _splice(line, index, _g13(float(mapped)))


def _sections(text: str, label: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    current: str | None = None
    for raw in text.splitlines():
        line = raw.rstrip("\r\n")
        match = SECTION_RX.match(line.lstrip("\ufeff"))
        if match:
            current = match.group(1)
            if current in out:
                raise MergeError(f"{label}: duplicate #$ {current}")
            out[current] = []
        elif current is None:
            if line.strip():
                raise MergeError(f"{label}: payload before first CII section")
        else:
            out[current].append(line)
    missing = sorted(REQUIRED - set(out))
    if missing:
        raise MergeError(f"{label}: missing sections: {', '.join(missing)}")
    unknown = sorted(set(out) - set(ORDER))
    if unknown:
        raise MergeError(f"{label}: unsupported sections: {', '.join(unknown)}")
    return out


def _pointer_counts(c: rules.ControlCounts) -> dict[str, int]:
    return {"BEND": c.bends, "RIGID": c.rigids, "EXPJT": c.expjts, "RESTRANT": c.restraints,
            "DISPLMNT": c.displmnt, "FORCMNT": c.forcmnt, "UNIFORM": c.uniform, "WIND": c.wind,
            "OFFSETS": c.offsets, "ALLOWBLS": c.allowbls, "SIF&TEES": c.sif_tees, "NODENAME": c.nonam,
            "REDUCERS": c.nored, "FLANGES": c.numflg, "EQUIPMNT": c.equipmnt}


def _validate(model: InputModel) -> None:
    c, s, label = model.control, model.sections, model.label
    report = rules.validate_control_against_sections(s, c, list(s))
    if not report.ok:
        errors = [f"{x.code}[{x.section}]: {x.message}" for x in report.issues if x.severity == "error"]
        raise MergeError(f"{label}: invalid CII 2019 structure: {' | '.join(errors)}")
    if len(s.get("NODENAME", [])) != c.nonam:
        raise MergeError(f"{label}: NODENAME rows={len(s.get('NODENAME', []))}, CONTROL NONAM={c.nonam}")
    if any(row.strip() for row in s.get("AUX_DATA", [])):
        raise MergeError(f"{label}: non-empty AUX_DATA is not merge-qualified")
    coords = s.get("COORDS", [])
    if coords and (len(coords) - 1 != _i(coords[0], f"{label}: COORDS count")):
        raise MergeError(f"{label}: COORDS count mismatch")
    if model.offset and c.numnoz:
        raise MergeError(f"{label}: NUMNOZ>0 with node offset is not yet qualified")
    if model.offset and c.equipmnt:
        raise MergeError(f"{label}: EQUIPMNT>0 with node offset is not yet qualified")


def _version(rows: Sequence[str], label: str) -> tuple[int, int]:
    for row in rows:
        nums = []
        for token in row.split():
            try:
                nums.append(float(token))
            except ValueError:
                pass
        if len(nums) >= 2:
            return int(round(nums[0])), int(round(nums[1]))
    raise MergeError(f"{label}: VERSION signature not found")


def _units(rows: Sequence[str], label: str) -> tuple[tuple[float, ...], tuple[str, ...]]:
    if len(rows) != rules.UNITS_TOTAL_LINES:
        raise MergeError(f"{label}: UNITS must contain {rules.UNITS_TOTAL_LINES} rows")
    values: list[float] = []
    for row in rows[:rules.UNITS_CONSTANT_LINES]:
        values.extend(_f(tok, f"{label}: UNITS") for tok in row.split())
    return tuple(values), tuple(row.strip().casefold() for row in rows[rules.UNITS_CONSTANT_LINES:])


def _same_units(a, b) -> bool:
    av, al = a
    bv, bl = b
    return al == bl and len(av) == len(bv) and all(math.isclose(x, y, rel_tol=1e-9, abs_tol=1e-12) for x, y in zip(av, bv))


def _vals(rows: Sequence[str], count: int, label: str, *, ints: bool = False) -> list:
    out = []
    for row in rows:
        for tok in row.split():
            out.append(_i(tok, label, negative=True) if ints else _f(tok, label))
    if len(out) < count:
        raise MergeError(f"{label}: expected {count} values, found {len(out)}")
    return out[:count]


def _ceil(n: int) -> int:
    return (n + 5) // 6


def _miscel(model: InputModel) -> Miscel:
    c = model.control
    rows = [r for r in model.sections["MISCEL_1"] if r.strip()]
    rr = _ceil(c.numelt)
    materials = _vals(rows[:rr], c.numelt, f"{model.label}: RRMAT")
    p = rr
    nozzles = list(rows[p:p + c.numnoz * 4])
    p += c.numnoz * 4
    defaults: list[str] = []
    hangers: list[Hanger] = []
    if c.nohgrs:
        defaults = list(rows[p:p+2])
        p += 2
        pack = _ceil(c.nohgrs)
        nodes = _vals(rows[p:p+pack], c.nohgrs, f"{model.label}: IHGRNODE", ints=True)
        p += pack
        raw = []
        for _ in range(c.nohgrs):
            if len(rows) < p + 4:
                raise MergeError(f"{model.label}: truncated HGRDAT/TAG/GUID")
            raw.append((list(rows[p:p+2]), rows[p+2], rows[p+3]))
            p += 4
        free = [_vals([row], 4, f"{model.label}: IHGRFREE", ints=True) for row in rows[p:p+c.nohgrs]]
        p += c.nohgrs
        arrays = []
        for name in ("IHGRNUM", "IHGRTABLE", "IHGRSHORT", "IHGRCN"):
            arrays.append(_vals(rows[p:p+pack], c.nohgrs, f"{model.label}: {name}", ints=True))
            p += pack
        for k in range(c.nohgrs):
            dat, tag, guid = raw[k]
            hangers.append(Hanger(nodes[k], dat, tag, guid, free[k], arrays[0][k], arrays[1][k], arrays[2][k], arrays[3][k]))
    execution = list(rows[p:])
    if len(execution) != 4:
        raise MergeError(f"{model.label}: MISCEL_1 execution tail has {len(execution)} rows, expected 4")
    return Miscel(materials, nozzles, defaults, hangers, execution)


def _norm(rows: Sequence[str]) -> tuple[str, ...]:
    return tuple(" ".join(r.split()) for r in rows)


def _node_i(value: int, offset: int, label: str) -> int:
    if value <= 0:
        return value
    out = value + offset
    if out <= 0:
        raise MergeError(f"{label}: offset maps {value} to invalid {out}")
    return out


def _merge_miscel(models: Sequence[InputModel]) -> tuple[list[str], list[str]]:
    parts = [_miscel(m) for m in models]
    ref_exec = _norm(parts[0].execution)
    if any(_norm(p.execution) != ref_exec for p in parts[1:]):
        raise MergeError("MISCEL_1 global execution options differ between inputs")
    materials: list[float] = []
    nozzles: list[str] = []
    hangers: list[Hanger] = []
    defaults: list[str] = []
    defaults_norm = None
    warnings: list[str] = []
    for model, part in zip(models, parts):
        materials += part.materials
        nozzles += part.nozzles
        if part.hangers:
            if defaults_norm is None:
                defaults, defaults_norm = list(part.defaults), _norm(part.defaults)
            elif _norm(part.defaults) != defaults_norm:
                warnings.append(f"{model.label}: hanger global defaults differ; first input defaults retained")
            for h in part.hangers:
                free = list(h.free)
                free[0] = _node_i(free[0], model.offset, f"{model.label}: FREEANCHOR1")
                free[1] = _node_i(free[1], model.offset, f"{model.label}: FREEANCHOR2")
                hangers.append(Hanger(_node_i(h.node, model.offset, f"{model.label}: IHGRNODE"), list(h.hgrdat), h.tag,
                                      h.guid, free, h.number, h.table, h.short,
                                      _node_i(h.cnode, model.offset, f"{model.label}: IHGRCN")))
    rows = [_grow(materials[i:i+6]) for i in range(0, len(materials), 6)] + nozzles
    if hangers:
        rows += defaults
        rows += [_irow([h.node for h in hangers[i:i+6]]) for i in range(0, len(hangers), 6)]
        for h in hangers:
            rows += h.hgrdat + [h.tag, h.guid]
        rows += [_irow(h.free) for h in hangers]
        for attr in ("number", "table", "short", "cnode"):
            values = [getattr(h, attr) for h in hangers]
            rows += [_irow(values[i:i+6]) for i in range(0, len(values), 6)]
    rows += parts[0].execution
    return rows, warnings


def _elements(model: InputModel, base: dict[str, int]) -> tuple[list[str], set[int]]:
    out: list[str] = []
    nodes: set[int] = set()
    rows = model.sections["ELEMENTS"]
    for n in range(model.control.numelt):
        block = list(rows[n*ELEMENT_LINES:(n+1)*ELEMENT_LINES])
        for j, side in ((0, "from"), (1, "to")):
            mapped = _mapped_node(_f(_field(block[0], j), f"{model.label}: element {n+1} {side}"), model.offset,
                                  f"{model.label}: element {n+1} {side}")
            if mapped is None or mapped <= 0:
                raise MergeError(f"{model.label}: invalid element node")
            nodes.add(mapped)
            block[0] = _splice(block[0], j, _g13(mapped))
        for row, names in POINTER_LAYOUT:
            toks = block[row].split()
            if len(toks) < len(names):
                raise MergeError(f"{model.label}: incomplete element pointer row {row}")
            vals = []
            for tok, name in zip(toks, names):
                ptr = _i(tok, f"{model.label}: {name} pointer")
                vals.append(ptr + base[name] if ptr else 0)
            block[row] = _irow(vals)
        out += block
    return out, nodes


def _bend(rows: Sequence[str], offset: int, label: str) -> list[str]:
    out = list(rows)
    for p in range(0, len(out), 3):
        out[p] = _offset_field(out[p], 3, offset, f"{label}: BEND node1")
        out[p] = _offset_field(out[p], 5, offset, f"{label}: BEND node2")
        out[p+1] = _offset_field(out[p+1], 1, offset, f"{label}: BEND node3")
    return out


def _restrant(rows: Sequence[str], offset: int, label: str) -> list[str]:
    out = list(rows)
    for block in range(0, len(out), 24):
        for slot in range(6):
            p = block + slot * 4
            out[p] = _offset_field(out[p], 0, offset, f"{label}: RESTRANT node")
            out[p] = _offset_field(out[p], 5, offset, f"{label}: RESTRANT cnode")
    return out


def _nodal20(rows: Sequence[str], offset: int, label: str) -> list[str]:
    out = list(rows)
    for p in range(0, len(out), 20):
        out[p] = _offset_field(out[p], 0, offset, label, sentinel=True)
        out[p+10] = _offset_field(out[p+10], 0, offset, label, sentinel=True)
    return out


def _sif(rows: Sequence[str], offset: int, label: str) -> list[str]:
    out = list(rows)
    for p in range(0, len(out), 10):
        out[p] = _offset_field(out[p], 0, offset, f"{label}: SIF&TEES node")
    return out


def _coord_record(row: str, label: str) -> tuple[int, tuple[float, float, float]]:
    """Parse one COORDS record using CAESAR's FORMAT(2X,I13,3F13.4).

    Fixed-width fields are authoritative.  A whitespace-token fallback is kept
    for hand-authored/noncanonical files, but legal adjacent 13-character
    fields must never be split on whitespace.
    """
    try:
        node = _i(_field(row, 0), f"{label}: COORDS node")
        xyz = tuple(_f(_field(row, index), f"{label}: COORDS") for index in (1, 2, 3))
        return node, xyz
    except MergeError as fixed_error:
        tokens = row.split()
        if len(tokens) >= 4:
            try:
                node = _i(tokens[0], f"{label}: COORDS node")
                xyz = tuple(_f(token, f"{label}: COORDS") for token in tokens[1:4])
                return node, xyz
            except MergeError:
                pass
        raise MergeError(
            f"{label}: invalid COORDS row; expected FORTRAN FORMAT(2X,I13,3F13.4): {row!r}"
        ) from fixed_error


def _coords(models: Sequence[InputModel], allow_overlap: bool) -> list[str]:
    merged: dict[int, tuple[float, float, float]] = {}
    for model in models:
        rows = model.sections.get("COORDS", [])
        for row in rows[1:]:
            source_node, xyz = _coord_record(row, model.label)
            node = _node_i(source_node, model.offset, f"{model.label}: COORDS node")
            if node in merged:
                if not allow_overlap:
                    raise MergeError(f"{model.label}: duplicate COORDS node {node}")
                if not all(math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-6) for a, b in zip(merged[node], xyz)):
                    raise MergeError(f"{model.label}: overlapping node {node} has conflicting coordinates")
            else:
                merged[node] = xyz
    if not merged:
        return []
    return [_irow([len(merged)])] + [_irow([n]) + "".join(_g13(v) for v in xyz) for n, xyz in merged.items()]


def _control(models: Sequence[InputModel]) -> rules.ControlCounts:
    izup = models[0].control.izup
    if any(m.control.izup != izup for m in models[1:]):
        raise MergeError("CONTROL IZUP differs between inputs")
    names = ("numelt", "numnoz", "nohgrs", "nonam", "nored", "numflg", "bends", "rigids", "expjts", "restraints",
             "displmnt", "forcmnt", "uniform", "wind", "offsets", "allowbls", "sif_tees", "equipmnt")
    data = {name: sum(getattr(m.control, name) for m in models) for name in names}
    return rules.ControlCounts(izup=izup, **data)


def _serialize(sections: dict[str, list[str]]) -> str:
    out: list[str] = []
    for name in ORDER:
        if name in OPTIONAL and name not in sections:
            continue
        out.append(f"#$ {name}")
        out += sections.get(name, [])
    return "\n".join(out) + "\n"


def merge_cii_texts(texts: Sequence[str], *, offsets: Sequence[int] | None = None, labels: Sequence[str] | None = None,
                    allow_node_overlap: bool = False) -> tuple[str, MergeSummary]:
    if len(texts) < 2:
        raise MergeError("At least two CII inputs are required")
    offsets = tuple([0] * len(texts) if offsets is None else offsets)
    labels = tuple([f"input[{i+1}]" for i in range(len(texts))] if labels is None else labels)
    if len(offsets) != len(texts) or len(labels) != len(texts):
        raise MergeError("input/offset/label counts differ")
    models = []
    for text, offset, label in zip(texts, offsets, labels):
        sec = _sections(text, label)
        c = rules.parse_control_counts(sec["CONTROL"])
        model = InputModel(label, int(offset), sec, c)
        _validate(model)
        models.append(model)
    sig = _version(models[0].sections["VERSION"], models[0].label)
    units = _units(models[0].sections["UNITS"], models[0].label)
    for model in models[1:]:
        if _version(model.sections["VERSION"], model.label) != sig:
            raise MergeError(f"{model.label}: CII version differs")
        if not _same_units(units, _units(model.sections["UNITS"], model.label)):
            raise MergeError(f"{model.label}: UNITS differ")
    total = _control(models)
    merged = {name: [] for name in ORDER if name not in OPTIONAL}
    merged["VERSION"] = list(models[0].sections["VERSION"])
    merged["CONTROL"] = rules.format_control_rows(total)
    merged["UNITS"] = list(models[0].sections["UNITS"])
    if total.nonam or any("NODENAME" in m.sections for m in models):
        merged["NODENAME"] = []
    base = {name: 0 for _, names in POINTER_LAYOUT for name in names}
    seen: set[int] = set()
    for model in models:
        erows, nodes = _elements(model, base)
        overlap = seen & nodes
        if overlap and not allow_node_overlap:
            sample = ", ".join(str(x) for x in sorted(overlap)[:8])
            raise MergeError(f"{model.label}: node collision after offset {model.offset}: {sample}")
        seen |= nodes
        merged["ELEMENTS"] += erows
        if "NODENAME" in merged:
            merged["NODENAME"] += model.sections.get("NODENAME", [])
        merged["BEND"] += _bend(model.sections["BEND"], model.offset, model.label)
        merged["RIGID"] += model.sections["RIGID"]
        merged["EXPJT"] += model.sections["EXPJT"]
        merged["RESTRANT"] += _restrant(model.sections["RESTRANT"], model.offset, model.label)
        merged["DISPLMNT"] += _nodal20(model.sections["DISPLMNT"], model.offset, f"{model.label}: DISPLMNT")
        merged["FORCMNT"] += _nodal20(model.sections["FORCMNT"], model.offset, f"{model.label}: FORCMNT")
        for name in ("UNIFORM", "WIND", "OFFSETS", "ALLOWBLS"):
            merged[name] += model.sections[name]
        merged["SIF&TEES"] += _sif(model.sections["SIF&TEES"], model.offset, model.label)
        for name in ("REDUCERS", "FLANGES", "EQUIPMNT"):
            merged[name] += model.sections[name]
        for name, count in _pointer_counts(model.control).items():
            base[name] += count
    merged["MISCEL_1"], warnings = _merge_miscel(models)
    coords = _coords(models, allow_node_overlap)
    if coords or any("COORDS" in m.sections for m in models):
        merged["COORDS"] = coords
    output = _serialize(merged)
    report = rules.validate_cii2019_sections(output)
    if not report.ok:
        errors = [f"{x.code}[{x.section}]: {x.message}" for x in report.issues if x.severity == "error"]
        raise MergeError("merged output failed CII 2019 section rules: " + " | ".join(errors))
    return output, MergeSummary(len(models), total.numelt, len(seen), tuple(int(x) for x in offsets), tuple(warnings))


def main(argv: Sequence[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", action="append", required=True, type=Path, help="Input CII; repeat for every model")
    p.add_argument("--offset", action="append", type=int, help="Node offset corresponding to each --input")
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--allow-node-overlap", action="store_true")
    p.add_argument("--report", type=Path, help="Optional JSON summary")
    a = p.parse_args(argv)
    offsets = [0] * len(a.input) if a.offset is None else a.offset
    if len(offsets) != len(a.input):
        p.error("provide no offsets or exactly one --offset per --input")
    try:
        text, summary = merge_cii_texts([x.read_text(encoding="utf-8", errors="replace") for x in a.input], offsets=offsets,
                                        labels=[str(x) for x in a.input], allow_node_overlap=a.allow_node_overlap)
    except (MergeError, ValueError) as exc:
        p.error(str(exc))
    a.output.write_text(text, encoding="utf-8")
    if a.report:
        a.report.write_text(json.dumps(summary.to_dict(), indent=2) + "\n", encoding="utf-8")
    print(f"Merged {summary.inputs} CII files -> {a.output}; elements={summary.elements}; nodes={summary.unique_nodes}; offsets={list(summary.offsets)}")
    for warning in summary.warnings:
        print(f"WARNING: {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())