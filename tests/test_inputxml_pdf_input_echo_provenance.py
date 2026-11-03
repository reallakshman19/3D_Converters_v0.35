import copy
from io import BytesIO
import unittest

from lxml import etree as ET
from pypdf import PdfReader

from tests.test_inputxml_pdf_input_echo_support import (
    canonical_bytes,
    compile_document,
    context_for,
    extraction_provenance,
    line_scope,
    make_text_pdf,
    one_line_report,
    sha256,
)


class PdfInputEchoProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.text = one_line_report(second_block=False)
        self.scope = [line_scope("scope-L100", "PDF-L-100", [1])]

    def compile_with_provenance(self, provenance):
        context = {
            "version": "11.00",
            "north": [0, 1, 0],
            "sourceKind": "extracted-text",
            "extractionProvenance": provenance,
            "lineScopes": self.scope,
        }
        return compile_document(self.text, context=context)

    def restamp(self, provenance):
        row = copy.deepcopy(provenance)
        row.pop("provenanceHashSha256", None)
        row["provenanceHashSha256"] = sha256(canonical_bytes(row))
        return row

    def two_exact_pages(self):
        split_at = self.text.find("\n", len(self.text) // 3)
        self.assertGreater(split_at, 0)
        return self.text[:split_at], self.text[split_at + 1:]

    def assert_blocked(self, provenance):
        root, _, validation = self.compile_with_provenance(provenance)
        self.assertIsNone(root)
        self.assertEqual("BLOCKED", validation["status"])

    def test_missing_source_document_hash_blocks(self):
        provenance = extraction_provenance(self.text)
        del provenance["sourceDocumentHashSha256"]
        self.assert_blocked(provenance)

    def test_missing_or_generic_extractor_authority_blocks(self):
        for field, value in (
            ("extractorIdentity", ""),
            ("extractorIdentity", "caller-supplied"),
            ("extractorVersion", ""),
        ):
            with self.subTest(field=field, value=value):
                provenance = extraction_provenance(self.text)
                provenance[field] = value
                self.assert_blocked(self.restamp(provenance))

    def test_wrong_page_count_blocks_after_restamping(self):
        provenance = extraction_provenance(self.text)
        provenance["pageCount"] = 2
        self.assert_blocked(self.restamp(provenance))

    def test_reordered_page_manifest_blocks_after_restamping(self):
        page_one, page_two = self.two_exact_pages()
        provenance = extraction_provenance(
            self.text,
            page_texts=[page_one, page_two],
        )
        provenance["pages"] = list(reversed(provenance["pages"]))
        self.assert_blocked(self.restamp(provenance))

    def test_missing_page_manifest_entry_blocks_after_restamping(self):
        page_one, page_two = self.two_exact_pages()
        provenance = extraction_provenance(
            self.text,
            page_texts=[page_one, page_two],
        )
        provenance["pages"].pop()
        provenance["pageCount"] = 1
        self.assert_blocked(self.restamp(provenance))

    def test_altered_page_hash_blocks_after_restamping(self):
        provenance = extraction_provenance(self.text)
        provenance["pages"][0]["textHashSha256"] = "0" * 64
        self.assert_blocked(self.restamp(provenance))

    def test_extracted_text_hash_mismatch_blocks_after_restamping(self):
        provenance = extraction_provenance(self.text)
        provenance["extractedTextHashSha256"] = "f" * 64
        self.assert_blocked(self.restamp(provenance))

    def test_invalid_utf8_extracted_text_blocks(self):
        context = context_for(self.text, self.scope)
        root, _, validation = compile_document(
            b"\xff\xfeCAESAR II Input Echo",
            context=context,
        )
        self.assertIsNone(root)
        self.assertEqual("BLOCKED", validation["status"])

    def test_image_only_pdf_without_text_layer_blocks(self):
        blank_pdf = make_text_pdf("")
        context = context_for(self.text, self.scope, extracted=False)
        root, ledger, validation = compile_document(
            blank_pdf,
            context=context,
            source_name="scan-line-100.pdf",
        )
        self.assertIsNone(root)
        self.assertEqual("BLOCKED", validation["status"])
        self.assertTrue(any(
            "no authoritative text layer" in row["message"]
            for row in ledger["diagnostics"]
        ))

    def test_raw_pdf_repetition_is_byte_and_ledger_deterministic(self):
        source = make_text_pdf(self.text)
        context = context_for(self.text, self.scope, extracted=False)
        first = compile_document(source, context=context, source_name="input.pdf")
        second = compile_document(source, context=context, source_name="input.pdf")
        self.assertEqual("PASS", first[2]["status"])
        self.assertEqual("PASS", second[2]["status"])
        self.assertEqual(ET.tostring(first[0]), ET.tostring(second[0]))
        self.assertEqual(first[1], second[1])
        self.assertEqual(first[2], second[2])

    def test_raw_and_approved_extracted_text_emit_equal_elements(self):
        source = make_text_pdf(self.text)
        raw_context = context_for(self.text, self.scope, extracted=False)
        raw_root, _, raw_validation = compile_document(
            source,
            context=raw_context,
            source_name="input.pdf",
        )
        reader = PdfReader(BytesIO(source))
        extracted = "\n".join((page.extract_text() or "") for page in reader.pages)
        text_context = context_for(extracted, self.scope)
        text_root, _, text_validation = compile_document(
            extracted,
            context=text_context,
        )
        self.assertEqual("PASS", raw_validation["status"])
        self.assertEqual("PASS", text_validation["status"])
        raw_elements = raw_root.findall("PIPINGMODEL/PIPINGELEMENT")
        text_elements = text_root.findall("PIPINGMODEL/PIPINGELEMENT")
        self.assertEqual(
            [ET.tostring(row) for row in raw_elements],
            [ET.tostring(row) for row in text_elements],
        )


if __name__ == "__main__":
    unittest.main()
