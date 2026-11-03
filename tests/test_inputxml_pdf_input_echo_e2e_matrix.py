from dataclasses import replace
import os
import tempfile
import unittest
from pathlib import Path

from scripts import inputxml_e2e_regression_matrix as matrix
from tests.test_inputxml_pdf_input_echo_support import (
    extraction_provenance,
    line_scope,
)

_ORIGINAL_CASES = matrix.matrix_cases


def pr8_matrix_cases():
    result = []
    for case in _ORIGINAL_CASES():
        if case.case_id != "pdf-input-echo":
            result.append(case)
            continue
        text = case.source.decode("utf-8", errors="strict")
        context = {
            **case.context,
            "sourceKind": "extracted-text",
            "extractionProvenance": extraction_provenance(
                text,
                source_document=b"approved-prg-pdf-source-document",
                extractor_identity="pr8-e2e-approved-extractor",
                extractor_version="1.0.0",
            ),
            "lineScopes": [
                line_scope("prg-pdf-scope-1", "PRG-L-100", [1])
            ],
        }
        context.pop("lineId", None)
        context.pop("defaultLine", None)
        context.pop("extractor", None)
        result.append(replace(case, context=context))
    return result


matrix.matrix_cases = pr8_matrix_cases
matrix._legacy.matrix_cases = pr8_matrix_cases


class PdfInputEchoEndToEndMatrixTests(unittest.TestCase):
    def test_all_registered_dialects_preserve_full_chain_gate(self):
        configured = os.environ.get("INPUTXML_PRG_OUTPUT_DIR")
        if configured:
            output_dir = Path(configured)
            output_dir.mkdir(parents=True, exist_ok=True)
            result = matrix.run_matrix(output_dir)
        else:
            with tempfile.TemporaryDirectory() as tmp:
                result = matrix.run_matrix(Path(tmp))
        self.assertEqual("PASS", result["status"], result["diagnostics"])
        self.assertEqual(14, result["summary"]["registeredDialectCount"])
        self.assertEqual(14, result["summary"]["caseCount"])
        self.assertEqual(12, result["summary"]["fullChainExpectedCount"])
        self.assertEqual(12, result["summary"]["fullChainPassCount"])
        self.assertEqual(2, result["summary"]["canonicalBlockedExpectedCount"])
        self.assertEqual(14, result["summary"]["passCount"])
        self.assertEqual(0, result["summary"]["failCount"])
        dialects = {row["dialect"] for row in result["cases"]}
        self.assertEqual(14, len(dialects))
        for row in result["cases"]:
            if row["expected"] == "FULL_CHAIN_PASS":
                self.assertEqual("PASS", row["canonicalStatus"], row)
                self.assertEqual("PASS", row["assuranceStatus"], row)
                self.assertEqual("PASS", row["projectionStatus"], row)
                self.assertEqual("PASS", row["reparseStatus"], row)
            else:
                self.assertEqual("BLOCKED", row["canonicalStatus"], row)
                self.assertEqual("NOT_RUN", row["assuranceStatus"], row)
                self.assertEqual("NOT_RUN", row["projectionStatus"], row)
                self.assertEqual("NOT_RUN", row["reparseStatus"], row)


if __name__ == "__main__":
    unittest.main()
