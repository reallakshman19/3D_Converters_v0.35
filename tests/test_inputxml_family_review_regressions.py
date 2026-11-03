#!/usr/bin/env python3
from __future__ import annotations

import html
import importlib.util
import sys
import unittest
from pathlib import Path

from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "inputxml_canonical_compiler.py"
spec = importlib.util.spec_from_file_location(
    "family_review_regression_compiler",
    MODULE_PATH,
)
compiler = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = compiler
spec.loader.exec_module(compiler)

from scripts.inputxml_compiler.base import DecisionLedger
from scripts.inputxml_compiler.family_accounting import account_profile_source

CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"
_COUNT_FIELDS = (
    "NUMELT", "NUMNOZ", "NOHGRS", "NUMBEND", "NUMRIGID",
    "NUMEXPJNT", "NUMREST", "NUMFORCMNT", "NUMUNFLOAD", "NUMWIND",
    "NUMELEOFF", "NUMALLOW", "NUMISECT",
)


def _counts(element_count: int) -> str:
    values = {name: 0 for name in _COUNT_FIELDS}
    values["NUMELT"] = element_count
    return " ".join(f'{name}="{value}"' for name, value in values.items())


def _element(
    *,
    from_node: int,
    to_node: int,
    line: str = "L1",
    pressure_name: str = "PRESSURE1",
    dimensions: bool = True,
) -> str:
    fields = [
        f'FROM_NODE="{from_node}"',
        f'TO_NODE="{to_node}"',
        'DELTA_X="100"',
        'DELTA_Y="0"',
        'DELTA_Z="0"',
        f'LINE_ID="{line}"' if pressure_name == "PRESSURE1" else f'LINE="{line}"',
        f'{pressure_name}="10"',
    ]
    if dimensions:
        fields.extend(['DIAMETER="100"', 'WALL_THICK="5"'])
    else:
        fields.extend(['DIAMETER="-1.0101"', 'WALL_THICK="-1.0101"'])
    return f"<PIPINGELEMENT {' '.join(fields)}/>"


def _document(elements: list[str], *, pressure_c: bool = False) -> str:
    del pressure_c
    return (
        '<CAESARII xmlns="COADE" VERSION="11.00" XML_TYPE="Input">'
        f'<PIPINGMODEL xmlns="" JOBNAME="REVIEW" {_counts(len(elements))} '
        'NORTH_X="0" NORTH_Y="1" NORTH_Z="0">'
        + "".join(elements)
        + "</PIPINGMODEL></CAESARII>"
    )


def _categorized(*, line_blocks: bool = False, original_document: bool = False) -> str:
    original = (
        '<PIPINGELEMENT ID="CAT-1" FROM_NODE="10" TO_NODE="20" '
        'DELTA_X="100" DELTA_Y="0" DELTA_Z="0" '
        'DIAMETER="100" WALL_THICK="5"/>'
    )
    line_review = (
        '<LineBlocks><ProcessBlock><Pressure source="review">10</Pressure>'
        '</ProcessBlock></LineBlocks>'
        if line_blocks
        else ""
    )
    document_review = (
        f"<OriginalDocument>{html.escape('<CAESARII/>')}</OriginalDocument>"
        if original_document
        else ""
    )
    return (
        '<CategorizedInputXML schema="categorized-inputxml/v3" sourceName="review">'
        '<Line id="L1"><LineBlock><Branchname>L1</Branchname><LineNo>L1</LineNo>'
        '</LineBlock>'
        f"{line_review}"
        '<Element fromNode="10" toNode="20" elementKey="CAT-1">'
        '<RouteGeometryBlock><DELTA_X>100</DELTA_X><DELTA_Y>0</DELTA_Y>'
        '<DELTA_Z>0</DELTA_Z></RouteGeometryBlock>'
        '<SectionDimensionBlock><DIAMETER>100</DIAMETER><WALL_THICK>5</WALL_THICK>'
        '</SectionDimensionBlock>'
        f"<OriginalElement>{html.escape(original, quote=True)}</OriginalElement>"
        '</Element></Line>'
        f"{document_review}"
        '</CategorizedInputXML>'
    )


