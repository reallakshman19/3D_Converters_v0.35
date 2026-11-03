import unittest
from pathlib import Path

from lxml import etree as ET

from scripts.inputxml_compiler.base import DecisionLedger
from scripts.inputxml_compiler.dispatcher import resolve_registered_profile
from scripts.inputxml_compiler.resolver_contract import OutcomeKind, ResolverOutcome


COUNT_VALUES = {
    "NUMELT": "1",
    "NUMNOZ": "0",
    "NOHGRS": "0",
    "NUMBEND": "0",
    "NUMRIGID": "0",
    "NUMEXPJNT": "0",
    "NUMREST": "0",
    "NUMFORCMNT": "0",
    "NUMUNFLOAD": "0",
    "NUMWIND": "0",
    "NUMELEOFF": "0",
    "NUMALLOW": "0",
    "NUMISECT": "0",
}


class TestInputXMLResolverContract(unittest.TestCase):
    def setUp(self):
        self.ledger = DecisionLedger("repo", "path", "prod", "dialect")
        self.aliases = {}
        self.context = {}
        self.categorized_xsd_path = Path("fake.xsd")

    def resolve(self, dialect, adapter_id, root, context=None):
        return resolve_registered_profile(
            dialect=dialect,
            adapter_id=adapter_id,
            source=b"",
            root=root,
            ledger=self.ledger,
            aliases=self.aliases,
            context=context or self.context,
            source_name="test",
            source_path="path",
            categorized_xsd_path=self.categorized_xsd_path,
        )

    def test_canonical_inputxml_v1_uses_registered_adapter_identity(self):
        root = ET.Element("CAESARII")
        outcome = self.resolve(
            "canonical-inputxml-v1",
            "direct-canonical-validation",
            root,
        )
        self.assertIsInstance(outcome, ResolverOutcome)
        self.assertEqual(outcome.profile_id, "canonical-inputxml-v1")
        self.assertEqual(outcome.adapter_id, "direct-canonical-validation")
        self.assertEqual(outcome.outcome_kind, OutcomeKind.CANONICAL_CANDIDATE)
        self.assertIsNotNone(outcome.canonical_candidate)

    def test_xml_to_cii_diagnostic_sidecar_is_blocked_with_candidate(self):
        root = ET.Element(
            "{COADE}CAESARII",
            XML_TYPE="Input",
            VERSION="11.00",
        )
        model = ET.SubElement(
            root,
            "PIPINGMODEL",
            JOBNAME="T",
            NORTH_X="0",
            NORTH_Y="1",
            NORTH_Z="0",
            **COUNT_VALUES,
        )
        ET.SubElement(
            model,
            "PIPINGELEMENT",
            ID="E1",
            FROM_NODE="10",
            TO_NODE="20",
            LINE="L1",
            DELTA_X="1",
            DELTA_Y="0",
            DELTA_Z="0",
            DIAMETER="10",
            WALL_THICK="1",
        )
        outcome = self.resolve(
            "xml-to-cii-diagnostic-sidecar",
            "diagnostic-sidecar-reconciliation",
            root,
        )
        self.assertEqual(outcome.adapter_id, "diagnostic-sidecar-reconciliation")
        self.assertEqual(outcome.outcome_kind, OutcomeKind.BLOCKED_WITH_CANDIDATE)
        self.assertEqual(outcome.source_accounting_status, "COMPLETE")
        self.assertTrue(self.ledger.blocked)

    def test_candidate_outcome_requires_candidate(self):
        with self.assertRaisesRegex(ValueError, "candidate presence"):
            ResolverOutcome(
                profile_id="p",
                adapter_id="a",
                outcome_kind=OutcomeKind.CANONICAL_CANDIDATE,
            )

    def test_blocked_no_candidate_rejects_candidate(self):
        with self.assertRaisesRegex(ValueError, "candidate presence"):
            ResolverOutcome(
                profile_id="p",
                adapter_id="a",
                outcome_kind=OutcomeKind.BLOCKED_NO_CANDIDATE,
                canonical_candidate=ET.Element("candidate"),
            )

    def test_adapter_identity_is_required(self):
        with self.assertRaisesRegex(ValueError, "adapter_id"):
            ResolverOutcome(
                profile_id="p",
                adapter_id="",
                outcome_kind=OutcomeKind.BLOCKED_NO_CANDIDATE,
            )


if __name__ == "__main__":
    unittest.main()
