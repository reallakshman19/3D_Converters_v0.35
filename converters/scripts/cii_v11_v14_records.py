#!/usr/bin/env python3
"""Version-specific record transforms for the CAESAR II CII v11/v14 adapter."""
from __future__ import annotations

import math
from typing import Sequence

from cii_v11_v14_format import (
    Audit, CiiConversionError, ELEMENT_RECORD_LINES, LEGACY_ELEMENT_TEXT_WIDTH,
    LEGACY_RESTRAINT_TEXT_WIDTH, REDUCER_ROWS_V11, REDUCER_ROWS_V14,
    RESTRAINT_RECORD_LINES, SIF_ROWS_V11, SIF_ROWS_V14, Section,
    V14_VERSION_GENERATOR, V14_VERSION_TEXT_WIDTH, _UNITS_SI_MM, _VERSION_LINE,
    _V11_DEFAULT_STIFFNESS, _V11_RIGID_STIFFNESS, _V14_DEFAULT_STIFFNESS,
    _V14_RIGID_STIFFNESS, _extract_numbers, _generic_numeric_convert,
    _render_float_row,
)

# Neutral-file SIF storage is per tee slot, not one flat 10/14-row packet.
# v11: two tee slots x 30 values = 2 x 5 rows.
# v14: two tee slots x 42 values = 2 x 7 rows.
SIF_TEE_ROWS_V11 = 5
SIF_TEE_ROWS_V14 = 7
SIF_TEES_PER_RECORD = 2

# ALLOWBLS expanded from 153 values / 26 rows to 168 values / 28 rows.
ALLOWABLE_ROWS_V11 = 26
ALLOWABLE_ROWS_V14 = 28
ALLOWABLE_VALUES_V11 = 153
ALLOWABLE_VALUES_V14 = 168


def detect_version(sections: Sequence[Section]) -> int:
    version = next((s for s in sections if s.name == "VERSION"), None)
    if version is None or not version.lines:
        raise CiiConversionError("Missing or empty #$ VERSION section.")
    parsed = _extract_numbers(version.lines[0])
    if parsed is None or len(parsed[0]) < 2:
        raise CiiConversionError(f"Cannot parse VERSION record: {version.lines[0]!r}")
    source = int(round(parsed[0][1]))
    if source not in (11, 14):
        raise CiiConversionError(f"Unsupported CII source version {source}; expected 11 or 14.")
    return source


def _convert_version(lines: Sequence[str], target: int) -> list[str]:
    if not lines:
        raise CiiConversionError("VERSION section is empty.")
    converted = [_VERSION_LINE[target]]
    for index, line in enumerate(lines[1:], 1):
        # The final VERSION payload row is version-owned in the qualified pair:
        # v14 carries the neutral-interface generator banner, while the paired
        # legacy profile leaves the row blank.  Do not leak a v14 banner into v11.
        if len(lines) == 61 and index == 60:
            text = V14_VERSION_GENERATOR if target == 14 else ""
        else:
            text = line.rstrip()
        if target == 14:
            converted.append(text.ljust(V14_VERSION_TEXT_WIDTH))
        else:
            converted.append(text if text else "  ")
    return converted


def _compact_length_prefixed_text(line: str) -> str:
    # FORTRAN (7X,I5,1X,A...) retains the 1X separator even for a blank A field.
    # A legacy padded blank row is therefore 12-column prefix + one space.
    prefix = line[:12] if len(line) >= 12 else line.rjust(12)
    remainder = line[12:] if len(line) >= 12 else ""
    if not remainder.strip():
        return prefix + " "
    return line.rstrip()


def _convert_element_text_row(line: str, target: int) -> str:
    if target == 11:
        return line.rstrip().ljust(LEGACY_ELEMENT_TEXT_WIDTH)
    return _compact_length_prefixed_text(line)


def _convert_elements(lines: Sequence[str], target: int) -> list[str]:
    if len(lines) % ELEMENT_RECORD_LINES:
        raise CiiConversionError(
            f"ELEMENTS payload has {len(lines)} rows; expected a multiple of {ELEMENT_RECORD_LINES}."
        )
    out: list[str] = []
    for base in range(0, len(lines), ELEMENT_RECORD_LINES):
        block = list(lines[base:base + ELEMENT_RECORD_LINES])
        # Rows 1-9 are fixed-width REAL records.  Rows 10-11 are string records;
        # rows 12-15 are integer/separator records and remain untouched.
        for index in range(9):
            block[index] = _generic_numeric_convert(block[index], target)
        block[9] = _convert_element_text_row(block[9], target)
        block[10] = _convert_element_text_row(block[10], target)
        out.extend(block)
    return out


