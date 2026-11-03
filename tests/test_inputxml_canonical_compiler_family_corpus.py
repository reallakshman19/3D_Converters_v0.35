import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "contracts" / "inputxml" / "v1" / "golden" / "family" / "manifest.json"
EXPECTED_PROFILES = {
    "canonical-inputxml-v1",
    "caesar-inputxml-pressure1",
    "caesar-inputxml-pressure-c",
    "enriched-inputxml-app",
    "inputxml-fragment",
    "categorized-inputxml-v3",
    "cii14-inputxml",
    "xml-to-cii-diagnostic-sidecar",
}
EXPECTED_CATEGORIES = {
    "positive",
    "negative",
    "blocked-with-candidate",
    "blocked-without-candidate",
    "adversarial",
}
ALLOWED_DIFFERENCES = {
    "NO_CHANGE",
    "INTENDED_PROFILE_CORRECTION",
    "REPRESENTATION_ONLY",
    "ENGINEERING_CHANGE_WITH_AUTHORITY",
    "UNKNOWN — BLOCK MERGE",
}


class FamilyCorpusManifestTests(unittest.TestCase):
    def setUp(self):
        self.manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))

    def test_manifest_covers_each_profile_and_case_category(self):
        profiles = self.manifest["profiles"]
        self.assertEqual(EXPECTED_PROFILES, {row["profileId"] for row in profiles})
        for profile in profiles:
            with self.subTest(profile=profile["profileId"]):
                cases = profile["cases"]
                self.assertEqual(EXPECTED_CATEGORIES, {case["category"] for case in cases})
                self.assertEqual(len(cases), len({case["id"] for case in cases}))
                for case in cases:
                    self.assertTrue(case["sourceRef"])
                    self.assertTrue(case["expected"])
                    self.assertIn(case["difference"], ALLOWED_DIFFERENCES)

    def test_declared_category_rule_matches_required_categories(self):
        self.assertEqual(EXPECTED_CATEGORIES, set(self.manifest["categoryRule"]))


if __name__ == "__main__":
    unittest.main()
