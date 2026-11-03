import unittest

from scripts.inputxml_compiler.base import CompileBlocked
from scripts.inputxml_compiler.managed_stage_bridge_io import strict_json_object
from scripts.inputxml_compiler.managed_stage_intake import strict_json_loads
from tests.managed_stage_test_support import CONTEXT, build_intake, ledger


class ManagedStageUnicodeIntakeTests(unittest.TestCase):
    def test_lone_surrogates_block_before_node_execution(self):
        for token in (b'"\\ud800"', b'"\\udc00"'):
            with self.subTest(token=token):
                source = b'[{"name":' + token + b',"type":"BRANCH","attributes":{},"children":[]}]'
                with self.assertRaisesRegex(CompileBlocked, "unpaired"):
                    strict_json_loads(source)

    def test_valid_non_bmp_and_separator_strings_are_accepted(self):
        source = '[{"name":"😀  ","type":"BRANCH","attributes":{},"children":[]}]'.encode("utf-8")
        _, value = strict_json_loads(source)
        self.assertEqual("😀  ", value[0]["name"])

    def test_source_name_and_context_surrogates_block_at_intake(self):
        with self.assertRaises(CompileBlocked):
            build_intake(name="bad\ud800.json")
        context = dict(CONTEXT, jobName="bad\udc00")
        with self.assertRaises(CompileBlocked):
            build_intake(context=context)

    def test_bridge_result_lone_surrogate_is_registered_invalid_json(self):
        with self.assertRaises(CompileBlocked):
            strict_json_object(b'{"value":"\\ud800"}', ledger("bridge-result.json"))


if __name__ == "__main__":
    unittest.main()
