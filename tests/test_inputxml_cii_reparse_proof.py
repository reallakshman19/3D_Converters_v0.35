import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "converters" / "scripts"
CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"
sys.path.insert(0, str(SCRIPTS))


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


projection = load_module(
    "inputxml_to_cii2019_assured_projection_reparse_test",
    SCRIPTS / "inputxml_to_cii2019_assured_projection.py",
)
reparse = load_module(
    "cii2019_reparse_proof_test",
    SCRIPTS / "cii2019_reparse_proof.py",
)
PROJECTION_CONTRACT = json.loads(
    (CONTRACTS / "catalogs" / "inputxml-cii-projection-contract.json").read_text(encoding="utf-8")
)

CANONICAL = b'''<?xml version="1.0" encoding="UTF-8"?>
<CAESARII xmlns="COADE" VERSION="11.00" XML_TYPE="Input">
  <PIPINGMODEL xmlns="" JOBNAME="REPARSE_TEST" TIME="2026/07/15 12:00:00" ISSUE_NO="1" NUMELT="1" NUMNOZ="0" NOHGRS="0" NUMBEND="0" NUMRIGID="0" NUMEXPJNT="0" NUMREST="0" NUMFORCMNT="0" NUMUNFLOAD="0" NUMWIND="0" NUMELEOFF="0" NUMALLOW="0" NUMISECT="0" NORTH_X="0" NORTH_Y="1" NORTH_Z="0">
    <PIPINGELEMENT ID="E1" FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="114.3" WALL_THICK="6.02" MATERIAL_NUM="106" LINE="L1" FROM_X="0" FROM_Y="0" FROM_Z="0" TO_X="1000" TO_Y="0" TO_Z="0" FROM_NAME="N10" TO_NAME="N20"/>
  </PIPINGMODEL>
</CAESARII>
'''


def assurance():
    return {
        "schema": "InputXmlCiiAssuranceLedger.v1",
        "status": "PASS",
        "chain": {"canonicalHashSha256": hashlib.sha256(CANONICAL).hexdigest()},
        "gates": {
            "canonicalization": "PASS",
            "canonicalValidation": "PASS",
            "topologyTrace": "NOT_APPLICABLE",
            "topologyParity": "NOT_APPLICABLE",
            "ciiProjectionReadiness": "PASS",
        },
        "records": [
            {
                "assuranceRecordId": "IXAL-0000001",
                "sourceEntityId": "SRC-E1",
                "sourceType": "PIPE",
                "canonical": {"inputXmlElementIds": ["E1"]},
                "projection": {"sections": ["ELEMENTS", "COORDS", "NODENAME", "MISCEL_1"]},
                "status": "READY",
            }
        ],
        "assuranceHashSha256": "a" * 64,
    }


class Cii2019ReparseProofTests(unittest.TestCase):
    def generated(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "canonical.input.xml"
            path.write_bytes(CANONICAL)
            cii_text, ledger = projection.build_assured_projection(
                canonical_xml=CANONICAL,
                assurance=assurance(),
                projection_contract=PROJECTION_CONTRACT,
                canonical_path=path,
            )
        self.assertIsNotNone(cii_text, ledger["diagnostics"])
        self.assertEqual("PASS", ledger["status"])
        return cii_text, ledger

    def test_reparse_proof_passes_actual_writer_output(self):
        cii_text, ledger = self.generated()
        proof = reparse.build_reparse_proof(cii_text=cii_text, projection_ledger=ledger)
        self.assertEqual("PASS", proof["status"], proof["diagnostics"])
        self.assertEqual(1, proof["summary"]["elementCount"])
        self.assertEqual("10", proof["reparsed"]["elements"][0]["fromNode"])
        self.assertEqual("20", proof["reparsed"]["elements"][0]["toNode"])
        self.assertEqual([], reparse.validate_reparse_proof(proof))

    def test_hash_mismatch_blocks(self):
        cii_text, ledger = self.generated()
        lines = cii_text.splitlines()
        version_header = next(index for index, line in enumerate(lines) if line.strip() == "#$ VERSION")
        lines[version_header + 1] = lines[version_header + 1] + "X"
        mutated = "\n".join(lines) + ("\n" if cii_text.endswith("\n") else "")
        proof = reparse.build_reparse_proof(cii_text=mutated, projection_ledger=ledger)
        self.assertEqual("BLOCKED", proof["status"])
        self.assertTrue(any(row["code"] == "CII_HASH_MISMATCH" for row in proof["diagnostics"]))

    def test_projection_target_index_mismatch_blocks(self):
        cii_text, ledger = self.generated()
        broken = deepcopy(ledger)
        target = next(
            target
            for row in broken["records"]
            for target in row["targets"]
            if target["section"] == "ELEMENTS"
        )
        target["index"] = 99
        proof = reparse.build_reparse_proof(cii_text=cii_text, projection_ledger=broken)
        self.assertEqual("BLOCKED", proof["status"])
        self.assertTrue(any(row["code"] == "TARGET_INDEX_INVALID" for row in proof["diagnostics"]))

    def test_element_pointer_mismatch_blocks(self):
        cii_text, ledger = self.generated()
        broken = deepcopy(ledger)
        broken["elements"][0]["pointers"]["RIGID"] = 7
        proof = reparse.build_reparse_proof(cii_text=cii_text, projection_ledger=broken)
        self.assertEqual("BLOCKED", proof["status"])
        self.assertTrue(any(row["code"] == "ELEMENT_POINTER_MISMATCH" for row in proof["diagnostics"]))


if __name__ == "__main__":
    unittest.main()
