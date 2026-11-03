import importlib.util
import sys
import unittest
from pathlib import Path

from scripts.inputxml_compiler.state_machine import CompilerStage, CompilerState

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"
MODULE_PATH = ROOT / "scripts" / "inputxml_canonical_compiler.py"
spec = importlib.util.spec_from_file_location(
    "inputxml_state_machine_integration",
    MODULE_PATH,
)
compiler = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = compiler
spec.loader.exec_module(compiler)


class TestInputXMLCompilerStateMachine(unittest.TestCase):
    def test_legal_transitions(self):
        state = CompilerState()
        self.assertEqual(state.current_stage, CompilerStage.INITIALIZED)
        state.transition(CompilerStage.CONTRACT_BUNDLE_VERIFIED)
        state.transition(CompilerStage.SOURCE_ENVELOPE_CREATED)
        self.assertEqual(state.current_stage, CompilerStage.SOURCE_ENVELOPE_CREATED)

    def test_prohibited_skip(self):
        state = CompilerState()
        with self.assertRaisesRegex(RuntimeError, "Illegal transition skip"):
            state.transition(CompilerStage.SOURCE_ENVELOPE_CREATED)

    def test_repeated_transition_rejection(self):
        state = CompilerState()
        state.transition(CompilerStage.CONTRACT_BUNDLE_VERIFIED)
        with self.assertRaisesRegex(RuntimeError, "skips backward or repeats"):
            state.transition(CompilerStage.CONTRACT_BUNDLE_VERIFIED)

    def test_transition_after_terminal_rejection(self):
        state = CompilerState()
        state.block("EARLY_GATE")
        with self.assertRaisesRegex(RuntimeError, "already terminal"):
            state.transition(CompilerStage.CONTRACT_BUNDLE_VERIFIED)

    def test_repeated_block_rejection(self):
        state = CompilerState()
        state.block("EARLY_GATE")
        with self.assertRaisesRegex(RuntimeError, "already terminal"):
            state.block("SECOND_GATE")

    def test_repeated_accept_rejection(self):
        state = CompilerState()
        for stage in list(CompilerStage)[1:]:
            state.transition(stage)
        state.accept()
        with self.assertRaisesRegex(RuntimeError, "already terminal"):
            state.accept()

    def test_completed_stages_derivation(self):
        state = CompilerState()
        state.transition(CompilerStage.CONTRACT_BUNDLE_VERIFIED)
        state.transition(CompilerStage.SOURCE_ENVELOPE_CREATED)
        self.assertEqual(
            state.completed_stages,
            [
                "INITIALIZED",
                "CONTRACT_BUNDLE_VERIFIED",
                "SOURCE_ENVELOPE_CREATED",
            ],
        )

    def test_blocked_at_derivation(self):
        state = CompilerState()
        state.transition(CompilerStage.CONTRACT_BUNDLE_VERIFIED)
        state.block("SOME_GATE")
        self.assertEqual(state.blocked_at, "SOME_GATE")
        self.assertEqual(state.terminal_status, "BLOCKED")

    def test_successful_terminal_result(self):
        state = CompilerState()
        for stage in list(CompilerStage)[1:]:
            state.transition(stage)
        state.accept()
        self.assertEqual(state.terminal_status, "PASS")
        self.assertEqual(state.current_stage, CompilerStage.PRODUCTION_ACCEPTED)

    def test_accept_before_production_accepted(self):
        state = CompilerState()
        state.transition(CompilerStage.CONTRACT_BUNDLE_VERIFIED)
        with self.assertRaises(RuntimeError):
            state.accept()

    def test_orchestration_serialization_is_deterministic(self):
        first = CompilerState()
        second = CompilerState()
        for state in (first, second):
            state.transition(CompilerStage.CONTRACT_BUNDLE_VERIFIED)
            state.transition(CompilerStage.SOURCE_ENVELOPE_CREATED)
            state.block("MEDIA_INSPECTION_GATE")
        self.assertEqual(
            first.as_orchestration_dict(),
            second.as_orchestration_dict(),
        )


class TestCompilerOrchestrationIntegration(unittest.TestCase):
    def compile(self, source, *, name="source.xml", dialect=None, context=None):
        return compiler.compile_document(
            source,
            source_name=name,
            source_repository="reallaksh19/3D_Converters",
            source_path=f"test://{name}",
            producer="state-machine-test",
            registry_path=CONTRACTS / "inputxml-dialect-registry.json",
            adapter_registry_path=(
                CONTRACTS / "compiler" / "inputxml-compiler-adapters.json"
            ),
            alias_registry_path=(
                CONTRACTS / "catalogs" / "inputxml-alias-registry.json"
            ),
            canonical_xsd_path=CONTRACTS / "inputxml-canonical-v1.xsd",
            categorized_xsd_path=CONTRACTS / "categorized-inputxml-v3.xsd",
            semantic_rules_path=CONTRACTS / "inputxml-semantic-rules-v1.sch",
            dialect_override=dialect,
            context=context or {},
        )

    def test_malformed_xml_blocks_at_media_inspection_gate(self):
        root, _, validation = self.compile(b"<not-valid-xml")
        self.assertIsNone(root)
        self.assertEqual("BLOCKED", validation["status"])
        self.assertEqual("MEDIA_INSPECTION_GATE", validation["blockedAt"])
        self.assertEqual(
            [
                "INITIALIZED",
                "CONTRACT_BUNDLE_VERIFIED",
                "SOURCE_ENVELOPE_CREATED",
                "MEDIA_INSPECTED",
            ],
            validation["completedStages"],
        )

    def test_malformed_json_blocks_at_media_inspection_gate(self):
        root, ledger, validation = self.compile(b"{not-json", name="source.json")
        self.assertIsNone(root)
        self.assertEqual("BLOCKED", validation["status"])
        self.assertEqual("MEDIA_INSPECTION_GATE", validation["blockedAt"])
        self.assertNotIn("DIALECT_RESOLVED", validation["completedStages"])
        self.assertTrue(any(
            row["code"] == "MANAGED_STAGE_JSON_INVALID"
            for row in ledger["diagnostics"]
        ))

    def test_diagnostic_candidate_reaches_common_validation(self):
        source = (
            CONTRACTS / "golden" / "positive" / "minimal.canonical.input.xml"
        ).read_bytes()
        root, ledger, validation = self.compile(
            source,
            dialect="xml-to-cii-diagnostic-sidecar",
        )
        self.assertIsNotNone(root)
        self.assertEqual("BLOCKED", validation["status"])
        self.assertEqual("LEDGER_GATE", validation["blockedAt"])
        self.assertIn("XSD_VALIDATED", validation["completedStages"])
        self.assertIn("SCHEMATRON_VALIDATED", validation["completedStages"])
        self.assertNotIn("LEDGER_VALIDATED", validation["completedStages"])
        self.assertEqual(
            "diagnostic-sidecar-reconciliation",
            validation["resolverOutcome"]["adapterId"],
        )
        self.assertEqual(
            "BLOCKED_WITH_CANDIDATE",
            validation["resolverOutcome"]["outcomeKind"],
        )
        self.assertEqual("BLOCKED", ledger["status"])

    def test_repeated_blocked_compilation_is_deterministic(self):
        source = b"{not-json"
        first = self.compile(source, name="source.json")
        second = self.compile(source, name="source.json")
        self.assertEqual(first[1], second[1])
        self.assertEqual(first[2], second[2])


if __name__ == "__main__":
    unittest.main()
