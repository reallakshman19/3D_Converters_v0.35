#!/usr/bin/env python3
"""NPS / OD / bore / schedule master helpers.

This module intentionally does not convert inch to bore using 25.4. Nominal
pipe size is table-driven: 1 in -> BORE 25 mm and OD 33 mm for the supplied
project master.
"""
from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_NPS_MASTER = REPO_ROOT / "docs" / "Masters" / "NPS_OD_BORE_SCHEDULE_MASTER.tsv"
VALID_FRACTION_DENOMINATORS = {2, 4, 8, 16, 32}


@dataclass(frozen=True)
class NpsRange:
    low: float
    high: float

    def contains(self, value: float) -> bool:
        return self.low <= value <= self.high


def _clean(value: object) -> str:
    return "" if value is None else str(value).strip()


def _to_float(value: object) -> float | None:
    text = _clean(value)
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _parse_fraction_text(text: str) -> float | None:
    compact = text.strip().replace('"', '').replace("in", "").strip()
    compact = compact.replace("–", "-").replace("—", "-")
    compact = re.sub(r"\s+", " ", compact)

    # 1 1/2
    m = re.fullmatch(r"(\d+)\s+(\d+)\s*/\s*(\d+)", compact)
    if m:
        whole, num, den = map(int, m.groups())
        if den in VALID_FRACTION_DENOMINATORS and num < den:
            return float(whole + Fraction(num, den))
        return None

    # 1-1/2 or 1.1/2 as dirty mixed-fraction notation.
    m = re.fullmatch(r"(\d+)[-.](\d+)\s*/\s*(\d+)", compact)
    if m:
        whole, num, den = map(int, m.groups())
        if den in VALID_FRACTION_DENOMINATORS and num < den:
            return float(whole + Fraction(num, den))
        return None

    # 3/4, 1/2. Denominators like 6 are treated as ambiguous, not scalar NPS.
    m = re.fullmatch(r"(\d+)\s*/\s*(\d+)", compact)
    if m:
        num, den = map(int, m.groups())
        if den in VALID_FRACTION_DENOMINATORS and num < den:
            return float(Fraction(num, den))
        return None

    return _to_float(compact)


def parse_nps_scalar(value: object) -> float | None:
    """Parse a scalar NPS value such as 3/4, 1-1/2, 1 1/2, 1.1/2, 0.75."""
    text = _clean(value)
    if not text:
        return None
    # Explicit ranges are not scalar. 1-1/2 is handled by fraction parser first.
    mixed = _parse_fraction_text(text)
    if mixed is not None:
        return mixed
    if re.search(r"\d\s*[-–—]\s*\d", text):
        return None
    return None


def parse_nps_range(value: object, *, slash_range_context: bool = False) -> NpsRange | None:
    """Parse bore range notation such as 4-6, 4\"-6\", 4-6\".

    `4/6\"` is only accepted when slash_range_context=True. Without that
    context, slash notation remains ambiguous because `3/4` is a valid scalar
    fraction.
    """
    text = _clean(value).replace("–", "-").replace("—", "-")
    if not text:
        return None
    text = text.replace('"', '').replace("in", "")
    m = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*", text)
    if not m and slash_range_context:
        m = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)\s*", text)
    if not m:
        return None
    a, b = map(float, m.groups())
    return NpsRange(min(a, b), max(a, b))


def load_nps_master(path: Path = DEFAULT_NPS_MASTER) -> list[dict[str, float | int | None]]:
    rows: list[dict[str, float | int | None]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for raw in reader:
            row: dict[str, float | int | None] = {}
            for key, value in raw.items():
                if key is None:
                    continue
                clean_key = key.strip()
                out_key = {
                    "INCH": "inch",
                    "OD(mm)": "odMm",
                    "BORE": "boreMm",
                    "OD(in)": "odIn",
                }.get(clean_key, f"schedule{clean_key}")
                text = _clean(value)
                if text == "":
                    row[out_key] = None
                else:
                    num = float(text)
                    row[out_key] = int(round(num)) if out_key in {"odMm", "boreMm"} else num
            rows.append(row)
    return rows


def _nearest_row_by_inch(nps: float, rows: Iterable[dict[str, float | int | None]]) -> dict[str, float | int | None] | None:
    for row in rows:
        inch = row.get("inch")
        if isinstance(inch, (int, float)) and abs(float(inch) - nps) <= 1e-9:
            return row
    return None


def resolve_nps(value: object, rows: list[dict[str, float | int | None]] | None = None) -> dict[str, float | int | None] | None:
    nps = parse_nps_scalar(value)
    if nps is None:
        return None
    return _nearest_row_by_inch(nps, rows or load_nps_master())


def resolve_bore_mm(value: object, rows: list[dict[str, float | int | None]] | None = None) -> int | None:
    row = resolve_nps(value, rows)
    bore = row.get("boreMm") if row else None
    return int(bore) if isinstance(bore, (int, float)) else None


def resolve_od_mm(value: object, rows: list[dict[str, float | int | None]] | None = None) -> int | None:
    row = resolve_nps(value, rows)
    od = row.get("odMm") if row else None
    return int(od) if isinstance(od, (int, float)) else None


def resolve_schedule_thickness_mm(value: object, schedule: str, rows: list[dict[str, float | int | None]] | None = None) -> float | None:
    row = resolve_nps(value, rows)
    if not row:
        return None
    key = f"schedule{str(schedule).upper()}"
    result = row.get(key)
    return float(result) if isinstance(result, (int, float)) else None


def range_matches_nps(value: object, nps: float, *, slash_range_context: bool = False) -> bool:
    parsed = parse_nps_range(value, slash_range_context=slash_range_context)
    return parsed.contains(nps) if parsed else False
