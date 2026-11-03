import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "converters" / "scripts" / "inputxml_to_cii2019_assured_projection.py"
sys.path.insert(0, str(MODULE_PATH.parent))
spec = importlib.util.spec_from_file_location("inputxml_to_cii2019_assured_test", MODULE_PATH)
assured = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = assured
spec.loader.exec_module(assured)
CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"
SCHEMA = json.loads(
    (CONTRACTS / "assurance" / "inputxml-cii-projection-ledger.schema.json").read_text(encoding="utf-8")
)
PROJECTION_CONTRACT = json.loads(
    (CONTRACTS / "catalogs" / "inputxml-cii-projection-contract.json").read_text(encoding="utf-8")
)


def canonical_xml(*, second_diameter="114.3", include_time=True):
    time_attr = ' TIME="2026/07/15 12:00:00"' if include_time else ""
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<CAESARII xmlns="COADE" VERSION="11.00" XML_TYPE="Input">
  <PIPINGMODEL xmlns="" JOBNAME="ASSURED_TEST"{time_attr} NUMELT="2" NUMNOZ="0" NOHGRS="0" NUMBEND="0" NUMRIGID="1" NUMEXPJNT="0" NUMREST="1" NUMFORCMNT="0" NUMUNFLOAD="0" NUMWIND="0" NUMELEOFF="0" NUMALLOW="0" NUMISECT="0" NORTH_X="0" NORTH_Y="1" NORTH_Z="0">
    <PIPINGELEMENT ID="E1" FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="114.3" WALL_THICK="6.02" MATERIAL_NUM="106" LINE="L1" FROM_X="0" FROM_Y="0" FROM_Z="0" TO_X="1000" TO_Y="0" TO_Z="0" FROM_NAME="N10" TO_NAME="N20">
      <RIGID WEIGHT="12.5"/>
    </PIPINGELEMENT>
    <PIPINGELEMENT ID="E2" FROM_NODE="20" TO_NODE="30" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="{second_diameter}" WALL_THICK="6.02" MATERIAL_NUM="106" LINE="L1" FROM_X="1000" FROM_Y="0" FROM_Z="0" TO_X="2000" TO_Y="0" TO_Z="0" FROM_NAME="N20" TO_NAME="N30">
      <RESTRAINT NUM="1" NODE="20" TYPE="1" STIFFNESS="1000" GAP="0" FRIC_COEF="0" CNODE="0" XCOSINE="1" YCOSINE="0" ZCOSINE="0" TAG="S1" GUID=""/>
    </PIPINGELEMENT>
  </PIPINGMODEL>
