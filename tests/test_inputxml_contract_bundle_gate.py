import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "inputxml_canonical_compiler.py"
spec = importlib.util.spec_from_file_location("inputxml_contract_bundle_gate", MODULE_PATH)
compiler = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = compiler
spec.loader.exec_module(compiler)

CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"
DIALECT_REGISTRY = CONTRACTS / "inputxml-dialect-registry.json"
ADAPTER_REGISTRY = CONTRACTS / "compiler" / "inputxml-compiler-adapters.json"


class ContractBundleGateTests(unittest.TestCase):
    def compile(self, source: bytes, *, adapter_registry_path=ADAPTER_REGISTRY):
        return compiler.compile_document(
            source,
            source_name="source.xml",
            source_repository="reallaksh19/3D_Converters",
            source_path="test://source.xml",
            producer="contract-bundle-test",
            registry_path=DIALECT_REGISTRY,
            adapter_registry_path=adapter_registry_path,
            alias_registry_path=CONTRACTS / "catalogs" / "inputxml-alias-registry.json",
            canonical_xsd_path=CONTRACTS / "inputxml-canonical-v1.xsd",
            categorized_xsd_path=CONTRACTS / "categorized-inputxml-v3.xsd",
            semantic_rules_path=CONTRACTS / "inputxml-semantic-rules-v1.sch",
            dialect_override="canonical-inputxml-v1",
            context={},
        )

    def test_repository_contract_bundle_is_verified_and_ledgered(self):
        source = (CONTRACTS / "golden" / "positive" / "minimal.canonical.input.xml").read_bytes()
        root, ledger, validation = self.compile(source)

        self.assertIsNotNone(root)
        self.assertEqual("PASS", validation["status"])
        self.assertEqual("VERIFIED", validation["contractBundle"]["status"])
        self.assertEqual(15, validation["contractBundle"]["dialectCount"])
        self.assertEqual(
            validation["contractBundle"]["digestSha256"],
            ledger["contractBundle"]["digestSha256"],
        )
        self.assertFalse(any(
            row["sourceType"] == "CONTRACT_BUNDLE"
            for row in ledger["records"]
        ))

    def test_registry_set_mismatch_blocks_before_source_parse(self):
        payload = json.loads(ADAPTER_REGISTRY.read_text(encoding="utf-8"))
        payload["adapters"] = payload["adapters"][:-1]

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "inputxml-compiler-adapters.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            root, ledger, validation = self.compile(b"<not-valid-xml", adapter_registry_path=path)

        self.assertIsNone(root)
        self.assertEqual("BLOCKED", validation["status"])
        self.assertEqual("CONTRACT_BUNDLE_GATE", validation["blockedAt"])
        self.assertEqual("REJECT_INVALID", ledger["records"][0]["disposition"])
        codes = [item["code"] for item in validation["diagnostics"]]
        self.assertIn("CONTRACT_BUNDLE_INVALID", codes)
        self.assertNotIn("CANONICALIZATION_BLOCKED", codes)

    def test_duplicate_json_key_blocks_contract_bundle(self):
        source_text = ADAPTER_REGISTRY.read_text(encoding="utf-8")
        duplicate = source_text.replace(
            '"schema": "InputXmlCanonicalCompilerAdapterRegistry.v1",',
            '"schema": "duplicate",\n  "schema": "InputXmlCanonicalCompilerAdapterRegistry.v1",',
            1,
        )

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "inputxml-compiler-adapters.json"
            path.write_text(duplicate, encoding="utf-8")
            root, ledger, validation = self.compile(b"<not-valid-xml", adapter_registry_path=path)

        self.assertIsNone(root)
        self.assertEqual("CONTRACT_BUNDLE_GATE", validation["blockedAt"])
        self.assertIn("duplicate JSON keys", validation["contractBundle"]["error"])
        self.assertEqual("BLOCKED", ledger["status"])

    def test_runtime_resolver_drift_blocks_before_source_parse(self):
        incomplete_runtime = set(compiler._compiler.SUPPORTED_COMPILER_DIALECTS)
        incomplete_runtime.remove("pdf-input-echo")

        with mock.patch.object(
            compiler._compiler,
            "SUPPORTED_COMPILER_DIALECTS",
            incomplete_runtime,
        ):
            root, ledger, validation = self.compile(b"<not-valid-xml")

        self.assertIsNone(root)
        self.assertEqual("CONTRACT_BUNDLE_GATE", validation["blockedAt"])
        self.assertIn("missingRuntime=['pdf-input-echo']", validation["contractBundle"]["error"])
        self.assertEqual("REJECT_INVALID", ledger["records"][0]["disposition"])


if __name__ == "__main__":
    unittest.main()
