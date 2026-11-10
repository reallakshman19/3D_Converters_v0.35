"""Focused F1–F3 reviewer counterexamples. No production CII/XML mutation.

Only test-local bytes and detached deep copies are altered.
"""
from __future__ import annotations
import copy
from dataclasses import replace
import unittest

from roundtrip_foundation.full_pointer_validation import (
    POINTER_FIELDS, validate_all_element_pointers)
from roundtrip_foundation.snapshot_replay import (
    Hold, parse_section_map, parse_control_counts, validate_serialized_cii)
from roundtrip_foundation.lineage import (
    reconcile_final_node_identities, validate_lineage_ledger)
from cii2019_section_rules import LINES_PER_AUX_BLOCK, format_control_rows
from test_roundtrip_foundation import ledger_for

ALL15 = set(POINTER_FIELDS)
NEW9 = ("EXPJT", "DISPLMNT", "FORCMNT", "UNIFORM", "WIND",
        "OFFSETS", "ALLOWBLS", "FLANGES", "EQUIPMNT")


def replace_pointer(cii: bytes, section: str, value: int, element_index: int = 1) -> bytes:
    lines = cii.decode("utf-8").splitlines(keepends=True)
    header = next(i for i, line in enumerate(lines) if line.startswith("#$ ELEMENTS"))
    row, slot, _ = POINTER_FIELDS[section]
    line_index = header + 1 + 15 * (element_index - 1) + row
    original = lines[line_index]
    start = 0 if slot == 0 else 15 + (slot - 1) * 13
    width = 15 if slot == 0 else 13
    assert len(original.rstrip("\r\n")) >= start+width, (section, original)
    lines[line_index] = original[:start] + str(value).rjust(width) + original[start+width:]
    return "".join(lines).encode("utf-8")


def with_one_real_section_record(cii: bytes, section: str) -> bytes:
    """Test only: insert properly-sized auxiliary rows + matching CONTROL count.

    This is NOT emitted engineering CII and is not used as a qualified baseline.
    """
    rows = parse_section_map(cii.decode("utf-8"))
    if rows[section]:
        return cii
    lines = cii.decode("utf-8").splitlines(keepends=True)
    section_header = next(i for i,l in enumerate(lines) if l.startswith("#$ "+section))
    width = 1 if section == "NODENAME" else LINES_PER_AUX_BLOCK[section]
    payload = ["  0\n" for _ in range(width)]
    if section == "FLANGES":
        payload[5] = "\n"  # deliberate blank field inside the real 12-row block
    lines[section_header+1:section_header+1] = payload
    ci = next(i for i,l in enumerate(lines) if l.startswith("#$ CONTROL"))
    count_field = POINTER_FIELDS[section][2]
    ctrl = replace(parse_control_counts(rows["CONTROL"]), **{count_field: 1})
    rewritten = format_control_rows(ctrl)
    lines[ci+1:ci+5] = [line + "\n" for line in rewritten]
    return "".join(lines).encode("utf-8")


class FullAuxiliaryPointerReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot, cls.cii, cls.receipt, cls.ledger = ledger_for()

    def test_valid_six_old_and_nine_new_zero_or_in_range(self):
        result = validate_all_element_pointers(self.cii)
        self.assertEqual(result["pointerFieldsValidated"], 15)
        self.assertEqual(set(result["recordCounts"]), ALL15)
        self.assertTrue(all(set(row) == ALL15 for row in result["elementPointers"]))
        self.assertEqual(validate_serialized_cii(self.cii)["pointerFieldsValidated"], 15)

    def test_nonzero_valid_pointer_with_matching_real_aux_count_for_each_new_slot(self):
        for section in NEW9:
            with self.subTest(section=section):
                cii = with_one_real_section_record(self.cii, section)
                cii = replace_pointer(cii, section, 1)
                report = validate_all_element_pointers(cii)
                self.assertEqual(report["elementPointers"][0][section], 1)
                self.assertGreaterEqual(report["recordCounts"][section], 1)

    def test_out_of_range_pointer_refused_in_every_new_slot(self):
        for section in NEW9:
            with self.subTest(section=section):
                cii = replace_pointer(self.cii, section, 9999)
                with self.assertRaises(Hold) as caught:
                    validate_serialized_cii(cii)
                self.assertEqual(caught.exception.code, "HOLD_CII_INVALID")

    def test_out_of_range_pointer_refused_in_every_legacy_slot(self):
        for section in ALL15-set(NEW9):
            with self.subTest(section=section):
                cii = replace_pointer(self.cii, section, 9999)
                with self.assertRaises(Hold) as caught:
                    validate_serialized_cii(cii)
                self.assertEqual(caught.exception.code, "HOLD_CII_INVALID")

    def test_control_count_nonzero_but_no_physical_aux_refused(self):
        for section in ("FLANGES", "EXPJT", "EQUIPMNT"):
            with self.subTest(section=section):
                cii = self.cii.decode("utf-8")
                rows = parse_section_map(cii)
                ctrl = replace(parse_control_counts(rows["CONTROL"]),
                               **{POINTER_FIELDS[section][2]: 1})
                old = "\n".join(rows["CONTROL"][:4])
                new = "\n".join(format_control_rows(ctrl))
                altered = cii.replace(old, new, 1).encode("utf-8")
                with self.assertRaises(Hold):
                    validate_all_element_pointers(altered)

    def test_wrong_aux_width_refused_even_if_control_is_zero(self):
        source = self.cii.decode("utf-8").replace("#$ FLANGES\n", "#$ FLANGES\n  0\n", 1)
        with self.assertRaises(Hold):
            validate_all_element_pointers(source.encode("utf-8"))

    def test_negative_and_fractional_pointers_refused(self):
        for value in (-1, "1.5"):
            with self.subTest(value=value):
                with self.assertRaises(Hold):
                    validate_all_element_pointers(replace_pointer(self.cii, "EQUIPMNT", value))


class FinalNodeIncidentEdgeReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot, cls.cii, _, cls.ledger = ledger_for()

    def test_f1_mixed_verified_unmatched_incident_preserves_only_candidate(self):
        elements = copy.deepcopy(self.ledger["elements"])
        node = next(n for n in self.ledger["finalNodes"]
                    if len(n["connectedElements"]) >= 2 and
                    n["lineageStatus"] in ("EXACT_UNIQUE","TRANSFORMED_WITH_LINEAGE"))
        old_candidate=node["sourceNodeIdentity"]
        unresolved_index=node["connectedElements"][-1]
        e = next(e for e in elements if e["elementIndex"]==unresolved_index)
        e["sourceEdgeIdentity"]=None
        e["lineageStatus"]="UNMATCHED"
        key = (node["branchName"], node["ciiNodeNumber"])
        final={(n["branchName"],n["ciiNodeNumber"]):copy.deepcopy(n)
               for n in self.ledger["finalNodes"]}
        reconcile_final_node_identities(elements, final, set())
        corrected=final[key]
        self.assertEqual(corrected["lineageStatus"],"UNMATCHED")
        self.assertIsNone(corrected["sourceNodeIdentity"])
        self.assertIn(old_candidate,corrected["sourceNodeCandidates"])
        self.assertIn(unresolved_index,corrected["unverifiedIncidentElements"])

    def test_f1_self_connecting_element_has_two_distinct_source_sides(self):
        synthetic=[{"elementIndex":1, "branchName":"/SELF",
                    "fromNode":"20", "toNode":"20",
                    "lineageStatus":"EXACT_UNIQUE",
                    "sourceEdgeIdentity":["SOURCE-A","SOURCE-B"]}]
        nodes={("/SELF","20"):{"branchName":"/SELF","ciiNodeNumber":"20",
                              "connectedElements":[1,1]}}
        reconcile_final_node_identities(synthetic,nodes,set())
        result=nodes[("/SELF","20")]
        self.assertEqual(result["lineageStatus"],"AMBIGUOUS")
        self.assertEqual(result["sourceNodeCandidates"],["SOURCE-A","SOURCE-B"])
        self.assertIsNone(result["sourceNodeIdentity"])

    def test_f1_reviewer_counterexample_forged_exact_rejected(self):
        altered=copy.deepcopy(self.ledger)
        n=next(n for n in altered["finalNodes"] if len(n["connectedElements"])>=2
               and n["sourceNodeIdentity"])
        victim=n["connectedElements"][-1]
        e=next(e for e in altered["elements"] if e["elementIndex"]==victim)
        e["sourceEdgeIdentity"]=None
        e["lineageStatus"]="UNMATCHED"
        with self.assertRaises(Hold) as caught:
            validate_lineage_ledger(altered,expected_snapshot=self.snapshot)
        self.assertEqual(caught.exception.code,"HOLD_LINEAGE_INVALID")


class AdversarialLineageIntegrityReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot, cls.cii, _, cls.ledger=ledger_for()

    def assert_reject(self, mutate):
        altered=copy.deepcopy(self.ledger)
        mutate(altered)
        with self.assertRaises(Hold) as caught:
            validate_lineage_ledger(altered,expected_snapshot=self.snapshot)
        self.assertEqual(caught.exception.code,"HOLD_LINEAGE_INVALID")

    def test_valid_foundation_ledger_still_accepted(self):
        receipt=validate_lineage_ledger(self.ledger,expected_snapshot=self.snapshot)
        self.assertEqual(receipt["status"],"PASS")
        self.assertEqual(receipt["allAuxiliaryPointerFieldsValidated"],15)
        self.assertGreater(receipt["relationshipsValidated"],0)

    def test_f3_fabricated_source_edge_identity_rejected(self):
        self.assert_reject(lambda d: d["elements"][0]["sourceEdgeIdentity"].__setitem__(0,"fake:0:0"))

    def test_f3_existing_but_wrong_source_identity_rejected(self):
        def mutate(d):
            target=d["elements"][0]
            other=next(n["identity"] for n in d["sourceNodes"]
                       if n["branchName"]!=target["branchName"])
            target["sourceEdgeIdentity"][0]=other
        self.assert_reject(mutate)

    def test_f3_missing_relationship_rejected(self):
        self.assert_reject(lambda d: d["relationships"].pop())

    def test_f3_fabricated_relationship_target_rejected(self):
        self.assert_reject(lambda d: d["relationships"][0].__setitem__("to","NODE:phantom:999"))

    def test_f3_duplicate_relationship_rejected(self):
        self.assert_reject(lambda d: d["relationships"].append(copy.deepcopy(d["relationships"][0])))

    def test_f3_missing_auxiliary_record_rejected(self):
        self.assert_reject(lambda d: d["auxiliaryRecords"].pop(0))

    def test_f3_inconsistent_auxiliary_link_rejected(self):
        self.assert_reject(lambda d: d["auxiliaryRecords"][0]["linkedElements"].append(999999))

    def test_f3_fabricated_auxiliary_ownership_source_rejected(self):
        target=next(i for i,a in enumerate(self.ledger["auxiliaryRecords"]) if a["section"]=="RIGID")
        self.assert_reject(lambda d: d["auxiliaryRecords"][target]["sourceOwners"].append("fake-owner"))

    def test_f3_invalid_element_pointer_rejected(self):
        self.assert_reject(lambda d: d["elements"][0]["pointers"].__setitem__("FLANGES",9999))

    def test_f3_changed_pointer_alias_rejected(self):
        self.assert_reject(lambda d: d["elements"][0].__setitem__("rigidPointer",9999))

    def test_f3_changed_element_count_rejected(self):
        self.assert_reject(lambda d: d["statistics"].__setitem__("finalCiiElements",9999))

    def test_f3_changed_final_node_count_rejected(self):
        self.assert_reject(lambda d: d["statistics"]["finalNodes"].__setitem__("count",9999))

    def test_f3_unmapped_original_node_rejected(self):
        self.assert_reject(lambda d: d["sourceNodes"].pop())

    def test_f3_python_source_identity_binding_rejected(self):
        def mutate(d):
            index=d["index"]["pythonNodeToOriginalSourceNode"]
            first=next(iter(index))
            index[first]="bogus-source"
        self.assert_reject(mutate)

    def test_f3_component_membership_rejected(self):
        self.assert_reject(lambda d: d["sourceComponents"][0]["sourceNodes"].append("bogus-source"))

    def test_f3_index_link_rejected(self):
        def mutate(d):
            first=next(iter(d["index"]["sourceNodeToElements"]))
            d["index"]["sourceNodeToElements"][first]=[99999]
        self.assert_reject(mutate)

    def test_f3_invalid_physical_mass_authority_rejected(self):
        self.assert_reject(lambda d: d.__setitem__("physicalMassAuthority","VERIFIED"))

    def test_f3_forged_final_node_transformation_status_rejected(self):
        def mutate(d):
            n=next(n for n in d["finalNodes"] if n["lineageStatus"]=="EXACT_UNIQUE")
            n["lineageStatus"]="TRANSFORMED_WITH_LINEAGE"
            n["transformation"]="PYTHON_RENUMBER"
            d["statistics"]["finalNodes"]["originalIdentityVerified"] -= 1
            d["statistics"]["finalNodes"]["generatedRenumberedWithLineage"] += 1
        self.assert_reject(mutate)

    def test_f3_forged_python_node_digest_rejected(self):
        self.assert_reject(lambda d: d["pythonPreprocessedNodes"][0].__setitem__(
            "sourceXmlDigest", "fake-stage-digest"))

    def test_f3_changed_rigid_component_ref_candidate_rejected(self):
        target=next(i for i,a in enumerate(self.ledger["auxiliaryRecords"])
                    if a["section"]=="RIGID" and a["ownerCandidates"])
        def mutate(d):
            a=d["auxiliaryRecords"][target]
            a["ownerCandidates"]=["FAKE-COMPONENT"]
            idx=d["index"]["rigidPointerToOwnerCandidates"][str(a["recordPointer"])]
            idx["componentRefs"]=["FAKE-COMPONENT"]
        self.assert_reject(mutate)

    def test_f3_fabricated_transformation_target_rejected(self):
        def mutate(d):
            event=next(x for x in d["transformations"] if x.get("sourceIdentity"))
            event["intermediateNodeIdentity"]="fake-processed-node"
            event.pop("outputIdentity",None)
        self.assert_reject(mutate)

if __name__ == "__main__":
    unittest.main()
