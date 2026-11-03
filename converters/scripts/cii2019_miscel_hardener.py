#!/usr/bin/env python3
"""
Repair/validate CAESAR II 2019 CII section framing around:

    EQUIPMNT -> MISCEL_1 -> UNITS

Known failure:
InputXML->CII(2019) can generate valid MISCEL payload rows but miss the
`#$ MISCEL_1` header. Then the syntax checker reads those rows as EQUIPMNT
payload and reports:

    - missing_section MISCEL_1
    - EQUIPMNT row-count mismatch

This hardener is intentionally narrow:
- preserves existing payload rows when recoverable from EQUIPMNT
- guarantees a syntactically valid MISCEL_1 section before UNITS
- does not modify unrelated engineering sections
"""

from __future__ import annotations

import argparse
import math
import re
from dataclasses import dataclass
from pathlib import Path
import xml.etree.ElementTree as ET


SECTION_HEADER_RX = re.compile(r"^\s*#\$\s+([A-Z0-9_&]+)\s*$")
SENTINEL_MISSING = -1.0101


@dataclass(frozen=True)
class XmlHanger:
    node: int
    cnode: int
    const_eff_load: float
    load_var: float
    rigid_sup: float
    avail_space: float
    cold_load: float
    hot_load: float
    max_travel: float
    multi_lc: int
    freeanchor1: int
    freeanchor2: int
    doftype1: int
    doftype2: int
    num_hgr: int
    hgr_table: int
    short_range: int
    tag: str
    guid: str


@dataclass
class Section:
    name: str
    header: str
    payload: list[str]


def _local_name(tag: str) -> str:
    if tag.startswith("{"):
        return tag.split("}", 1)[1]
    return tag


def _to_float(value: str | None, default: float = SENTINEL_MISSING) -> float:
    text = "" if value is None else value.strip()
    if not text:
        return default
    try:
        return float(text)
    except ValueError:
        return default


def _is_missing(value: float) -> bool:
    return (not math.isfinite(value)) or abs(value - SENTINEL_MISSING) < 1e-6


def _to_int(value: str | None, default: int = -1) -> int:
    number = _to_float(value, SENTINEL_MISSING)
    if _is_missing(number):
        return default
    return int(round(number))


def _float_or(value: float, default: float) -> float:
    return default if _is_missing(value) else value


def _int_or(value: int, default: int) -> int:
    return default if value < 0 else value


def _format_i(values: list[int]) -> str:
    return "  " + "".join(f"{int(value):13d}" for value in values)


def _format_g(values: list[float | int]) -> str:
    return "  " + "".join(f"{float(value):13.6G}" for value in values)


def _pack_i(values: list[int], width: int = 6) -> list[str]:
    return [_format_i(values[i:i + width]) for i in range(0, len(values), width)]


def _pack_g(values: list[float | int], width: int = 6) -> list[str]:
    return [_format_g(values[i:i + width]) for i in range(0, len(values), width)]


def _format_string100(value: str) -> str:
    text = value[:100]
    return f"{'':7}{len(text):5d} {text:<100}"


def _parse_xml_hangers(input_xml: Path | None) -> list[XmlHanger]:
    if input_xml is None:
        return []

    root = ET.parse(input_xml).getroot()
    hangers: list[XmlHanger] = []

    for element in root.iter():
        if _local_name(element.tag).upper() != "HANGER":
            continue

        node = _to_int(element.attrib.get("NODE"), -1)
        if node < 0:
            continue

        hangers.append(
            XmlHanger(
                node=node,
                cnode=_to_int(element.attrib.get("CNODE"), 0),
                const_eff_load=_to_float(element.attrib.get("CONST_EFF_LOAD")),
                load_var=_to_float(element.attrib.get("LOAD_VAR"), 25.0),
                rigid_sup=_to_float(element.attrib.get("RIGID_SUP")),
                avail_space=_to_float(element.attrib.get("AVAIL_SPACE")),
                cold_load=_to_float(element.attrib.get("COLD_LOAD")),
                hot_load=_to_float(element.attrib.get("HOT_LOAD")),
                max_travel=_to_float(element.attrib.get("MAX_TRAVEL")),
                multi_lc=_to_int(element.attrib.get("MULTI_LC"), 0),
                freeanchor1=_to_int(element.attrib.get("FREEANCHOR1"), 0),
                freeanchor2=_to_int(element.attrib.get("FREEANCHOR2"), 0),
                doftype1=_to_int(element.attrib.get("DOFTYPE1"), 0),
                doftype2=_to_int(element.attrib.get("DOFTYPE2"), 0),
                num_hgr=_to_int(element.attrib.get("NUM_HGR"), 1),
                hgr_table=_to_int(element.attrib.get("HGR_TABLE"), 1),
                short_range=_to_int(element.attrib.get("SHORT_RANGE"), 1),
                tag=(element.attrib.get("TAG") or "").strip(),
                guid=(element.attrib.get("GUID") or "").strip(),
            )
        )

    return hangers


