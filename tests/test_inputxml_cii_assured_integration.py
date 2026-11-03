import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"
SCRIPTS = ROOT / "converters" / "scripts"
sys.path.insert(0, str(SCRIPTS))


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


compiler = load_module(
    "inputxml_canonical_compiler_prf_integration",
    ROOT / "scripts" / "inputxml_canonical_compiler.py",
)
assurance_builder = load_module(
    "inputxml_assurance_ledger_prf_integration",
    ROOT / "scripts" / "inputxml_assurance_ledger.py",
)
projection = load_module(
    "inputxml_to_cii2019_assured_prf_integration",
    SCRIPTS / "inputxml_to_cii2019_assured_projection.py",
)

SOURCE = b'''<?xml version="1.0" encoding="UTF-8"?>
<CAESARII xmlns="COADE" VERSION="11.00" XML_TYPE="Input">
  <PIPINGMODEL xmlns="" JOBNAME="PRF_INTEGRATION" TIME="2026/07/15 12:00:00" ISSUE_NO="1" NUMELT="1" NUMNOZ="0" NOHGRS="0" NUMBEND="0" NUMRIGID="0" NUMEXPJNT="0" NUMREST="0" NUMFORCMNT="0" NUMUNFLOAD="0" NUMWIND="0" NUMELEOFF="0" NUMALLOW="0" NUMISECT="0" NORTH_X="0" NORTH_Y="1" NORTH_Z="0">
    <PIPINGELEMENT ID="E1" FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="114.3" WALL_THICK="6.02" MATERIAL_NUM="106" LINE="L1" FROM_X="0" FROM_Y="0" FROM_Z="0" TO_X="1000" TO_Y="0" TO_Z="0" FROM_NAME="N10" TO_NAME="N20"/>
  </PIPINGMODEL>
</CAESARII>
'''


class AssuredProjectionIntegrationTests(unittest.TestCase):
    def test_compiler_assurance_writer_chain_passes(self):
        root, canonicalization, validation = compiler.compile_document(
            SOURCE,
            source_name="prf.integration.input.xml",
            source_repository="reallaksh19/3D_Converters",
            source_path="test://prf.integration.input.xml",
            producer="pr-f-integration-test",
            registry_path=CONTRACTS / "inputxml-dialect-registry.json",
            alias_registry_path=CONTRACTS / "catalogs" / "inputxml-alias-registry.json",
            canonical_xsd_path=CONTRACTS / "inputxml-canonical-v1.xsd",
            categorized_xsd_path=CONTRACTS / "categorized-inputxml-v3.xsd",
            semantic_rules_path=CONTRACTS / "inputxml-semantic-rules-v1.sch",
            dialect_override="canonical-inputxml-v1",
            context={},
        )
        self.assertIsNotNone(root)
        self.assertEqual("PASS", validation["status"])
        canonical_bytes = compiler._compiler._xml_bytes(root)
        assurance = assurance_builder.build_assurance_ledger(
            canonical_xml=canonical_bytes,
            canonicalization_ledger=canonicalization,
            canonical_validation=validation,
            field_catalog=json.loads(
                (CONTRACTS / "catalogs" / "inputxml-field-catalog.json").read_text(encoding="utf-8")
            ),
            projection_contract=json.loads(
                (CONTRACTS / "catalogs" / "inputxml-cii-projection-contract.json").read_text(encoding="utf-8")
            ),
        )
        self.assertEqual("PASS", assurance["status"])
        with tempfile.TemporaryDirectory() as tmp:
            canonical_path = Path(tmp) / "canonical.input.xml"
            canonical_path.write_bytes(canonical_bytes)
            cii_text, ledger = projection.build_assured_projection(
                canonical_xml=canonical_bytes,
                assurance=assurance,
                projection_contract=json.loads(
                    (CONTRACTS / "catalogs" / "inputxml-cii-projection-contract.json").read_text(encoding="utf-8")
                ),
                canonical_path=canonical_path,
            )
        self.assertIsNotNone(cii_text, ledger["diagnostics"])
        self.assertEqual("PASS", ledger["status"], ledger["diagnostics"])
        self.assertEqual(1, ledger["summary"]["elementCount"])
        self.assertGreater(ledger["summary"]["resolvedTargetCount"], 0)
        self.assertEqual([], projection.validate_projection_ledger(ledger))
        north_rows = [
            row for row in ledger["records"]
            if str(row.get("sourceEntityId") or "").endswith(("@NORTH_X", "@NORTH_Y", "@NORTH_Z"))
        ]
        self.assertEqual(3, len(north_rows))
        self.assertTrue(all(row["status"] == "EVIDENCE_ONLY" for row in north_rows))
        self.assertTrue(all(row["catalogProjectionStatus"] == "PRESERVE_EXTENSION" for row in north_rows))
        self.assertTrue(all(not row["targets"] for row in north_rows))


if __name__ == "__main__":
    unittest.main()
