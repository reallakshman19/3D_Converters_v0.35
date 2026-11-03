#!/usr/bin/env python3
"""Tests for G4 support -> restraint classification and node insertion."""
from __future__ import annotations

import unittest

import support_restraint as SR
import stagedjson_to_inputxml as S
from inputxml_bookmark import load_defaults


ANCHOR_STIFF = 9.41952e+19


class TestSupportClassification(unittest.TestCase):
    def setUp(self):
        self.cfg = SR.merge_config(None)

    def test_rest_from_shoe_code(self):
        rows, kind = SR.restraint_rows_for({"CMPSUPTYPE": "SH-150"}, self.cfg, ANCHOR_STIFF)
        self.assertEqual(kind, SR.REST)
        self.assertEqual([r["type"] for r in rows], [4.0])

    def test_guide_from_pg_code(self):
        rows, kind = SR.restraint_rows_for({"MDSSUPPTYPE": "PG-150"}, self.cfg, ANCHOR_STIFF)
        self.assertEqual(kind, SR.GUIDE)
        self.assertEqual(sorted(r["type"] for r in rows), [2.0, 3.0])

    def test_linestop_from_ls_code(self):
        rows, kind = SR.restraint_rows_for({"CMPSUPTYPE": "LS-150"}, self.cfg, ANCHOR_STIFF)
        self.assertEqual(kind, SR.LINESTOP)

    def test_anchor(self):
        _, kind = SR.restraint_rows_for({"CMPSUPTYPE": "ANCH"}, self.cfg, ANCHOR_STIFF)
        self.assertEqual(kind, SR.ANCHOR)

    def test_welded_pad_excluded(self):
        rows, kind = SR.restraint_rows_for({"MDSSUPPTYPE": "W.PAD THK 6mm"}, self.cfg, ANCHOR_STIFF)
        self.assertEqual(rows, [])
        self.assertIsNone(kind)

    def test_no_code_is_not_a_support(self):
        rows, kind = SR.restraint_rows_for({"NAME": "/PS-1/DATUM"}, self.cfg, ANCHOR_STIFF)
        self.assertEqual(rows, [])

    def test_stiffness_from_attribute(self):
        cfg = SR.merge_config({"kind_dofs": {SR.SPRING: [{"type": 4, "stiffness": "from:NODESTIFF"}]}})
        rows, _ = SR.restraint_rows_for({"CMPSUPTYPE": "SPRING", "NODESTIFF": "1234.5"}, cfg, ANCHOR_STIFF)
        self.assertAlmostEqual(rows[0]["stiffness"], 1234.5)

    def test_config_override_is_deep(self):
        cfg = SR.merge_config({"default_kind": SR.ANCHOR})
        # Unrelated defaults remain intact.
        self.assertIn(SR.REST, cfg["kind_dofs"])
        self.assertEqual(cfg["default_kind"], SR.ANCHOR)

    def test_node_name_from_stress_attr(self):
        self.assertEqual(
            SR.support_node_name({"CMPSTRESSN": "PS-12244.1"}, self.cfg), "PS-12244.1"
        )


class TestSupportNodeInsertion(unittest.TestCase):
    """A support on a mid-span point splits the element but preserves geometry."""

    def _branch(self, support_pos):
        # A single 2000mm pipe in +X with one rest support at x=1000 (mid-span).
        return [{
            "name": "/TEST/B1", "type": "BRANCH", "bore": "150mm",
            "attributes": {"HBOR": "150mm"},
            "children": [
                {"type": "PIPE", "attributes": {
                    "APOS": {"x": 0, "y": 0, "z": 0},
                    "LPOS": {"x": 2000, "y": 0, "z": 0}, "HBOR": "150mm"}},
                {"type": "SUPPORT", "attributes": {
                    "CMPSUPTYPE": "SH-150", "CMPSTRESSN": "PS-1.1",
                    "POS": support_pos}},
            ],
        }]

    def _run(self, branch, enabled=True):
        na = S.NodeAllocator(10, 10)
        defaults = load_defaults(None, {})
        elems = []
        for b in branch:
            elems.extend(S.process_branch(b, na, defaults, len(elems), {}))
        cfg = SR.merge_config({"enabled": enabled})
        stats = S.apply_support_restraints(elems, na, branch, defaults, cfg)
        return elems, stats

    def test_midspan_support_splits_and_preserves_length(self):
        branch = self._branch({"x": 1000, "y": 0, "z": 0})
        before, _ = self._run(branch, enabled=False)
        len_before = sum(abs(e.dx) for e in before if e.dx != S.SENTINEL)
        after, stats = self._run(branch, enabled=True)
        len_after = sum(abs(e.dx) for e in after if e.dx != S.SENTINEL)
        self.assertEqual(stats["split_inserted"], 1)
        self.assertEqual(len(after), len(before) + 1)
        self.assertAlmostEqual(len_before, len_after, places=3)
        # A restraint row was attached.
        self.assertTrue(any(e.restraints for e in after))

    def test_disabled_is_noop(self):
        branch = self._branch({"x": 1000, "y": 0, "z": 0})
        elems, stats = self._run(branch, enabled=False)
        self.assertEqual(stats["supports"], 0)
        self.assertFalse(any(e.restraints for e in elems))


if __name__ == "__main__":
    unittest.main()
