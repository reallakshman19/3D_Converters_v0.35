#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from converters.psi116_topology_resolver import ResolverConfig, resolve_psi116, write_sidecars


SYNTHETIC_XML = '''<?xml version="1.0"?>
<PipeStressExport xmlns="http://aveva.com/pipeStress116.xsd">
  <Pipe><Branch><Branchname>/A</Branchname>
    <Node><NodeNumber>10</NodeNumber><Endpoint>0</Endpoint><Rigid>2</Rigid><ComponentType>PIPE</ComponentType><Position>0 0 0</Position></Node>
    <Node><NodeNumber>20</NodeNumber><Endpoint>0</Endpoint><Rigid>0</Rigid><ComponentType>ELBO</ComponentType><ComponentRefNo>=E1</ComponentRefNo><Position>0 0 0</Position><BendRadius>305</BendRadius></Node>
    <Node><NodeNumber>30</NodeNumber><Endpoint>0</Endpoint><Rigid>0</Rigid><ComponentType>PIPE</ComponentType><Position>5 0 0</Position></Node>
    <Node><NodeNumber>40</NodeNumber><Endpoint>0</Endpoint><Rigid>0</Rigid><ComponentType>PIPE</ComponentType><Position>100 0 0</Position></Node>
  </Branch></Pipe>
  <Pipe><Branch><Branchname>/B</Branchname>
    <Node><NodeNumber>50</NodeNumber><Endpoint>0</Endpoint><Rigid>0</Rigid><ComponentType>REDU</ComponentType><ComponentRefNo>=R1</ComponentRefNo><Position>0 0 0</Position><AlphaAngle>10</AlphaAngle></Node>
    <Node><NodeNumber>60</NodeNumber><Endpoint>0</Endpoint><Rigid>0</Rigid><ComponentType>PIPE</ComponentType><Position>100 0 0</Position></Node>
  </Branch></Pipe>
  <Pipe><Branch><Branchname>/C</Branchname>
    <Node><NodeNumber>70</NodeNumber><Endpoint>0</Endpoint><Rigid>0</Rigid><ComponentType>PIPE</ComponentType><Position>0 100 0</Position></Node>
    <Node><NodeNumber>80</NodeNumber><Endpoint>0</Endpoint><Rigid>0</Rigid><ComponentType>PIPE</ComponentType><Position>5 100 0</Position></Node>
    <Node><NodeNumber>90</NodeNumber><Endpoint>0</Endpoint><Rigid>0</Rigid><ComponentType>PIPE</ComponentType><Position>100 100 0</Position></Node>
  </Branch></Pipe>
</PipeStressExport>'''


class Psi116TopologyResolverFoundationTests(unittest.TestCase):
    def test_dry_run_findings_and_dispositions(self) -> None:
        result = resolve_psi116(SYNTHETIC_XML, source_name="synthetic.xml")
        codes = {finding.code for finding in result.findings}
        self.assertIn("ZERO_LENGTH_ROUTE_SPAN", codes)
        self.assertIn("SHORT_ROUTE_SPAN", codes)
        self.assertIn("NON_RIGID_COMPONENT_CLASSIFIED_RIGID", codes)
        self.assertIn("COINCIDENT_NODE_ALIAS_CANDIDATE", codes)
        self.assertIn("ELBO_HELPER_PORTS_MISSING", codes)

        dispositions = {action.disposition for action in result.fix_actions}
        self.assertIn("ALIAS_COINCIDENT_NODE", dispositions)
        self.assertIn("REMOVE_FALSE_RIGID", dispositions)

        plan = result.fix_plan_payload(ResolverConfig())
        self.assertEqual(plan["mutationPolicy"], "DRY_RUN_ONLY")
        self.assertFalse(plan["sourceXmlMutated"])
        self.assertEqual(result.document.source_text, SYNTHETIC_XML)

    def test_sidecars_are_deterministic_and_do_not_emit_xml(self) -> None:
        config = ResolverConfig()
        result = resolve_psi116(SYNTHETIC_XML, config, source_name="synthetic.xml")
        with tempfile.TemporaryDirectory() as tmp:
            first = write_sidecars(result, tmp, config, stem="case")
            first_bytes = [path.read_bytes() for path in first]
            second = write_sidecars(result, tmp, config, stem="case")
            self.assertEqual(first_bytes, [path.read_bytes() for path in second])
            self.assertFalse(any(Path(tmp).glob("*.xml")))
            findings = json.loads(first[0].read_text(encoding="utf-8"))
            plan = json.loads(first[1].read_text(encoding="utf-8"))
            self.assertEqual(findings["source"]["sha256"], plan["source"]["sha256"])

    def test_real_1885_uses_component_occurrences_not_positive_node_backtracking(self) -> None:
        fixture = REPO_ROOT / "Benchmarks" / "1885Sjson" / "FirstpassXML"
        self.assertTrue(fixture.is_file(), fixture)
        source_before = fixture.read_text(encoding="utf-8")
        result = resolve_psi116(fixture)
        self.assertEqual(source_before, fixture.read_text(encoding="utf-8"))
        self.assertEqual(result.document.source_text, source_before)

        summary = result.findings_payload(ResolverConfig())["summary"]
        self.assertEqual(summary["branchCount"], 5)
        self.assertEqual(summary["sourceNodeRecordCount"], 216)
        self.assertEqual(summary["componentOccurrenceCount"], 163)
        self.assertEqual(summary["blockingFindingCount"], 0)

        codes = {finding.code for finding in result.findings}
        self.assertNotIn("COLLINEAR_ROUTE_OVERLAP", codes)
        self.assertNotIn("DUPLICATE_ROUTE_SPAN", codes)
        self.assertNotIn("COINCIDENT_NODE_IDENTITY_AMBIGUOUS", codes)

        self.assertTrue(any(
            finding.code == "ZERO_LENGTH_ROUTE_SPAN"
            and {1600, 1610}.issubset(set(finding.node_numbers))
            for finding in result.findings
        ))
        self.assertTrue(any(
            finding.code == "COINCIDENT_NODE_ALIAS_CANDIDATE"
            and {1570, 2260}.issubset(set(finding.node_numbers))
            and finding.details.get("ownerNodeNumber") == 1570
            for finding in result.findings
        ))

        contraction_1610 = [
            action for action in result.fix_actions
            if action.disposition == "SAFE_DROP_PIPE_GEOMETRY"
            and action.owner_node_number == 1610
            and 1600 in action.absorbed_node_numbers
        ]
        self.assertEqual(len(contraction_1610), 1)
        self.assertEqual(len(contraction_1610[0].finding_ids), 2)
        self.assertIn("SPAN-000135", contraction_1610[0].span_ids)

        self.assertTrue(any(
            action.disposition == "ALIAS_COINCIDENT_NODE"
            and action.owner_node_number == 1570
            and 2260 in action.absorbed_node_numbers
            for action in result.fix_actions
        ))

        self.assertEqual(sum(finding.code == "AUTO_PIPE_INLINE_COMPONENT_CARRIER" for finding in result.findings), 18)
        self.assertEqual(sum(finding.code == "SUPPORT_ON_PIPE_CARRIER" for finding in result.findings), 36)
        self.assertEqual(sum(finding.code == "JUNCTION_ON_PIPE_CARRIER" for finding in result.findings), 13)
        self.assertTrue(all(action.disposition != "BLOCK_AMBIGUOUS" for action in result.fix_actions))


if __name__ == "__main__":
    unittest.main()
