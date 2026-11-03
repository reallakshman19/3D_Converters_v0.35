import importlib.util
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.inputxml_compiler.compiler import compile_document
from scripts.inputxml_compiler.publication import (
    CompilationView,
    publish_result_bundle,
    verify_committed_bundle,
)
from scripts.inputxml_compiler.serialization import serialize_canonical_xml
from scripts.inputxml_compiler.serialization_policy import load_serialization_policy
from tests.managed_stage_test_support import CONTEXT, CONTRACTS, ROOT, bend, source_bytes, source_value


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


assurance_builder = load_module(
    "managed_stage_blocked_assurance",
    ROOT / "scripts" / "inputxml_assurance_ledger.py",
)
assured_projection = load_module(
    "managed_stage_blocked_projection",
    ROOT / "converters" / "scripts" / "inputxml_to_cii2019_assured.py",
)


class ManagedStageBlockedPublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = Path(tempfile.mkdtemp(prefix="managed-stage-blocked-"))
        self.policy = load_serialization_policy(
            CONTRACTS / "compiler" / "inputxml-deterministic-serialization.json"
        )

    def tearDown(self):
        shutil.rmtree(self.temp, ignore_errors=True)

    def compile_blocked(self):
        source = source_bytes(source_value(children=[bend()]))
        candidate, ledger, validation = compile_document(
            source,
            source_name="managed-stage-bend.json",
            source_repository="reallaksh19/3D_Converters",
            source_path="test://managed-stage-bend.json",
            producer="managed-stage-blocked-publication-test",
            registry_path=CONTRACTS / "inputxml-dialect-registry.json",
            adapter_registry_path=CONTRACTS / "compiler" / "inputxml-compiler-adapters.json",
            serialization_policy_path=CONTRACTS / "compiler" / "inputxml-deterministic-serialization.json",
            alias_registry_path=CONTRACTS / "catalogs" / "inputxml-alias-registry.json",
            canonical_xsd_path=CONTRACTS / "inputxml-canonical-v1.xsd",
            categorized_xsd_path=CONTRACTS / "categorized-inputxml-v3.xsd",
            semantic_rules_path=CONTRACTS / "inputxml-semantic-rules-v1.sch",
            context={**CONTEXT, "jobName": "PR7_BLOCKED"},
        )
        self.assertIsNotNone(candidate, ledger["diagnostics"])
        self.assertEqual("BLOCKED", validation["status"])
        self.assertEqual("LEDGER_GATE", validation["blockedAt"])
        self.assertEqual(
            "BLOCKED_WITH_CANDIDATE",
            validation["resolverOutcome"]["outcomeKind"],
        )
        return source, candidate, ledger, validation

    def test_blocked_bundle_commits_but_writer_is_not_loaded(self):
        _, candidate, ledger, validation = self.compile_blocked()
        view = CompilationView.from_compiler_result(
            stem="managed-stage-bend",
            source_hash=ledger["sourceHashSha256"],
            canonical=candidate,
            ledger=ledger,
            validation=validation,
            policy=self.policy,
        )
        publish_result_bundle(view, self.temp)
        committed = verify_committed_bundle(self.temp, "managed-stage-bend")
        self.assertEqual("BLOCKED_WITH_CANONICAL", committed["bundleKind"])

        canonical_bytes = serialize_canonical_xml(candidate, self.policy)
        assurance = assurance_builder.build_assurance_ledger(
            canonical_xml=canonical_bytes,
            canonicalization_ledger=ledger,
            canonical_validation=validation,
            field_catalog=json.loads(
                (CONTRACTS / "catalogs" / "inputxml-field-catalog.json").read_text()
            ),
            projection_contract=json.loads(
                (CONTRACTS / "catalogs" / "inputxml-cii-projection-contract.json").read_text()
            ),
        )
        self.assertEqual("BLOCKED", assurance["status"])

        writer_loaded = False
        original_loader = assured_projection._load_writer

        def fail_if_loaded():
            nonlocal writer_loaded
            writer_loaded = True
            raise AssertionError("production writer must not be loaded")

        canonical_path = self.temp / "managed-stage-bend.canonical.input.xml"
        canonical_path.write_bytes(canonical_bytes)
        assured_projection._load_writer = fail_if_loaded
        try:
            cii_text, projection = assured_projection.build_assured_projection(
                canonical_xml=canonical_bytes,
                assurance=assurance,
                projection_contract=json.loads(
                    (CONTRACTS / "catalogs" / "inputxml-cii-projection-contract.json").read_text()
                ),
                canonical_path=canonical_path,
            )
        finally:
            assured_projection._load_writer = original_loader
        self.assertFalse(writer_loaded)
        self.assertIsNone(cii_text)
        self.assertEqual("BLOCKED", projection["status"])
        self.assertIsNone(projection["chain"]["ciiHashSha256"])


if __name__ == "__main__":
    unittest.main()
