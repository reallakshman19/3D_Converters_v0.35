import json
import unittest

from scripts.inputxml_compiler.base import CompileBlocked
from scripts.inputxml_compiler.managed_stage_intake import (
    managed_stage_root_predicate,
    strict_json_loads,
)
from tests.managed_stage_test_support import (
    CONTEXT,
    build_intake,
    pipe,
    source_value,
)


class ManagedStageStrictIntakeTests(unittest.TestCase):
    def test_approved_root_forms(self):
        cases = (
            (None, "TOP_LEVEL_ARRAY", "$"),
            ("objects", "OBJECTS_WRAPPER", "$.objects"),
            ("hierarchy", "HIERARCHY_WRAPPER", "$.hierarchy"),
            ("branches", "BRANCHES_WRAPPER", "$.branches"),
        )
        for wrapper, form, path in cases:
            with self.subTest(wrapper=wrapper):
                intake, _ = build_intake(source_value(wrapper=wrapper))
                self.assertEqual(form, intake.root_form)
                self.assertEqual(path, intake.branch_collection_path)
                self.assertEqual(1, len(intake.branches))

    def test_root_variants_are_semantically_equivalent(self):
        identities = []
        for wrapper in (None, "objects", "hierarchy", "branches"):
            intake, _ = build_intake(source_value(wrapper=wrapper))
            identities.append((
                intake.branches[0]["children"][0]["attributes"]["REF"],
                intake.branches[0]["children"][0]["enrichedAttributes"]["lineNo"],
            ))
        self.assertTrue(all(value == identities[0] for value in identities[1:]))

    def test_competing_branch_collections_are_ambiguous(self):
        value = {
            "objects": source_value(),
            "branches": source_value(),
        }
        with self.assertRaises(CompileBlocked):
            build_intake(value)

    def test_empty_collection_blocks(self):
        for value in ([], {"objects": []}, {"hierarchy": []}, {"branches": []}):
            with self.subTest(value=value):
                with self.assertRaises(CompileBlocked):
                    build_intake(value)

    def test_unrelated_and_scalar_roots_are_not_managed_stage(self):
        for value in ({"hello": "world"}, "text", 1, None, True):
            with self.subTest(value=value):
                self.assertFalse(managed_stage_root_predicate(value))

    def test_duplicate_keys_rejected_at_every_depth(self):
        sources = (
            b'{"objects":[],"objects":[]}',
            b'{"objects":[{"name":"a","name":"b"}]}',
            b'{"objects":[{"attributes":{"TYPE":"PIPE","TYPE":"VALV"}}]}',
        )
        for source in sources:
            with self.subTest(source=source):
                with self.assertRaisesRegex(CompileBlocked, "duplicate JSON key"):
                    strict_json_loads(source)

    def test_invalid_utf8_rejected(self):
        with self.assertRaises(CompileBlocked):
            strict_json_loads(b"[\xff]")

    def test_trailing_data_rejected(self):
        with self.assertRaisesRegex(CompileBlocked, "trailing data"):
            strict_json_loads(b"[] []")

    def test_nonfinite_values_rejected(self):
        for token in (b"NaN", b"Infinity", b"-Infinity"):
            with self.subTest(token=token):
                with self.assertRaisesRegex(CompileBlocked, "non-finite"):
                    strict_json_loads(b'[{"value":' + token + b"}]")

    def test_malformed_json_rejected_without_recovery(self):
        for source in (b"{", b"[}", b"{'objects': []}", b"[,]"):
            with self.subTest(source=source):
                with self.assertRaises(CompileBlocked):
                    strict_json_loads(source)

    def test_context_is_closed_and_explicit(self):
        missing = dict(CONTEXT)
        missing.pop("north")
        with self.assertRaises(CompileBlocked):
            build_intake(context=missing)
        extra = dict(CONTEXT, defaultMaterial=1)
        with self.assertRaises(CompileBlocked):
            build_intake(context=extra)

    def test_source_revision_must_be_positive_integer(self):
        for revision in (0, -1, 1.2, "1", True):
            with self.subTest(revision=revision):
                context = dict(CONTEXT, sourceRevision=revision)
                with self.assertRaises(CompileBlocked):
                    build_intake(context=context)

    def test_occurrence_inventory_is_ordered_and_unique(self):
        intake, _ = build_intake()
        identities = intake.inventory.identities
        self.assertEqual("$", identities[0])
        self.assertEqual(len(identities), len(set(identities)))
        self.assertEqual(0, intake.inventory.duplicate_identity_count)
        self.assertIn("$[0].children[0].attributes.APOS.x", identities)

    def test_misleading_names_do_not_change_root_predicate(self):
        value = source_value()
        value[0]["children"][0]["name"] = "uxml-rvm-pdf-selectionjson"
        intake, _ = build_intake(value, name="pdf_uxml_seljson.json")
        self.assertEqual("TOP_LEVEL_ARRAY", intake.root_form)
        self.assertEqual("PIPE", intake.branches[0]["children"][0]["type"])

    def test_json_round_trip_does_not_insert_defaults(self):
        value = source_value(children=[pipe()])
        source = json.dumps(value, separators=(",", ":")).encode()
        text, parsed = strict_json_loads(source)
        self.assertEqual(value, parsed)
        self.assertNotIn("version", parsed[0])
        self.assertNotIn("jobName", parsed[0])
        self.assertEqual(source.decode(), text)


if __name__ == "__main__":
    unittest.main()
