#!/usr/bin/env python3
"""Independent structure gates for CAESAR II CII v11/v14 conversion.

The version converter must never declare success merely because its own parser can
re-read the generated text.  This module reuses the established CII 2019/v11
section validator for target v11 and applies a small v14 profile containing only
record-count deltas independently established for the neutral-file generations.
"""
from __future__ import annotations

import re
from typing import Mapping, Sequence

import cii2019_section_rules as cii11


V14_AUX_ROWS = dict(cii11.LINES_PER_AUX_BLOCK)
V14_AUX_ROWS.update({
    "ALLOWBLS": 28,
    "SIF&TEES": 14,
    "REDUCERS": 2,
})

# The final four MISCEL_1 records are execution options.  They are not generic
# all-REAL rows: CAESAR reads specific slots with I13.  The second record's
# published prose/format has varied across documentation revisions, so only the
# integer slots confirmed by both the paired native files and the stable option
# meanings are enforced here.  G fields are intentionally not over-constrained.
_MISCEL_EXEC_INTEGER_SLOTS = (
    (1, 2, 3, 4, 6),
    (1, 5, 6),
    (1, 2, 3, 4, 6),
    (1,),
)
_INT_TOKEN_RE = re.compile(r"[+-]?\d+")
_FIELD_WIDTH = 13
_LEADING_X = 2


class CiiStructureError(ValueError):
    """The source or generated neutral file violates its fixed-record envelope."""


def _control_block_counts(control: cii11.ControlCounts) -> dict[str, int]:
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


def _raise_report_errors(report, phase: str) -> None:
    if report.ok:
        return
    messages = [
        f"{issue.code}[{issue.section}]: {issue.message}"
        for issue in report.issues
        if issue.severity == "error"
    ]
    raise CiiStructureError(f"{phase} CII v11 structure validation failed: " + " | ".join(messages))


def _fixed_field(line: str, slot: int, *, phase: str, row: int) -> str:
    if line[:_LEADING_X].strip():
        raise CiiStructureError(
            f"{phase} CII MISCEL_1 execution row {row} violates the 2X fixed-record prefix."
        )
    start = _LEADING_X + (slot - 1) * _FIELD_WIDTH
    end = start + _FIELD_WIDTH
    if len(line) < end:
        raise CiiStructureError(
            f"{phase} CII MISCEL_1 execution row {row} is too short for slot {slot}."
        )
    return line[start:end]


def _validate_miscel_execution_tail(
    sections: Mapping[str, Sequence[str]], *, phase: str
) -> None:
    """Reject execution-option records whose I13 slots were rewritten as REALs.

    The ordinary section-count validator cannot detect ``0`` becoming
    ``0.000000`` because the physical row still has the expected width.  A
    FORTRAN I13 reader can, and CAESAR relies on that mixed I/G record grammar.
    """
    rows = list(sections.get("MISCEL_1", []))
    if len(rows) < 4:
        raise CiiStructureError(
            f"{phase} CII MISCEL_1 has {len(rows)} rows; execution-option tail requires four rows."
        )
    tail = rows[-4:]
    for row_index, integer_slots in enumerate(_MISCEL_EXEC_INTEGER_SLOTS, 1):
        line = tail[row_index - 1]
        for slot in integer_slots:
            token = _fixed_field(line, slot, phase=phase, row=row_index).strip()
            if not token or _INT_TOKEN_RE.fullmatch(token) is None:
                raise CiiStructureError(
                    f"{phase} CII MISCEL_1 execution row {row_index} slot {slot} "
                    f"must be an I13 integer field; found {token!r}."
                )


def validate_v11_text(text: str, *, phase: str) -> None:
    """Validate a v11/2019 file with the repository's independent section rules."""
    _raise_report_errors(cii11.validate_cii2019_sections(text), phase)
    _validate_miscel_execution_tail(cii11.parse_section_map(text), phase=phase)


