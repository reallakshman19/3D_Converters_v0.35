from __future__ import annotations

import copy
import importlib.util
import json
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "converters" / "scripts"
FIXTURES = ROOT / "tests" / "fixtures" / "topo-enriched-xml" / "cii2019-proof"
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(SCRIPTS))


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


proof = load_module("te014_proof_adversarial", SCRIPTS / "topo_enriched_xml_cii2019_proof.py")
mutation = load_module("te014_mutation", FIXTURES / "te013_mutation.py")


def production_result(*, coverage_mode: str = "CLEAN") -> dict:
    completed = subprocess.run(
        [
            "node", str(FIXTURES / "generate-remediation-production-result.mjs"),
            "CANONICAL", coverage_mode,
        ],
        cwd=ROOT, check=True, capture_output=True, text=True,
    )
    return json.loads(completed.stdout)


def blocked(value: dict) -> dict:
    result = proof.prove_topo_enriched_xml_to_cii2019(value)
    assert result["status"] == "BLOCKED", result
    assert result["acceptedCiiArtifact"] is None
    assert result["acceptedCiiBytes"] is None
    return result


class TopoEnrichedXmlCii2019AdversarialTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.valid = production_result()

    def test_edge_owned_source_entity_without_occurrence_is_rejected(self):
        incomplete = production_result(coverage_mode="INCOMPLETE_TOPOLOGY")
        result = blocked(incomplete)
        diagnostics = json.dumps(result["diagnostics"])
        self.assertIn("topology occurrence coverage is incomplete", diagnostics)
        self.assertIn("SE-FLAN", diagnostics)
        self.assertIn("LE-B-1", diagnostics)

    def test_non_selectable_production_bundle_is_rejected(self):
        value = copy.deepcopy(self.valid)
        value["productionBundle"]["selectable"] = False
        value["selection"]["productionBundle"]["selectable"] = False
        result = blocked(value)
        self.assertIn("not selectable", json.dumps(result["diagnostics"]))

    def test_non_enforced_and_blocked_results_are_rejected(self):
        for mode in ("LEGACY", "SHADOW", "REVIEW"):
            with self.subTest(mode=mode):
                value = copy.deepcopy(self.valid)
                value["operatingMode"] = mode
                blocked(value)
        value = copy.deepcopy(self.valid)
        value["validation"] = {"status": "BLOCKED", "blockers": [{"code": "TEST"}], "reviewItems": [], "warnings": []}
        blocked(value)

    def test_each_consumed_te013_hash_is_rejected_when_stale(self):
        mutations = {
            "productionResultHash": lambda v: v.__setitem__("productionResultHash", "sha256:" + "0" * 64),
            "bundleHash": lambda v: v["productionBundle"].__setitem__("bundleHash", "sha256:" + "1" * 64),
            "xmlHash": lambda v: v["canonicalBundle"].__setitem__("xmlHash", "sha256:" + "2" * 64),
            "traceHash": lambda v: v["canonicalBundle"].__setitem__("traceHash", "sha256:" + "3" * 64),
            "nodePlanHash": lambda v: v["nodePlan"].__setitem__("nodePlanHash", "sha256:" + "4" * 64),
            "topologyIndexHash": lambda v: v["topologyIndex"].__setitem__("topologyIndexHash", "sha256:" + "5" * 64),
            "registrySnapshotHash": lambda v: v.__setitem__("currentRegistrySnapshotHash", "sha256:" + "6" * 64),
            "registryPatchHash": lambda v: v.__setitem__("registryPatchHash", "sha256:" + "7" * 64),
        }
        for name, mutate in mutations.items():
            with self.subTest(hash=name):
                value = copy.deepcopy(self.valid)
                mutate(value)
                blocked(value)

    def test_node_number_substitution_blocks_after_outer_hash_rebinding(self):
        xml = self.valid["xmlText"].replace("<NodeNumber>100</NodeNumber>", "<NodeNumber>101</NodeNumber>", 1)
        trace = copy.deepcopy(self.valid["trace"])
        trace[0]["engineeringNodeNumber"] = 101
        blocked(mutation.rebind_selected_bundle(self.valid, xml_text=xml, trace=trace))

    def test_dropped_emitted_occurrence_blocks(self):
        xml = re.sub(r"\s*<Node>.*?</Node>", "", self.valid["xmlText"], count=1, flags=re.S)
        trace = copy.deepcopy(self.valid["trace"])[1:]
        blocked(mutation.rebind_selected_bundle(self.valid, xml_text=xml, trace=trace))

    def test_reserved_occurrence_appearing_in_psi_blocks(self):
        reserved = self.valid["nodePlan"]["reservedOccurrences"][0]
        node = f'''<Node>\n  <NodeNumber>{reserved["engineeringNodeNumber"]}</NodeNumber>\n  <NodeName></NodeName>\n  <Endpoint>0</Endpoint>\n  <ComponentType>ELBO</ComponentType>\n  <Weight>0</Weight>\n  <ComponentRefNo>RESERVED</ComponentRefNo>\n  <ConnectionType></ConnectionType>\n  <OutsideDiameter>114.3</OutsideDiameter>\n  <WallThickness>6.02</WallThickness>\n  <CorrosionAllowance>1.5</CorrosionAllowance>\n  <InsulationThickness>0</InsulationThickness>\n  <Position>0 0 0</Position>\n  <BendRadius>152.4</BendRadius>\n  <BendType>0</BendType>\n  <SIF>0</SIF>\n</Node>'''
        xml = self.valid["xmlText"].replace("</Branch>", node + "\n</Branch>", 1)
        trace = copy.deepcopy(self.valid["trace"])
        base = copy.deepcopy(trace[0])
        base.update({
            "traceIndex": len(trace), "nodeIndexInBranch": base["nodeIndexInBranch"] + 1,
            "occurrenceId": reserved["occurrenceId"], "componentProjectionId": reserved["componentProjectionId"],
            "logicalNodeId": reserved["logicalNodeId"], "engineeringNodeNumber": reserved["engineeringNodeNumber"],
            "psiComponentType": "ELBO", "endpoint": 0,
        })
        trace.append(base)
        blocked(mutation.rebind_selected_bundle(self.valid, xml_text=xml, trace=trace))

    def test_branch_endpoint_sif_namespace_unit_and_security_fail_closed(self):
        variants = [
            self.valid["xmlText"].replace("<Branchname>/LINE-A</Branchname>", "<Branchname>/OTHER</Branchname>", 1),
            self.valid["xmlText"].replace("<Endpoint>0</Endpoint>", "<Endpoint>1</Endpoint>", 1),
            re.sub(r"(<NodeNumber>130</NodeNumber>.*?<SIF>)0(</SIF>)", r"\g<1>1\g<2>", self.valid["xmlText"], count=1, flags=re.S),
            self.valid["xmlText"].replace("http://aveva.com/pipeStress116.xsd", "urn:wrong", 1),
            self.valid["xmlText"].replace("<DistanceUnits>mm</DistanceUnits>", "<DistanceUnits>m</DistanceUnits>", 1),
            self.valid["xmlText"].replace("<?xml version=\"1.0\" encoding=\"utf-8\"?>", "<?xml version=\"1.0\"?><!DOCTYPE x [<!ENTITY a 'x'>]>", 1),
        ]
        for index, xml in enumerate(variants):
            with self.subTest(case=index):
                blocked(mutation.rebind_selected_bundle(self.valid, xml_text=xml))

    def test_shared_cii_element_requires_non_conflicting_section_claims(self):
        result = proof.prove_topo_enriched_xml_to_cii2019(self.valid)
        self.assertEqual("PASS", result["status"])
        ledger = copy.deepcopy(result["projectionLedger"])
        projected = [row for row in ledger["records"] if row["disposition"] == "PROJECTED"]
        self.assertEqual(projected[0]["ciiElementIndex"], projected[1]["ciiElementIndex"])
        self.assertEqual([], proof.validate_projection_ledger(ledger))
        duplicate = copy.deepcopy(next(row for row in projected if "BEND" in row["projectionSections"]))
        duplicate["recordId"] = "TE014-PROJ-CONFLICT"
        duplicate["occurrenceId"] = next(row["occurrenceId"] for row in ledger["records"] if row["sourceDisposition"] == "RESERVED")
        ledger["records"].append(duplicate)
        ledger["projectionLedgerHashSha256"] = proof.json_hash({key: value for key, value in ledger.items() if key != "projectionLedgerHashSha256"})
        errors = proof.validate_projection_ledger(ledger)
        self.assertIn("PASS requires conflict-free occurrence section claims", errors)

    def test_static_authority_guard(self):
        files = [
            SCRIPTS / "topo_enriched_xml_cii2019_proof.py",
            ROOT / "scripts" / "inputxml_compiler" / "psi116_adapter_v2.py",
            ROOT / "scripts" / "inputxml_compiler" / "psi116_projection_ownership.py",
        ]
        combined = "".join(path.read_text() for path in files)
        self.assertNotRegex(combined, r"(?:from|import)\s+.*xml_to_cii2019")
        self.assertNotRegex(combined, r"(?:from|import)\s+.*inputxml_to_cii2019")
        for token in ("buildTopoEnrichedXml", "nodeMatcher", "nodeAllocator", "node-history/"):
            self.assertNotIn(token, combined)


if __name__ == "__main__":
    unittest.main()