def _text_prefix_is_blank(line: str) -> bool:
    prefix = line[:12].strip()
    if not prefix:
        return True
    try:
        return int(float(prefix)) == 0
    except ValueError:
        return False


def _close_to(value: float, expected: float) -> bool:
    return math.isclose(value, expected, rel_tol=5e-8, abs_tol=max(1e-9, abs(expected) * 5e-8))


def _map_restraint_stiffness(
    values1: list[float], values2: list[float], text1: str, text2: str,
    source: int, target: int,
) -> list[float]:
    if len(values1) < 3:
        return values1
    node = values1[0]
    type_code = values1[1]
    stiffness = values1[2]
    empty_slot = (
        abs(node) < 1e-9
        and abs(type_code) < 1e-9
        and all(abs(value) < 1e-9 for value in values2[:3])
        and _text_prefix_is_blank(text1)
        and _text_prefix_is_blank(text2)
    )
    mapped = list(values1)
    if source == 14 and target == 11:
        if empty_slot and abs(stiffness) < 1e-9:
            mapped[2] = _V11_DEFAULT_STIFFNESS
        elif _close_to(stiffness, _V14_DEFAULT_STIFFNESS):
            mapped[2] = _V11_DEFAULT_STIFFNESS
        elif _close_to(stiffness, _V14_RIGID_STIFFNESS):
            mapped[2] = _V11_RIGID_STIFFNESS
    elif source == 11 and target == 14:
        if empty_slot and _close_to(stiffness, _V11_DEFAULT_STIFFNESS):
            mapped[2] = 0.0
        elif _close_to(stiffness, _V11_DEFAULT_STIFFNESS):
            mapped[2] = _V14_DEFAULT_STIFFNESS
        elif _close_to(stiffness, _V11_RIGID_STIFFNESS):
            mapped[2] = _V14_RIGID_STIFFNESS
    return mapped


def _convert_restraint_text_row(line: str, target: int) -> str:
    if target == 11:
        return line.rstrip().ljust(LEGACY_RESTRAINT_TEXT_WIDTH)
    return _compact_length_prefixed_text(line)


def _convert_restraints(lines: Sequence[str], source: int, target: int) -> list[str]:
    if len(lines) % RESTRAINT_RECORD_LINES:
        raise CiiConversionError(
            f"RESTRANT payload has {len(lines)} rows; expected a multiple of {RESTRAINT_RECORD_LINES}."
        )
    out: list[str] = []
    for base in range(0, len(lines), RESTRAINT_RECORD_LINES):
        row1, row2, text1, text2 = lines[base:base + RESTRAINT_RECORD_LINES]
        parsed1 = _extract_numbers(row1)
        parsed2 = _extract_numbers(row2)
        if parsed1 is None or parsed2 is None or len(parsed1[0]) != 6 or len(parsed2[0]) != 3:
            raise CiiConversionError(
                f"Malformed RESTRANT fixed record at payload row {base + 1}."
            )
        values1 = _map_restraint_stiffness(
            list(parsed1[0]), list(parsed2[0]), text1, text2, source, target
        )
        out.append(_render_float_row(values1, target))
        out.append(_render_float_row(parsed2[0], target))
        out.append(_convert_restraint_text_row(text1, target))
        out.append(_convert_restraint_text_row(text2, target))
    return out


def _row_is_all_zero(line: str) -> bool:
    parsed = _extract_numbers(line)
    return parsed is not None and bool(parsed[0]) and all(abs(value) < 1e-12 for value in parsed[0])


def _loss_or_raise(message: str, allow_lossy: bool, audit: Audit) -> None:
    if not allow_lossy:
        raise CiiConversionError(message + " Re-run with --allow-lossy to discard only the unsupported extension data explicitly.")
    audit.loss_events.append(message)


