import importlib.util
import sys
import unittest
from pathlib import Path

from lxml import etree as ET

from scripts.inputxml_compiler.base import CompileBlocked, DecisionLedger
from scripts.inputxml_compiler.topology_profiles import validate_topology_profile_intake

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "inputxml_canonical_compiler.py"
spec = importlib.util.spec_from_file_location("topology_intake_security", MODULE_PATH)
compiler = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = compiler
spec.loader.exec_module(compiler)
CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"
POSITIVE = (
    CONTRACTS
    / "golden"
    / "topology"
    / "xml-builder"
    / "positive"
    / "straight-route.xml"
).read_text(encoding="utf-8").strip()


class TopologyIntakeSecurityTests(unittest.TestCase):
    def compile(self, source, *, dialect=None):
        return compiler.compile_document(
            source.encode(),
            source_name="intake.xml",
            source_repository="reallaksh19/3D_Converters",
            source_path="test://intake.xml",
            producer="topology-intake-test",
            registry_path=CONTRACTS / "inputxml-dialect-registry.json",
            alias_registry_path=CONTRACTS / "catalogs" / "inputxml-alias-registry.json",
            canonical_xsd_path=CONTRACTS / "inputxml-canonical-v1.xsd",
            categorized_xsd_path=CONTRACTS / "categorized-inputxml-v3.xsd",
            semantic_rules_path=CONTRACTS / "inputxml-semantic-rules-v1.sch",
            dialect_override=dialect,
            context={
                "version": "11.00",
                "jobName": "INTAKE",
                "north": [0, 1, 0],
                "fluidDensityScale": "0.000001",
            },
        )

    def assert_intake_block(self, source, code="ROOT_STRUCTURE_INVALID", dialect=None):
        candidate, ledger, validation = self.compile(source, dialect=dialect)
        self.assertIsNone(candidate)
        self.assertEqual("PROFILE_INTAKE_GATE", validation["blockedAt"])
        self.assertTrue(
            any(row["code"] == code for row in ledger["diagnostics"]),
            ledger["diagnostics"],
        )

    def test_namespace_qualified_root_is_not_generic_root(self):
        candidate, _, validation = self.compile(POSITIVE.replace("<Root>", '<Root xmlns="urn:test">', 1))
        self.assertIsNone(candidate)
        self.assertEqual("DIALECT_GATE", validation["blockedAt"])

    def test_root_attribute_is_prohibited(self):
        self.assert_intake_block(POSITIVE.replace("<Root>", '<Root source="x">', 1))

    def test_duplicate_profile_metadata_is_prohibited(self):
        source = POSITIVE.replace(
            "<Root>",
            "<Root><Profile>xml-builder-root-branch-node</Profile>"
            "<Profile>xml-builder-root-branch-node</Profile>",
            1,
        )
        self.assert_intake_block(source)

    def test_extra_root_content_is_prohibited(self):
        source = POSITIVE.replace("<Root>", "<Root><Metadata>ignored</Metadata>", 1)
        self.assert_intake_block(source)

    def test_nested_branch_is_prohibited(self):
        source = POSITIVE.replace("<Branch>", "<Container><Branch>", 1).replace(
            "</Branch></Root>", "</Branch></Container></Root>", 1
        )
        self.assert_intake_block(source)

    def test_branch_without_node_is_prohibited(self):
        source = "<Root><Branch><Branchname>L1</Branchname><LineNo>L1</LineNo></Branch></Root>"
        self.assert_intake_block(source)

    def test_selectionjson_contract_rejects_implicit_selection(self):
        root = ET.fromstring(POSITIVE.encode())
        ledger = DecisionLedger("repo", "path", "producer", "seljson-custom-root")
        with self.assertRaises(CompileBlocked):
            validate_topology_profile_intake(
                profile_id="seljson-custom-root",
                root=root,
                context={"version": "11.00", "jobName": "T", "north": [0, 1, 0]},
                explicit_override=False,
                ledger=ledger,
            )
        self.assertTrue(
            any(row["code"] == "SELECTIONJSON_IDENTITY_REQUIRED" for row in ledger.diagnostics)
        )


if __name__ == "__main__":
    unittest.main()
