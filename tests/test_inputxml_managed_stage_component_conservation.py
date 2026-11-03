import copy
import unittest

from scripts.inputxml_compiler.base import CompileBlocked
from scripts.inputxml_compiler.managed_stage_component_closure import (
    verify_component_topology_closure,
)
from scripts.inputxml_compiler.managed_stage_entities import verify_source_entities_and_ports
from scripts.inputxml_compiler.managed_stage_identity import verify_result_identity
from scripts.inputxml_compiler.managed_stage_topology import verify_topology_and_trace
from scripts.inputxml_compiler.managed_stage_trace_relations import (
    expected_trace_relation,
    relation_fields,
)
from tests.managed_stage_test_support import (
    branch,
    pipe,
    raw_bridge_result,
    verified_evidence,
)
from tests.test_inputxml_managed_stage_artifact_closure import restamp

_COLLECTIONS = (
    "nodes", "edges", "pointFeatures", "junctions", "boundaries", "supports", "rigids",
)


def two_pipe_source():
    return [branch([
        pipe(name="=PR7/PIPE/1", start=(0, 0, 0), end=(1000, 0, 0)),
        pipe(name="=PR7/PIPE/2", start=(1000, 0, 0), end=(2000, 0, 0)),
    ], end=(2000, 0, 0))]


def restamp_trace_relations(result, source):
    collections = {
        name: result["canonicalTopology"][name]
        for name in _COLLECTIONS
    }
    for row in result["traceLedger"]["records"]:
        expected = expected_trace_relation(row["sourceEntityId"], source, collections)
        for field in relation_fields():
            row[field] = copy.deepcopy(expected[field])
        row.setdefault("evidence", {})["mergeAuthority"] = expected["mergeAuthority"]
    restamp(result)


class ManagedStageComponentConservationTests(unittest.TestCase):
    def base(self):
        intake, ledger, result = raw_bridge_result(two_pipe_source())
        verify_result_identity(intake, result, ledger)
        source = verify_source_entities_and_ports(intake, result, ledger)
        return intake, ledger, result, source

    def verified_topology(self, intake, ledger, result, source):
        verify_result_identity(intake, result, ledger)
        return verify_topology_and_trace(result, source, ledger)

    def test_route_component_removed_from_edge_ancestry_blocks_after_restamping(self):
        intake, ledger, result, source = self.base()
        first_pipe = next(
            row for row in source["sourceModel"]["components"]
            if str(row.get("sourcePath") or "").endswith("children[0]")
        )
        entity_id = str(first_pipe["sourceEntityId"])
        result["canonicalTopology"]["edges"] = [
            edge for edge in result["canonicalTopology"]["edges"]
            if entity_id not in (edge.get("sourceEntityIds") or [])
        ]
        restamp_trace_relations(result, source)
        topology = self.verified_topology(intake, ledger, result, source)
        with self.assertRaises(CompileBlocked):
            verify_component_topology_closure(
                result["canonicalTopology"], topology["collections"], source, ledger
            )

    def test_node_source_entity_must_equal_owners_of_its_source_ports(self):
        intake, ledger, result, source = self.base()
        nodes = result["canonicalTopology"]["nodes"]
        target = nodes[0]
        actual_owners = set(target["sourceEntityIds"])
        replacement = next(
            entity_id for entity_id in source["entityById"]
            if entity_id not in actual_owners
        )
        target["sourceEntityIds"] = [replacement]
        restamp(result)
        topology = self.verified_topology(intake, ledger, result, source)
        with self.assertRaises(CompileBlocked):
            verify_component_topology_closure(
                result["canonicalTopology"], topology["collections"], source, ledger
            )

    def test_node_position_requires_producer_owned_port_authority(self):
        intake, ledger, result, source = self.base()
        node = result["canonicalTopology"]["nodes"][0]
        node["position"]["x"] += 0.25
        restamp(result)
        topology = self.verified_topology(intake, ledger, result, source)
        with self.assertRaises(CompileBlocked):
            verify_component_topology_closure(
                result["canonicalTopology"], topology["collections"], source, ledger
            )

    def test_shared_node_ports_cover_only_their_owner_component_elements(self):
        _, ledger, evidence = verified_evidence(two_pipe_source())
        mappings = evidence["topology"]["componentMappings"]
        port_records = [
            row for row in ledger.records
            if str((row.get("sourceFields") or {}).get("sourcePortDisposition") or "")
        ]
        checked = 0
        for record in port_records:
            fields = record["sourceFields"]
            owner = str(fields["ownerSourceEntityId"])
            if owner not in mappings or not mappings[owner]["edgeInputXmlElementIds"]:
                continue
            actual = set(record.get("InputXMLElementIds") or [])
            authorized = set(mappings[owner]["inputXmlElementIds"])
            self.assertTrue(actual)
            self.assertTrue(actual.issubset(authorized))
            self.assertFalse(actual.intersection(fields.get("unrelatedIncidentElementIds") or []))
            checked += 1
        self.assertGreaterEqual(checked, 4)


if __name__ == "__main__":
    unittest.main()
