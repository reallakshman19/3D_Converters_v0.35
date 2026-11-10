"""Read-only complete CAESAR II 2019 ELEMENT auxiliary pointer validation.

15 IEL fields: rows 13/14/15 (0-based block rows 12/13/14).
Separate from the production writer and its six-slot projection reparser.
"""
from __future__ import annotations

import math

from .snapshot_replay import Hold, require, parse_section_map, parse_control_counts, parse_cii2019
from cii2019_section_rules import LINES_PER_AUX_BLOCK

# (physical ELEMENT block row, numeric field ordinal, CONTROL counter field)
POINTER_FIELDS = {
    "BEND": (12, 0, "bends"),
    "RIGID": (12, 1, "rigids"),
    "EXPJT": (12, 2, "expjts"),
    "RESTRANT": (12, 3, "restraints"),
    "DISPLMNT": (12, 4, "displmnt"),
    "FORCMNT": (12, 5, "forcmnt"),
    "UNIFORM": (13, 0, "uniform"),
    "WIND": (13, 1, "wind"),
    "OFFSETS": (13, 2, "offsets"),
    "ALLOWBLS": (13, 3, "allowbls"),
    "SIF&TEES": (13, 4, "sif_tees"),
    "NODENAME": (13, 5, "nonam"),
    "REDUCERS": (14, 0, "nored"),
    "FLANGES": (14, 1, "numflg"),
    "EQUIPMNT": (14, 2, "equipmnt"),
}

def _integer_fields(row: str, count: int, label: str) -> list[int]:
    tokens = row.split()
    require(len(tokens) == count, "HOLD_CII_INVALID",
            f"{label}: expected {count} pointer values, got {len(tokens)}")
    values = []
    for token in tokens:
        try:
            number = float(token)
        except ValueError as exc:
            raise Hold("HOLD_CII_INVALID", f"{label}: bad pointer {token!r}") from exc
        require(math.isfinite(number) and number >= 0 and number.is_integer(),
                "HOLD_CII_INVALID", f"{label}: noninteger, negative or nonfinite {token!r}")
        values.append(int(number))
    return values


def validate_all_element_pointers(contents: bytes) -> dict:
    """Validate all 15 pointer fields against actual section AND CONTROL sizes.

    A declared CONTROL count does not authorize a missing physical aux record.
    FLANGES includes one real blank row in its 12-row payload: do not strip it.
    """
    try:
        cii = contents.decode("utf-8")
        sections = parse_section_map(cii)
        control = parse_control_counts(sections["CONTROL"])
        raw_elements = sections["ELEMENTS"]
        require(len(raw_elements) % 15 == 0, "HOLD_CII_INVALID", "Incomplete ELEMENT payload")
        expected = len(raw_elements) // 15
        require(control.numelt == expected, "HOLD_CII_INVALID", "CONTROL ELEMENT count mismatch")
        actual_counts = {}
        for section, (_, _, counter) in POINTER_FIELDS.items():
            rows = sections.get(section, [])
            width = 1 if section == "NODENAME" else LINES_PER_AUX_BLOCK[section]
            require(len(rows) % width == 0, "HOLD_CII_INVALID",
                    f"{section}: invalid record width {width}")
            physical = len(rows) // width
            declared = getattr(control, counter)
            require(declared >= 0 and physical == declared, "HOLD_CII_INVALID",
                    f"{section}: CONTROL declares {declared}, actual {physical}")
            actual_counts[section] = physical
        records = []
        for i in range(expected):
            block = raw_elements[15*i:15*(i+1)]
            parsed = {
                12: _integer_fields(block[12], 6, f"ELEMENT {i+1} IEL row 13"),
                13: _integer_fields(block[13], 6, f"ELEMENT {i+1} IEL row 14"),
                14: _integer_fields(block[14], 3, f"ELEMENT {i+1} IEL row 15"),
            }
            record = {}
            for section, (row, slot, _) in POINTER_FIELDS.items():
                pointer = parsed[row][slot]
                require(pointer <= actual_counts[section], "HOLD_CII_INVALID",
                        f"ELEMENT {i+1}: {section} pointer {pointer} exceeds {actual_counts[section]}")
                record[section] = pointer
            records.append(record)
        # Assert independent legacy parser and this 15-field parser agree
        # on every originally supported slot.
        legacy = parse_cii2019(cii)["elements"]
        require(len(legacy) == len(records), "HOLD_CII_INVALID", "Independent reparse length mismatch")
        for i, original in enumerate(legacy):
            for section, old_value in original["pointers"].items():
                require(records[i][section] == old_value, "HOLD_CII_INVALID",
                        f"ELEMENT {i+1} independent {section} pointer disagrees")
        return {"allPointersValid": True, "pointerFieldsValidated": len(POINTER_FIELDS),
                "recordCounts": actual_counts, "elementPointers": records}
    except Hold:
        raise
    except (ValueError, KeyError, IndexError, UnicodeError, TypeError) as exc:
        raise Hold("HOLD_CII_INVALID", f"Full auxiliary pointer validation failed: {exc}") from exc
