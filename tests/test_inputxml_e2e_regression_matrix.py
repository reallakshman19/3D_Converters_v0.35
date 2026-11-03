import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "inputxml_e2e_regression_matrix.py"
spec = importlib.util.spec_from_file_location("inputxml_e2e_regression_matrix_test", MODULE_PATH)
matrix = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = matrix
spec.loader.exec_module(matrix)


class InputXmlEndToEndRegressionMatrixTests(unittest.TestCase):
    def test_all_registered_dialects_have_expected_full_chain_or_blocked_outcome(self):
        configured = os.environ.get("INPUTXML_PRG_OUTPUT_DIR")
        if configured:
            output_dir = Path(configured)
            output_dir.mkdir(parents=True, exist_ok=True)
            result = matrix.run_matrix(output_dir)
        else:
            with tempfile.TemporaryDirectory() as tmp:
                result = matrix.run_matrix(Path(tmp))
        self.assertEqual("PASS", result["status"], result["diagnostics"])
        self.assertEqual(15, result["summary"]["registeredDialectCount"])
        self.assertEqual(15, result["summary"]["caseCount"])
        self.assertEqual(13, result["summary"]["fullChainExpectedCount"])
        self.assertEqual(13, result["summary"]["fullChainPassCount"])
        self.assertEqual(2, result["summary"]["canonicalBlockedExpectedCount"])
        self.assertEqual(15, result["summary"]["passCount"])
        self.assertEqual(0, result["summary"]["failCount"])
        dialects = {row["dialect"] for row in result["cases"]}
        self.assertEqual(15, len(dialects))
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
