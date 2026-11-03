import json
import unittest
from pathlib import Path

from scripts.inputxml_compiler.compiler import compile_document
from tests.managed_stage_test_support import CONTEXT, CONTRACTS, ROOT

CORPUS = CONTRACTS / "golden" / "managed-stage"
MANIFEST = json.loads((CORPUS / "manifest.json").read_text(encoding="utf-8"))
_REQUIRED_CATEGORIES = {
    "positive",
    "negative",
    "blocked-with-candidate",
    "blocked-without-candidate",
    "adversarial",
    "benchmark",
}


class ManagedStageCorpusTests(unittest.TestCase):
    def compile_case(self, row):
        path = CORPUS / row["source"]
        return compile_document(
            path.read_bytes(),
            source_name=path.name,
            source_repository="reallaksh19/3D_Converters",
            source_path=str(path.relative_to(ROOT)).replace("\\", "/"),
            producer="managed-stage-corpus-test",
            registry_path=CONTRACTS / "inputxml-dialect-registry.json",
            adapter_registry_path=(
                CONTRACTS / "compiler" / "inputxml-compiler-adapters.json"
            ),
            serialization_policy_path=(
                CONTRACTS / "compiler" / "inputxml-deterministic-serialization.json"
            ),
            alias_registry_path=(
                CONTRACTS / "catalogs" / "inputxml-alias-registry.json"
            ),
            canonical_xsd_path=CONTRACTS / "inputxml-canonical-v1.xsd",
            categorized_xsd_path=CONTRACTS / "categorized-inputxml-v3.xsd",
            semantic_rules_path=CONTRACTS / "inputxml-semantic-rules-v1.sch",
            dialect_override=row.get("dialectOverride"),
            context={**CONTEXT, "jobName": f"CORPUS_{row['caseId'].upper()}"},
        )

    def test_manifest_is_closed_and_reviewable(self):
        self.assertEqual("InputXmlManagedStageGoldenCorpus.v1", MANIFEST["schema"])
        self.assertEqual("managed-stage-json", MANIFEST["profileId"])
        self.assertEqual("managed-stage-to-canonical", MANIFEST["adapterId"])
        cases = MANIFEST["cases"]
        self.assertEqual(_REQUIRED_CATEGORIES, {row["category"] for row in cases})
        classifications = set(MANIFEST["differenceClassifications"])
        self.assertTrue(all(
            row["differenceClassification"] in classifications
            for row in cases
        ))
        self.assertFalse(any(
            row["differenceClassification"] == "UNKNOWN — BLOCK MERGE"
            for row in cases
        ))
        ids = [row["caseId"] for row in cases]
        self.assertEqual(len(ids), len(set(ids)))
        for row in cases:
            if "source" in row:
                self.assertTrue((CORPUS / row["source"]).is_file(), row)
            else:
                self.assertTrue(row.get("verificationTest"), row)

    def test_executable_corpus_matches_declared_outcomes(self):
        for row in MANIFEST["cases"]:
            if "source" not in row:
                continue
            with self.subTest(case=row["caseId"]):
                candidate, ledger, validation = self.compile_case(row)
                self.assertEqual(
                    row["expectedStatus"],
                    validation["status"],
                    ledger["diagnostics"],
                )
                if "expectedBlockedAt" in row:
                    self.assertEqual(
                        row["expectedBlockedAt"],
                        validation["blockedAt"],
                        ledger["diagnostics"],
                    )
                outcome = validation.get("resolverOutcome")
                outcome_kind = (
                    outcome.get("outcomeKind")
                    if isinstance(outcome, dict)
                    else "BLOCKED_NO_CANDIDATE"
                )
                if "expectedOutcomeKind" in row:
                    self.assertEqual(
                        row["expectedOutcomeKind"],
                        outcome_kind,
                        ledger["diagnostics"],
                    )
                if row["category"] == "blocked-with-candidate":
                    self.assertIsNotNone(candidate, ledger["diagnostics"])
                if row["category"] in {"negative", "blocked-without-candidate"}:
                    self.assertIsNone(candidate, ledger["diagnostics"])
                if "expectedDiagnostic" in row:
                    self.assertTrue(
                        any(
                            item["code"] == row["expectedDiagnostic"]
                            for item in ledger["diagnostics"]
                        ),
                        ledger["diagnostics"],
                    )

    def test_positive_cases_have_complete_source_accounting(self):
        for row in MANIFEST["cases"]:
            if row.get("expectedStatus") != "PASS":
                continue
            with self.subTest(case=row["caseId"]):
                candidate, _, validation = self.compile_case(row)
                self.assertIsNotNone(candidate)
                proof = validation["resolverOutcome"]["profileMetrics"][
                    "sourceAccounting"
                ]
                self.assertEqual("COMPLETE", proof["status"])
                self.assertTrue(all(
                    value == 0 for value in proof["invariants"].values()
                ))


if __name__ == "__main__":
    unittest.main()
