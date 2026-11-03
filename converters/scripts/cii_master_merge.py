#!/usr/bin/env python3
"""Tiny CII <- sidecar merger (standalone, dependency-free).

Reads a CII (2019) file and a CA-injection sidecar produced by
xml_to_cii2019_master_addon.py (build_ca_sidecar) and writes an enriched CII:

  * CA4 (wall thickness)   -> element wall-thickness field   (#$ ELEMENTS line2, col 1)
  * CA7 (corrosion)        -> element corrosion-allowance     (#$ ELEMENTS line2, col 3)

Injection is a column-preserving splice into the fixed-width ELEMENTS records,
so the rest of the file is byte-identical. Elements are located by node number
(the sidecar's by_node map; node numbers match the CII because xml_to_cii2019
preserves them from the XML).

CA3 (material code) is NOT injected: CII material is a numeric material-table
index, not a free field; the code is left in the sidecar for the host to map.

Portable: stdlib only; no imports of xml_to_cii2019.py. Copy alongside it.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ELEMENT_RECORD_LINES = 15      # fixed CII 2019 element record length
ROW_FIELD_WIDTHS = [15, 13, 13, 13, 13, 13]  # _row(): first 15, rest 13


def _fmt_auto(value: float) -> str:
    """Mirror xml_to_cii2019._format_auto_float so injected values match style."""
    a = abs(value)
    if a < 1e-12:
        return "0.000000"
    if a >= 1e9 or a < 0.1:
        return f"{value:.6E}"
    return f"{value:#.6G}"


def _field_span(index: int):
    start = sum(ROW_FIELD_WIDTHS[:index])
    return start, start + ROW_FIELD_WIDTHS[index]


def _read_field(line: str, index: int) -> str:
    s, e = _field_span(index)
    return line[s:e]


def _splice_field(line: str, index: int, value: float) -> str:
    s, e = _field_span(index)
    width = e - s
    cell = f"{_fmt_auto(value):>{width}}"
    # Pad the source line if it is short, then splice.
    if len(line) < e:
        line = line + " " * (e - len(line))
    return line[:s] + cell[:width] + line[e:]


def _to_num(text: str):
    m = re.search(r"-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?", text or "")
    return float(m.group()) if m else None


def merge(cii_text: str, sidecar: dict, key: str = "to") -> tuple[str, dict]:
    by_node = sidecar.get("by_node", {}) or {}
    lines = cii_text.split("\n")

    # Locate the ELEMENTS data range: from after '#$ ELEMENTS' to the next '#$'.
    start = end = None
    for i, ln in enumerate(lines):
        if ln.startswith("#$ ELEMENTS"):
            start = i + 1
        elif start is not None and ln.startswith("#$ "):
            end = i
            break
    if start is None:
        return cii_text, {"elements": 0, "wall": 0, "corrosion": 0, "matched": 0}
    if end is None:
        end = len(lines)

    n = (end - start) // ELEMENT_RECORD_LINES
    stats = {"elements": n, "wall": 0, "corrosion": 0, "matched": 0}

    for k in range(n):
        base = start + k * ELEMENT_RECORD_LINES
        line1 = lines[base]
        from_n = _to_num(_read_field(line1, 0))
        to_n = _to_num(_read_field(line1, 1))
        node = to_n if key == "to" else from_n
        if node is None:
            continue
        rec = by_node.get(str(int(round(node))))
        if rec is None:
            # fall back to the other endpoint
            other = from_n if key == "to" else to_n
            rec = by_node.get(str(int(round(other)))) if other is not None else None
        if rec is None:
            continue
        stats["matched"] += 1
        line2 = lines[base + 1]
        ca4, ca7 = rec.get("CA4"), rec.get("CA7")
        wall = _to_num(str(ca4)) if ca4 not in (None, "") else None
        corr = _to_num(str(ca7)) if ca7 not in (None, "") else None
        if wall is not None:
            line2 = _splice_field(line2, 0, wall)
            stats["wall"] += 1
        if corr is not None:
            line2 = _splice_field(line2, 2, corr)
            stats["corrosion"] += 1
        lines[base + 1] = line2

    return "\n".join(lines), stats


def main():
    ap = argparse.ArgumentParser(description="Merge a CA sidecar into a CII (wall/corrosion).")
    ap.add_argument("--cii", required=True, type=Path, help="Input CII (2019) file.")
    ap.add_argument("--sidecar", required=True, type=Path, help="CA-injection sidecar JSON.")
    ap.add_argument("--out", required=True, type=Path, help="Output enriched CII file.")
    ap.add_argument("--key", choices=["to", "from"], default="to",
                    help="Which element node to match against by_node (default: to).")
    args = ap.parse_args()

    cii_text = args.cii.read_text(encoding="utf-8", errors="replace")
    sidecar = json.loads(args.sidecar.read_text(encoding="utf-8"))
    merged, stats = merge(cii_text, sidecar, args.key)
    args.out.write_text(merged, encoding="utf-8")
    print(f"Merged {stats['matched']}/{stats['elements']} elements "
          f"(wall set: {stats['wall']}, corrosion set: {stats['corrosion']}) -> {args.out}")


if __name__ == "__main__":
    main()