</CAESARII>
'''.encode("utf-8")


def assurance_ledger(raw):
    canonical_hash = hashlib.sha256(raw).hexdigest()
    records = [
        {
            "assuranceRecordId": "IXAL-0000001",
            "sourceEntityId": "document",
            "sourceType": "ROOT",
            "canonical": {"inputXmlElementIds": []},
            "projection": {"sections": ["VERSION"]},
            "status": "READY",
        },
        {
            "assuranceRecordId": "IXAL-0000002",
            "sourceEntityId": "model",
            "sourceType": "MODEL",
            "canonical": {"inputXmlElementIds": []},
            "projection": {"sections": ["CONTROL", "UNITS"]},
            "status": "READY",
        },
        {
            "assuranceRecordId": "IXAL-0000003",
            "sourceEntityId": "SRC-E1",
            "sourceType": "PIPE",
            "canonical": {"inputXmlElementIds": ["E1"]},
            "projection": {"sections": ["ELEMENTS", "COORDS", "NODENAME", "MISCEL_1", "RIGID"]},
            "status": "READY",
        },
        {
            "assuranceRecordId": "IXAL-0000004",
            "sourceEntityId": "SRC-E2",
            "sourceType": "PIPE",
            "canonical": {"inputXmlElementIds": ["E2"]},
            "projection": {"sections": ["ELEMENTS", "COORDS", "NODENAME", "MISCEL_1", "RESTRANT"]},
            "status": "READY",
        },
    ]
    return {
        "schema": "InputXmlCiiAssuranceLedger.v1",
        "status": "PASS",
        "chain": {"canonicalHashSha256": canonical_hash},
        "gates": {
            "canonicalization": "PASS",
            "canonicalValidation": "PASS",
            "topologyTrace": "NOT_APPLICABLE",
            "topologyParity": "NOT_APPLICABLE",
            "ciiProjectionReadiness": "PASS",
        },
        "records": records,
        "assuranceHashSha256": "a" * 64,
    }


class InputXmlCiiAssuredProjectionTests(unittest.TestCase):
    def build(self, raw, assurance=None):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "canonical.input.xml"
            path.write_bytes(raw)
            return assured.build_assured_projection(
                canonical_xml=raw,
                assurance=assurance or assurance_ledger(raw),
                projection_contract=PROJECTION_CONTRACT,
                canonical_path=path,
            )

    def assert_schema(self, ledger):
        jsonschema.Draft202012Validator(SCHEMA).validate(ledger)
        self.assertEqual([], assured.validate_projection_ledger(ledger))

    def test_actual_writer_projection_and_indexes_pass(self):
        cii_text, ledger = self.build(canonical_xml())
        self.assertIsNotNone(cii_text)
        self.assertEqual("PASS", ledger["status"])
        self.assertEqual(2, ledger["summary"]["elementCount"])
        self.assertEqual(1, ledger["elements"][0]["pointers"]["RIGID"])
        self.assertEqual(1, ledger["elements"][1]["pointers"]["RESTRANT"])
        e1 = next(row for row in ledger["records"] if row["assuranceRecordId"] == "IXAL-0000003")
        targets = {(row["section"], row["index"]) for row in e1["targets"]}
        self.assertIn(("ELEMENTS", 1), targets)
        self.assertIn(("RIGID", 1), targets)
        self.assertIn(("NODENAME", 1), targets)
        self.assertIn(("MISCEL_1", 1), targets)
        self.assert_schema(ledger)

    def test_missing_explicit_time_blocks_clock_fallback(self):
        cii_text, ledger = self.build(canonical_xml(include_time=False))
        self.assertIsNone(cii_text)
        self.assertEqual("BLOCKED", ledger["status"])
        self.assertTrue(any("current-clock fallback is forbidden" in row["message"] for row in ledger["diagnostics"]))

    def test_reducer_inference_blocks(self):
        cii_text, ledger = self.build(canonical_xml(second_diameter="88.9"))
        self.assertIsNone(cii_text)
        self.assertEqual("BLOCKED", ledger["status"])
        self.assertTrue(any("inferred REDUCERS" in row["message"] for row in ledger["diagnostics"]))

    def test_assurance_hash_mismatch_blocks(self):
        raw = canonical_xml()
        assurance = assurance_ledger(raw)
        assurance["chain"]["canonicalHashSha256"] = "0" * 64
        cii_text, ledger = self.build(raw, assurance=assurance)
        self.assertIsNone(cii_text)
        self.assertEqual("BLOCKED", ledger["status"])

    def test_pointer_ownership_rejects_unreferenced_record(self):
        elements = [
            assured.CanonicalElement("E1", 1, "10", "20", ()),
        ]
        blank = "            0"
        block = [blank] * assured.ELEMENT_BLOCK_LINES
        block[12] = "            0            0            0            0            0            0"
        block[13] = "            0            0            0            0            0            0"
        block[14] = "            0            0            0"
        sections = {
            "ELEMENTS": block,
            "RIGID": ["      1.00000"],
        }
        with self.assertRaises(assured.ProjectionBlocked):
            assured._extract_element_projection(elements, sections)


if __name__ == "__main__":
    unittest.main()
