from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import unittest
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import jsonschema
from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "converters" / "scripts"
FIXTURES = ROOT / "tests" / "fixtures" / "topo-enriched-xml" / "cii2019-proof"
CONTRACTS = ROOT / "contracts" / "topo-enriched-xml" / "cii2019-proof"
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(SCRIPTS))


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


proof = load_module("te014_proof_test", SCRIPTS / "topo_enriched_xml_cii2019_proof.py")
from scripts.inputxml_compiler.base import CompileBlocked
from scripts.inputxml_compiler.psi116_adapter import _build_element, build_segments
from scripts.inputxml_compiler.psi116_common import load_projection_policy
from scripts.inputxml_compiler.psi116_projection_ownership import build_occurrence_projections


def production_result(writer: str, *, remediation: bool) -> dict:
    generator = "generate-remediation-production-result.mjs" if remediation else "generate-production-result.mjs"
    completed = subprocess.run(
        ["node", str(FIXTURES / generator), writer], cwd=ROOT,
        check=True, capture_output=True, text=True,
    )
    return json.loads(completed.stdout)


def node(index, number, kind, endpoint, x, *, role, rigid=None, weight="0", radius="0", restraints=()):
    return SimpleNamespace(
        source_path=f"/n{index}", branch_index=0, node_index=index,
        node_number=number, node_name=f"N{number}", endpoint=endpoint,
        component_type=kind, rigid=rigid, weight=weight,
        component_ref_no=f"R{number}", connection_type="",
        outside_diameter="114.3", wall_thickness="6.02",
        corrosion_allowance="1.5", insulation_thickness="0",
        position=(Decimal(str(x)), Decimal("0"), Decimal("0")),
        bend_radius=radius, bend_type=0 if kind == "ELBO" else None,
        alpha_angle=None, sif="0", restraints=tuple(restraints), evidence_fields=(),
        trace={
            "occurrenceId": f"O{number}", "logicalNodeId": f"L{number}",
            "engineeringNodeNumber": number, "sourceEntityId": f"S{number}",
            "componentProjectionId": f"P{number}", "psiComponentType": kind,
            "endpoint": endpoint, "projectionRole": role, "branchName": "L1",
            "branchIndex": 0, "nodeIndexInBranch": index,
        },
    )


def intake(nodes):
    node_rows = tuple(nodes)
    branch = SimpleNamespace(
        source_path="/b", branch_index=0, branch_name="L1",
        temperatures=tuple(["0"] * 9), pressures=tuple(["0"] * 9),
        material_number=106, insulation_density="0", fluid_density="0",
        nodes=node_rows,
    )
    edge_ids = [f"E{index + 1}" for index in range(max(0, len(node_rows) - 1))]
    source_entities = []
    occurrences = []
    for index, value in enumerate(node_rows):
        occurrence_id = value.trace["occurrenceId"]
        source_entity_id = value.trace["sourceEntityId"]
        owned_edges = []
        if edge_ids:
            owned_edges.append(edge_ids[min(index, len(edge_ids) - 1)])
        source_entities.append({
            "sourceEntityId": source_entity_id,
            "logicalEdgeIds": owned_edges,
            "occurrenceIds": [occurrence_id],
        })
        occurrences.append({
            "occurrenceId": occurrence_id,
            "sourceEntityId": source_entity_id,
        })
    production = {"topologyIndex": {"sourceEntities": source_entities, "occurrences": occurrences}}
    return SimpleNamespace(branches=(branch,), production_result=production)