def _require_v14_sections(
    sections: Mapping[str, Sequence[str]],
    order: Sequence[str],
    *,
    phase: str,
) -> cii11.ControlCounts:
    missing = sorted(cii11.REQUIRED_SECTIONS_2019 - set(order))
    if missing:
        raise CiiStructureError(
            f"{phase} CII v14 is missing required sections: {', '.join(missing)}"
        )
    duplicates = sorted(name for name in set(order) if order.count(name) > 1)
    if duplicates:
        raise CiiStructureError(
            f"{phase} CII v14 has duplicate sections: {', '.join(duplicates)}"
        )

    expected_index = {name: index for index, name in enumerate(cii11.SECTION_ORDER_2019)}
    last = -1
    for name in order:
        if name not in expected_index:
            raise CiiStructureError(f"{phase} CII v14 has unsupported section #$ {name}.")
        index = expected_index[name]
        if index < last:
            raise CiiStructureError(f"{phase} CII v14 section order is invalid at #$ {name}.")
        last = index

    try:
        return cii11.parse_control_counts(sections.get("CONTROL", []))
    except ValueError as exc:
        raise CiiStructureError(f"{phase} CII v14 CONTROL is malformed: {exc}") from exc


def validate_v14_text(text: str, *, phase: str) -> None:
    """Validate the v14 record envelope before attempting a downgrade.

    The section sequence and most block sizes remain aligned with v11.  The
    qualified structural deltas are ALLOWBLS=28 rows, SIF&TEES=14 rows and
    REDUCERS=2 rows per CONTROL block.
    """
    sections = cii11.parse_section_map(text)
    order = cii11.parse_section_order(text)
    control = _require_v14_sections(sections, order, phase=phase)

    expected_elements = control.numelt * cii11.ELEMENT_LINES_PER_BLOCK
    actual_elements = len(sections.get("ELEMENTS", []))
    if actual_elements != expected_elements:
        raise CiiStructureError(
            f"{phase} CII v14 ELEMENTS rows={actual_elements}; "
            f"expected {expected_elements} ({control.numelt} x {cii11.ELEMENT_LINES_PER_BLOCK})."
        )

    for name, rows_per_block in V14_AUX_ROWS.items():
        expected = _control_block_counts(control)[name] * rows_per_block
        actual = len(sections.get(name, []))
        if actual != expected:
            raise CiiStructureError(
                f"{phase} CII v14 #$ {name} rows={actual}; expected {expected} "
                f"({_control_block_counts(control)[name]} x {rows_per_block})."
            )

    units = len(sections.get("UNITS", []))
    if units != cii11.UNITS_TOTAL_LINES:
        raise CiiStructureError(
            f"{phase} CII v14 UNITS rows={units}; expected {cii11.UNITS_TOTAL_LINES}."
        )

    # MISCEL_1 retained its CONTROL-driven minimum contract in the qualified
    # paired profile; reuse the established lower-bound/RRMAT checks here, then
    # validate the fixed mixed-format execution tail independently.
    miscel_report = cii11.validate_miscel_1(sections, control, order)
    _raise_report_errors(miscel_report, f"{phase} v14/MISCEL_1")
    _validate_miscel_execution_tail(sections, phase=phase)

    coords = list(sections.get("COORDS", []))
    if coords:
        try:
            declared = int(round(float(coords[0].strip())))
        except ValueError as exc:
            raise CiiStructureError(f"{phase} CII v14 COORDS count is malformed.") from exc
        if len(coords) != declared + 1:
            raise CiiStructureError(
                f"{phase} CII v14 COORDS declares {declared} nodes but contains {len(coords) - 1} rows."
            )


def validate_text_for_version(text: str, version: int, *, phase: str) -> None:
    if version == 11:
        validate_v11_text(text, phase=phase)
        return
    if version == 14:
        validate_v14_text(text, phase=phase)
        return
    raise CiiStructureError(f"Unsupported CII version {version} for structure validation.")