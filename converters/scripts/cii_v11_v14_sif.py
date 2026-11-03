#!/usr/bin/env python3
"""Semantic SIF&TEES field mapping between legacy CII v11 and CII v14.

CAESAR stores two tee slots in each SIF&TEES auxiliary record.  The generations
are not related by simple row truncation:

* v11: 30 values / 5 rows per tee slot;
* v14: 42 values / 7 rows per tee slot;
* axial and torsional SIF fields exchange positions 15 and 16;
* v14 introduces B31J/surface/geometry fields outside the common legacy set.

This module therefore maps fields by their qualified semantic position rather
than by physical row number.
"""
from __future__ import annotations

from typing import Sequence

from cii_v11_v14_format import Audit, CiiConversionError, _extract_numbers, _render_float_row

SIF_VALUES_V11 = 30
SIF_VALUES_V14 = 42
SIF_ROWS_PER_TEE_V11 = 5
SIF_ROWS_PER_TEE_V14 = 7
TEES_PER_RECORD = 2
SIF_ROWS_PER_RECORD_V11 = SIF_ROWS_PER_TEE_V11 * TEES_PER_RECORD
SIF_ROWS_PER_RECORD_V14 = SIF_ROWS_PER_TEE_V14 * TEES_PER_RECORD

# One-based fields common across the two documented generations.  Fields 15/16
# are common but swap semantic position (torsion/axial vs axial/torsion).
_COMMON_DIRECT_RANGES = ((1, 14), (17, 18), (23, 26))
_V14_SOURCE_ONLY_OR_AMBIGUOUS = tuple(range(19, 23)) + tuple(range(27, 43))
_V11_SOURCE_ONLY_OR_AMBIGUOUS = tuple(range(19, 23)) + tuple(range(27, 31))


def _flatten_tee(rows: Sequence[str], *, expected_rows: int, record: int, tee: int) -> list[float]:
    if len(rows) != expected_rows:
        raise CiiConversionError(
            f"SIF&TEES record {record} tee slot {tee} has {len(rows)} rows; expected {expected_rows}."
        )
    values: list[float] = []
    for row_index, line in enumerate(rows, 1):
        parsed = _extract_numbers(line)
        if parsed is None or len(parsed[0]) != 6:
            raise CiiConversionError(
                f"SIF&TEES record {record} tee slot {tee} row {row_index} must contain 6 numeric fields."
            )
        values.extend(parsed[0])
    return values


def _render_values(values: Sequence[float], version: int) -> list[str]:
    if len(values) % 6:
        raise CiiConversionError("SIF&TEES internal field map did not produce a multiple of six values.")
    return [
        _render_float_row(values[index:index + 6], version)
        for index in range(0, len(values), 6)
    ]


def _nonzero_fields(values: Sequence[float], fields: Sequence[int]) -> list[int]:
    return [field for field in fields if abs(values[field - 1]) >= 1e-12]


def _copy_direct(source: Sequence[float], target: list[float]) -> None:
    for first, last in _COMMON_DIRECT_RANGES:
        for field in range(first, last + 1):
            target[field - 1] = source[field - 1]


def _v14_to_v11_tee(
    source: Sequence[float], *, record: int, tee: int, allow_lossy: bool, audit: Audit
) -> list[float]:
    if len(source) != SIF_VALUES_V14:
        raise CiiConversionError(
            f"SIF&TEES record {record} tee slot {tee} has {len(source)} values; expected {SIF_VALUES_V14}."
        )

    target = [0.0] * SIF_VALUES_V11
    _copy_direct(source, target)

    # Documented semantic ordering differs between generations.
    # legacy item 15 = torsional SIF; v14 item 16 = torsional SIF
    # legacy item 16 = axial SIF;     v14 item 15 = axial SIF
    target[14] = source[15]
    target[15] = source[14]

    unsupported = _nonzero_fields(source, _V14_SOURCE_ONLY_OR_AMBIGUOUS)
    if unsupported:
        compact = ",".join(str(field) for field in unsupported[:12])
        suffix = "..." if len(unsupported) > 12 else ""
        message = (
            f"SIF&TEES record {record} tee slot {tee} contains non-zero Ver14 fields "
            f"without a qualified Ver11 semantic slot (items {compact}{suffix}). "
            "Common SIF/TEE fields are preserved; unsupported B31J/version-owned data is not."
        )
        if not allow_lossy:
            raise CiiConversionError(
                message + " Re-run with --allow-lossy only if this engineering data loss is accepted."
            )
        audit.loss_events.append(message)

    return target


def _v11_to_v14_tee(source: Sequence[float], *, record: int, tee: int) -> list[float]:
    if len(source) != SIF_VALUES_V11:
        raise CiiConversionError(
            f"SIF&TEES record {record} tee slot {tee} has {len(source)} values; expected {SIF_VALUES_V11}."
        )

    ambiguous = _nonzero_fields(source, _V11_SOURCE_ONLY_OR_AMBIGUOUS)
    if ambiguous:
        compact = ",".join(str(field) for field in ambiguous)
        raise CiiConversionError(
            f"SIF&TEES record {record} tee slot {tee} contains non-zero legacy fields "
            f"without a qualified Ver14 semantic mapping (items {compact}); refusing to guess."
        )

    target = [0.0] * SIF_VALUES_V14
    _copy_direct(source, target)

    # Reverse the documented axial/torsional ordering difference.
    target[14] = source[15]  # v14 axial <- legacy axial item 16
    target[15] = source[14]  # v14 torsion <- legacy torsion item 15
    return target


def convert_sif_tees(
    lines: Sequence[str], source: int, target: int, allow_lossy: bool, audit: Audit
) -> list[str]:
    """Convert all SIF&TEES records using two independent semantic tee slots."""
    if not lines:
        return []
    if source not in (11, 14) or target not in (11, 14):
        raise CiiConversionError(f"Unsupported SIF&TEES conversion v{source} -> v{target}.")

    source_rows = SIF_ROWS_PER_RECORD_V11 if source == 11 else SIF_ROWS_PER_RECORD_V14
    if len(lines) % source_rows:
        raise CiiConversionError(
            f"SIF&TEES payload has {len(lines)} rows; expected a multiple of {source_rows} for v{source}."
        )

    if source == target:
        return list(lines)

    output: list[str] = []
    tee_rows = SIF_ROWS_PER_TEE_V11 if source == 11 else SIF_ROWS_PER_TEE_V14
    for record_index, base in enumerate(range(0, len(lines), source_rows), 1):
        record = list(lines[base:base + source_rows])
        for tee_index in range(TEES_PER_RECORD):
            start = tee_index * tee_rows
            source_values = _flatten_tee(
                record[start:start + tee_rows],
                expected_rows=tee_rows,
                record=record_index,
                tee=tee_index + 1,
            )
            if source == 14:
                target_values = _v14_to_v11_tee(
                    source_values,
                    record=record_index,
                    tee=tee_index + 1,
                    allow_lossy=allow_lossy,
                    audit=audit,
                )
            else:
                target_values = _v11_to_v14_tee(
                    source_values,
                    record=record_index,
                    tee=tee_index + 1,
                )
            output.extend(_render_values(target_values, target))
    return output


# Compatibility export used by cii_v11_v14.py and existing test call sites.
_convert_sif_tees = convert_sif_tees
