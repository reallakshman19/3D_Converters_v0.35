#!/usr/bin/env python3
"""Sync CII 2019 FLANGES from InputXML.

Format per the CAESAR II Neutral File spec (User's Guide, Section 14 "External
Interfaces", #$ FLANGES): 72 values per flange written on 12 lines using
format (2X, 6G13.6), except the class-name line which uses (2X, A40).

  Line 1:  items 1-5   (FROM/TO, METHOD, GASKET-or-BOLT_CIRCLE_DIA, BOLT_AREA, SYC)
  Line 2:  items 6-11  (SY1-SY6)
  Line 3:  items 12-14 (SY7-SY9)
  Line 4:  Class Name (40 char max)
  Line 5-8:  items 25-48  (24 temperatures, 6 per line)
  Line 9-12: items 49-72  (24 pressures, 6 per line)

Also patches each source element's ELEMENTS row14 pointer (item 14, "Pointer
to Flange Auxiliary field") - without it CAESAR never associates the flange
data with any element, the same failure mode the NODENAME pointer had.
"""
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
class FlangeSpec:
    location: int
    method: int
    gasket_or_bolt_circle: float
    bolt_area: float
    sy_cold: float
    sy: list[float]
    class_name: str
    temperatures: list[float]
    pressures: list[float]


def local_name(tag: str) -> str:
    return tag.split("}", 1)[1] if tag.startswith("{") else tag


def is_missing(value: float) -> bool:
    return (not math.isfinite(value)) or abs(value - MISSING) < 1e-6


def to_float(value: str | None, default: float = 0.0) -> float:
    text = "" if value is None else value.strip()
    if not text:
        return default
    try:
        parsed = float(text)
    except ValueError:
        return default
    return default if is_missing(parsed) else parsed


def format_reals(values: list[float]) -> str:
    return "  " + "".join(f"{float(value):13.6G}" for value in values)


def format_ints(values: list[int]) -> str:
    return "  " + "".join(f"{int(value):13d}" for value in values)


def format_class_name(name: str) -> str:
    return "  " + f"{name:<40}"[:40]


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


# "From Node"/"To Node"/"Both Ends" are the only human-readable values seen
# across real sample InputXML; unrecognized/blank defaults to BOTH (2) since
# that's the safest interpretation when the source doesn't say otherwise.
LOCATION_CODES = {"FROM NODE": 0, "TO NODE": 1, "BOTH ENDS": 2}


def parse_location(value: str | None) -> int:
    return LOCATION_CODES.get(str(value or "").strip().upper(), 2)


def parse_method(value: str | None) -> int:
    text = str(value or "").strip().upper()
    return 1 if ("ASME" in text or "NC" in text) else 0


def parse_flange(element: ET.Element) -> FlangeSpec:
    attrib = element.attrib
    method = parse_method(attrib.get("METHOD"))
    gasket_or_bolt_circle = (
        to_float(attrib.get("BOLT_CIRCLE_DIA")) if method == 1 else to_float(attrib.get("GASKET_DIAMETER"))
    )
    return FlangeSpec(
        location=parse_location(attrib.get("FLANGE_LOCATION")),
        method=method,
        gasket_or_bolt_circle=gasket_or_bolt_circle,
        bolt_area=to_float(attrib.get("BOLT_AREA")),
        sy_cold=to_float(attrib.get("SY_COLD")),
        sy=[to_float(attrib.get(f"SY{i}")) for i in range(1, 10)],
        class_name=str(attrib.get("CLASS_GRADE") or "").strip(),
        temperatures=[to_float(attrib.get(f"TEMPERATURE{i}")) for i in range(1, 25)],
        pressures=[to_float(attrib.get(f"PRESSURE{i}")) for i in range(1, 25)],
    )


def pack_flange(spec: FlangeSpec) -> list[str]:
    rows = [
        format_reals([spec.location, spec.method, spec.gasket_or_bolt_circle, spec.bolt_area, spec.sy_cold]),
        format_reals(spec.sy[0:6]),
        format_reals(spec.sy[6:9]),
        format_class_name(spec.class_name),
    ]
    for start in range(0, 24, 6):
        rows.append(format_reals(spec.temperatures[start:start + 6]))
    for start in range(0, 24, 6):
        rows.append(format_reals(spec.pressures[start:start + 6]))
    return rows


