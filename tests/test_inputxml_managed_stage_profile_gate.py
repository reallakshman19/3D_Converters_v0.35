import json
import unittest

from scripts.inputxml_compiler.compiler import compile_document
from tests.managed_stage_test_support import CONTEXT, CONTRACTS, source_bytes


class ManagedStageProfileGateTests(unittest.TestCase):
    def compile(self, source, *, name="source.json", dialect=None, context=None):
        return compile_document(
            source,
            source_name=name,
            source_repository="reallaksh19/3D_Converters",
            source_path=f"test://{name}",
            producer="managed-stage-profile-gate-test",
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
            dialect_override=dialect,
            context=context or CONTEXT,
        )

    def test_incompatible_override_cannot_legalize_unrelated_json(self):
        source = json.dumps({"hello": "world"}).encode()
        candidate, ledger, validation = self.compile(
            source,
            dialect="managed-stage-json",
        )
        self.assertIsNone(candidate)
        self.assertEqual("PROFILE_INTAKE_GATE", validation["blockedAt"])
        self.assertTrue(any(
            row["code"] == "MANAGED_STAGE_PROFILE_MISMATCH"
            for row in ledger["diagnostics"]
        ))

    def test_managed_stage_source_cannot_be_forced_into_uxml_profile(self):
        candidate, ledger, validation = self.compile(
            source_bytes(),
            dialect="uxml-rvm-intake",
        )
        self.assertIsNone(candidate)
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])
        self.assertNotEqual("managed-stage-json", ledger["dialect"])

    def test_filename_does_not_select_another_profile(self):
        candidate, ledger, validation = self.compile(
            source_bytes(),
            name="pdf_uxml_rvm_selectionjson.json",
        )
        self.assertIsNotNone(candidate, ledger["diagnostics"])
        self.assertEqual("PASS", validation["status"])
        self.assertEqual("managed-stage-json", ledger["dialect"])

    def test_source_name_never_substitutes_for_job_name(self):
        context = dict(CONTEXT)
        context.pop("jobName")
        candidate, ledger, validation = self.compile(
            source_bytes(),
            name="THIS_MUST_NOT_BECOME_JOBNAME.json",
            context=context,
        )
        self.assertIsNone(candidate)
        self.assertEqual("PROFILE_INTAKE_GATE", validation["blockedAt"])
        self.assertTrue(any(
            row["code"] == "MANAGED_STAGE_CONTEXT_MISSING"
            for row in ledger["diagnostics"]
        ))

    def test_explicit_nondefault_version_and_north_reach_candidate(self):
        context = {
            **CONTEXT,
            "version": "14.00",
            "jobName": "EXPLICIT_CONTEXT",
            "north": [1, 0, 0],
            "time": "2026/07/20 12:00:00",
            "issueNo": "7",
        }
        candidate, ledger, validation = self.compile(
            source_bytes(),
            context=context,
        )
        self.assertIsNotNone(candidate, ledger["diagnostics"])
        self.assertEqual("PASS", validation["status"])
        model = candidate.find("PIPINGMODEL")
        self.assertEqual("14.00", candidate.get("VERSION"))
        self.assertEqual("EXPLICIT_CONTEXT", model.get("JOBNAME"))
        self.assertEqual(["1", "0", "0"], [
            model.get("NORTH_X"), model.get("NORTH_Y"), model.get("NORTH_Z")
        ])
        self.assertEqual("2026/07/20 12:00:00", model.get("TIME"))
        self.assertEqual("7", model.get("ISSUE_NO"))


if __name__ == "__main__":
    unittest.main()
