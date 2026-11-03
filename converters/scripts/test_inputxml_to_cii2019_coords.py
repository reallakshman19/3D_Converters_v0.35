#!/usr/bin/env python3
"""Integration regressions for CAESAR 2019 discontinuous-segment coordinates."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
CONVERTER = SCRIPT_DIR / "inputxml_to_cii2019.py"


def _coords_rows(cii_path: Path) -> tuple[int, list[tuple[int, float, float, float]]]:
    lines = cii_path.read_text(encoding="utf-8").splitlines()
    header_index = lines.index("#$ COORDS")
    count = int(lines[header_index + 1][:15])
    rows: list[tuple[int, float, float, float]] = []
    for line in lines[header_index + 2:header_index + 2 + count]:
        if len(line) != 54:
            raise AssertionError(f"COORDS row must be 54 characters, got {len(line)}: {line!r}")
        rows.append((int(line[:15]), float(line[15:28]), float(line[28:41]), float(line[41:54])))
    return count, rows


def _run_converter(source: Path, output: Path, layout: dict[str, object] | None) -> subprocess.CompletedProcess[str]:
    argv = [sys.executable, str(CONVERTER), "--input", str(source), "--output", str(output)]
    if layout is not None:
        argv.extend(["--layout-config-json", json.dumps(layout)])
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
    return subprocess.run(argv, text=True, capture_output=True, check=False, env=env)


class TestInputXmlCii2019Coords(unittest.TestCase):
    def test_default_writes_global_start_for_each_discontinuous_segment(self):
        source_text = """<CAESARII VERSION="12"><PIPINGMODEL JOBNAME="coords">
<PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="100" DELTA_Y="0" DELTA_Z="0" FROM_GLOBAL_X="1000" FROM_GLOBAL_Y="2000" FROM_GLOBAL_Z="3000" TO_GLOBAL_X="1100" TO_GLOBAL_Y="2000" TO_GLOBAL_Z="3000" />
<PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DELTA_X="0" DELTA_Y="100" DELTA_Z="0" FROM_GLOBAL_X="1100" FROM_GLOBAL_Y="2000" FROM_GLOBAL_Z="3000" TO_GLOBAL_X="1100" TO_GLOBAL_Y="2100" TO_GLOBAL_Z="3000" />
<PIPINGELEMENT FROM_NODE="100" TO_NODE="110" DELTA_X="0" DELTA_Y="0" DELTA_Z="50" FROM_GLOBAL_X="-500" FROM_GLOBAL_Y="40" FROM_GLOBAL_Z="7" TO_GLOBAL_X="-500" TO_GLOBAL_Y="40" TO_GLOBAL_Z="57" />
</PIPINGMODEL></CAESARII>"""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "segments.xml"
            output = root / "segments.cii"
            source.write_text(source_text, encoding="utf-8")
            result = _run_converter(source, output, None)
            self.assertEqual(result.returncode, 0, result.stderr)
            count, rows = _coords_rows(output)
            self.assertEqual(count, 2)
            self.assertEqual(rows, [(10, 1000.0, 2000.0, 3000.0), (100, -500.0, 40.0, 7.0)])

    def test_explicit_all_nodes_mode_remains_available(self):
        source_text = """<CAESARII VERSION="12"><PIPINGMODEL JOBNAME="all-nodes">
<PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="100" DELTA_Y="0" DELTA_Z="0" FROM_X="1" FROM_Y="2" FROM_Z="3" TO_X="101" TO_Y="2" TO_Z="3" />
</PIPINGMODEL></CAESARII>"""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "all-nodes.xml"
            output = root / "all-nodes.cii"
            source.write_text(source_text, encoding="utf-8")
            result = _run_converter(source, output, {"coords": {"mode": "all_nodes"}})
            self.assertEqual(result.returncode, 0, result.stderr)
            count, rows = _coords_rows(output)
            self.assertEqual(count, 2)
            self.assertEqual([row[0] for row in rows], [10, 20])


if __name__ == "__main__":
    unittest.main()
