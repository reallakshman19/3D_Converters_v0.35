import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.inputxml_compiler.managed_stage_bridge_io import (
    BRIDGE_SCRIPT,
    request_bytes,
)
from tests.managed_stage_test_support import (
    CONTEXT,
    ROOT,
    bend,
    build_intake,
    source_bytes,
    source_value,
)

_CHILD = r'''
import base64
import json
import sys
from lxml import etree as ET
from pathlib import Path
from scripts.inputxml_compiler.compiler import compile_document
from scripts.inputxml_compiler.serialization import serialize_canonical_xml
from scripts.inputxml_compiler.serialization_policy import load_serialization_policy
from tests.managed_stage_test_support import CONTRACTS
source = Path(sys.argv[1]).read_bytes()
candidate, ledger, validation = compile_document(
    source,
    source_name=Path(sys.argv[1]).name,
    source_repository="reallaksh19/3D_Converters",
    source_path="test://managed-stage-determinism.json",
    producer="managed-stage-determinism-test",
    registry_path=CONTRACTS / "inputxml-dialect-registry.json",
    adapter_registry_path=CONTRACTS / "compiler" / "inputxml-compiler-adapters.json",
    serialization_policy_path=CONTRACTS / "compiler" / "inputxml-deterministic-serialization.json",
    alias_registry_path=CONTRACTS / "catalogs" / "inputxml-alias-registry.json",
    canonical_xsd_path=CONTRACTS / "inputxml-canonical-v1.xsd",
    categorized_xsd_path=CONTRACTS / "categorized-inputxml-v3.xsd",
    semantic_rules_path=CONTRACTS / "inputxml-semantic-rules-v1.sch",
    context={"version":"11.00","jobName":"PR7_DETERMINISM","north":[0,1,0],"sourceRevision":1},
)
policy = load_serialization_policy(
    CONTRACTS / "compiler" / "inputxml-deterministic-serialization.json"
)
canonical = None if candidate is None else base64.b64encode(
    serialize_canonical_xml(candidate, policy)
).decode("ascii")
print(json.dumps(
    {"canonical":canonical,"ledger":ledger,"validation":validation},
    sort_keys=True,
    separators=(",",":"),
    ensure_ascii=False,
    allow_nan=False,
))
'''


class ManagedStageDeterminismTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = Path(tempfile.mkdtemp(prefix="managed-stage-determinism-"))
        cls.sources = {
            "pass": source_bytes(),
            "blocked_candidate": source_bytes(source_value(children=[bend()])),
            "blocked_no_candidate": b'{"objects":[{"name":"x","name":"y"}]}',
        }
        for name, source in cls.sources.items():
            (cls.temp / f"{name}.json").write_bytes(source)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.temp, ignore_errors=True)

    def run_python(self, case, seed):
        env = dict(os.environ)
        env["PYTHONHASHSEED"] = str(seed)
        completed = subprocess.run(
            [sys.executable, "-c", _CHILD, str(self.temp / f"{case}.json")],
            cwd=ROOT,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            text=True,
            timeout=90,
        )
        return completed.stdout.strip()

    def test_python_process_and_hash_seed_determinism(self):
        for case in self.sources:
            with self.subTest(case=case):
                outputs = [self.run_python(case, seed) for seed in (1, 7, 101)]
                self.assertTrue(all(value == outputs[0] for value in outputs[1:]))
                payload = json.loads(outputs[0])
                if case == "pass":
                    self.assertEqual("PASS", payload["validation"]["status"])
                    self.assertIsNotNone(payload["canonical"])
                elif case == "blocked_candidate":
                    self.assertEqual("BLOCKED", payload["validation"]["status"])
                    self.assertEqual("LEDGER_GATE", payload["validation"]["blockedAt"])
                    self.assertIsNotNone(payload["canonical"])
                else:
                    self.assertEqual("BLOCKED", payload["validation"]["status"])
                    self.assertEqual("MEDIA_INSPECTION_GATE", payload["validation"]["blockedAt"])
                    self.assertIsNone(payload["canonical"])

    def test_repeated_node_bridge_bytes_are_identical(self):
        intake, _ = build_intake(
            context={**CONTEXT, "jobName": "PR7_DETERMINISM"},
        )
        payload = request_bytes(intake.bridge_request())
        node = shutil.which("node")
        self.assertIsNotNone(node)
        outputs = []
        for _ in range(3):
            completed = subprocess.run(
                [node, str(BRIDGE_SCRIPT)],
                input=payload,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=True,
                env={
                    key: os.environ[key]
                    for key in ("SystemRoot", "WINDIR")
                    if key in os.environ
                },
                timeout=60,
            )
            outputs.append(completed.stdout)
        self.assertTrue(all(value == outputs[0] for value in outputs[1:]))
        result = json.loads(outputs[0])
        self.assertEqual("InputXmlManagedStageBridgeResult.v1", result["schema"])
        self.assertEqual("RESOLVED", result["resolutionStatus"])


if __name__ == "__main__":
    unittest.main()