def _convert_sif_tees(
    lines: Sequence[str], source: int, target: int, allow_lossy: bool, audit: Audit
) -> list[str]:
    """Convert two independent tee slots without crossing their record boundary.

    v11 stores 30 values (5 rows) per tee slot.  v14 stores those same leading
    30 values plus 12 B31J-era extension values (2 rows), for 42 values / 7 rows
    per tee slot.  A full auxiliary record always contains two tee slots.
    """
    if not lines:
        return []
    source_rows = SIF_ROWS_V11 if source == 11 else SIF_ROWS_V14
    if len(lines) % source_rows:
        raise CiiConversionError(
            f"SIF&TEES payload has {len(lines)} rows; expected a multiple of {source_rows} for v{source}."
        )

    out: list[str] = []
    for record_index, base in enumerate(range(0, len(lines), source_rows), 1):
        record = list(lines[base:base + source_rows])

        if source == 14 and target == 11:
            tee1 = record[0:SIF_TEE_ROWS_V14]
            tee2 = record[SIF_TEE_ROWS_V14:SIF_TEE_ROWS_V14 * 2]
            extras = tee1[SIF_TEE_ROWS_V11:] + tee2[SIF_TEE_ROWS_V11:]
            if not all(_row_is_all_zero(line) for line in extras):
                _loss_or_raise(
                    (
                        f"SIF&TEES record {record_index} contains non-zero v14-only "
                        "items 31-42 in one or both tee slots; legacy items 1-30 for "
                        "both tee slots are preserved, but v11 has no storage for the extension."
                    ),
                    allow_lossy,
                    audit,
                )
            # Critical ordering: tee-1 legacy rows, then tee-2 legacy rows.
            # Taking record[:10] would mix tee-1 extension rows into tee-2 data.
            record = tee1[:SIF_TEE_ROWS_V11] + tee2[:SIF_TEE_ROWS_V11]

        elif source == 11 and target == 14:
            tee1 = record[0:SIF_TEE_ROWS_V11]
            tee2 = record[SIF_TEE_ROWS_V11:SIF_TEE_ROWS_V11 * 2]
            zero = _render_float_row([0.0] * 6, 14)
            extension = [zero] * (SIF_TEE_ROWS_V14 - SIF_TEE_ROWS_V11)
            # Extensions belong after each independent tee slot, not at EOF.
            record = tee1 + extension + tee2 + extension

        out.extend(_generic_numeric_convert(line, target) for line in record)
    return out


def _parse_numeric_rows(rows: Sequence[str], section: str, record_index: int) -> list[list[float]]:
    parsed_rows: list[list[float]] = []
    for row_index, line in enumerate(rows, 1):
        parsed = _extract_numbers(line)
        if parsed is None or not parsed[0]:
            raise CiiConversionError(
                f"Malformed {section} record {record_index}, row {row_index}: expected numeric fixed record."
            )
        parsed_rows.append(list(parsed[0]))
    return parsed_rows


def _convert_allowables(
    lines: Sequence[str], source: int, target: int, allow_lossy: bool, audit: Audit
) -> list[str]:
    """Map ALLOWBLS 153-value legacy records to/from the 168-value v14 records."""
    if not lines:
        return []
    source_rows = ALLOWABLE_ROWS_V11 if source == 11 else ALLOWABLE_ROWS_V14
    if len(lines) % source_rows:
        raise CiiConversionError(
            f"ALLOWBLS payload has {len(lines)} rows; expected a multiple of {source_rows} for v{source}."
        )

    out: list[str] = []
    for record_index, base in enumerate(range(0, len(lines), source_rows), 1):
        rows = list(lines[base:base + source_rows])
        parsed_rows = _parse_numeric_rows(rows, "ALLOWBLS", record_index)

        if source == 14 and target == 11:
            if any(len(values) != 6 for values in parsed_rows):
                raise CiiConversionError(
                    f"ALLOWBLS v14 record {record_index} must contain 6 values on each of 28 rows."
                )
            values = [value for row in parsed_rows for value in row]
            if len(values) != ALLOWABLE_VALUES_V14:
                raise CiiConversionError(
                    f"ALLOWBLS v14 record {record_index} has {len(values)} values; expected {ALLOWABLE_VALUES_V14}."
                )
            legacy = values[:ALLOWABLE_VALUES_V11]
            extension = values[ALLOWABLE_VALUES_V11:]
            if any(abs(value) >= 1e-12 for value in extension):
                _loss_or_raise(
                    (
                        f"ALLOWBLS record {record_index} contains non-zero v14-only items "
                        f"154-{ALLOWABLE_VALUES_V14}; v11 preserves items 1-{ALLOWABLE_VALUES_V11} only."
                    ),
                    allow_lossy,
                    audit,
                )
            for offset in range(0, ALLOWABLE_VALUES_V11, 6):
                out.append(_render_float_row(legacy[offset:offset + 6], 11))
            continue

        if source == 11 and target == 14:
            # Legacy records contain 25 full rows plus a final row whose first
            # three fields are items 151-153.  Some writers pad the remaining
            # fields with zeros; accept zero padding but never reinterpret it.
            if any(len(values) != 6 for values in parsed_rows[:-1]):
                raise CiiConversionError(
                    f"ALLOWBLS v11 record {record_index} rows 1-25 must contain 6 values each."
                )
            last = parsed_rows[-1]
            if len(last) < 3:
                raise CiiConversionError(
                    f"ALLOWBLS v11 record {record_index} final row must contain at least items 151-153."
                )
            if any(abs(value) >= 1e-12 for value in last[3:]):
                raise CiiConversionError(
                    f"ALLOWBLS v11 record {record_index} has non-zero padding beyond item 153; conversion is ambiguous."
                )
            legacy = [value for row in parsed_rows[:-1] for value in row] + last[:3]
            if len(legacy) != ALLOWABLE_VALUES_V11:
                raise CiiConversionError(
                    f"ALLOWBLS v11 record {record_index} has {len(legacy)} legacy values; expected {ALLOWABLE_VALUES_V11}."
                )
            values = legacy + [0.0] * (ALLOWABLE_VALUES_V14 - ALLOWABLE_VALUES_V11)
            for offset in range(0, ALLOWABLE_VALUES_V14, 6):
                out.append(_render_float_row(values[offset:offset + 6], 14))
            continue

        out.extend(_generic_numeric_convert(line, target) for line in rows)

    return out