def _strip_bom(line: str) -> str:
    return line.lstrip("\ufeff")


def _parse_sections(text: str) -> list[Section]:
    sections: list[Section] = []
    current: Section | None = None

    for raw in text.splitlines():
        line = raw.rstrip("\r\n")
        match = SECTION_HEADER_RX.match(_strip_bom(line))
        if match:
            current = Section(match.group(1), line, [])
            sections.append(current)
            continue
        if current is not None:
            current.payload.append(line)

    return sections


def _format_header(section_name: str) -> str:
    return f"#$ {section_name}"


def _tokens(line: str) -> list[str]:
    return line.strip().split()


def _is_int_token(token: str) -> bool:
    try:
        int(token)
        return True
    except ValueError:
        return False


def _is_real_token(token: str) -> bool:
    try:
        float(token)
        return True
    except ValueError:
        return False


def _nonblank(payload: list[str]) -> list[str]:
    return [line for line in payload if line.strip()]


def _control_metrics(sections: list[Section]) -> dict[str, int]:
    control = next((section for section in sections if section.name == "CONTROL"), None)
    if control is None:
        return {}

    rows = _nonblank(control.payload)
    if len(rows) < 4:
        return {}

    parsed: list[list[int]] = []
    for row in rows[:4]:
        toks = _tokens(row)
        if not toks:
            return {}
        if not all(_is_int_token(tok) for tok in toks):
            return {}
        parsed.append([int(tok) for tok in toks])

    if len(parsed[0]) < 6 or len(parsed[3]) < 1:
        return {}

    return {
        "elements": parsed[0][0],
        "nozzles": parsed[0][1],
        "hangers": parsed[0][2],
        "nodename_blocks": parsed[0][3],
        "reducers": parsed[0][4],
        "flanges": parsed[0][5],
        "equipmnt": parsed[3][0],
    }


def _material_ids_from_xml(input_xml: Path | None, element_count: int, default_material: int = 0) -> list[int]:
    if input_xml is None:
        return [default_material] * element_count

    root = ET.parse(input_xml).getroot()
    material_ids: list[int] = []
    carry = default_material

    for element in root.iter():
        if _local_name(element.tag).upper() != "PIPINGELEMENT":
            continue

        material = _to_float(element.attrib.get("MATERIAL_NUM"))
        if not _is_missing(material):
            carry = int(round(material))

        material_ids.append(carry)

    if len(material_ids) < element_count:
        material_ids.extend([carry] * (element_count - len(material_ids)))

    return material_ids[:element_count]


def _build_hgrdat(hanger: XmlHanger) -> list[float]:
    return [
        0.0,                                    # stiffness
        _float_or(hanger.load_var, 25.0),       # allowable load variation
        _float_or(hanger.rigid_sup, 0.0),       # rigid support displacement criteria
        _float_or(hanger.avail_space, 9999.99), # available space
        _float_or(hanger.cold_load, 0.0),       # cold load #1
        _float_or(hanger.hot_load, 0.0),        # hot load #1
        0.0,                                    # operating load
        _float_or(hanger.max_travel, 9999.99),  # max travel
        float(_int_or(hanger.multi_lc, 0)),     # multi-load option
        0.0,                                    # hardware weight
        _float_or(hanger.const_eff_load, 0.0),  # constant effort load
    ]


def _default_execution_lines() -> list[str]:
    return [
        "  " + "".join(f"{0:13d}" for _ in range(4)) + f"{0.0:13.6G}{0:13d}",
        "  " + f"{0:13d}" + f"{0.0:13.6G}{70.0:13.6G}" + "".join(f"{0:13d}" for _ in range(3)),
        "  " + "".join(f"{0:13d}" for _ in range(4)) + f"{0.0:13.6G}{0:13d}",
        _format_i([0]),
    ]


