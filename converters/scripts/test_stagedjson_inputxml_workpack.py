#!/usr/bin/env python3
"""Authority and diagnostics regressions for StagedJSON -> InputXML."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
CONVERTER = SCRIPT_DIR / "stagedjson_to_inputxml.py"
DOWNSTREAM = SCRIPT_DIR / "inputxml_to_cii2019.py"
SENTINEL = -1.0101


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, str(CONVERTER), *args], text=True, capture_output=True)


def _diagnostics_path(output: Path) -> Path:
    return output.with_name(
        f"{output.stem}_stagedjson_to_inputxml_diagnostics.json"
    )


def _read_first_element(output: Path) -> ET.Element:
    root = ET.parse(output).getroot()
    element = next(iter(root.iter("PIPINGELEMENT")), None)
    if element is None:
        raise AssertionError("generated InputXML has no PIPINGELEMENT")
    return element


class TestStagedJsonInputXmlWorkPack(unittest.TestCase):
    def test_incomplete_coordinate_fails_without_fabricating_origin(self):
        staged = [{
            "name": "/INCOMPLETE/B1",
            "type": "BRANCH",
            "children": [{
                "type": "PIPE",
                "attributes": {
                    "APOS": {"x": 0, "y": 0},
                    "LPOS": {"x": 1000, "y": 0, "z": 0},
                    "OUTSIDE_DIAMETER": "114.3mm",
                },
            }],
        }]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "incomplete.json"
            output = root / "incomplete.xml"
            source.write_text(json.dumps(staged), encoding="utf-8")
            result = _run("--input", str(source), "--output", str(output))
            self.assertNotEqual(result.returncode, 0)
            diagnostics_path = _diagnostics_path(output)
            self.assertTrue(diagnostics_path.is_file(), result.stderr)
            diagnostics = json.loads(diagnostics_path.read_text(encoding="utf-8"))
            codes = {row["code"] for row in diagnostics["records"]}
            self.assertIn("STAGED_COORDINATE_INCOMPLETE", codes)
            self.assertIn("STAGED_ZERO_ELEMENTS", codes)
            self.assertFalse(diagnostics["outputReady"])
            if output.exists():
                self.assertNotIn("0.000000 0.000000 0.000000", output.read_text(encoding="utf-8"))

    def test_explicit_od_and_inline_bookmark_values_reach_inputxml_and_cii(self):
        staged = [{
            "name": "/EXPLICIT/B1",
            "type": "BRANCH",
            "attributes": {"HBOR": "150mm"},
            "children": [{
                "type": "PIPE",
                "attributes": {
                    "APOS": {"x": 0, "y": 0, "z": 0},
                    "LPOS": {"x": 3000, "y": 0, "z": 0},
                    "HBOR": "150mm",
                    "OUTSIDE_DIAMETER": "168.3mm",
                },
            }],
        }]
        bookmark = {
            "temperature1": 155.5,
            "temperature2": 244.4,
            "temperature3": -29.9,
            "wall_thickness": 7.11,
            "modulus": 200000000,
            "hot_mod1": 190000000,
            "poissons": 0.3,
            "pipe_density": 0.0079,
            "material_num": 106,
            "material_name": "A106-B",
            "auto_anchors": False,
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "explicit.json"
            output = root / "explicit.xml"
            cii = root / "explicit.cii"
            source.write_text(json.dumps(staged), encoding="utf-8")
            result = _run(
                "--input", str(source), "--output", str(output),
                "--bookmark-json", json.dumps(bookmark),
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            element = _read_first_element(output)
            expected = {
                "DIAMETER": 168.3,
                "WALL_THICK": 7.11,
                "TEMP_EXP_C1": 155.5,
                "TEMP_EXP_C2": 244.4,
                "TEMP_EXP_C3": -29.9,
                "MODULUS": 200000000,
                "HOT_MOD1": 190000000,
                "POISSONS": 0.3,
                "PIPE_DENSITY": 0.0079,
                "MATERIAL_NUM": 106,
            }
            for name, value in expected.items():
                self.assertAlmostEqual(float(element.attrib[name]), value, places=5, msg=name)
            self.assertEqual(element.attrib["MATERIAL_NAME"], "A106-B")
            self.assertFalse(list(element.iter("RESTRAINT")), "auto anchors were explicitly disabled")
            diagnostics = json.loads(_diagnostics_path(output).read_text(encoding="utf-8"))
            codes = [row["code"] for row in diagnostics["records"]]
            self.assertIn("STAGED_OD_EXPLICIT", codes)
            self.assertIn("STAGED_DEFAULT_APPLIED", codes)
            self.assertTrue(diagnostics["outputReady"])

            converted = subprocess.run(
                [sys.executable, str(DOWNSTREAM), "--input", str(output), "--output", str(cii)],
                text=True, capture_output=True,
            )
            self.assertEqual(converted.returncode, 0, converted.stderr)
            self.assertIn("#$ ELEMENTS", cii.read_text(encoding="utf-8"))

    def test_nominal_bore_requires_explicit_compatibility_opt_in(self):
        staged = [{
            "name": "/BORE/B1",
            "type": "BRANCH",
            "children": [{
                "type": "PIPE",
                "attributes": {
                    "APOS": {"x": 0, "y": 0, "z": 0},
                    "LPOS": {"x": 1000, "y": 0, "z": 0},
                    "HBOR": "150mm",
                },
            }],
        }]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "bore.json"
            source.write_text(json.dumps(staged), encoding="utf-8")

            strict_output = root / "strict.xml"
            strict = _run("--input", str(source), "--output", str(strict_output), "--no-auto-anchors")
            self.assertEqual(strict.returncode, 0, strict.stderr)
            self.assertAlmostEqual(float(_read_first_element(strict_output).attrib["DIAMETER"]), SENTINEL, places=6)
            strict_diag = json.loads(_diagnostics_path(strict_output).read_text(encoding="utf-8"))
            self.assertIn("STAGED_OD_MISSING", {row["code"] for row in strict_diag["records"]})

            compat_output = root / "compat.xml"
            compat = _run(
                "--input", str(source), "--output", str(compat_output),
                "--infer-od-from-nominal-bore", "--no-auto-anchors",
            )
            self.assertEqual(compat.returncode, 0, compat.stderr)
            self.assertAlmostEqual(float(_read_first_element(compat_output).attrib["DIAMETER"]), 150.0, places=6)
            compat_diag = json.loads(_diagnostics_path(compat_output).read_text(encoding="utf-8"))
            self.assertIn("STAGED_OD_INFERRED_COMPAT", {row["code"] for row in compat_diag["records"]})

    def test_closest_support_segment_and_restraint_truncation_are_reported(self):
        supports = []
        for index in range(6):
            supports.append({
                "type": "SUPPORT",
                "attributes": {
                    "CMPSUPTYPE": "GUIDE",
                    "CMPSTRESSN": f"PS-{index}",
                    "POS": {"x": 500, "y": 0, "z": 18 if index == 0 else 20},
                },
            })
        staged = [{
            "name": "/SUPPORT/B1",
            "type": "BRANCH",
            "children": [
                {"type": "PIPE", "attributes": {
                    "APOS": {"x": 0, "y": 0, "z": 0},
                    "LPOS": {"x": 1000, "y": 0, "z": 0},
                    "OUTSIDE_DIAMETER": "114.3mm",
                }},
                {"type": "PIPE", "attributes": {
                    "APOS": {"x": 0, "y": 0, "z": 20},
                    "LPOS": {"x": 1000, "y": 0, "z": 20},
                    "OUTSIDE_DIAMETER": "114.3mm",
                }},
                *supports,
            ],
        }]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "supports.json"
            output = root / "supports.xml"
            source.write_text(json.dumps(staged), encoding="utf-8")
            result = _run("--input", str(source), "--output", str(output), "--no-auto-anchors")
            self.assertEqual(result.returncode, 0, result.stderr)
            diagnostics = json.loads(_diagnostics_path(output).read_text(encoding="utf-8"))
            attached = [row for row in diagnostics["records"] if row["code"] == "STAGED_SUPPORT_ATTACHED"]
            self.assertTrue(attached)
            self.assertTrue(any(abs(float(row["context"]["distanceMm"]) - 2.0) < 1e-6 for row in attached))
            self.assertIn("STAGED_RESTRAINT_SLOT_TRUNCATED", {row["code"] for row in diagnostics["records"]})
            document = ET.parse(output).getroot()
            per_element = []
            for element in document.iter("PIPINGELEMENT"):
                active = [
                    row for row in element.iter("RESTRAINT")
                    if float(row.attrib["NODE"]) > 0
                ]
                per_element.append(len(active))
            self.assertTrue(per_element)
            self.assertTrue(all(count <= 6 for count in per_element))
            self.assertIn(6, per_element)
            self.assertLess(sum(per_element), len(supports) * 2)


if __name__ == "__main__":
    unittest.main()
