#!/usr/bin/env python3
"""Tests for inputxml_to_cii2019.py's restraint type mapping policy.

Covers the mechanism the InputXML -> CII(2019) config popup's new Support
Mapping tab writes into layoutConfigJson.restraint (identity passthrough by
default; explicit_type_map overrides a specific source RESTRAINT/TYPE number
to a different numeric code, without any hidden Python-side remapping).
"""
from __future__ import annotations

import unittest

import inputxml_to_cii2019 as M


class TestRestraintMappingPolicy(unittest.TestCase):
    def test_default_policy_is_identity(self):
        policy = M._parse_restraint_mapping_policy({})
        self.assertEqual(policy.policy, M.RESTRAINT_MAPPING_POLICY_IDENTITY)
        self.assertEqual(policy.explicit_type_map, {})

    def test_identity_policy_passes_source_token_through_unchanged(self):
        policy = M._parse_restraint_mapping_policy({})
        self.assertEqual(M._resolve_restraint_type_token("17", policy), "17")

    def test_explicit_map_overrides_matching_source_token(self):
        policy = M._parse_restraint_mapping_policy(
            {"mapping_policy": "explicit_map", "explicit_type_map": {"17": "9"}}
        )
        self.assertEqual(M._resolve_restraint_type_token("17", policy), "9")

    def test_explicit_map_leaves_unmapped_tokens_unchanged(self):
        policy = M._parse_restraint_mapping_policy(
            {"mapping_policy": "explicit_map", "explicit_type_map": {"17": "9"}}
        )
        self.assertEqual(M._resolve_restraint_type_token("1", policy), "1")

    def test_mapped_token_still_validates_as_a_caesar_type_code(self):
        policy = M._parse_restraint_mapping_policy(
            {"mapping_policy": "explicit_map", "explicit_type_map": {"17": "9"}}
        )
        mapped = M._resolve_restraint_type_token("17", policy)
        self.assertEqual(M._validate_restraint_type(float(mapped), 0, 1), 9.0)

    def test_invalid_mapping_policy_raises(self):
        with self.assertRaises(ValueError):
            M._parse_restraint_mapping_policy({"mapping_policy": "bogus"})

    def test_invalid_mapped_value_raises_on_validation(self):
        policy = M._parse_restraint_mapping_policy(
            {"mapping_policy": "explicit_map", "explicit_type_map": {"17": "999"}}
        )
        mapped = M._resolve_restraint_type_token("17", policy)
        with self.assertRaises(ValueError):
            M._validate_restraint_type(float(mapped), 0, 1)


if __name__ == "__main__":
    unittest.main()
