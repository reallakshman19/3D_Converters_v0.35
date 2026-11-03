import copy
import unittest

from scripts.inputxml_compiler.managed_stage_accounting import account_managed_stage_source
from tests.managed_stage_test_support import verified_evidence


class ManagedStageSourceAccountingTests(unittest.TestCase):
    def build(self):
        candidate, ledger, evidence = verified_evidence()
        return candidate, ledger, evidence

    def account(self, candidate, ledger, evidence):
        return account_managed_stage_source(
            evidence["intake"],
            candidate,
            evidence=evidence,
            ledger=ledger,
        )

    def decisions(self, ledger):
        return [
            row for row in ledger.records
            if row.get("sourceType") == "MANAGED_STAGE_SOURCE_DECISION"
        ]

    def test_complete_verified_source_has_zero_invariants(self):
        candidate, ledger, evidence = self.build()
        status, proof = self.account(candidate, ledger, evidence)
        self.assertEqual("COMPLETE", status)
        self.assertEqual("COMPLETE", proof["status"])
        self.assertTrue(all(value == 0 for value in proof["invariants"].values()))

    def test_generic_inventory_record_cannot_certify_removed_decision(self):
        candidate, ledger, evidence = self.build()
        removed = self.decisions(ledger).pop()
        ledger.records.remove(removed)
        ledger.add(
            source_entity_id=removed["sourceEntityId"],
            source_type="MANAGED_STAGE_SOURCE_INVENTORY",
            source_fields={"identity": removed["sourceEntityId"]},
            projection_cardinality="1_TO_0",
            disposition="PRESERVE_EXTENSION",
            evidence=["deliberate non-authority tamper"],
        )
        status, proof = self.account(candidate, ledger, evidence)
        self.assertEqual("BLOCKED", status)
        self.assertGreater(
            proof["invariants"]["unaccountedSourceOccurrenceCount"],
            0,
        )

    def test_document_and_digest_records_cannot_certify_coverage(self):
        for source_type in (
            "MANAGED_STAGE_JSON",
            "MANAGED_STAGE_ARTIFACT_IDENTITY_CLOSURE",
        ):
            with self.subTest(source_type=source_type):
                candidate, ledger, evidence = self.build()
                removed = self.decisions(ledger)[0]
                ledger.records.remove(removed)
                ledger.add(
                    source_entity_id=removed["sourceEntityId"],
                    source_type=source_type,
                    source_fields={"tamper": True},
                    projection_cardinality="1_TO_0",
                    disposition="PRESERVE_EXTENSION",
                    evidence=["deliberate non-authority tamper"],
                )
                status, proof = self.account(candidate, ledger, evidence)
                self.assertEqual("BLOCKED", status)
                self.assertIn(
                    removed["sourceEntityId"],
                    proof["unaccountedSourceIdentities"],
                )

    def test_removed_source_entity_and_port_decisions_block(self):
        for kind in ("SOURCE_ENTITY", "SOURCE_PORT"):
            with self.subTest(kind=kind):
                candidate, ledger, evidence = self.build()
                record = next(
                    row for row in self.decisions(ledger)
                    if row["sourceFields"]["decisionKind"] == kind
                )
                ledger.records.remove(record)
                status, proof = self.account(candidate, ledger, evidence)
                self.assertEqual("BLOCKED", status)
                self.assertIn(
                    record["sourceEntityId"],
                    proof["unaccountedSourceIdentities"],
                )

    def test_duplicate_semantic_decision_blocks(self):
        candidate, ledger, evidence = self.build()
        duplicate = copy.deepcopy(self.decisions(ledger)[0])
        duplicate["recordId"] = "deliberate-duplicate"
        ledger.records.append(duplicate)
        status, proof = self.account(candidate, ledger, evidence)
        self.assertEqual("BLOCKED", status)
        self.assertGreater(proof["invariants"]["duplicateSourceDecisionCount"], 0)

    def test_unexpected_semantic_decision_blocks(self):
        candidate, ledger, evidence = self.build()
        unexpected = copy.deepcopy(self.decisions(ledger)[0])
        unexpected["recordId"] = "deliberate-unexpected"
        unexpected["sourceEntityId"] = "$.not-in-source"
        ledger.records.append(unexpected)
        status, proof = self.account(candidate, ledger, evidence)
        self.assertEqual("BLOCKED", status)
        self.assertEqual(
            1,
            proof["invariants"]["unexpectedSourceDecisionCount"],
        )

    def test_removed_canonical_node_mapping_blocks(self):
        candidate, ledger, evidence = self.build()
        for row in self.decisions(ledger):
            row["canonicalNodeIds"] = []
        status, proof = self.account(candidate, ledger, evidence)
        self.assertEqual("BLOCKED", status)
        self.assertGreater(proof["invariants"]["orphanCanonicalNodeCount"], 0)

    def test_removed_canonical_edge_and_inputxml_mapping_blocks(self):
        candidate, ledger, evidence = self.build()
        for row in self.decisions(ledger):
            row["canonicalElementIds"] = []
            row["InputXMLElementIds"] = []
        status, proof = self.account(candidate, ledger, evidence)
        self.assertEqual("BLOCKED", status)
        self.assertGreater(proof["invariants"]["orphanCanonicalEdgeCount"], 0)
        self.assertGreater(
            proof["invariants"]["unmappedInputXmlElementCount"],
            0,
        )

    def test_accounting_indexes_are_created_after_frozen_decisions(self):
        candidate, ledger, evidence = self.build()
        original_ids = {
            row["recordId"] for row in self.decisions(ledger)
        }
        status, _ = self.account(candidate, ledger, evidence)
        self.assertEqual("COMPLETE", status)
        indexes = [
            row for row in ledger.records
            if row.get("sourceType") == "MANAGED_STAGE_SOURCE_ACCOUNTING_INDEX"
        ]
        self.assertEqual(
            len(evidence["intake"].inventory.entries),
            len(indexes),
        )
        self.assertTrue(all(
            set(row["sourceFields"]["priorDecisionRecordIds"]).issubset(original_ids)
            for row in indexes
        ))


if __name__ == "__main__":
    unittest.main()