def parse_flanges(path: Path) -> tuple[list[FlangeSpec], dict[int, int]]:
    root = ET.parse(path).getroot()
    specs: list[FlangeSpec] = []
    edge_to_flange_index: dict[int, int] = {}

    for edge_index, element in enumerate(
        el for el in root.iter() if local_name(el.tag).upper() == "PIPINGELEMENT"
    ):
        flange_element = next(
            (child for child in list(element) if local_name(child.tag).upper() == "FLANGES"),
            None,
        )
        if flange_element is None:
            continue

        edge_to_flange_index[edge_index] = len(specs) + 1
        specs.append(parse_flange(flange_element))

    return specs, edge_to_flange_index


def build_payload(specs: list[FlangeSpec]) -> list[str]:
    rows: list[str] = []
    for spec in specs:
        rows.extend(pack_flange(spec))
    return rows


def ensure_flanges_section(sections: list[Section]) -> int:
    index = section_index(sections, "FLANGES")
    if index >= 0:
        return index

    reducers_index = section_index(sections, "REDUCERS")
    equipmnt_index = section_index(sections, "EQUIPMNT")

    insert_at = (
        reducers_index + 1
        if reducers_index >= 0
        else (equipmnt_index if equipmnt_index >= 0 else len(sections))
    )

    sections.insert(insert_at, Section("FLANGES", "#$ FLANGES", []))
    return insert_at


# Per-element ELEMENTS block layout used by inputxml_to_cii2019.py: 15 lines
# per element. line14 (0-based index 14) holds items 13-15 (reducer, flange,
# equipmnt pointers) as 3 values; flange is slot 1 (0-based).
ELEMENTS_LINES_PER_BLOCK = 15
ELEMENTS_ROW14_LINE_INDEX = 14
FLANGE_POINTER_SLOT = 1


def patch_elements_flange_pointers(sections: list[Section], edge_to_flange_index: dict[int, int]) -> int:
    if not edge_to_flange_index:
        return 0

    index = section_index(sections, "ELEMENTS")
    if index < 0:
        raise ValueError("ELEMENTS section missing")

    rows = sections[index].rows
    patched = 0

    for edge_index, flange_index in edge_to_flange_index.items():
        line_index = edge_index * ELEMENTS_LINES_PER_BLOCK + ELEMENTS_ROW14_LINE_INDEX
        if line_index >= len(rows):
            continue

        tokens = [int(token) for token in rows[line_index].split()]
        if len(tokens) != 3:
            continue

        tokens[FLANGE_POINTER_SLOT] = flange_index
        rows[line_index] = format_ints(tokens)
        patched += 1

    return patched


def render(sections: list[Section]) -> str:
    lines: list[str] = []

    for section in sections:
        lines.append(section.header if section.header.strip() else f"#$ {section.name}")
        lines.extend(section.rows)

    return "\r\n".join(lines).rstrip() + "\r\n"


def sync_flanges(cii_text: str, input_xml: Path) -> tuple[str, list[str]]:
    sections = parse_sections(cii_text)
    if not sections:
        raise ValueError("No CII sections found")

    specs, edge_to_flange_index = parse_flanges(input_xml)
    rows = build_payload(specs)

    sections[ensure_flanges_section(sections)].rows = rows
    patched_pointers = patch_elements_flange_pointers(sections, edge_to_flange_index)

    control = parse_control(sections)

    # CONTROL row1, field 6 (NUMFLG) = flange count.
    control[0][5] = len(specs)

    write_control(sections, control)

    return render(sections), [
        f"xml_flange_specs={len(specs)}",
        f"flange_rows={len(rows)}",
        f"elements_pointers_patched={patched_pointers}",
        "control_flanges_synced",
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync CII 2019 FLANGES from InputXML")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--input-xml", required=True, type=Path)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    text = args.input.read_text(encoding="utf-8-sig", errors="replace")
    fixed, notes = sync_flanges(text, args.input_xml)

    if args.strict and "#$ FLANGES" not in fixed:
        raise ValueError("FLANGES sync failed")

    args.output.write_text(fixed, encoding="utf-8", newline="")

    print("CII2019_FLANGES_SYNC " + ";".join(notes).replace(" ", "_"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
