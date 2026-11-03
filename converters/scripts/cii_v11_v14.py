#!/usr/bin/env python3
"""Convert CAESAR II neutral files between v11 and v14 fixed-format dialects.

This is an adapter around the formatting conventions used by the immutable
``inputxml_to_cii2019.py`` engine. It does not import or modify that engine.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Sequence

from cii_v11_v14_format import (
    Audit, CiiConversionError, ConversionResult, SECTION_ORDER, Section, _EOL,
    _V11_DEFAULT_STIFFNESS, _extract_numbers, _fmt_v11, _fmt_v14,
    _generic_numeric_convert, _render_float_row, _sha256, parse_sections,
)
from cii_v11_v14_records import (
    _close_to, _convert_coords, _convert_elements,
    _convert_reducers, _convert_restraints, _convert_units,
    _convert_version, _row_is_all_zero, detect_version,
)
from cii_v11_v14_sif import _convert_sif_tees
from cii_v11_v14_validate import CiiStructureError, validate_text_for_version


# ALLOWBLS is a fixed-field array.  The manuals define FORTRAN (2X,6G13.6):
# v11 = 153 logical items on 26 rows; v14 = 168 logical items on 28 rows.
# A blank G13.6 field is still an item position.  Counting regex tokens loses
# that position and shifts every following allowable item, so ALLOWBLS is parsed
# by fixed columns here instead of through the generic numeric token parser.
ALLOWABLE_ROWS_V11 = 26
ALLOWABLE_ROWS_V14 = 28
ALLOWABLE_VALUES_V11 = 153
ALLOWABLE_VALUES_V14 = 168
_ALLOW_LEADING_X = 2
_ALLOW_FIELDS_PER_ROW = 6
_ALLOW_FIELD_WIDTH = 13
_ALLOW_PAYLOAD_WIDTH = _ALLOW_FIELDS_PER_ROW * _ALLOW_FIELD_WIDTH
_ALLOW_ZERO_TOL = 1e-12


def _allow_loss_or_raise(message: str, allow_lossy: bool, audit: Audit) -> None:
    if not allow_lossy:
        raise CiiConversionError(
            message
            + " Re-run with --allow-lossy to discard only unsupported extension data explicitly."
        )
    audit.loss_events.append(message)


def _parse_allowable_g13_6_row(
    line: str,
    *,
    record_index: int,
    row_index: int,
) -> list[float | None]:
    """Parse exactly six logical G13.6 slots while retaining blanks as blanks."""
    if "\t" in line:
        raise CiiConversionError(
            f"ALLOWBLS record {record_index}, row {row_index} contains TAB; fixed-column CII requires spaces."
        )

    prefix = line[:_ALLOW_LEADING_X]
    if prefix.strip():
        raise CiiConversionError(
            f"ALLOWBLS record {record_index}, row {row_index} violates FORTRAN 2X prefix."
        )

    payload = line[_ALLOW_LEADING_X:]
    if len(payload) > _ALLOW_PAYLOAD_WIDTH and payload[_ALLOW_PAYLOAD_WIDTH:].strip():
        raise CiiConversionError(
            f"ALLOWBLS record {record_index}, row {row_index} has nonblank data beyond six G13.6 fields."
        )
    payload = payload[:_ALLOW_PAYLOAD_WIDTH].ljust(_ALLOW_PAYLOAD_WIDTH)

    slots: list[float | None] = []
    for slot_index in range(_ALLOW_FIELDS_PER_ROW):
        start = slot_index * _ALLOW_FIELD_WIDTH
        raw = payload[start:start + _ALLOW_FIELD_WIDTH]
        token = raw.strip()
        if not token:
            slots.append(None)
            continue
        try:
            value = float(token.replace("D", "E").replace("d", "e"))
        except ValueError as exc:
            item_no = (row_index - 1) * _ALLOW_FIELDS_PER_ROW + slot_index + 1
            raise CiiConversionError(
                f"ALLOWBLS record {record_index}, row {row_index}, slot {slot_index + 1} "
                f"(item {item_no}) is not a valid G13.6 real: {token!r}."
            ) from exc
        if not math.isfinite(value):
            item_no = (row_index - 1) * _ALLOW_FIELDS_PER_ROW + slot_index + 1
            raise CiiConversionError(
                f"ALLOWBLS record {record_index}, item {item_no} is non-finite: {token!r}."
            )
        slots.append(value)
    return slots


def _render_allowable_g13_6_row(values: Sequence[float | None], target: int) -> str:
    if not 1 <= len(values) <= _ALLOW_FIELDS_PER_ROW:
        raise CiiConversionError("ALLOWBLS row must contain between 1 and 6 fixed slots.")
    formatter = _fmt_v11 if target == 11 else _fmt_v14
    cells = [" " * _ALLOW_LEADING_X]
    for value in values:
        if value is None:
            cells.append(" " * _ALLOW_FIELD_WIDTH)
            continue
        token = formatter(float(value))
        if len(token) > _ALLOW_FIELD_WIDTH:
            raise CiiConversionError(
                f"ALLOWBLS numeric token {token!r} exceeds G13.6 field width {_ALLOW_FIELD_WIDTH}."
            )
        cells.append(token.rjust(_ALLOW_FIELD_WIDTH))
    return "".join(cells)


def _parse_allowable_record(
    rows: Sequence[str],
    *,
    source: int,
    record_index: int,
) -> tuple[list[float | None], list[int]]:
    expected_rows = ALLOWABLE_ROWS_V11 if source == 11 else ALLOWABLE_ROWS_V14
    if len(rows) != expected_rows:
        raise CiiConversionError(
            f"ALLOWBLS v{source} record {record_index} has {len(rows)} rows; expected {expected_rows}."
        )

    physical: list[float | None] = []
    for row_index, line in enumerate(rows, 1):
        physical.extend(
            _parse_allowable_g13_6_row(
                line,
                record_index=record_index,
                row_index=row_index,
            )
        )

    if source == 14:
        logical = physical
        if len(logical) != ALLOWABLE_VALUES_V14:
            raise CiiConversionError(
                f"ALLOWBLS v14 record {record_index} resolved to {len(logical)} fixed slots; "
                f"expected {ALLOWABLE_VALUES_V14}."
            )
    else:
        # 26 x 6 physical slots exist, but only items 1-153 belong to the legacy
        # ALL array.  Physical slots 154-156 are padding and must be blank/zero.
        logical = physical[:ALLOWABLE_VALUES_V11]
        padding = physical[ALLOWABLE_VALUES_V11:]
        if any(value is not None and abs(value) >= _ALLOW_ZERO_TOL for value in padding):
            raise CiiConversionError(
                f"ALLOWBLS v11 record {record_index} has non-zero physical padding after item 153; "
                "the legacy array mapping is ambiguous."
            )

    blank_items = [index + 1 for index, value in enumerate(logical) if value is None]
    return logical, blank_items


def _render_allowable_record(values: Sequence[float | None], target: int) -> list[str]:
    expected = ALLOWABLE_VALUES_V11 if target == 11 else ALLOWABLE_VALUES_V14
    if len(values) != expected:
        raise CiiConversionError(
            f"Internal ALLOWBLS target mapping has {len(values)} items; expected {expected} for v{target}."
        )
    return [
        _render_allowable_g13_6_row(values[offset:offset + _ALLOW_FIELDS_PER_ROW], target)
        for offset in range(0, len(values), _ALLOW_FIELDS_PER_ROW)
    ]


def _convert_allowables(
    lines: Sequence[str], source: int, target: int, allow_lossy: bool, audit: Audit
) -> list[str]:
    """Map ALLOWBLS by fixed-field item identity rather than numeric token count."""
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
        logical, blank_items = _parse_allowable_record(
            rows,
            source=source,
            record_index=record_index,
        )

        if blank_items:
            preview = ", ".join(str(item) for item in blank_items[:12])
            suffix = "..." if len(blank_items) > 12 else ""
            audit.warnings.append(
                f"ALLOWBLS record {record_index} contains {len(blank_items)} blank fixed field(s) "
                f"at item(s) {preview}{suffix}; positions are preserved and are not re-indexed."
            )

        if source == 14 and target == 11:
            legacy = logical[:ALLOWABLE_VALUES_V11]
            extension = logical[ALLOWABLE_VALUES_V11:ALLOWABLE_VALUES_V14]
            nonzero_extension = [
                index + 154
                for index, value in enumerate(extension)
                if value is not None and abs(value) >= _ALLOW_ZERO_TOL
            ]
            if nonzero_extension:
                preview = ", ".join(str(item) for item in nonzero_extension[:12])
                suffix = "..." if len(nonzero_extension) > 12 else ""
                _allow_loss_or_raise(
                    f"ALLOWBLS record {record_index} contains non-zero v14-only item(s) {preview}{suffix}; "
                    "v11 has storage only for items 1-153.",
                    allow_lossy,
                    audit,
                )
            out.extend(_render_allowable_record(legacy, 11))
            continue

        if source == 11 and target == 14:
            upgraded = list(logical) + [0.0] * (ALLOWABLE_VALUES_V14 - ALLOWABLE_VALUES_V11)
            out.extend(_render_allowable_record(upgraded, 14))
            continue

        out.extend(rows)

    return out


def _convert_miscel_1(lines: Sequence[str]) -> list[str]:
    """Preserve MISCEL_1 fixed records without coercing mixed I13/G13.6 fields.

    MISCEL_1 is not a homogeneous REAL array.  It contains material/nozzle data,
    several mixed-format hanger records, and four execution-option records with
    integer I13 fields interleaved with G13.6 fields.  Passing a mixed row through
    the generic REAL renderer turns valid integer tokens such as ``0`` into
    ``0.000000``.  A fixed-format reader expecting I13 can then reject an otherwise
    correctly sized target file.  The documented v11/v14 physical field widths are
    compatible, so retain this section's source columns exactly and let only the
    enclosing target header/EOL change.
    """
    return list(lines)


def _convert_section(
    section: Section, source: int, target: int, allow_lossy: bool, audit: Audit
) -> list[str]:
    name = section.name
    lines = section.lines
    if name == "VERSION":
        return _convert_version(lines, target)
    if name == "ELEMENTS":
        return _convert_elements(lines, target)
    if name == "RESTRANT":
        return _convert_restraints(lines, source, target)
    if name == "ALLOWBLS":
        return _convert_allowables(lines, source, target, allow_lossy, audit)
    if name == "SIF&TEES":
        return _convert_sif_tees(lines, source, target, allow_lossy, audit)
    if name == "REDUCERS":
        return _convert_reducers(lines, source, target, allow_lossy, audit)
    if name == "MISCEL_1":
        return _convert_miscel_1(lines)
    if name == "UNITS":
        return _convert_units(lines, target, audit)
    if name == "COORDS":
        return _convert_coords(lines, target, audit)
    # CONTROL integer rows, NODENAME strings, and sections whose record shape is
    # unchanged between the qualified profiles are retained; real-valued fixed
    # rows are re-rendered only when their fixed-width shape is unambiguous.
    return [_generic_numeric_convert(line, target) for line in lines]


def _header(name: str, target: int) -> str:
    return f"#$ {name:<8}" if target == 14 else f"#$ {name}"


def _serialize(sections: Sequence[Section], target: int) -> bytes:
    lines: list[str] = []
    for section in sections:
        lines.append(_header(section.name, target))
        lines.extend(section.lines)
    text = _EOL[target].join(lines) + _EOL[target]
    return text.encode("utf-8")


def _validate_section_envelope(sections: Sequence[Section], audit: Audit) -> None:
    names = [section.name for section in sections]
    expected_present = [name for name in SECTION_ORDER if name in names]
    actual_known = [name for name in names if name in SECTION_ORDER]
    if actual_known != expected_present:
        raise CiiConversionError(
            "Known CII sections are out of canonical order; refusing to reorder an ambiguous file."
        )
    unknown = [name for name in names if name not in SECTION_ORDER]
    if unknown:
        audit.warnings.append(
            "Unknown sections were preserved in place without version-specific interpretation: " + ", ".join(unknown)
        )


def _validate_structure(data: bytes, version: int, *, phase: str) -> None:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise CiiConversionError(f"{phase} CII is not valid ASCII/UTF-8 text.") from exc
    try:
        validate_text_for_version(text, version, phase=phase)
    except CiiStructureError as exc:
        raise CiiConversionError(str(exc)) from exc


def convert_bytes(data: bytes, target: int, *, allow_lossy: bool = False) -> ConversionResult:
    if target not in (11, 14):
        raise CiiConversionError("Target version must be 11 or 14.")
    sections = parse_sections(data)
    source = detect_version(sections)
    audit = Audit(
        source_version=source,
        target_version=target,
        source_sha256=_sha256(data),
        source_bytes=len(data),
    )
    _validate_section_envelope(sections, audit)

    # Validate the source against an independent CONTROL-driven record envelope
    # before any conversion.  This prevents a malformed source from becoming a
    # superficially well-formed target through row truncation/reformatting.
    _validate_structure(data, source, phase="source")

    if source == target:
        # A no-op conversion must be byte-preserving; this avoids needless
        # formatting churn when a caller misidentifies an already-target file.
        audit.target_sha256 = audit.source_sha256
        audit.target_bytes = len(data)
        audit.warnings.append(f"Input is already CII v{target}; output copied byte-for-byte.")
        return ConversionResult(data=data, audit=audit)

    converted_sections: list[Section] = []
    for section in sections:
        converted_lines = _convert_section(section, source, target, allow_lossy, audit)
        converted_sections.append(Section(section.name, converted_lines))
        if converted_lines != section.lines or _header(section.name, target) != _header(section.name, source):
            audit.changed_sections.append(section.name)

    output = _serialize(converted_sections, target)

    # P0 import gate: do not hand a generated neutral file to the browser until
    # the independent target-version section rules accept CONTROL counts, block
    # widths, section order, MISCEL_1 minimum payload and UNITS envelope.
    _validate_structure(output, target, phase="generated")

    audit.target_sha256 = _sha256(output)
    audit.target_bytes = len(output)
    return ConversionResult(data=output, audit=audit)


def convert_file(
    input_path: Path, output_path: Path, target: int, *, allow_lossy: bool = False,
    audit_json: Path | None = None,
) -> ConversionResult:
    input_path = Path(input_path)
    output_path = Path(output_path)
    data = input_path.read_bytes()
    result = convert_bytes(data, target, allow_lossy=allow_lossy)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(result.data)
    if audit_json is not None:
        audit_json = Path(audit_json)
        audit_json.parent.mkdir(parents=True, exist_ok=True)
        audit_json.write_text(json.dumps(result.audit.as_dict(), indent=2) + "\n", encoding="utf-8")
    return result


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Convert CAESAR II neutral files between v11 and v14 fixed-format dialects."
    )
    parser.add_argument("input", type=Path, help="Source .CII/.cii neutral file")
    parser.add_argument("output", type=Path, help="Target .CII/.cii neutral file")
    parser.add_argument(
        "--target",
        default="auto",
        choices=("auto", "11", "14"),
        help="Target CAESAR II version. Default: auto-detect source and convert to the opposite version.",
    )
    parser.add_argument(
        "--allow-lossy", action="store_true",
        help=(
            "Explicitly allow discarding version-owned data with no qualified v11 semantic slot "
            "(including Ver14 B31J SIF/TEE fields, reducer items 6-10, or ALLOWBLS items 154-168)."
        ),
    )
    parser.add_argument("--audit-json", type=Path, default=None, help="Optional JSON audit report path")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        if args.target == "auto":
            source_sections = parse_sections(args.input.read_bytes())
            source_version = detect_version(source_sections)
            target_version = 11 if source_version == 14 else 14
        else:
            target_version = int(args.target)
        result = convert_file(
            args.input, args.output, target_version,
            allow_lossy=args.allow_lossy,
            audit_json=args.audit_json,
        )
    except CiiConversionError as exc:
        print(f"ERROR: {exc}")
        return 2
    audit = result.audit
    print(
        f"CII v{audit.source_version} -> v{audit.target_version}: "
        f"{audit.source_bytes} -> {audit.target_bytes} bytes; "
        f"changed sections={len(audit.changed_sections)}, warnings={len(audit.warnings)}, "
        f"loss events={len(audit.loss_events)}"
    )
    for warning in audit.warnings:
        print(f"WARNING: {warning}")
    for loss in audit.loss_events:
        print(f"LOSS: {loss}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())