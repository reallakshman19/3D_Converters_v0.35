import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]

_CHILD = r'''
import json
from lxml import etree as ET
from tests.test_inputxml_pdf_input_echo_line_scope import two_line_report, two_scopes
from tests.test_inputxml_pdf_input_echo_support import compile_document, context_for
text = two_line_report()
context = context_for(text, two_scopes())
root, ledger, validation = compile_document(text, context=context)
result = {
    "canonical": ET.tostring(
        root,
        xml_declaration=True,
        encoding="UTF-8",
        pretty_print=True,
    ).decode("utf-8"),
    "ledger": ledger,
    "validation": validation,
}
print(json.dumps(result, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
'''

_CRLF_CHILD = r'''
import json
from lxml import etree as ET
from tests.test_inputxml_pdf_input_echo_support import (
    compile_document, context_for, line_scope, one_line_report
)
text = one_line_report(second_block=False)
source = text.replace("\n", "\r\n")
context = context_for(text, [line_scope("scope-A", "LINE-A", [1])])
root, ledger, validation = compile_document(source, context=context)
print(json.dumps({
    "canonical": ET.tostring(root, encoding="unicode"),
    "ledger": ledger,
    "validation": validation,
}, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
'''


class PdfInputEchoDeterminismTests(unittest.TestCase):
    def run_child(self, script, seed):
        env = dict(os.environ)
        env["PYTHONHASHSEED"] = str(seed)
        completed = subprocess.run(
            [sys.executable, "-c", script],
            cwd=ROOT,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )
        return completed.stdout

    def test_exact_bytes_across_processes_and_hash_seeds(self):
        outputs = [self.run_child(_CHILD, seed) for seed in (1, 7, 101, 999)]
        self.assertEqual(1, len(set(outputs)))
        parsed = json.loads(outputs[0])
        self.assertEqual("PASS", parsed["validation"]["status"])
        proof = [
            row for row in parsed["ledger"]["records"]
            if row["sourceType"] == "PDF_INPUT_ECHO_SOURCE_ACCOUNTING"
        ][0]["sourceFields"]
        self.assertEqual("COMPLETE", proof["status"])

    def test_utf8_newline_normalization_is_process_deterministic(self):
        outputs = [self.run_child(_CRLF_CHILD, seed) for seed in (2, 11, 203)]
        self.assertEqual(1, len(set(outputs)))
        parsed = json.loads(outputs[0])
        self.assertEqual("PASS", parsed["validation"]["status"])


if __name__ == "__main__":
    unittest.main()
