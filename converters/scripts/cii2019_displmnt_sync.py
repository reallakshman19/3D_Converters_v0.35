#!/usr/bin/env python3
from __future__ import annotations

import argparse
import math
import re
from dataclasses import dataclass
from pathlib import Path
import xml.etree.ElementTree as ET

SECTION_RX = re.compile(r"^\s*#\$\s+([A-Z0-9_&]+)\s*$")
MISSING = -1.0101


@dataclass
class Section:
    name: str
    header: str
    rows: list[str]


@dataclass(frozen=True)
class Vector:
    number: int
    values: tuple[float, float, float, float, float, float]


@dataclass(frozen=True)
class Spec:
    number: int
    node: float
    vectors: list[Vector]


@dataclass(frozen=True)
class Block:
    first: Spec | None
    second: Spec | None


def local_name(tag: str) -> str:
    return tag.split("}", 1)[1] if tag.startswith("{") else tag


def is_missing(value: float) -> bool:
    return (not math.isfinite(value)) or abs(value - MISSING) < 1e-6


def to_float(value: str | None, default: float = MISSING) -> float:
    text = "" if value is None else value.strip()
    if not text:
        return default
    try:
        return float(text)
    except ValueError:
        return default


def to_int(value: str | None, default: int = 0) -> int:
    parsed = to_float(value)
    return default if is_missing(parsed) else int(round(parsed))


def format_ints(values: list[int]) -> str:
    return "  " + "".join(f"{int(value):13d}" for value in values)


def format_reals(values: list[float]) -> str:
    return "  " + "".join(f"{float(value):13.6G}" for value in values)


def pack_reals(values: list[float]) -> list[str]:
    return [format_reals(values[index:index + 6]) for index in range(0, len(values), 6)]


def parse_sections(text: str) -> list[Section]:
    sections: list[Section] = []
    current: Section | None = None

    for raw in text.splitlines():
        line = raw.rstrip("\r\n")
        match = SECTION_RX.match(line.lstrip("﻿"))

        if match:
            current = Section(match.group(1), line, [])
            sections.append(current)
        elif current is not None:
            current.rows.append(line)

    return sections


def section_index(sections: list[Section], name: str) -> int:
    for index, section in enumerate(sections):
        if section.name == name:
            return index
    return -1


def nonblank(rows: list[str]) -> list[str]:
    return [row for row in rows if row.strip()]


def parse_control(sections: list[Section]) -> list[list[int]]:
    index = section_index(sections, "CONTROL")
    if index < 0:
        raise ValueError("CONTROL section missing")

    rows = nonblank(sections[index].rows)
    if len(rows) < 4:
        raise ValueError("CONTROL section requires four rows")

    parsed = [[int(token) for token in row.split()] for row in rows[:4]]

    if (
        len(parsed[0]) < 6
        or len(parsed[1]) < 6
        or len(parsed[2]) < 6
        or len(parsed[3]) < 1
    ):
        raise ValueError("CONTROL layout must be 6/6/6/1")

    return parsed


def write_control(sections: list[Section], control: list[list[int]]) -> None:
    index = section_index(sections, "CONTROL")
    if index < 0:
        raise ValueError("CONTROL section missing")

    sections[index].rows = [
        format_ints(control[0][:6]),
        format_ints(control[1][:6]),
        format_ints(control[2][:6]),
        format_ints(control[3][:1]),
    ]


def parse_spec(element: ET.Element) -> Spec | None:
    node = to_float(element.attrib.get("NODE_NUM"))
    if is_missing(node):
        return None

    vectors: list[Vector] = []

    for child in list(element):
        if local_name(child.tag).upper() != "VECTOR":
            continue

        vectors.append(
            Vector(
                to_int(child.attrib.get("NUMBER")),
                (
                    to_float(child.attrib.get("DX")),
                    to_float(child.attrib.get("DY")),
                    to_float(child.attrib.get("DZ")),
                    to_float(child.attrib.get("RX")),
                    to_float(child.attrib.get("RY")),
                    to_float(child.attrib.get("RZ")),
                ),
            )
        )

    return Spec(to_int(element.attrib.get("DISP_NUM"), 1), node, vectors)


def parse_blocks(path: Path) -> tuple[list[Block], dict[int, int]]:
    root = ET.parse(path).getroot()
    blocks: list[Block] = []
    # 0-based PIPINGELEMENT index (matching ELEMENTS section element order) ->
    # 1-based DISPLMNT block index, for elements that got a displacement
    # block. Needed to patch each such element's IEL row12 pointer (item 5)
    # - without it, CAESAR never associates this section's real data with
    # any element (same failure mode the NODENAME pointer had).
    edge_to_displmnt_index: dict[int, int] = {}

    for edge_index, element in enumerate(
        el for el in root.iter() if local_name(el.tag).upper() == "PIPINGELEMENT"
    ):
        specs: dict[int, Spec] = {}
        ordinal = 1

        for child in list(element):
            if local_name(child.tag).upper() != "DISPLACEMENTS":
                continue

            spec = parse_spec(child)
            if spec is None:
                ordinal += 1
                continue

            number = spec.number if spec.number in (1, 2) else ordinal
            specs[number] = spec
            ordinal += 1

        if specs:
            edge_to_displmnt_index[edge_index] = len(blocks) + 1
            blocks.append(Block(specs.get(1), specs.get(2)))

    return blocks, edge_to_displmnt_index


