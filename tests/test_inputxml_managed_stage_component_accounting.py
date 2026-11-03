import unittest

from scripts.inputxml_compiler.managed_stage_accounting import account_managed_stage_source
from tests.managed_stage_test_support import branch, pipe, verified_evidence


def two_pipe_source():
    return [branch([
        pipe(name="=PR7/PIPE/1", start=(0, 0, 0), end=(1000, 0, 0)),
        pipe(name="=PR7/PIPE/2", start=(1000, 0, 0), end=(2000, 0, 0)),
    ], end=(2000, 0, 0))]


class ManagedStageComponentAccountingTests(unittest.TestCase):
    def test_component_and_port_conservation_invariants_are_zero(self):
        candidate, ledger, evidence = verified_evidence(two_pipe_source())
        status, proof = account_managed_stage_source(
            evidence["intake"], candidate, evidence=evidence, ledger=ledger
        )
        self.assertEqual("COMPLETE", status)
        names = (
            "missingComponentTopologyMappingCount",
            "wrongPortOwnerEntityCount",
            "portPositionMismatchCount",
            "componentEdgeCardinalityMismatchCount",
            "componentInputXmlCardinalityMismatchCount",
            "unrelatedIncidentElementCoverageCount",
        )
        self.assertTrue(all(proof["invariants"][name] == 0 for name in names))

    def test_unrelated_valid_element_can_not_certify_port_coverage(self):
        candidate, ledger, evidence = verified_evidence(two_pipe_source())
        mappings = evidence["topology"]["componentMappings"]
        all_elements = {
            value
            for mapping in mappings.values()
            for value in mapping["inputXmlElementIds"]
        }
        record = next(
            row for row in ledger.records
            if str((row.get("sourceFields") or {}).get("sourcePortDisposition") or "")
            and row.get("InputXMLElementIds")
            and set(row["sourceFields"]["authorizedComponentElementIds"]) != all_elements
        )
        authorized = set(record["sourceFields"]["authorizedComponentElementIds"])
        unrelated = next(value for value in all_elements if value not in authorized)
        record["InputXMLElementIds"].append(unrelated)
        status, proof = account_managed_stage_source(
            evidence["intake"], candidate, evidence=evidence, ledger=ledger
        )
        self.assertEqual("BLOCKED", status)
        self.assertEqual(1, proof["invariants"]["unrelatedIncidentElementCoverageCount"])

    def test_missing_component_mapping_blocks_accounting(self):
        candidate, ledger, evidence = verified_evidence(two_pipe_source())
        component_id = str(evidence["source"]["sourceModel"]["components"][0]["sourceEntityId"])
        evidence["topology"]["componentMappings"].pop(component_id)
        status, proof = account_managed_stage_source(
            evidence["intake"], candidate, evidence=evidence, ledger=ledger
        )
        self.assertEqual("BLOCKED", status)
        self.assertEqual(1, proof["invariants"]["missingComponentTopologyMappingCount"])


if __name__ == "__main__":
    unittest.main()
