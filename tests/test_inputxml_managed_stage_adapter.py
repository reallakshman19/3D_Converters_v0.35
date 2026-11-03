import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "inputxml_canonical_compiler.py"
spec = importlib.util.spec_from_file_location(
    "inputxml_canonical_compiler_managed_stage_test",
    MODULE_PATH,
)
compiler = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = compiler
spec.loader.exec_module(compiler)
CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"


def point(x, y, z):
    return {"x": x, "y": y, "z": z}


def engineering(line="MST-L-100"):
    return {
        "nominalBoreMm": 100,
        "pipeOdMm": 114.3,
        "wallThicknessMm": 6.02,
        "insulationThicknessMm": 0,
        "corrosionAllowanceMm": 0,
        "designTemperatureC": 100,
        "designPressureMpa": 1.0,
        "hydroPressure": 1.5,
        "materialCode": 106,
        "material": "A106 Grade B",
        "materialDensityKgM3": 7833,
        "insulationDensityKgM3": 0,
        "fluidDensityOpeKgM3": 965,
        "lineNo": line,
    }


def branch(children):
    return [{
        "name": "/MST-100/B1",
        "type": "BRANCH",
        "attributes": {
            "TYPE": "BRANCH",
            "NAME": "/MST-100/B1",
            "OWNER": "/MST-100",
            "HPOS": point(0, 0, 0),
            "TPOS": point(1000, 0, 0),
            "HBOR": "100mm",
            "TBOR": "100mm",
        },
        "children": children,
    }]


def pipe_component():
    return {
        "name": "PIPE =MST/PIPE/1",
        "type": "PIPE",
        "attributes": {
            "TYPE": "PIPE",
            "NAME": "=MST/PIPE/1",
            "REF": "=MST/PIPE/1",
            "OWNER": "/MST-100/B1",
            "APOS": point(0, 0, 0),
            "LPOS": point(1000, 0, 0),
            "ABORE": "100mm",
            "LBORE": "100mm",
            "DTXR": "PIPE",
        },
        "enrichedAttributes": engineering(),
    }


def bend_component():
    return {
        "name": "ELBO =MST/ELBO/1",
        "type": "ELBO",
        "attributes": {
            "TYPE": "ELBO",
            "NAME": "=MST/ELBO/1",
            "REF": "=MST/ELBO/1",
            "OWNER": "/MST-100/B1",
            "APOS": point(0, 0, 0),
            "POS": point(500, 500, 0),
            "LPOS": point(1000, 0, 0),
            "ABORE": "100mm",
            "LBORE": "100mm",
            "DTXR": "ELBO",
        },
        "enrichedAttributes": engineering(),
    }


def deferred_support():
    return {
        "name": "SUPPORT =MST/SUP/1",
        "type": "SUPPORT",
        "attributes": {
            "TYPE": "ATTA",
            "NAME": "=MST/SUP/1",
            "REF": "=MST/SUP/1",
            "OWNER": "/MST-100/B1",
            "POS": point(500, 0, 0),
            "APOS": point(500, 0, 0),
            "LPOS": point(500, 0, 0),
            "DTXR": "ATTA FOR FLOOR OPENING",
            "ISONOTE": "FENCE PENETRATION",
        },
    }


class ManagedStageAdapterTests(unittest.TestCase):
    def compile(self, source_object, *, context=None):
        source = json.dumps(source_object, separators=(",", ":")).encode()
        profile_context = {
            "version": "11.00",
            "jobName": "MANAGED_STAGE_CANONICAL_TEST",
            "north": [0, 1, 0],
            "sourceRevision": 1,
        }
        if context is not None:
            profile_context = context
        return compiler.compile_document(
            source,
            source_name="managed-stage.json",
            source_repository="reallaksh19/3D_Converters",
            source_path="test://managed-stage.json",
            producer="managed-stage-adapter-test",
            registry_path=CONTRACTS / "inputxml-dialect-registry.json",
            alias_registry_path=CONTRACTS / "catalogs" / "inputxml-alias-registry.json",
            canonical_xsd_path=CONTRACTS / "inputxml-canonical-v1.xsd",
            categorized_xsd_path=CONTRACTS / "categorized-inputxml-v3.xsd",
            semantic_rules_path=CONTRACTS / "inputxml-semantic-rules-v1.sch",
            context=profile_context,
        )

    def test_explicit_pipe_topology_passes(self):
        root, ledger, validation = self.compile(branch([pipe_component()]))
        self.assertIsNotNone(root, ledger["diagnostics"])
        self.assertEqual("PASS", validation["status"], ledger["diagnostics"])
        self.assertEqual("managed-stage-json", ledger["dialect"])
        model = root.find("PIPINGMODEL")
        element = model.find("PIPINGELEMENT")
        self.assertEqual("1", model.get("NUMELT"))
        self.assertEqual("MST-L-100", element.get("LINE"))
        self.assertEqual("114.3", element.get("DIAMETER"))
        self.assertEqual("6.02", element.get("WALL_THICK"))
        self.assertEqual("0", element.get("FROM_X"))
        self.assertEqual("1000", element.get("TO_X"))
        source_types = {row["sourceType"] for row in ledger["records"]}
        self.assertIn("MANAGED_STAGE_SOURCE_MODEL_CLOSURE", source_types)
        self.assertIn("MANAGED_STAGE_TOPOLOGY_TRACE_CLOSURE", source_types)
        self.assertIn("MANAGED_STAGE_SOURCE_DECISION", source_types)
        proof = validation["resolverOutcome"]["profileMetrics"]["sourceAccounting"]
        self.assertEqual("COMPLETE", proof["status"])
        self.assertTrue(all(value == 0 for value in proof["invariants"].values()))

    def test_bend_topology_without_bend_child_blocks_with_candidate(self):
        root, ledger, validation = self.compile(branch([bend_component()]))
        self.assertIsNotNone(root, ledger["diagnostics"])
        self.assertEqual("BLOCKED", validation["status"])
        self.assertEqual("LEDGER_GATE", validation["blockedAt"])
        self.assertEqual("0", root.find("PIPINGMODEL").get("NUMBEND"))
        self.assertTrue(any(
            row["code"] == "MANAGED_STAGE_BEND_PROJECTION_GAP"
            for row in ledger["diagnostics"]
        ))

    def test_safe_deferred_non_restraint_attachment_passes(self):
        root, ledger, validation = self.compile(
            branch([pipe_component(), deferred_support()])
        )
        self.assertIsNotNone(root, ledger["diagnostics"])
        self.assertEqual("PASS", validation["status"], ledger["diagnostics"])
        port_decisions = [
            row for row in ledger["records"]
            if row["sourceType"] == "MANAGED_STAGE_SOURCE_DECISION"
            and row["sourceFields"].get("sourcePortDisposition")
            == "INTENTIONALLY_UNUSED_WITH_AUTHORITY"
        ]
        self.assertTrue(port_decisions)
        proof = validation["resolverOutcome"]["profileMetrics"]["sourceAccounting"]
        self.assertEqual("COMPLETE", proof["status"])

    def test_missing_context_blocks_at_profile_intake(self):
        root, ledger, validation = self.compile(
            branch([pipe_component()]),
            context={"jobName": "ONLY_JOB"},
        )
        self.assertIsNone(root)
        self.assertEqual("PROFILE_INTAKE_GATE", validation["blockedAt"])
        self.assertTrue(any(
            row["code"] == "MANAGED_STAGE_CONTEXT_MISSING"
            for row in ledger["diagnostics"]
        ))


if __name__ == "__main__":
    unittest.main()