def dof_value(value: float) -> float:
    return 9999.99 if is_missing(value) else value


def spec_values(spec: Spec | None) -> list[float]:
    if spec is None:
        return [9999.99] * 55

    values = [spec.node]
    vectors = {vector.number: vector for vector in spec.vectors if vector.number > 0}

    for case_number in range(1, 10):
        vector = vectors.get(case_number)

        if vector is None:
            values.extend([9999.99] * 6)
        else:
            values.extend([dof_value(value) for value in vector.values])

    if len(values) != 55:
        raise ValueError(f"DISPLMNT spec must have 55 values, got {len(values)}")

    return values


def pack_spec(values: list[float]) -> list[str]:
    rows = [format_reals([values[0]])]
    for case_index in range(9):
        start = 1 + case_index * 6
        rows.append(format_reals(values[start:start + 6]))
    return rows


def build_payload(blocks: list[Block]) -> list[str]:
    rows: list[str] = []

    for block in blocks:
        rows.extend(pack_spec(spec_values(block.first)))
        rows.extend(pack_spec(spec_values(block.second)))

    return rows


def ensure_displmnt_section(sections: list[Section]) -> int:
    index = section_index(sections, "DISPLMNT")
    if index >= 0:
        return index

    restrant_index = section_index(sections, "RESTRANT")
    forcmnt_index = section_index(sections, "FORCMNT")

    insert_at = (
        restrant_index + 1
        if restrant_index >= 0
        else (forcmnt_index if forcmnt_index >= 0 else len(sections))
    )

    sections.insert(insert_at, Section("DISPLMNT", "#$ DISPLMNT", []))
    return insert_at


def render(sections: list[Section]) -> str:
    lines: list[str] = []

    for section in sections:
        lines.append(section.header if section.header.strip() else f"#$ {section.name}")
        lines.extend(section.rows)

    return "\r\n".join(lines).rstrip() + "\r\n"


# Per-element ELEMENTS block layout used by inputxml_to_cii2019.py: 15 lines
# per element (line1, line2, row3-row9, row10, line10, row11, line12, line13,
# line14). line12 (0-based index 12) is the IEL row whose 5th of 6 values
# (0-based slot 4) is the "Pointer to Displacement Auxiliary field" (item 5
# per the CAESAR II Neutral File spec, Section 14, External Interfaces).
ELEMENTS_LINES_PER_BLOCK = 15
ELEMENTS_ROW12_LINE_INDEX = 12
DISPLMNT_POINTER_SLOT = 4


def patch_elements_displmnt_pointers(sections: list[Section], edge_to_displmnt_index: dict[int, int]) -> int:
    if not edge_to_displmnt_index:
        return 0

    index = section_index(sections, "ELEMENTS")
    if index < 0:
        raise ValueError("ELEMENTS section missing")

    rows = sections[index].rows
    patched = 0

    for edge_index, displmnt_index in edge_to_displmnt_index.items():
        line_index = edge_index * ELEMENTS_LINES_PER_BLOCK + ELEMENTS_ROW12_LINE_INDEX
        if line_index >= len(rows):
            continue

        tokens = [int(token) for token in rows[line_index].split()]
        if len(tokens) != 6:
            continue

        tokens[DISPLMNT_POINTER_SLOT] = displmnt_index
        rows[line_index] = format_ints(tokens)
        patched += 1

    return patched


def sync_displmnt(cii_text: str, input_xml: Path) -> tuple[str, list[str]]:
    sections = parse_sections(cii_text)
    if not sections:
        raise ValueError("No CII sections found")

    blocks, edge_to_displmnt_index = parse_blocks(input_xml)
    rows = build_payload(blocks)

    sections[ensure_displmnt_section(sections)].rows = rows
    patched_pointers = patch_elements_displmnt_pointers(sections, edge_to_displmnt_index)

    control = parse_control(sections)

    # CONTROL line 2, field 5 = DISPLMNT count.
    control[1][4] = len(blocks)

    write_control(sections, control)

    return render(sections), [
        f"xml_displmnt_blocks={len(blocks)}",
        f"displmnt_rows={len(rows)}",
        f"elements_pointers_patched={patched_pointers}",
        "control_displmnt_synced",
        "equipmnt_not_fabricated",
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync CII 2019 DISPLMNT from InputXML")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--input-xml", required=True, type=Path)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    text = args.input.read_text(encoding="utf-8-sig", errors="replace")
    fixed, notes = sync_displmnt(text, args.input_xml)

    if args.strict and "#$ DISPLMNT" not in fixed:
        raise ValueError("DISPLMNT sync failed")

    args.output.write_text(fixed, encoding="utf-8", newline="")

    print("CII2019_DISPLMNT_SYNC " + ";".join(notes).replace(" ", "_"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