class FamilyReviewRegressionTests(unittest.TestCase):
    def compile(self, source: str, *, dialect=None, context=None):
        return compiler.compile_document(
            source.encode("utf-8"),
            source_name="review.xml",
            source_repository="reallaksh19/3D_Converters",
            source_path="tests/review.xml",
            producer="family-review-regression",
            registry_path=CONTRACTS / "inputxml-dialect-registry.json",
            adapter_registry_path=(
                CONTRACTS / "compiler" / "inputxml-compiler-adapters.json"
            ),
            serialization_policy_path=(
                CONTRACTS / "compiler" / "inputxml-deterministic-serialization.json"
            ),
            alias_registry_path=(
                CONTRACTS / "catalogs" / "inputxml-alias-registry.json"
            ),
            canonical_xsd_path=CONTRACTS / "inputxml-canonical-v1.xsd",
            categorized_xsd_path=CONTRACTS / "categorized-inputxml-v3.xsd",
            semantic_rules_path=CONTRACTS / "inputxml-semantic-rules-v1.sch",
            dialect_override=dialect,
            context=context or {},
        )

    def assert_code(self, ledger, code: str) -> None:
        self.assertTrue(
            any(item.get("code") == code for item in ledger["diagnostics"]),
            ledger["diagnostics"],
        )

    def test_same_line_without_node_continuity_cannot_inherit(self):
        source = _document([
            _element(from_node=10, to_node=20),
            _element(from_node=30, to_node=40, dimensions=False),
        ])
        root, ledger, validation = self.compile(source)
        self.assertIsNone(root)
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])
        self.assert_code(ledger, "LINE_SCOPE_SEED_MISSING")

    def test_same_line_discontinuity_with_seeds_starts_new_scope(self):
        source = _document([
            _element(from_node=10, to_node=20),
            _element(from_node=30, to_node=40),
        ])
        root, ledger, validation = self.compile(source)
        self.assertEqual("PASS", validation["status"])
        self.assertIsNotNone(root)
        boundaries = [
            row for row in ledger["records"]
            if row["sourceType"] == "LINE_SCOPE_BOUNDARY"
        ]
        self.assertEqual(2, len(boundaries))
        self.assertEqual(
            "NODE_CONTINUITY_NOT_PROVEN",
            boundaries[1]["sourceFields"]["transitionReason"],
        )

    def test_assured_node_evidence_does_not_mutate_pressure_c_profile(self):
        source = _document([
            _element(
                from_node=10,
                to_node=20,
                pressure_name="PRESSURE_C1",
            )
        ])
        root, ledger, validation = self.compile(
            source,
            dialect="caesar-inputxml-pressure-c",
            context={
                "assuredNodeEvidence": {
                    "10": {"name": "INJECTED", "x": 1, "y": 2, "z": 3},
                    "20": {"name": "INJECTED", "x": 101, "y": 2, "z": 3},
                }
            },
        )
        self.assertEqual("PASS", validation["status"])
        element = root.find("PIPINGMODEL/PIPINGELEMENT")
        for field in (
            "FROM_NAME", "TO_NAME", "FROM_X", "FROM_Y", "FROM_Z",
            "TO_X", "TO_Y", "TO_Z",
        ):
            self.assertIsNone(element.get(field), field)
        self.assertFalse(any(
            row["sourceType"] == "EXPLICIT_ASSURED_NODE_EVIDENCE"
            for row in ledger["records"]
        ))

    def test_accounting_index_cannot_certify_empty_decision_set(self):
        root = ET.fromstring(b'<Root A="1"><Child>value</Child></Root>')
        ledger = DecisionLedger("repo", "test://root", "test", "test-profile")
        status, proof = account_profile_source(
            root,
            profile_id="test-profile",
            ledger=ledger,
        )
        self.assertEqual("BLOCKED", status)
        self.assertEqual(0, proof["coveredCount"])
        self.assertEqual(proof["inventoryCount"], len(proof["missingSourceEntityIds"]))
        indexes = [
            row for row in ledger.records
            if row["sourceType"] == "SOURCE_ACCOUNTING_INDEX"
        ]
        self.assertTrue(indexes)
        self.assertTrue(all(
            row["sourceFields"]["coverageStatus"] == "MISSING"
            for row in indexes
        ))

    def test_categorized_source_accounting_links_prior_decisions(self):
        root, ledger, validation = self.compile(
            _categorized(),
            context={"version": "11.00", "jobName": "CAT", "north": [0, 1, 0]},
        )
        self.assertEqual("PASS", validation["status"], ledger["diagnostics"])
        self.assertIsNotNone(root)
        proof = validation["resolverOutcome"]["profileMetrics"]["sourceAccounting"]
        self.assertEqual("PRIOR_TRANSFORMATION_DECISION_REQUIRED", proof["coverageRule"])
        self.assertEqual([], proof["missingSourceEntityIds"])
        self.assertEqual(proof["inventoryCount"], proof["coveredCount"])
        indexes = [
            row for row in ledger["records"]
            if row["sourceType"] == "SOURCE_ACCOUNTING_INDEX"
        ]
        self.assertTrue(all(
            row["sourceFields"]["coverageRecordIds"]
            for row in indexes
        ))

    def test_categorized_document_and_line_review_evidence_is_retained(self):
        root, ledger, validation = self.compile(
            _categorized(line_blocks=True, original_document=True),
            context={"version": "11.00", "jobName": "CAT", "north": [0, 1, 0]},
        )
        self.assertEqual("PASS", validation["status"], ledger["diagnostics"])
        names = {
            record.get("name")
            for record in root.findall(
                ".//{urn:reallaksh19:inputxml:extension:v1}Record"
            )
        }
        self.assertIn("CategorizedOriginalDocument", names)
        self.assertIn("LineBlocks", names)


if __name__ == "__main__":
    unittest.main()