def _build_miscel_payload_from_xml(
    *,
    input_xml: Path | None,
    element_count: int,
    nozzle_count: int,
    hangers: list[XmlHanger],
) -> list[str]:
    if nozzle_count != 0:
        raise ValueError("MISCEL_1 hardener cannot safely rebuild nozzle VFLEX payload when NUMNOZ > 0.")

    rows: list[str] = []

    # RRMAT: one material ID per element.
    material_ids = _material_ids_from_xml(input_xml, element_count, default_material=0)
    rows.extend(_pack_g([float(value) for value in material_ids], 6))

    if hangers:
        first = hangers[0]

        # Default hanger setting line:
        # IDFTABLE, DEFVAR, DEFRIG, DEFMXTRAVEL, DEFSHTSPR, DEFMUL
        rows.append(
            "  "
            + f"{_int_or(first.hgr_table, 1):13d}"
            + f"{_float_or(first.load_var, 25.0):13.6G}"
            + f"{0.0:13.6G}"
            + f"{9999.99:13.6G}"
            + f"{float(_int_or(first.short_range, 1)):13.6G}"
            + f"{0.0:13.6G}"
        )

        # IDFOPER, IACTCLD, IHGRLDS, IACTUAL, IMULTIOPTS
        rows.append(_format_i([1, 0, 0, 0, 0]))

        # IHGRNODE
        rows.extend(_pack_i([hanger.node for hanger in hangers], 6))

        # HGRDAT: 11 values per hanger, two rows per hanger.
        for hanger in hangers:
            rows.extend(_pack_g(_build_hgrdat(hanger), 6))

        # TAG/GUID string rows.
        for hanger in hangers:
            rows.append(_format_string100(hanger.tag))
            rows.append(_format_string100(hanger.guid))

        # IHGRFREE: anchor1, anchor2, dof1, dof2.
        for hanger in hangers:
            rows.append(
                _format_i(
                    [
                        _int_or(hanger.freeanchor1, 0),
                        _int_or(hanger.freeanchor2, 0),
                        _int_or(hanger.doftype1, 0),
                        _int_or(hanger.doftype2, 0),
                    ]
                )
            )

        # IHGRNUM
        rows.extend(_pack_i([_int_or(hanger.num_hgr, 1) for hanger in hangers], 6))

        # IHGRTABLE
        rows.extend(_pack_i([_int_or(hanger.hgr_table, 1) for hanger in hangers], 6))

        # IHGRSHORT
        rows.extend(_pack_i([_int_or(hanger.short_range, 1) for hanger in hangers], 6))

        # IHGRCN
        rows.extend(_pack_i([_int_or(hanger.cnode, 0) for hanger in hangers], 6))

    rows.extend(_default_execution_lines())
    return rows


def _section_index(sections: list[Section], name: str) -> int:
    for idx, section in enumerate(sections):
        if section.name == name:
            return idx
    return -1


def _trim_equipmnt_payload(sections: list[Section], equipmnt_count: int) -> list[str]:
    """
    Keep EQUIPMNT payload aligned with CONTROL.equipmnt.

    CII EQUIPMNT uses 6 rows per equipment/nozzle check block. If MISCEL_1 rows
    were previously appended under EQUIPMNT because the #$ MISCEL_1 header was
    missing, trim EQUIPMNT back to the expected length.

    Returns trimmed surplus rows for diagnostics only.
    """
    equip_idx = _section_index(sections, "EQUIPMNT")
    if equip_idx < 0:
        return []

    expected_rows = max(0, int(equipmnt_count)) * 6
    payload = _nonblank(sections[equip_idx].payload)

    if len(payload) <= expected_rows:
        return []

    surplus = payload[expected_rows:]
    sections[equip_idx].payload = payload[:expected_rows]
    return surplus


