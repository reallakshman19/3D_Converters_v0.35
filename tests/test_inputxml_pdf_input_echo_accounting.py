import copy
import unittest

from scripts.inputxml_compiler.base import DecisionLedger
from scripts.inputxml_compiler.counts import _new_root
from scripts.inputxml_compiler.pdf_input_echo_accounting import (
    verify_pdf_input_echo_accounting,
)
from scripts.inputxml_compiler.pdf_input_echo_provenance import (
    extract_input_echo_text,
)
from scripts.inputxml_compiler.pdf_input_echo_runtime import (
    _input_echo_blocks,
    _strict_report_header,
    compile_pdf_input_echo_source,
)
from scripts.inputxml_compiler.pdf_input_echo_scopes import validate_line_scopes
from scripts.inputxml_compiler.pdf_input_echo_state import resolve_line_scoped_blocks
from tests.test_inputxml_pdf_input_echo_line_scope import (
    two_line_report,
    two_scopes,
)
from tests.test_inputxml_pdf_input_echo_support import (
    context_for,
    line_scope,
    one_line_report,
    pipe_block,
    report,
    state_lines,
)


class PdfInputEchoAccountingTests(unittest.TestCase):
    def build(self, text, scopes):
        context = context_for(text, scopes)
        ledger = DecisionLedger(
            source_repository="reallaksh19/3D_Converters",
            source_path="test://pdf-accounting",
            producer="pdf-accounting-test",
            dialect="pdf-input-echo",
        )
        root = compile_pdf_input_echo_source(
            text.encode("utf-8"),
            source_name="input.txt",
            ledger=ledger,
            context=context,
            root_factory=_new_root,
        )
        evidence_ledger = DecisionLedger(
            source_repository=ledger.source_repository,
            source_path=ledger.source_path,
            producer=ledger.producer,
            dialect=ledger.dialect,
        )
        extracted, provenance = extract_input_echo_text(
            text.encode("utf-8"),
            source_name="input.txt",
            context=context,
        )
        job, date, time = _strict_report_header(extracted)
        blocks = _input_echo_blocks(extracted)
        validated_scopes, by_block, _ = validate_line_scopes(
            context,
            block_count=len(blocks),
        )
        resolved = resolve_line_scoped_blocks(
            blocks,
            by_block,
            evidence_ledger,
        )
        return {
            "model": root.find("PIPINGMODEL"),
            "ledger": ledger,
            "provenance": provenance,
            "reportHeader": {"jobName": job, "date": date, "time": time},
            "scopes": validated_scopes,
            "blocks": blocks,
            "resolved": resolved,
        }

    def verify(self, fixture, *, unsupported=None, unparsed=None):
        return verify_pdf_input_echo_accounting(
            fixture["model"],
            ledger=fixture["ledger"],
            provenance=fixture["provenance"],
            report_header=fixture["reportHeader"],
            scopes=fixture["scopes"],
            blocks=fixture["blocks"],
            resolved=fixture["resolved"],
            unsupported_section_ids=unsupported or [],
            unparsed_evidence_ids=unparsed or [],
        )

    def state_record(self, fixture, entity_id, field):
        source_id = f"{entity_id}@{field}"
        return next(
            row for row in fixture["ledger"].records
            if row["sourceEntityId"] == source_id
        )

    def element(self, fixture, entity_id):
        return next(
            row for row in fixture["model"].findall("PIPINGELEMENT")
            if row.get("ID") == entity_id
        )

    def assert_reason(self, proof, collection, reason):
        self.assertTrue(
            any(row.get("reason") == reason for row in proof[collection]),
            proof[collection],
        )

    def three_block_report(self, *, repeated_explicit=False):
        second_state = ["Dia= 114.3 mm."] if repeated_explicit else None
        return report([
            pipe_block(10, 20, name="FIRST", state=state_lines()),
            pipe_block(20, 30, axis="DY", length="500", name="SECOND", state=second_state),
            pipe_block(30, 40, axis="DZ", length="250", name="THIRD"),
        ])

    def test_baseline_proof_is_complete(self):
        fixture = self.build(one_line_report(), [
            line_scope("scope-A", "LINE-A", [1, 2]),
        ])
        status, proof = self.verify(fixture)
        self.assertEqual("COMPLETE", status)
        self.assertTrue(all(value == 0 for value in proof["invariants"].values()))
        self.assertEqual(
            proof["expectedStateDecisionHashSha256"],
            proof["actualStateDecisionHashSha256"],
        )

    def test_valid_line_id_substituted_onto_wrong_blocks_still_blocks(self):
        fixture = self.build(two_line_report(), two_scopes())
        first = fixture["model"].findall("PIPINGELEMENT")[0]
        first.set("LINE", "LINE-B")
        for row in fixture["ledger"].records:
            if "PDF-PE-000001" in (row.get("canonicalElementIds") or []):
                fields = row.get("sourceFields")
                if isinstance(fields, dict) and "lineId" in fields:
                    fields["lineId"] = "LINE-B"
        status, proof = self.verify(fixture)
        self.assertEqual("BLOCKED", status)
        self.assertGreater(proof["invariants"]["elementLineMismatchCount"], 0)

    def test_inheritance_predecessor_from_another_line_blocks(self):
        fixture = self.build(two_line_report(), two_scopes())
        record = self.state_record(fixture, "PDF-PE-000002", "DIAMETER")
        record["sourceFields"]["predecessorLineScopeId"] = "scope-B"
        record["sourceFields"]["predecessorBlockId"] = "PDF-BLOCK-000003"
        record["sourceFields"]["predecessorElementId"] = "PDF-PE-000003"
        status, proof = self.verify(fixture)
        self.assertEqual("BLOCKED", status)
        self.assertEqual(1, proof["invariants"]["crossLineInheritanceCount"])

    def test_removed_source_block_record_blocks(self):
        fixture = self.build(one_line_report(), [
            line_scope("scope-A", "LINE-A", [1, 2]),
        ])
        fixture["ledger"].records = [
            row for row in fixture["ledger"].records
            if row["sourceEntityId"] != "PDF-BLOCK-000002"
        ]
        status, proof = self.verify(fixture)
        self.assertEqual("BLOCKED", status)
        self.assertGreater(proof["invariants"]["blockRecordMismatchCount"], 0)

    def test_source_block_element_cardinality_mismatch_blocks(self):
        fixture = self.build(one_line_report(), [
            line_scope("scope-A", "LINE-A", [1, 2]),
        ])
        fixture["model"].remove(fixture["model"].findall("PIPINGELEMENT")[1])
        status, proof = self.verify(fixture)
        self.assertEqual("BLOCKED", status)
        self.assertEqual(
            1,
            proof["invariants"]["blockElementCardinalityMismatchCount"],
        )

    def test_duplicate_state_decision_blocks_last_value_wins_attempt(self):
        fixture = self.build(one_line_report(), [
            line_scope("scope-A", "LINE-A", [1, 2]),
        ])
        record = self.state_record(fixture, "PDF-PE-000002", "DIAMETER")
        duplicate = copy.deepcopy(record)
        duplicate["recordId"] = "IXCC-TAMPER-DUPLICATE"
        duplicate["sourceFields"]["value"] = "999"
        fixture["ledger"].records.append(duplicate)
        status, proof = self.verify(fixture)
        self.assertEqual("BLOCKED", status)
        self.assertEqual(1, proof["invariants"]["duplicateStateDecisionCount"])

    def test_restamped_provenance_ledger_tamper_blocks(self):
        fixture = self.build(one_line_report(second_block=False), [
            line_scope("scope-A", "LINE-A", [1]),
        ])
        provenance = next(
            row for row in fixture["ledger"].records
            if row["sourceType"] == "PDF_INPUT_ECHO_PROVENANCE"
        )
        provenance["sourceFields"] = copy.deepcopy(provenance["sourceFields"])
        provenance["sourceFields"]["sourceDocumentHashSha256"] = "f" * 64
        provenance["sourceFields"]["provenanceHashSha256"] = "e" * 64
        status, proof = self.verify(fixture)
        self.assertEqual("BLOCKED", status)
        self.assertEqual(1, proof["invariants"]["provenanceMismatchCount"])

    def test_unaccounted_unsupported_section_blocks(self):
        text = one_line_report(
            second_block=False,
            extra_first=["HANGERS"],
        )
        fixture = self.build(text, [line_scope("scope-A", "LINE-A", [1])])
        expected = ["document/section/HANGERS"]
        fixture["ledger"].records = [
            row for row in fixture["ledger"].records
            if row["sourceType"] != "PDF_UNSUPPORTED_REPORT_SECTION"
        ]
        status, proof = self.verify(fixture, unsupported=expected)
        self.assertEqual("BLOCKED", status)
        self.assertEqual(
            1,
            proof["invariants"]["unsupportedSectionAccountingMismatchCount"],
        )

    def test_restamped_inherited_value_and_xml_substitution_blocks(self):
        fixture = self.build(one_line_report(), [
            line_scope("scope-A", "LINE-A", [1, 2]),
        ])
        record = self.state_record(fixture, "PDF-PE-000002", "DIAMETER")
        record["sourceFields"]["value"] = "168.3"
        self.element(fixture, "PDF-PE-000002").set("DIAMETER", "168.3")
        status, proof = self.verify(fixture)
        self.assertEqual("BLOCKED", status)
        self.assertGreater(proof["invariants"]["stateDecisionSemanticMismatchCount"], 0)
        self.assertGreater(proof["invariants"]["stateDecisionSourceXmlMismatchCount"], 0)
        self.assertEqual(0, proof["invariants"]["stateDecisionLedgerXmlMismatchCount"])

    def test_restamped_explicit_value_and_xml_substitution_blocks(self):
        fixture = self.build(one_line_report(), [
            line_scope("scope-A", "LINE-A", [1, 2]),
        ])
        record = self.state_record(fixture, "PDF-PE-000001", "DIAMETER")
        record["sourceFields"]["value"] = "168.3"
        self.element(fixture, "PDF-PE-000001").set("DIAMETER", "168.3")
        status, proof = self.verify(fixture)
        self.assertEqual("BLOCKED", status)
        self.assertGreater(proof["invariants"]["stateDecisionSemanticMismatchCount"], 0)
        self.assertGreater(proof["invariants"]["stateDecisionSourceXmlMismatchCount"], 0)

    def test_explicit_to_inherited_classification_substitution_blocks(self):
        fixture = self.build(one_line_report(), [
            line_scope("scope-A", "LINE-A", [1, 2]),
        ])
        record = self.state_record(fixture, "PDF-PE-000001", "DIAMETER")
        record["sourceType"] = "PDF_INPUT_ECHO_INHERITANCE"
        record["disposition"] = "INHERIT_SAME_LINE_SCOPE"
        status, proof = self.verify(fixture)
        self.assertEqual("BLOCKED", status)
        mismatch = next(
            row for row in proof["stateDecisionSemanticMismatches"]
            if row["sourceEntityId"] == "PDF-PE-000001@DIAMETER"
        )
        self.assertIn("sourceType", mismatch["differences"])

    def test_false_same_scope_label_cannot_hide_cross_line_predecessor(self):
        fixture = self.build(two_line_report(), two_scopes())
        record = self.state_record(fixture, "PDF-PE-000002", "DIAMETER")
        record["sourceFields"]["predecessorBlockId"] = "PDF-BLOCK-000003"
        record["sourceFields"]["predecessorElementId"] = "PDF-PE-000003"
        record["sourceFields"]["predecessorLineScopeId"] = "scope-A"
        status, proof = self.verify(fixture)
        self.assertEqual("BLOCKED", status)
        self.assert_reason(
            proof,
            "stateDecisionPredecessorOwnershipMismatches",
            "predecessor-cross-scope",
        )

    def test_non_latest_same_line_predecessor_blocks(self):
        text = self.three_block_report()
        fixture = self.build(text, [line_scope("scope-A", "LINE-A", [1, 2, 3])])
        record = self.state_record(fixture, "PDF-PE-000003", "DIAMETER")
        record["sourceFields"]["predecessorBlockId"] = "PDF-BLOCK-000001"
        record["sourceFields"]["predecessorElementId"] = "PDF-PE-000001"
        status, proof = self.verify(fixture)
        self.assertEqual("BLOCKED", status)
        self.assert_reason(
            proof,
            "stateDecisionPredecessorOwnershipMismatches",
            "predecessor-not-latest",
        )

    def test_same_value_wrong_explicit_origin_blocks(self):
        text = self.three_block_report(repeated_explicit=True)
        fixture = self.build(text, [line_scope("scope-A", "LINE-A", [1, 2, 3])])
        record = self.state_record(fixture, "PDF-PE-000003", "DIAMETER")
        record["sourceFields"]["originBlockId"] = "PDF-BLOCK-000001"
        record["sourceFields"]["originElementId"] = "PDF-PE-000001"
        status, proof = self.verify(fixture)
        self.assertEqual("BLOCKED", status)
        self.assert_reason(
            proof,
            "stateDecisionOriginOwnershipMismatches",
            "origin-not-authoritative",
        )

    def test_duplicate_identical_state_decision_blocks(self):
        fixture = self.build(one_line_report(), [
            line_scope("scope-A", "LINE-A", [1, 2]),
        ])
        duplicate = copy.deepcopy(
            self.state_record(fixture, "PDF-PE-000002", "DIAMETER")
        )
        duplicate["recordId"] = "IXCC-TAMPER-IDENTICAL"
        fixture["ledger"].records.append(duplicate)
        status, proof = self.verify(fixture)
        self.assertEqual("BLOCKED", status)
        self.assertEqual(1, proof["invariants"]["duplicateStateDecisionCount"])
        self.assert_reason(
            proof,
            "stateDecisionCardinalityMismatches",
            "duplicate",
        )

    def test_valid_owner_and_xml_restamp_cannot_reassign_decision(self):
        fixture = self.build(one_line_report(), [
            line_scope("scope-A", "LINE-A", [1, 2]),
        ])
        record = self.state_record(fixture, "PDF-PE-000001", "DIAMETER")
        record["sourceFields"]["value"] = "168.3"
        record["canonicalElementIds"] = ["PDF-PE-000002"]
        record["InputXMLElementIds"] = ["PDF-PE-000002"]
        self.element(fixture, "PDF-PE-000002").set("DIAMETER", "168.3")
        status, proof = self.verify(fixture)
        self.assertEqual("BLOCKED", status)
        mismatch = next(
            row for row in proof["stateDecisionSemanticMismatches"]
            if row["sourceEntityId"] == "PDF-PE-000001@DIAMETER"
        )
        self.assertIn("canonicalElementIds", mismatch["differences"])
        self.assertIn("InputXMLElementIds", mismatch["differences"])

    def test_valid_line_scope_and_xml_line_restamp_blocks(self):
        fixture = self.build(two_line_report(), two_scopes())
        record = self.state_record(fixture, "PDF-PE-000001", "DIAMETER")
        record["sourceFields"]["lineScopeId"] = "scope-B"
        record["sourceFields"]["lineId"] = "LINE-B"
        self.element(fixture, "PDF-PE-000001").set("LINE", "LINE-B")
        status, proof = self.verify(fixture)
        self.assertEqual("BLOCKED", status)
        self.assertGreater(proof["invariants"]["stateDecisionLineOwnershipMismatchCount"], 0)
        self.assertGreater(proof["invariants"]["elementLineMismatchCount"], 0)

    def test_equal_count_field_replacement_blocks(self):
        fixture = self.build(one_line_report(), [
            line_scope("scope-A", "LINE-A", [1, 2]),
        ])
        diameter = self.state_record(fixture, "PDF-PE-000002", "DIAMETER")
        replacement = copy.deepcopy(
            self.state_record(fixture, "PDF-PE-000002", "WALL_THICK")
        )
        replacement["recordId"] = "IXCC-TAMPER-REPLACEMENT"
        fixture["ledger"].records.remove(diameter)
        fixture["ledger"].records.append(replacement)
        status, proof = self.verify(fixture)
        self.assertEqual("BLOCKED", status)
        self.assertEqual(0, proof["invariants"]["stateDecisionCountMismatchCount"])
        self.assertEqual(1, proof["invariants"]["missingStateDecisionCount"])
        self.assertEqual(1, proof["invariants"]["duplicateStateDecisionCount"])
        self.assertGreater(
            proof["invariants"]["stateDecisionUniqueIdentityMismatchCount"],
            0,
        )


if __name__ == "__main__":
    unittest.main()
