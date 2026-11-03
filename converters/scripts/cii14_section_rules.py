#!/usr/bin/env python3
"""CAESAR II Version 14 neutral-file section profile used by the CII merger.

This module is deliberately separate from cii2019_section_rules.py.  The paired
SYS-0001 Ver 11 / Ver 14 benchmark proves that the overall section sequence and
15-line ELEMENT record remain aligned, while at least SIF&TEES and REDUCERS have
changed record widths in Ver 14.  Keeping a distinct profile prevents Ver 14
qualification from weakening the existing Ver 11/CII-2019 contract.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Mapping, Sequence
import re

import cii2019_section_rules as cii11

SECTION_HEADER_RX = re.compile(r"^\s*#\$\s+([A-Z0-9_&]+)\b.*$")

# Proven by the paired v11/v14 benchmark.  The names/order are unchanged there,
# but the profile remains independent so a future Ver 14 delta can be qualified
# without mutating the Ver 11 implementation.
SECTION_ORDER_14: tuple[str, ...] = tuple(cii11.SECTION_ORDER_2019)
REQUIRED_SECTIONS_14: frozenset[str] = frozenset(cii11.REQUIRED_SECTIONS_2019)

LINES_PER_AUX_BLOCK: dict[str, int] = {
    "BEND": 3,
    "RIGID": 1,
    "EXPJT": 1,
    "RESTRANT": 24,
    "DISPLMNT": 20,
    "FORCMNT": 20,
    "UNIFORM": 6,
    "WIND": 1,
    "OFFSETS": 1,
    "ALLOWBLS": 26,
    "SIF&TEES": 14,   # Ver 11 = 10; paired benchmark proves Ver 14 = 14.
    "REDUCERS": 2,    # Ver 11 = 1; paired benchmark proves Ver 14 = 2.
    "FLANGES": 12,
    "EQUIPMNT": 6,
}

ELEMENT_LINES_PER_BLOCK = 15
UNITS_CONSTANT_LINES = 4
UNITS_LABEL_LINES = 24
UNITS_TOTAL_LINES = UNITS_CONSTANT_LINES + UNITS_LABEL_LINES
RRMAT_VALUES_PER_LINE = 6
MISCEL_EXECUTION_OPTION_LINES = 4

ControlCounts = cii11.ControlCounts


@dataclass(frozen=True)
class SectionValidationIssue:
    code: str
    severity: str
    section: str
    message: str
    expected: int | str | None = None
    actual: int | str | None = None


@dataclass
class SectionValidationReport:
    ok: bool = True
    issues: list[SectionValidationIssue] = field(default_factory=list)

    def add(self, code: str, section: str, message: str, *, severity: str = "error",
            expected: int | str | None = None, actual: int | str | None = None) -> None:
        self.issues.append(SectionValidationIssue(code, severity, section, message, expected, actual))
        if severity == "error":
            self.ok = False

    def extend(self, other: "SectionValidationReport") -> None:
        self.issues.extend(other.issues)
        self.ok = self.ok and other.ok

    def to_dict(self) -> dict[str, object]:
        return {"ok": self.ok, "issues": [issue.__dict__.copy() for issue in self.issues]}


def nonblank_rows(rows: Iterable[str]) -> list[str]:
    return [str(row) for row in rows if str(row).strip()]


def aux_block_rows(rows: Iterable[str]) -> list[str]:
    # Preserve blank rows: fixed-width neutral-file blocks can contain them.
    return [str(row) for row in rows]


def ceil_div(value: int, divisor: int) -> int:
    if value < 0 or divisor <= 0:
        raise ValueError(f"Invalid ceil_div({value}, {divisor}).")
    return value // divisor + (1 if value % divisor else 0)


def rrmat_line_count(numelt: int) -> int:
    return ceil_div(numelt, RRMAT_VALUES_PER_LINE)


def parse_section_map(cii_text: str) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for raw in cii_text.splitlines():
        line = raw.rstrip("\r\n")
        match = SECTION_HEADER_RX.match(line.lstrip("\ufeff"))
        if match:
            current = match.group(1)
            sections.setdefault(current, [])
        elif current is not None:
            sections[current].append(line)
    return sections


def parse_section_order(cii_text: str) -> list[str]:
    order: list[str] = []
    for raw in cii_text.splitlines():
        match = SECTION_HEADER_RX.match(raw.rstrip("\r\n").lstrip("\ufeff"))
        if match:
            order.append(match.group(1))
    return order


def parse_control_counts(control_rows: Sequence[str]) -> ControlCounts:
    # CONTROL integer layout is unchanged in the paired Ver 11 / Ver 14 file.
    return cii11.parse_control_counts(control_rows)


def format_control_rows(control: ControlCounts) -> list[str]:
    return cii11.format_control_rows(control)


def version_signature(version_rows: Sequence[str]) -> tuple[int, int, int | None]:
    for row in version_rows:
        numbers: list[int] = []
        for token in row.split():
            try:
                numbers.append(int(round(float(token))))
            except ValueError:
                continue
        if len(numbers) >= 2:
            return numbers[0], numbers[1], numbers[2] if len(numbers) >= 3 else None
    raise ValueError("VERSION signature not found.")


def validate_version(sections: Mapping[str, Sequence[str]]) -> SectionValidationReport:
    report = SectionValidationReport()
    try:
        major, release, _build = version_signature(sections.get("VERSION", []))
    except ValueError as exc:
        report.add("CII14-VERSION-PARSE", "VERSION", str(exc))
        return report
    if (major, release) != (5, 14):
        report.add(
            "CII14-WRONG-VERSION", "VERSION",
            f"Expected CAESAR neutral-file signature 5 / 14, got {major} / {release}.",
            expected="5 14", actual=f"{major} {release}",
        )
    return report


def validate_required_sections(section_order: Sequence[str]) -> SectionValidationReport:
    report = SectionValidationReport()
    for required in sorted(REQUIRED_SECTIONS_14):
        if required not in section_order:
            report.add("CII14-MISSING-SECTION", required, f"Required section #$ {required} is missing.")
    for name in sorted(set(section_order)):
        count = section_order.count(name)
        if count > 1:
            report.add("CII14-DUPLICATE-SECTION", name, f"Section #$ {name} appears {count} times.", expected=1, actual=count)
    return report


def validate_section_order(section_order: Sequence[str]) -> SectionValidationReport:
    report = SectionValidationReport()
    expected_index = {name: index for index, name in enumerate(SECTION_ORDER_14)}
    last_index = -1
    last_name = ""
    for name in section_order:
        if name not in expected_index:
            report.add("CII14-UNKNOWN-SECTION", name, f"Section #$ {name} is not in the qualified Ver 14 order.")
            continue
        index = expected_index[name]
        if index < last_index:
            report.add("CII14-SECTION-ORDER", name, f"Section #$ {name} appears after #$ {last_name}, violating Ver 14 order.")
        else:
            last_index = index
            last_name = name
    return report


def _expected_blocks(control: ControlCounts) -> dict[str, int]:
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
        "REDUCERS": control.nored,
        "FLANGES": control.numflg,
        "EQUIPMNT": control.equipmnt,
    }


def validate_aux_block_rows(sections: Mapping[str, Sequence[str]], control: ControlCounts) -> SectionValidationReport:
    report = SectionValidationReport()
    expected_blocks = _expected_blocks(control)
    for section, width in LINES_PER_AUX_BLOCK.items():
        rows = aux_block_rows(sections.get(section, []))
        expected = expected_blocks[section] * width
        if len(rows) != expected:
            report.add(
                "CII14-AUX-ROW-COUNT", section,
                f"#$ {section} has {len(rows)} payload rows; expected {expected} ({expected_blocks[section]} blocks x {width} rows).",
                expected=expected, actual=len(rows),
            )
    return report


def validate_elements_rows(sections: Mapping[str, Sequence[str]], control: ControlCounts) -> SectionValidationReport:
    report = SectionValidationReport()
    rows = nonblank_rows(sections.get("ELEMENTS", []))
    expected = control.numelt * ELEMENT_LINES_PER_BLOCK
    if len(rows) != expected:
        report.add("CII14-ELEMENTS-ROW-COUNT", "ELEMENTS",
                   f"#$ ELEMENTS has {len(rows)} rows; expected {expected} ({control.numelt} x {ELEMENT_LINES_PER_BLOCK}).",
                   expected=expected, actual=len(rows))
    return report


def validate_units(sections: Mapping[str, Sequence[str]]) -> SectionValidationReport:
    report = SectionValidationReport()
    rows = list(sections.get("UNITS", []))
    if len(rows) != UNITS_TOTAL_LINES:
        report.add("CII14-UNITS-ROW-COUNT", "UNITS",
                   f"#$ UNITS has {len(rows)} rows; expected {UNITS_TOTAL_LINES}.",
                   expected=UNITS_TOTAL_LINES, actual=len(rows))
    return report


def validate_miscel_1(sections: Mapping[str, Sequence[str]], control: ControlCounts) -> SectionValidationReport:
    report = SectionValidationReport()
    rows = nonblank_rows(sections.get("MISCEL_1", []))
    minimum = rrmat_line_count(control.numelt) + MISCEL_EXECUTION_OPTION_LINES
    if len(rows) < minimum:
        report.add("CII14-MISCEL1-MIN-ROW-COUNT", "MISCEL_1",
                   f"#$ MISCEL_1 has {len(rows)} nonblank rows; expected at least {minimum} for RRMAT plus execution options.",
                   expected=f">= {minimum}", actual=len(rows))
    return report


def validate_control_against_sections(sections: Mapping[str, Sequence[str]], control: ControlCounts,
                                      section_order: Sequence[str] | None = None) -> SectionValidationReport:
    report = SectionValidationReport()
    report.extend(validate_elements_rows(sections, control))
    report.extend(validate_aux_block_rows(sections, control))
    report.extend(validate_miscel_1(sections, control))
    report.extend(validate_units(sections))
    return report


def validate_cii14_sections(cii_text: str) -> SectionValidationReport:
    sections = parse_section_map(cii_text)
    order = parse_section_order(cii_text)
    report = SectionValidationReport()
    report.extend(validate_required_sections(order))
    report.extend(validate_section_order(order))
    report.extend(validate_version(sections))
    if "CONTROL" not in sections:
        return report
    try:
        control = parse_control_counts(sections["CONTROL"])
    except ValueError as exc:
        report.add("CII14-CONTROL-PARSE", "CONTROL", str(exc))
        return report
    report.extend(validate_control_against_sections(sections, control, order))
    return report


def assert_cii14_sections_valid(cii_text: str) -> None:
    report = validate_cii14_sections(cii_text)
    if report.ok:
        return
    messages = [f"{issue.code} [{issue.section}]: {issue.message}" for issue in report.issues if issue.severity == "error"]
    raise ValueError("CII Ver 14 section validation failed:\n" + "\n".join(messages))
