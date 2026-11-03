import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "inputxml_canonical_compiler.py"
spec = importlib.util.spec_from_file_location("topology_corpus_compiler", MODULE_PATH)
compiler = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = compiler
spec.loader.exec_module(compiler)
CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"
CORPUS = CONTRACTS / "golden" / "topology"
MANIFEST = json.loads((CORPUS / "manifest.json").read_text(encoding="utf-8"))
REQUIRED_CATEGORIES = {
    "positive",
    "negative",
    "blocked-with-candidate",
    "blocked-without-candidate",
    "adversarial",
}


class TopologyCorpusTests(unittest.TestCase):
    def compile_case(self, row):
        path = CORPUS / row["source"]
        return compiler.compile_document(
            path.read_bytes(),
            source_name=path.name,
            source_repository="reallaksh19/3D_Converters",
            source_path=str(path.relative_to(ROOT)).replace("\\", "/"),
            producer="topology-corpus-test",
            registry_path=CONTRACTS / "inputxml-dialect-registry.json",
            adapter_registry_path=CONTRACTS / "compiler" / "inputxml-compiler-adapters.json",
            serialization_policy_path=CONTRACTS / "compiler" / "inputxml-deterministic-serialization.json",
            alias_registry_path=CONTRACTS / "catalogs" / "inputxml-alias-registry.json",
            canonical_xsd_path=CONTRACTS / "inputxml-canonical-v1.xsd",
            categorized_xsd_path=CONTRACTS / "categorized-inputxml-v3.xsd",
            semantic_rules_path=CONTRACTS / "inputxml-semantic-rules-v1.sch",
            dialect_override=row.get("dialectOverride"),
            context={
                "version": "11.00",
                "jobName": "TOPOLOGY_CORPUS",
                "north": [0, 1, 0],
                "fluidDensityScale": "0.000001",
            },
        )

    def row(self, profile_id, case_id):
        return next(
            row for row in MANIFEST["profiles"][profile_id]["cases"]
            if row["caseId"] == case_id
        )

    def test_manifest_has_closed_profile_and_category_coverage(self):
        self.assertEqual("InputXmlTopologyGoldenCorpus.v1", MANIFEST["schema"])
        self.assertEqual(
            {"xml-builder-root-branch-node", "seljson-custom-root"},
            set(MANIFEST["profiles"]),
        )
        allowed = set(MANIFEST["allowedDifferenceClassifications"])
        used = {
            row["differenceClassification"]
            for profile in MANIFEST["profiles"].values()
            for row in profile["cases"]
        }
        self.assertNotIn("UNKNOWN — BLOCK MERGE", used)
        for profile_id, profile in MANIFEST["profiles"].items():
            with self.subTest(profile=profile_id):
                self.assertEqual(
                    REQUIRED_CATEGORIES,
                    {row["category"] for row in profile["cases"]},
                )
                self.assertTrue(all(
                    row["differenceClassification"] in allowed
                    for row in profile["cases"]
                ))
                self.assertTrue(all(
                    (CORPUS / row["source"]).is_file()
                    for row in profile["cases"]
                ))

    def test_every_corpus_case_matches_declared_gate_and_candidate_policy(self):
        for profile_id, profile in MANIFEST["profiles"].items():
            for row in profile["cases"]:
                with self.subTest(profile=profile_id, case=row["caseId"]):
                    candidate, ledger, validation = self.compile_case(row)
                    if "expectedStatus" in row:
                        self.assertEqual(row["expectedStatus"], validation["status"])
                    if "expectedBlockedAt" in row:
                        self.assertEqual(row["expectedBlockedAt"], validation["blockedAt"])
                    if "expectedDialect" in row:
                        self.assertEqual(row["expectedDialect"], ledger["dialect"])
                    if row["category"] == "blocked-with-candidate":
                        self.assertIsNotNone(candidate)
                        self.assertEqual(
                            "BLOCKED_WITH_CANDIDATE",
                            validation["resolverOutcome"]["outcomeKind"],
                        )
                    if row["category"] in {"negative", "blocked-without-candidate"}:
                        self.assertIsNone(candidate)

    def test_real_shaped_repeated_line_fixture_preserves_branch_isolation(self):
        row = self.row(
            "xml-builder-root-branch-node",
            "xml-builder-producer-shaped-repeated-line",
        )
        candidate, ledger, validation = self.compile_case(row)
        self.assertEqual("PASS", validation["status"])
        elements = candidate.findall("PIPINGMODEL/PIPINGELEMENT")
        self.assertEqual(["P8810031", "P8810031"], [element.get("LINE") for element in elements])
        self.assertEqual(["1000", "2000"], [element.get("PRESSURE_C1") for element in elements])
        self.assertEqual(["114.3", "219.1"], [element.get("DIAMETER") for element in elements])
        branches = [
            record for record in ledger["records"]
            if record["sourceType"] == "SOURCE_BRANCH_OCCURRENCE"
        ]
        self.assertEqual(2, len(branches))
        self.assertNotEqual(branches[0]["sourceEntityId"], branches[1]["sourceEntityId"])

    def test_selectionjson_contradictory_producer_fixture_blocks_producer(self):
        row = self.row("seljson-custom-root", "selectionjson-contradictory-producer")
        candidate, ledger, validation = self.compile_case(row)
        self.assertIsNone(candidate)
        self.assertEqual("PROFILE_INTAKE_GATE", validation["blockedAt"])
        diagnostic = next(
            item for item in ledger["diagnostics"]
            if item["code"] == "ROOT_PROFILE_MISMATCH"
        )
        self.assertEqual("/Root[1]/Producer[1]", diagnostic["sourceEntityId"])


if __name__ == "__main__":
    unittest.main()
