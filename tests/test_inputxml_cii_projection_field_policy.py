import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "converters" / "scripts"
CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"
sys.path.insert(0, str(SCRIPTS))

spec = importlib.util.spec_from_file_location(
    "inputxml_to_cii2019_assured_projection_policy_test",
    SCRIPTS / "inputxml_to_cii2019_assured_projection.py",
)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
FIELD_CATALOG = json.loads(
    (CONTRACTS / "catalogs" / "inputxml-field-catalog.json").read_text(encoding="utf-8")
)


def assurance_record(record_id, source_entity_id, sections):
    return {
        "assuranceRecordId": record_id,
        "sourceEntityId": source_entity_id,
        "sourceType": "ATTRIBUTE",
        "projection": {
            "sections": list(sections),
            "ciiIndex": None,
            "indexStatus": "PENDING_WRITER_ADAPTER",
            "readiness": "READY",
        },
        "status": "READY",
    }


def assurance(*records):
    return {
        "schema": "InputXmlCiiAssuranceLedger.v1",
        "status": "PASS",
        "gates": {"ciiProjectionReadiness": "PASS"},
        "records": list(records),
    }


class ProjectionFieldPolicyTests(unittest.TestCase):
    def test_known_non_writer_metadata_is_evidence_only(self):
        source = assurance(
            assurance_record(
                "IXAL-0000001",
                "/CAESARII/PIPINGMODEL[1]@ISSUE_NO",
                ["VERSION"],
            ),
            assurance_record(
                "IXAL-0000002",
                "/CAESARII/PIPINGMODEL[1]/PIPINGELEMENT[1]@ID",
                ["ELEMENTS"],
            ),
        )
        reconciled, metadata, diagnostics = module.reconcile_assurance_with_field_catalog(
            source,
            FIELD_CATALOG,
        )
        self.assertEqual("PASS", reconciled["status"])
        self.assertEqual([], diagnostics)
        self.assertTrue(all(row["status"] == "EVIDENCE_ONLY" for row in reconciled["records"]))
        self.assertTrue(all(row["projection"]["sections"] == [] for row in reconciled["records"]))
        self.assertTrue(all(value["catalogProjectionStatus"] == "PRESERVE_EXTENSION" for value in metadata.values()))

    def test_uncatalogued_canonical_attribute_blocks(self):
        source = assurance(
            assurance_record(
                "IXAL-0000001",
                "/CAESARII/PIPINGMODEL[1]/PIPINGELEMENT[1]@UNREGISTERED_ENGINEERING_FIELD",
                ["ELEMENTS"],
            )
        )
        reconciled, metadata, diagnostics = module.reconcile_assurance_with_field_catalog(
            source,
            FIELD_CATALOG,
        )
        self.assertEqual("BLOCKED", reconciled["status"])
        self.assertEqual("BLOCKED", reconciled["records"][0]["status"])
        self.assertEqual("UNSUPPORTED_BLOCKING", metadata["IXAL-0000001"]["catalogProjectionStatus"])
        self.assertTrue(diagnostics)
        self.assertTrue(
            any("absent from the field catalog" in text for text in metadata["IXAL-0000001"]["notes"])
        )


if __name__ == "__main__":
    unittest.main()