class TopoEnrichedXmlCii2019ProofTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = production_result("CANONICAL", remediation=False)
        cls.canonical_result = production_result("CANONICAL", remediation=True)
        cls.sequential_result = production_result("SEQUENTIAL", remediation=True)
        cls.result_schema = json.loads((CONTRACTS / "topo-enriched-xml-cii-proof-result.v1.schema.json").read_text())
        cls.ledger_schema = json.loads((CONTRACTS / "topo-enriched-xml-cii-projection-ledger.v1.schema.json").read_text())

    def test_original_real_fixture_blocks_isolated_flan(self):
        result = proof.prove_topo_enriched_xml_to_cii2019(self.original)
        self.assertEqual("BLOCKED", result["status"])
        text = json.dumps(result["diagnostics"])
        self.assertIn("PSI116_UNPROJECTABLE_ENGINEERING_CONTENT", text)
        self.assertIn("FLAN", text)
        self.assertIsNone(result["acceptedCiiArtifact"])

    def test_real_branch_a_elbo_and_valve_reach_reparsed_cii(self):
        result = proof.prove_topo_enriched_xml_to_cii2019(self.canonical_result)
        self.assertEqual("PASS", result["status"], result["diagnostics"])
        self.assertEqual("PASS", result["reparseEvidence"]["status"])
        root = ET.fromstring(result["canonicalInputXml"].encode())
        model = next(row for row in root if ET.QName(row).localname == "PIPINGMODEL")
        elements = [row for row in model if ET.QName(row).localname == "PIPINGELEMENT"]
        self.assertEqual(1, len(elements))
        self.assertEqual(Decimal("152.4"), Decimal(elements[0].find("BEND").get("RADIUS")))
        self.assertEqual(Decimal("12"), Decimal(elements[0].find("RIGID").get("WEIGHT")))
        rows = {
            row["componentType"]: row for row in result["projectionLedger"]["records"]
            if row["disposition"] == "PROJECTED"
        }
        self.assertEqual(rows["ELBO"]["ciiElementIndex"], rows["VALV"]["ciiElementIndex"])
        self.assertIn("BEND", rows["ELBO"]["projectionSections"])
        self.assertIn("ELEMENTS_FROM", rows["ELBO"]["projectionSections"])
        self.assertIn("RIGID", rows["VALV"]["projectionSections"])
        self.assertIn("ELEMENTS_TO", rows["VALV"]["projectionSections"])
        pointers = rows["ELBO"]["evidence"]["assuredElement"]["pointers"]
        self.assertGreater(int(pointers["BEND"]), 0)
        self.assertGreater(int(pointers["RIGID"]), 0)

    def test_canonical_and_sequential_valid_variants_pass(self):
        for source in (self.canonical_result, self.sequential_result):
            with self.subTest(writer=source["requestedWriter"]):
                result = proof.prove_topo_enriched_xml_to_cii2019(source)
                self.assertEqual("PASS", result["status"], result["diagnostics"])
                self.assertTrue(result["acceptedCiiBytes"])
                self.assertEqual([], result["lossAccounting"]["unexplained"])
                self.assertEqual(0, result["nodeNumberMismatches"])
                self.assertEqual(0, result["unaccountedOccurrences"])
                jsonschema.Draft202012Validator(self.result_schema).validate(result)
                jsonschema.Draft202012Validator(self.ledger_schema).validate(result["projectionLedger"])
                self.assertEqual([], proof.validate_projection_ledger(result["projectionLedger"]))

    def test_occurrence_and_hydro_policy_accounting(self):
        result = proof.prove_topo_enriched_xml_to_cii2019(self.canonical_result)
        summary = result["projectionLedger"]["summary"]
        self.assertEqual(2, summary["emittedOccurrenceCount"])
        self.assertEqual(1, summary["reservedOccurrenceCount"])
        self.assertEqual(2, summary["projectedOccurrenceCount"])
        self.assertEqual(0, summary["intentionallyOmittedOccurrenceCount"])
        self.assertEqual(0, summary["unaccountedOccurrenceCount"])
        defaults = result["lossAccounting"]["defaulted"]
        self.assertEqual(1, len(defaults))
        self.assertIn("HYDRO_PRESSURE", defaults[0])
        records = result["assuranceLedger"]["records"]
        hydro = [row for row in records if row.get("sourceType") == "POLICY_NORMALIZED_FIELD"]
        self.assertEqual(1, len(hydro))
        self.assertEqual("NORMALIZE_EXPLICIT_ABSENCE", hydro[0]["disposition"])
        self.assertIn("policyHash", hydro[0]["sourceFields"])

    def test_identical_input_is_byte_deterministic(self):
        left = proof.prove_topo_enriched_xml_to_cii2019(self.canonical_result)
        right = proof.prove_topo_enriched_xml_to_cii2019(self.canonical_result)
        self.assertEqual(proof.serialize_proof_result(left), proof.serialize_proof_result(right))
        self.assertEqual(left["acceptedCiiBytes"], right["acceptedCiiBytes"])

    def test_branch_start_bend_rigid_and_support_ownership(self):
        policy, _ = load_projection_policy()
        restraint = SimpleNamespace(source_path="/r", type_name="ANC", gap="0", stiffness="1000", friction="0")
        cases = [
            (node(0, 10, "ELBO", 0, 0, role="ARRIVE", radius="152.4"), "BEND"),
            (node(0, 10, "VALV", 0, 0, role="ARRIVE", rigid=2, weight="12"), "RIGID"),
            (node(0, 10, "FLAN", 0, 0, role="ARRIVE", rigid=2, weight="12"), "RIGID"),
            (node(0, 10, "ATTA", 0, 0, role="ARRIVE", restraints=(restraint,)), "RESTRANT"),
        ]
        for first, section in cases:
            with self.subTest(component=first.component_type):
                source = intake((first, node(1, 20, "PIPE", 1, 100, role="PRIMARY")))
                segments = build_segments(source)
                claims = build_occurrence_projections(source, segments, policy)
                self.assertIn(section, claims[0].sections)
                element = _build_element(segments[0], claims, policy)
                tag = "RESTRAINT" if section == "RESTRANT" else section
                self.assertIsNotNone(element.find(tag))
                if section == "RESTRANT":
                    self.assertEqual("10", element.find(tag).get("NODE"))

    def test_isolated_engineering_components_block(self):
        policy, _ = load_projection_policy()
        restraint = SimpleNamespace(source_path="/r", type_name="ANC", gap="0", stiffness="1000", friction="0")
        values = [
            node(0, 10, "ELBO", 0, 0, role="ARRIVE", radius="152.4"),
            node(0, 10, "VALV", 1, 0, role="PRIMARY", rigid=2, weight="12"),
            node(0, 10, "FLAN", 1, 0, role="PRIMARY", rigid=2, weight="12"),
            node(0, 10, "ATTA", 1, 0, role="PRIMARY", restraints=(restraint,)),
        ]
        for value in values:
            with self.subTest(component=value.component_type):
                with self.assertRaisesRegex(CompileBlocked, "PSI116_UNPROJECTABLE_ENGINEERING_CONTENT"):
                    build_occurrence_projections(intake((value,)), (), policy)

    def test_payload_free_isolated_pipe_is_only_omission_case(self):
        policy, _ = load_projection_policy()
        rows = build_occurrence_projections(
            intake((node(0, 10, "PIPE", 1, 0, role="PRIMARY"),)), (), policy,
        )
        self.assertEqual("INTENTIONALLY_OMITTED_PAYLOAD_FREE_ENDPOINT", rows[0].disposition)
        self.assertEqual((), rows[0].sections)


if __name__ == "__main__":
    unittest.main()
