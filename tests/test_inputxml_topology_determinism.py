import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = b'''<Root><Branch><Branchname>L1</Branchname><LineNo>L1</LineNo><Pressure><Pressure1>1000</Pressure1><HydroPressure>1500</HydroPressure></Pressure><Temperature><Temperature1>100</Temperature1></Temperature><MaterialNumber>106</MaterialNumber><InsulationDensity>0</InsulationDensity><FluidDensity>965</FluidDensity><Node><NodeNumber>10</NodeNumber><NodeName>N10</NodeName><Endpoint>1</Endpoint><Rigid>0</Rigid><ComponentType>PIPE</ComponentType><Weight>0</Weight><ComponentRefNo>C10</ComponentRefNo><ConnectionType/><OutsideDiameter>114.3</OutsideDiameter><WallThickness>6.02</WallThickness><CorrosionAllowance>0</CorrosionAllowance><InsulationThickness>0</InsulationThickness><Position>0 0 0</Position><BendRadius>0</BendRadius><SIF>0</SIF><MaterialCode>106</MaterialCode></Node><Node><NodeNumber>20</NodeNumber><NodeName>N20</NodeName><Endpoint>1</Endpoint><Rigid>0</Rigid><ComponentType>PIPE</ComponentType><Weight>0</Weight><ComponentRefNo>C20</ComponentRefNo><ConnectionType/><OutsideDiameter>114.3</OutsideDiameter><WallThickness>6.02</WallThickness><CorrosionAllowance>0</CorrosionAllowance><InsulationThickness>0</InsulationThickness><Position>1000 0.1 0</Position><BendRadius>0</BendRadius><SIF>0</SIF><MaterialCode>106</MaterialCode></Node></Branch></Root>'''

CHILD = r'''
import json
from pathlib import Path
from scripts.inputxml_compiler.compiler import compile_document
root = Path.cwd()
contracts = root / "contracts" / "inputxml" / "v1"
source = Path("tests/.topology-determinism-source.xml").read_bytes()
candidate, ledger, validation = compile_document(
    source,
    source_name="topology-determinism.xml",
    source_repository="reallaksh19/3D_Converters",
    source_path="tests/topology-determinism.xml",
    producer="topology-determinism-test",
    registry_path=contracts / "inputxml-dialect-registry.json",
    adapter_registry_path=contracts / "compiler" / "inputxml-compiler-adapters.json",
    serialization_policy_path=contracts / "compiler" / "inputxml-deterministic-serialization.json",
    alias_registry_path=contracts / "catalogs" / "inputxml-alias-registry.json",
    canonical_xsd_path=contracts / "inputxml-canonical-v1.xsd",
    categorized_xsd_path=contracts / "categorized-inputxml-v3.xsd",
    semantic_rules_path=contracts / "inputxml-semantic-rules-v1.sch",
    context={"version":"11.00","jobName":"DETERMINISM","north":[0,1,0],"fluidDensityScale":"0.000001"},
)
assert candidate is not None and validation["status"] == "PASS"
print(json.dumps({"ledger":ledger,"validation":validation}, sort_keys=True, separators=(",",":"), ensure_ascii=False, allow_nan=False))
'''


class TopologyDeterminismTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source_path = ROOT / "tests" / ".topology-determinism-source.xml"
        cls.source_path.write_bytes(SOURCE)

    @classmethod
    def tearDownClass(cls):
        cls.source_path.unlink(missing_ok=True)

    def run_child(self, seed):
        env = dict(os.environ)
        env["PYTHONHASHSEED"] = str(seed)
        completed = subprocess.run(
            [sys.executable, "-c", CHILD],
            cwd=ROOT,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            text=True,
        )
        return completed.stdout.strip()

    def test_repeated_processes_and_hash_seeds_are_identical(self):
        outputs = [self.run_child(seed) for seed in (1, 7, 101, 999)]
        self.assertTrue(all(value == outputs[0] for value in outputs[1:]))
        payload = json.loads(outputs[0])
        proof = next(
            row["sourceFields"]["topologyProof"]
            for row in payload["ledger"]["records"]
            if row["sourceType"] == "STRICT_TOPOLOGY_BRIDGE_PROOF"
        )
        self.assertEqual(0, proof["syntheticTopologyCount"])
        self.assertEqual("PASS", payload["validation"]["status"])


if __name__ == "__main__":
    unittest.main()
