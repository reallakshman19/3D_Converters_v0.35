#!/usr/bin/env python3
"""Tests for the portable master-customization primitives."""
from __future__ import annotations

import unittest

import master_customization as MC


MATERIAL_MAP = [
    {"code": "CS", "material": "ASTM A106-B"},
    {"code": "SS316L", "material": "ASTM A312-TP316L"},
    {"code": "LTCS", "material": "ASTM A333-6"},
]


class TestFuzzy(unittest.TestCase):
    def test_normalize_and_jaccard(self):
        self.assertEqual(MC.normalize("ASTM A312-TP316L"), "astm a312 tp316l")
        self.assertGreater(MC.token_jaccard("ASTM A312 TP316L", "A312 TP316L pipe"), 0.3)

    def test_fuzzy_name_exact_then_contains_then_jaccard(self):
        m = MC.fuzzy_name_match("ASTM A106-B", MATERIAL_MAP, key=lambda r: r["material"])
        self.assertEqual(m["method"], "exact")
        m2 = MC.fuzzy_name_match("A312-TP316L seamless", MATERIAL_MAP, key=lambda r: r["material"])
        self.assertIn(m2["method"], ("contains", "token-jaccard"))
        self.assertEqual(m2["candidate"]["code"], "SS316L")


class TestMaterial(unittest.TestCase):
    def test_exact_material_code(self):
        r = MC.resolve_material_code("ASTM A312-TP316L", MATERIAL_MAP)
        self.assertEqual(r["code"], "SS316L")
        self.assertFalse(r["needs_review"])

    def test_fuzzy_material_flags_review(self):
        r = MC.resolve_material_code("A312 TP316L (welded)", MATERIAL_MAP)
        self.assertEqual(r["code"], "SS316L")
        self.assertTrue(r["needs_review"])  # confidence < 1.0

    def test_manual_override_wins(self):
        ov = {"material": {"ASTM A312-TP316L": "SS-CUSTOM"}}
        r = MC.resolve_material_code("ASTM A312-TP316L", MATERIAL_MAP, overrides=ov)
        self.assertEqual(r["code"], "SS-CUSTOM")
        self.assertEqual(r["method"], "override")

    def test_no_match(self):
        r = MC.resolve_material_code("UNOBTANIUM XYZ", MATERIAL_MAP)
        self.assertIsNone(r["code"])
        self.assertTrue(r["needs_review"])


class TestApproximateClass(unittest.TestCase):
    KNOWN = ["11000", "13421", "11001-KS", "A1A"]

    def test_exact(self):
        r = MC.approximate_class_match("13421", self.KNOWN)
        self.assertEqual(r["pipingClass"], "13421")
        self.assertEqual(r["method"], "exact")
        self.assertFalse(r["needs_review"])

    def test_startswith_flags_review(self):
        r = MC.approximate_class_match("11001", self.KNOWN)
        self.assertEqual(r["pipingClass"], "11001-KS")
        self.assertEqual(r["method"], "startsWith")
        self.assertTrue(r["needs_review"])

    def test_override_wins(self):
        ov = {"pipingClass": {"91261M7": "13421"}}
        r = MC.approximate_class_match("91261M7", self.KNOWN, overrides=ov)
        self.assertEqual(r["pipingClass"], "13421")
        self.assertEqual(r["method"], "override")

    def test_unknown_needs_review(self):
        r = MC.approximate_class_match("ZZZZ", self.KNOWN)
        self.assertIsNone(r["pipingClass"])
        self.assertTrue(r["needs_review"])


if __name__ == "__main__":
    unittest.main()