def _convert_reducers(
    lines: Sequence[str], source: int, target: int, allow_lossy: bool, audit: Audit
) -> list[str]:
    if not lines:
        return []
    if source == 14:
        if len(lines) % REDUCER_ROWS_V14:
            raise CiiConversionError(
                f"REDUCERS payload has {len(lines)} rows; expected pairs for v14."
            )
        out: list[str] = []
        for record_index, base in enumerate(range(0, len(lines), 2), 1):
            first, extra = lines[base:base + 2]
            if target == 11:
                if not _row_is_all_zero(extra):
                    _loss_or_raise(
                        (
                            f"REDUCERS record {record_index} contains a non-zero v14-only row; "
                            "v11 has no storage for reducer extension items 6-10."
                        ),
                        allow_lossy,
                        audit,
                    )
                out.append(_generic_numeric_convert(first, 11))
            else:
                out.extend([first, extra])
        return out

    # v11: every row is one reducer record.
    out = []
    for line in lines:
        out.append(_generic_numeric_convert(line, target))
        if target == 14:
            parsed = _extract_numbers(line)
            field_count = len(parsed[0]) if parsed is not None else 5
            out.append(_render_float_row([0.0] * field_count, 14))
    return out


def _convert_units(lines: Sequence[str], target: int, audit: Audit) -> list[str]:
    if any("SI (mm)" in line for line in lines):
        return list(_UNITS_SI_MM[target])
    audit.warnings.append(
        "UNITS is not the qualified SI (mm) profile; constants/labels were preserved and only fixed numeric rows were re-rendered."
    )
    return [_generic_numeric_convert(line, target) for line in lines]


def _parse_int_token(token: str, what: str) -> int:
    try:
        value = float(token)
    except ValueError as exc:
        raise CiiConversionError(f"Invalid {what}: {token!r}") from exc
    rounded = int(round(value))
    if abs(value - rounded) > 1e-8:
        raise CiiConversionError(f"Non-integral {what}: {token!r}")
    return rounded


def _convert_coords(lines: Sequence[str], target: int, audit: Audit) -> list[str]:
    if not lines:
        return []
    first = _extract_numbers(lines[0])
    if first is None or len(first[0]) != 1:
        raise CiiConversionError("Malformed COORDS count row.")
    count = _parse_int_token(first[1][0], "COORDS count")
    if len(lines) != count + 1:
        raise CiiConversionError(
            f"COORDS count is {count} but payload contains {len(lines) - 1} coordinate rows."
        )
    out = [f"{count:15d}"]
    max_delta = 0.0
    for row_index, line in enumerate(lines[1:], 1):
        parsed = _extract_numbers(line)
        if parsed is None or len(parsed[0]) != 4:
            raise CiiConversionError(f"Malformed COORDS row {row_index}: {line!r}")
        node = _parse_int_token(parsed[1][0], f"COORDS node at row {row_index}")
        coords = list(parsed[0][1:])
        if target == 11:
            rendered_coords = [f"{value:13.4f}" for value in coords]
        else:
            rendered_coords = [f"{value:13.6E}" for value in coords]
        rendered = f"{node:15d}" + "".join(rendered_coords)
        # Quantization is part of the target fixed format; report a concise maximum.
        reparsed = _extract_numbers(rendered)
        if reparsed is not None:
            for before, after in zip(coords, reparsed[0][1:]):
                max_delta = max(max_delta, abs(before - after))
        out.append(rendered)
    if max_delta > 0.0:
        audit.warnings.append(
            f"COORDS target formatting quantized coordinate values; maximum absolute formatting delta={max_delta:.9g}."
        )
    return out
