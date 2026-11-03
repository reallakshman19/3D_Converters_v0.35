import copy
import unittest

from scripts.inputxml_compiler.base import CompileBlocked
from scripts.inputxml_compiler.managed_stage_entities import verify_source_entities_and_ports
from scripts.inputxml_compiler.managed_stage_identity import verify_result_identity
from scripts.inputxml_compiler.managed_stage_topology import verify_topology_and_trace
from tests.managed_stage_test_support import (
    branch,
    engineering,
    pipe,
    point,
    raw_bridge_result,
)
from tests.test_inputxml_managed_stage_artifact_closure import restamp


def weighted_point_flange():
    values = engineering()
    values["componentWeightKg"] = 10
    return {
        "name": "FLAN =PR7/FLANGE/POINT",
        "type": "FLAN",
        "attributes": {
            "TYPE": "FLAN",
            "NAME": "=PR7/FLANGE/POINT",
            "REF": "=PR7/FLANGE/POINT",
            "OWNER": "/PR7/B1",
            "APOS": point(500, 0, 0),
            "LPOS": point(500, 0, 0),
            "ABORE": "100mm",
            "LBORE": "100mm",
            "DTXR": "FLAN",
        },
        "enrichedAttributes": values,
    }


def tee(name, origin_y):
    return {
        "name": f"TEE {name}",
        "type": "TEE",
        "attributes": {
            "TYPE": "TEE",
            "NAME": name,
            "REF": name,
            "OWNER": "/PR7/B2",
            "APOS": point(0, origin_y, 0),
            "POS": point(500, origin_y, 0),
            "LPOS": point(1000, origin_y, 0),
            "ABORE": "100mm",
            "LBORE": "100mm",
            "DTXR": "TEE",
        },
        "enrichedAttributes": engineering("PR7-L-TEE"),
    }


def relational_source():
    first = branch([
        pipe(name="=PR7/PIPE/1", start=(0, 0, 0), end=(1000, 0, 0)),
        pipe(name="=PR7/PIPE/2", start=(1000, 0, 0), end=(2000, 0, 0)),
        weighted_point_flange(),
    ])
    second = branch(
        [tee("=PR7/TEE/1", 1000)],
        name="/PR7/B2",
        start=(0, 1000, 0),
        end=(1000, 1000, 0),
    )
    third = branch(
        [pipe(name="=PR7/PIPE/3", start=(0, 2000, 0), end=(1000, 2000, 0))],
        name="/PR7/B3",
        start=(0, 2000, 0),
        end=(1000, 2000, 0),
    )
    third["attributes"]["HREF"] = "=/PR7/EXTERNAL"
    return [first, second, third]


class ManagedStageTraceOwnershipTests(unittest.TestCase):
    def base(self):
        intake, ledger, result = raw_bridge_result(relational_source())
        verify_result_identity(intake, result, ledger)
        source = verify_source_entities_and_ports(intake, result, ledger)
        return intake, ledger, result, source

    def target_trace(self, result):
        return next(
            row for row in result["traceLedger"]["records"]
            if row.get("sourceType") == "PIPE"
            and str(row.get("sourcePath") or "").endswith("children[0]")
        )

    def wrong_valid(self, values, owned):
        return next(value for value in values if value not in set(owned or []))

    def assert_relation_mutation_blocks(self, mutate):
        intake, ledger, result, source = self.base()
        mutate(result, self.target_trace(result))
        restamp(result)
        verify_result_identity(intake, result, ledger)
        with self.assertRaises(CompileBlocked):
            verify_topology_and_trace(result, source, ledger)

    def test_valid_wrong_topology_identity_substitutions_block(self):
        def identity_mutation(field, collection):
            def mutate(result, trace):
                values = [str(row["id"]) for row in result["canonicalTopology"][collection]]
                trace[field] = [self.wrong_valid(values, trace.get(field))]
            return mutate

        cases = {
            "canonicalNodeIds": identity_mutation("canonicalNodeIds", "nodes"),
            "canonicalEdgeIds": identity_mutation("canonicalEdgeIds", "edges"),
            "pointFeatureIds": identity_mutation("pointFeatureIds", "pointFeatures"),
            "junctionIds": identity_mutation("junctionIds", "junctions"),
            "boundaryIds": identity_mutation("boundaryIds", "boundaries"),
        }
        for field, mutate in cases.items():
            with self.subTest(field=field):
                self.assert_relation_mutation_blocks(mutate)

    def test_valid_wrong_edge_relation_substitutions_block(self):
        for field in ("affectedEdgeIds", "branchEdgeIds"):
            with self.subTest(field=field):
                def mutate(result, trace, field=field):
                    values = [str(row["id"]) for row in result["canonicalTopology"]["edges"]]
                    trace[field] = [self.wrong_valid(values, trace.get(field))]
                self.assert_relation_mutation_blocks(mutate)

    def test_valid_wrong_inputxml_element_substitution_blocks(self):
        def mutate(result, trace):
            values = [
                str(value)
                for edge in result["canonicalTopology"]["edges"]
                for value in edge["inputXmlElementIds"]
            ]
            trace["inputXmlElementIds"] = [
                self.wrong_valid(values, trace.get("inputXmlElementIds"))
            ]
        self.assert_relation_mutation_blocks(mutate)

    def test_non_identity_trace_relations_are_reconstructed(self):
        mutations = {
            "projectionCardinality": lambda row: row.__setitem__("projectionCardinality", "ONE_TO_MANY"),
            "operation": lambda row: row.__setitem__("operation", "emit-inline-component-edge"),
            "lossClassification": lambda row: row.__setitem__("lossClassification", "POINT_FEATURE_ONLY"),
            "deferredProperties": lambda row: row.__setitem__("deferredProperties", ["WEIGHT"]),
            "status": lambda row: row.__setitem__("status", "ERROR"),
            "primaryDisposition": lambda row: row.__setitem__("primaryDisposition", "EMIT_POINT_FEATURE"),
            "mergeAuthority": lambda row: row.setdefault("evidence", {}).__setitem__("mergeAuthority", "FORGED"),
        }
        for field, change in mutations.items():
            with self.subTest(field=field):
                self.assert_relation_mutation_blocks(lambda result, trace, change=change: change(trace))

    def test_source_port_cannot_be_owned_by_two_canonical_nodes(self):
        intake, ledger, result, source = self.base()
        nodes = result["canonicalTopology"]["nodes"]
        port_id = str(nodes[0]["sourcePortIds"][0])
        target = next(row for row in nodes[1:] if port_id not in row["sourcePortIds"])
        target["sourcePortIds"].append(port_id)
        restamp(result)
        verify_result_identity(intake, result, ledger)
        with self.assertRaises(CompileBlocked):
            verify_topology_and_trace(result, source, ledger)
        self.assertTrue(any(
            row["code"] == "MANAGED_STAGE_SOURCE_PORT_OWNER_AMBIGUOUS"
            for row in ledger.diagnostics
        ))


if __name__ == "__main__":
    unittest.main()
