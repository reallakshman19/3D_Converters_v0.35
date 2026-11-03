import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / 'scripts' / 'inputxml_canonical_compiler.py'
spec = importlib.util.spec_from_file_location('inputxml_canonical_compiler_uxml_test', MODULE_PATH)
compiler = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = compiler
spec.loader.exec_module(compiler)
CONTRACTS = ROOT / 'contracts' / 'inputxml' / 'v1'

POINTS = [(0, 0, 0), (1000, 0, 0), (500, 866, 0)]


def rvm_rows(*, gap=0.0, middle_type='PIPE', include_od=True):
    rows = []
    component_types = ['PIPE', middle_type, 'PIPE']
    spans = [
        (POINTS[0], POINTS[1]),
        ((POINTS[1][0] + gap, POINTS[1][1], POINTS[1][2]), POINTS[2]),
        (POINTS[2], POINTS[0]),
    ]
    for index, (component_type, (start, end)) in enumerate(zip(component_types, spans), 1):
        row = {
            'componentId': f'C{index}',
            'rowNo': index,
            'type': component_type,
            'componentType': component_type,
            'pipelineRef': 'UXML-L-100',
            'lineNo': 'UXML-L-100',
            'convertedBore': 100,
            'ep1': {'x': start[0], 'y': start[1], 'z': start[2]},
            'ep2': {'x': end[0], 'y': end[1], 'z': end[2]},
            'wallThicknessMm': 6.02,
            'materialNumber': 106,
        }
        if include_od:
            row['outsideDiameterMm'] = 114.3
        rows.append(row)
    return rows


def uxml_document():
    components = []
    anchors = []
    ports = []
    segments = []
    spans = [(POINTS[0], POINTS[1]), (POINTS[1], POINTS[2]), (POINTS[2], POINTS[0])]
    for index, (start, end) in enumerate(spans, 1):
        component_id = f'U{index}'
        anchor1 = f'A-{component_id}-EP1'
        anchor2 = f'A-{component_id}-EP2'
        port1 = f'P-{component_id}-PIPE_END_1'
        port2 = f'P-{component_id}-PIPE_END_2'
        segment = f'S-{component_id}-001'
        components.append({
            'id': component_id,
            'sourceRefs': ['SRC-1'],
            'type': 'PIPE',
            'normalizedType': 'PIPE',
            'pipelineRef': 'UXML-L-200',
            'lineKey': 'UXML-L-200',
            'bore': 100,
            'anchorIds': [anchor1, anchor2],
            'portIds': [port1, port2],
            'segmentIds': [segment],
            'rawAttributes': {'outsideDiameterMm': 114.3, 'wallThicknessMm': 6.02},
            'normalized': {},
            'derived': {},
            'confidence': 'EXACT_SOURCE',
        })
        for role, anchor_id, port_id, point in (
            ('EP1', anchor1, port1, start),
            ('EP2', anchor2, port2, end),
        ):
            point_obj = {'x': point[0], 'y': point[1], 'z': point[2]}
            anchors.append({
                'id': anchor_id, 'componentId': component_id, 'role': role,
                'point': point_obj, 'sourceField': role, 'confidence': 'EXACT_SOURCE',
            })
            ports.append({
                'id': port_id, 'componentId': component_id, 'anchorId': anchor_id,
                'role': f'PIPE_END_{1 if role == "EP1" else 2}', 'point': point_obj,
                'bore': 100, 'fixed': False, 'futureMovable': True,
                'mutableNow': False, 'connectsTo': 'ENDPOINT', 'maxDegree': 1,
            })
        segments.append({
            'id': segment, 'componentId': component_id, 'type': 'PIPE_RUN',
            'startAnchorId': anchor1, 'endAnchorId': anchor2, 'supportAnchorId': '',
            'bore': 100, 'branchBore': None, 'metadata': {},
        })
    return {
        'schemaVersion': 'uxml-topology-v1',
        'profile': 'UXML-TOPOLOGY-FULL',
        'header': {'modelId': 'UXML-DIRECT-TEST', 'createdAt': '2026-07-15T12:00:00Z'},
        'sources': [{'id': 'SRC-1', 'format': 'UXML', 'name': 'direct.uxml.json', 'path': '', 'role': 'PRIMARY', 'hash': 'test'}],
        'mappings': [],
        'units': {'coordinates': 'MM', 'bore': 'MM', 'length': 'MM', 'weight': 'KG', 'pressure': 'kPa', 'temperature': 'C', 'rotation': 'DEGREES'},
        'pipelines': [{'id': 'PL-1', 'pipelineRef': 'UXML-L-200', 'lineKey': 'UXML-L-200', 'lineNo': 'UXML-L-200', 'attributes': {}}],
        'components': components,
        'anchors': anchors,
        'ports': ports,
        'segments': segments,
        'supports': [],
        'topologyHints': [],
        'rayEvidence': [],
        'lossContract': [],
        'diagnostics': [],
        'metadata': {},
    }


