"""Executable safety tests for XML-CII2019-CODER-QUALIFICATION-SAMPLE-R1.

Run from repo root:
    python3 qualification/build_evidence.py --out qualification
    python3 -m unittest qualification/test_verified_weight_edit.py -v
"""
import copy
from decimal import Decimal
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from verified_weight_edit import (
    apply_verified_xml_weight_edit, cii_inventory, create_snapshot,
    pinned_options, run_converter, sha, source_identity, source_nodes,
)
from build_evidence import duplicate_number_branches

XML = (Path(__file__).resolve().parent / "original.xml").read_bytes()


class VerifiedWeightSample(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original_cii, _ = run_converter(XML, {"options": pinned_options()})
        cls.snapshot = create_snapshot(XML, cls.original_cii)
        cls.nodes, _ = source_nodes(XML)
        cls.identity = source_identity(cls.snapshot, cls.nodes[1])

    def edit(self, xml=XML, cii=None, snapshot=None, identity=None,
             weight="2.984", approved=True, cii_weight=None):
        return apply_verified_xml_weight_edit(
            original_xml=xml, original_cii=cii if cii is not None else self.original_cii,
            conversion_snapshot=snapshot if snapshot is not None else self.snapshot,
            source_identity=identity if identity is not None else self.identity,
            proposed_weight_kg=weight if cii_weight is None else None,
            proposed_cii_weight=cii_weight, approved=approved)

    def assert_refusal(self, result, expected):
        self.assertFalse(result["ok"], result)
        self.assertEqual(result["code"], expected, result)
        self.assertIsNone(result["revisedXml"])
        self.assertIsNone(result["regeneratedCii"])
        self.assertIsNone(result["audit"])

    def test_positive_real_converter_source_15_to_2_984(self):
        result = self.edit()
        self.assertTrue(result["ok"], result)
        self.assertEqual(cii_inventory(result["regeneratedCii"])["rigidWeights"][0], Decimal("29.84"))
        self.assertEqual(cii_inventory(self.original_cii)["rigidWeights"][0], Decimal("150"))
        self.assertEqual(result["revisedXml"],
                         XML.replace(b"<Weight>15</Weight>", b"<Weight>2.984</Weight>"))
        self.assertEqual(result["audit"]["xmlUnrelatedByteDifferences"], 0)
        self.assertEqual(result["audit"]["ciiIntegrity"]["unexplainedEngineeringByteDifferences"], 0)
        self.assertTrue(result["audit"]["pointerIsNotSourceIdentity"])

    def test_positive_accepts_explicit_cii_value_converted_to_kg(self):
        result = self.edit(cii_weight="29.84")
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["audit"]["sourceWeightKgAfter"], "2.984")
        self.assertEqual(Decimal(result["audit"]["ciiWeightAfter"]), Decimal("29.84"))

    def test_exact_no_edit_sha_byte_parity(self):
        rerun, _ = run_converter(XML, self.snapshot)
        self.assertEqual(rerun, self.original_cii)
        self.assertEqual(sha(rerun), sha(self.original_cii))
        self.assertEqual(len(rerun), len(self.original_cii))

    def test_negative_A_same_number_different_branch_requires_context(self):
        ambiguous = duplicate_number_branches(XML)
        nodes, _ = source_nodes(ambiguous)
        self.assertEqual(sum(n["nodeNumber"] == "110" for n in nodes), 2)
        original_cii, _ = run_converter(ambiguous, {"options": pinned_options()})
        snapshot = create_snapshot(ambiguous, original_cii)
        self.assert_refusal(self.edit(
            xml=ambiguous, cii=original_cii, snapshot=snapshot,
            identity={"nodeNumber": "110"}), "HOLD_SOURCE_OWNER")

    def test_negative_B_stale_original_xml_fingerprint(self):
        altered = XML.replace(b"<Weight>15</Weight>", b"<Weight>16</Weight>")
        self.assert_refusal(self.edit(xml=altered), "HOLD_STALE_SOURCE")

    def test_negative_C_generated_node_without_source_lineage(self):
        fake_identity = {**self.identity, "nodeNumber": "10020"}
        self.assert_refusal(self.edit(identity=fake_identity), "HOLD_SOURCE_OWNER")

    def test_negative_D_unapproved_catalog_suggestion(self):
        self.assert_refusal(self.edit(approved=False), "HOLD_UNAPPROVED")

    def test_wrong_converter_config_or_runtime_hash_blocked(self):
        bad = copy.deepcopy(self.snapshot)
        bad["options"]["weightScale"] = "1"
        self.assert_refusal(self.edit(snapshot=bad), "HOLD_UNQUALIFIED_SETTINGS")
        bad2 = copy.deepcopy(self.snapshot)
        bad2["converterFilesSha256"]["xml_to_cii2019.py"] = "fake"
        self.assert_refusal(self.edit(snapshot=bad2), "HOLD_CONVERTER_IDENTITY")

    def test_tampered_original_cii_refused(self):
        corrupted = self.original_cii.replace(b"150", b"151")
        if corrupted == self.original_cii:
            corrupted = self.original_cii + b"\n"
        self.assert_refusal(self.edit(cii=corrupted), "HOLD_STALE_CII")

    def test_missing_mass_approval_or_negative_proposal_refused(self):
        self.assert_refusal(self.edit(weight="-1"), "REFUSE_WEIGHT_FORMAT")
        self.assert_refusal(self.edit(weight="NaN"), "REFUSE_WEIGHT_FORMAT")

if __name__ == "__main__":
    unittest.main()
