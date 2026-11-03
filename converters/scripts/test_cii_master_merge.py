#!/usr/bin/env python3
"""Tests for the tiny CII <- sidecar merger."""
from __future__ import annotations

import unittest

import cii_master_merge as M

# A minimal CII with one 15-line ELEMENTS record (node 10 -> 20, wall 0.01).
_LINE1 = "        10.0000      20.0000     0.000000     0.000000     0.000000      273.000"
_LINE2 = "   1.000000E-02      120.000     0.000000     0.000000     0.000000     0.000000"
_FILLER = "           0"
CII = "\n".join(["#$ ELEMENTS", _LINE1, _LINE2] + [_FILLER] * 13 + ["#$ UNITS", "0"]) + "\n"


class TestMerge(unittest.TestCase):
    def test_injects_wall_and_corrosion_by_to_node(self):
        sidecar = {"by_node": {"20": {"CA4": "7.11", "CA7": "3"}}}
        out, stats = M.merge(CII, sidecar, key="to")
        self.assertEqual(stats, {"elements": 1, "wall": 1, "corrosion": 1, "matched": 1})
        line2 = out.split("\n")[2]
        self.assertEqual(M._to_num(M._read_field(line2, 0)), 7.11)   # CA4 wall
        self.assertEqual(M._to_num(M._read_field(line2, 2)), 3.0)    # CA7 corrosion
        self.assertEqual(M._to_num(M._read_field(line2, 1)), 120.0)  # insulation untouched

    def test_fixed_width_preserved(self):
        sidecar = {"by_node": {"20": {"CA4": "7.11", "CA7": "3"}}}
        out, _ = M.merge(CII, sidecar, key="to")
        a, b = CII.split("\n"), out.split("\n")
        self.assertEqual(len(a), len(b))
        self.assertTrue(all(len(x) == len(y) for x, y in zip(a, b)))  # no column drift

    def test_no_match_leaves_file_unchanged(self):
        out, stats = M.merge(CII, {"by_node": {"999": {"CA4": "9"}}}, key="to")
        self.assertEqual(stats["matched"], 0)
        self.assertEqual(out, CII)

    def test_key_from_node(self):
        out, stats = M.merge(CII, {"by_node": {"10": {"CA4": "5.5"}}}, key="from")
        self.assertEqual(stats["wall"], 1)
        self.assertEqual(M._to_num(M._read_field(out.split("\n")[2], 0)), 5.5)


if __name__ == "__main__":
    unittest.main()