class UxmlRvmAdapterTests(unittest.TestCase):
    def compile(self, payload, *, dialect='uxml-rvm-intake', context=None):
        base_context = {
            'version': '11.00',
            'north': [0, 1, 0],
            'coordinateBasis': 'CAESAR',
            'jobName': 'UXML_RVM_CANONICAL_TEST',
            'connectToleranceMm': 6,
        }
        base_context.update(context or {})
        source = json.dumps(payload, separators=(',', ':')).encode()
        return compiler.compile_document(
            source,
            source_name='uxml-rvm.json',
            source_repository='reallaksh19/3D_Converters',
            source_path='test://uxml-rvm.json',
            producer='uxml-rvm-adapter-test',
            registry_path=CONTRACTS / 'inputxml-dialect-registry.json',
            alias_registry_path=CONTRACTS / 'catalogs' / 'inputxml-alias-registry.json',
            canonical_xsd_path=CONTRACTS / 'inputxml-canonical-v1.xsd',
            categorized_xsd_path=CONTRACTS / 'categorized-inputxml-v3.xsd',
            semantic_rules_path=CONTRACTS / 'inputxml-semantic-rules-v1.sch',
            dialect_override=dialect,
            context=base_context,
        )

    def test_rvm_rows_closed_exact_pipe_loop_passes(self):
        root, ledger, validation = self.compile({'inputKind': 'RVM_ROWS', 'rows': rvm_rows()})
        self.assertIsNotNone(root)
        self.assertEqual('PASS', validation['status'])
        elements = root.findall('PIPINGMODEL/PIPINGELEMENT')
        self.assertEqual(3, len(elements))
        self.assertEqual({'114.3'}, {item.get('DIAMETER') for item in elements})
        self.assertEqual({'6.02'}, {item.get('WALL_THICK') for item in elements})
        self.assertTrue(any(row['sourceType'] == 'RVM_EXTRACT_ROW' for row in ledger['records']))
        self.assertTrue(any(row['sourceType'] == 'UXML_RVM_INTAKE' for row in ledger['records']))

    def test_direct_uxml_document_auto_detects_and_passes(self):
        source = json.dumps(uxml_document(), separators=(',', ':')).encode()
        root, ledger, validation = compiler.compile_document(
            source,
            source_name='direct.uxml.json',
            source_repository='reallaksh19/3D_Converters',
            source_path='test://direct.uxml.json',
            producer='uxml-rvm-adapter-test',
            registry_path=CONTRACTS / 'inputxml-dialect-registry.json',
            alias_registry_path=CONTRACTS / 'catalogs' / 'inputxml-alias-registry.json',
            canonical_xsd_path=CONTRACTS / 'inputxml-canonical-v1.xsd',
            categorized_xsd_path=CONTRACTS / 'categorized-inputxml-v3.xsd',
            semantic_rules_path=CONTRACTS / 'inputxml-semantic-rules-v1.sch',
            context={'version': '11.00', 'north': [0, 1, 0], 'coordinateBasis': 'CAESAR'},
        )
        self.assertIsNotNone(root)
        self.assertEqual('PASS', validation['status'])
        self.assertEqual('uxml-rvm-intake', ledger['dialect'])
        self.assertEqual(3, len(root.findall('PIPINGMODEL/PIPINGELEMENT')))

    def test_tolerance_only_connection_blocks_exact_node_projection(self):
        root, ledger, validation = self.compile({'inputKind': 'RVM_ROWS', 'rows': rvm_rows(gap=0.5)})
        self.assertIsNotNone(root)
        self.assertEqual('BLOCKED', validation['status'])
        self.assertTrue(any(row['sourceType'] == 'UXML_NONEXACT_CONNECTION' for row in ledger['records']))

    def test_valve_component_is_preserved_and_blocks(self):
        root, ledger, validation = self.compile({'inputKind': 'RVM_ROWS', 'rows': rvm_rows(middle_type='VALVE')})
        self.assertIsNotNone(root)
        self.assertEqual('BLOCKED', validation['status'])
        self.assertEqual(2, len(root.findall('PIPINGMODEL/PIPINGELEMENT')))
        valve_rows = [row for row in ledger['records'] if row['sourceType'] == 'VALVE']
        self.assertTrue(any(row['disposition'] == 'UNSUPPORTED_BLOCKING' for row in valve_rows))

    def test_missing_coordinate_basis_blocks(self):
        root, ledger, validation = self.compile(
            {'inputKind': 'RVM_ROWS', 'rows': rvm_rows()},
            context={'coordinateBasis': ''},
        )
        self.assertIsNone(root)
        self.assertEqual('BLOCKED', validation['status'])

    def test_missing_outside_diameter_blocks_without_bore_guess(self):
        root, ledger, validation = self.compile({'inputKind': 'RVM_ROWS', 'rows': rvm_rows(include_od=False)})
        self.assertIsNone(root)
        self.assertEqual('BLOCKED', validation['status'])
        self.assertTrue(any('bore is not treated as OD' in ' '.join(row['diagnostics']) for row in ledger['records']))


if __name__ == '__main__':
    unittest.main()