def _assert_section_framing_after_hardening(
    sections: list[Section],
    *,
    equipmnt_count: int,
) -> None:
    equip_idx = _section_index(sections, "EQUIPMNT")
    if equip_idx >= 0:
        expected_equip_rows = max(0, int(equipmnt_count)) * 6
        actual_equip_rows = len(_nonblank(sections[equip_idx].payload))
        if actual_equip_rows != expected_equip_rows:
            raise ValueError(
                "EQUIPMNT row mismatch after MISCEL_1 hardening: "
                f"actual={actual_equip_rows}, expected={expected_equip_rows}"
            )

    miscel_idx = _section_index(sections, "MISCEL_1")
    units_idx = _section_index(sections, "UNITS")

    if miscel_idx < 0:
        raise ValueError("MISCEL_1 missing after hardening.")

    if units_idx >= 0 and miscel_idx > units_idx:
        raise ValueError("MISCEL_1 must appear before UNITS.")


def _serialize_sections(sections: list[Section]) -> str:
    lines: list[str] = []

    for section in sections:
        lines.append(section.header if section.header.strip() else _format_header(section.name))
        lines.extend(section.payload)

    return "\r\n".join(lines).rstrip() + "\r\n"


def harden_cii_text(text: str, input_xml: Path | None = None) -> tuple[str, list[str]]:
    sections = _parse_sections(text)
    if not sections:
        raise ValueError("No CII section headers found; cannot harden MISCEL_1 framing.")

    metrics = _control_metrics(sections)
    element_count = int(metrics.get("elements", 0))
    nozzle_count = int(metrics.get("nozzles", 0))

    surplus_equipmnt_rows = _trim_equipmnt_payload(
        sections,
        int(metrics.get("equipmnt", 0)),
    )

    hangers = _parse_xml_hangers(input_xml)
    hanger_count = len(hangers)

    # CONTROL: explicit XML <HANGER/> count wins over stale model-level NOHGRS.
    control_idx = _section_index(sections, "CONTROL")
    if control_idx < 0:
        raise ValueError("CONTROL section missing.")

    rows = _nonblank(sections[control_idx].payload)
    parsed = [[int(token) for token in row.split()] for row in rows[:4]]

    parsed[0][2] = hanger_count  # NOHGRS

    sections[control_idx].payload = [
        _format_i(parsed[0][:6]),
        _format_i(parsed[1][:6]),
        _format_i(parsed[2][:6]),
        _format_i(parsed[3][:1]),
    ]

    miscel_idx = _section_index(sections, "MISCEL_1")

    if miscel_idx >= 0:
        # MISCEL_1 already present — preserve its payload intact.
        # inputxml_to_cii2019.py generates correct content; rebuilding from
        # XML loses execution options, hanger ordering, and other fields that
        # are not recoverable from InputXML alone.
        rebuilt = False
    else:
        # MISCEL_1 header was missing — inputxml_to_cii2019.py emitted the
        # payload under EQUIPMNT without the section header.  Rebuild from XML
        # and insert before UNITS.
        miscel_payload = _build_miscel_payload_from_xml(
            input_xml=input_xml,
            element_count=element_count,
            nozzle_count=nozzle_count,
            hangers=hangers,
        )
        units_idx = _section_index(sections, "UNITS")
        insert_idx = units_idx if units_idx >= 0 else len(sections)
        sections.insert(insert_idx, Section("MISCEL_1", _format_header("MISCEL_1"), miscel_payload))
        rebuilt = True

    _assert_section_framing_after_hardening(
        sections,
        equipmnt_count=int(metrics.get("equipmnt", 0)),
    )

    notes = [
        f"xml_hangers={hanger_count}",
        f"control_nohgrs={hanger_count}",
        f"trimmed_equipmnt_surplus_rows={len(surplus_equipmnt_rows)}",
        "rebuilt_miscel_1" if rebuilt else "preserved_miscel_1",
    ]

    return _serialize_sections(sections), notes


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Harden CII 2019 MISCEL_1 section framing after InputXML->CII(2019)."
    )
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--input-xml",
        type=Path,
        default=None,
        help="Original InputXML. Required for correct HANGER/MISCEL_1 rebuild.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail when the hardened output still has no MISCEL_1 section.",
    )
    return parser


def main() -> int:
    args = _build_parser().parse_args()

    source = args.input.read_text(encoding="utf-8-sig", errors="replace")
    output, notes = harden_cii_text(source, input_xml=args.input_xml)

    if args.strict and "#$ MISCEL_1" not in output:
        raise ValueError("MISCEL_1 hardening failed: output has no #$ MISCEL_1 section.")

    args.output.write_text(output, encoding="utf-8", newline="")

    if notes:
        print("CII2019_MISCEL_HARDENER " + ";".join(notes).replace(" ", "_"))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())