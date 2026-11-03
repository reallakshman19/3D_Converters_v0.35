from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from converters.psi116_topology_resolver import ResolverConfig, resolve_psi116
from converters.psi116_topology_resolver.transaction import (
    TransactionPolicy,
    apply_topofix_transaction,
    write_topofix_outputs,
)

SYNTHETIC_XML = '''<?xml version="1.0"?>
<PipeStressExport xmlns="http://aveva.com/pipeStress116.xsd">
  <Pipe><Branch><Branchname>/A</Branchname>
    <Node><NodeNumber>10</NodeNumber><NodeName></NodeName><Endpoint>0</Endpoint><Rigid>0</Rigid><ComponentType>PIPE</ComponentType><Weight>0</Weight><ComponentRefNo>PIPE-A</ComponentRefNo><OutsideDiameter>100</OutsideDiameter><WallThickness>5</WallThickness><Position>0 0 0</Position></Node>
    <Node><NodeNumber>20</NodeNumber><NodeName></NodeName><Endpoint>0</Endpoint><Rigid>0</Rigid><ComponentType>ELBO</ComponentType><Weight>0</Weight><ComponentRefNo>=E1</ComponentRefNo><OutsideDiameter>100</OutsideDiameter><WallThickness>5</WallThickness><Position>0 0 0</Position><BendRadius>150</BendRadius></Node>
    <Node><NodeNumber>30</NodeNumber><NodeName></NodeName><Endpoint>0</Endpoint><Rigid>0</Rigid><ComponentType>PIPE</ComponentType><Weight>0</Weight><ComponentRefNo>PIPE-B</ComponentRefNo><OutsideDiameter>100</OutsideDiameter><WallThickness>5</WallThickness><Position>100 0 0</Position></Node>
  </Branch></Pipe>
  <Pipe><Branch><Branchname>/B</Branchname>
    <Node><NodeNumber>50</NodeNumber><NodeName></NodeName><Endpoint>2</Endpoint><Rigid>0</Rigid><ComponentType>REDU</ComponentType><Weight>0</Weight><ComponentRefNo>=R1</ComponentRefNo><OutsideDiameter>150</OutsideDiameter><WallThickness>6</WallThickness><Position>0 0 0</Position><AlphaAngle>10</AlphaAngle></Node>
    <Node><NodeNumber>60</NodeNumber><NodeName></NodeName><Endpoint>0</Endpoint><Rigid>0</Rigid><ComponentType>PIPE</ComponentType><Weight>0</Weight><ComponentRefNo>PIPE-C</ComponentRefNo><OutsideDiameter>150</OutsideDiameter><WallThickness>6</WallThickness><Position>0 100 0</Position></Node>
  </Branch></Pipe>
</PipeStressExport>'''


def action_for_nodes(result, disposition, numbers):
    expected = set(numbers)
    return next(action for action in result.fix_actions if action.disposition == disposition and set(action.node_numbers) == expected)


def local_name(tag):
    return tag.rsplit('}', 1)[-1]


def node_numbers(xml_text):
    root = ET.fromstring(xml_text)
    return [
        int((next(child for child in node if local_name(child.tag) == 'NodeNumber').text or '0').strip())
        for node in root.iter() if local_name(node.tag) == 'Node'
    ]


class Psi116TopoFixTransactionTests(unittest.TestCase):
    def test_explicit_alias_action_commits_without_deleting_component_records(self):
        result = resolve_psi116(SYNTHETIC_XML, source_name='synthetic.xml')
        action = action_for_nodes(result, 'ALIAS_COINCIDENT_NODE', {10, 20, 50})
        transaction = apply_topofix_transaction(
            result,
            policy=TransactionPolicy(selected_action_ids=(action.action_id,)),
        )
        self.assertTrue(transaction.committed, transaction.reject_reasons)
        self.assertEqual(len(transaction.operations), 2)
        self.assertTrue(all(operation.operation == 'ALIAS_NODE_NUMBER' for operation in transaction.operations))
        numbers = node_numbers(transaction.fixed_xml or '')
        self.assertNotIn(10, numbers)
        self.assertNotIn(50, numbers)
        self.assertEqual(numbers.count(20), 3)
        self.assertEqual(transaction.source_result.document.source_text, SYNTHETIC_XML)
        self.assertTrue(all(check.passed for check in transaction.checks if check.blocking))

    def test_transaction_requires_explicit_selection(self):
        result = resolve_psi116(SYNTHETIC_XML, source_name='synthetic.xml')
        with self.assertRaises(ValueError):
            apply_topofix_transaction(result, policy=TransactionPolicy())

    def test_outputs_emit_xml_only_for_committed_transaction(self):
        result = resolve_psi116(SYNTHETIC_XML, source_name='synthetic.xml')
        action = action_for_nodes(result, 'ALIAS_COINCIDENT_NODE', {10, 20, 50})
        transaction = apply_topofix_transaction(
            result,
            policy=TransactionPolicy(selected_action_ids=(action.action_id,)),
        )
        with tempfile.TemporaryDirectory() as directory:
            transaction_path, validation_path, fixed_path = write_topofix_outputs(transaction, directory, stem='case')
            self.assertTrue(transaction_path.is_file())
            self.assertTrue(validation_path.is_file())
            self.assertIsNotNone(fixed_path)
            self.assertTrue(Path(fixed_path).is_file())

    def test_real_1885_selected_aliases_commit_and_preserve_engineering_inventory(self):
        fixture = Path(__file__).resolve().parents[1] / 'Benchmarks' / '1885Sjson' / 'FirstpassXML'
        source_before = fixture.read_text(encoding='utf-8')
        result = resolve_psi116(fixture)
        elbow_contract = action_for_nodes(result, 'SAFE_DROP_PIPE_GEOMETRY', {1600, 1610})
        cross_branch = action_for_nodes(result, 'ALIAS_COINCIDENT_NODE', {1570, 2260})
        transaction = apply_topofix_transaction(
            result,
            policy=TransactionPolicy(selected_action_ids=(cross_branch.action_id, elbow_contract.action_id)),
            config=ResolverConfig(),
        )
        self.assertTrue(transaction.committed, transaction.reject_reasons)
        self.assertEqual(fixture.read_text(encoding='utf-8'), source_before)
        self.assertEqual(
            {operation.operation for operation in transaction.operations},
            {'ALIAS_NODE_NUMBER', 'REMOVE_PLAIN_PIPE_NODE_RECORD'},
        )
        numbers = node_numbers(transaction.fixed_xml or '')
        self.assertNotIn(1600, numbers)
        self.assertNotIn(2260, numbers)
        self.assertGreaterEqual(numbers.count(1570), 2)
        self.assertGreaterEqual(numbers.count(1610), 1)
        checks = {check.code: check for check in transaction.checks}
        self.assertTrue(checks['SPECIAL_COMPONENT_OCCURRENCES_PRESERVED'].passed)
        self.assertTrue(checks['RESTRAINT_COUNT_PRESERVED'].passed)
        self.assertTrue(checks['WEIGHT_SUM_PRESERVED'].passed)
        self.assertTrue(checks['SELECTED_FINDINGS_RESOLVED'].passed)


if __name__ == '__main__':
    unittest.main()
