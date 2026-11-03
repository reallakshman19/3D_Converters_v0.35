import unittest

from tests.test_inputxml_pdf_input_echo_support import (
    compile_document,
    context_for,
    line_scope,
    make_text_pdf,
    one_line_report,
    report,
    pipe_block,
    state_lines,
)


class PdfInputEchoAdapterTests(unittest.TestCase):
    def test_extracted_text_passes_and_converts_bar_to_kpa(self):
        text = one_line_report()
        context = context_for(
            text,
            [line_scope("scope-L100", "PDF-L-100", [1, 2])],
        )
        root, ledger, validation = compile_document(text, context=context)
        self.assertIsNotNone(root)
        self.assertEqual("PASS", validation["status"])
        elements = root.findall("PIPINGMODEL/PIPINGELEMENT")
        self.assertEqual(2, len(elements))
        self.assertEqual("1000", elements[0].get("PRESSURE_C1"))
        self.assertEqual("1500", elements[0].get("HYDRO_PRESSURE"))
        self.assertEqual("114.3", elements[1].get("DIAMETER"))
        self.assertEqual("6.02", elements[1].get("WALL_THICK"))
        self.assertEqual("0", elements[0].get("DELTA_Y"))
        inherited = [
            row for row in ledger["records"]
            if row["sourceType"] == "PDF_INPUT_ECHO_INHERITANCE"
        ]
        self.assertTrue(inherited)
        self.assertTrue(all(
            row["sourceFields"]["lineScopeId"] == "scope-L100"
            for row in inherited
        ))
        proof = [
            row for row in ledger["records"]
            if row["sourceType"] == "PDF_INPUT_ECHO_SOURCE_ACCOUNTING"
        ][0]["sourceFields"]
        self.assertEqual("COMPLETE", proof["status"])
        self.assertTrue(all(value == 0 for value in proof["invariants"].values()))

    def test_raw_text_layer_pdf_passes_with_hash_bound_provenance(self):
        text = one_line_report(second_block=False)
        source = make_text_pdf(text)
        context = context_for(
            text,
            [line_scope("scope-L100", "PDF-L-100", [1])],
            extracted=False,
        )
        root, ledger, validation = compile_document(
            source,
            context=context,
            source_name="misleading-LINE-999-version-14.pdf",
        )
        self.assertIsNotNone(root)
        self.assertEqual("PASS", validation["status"])
        provenance = [
            row for row in ledger["records"]
            if row["sourceType"] == "PDF_INPUT_ECHO_PROVENANCE"
        ][0]["sourceFields"]
        self.assertEqual("PDF_TEXT_LAYER", provenance["textLayerSourceKind"])
        self.assertEqual(1, provenance["pageCount"])
        self.assertEqual(len(source), provenance["sourceDocumentByteLength"])
        self.assertEqual(64, len(provenance["sourceDocumentHashSha256"]))
        self.assertEqual("PDF-L-100", root.find("PIPINGMODEL/PIPINGELEMENT").get("LINE"))

    def test_optional_report_seconds_are_preserved(self):
        text = report(
            [pipe_block(10, 20, state=state_lines())],
            timestamp="Date: JUL 15, 2026 Time: 10:30:47",
        )
        context = context_for(
            text,
            [line_scope("scope-L100", "PDF-L-100", [1])],
        )
        root, _, validation = compile_document(text, context=context)
        self.assertEqual("PASS", validation["status"])
        self.assertEqual(
            "2026/07/15 10:30:47",
            root.find("PIPINGMODEL").get("TIME"),
        )

    def test_missing_report_timestamp_blocks_without_clock_default(self):
        text = report(
            [pipe_block(10, 20, state=state_lines())],
            timestamp=None,
        )
        context = context_for(
            text,
            [line_scope("scope-L100", "PDF-L-100", [1])],
        )
        root, ledger, validation = compile_document(text, context=context)
        self.assertIsNone(root)
        self.assertEqual("BLOCKED", validation["status"])
        self.assertTrue(any(
            "current-clock substitution is forbidden" in row["message"]
            for row in ledger["diagnostics"]
        ))

    def test_incomplete_restraint_semantics_are_preserved_and_block(self):
        text = one_line_report(
            second_block=False,
            extra_first=["RESTRAINTS", "Node 20 +Y"],
        )
        context = context_for(
            text,
            [line_scope("scope-L100", "PDF-L-100", [1])],
        )
        root, ledger, validation = compile_document(text, context=context)
        self.assertIsNotNone(root)
        self.assertEqual("BLOCKED", validation["status"])
        self.assertEqual([], root.findall("PIPINGMODEL/PIPINGELEMENT/RESTRAINT"))
        self.assertTrue(any(
            row["sourceType"] == "PDF_RESTRAINT_BLOCK"
            for row in ledger["records"]
        ))

    def test_valve_rigid_identity_blocks_generic_rigid_projection(self):
        text = one_line_report(
            second_block=False,
            extra_first=["RIGID Weight= 100 lb. Type=Valve"],
        )
        context = context_for(
            text,
            [line_scope("scope-L100", "PDF-L-100", [1])],
        )
        root, ledger, validation = compile_document(text, context=context)
        self.assertIsNotNone(root)
        self.assertEqual("BLOCKED", validation["status"])
        self.assertEqual(1, len(root.findall("PIPINGMODEL/PIPINGELEMENT/RIGID")))
        rigid = [
            row for row in ledger["records"]
            if row["sourceType"] == "PDF_RIGID"
        ][0]
        self.assertEqual("UNSUPPORTED_BLOCKING", rigid["disposition"])

    def test_extracted_text_requires_complete_provenance(self):
        text = one_line_report(second_block=False)
        context = {
            "version": "11.00",
            "north": [0, 1, 0],
            "sourceKind": "extracted-text",
            "lineScopes": [line_scope("scope-L100", "PDF-L-100", [1])],
        }
        root, _, validation = compile_document(text, context=context)
        self.assertIsNone(root)
        self.assertEqual("BLOCKED", validation["status"])


if __name__ == "__main__":
    unittest.main()
