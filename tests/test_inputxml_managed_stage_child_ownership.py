import unittest

from scripts.inputxml_compiler.base import CompileBlocked
from scripts.inputxml_compiler.managed_stage_engineering import verify_engineering_projection
from scripts.inputxml_compiler.managed_stage_entities import verify_source_entities_and_ports
from scripts.inputxml_compiler.managed_stage_identity import verify_result_identity
from scripts.inputxml_compiler.managed_stage_parity_closure import verify_parity_and_metrics
from scripts.inputxml_compiler.managed_stage_topology import verify_topology_and_trace
from tests.managed_stage_test_support import (
    branch,
    engineering,
    pipe,
    point,
    raw_bridge_result,
    valve,
)
from tests.test_inputxml_managed_stage_artifact_closure import restamp


def weighted_valve(name, start, end, weight):
    value = valve()
    value["name"] = f"VALV {name}"
    value["attributes"].update({
        "NAME": name,
        "REF": name,
        "APOS": point(*start),
        "LPOS": point(*end),
    })
    value["enrichedAttributes"] = engineering()
    value["enrichedAttributes"]["componentWeightKg"] = weight
    return value


def stress_support(name, position):
    return {
        "name": f"SUPPORT {name}",
        "type": "SUPPORT",
        "attributes": {
            "TYPE": "ATTA",
            "NAME": name,
            "REF": name,
            "OWNER": "/PR7/B1",
            "POS": point(*position),
            "APOS": point(*position),
            "LPOS": point(*position),
            "SUPPORT_TYPE": "REST",
            "DTXR": "PIPE SUPPORT REST",
        },
    }


def rigid_source():
    return [branch([
        weighted_valve("=PR7/VALVE/1", (0, 0, 0), (1000, 0, 0), 10),
        weighted_valve("=PR7/VALVE/2", (1000, 0, 0), (2000, 0, 0), 20),
    ], end=(2000, 0, 0))]


def restraint_source():
    return [branch([
        pipe(name="=PR7/PIPE/1", start=(0, 0, 0), end=(1000, 0, 0)),
        pipe(name="=PR7/PIPE/2", start=(1000, 0, 0), end=(2000, 0, 0)),
        stress_support("=PR7/SUPPORT/1", (500, 0, 0)),
        stress_support("=PR7/SUPPORT/2", (1500, 0, 0)),
    ], end=(2000, 0, 0))]


class ManagedStageChildOwnershipTests(unittest.TestCase):
    def verify_until_parity(self, value, mutation):
        intake, ledger, result = raw_bridge_result(value)
        mutation(result)
        restamp(result)
        verify_result_identity(intake, result, ledger)
        source = verify_source_entities_and_ports(intake, result, ledger)
        topology = verify_topology_and_trace(result, source, ledger)
        topology["branchCollectionPath"] = intake.branch_collection_path
        projection = verify_engineering_projection(result, source, topology, ledger)
        with self.assertRaises(CompileBlocked):
            verify_parity_and_metrics(result, source, topology, projection, ledger)
        return ledger

    def test_restraint_moved_to_another_valid_element_blocks(self):
        def mutation(result):
            rows = result["parsedInputXmlTopology"]["restraints"]
            self.assertGreaterEqual(len(rows), 2)
            owners = [str(row["ownerInputXmlElementId"]) for row in rows]
            replacement = next(owner for owner in owners if owner != owners[0])
            rows[0]["ownerInputXmlElementId"] = replacement

        ledger = self.verify_until_parity(restraint_source(), mutation)
        self.assertTrue(any(
            row["code"] == "MANAGED_STAGE_INPUTXML_RELATION_MISMATCH"
            for row in ledger.diagnostics
        ))

    def test_rigid_moved_to_another_valid_element_blocks(self):
        def mutation(result):
            rows = result["parsedInputXmlTopology"]["rigids"]
            self.assertGreaterEqual(len(rows), 2)
            owners = [str(row["ownerInputXmlElementId"]) for row in rows]
            replacement = next(owner for owner in owners if owner != owners[0])
            rows[0]["ownerInputXmlElementId"] = replacement

        ledger = self.verify_until_parity(rigid_source(), mutation)
        self.assertTrue(any(
            row["code"] == "MANAGED_STAGE_INPUTXML_RELATION_MISMATCH"
            for row in ledger.diagnostics
        ))

    def test_rigid_source_identity_can_not_be_exchanged(self):
        def mutation(result):
            rows = result["parsedInputXmlTopology"]["rigids"]
            self.assertGreaterEqual(len(rows), 2)
            rows[0]["sourceEntityIds"], rows[1]["sourceEntityIds"] = (
                rows[1]["sourceEntityIds"],
                rows[0]["sourceEntityIds"],
            )

        self.verify_until_parity(rigid_source(), mutation)

    def test_restraint_support_identity_can_not_be_exchanged(self):
        def mutation(result):
            rows = result["parsedInputXmlTopology"]["restraints"]
            self.assertGreaterEqual(len(rows), 2)
            rows[0]["supportId"], rows[1]["supportId"] = (
                rows[1]["supportId"],
                rows[0]["supportId"],
            )

        self.verify_until_parity(restraint_source(), mutation)


if __name__ == "__main__":
    unittest.main()
