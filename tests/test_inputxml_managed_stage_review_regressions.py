import json
import shutil
import subprocess
import unittest
from pathlib import Path

from scripts.inputxml_compiler.managed_stage_accounting import account_managed_stage_source
from tests.managed_stage_test_support import verified_evidence

ROOT = Path(__file__).resolve().parents[1]
RIGID_WEIGHT = ROOT / "tabs/model-converters/converters/component-topology/topology-rigid-weight.js"


class ManagedStageReviewRegressionTests(unittest.TestCase):
    def test_missing_rigid_weight_is_structured_absence_not_zero(self):
        node = shutil.which("node")
        self.assertIsNotNone(node)
        script = """
const { rigidWeightEvidence } = await import(process.argv[1]);
process.stdout.write(JSON.stringify({
  missing: rigidWeightEvidence({ resolved: {}, sourceWeightKg: null }),
  resolved: rigidWeightEvidence({ resolved: { weightKg: 12.5 }, sourceWeightKg: null }),
  source: rigidWeightEvidence({ resolved: {}, sourceWeightKg: 8 }),
}));
"""
        completed = subprocess.run(
            [node, "--input-type=module", "-e", script, RIGID_WEIGHT.as_uri()],
            check=True,
            capture_output=True,
            text=True,
        )
        result = json.loads(completed.stdout)
        self.assertIsNone(result["missing"]["weightKg"])
        self.assertEqual("MISSING", result["missing"]["weightAuthority"])
        self.assertEqual(12.5, result["resolved"]["weightKg"])
        self.assertEqual("RESOLVED_WEIGHT_KG", result["resolved"]["weightAuthority"])
        self.assertEqual(8, result["source"]["weightKg"])
        self.assertEqual("SOURCE_WEIGHT_KG", result["source"]["weightAuthority"])

    def test_non_authority_attempted_source_certification_is_counted(self):
        candidate, ledger, evidence = verified_evidence()
        identity = evidence["intake"].inventory.identities[0]
        ledger.add(
            source_entity_id=identity,
            source_type="MANAGED_STAGE_SOURCE_INVENTORY",
            source_fields={
                "identity": identity,
                "certifiesCoverage": True,
                "accountingAuthoritySourceType": "MANAGED_STAGE_SOURCE_DECISION",
            },
            projection_cardinality="1_TO_0",
            disposition="PRESERVE_EXTENSION",
            evidence=["deliberate self-certification exploit"],
        )
        status, proof = account_managed_stage_source(
            evidence["intake"],
            candidate,
            evidence=evidence,
            ledger=ledger,
        )
        self.assertEqual("BLOCKED", status)
        self.assertEqual(1, proof["invariants"]["selfCertificationCount"])
        self.assertTrue(proof["selfCertificationRecordIds"])


if __name__ == "__main__":
    unittest.main()
