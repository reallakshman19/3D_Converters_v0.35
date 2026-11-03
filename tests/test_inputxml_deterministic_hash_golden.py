#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import unittest
from pathlib import Path

from lxml import etree as ET

from scripts.inputxml_compiler.serialization import serialize_canonical_xml
from scripts.inputxml_compiler.serialization_policy import load_serialization_policy

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"
EXPECTED_CANONICAL_SHA256 = (
    "57ea5f3c935469c5a2e99cdc517e487a8a86a7b60dc7ee91737ab5718adb5200"
)


class DeterministicHashGoldenTests(unittest.TestCase):
    def test_minimal_canonical_hash_is_cross_platform_constant(self):
        policy = load_serialization_policy(
            CONTRACTS
            / "compiler"
            / "inputxml-deterministic-serialization.json"
        )
        source = (
            CONTRACTS
            / "golden"
            / "positive"
            / "minimal.canonical.input.xml"
        ).read_bytes()
        root = ET.fromstring(source, ET.XMLParser(remove_blank_text=True))
        actual = hashlib.sha256(
            serialize_canonical_xml(root, policy)
        ).hexdigest()
        self.assertEqual(EXPECTED_CANONICAL_SHA256, actual)


if __name__ == "__main__":
    unittest.main()
