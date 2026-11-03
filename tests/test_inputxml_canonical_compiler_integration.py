import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / 'scripts' / 'inputxml_canonical_compiler.py'
spec = importlib.util.spec_from_file_location('inputxml_canonical_compiler_integration', MODULE_PATH)
compiler = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = compiler
spec.loader.exec_module(compiler)

CONTRACTS = ROOT / 'contracts' / 'inputxml' / 'v1'

class IntegrationTests(unittest.TestCase):
    def compile(self, source: bytes, *, name='source.xml', dialect=None, context=None):
        return compiler.compile_document(
            source,
            source_name=name,
            source_repository='reallaksh19/3D_Converters',
            source_path=f'test://{name}',
            producer='integration-test',
            registry_path=CONTRACTS / 'inputxml-dialect-registry.json',
            alias_registry_path=CONTRACTS / 'catalogs' / 'inputxml-alias-registry.json',
            canonical_xsd_path=CONTRACTS / 'inputxml-canonical-v1.xsd',
            categorized_xsd_path=CONTRACTS / 'categorized-inputxml-v3.xsd',
            semantic_rules_path=CONTRACTS / 'inputxml-semantic-rules-v1.sch',
            dialect_override=dialect,
            context=context or {},
        )

    def test_direct_canonical_golden(self):
        source = (CONTRACTS / 'golden' / 'positive' / 'minimal.canonical.input.xml').read_bytes()
        root, ledger, validation = self.compile(source, dialect='canonical-inputxml-v1')
        self.assertIsNotNone(root)
        self.assertEqual('PASS', validation['status'])
        self.assertGreater(ledger['recordCount'], 20)
        self.assertFalse(any(row['disposition'] in {'DROP','SKIP'} for row in ledger['records']))

    def test_pressure1_intake_becomes_canonical(self):
        source = b'''<CAESARII xmlns="COADE" VERSION="11.00" XML_TYPE="Input"><PIPINGMODEL xmlns="" JOBNAME="PRESSURE1" NUMELT="2" NUMNOZ="0" NOHGRS="0" NUMBEND="0" NUMRIGID="0" NUMEXPJNT="0" NUMREST="0" NUMFORCMNT="0" NUMUNFLOAD="0" NUMWIND="0" NUMELEOFF="0" NUMALLOW="0" NUMISECT="0" NORTH_X="0" NORTH_Y="1" NORTH_Z="0"><PIPINGELEMENT FROM_NODE="10.000000" TO_NODE="20.000000" DELTA_X="0" DELTA_Y="1000.000000" DELTA_Z="0" DIAMETER="114.300000" WALL_THICK="6.020000" LINE_ID="L-001" PRESSURE1="1000.000000"/><PIPINGELEMENT FROM_NODE="20.000000" TO_NODE="30.000000" DELTA_X="500.000000" DELTA_Y="0" DELTA_Z="0" DIAMETER="-1.010100" WALL_THICK="-1.010100" LINE_ID="L-001" PRESSURE1="-1.010100"/></PIPINGMODEL></CAESARII>'''
        root, ledger, validation = self.compile(source)
        self.assertEqual('PASS', validation['status'])
        elements = root.find('PIPINGMODEL').findall('PIPINGELEMENT')
        self.assertEqual('1000', elements[0].get('PRESSURE_C1'))
        self.assertIsNone(elements[0].get('PRESSURE1'))
        self.assertEqual('114.3', elements[1].get('DIAMETER'))
        self.assertEqual('0', elements[1].get('DELTA_Y'))
        self.assertTrue(any('PRESSURE1' in str(row['sourceFields']) for row in ledger['records']))

    def test_categorized_golden_reconciles(self):
        source = (CONTRACTS / 'golden' / 'positive' / 'categorized-v3.xml').read_bytes()
        root, ledger, validation = self.compile(
            source,
            context={'version':'11.00','jobName':'CATEGORIZED_GOLDEN','north':[0,1,0],'time':'2026/07/15 12:00:00'},
        )
        self.assertEqual('PASS', validation['status'])
        element = root.find('PIPINGMODEL/PIPINGELEMENT')
        self.assertEqual('L-001', element.get('LINE'))
        records = element.xpath("ext:Extension/ext:Record", namespaces={'ext': compiler.EXT_NS})
        self.assertTrue(any(record.get('name') == 'OriginalElement' for record in records))
        self.assertTrue(any(
            row['sourceType'] == 'CATEGORIZED_NORMALIZED_FIELD'
            for row in ledger['records']
        ))

    def test_diagnostic_sidecar_is_never_pass(self):
        source = (CONTRACTS / 'golden' / 'positive' / 'minimal.canonical.input.xml').read_bytes()
        root, ledger, validation = self.compile(source, dialect='xml-to-cii-diagnostic-sidecar')
        self.assertIsNotNone(root)
        self.assertEqual('BLOCKED', validation['status'])
        self.assertTrue(any(row['disposition'] == 'DEFER_EXPLICITLY' for row in ledger['records']))

    def test_adapter_registry_covers_every_dialect(self):
        import json
        dialects = {row['dialectId'] for row in json.loads((CONTRACTS / 'inputxml-dialect-registry.json').read_text())['dialects']}
        adapters = json.loads((CONTRACTS / 'compiler' / 'inputxml-compiler-adapters.json').read_text())['adapters']
        adapter_ids = {row['dialectId'] for row in adapters}
        self.assertEqual(dialects, adapter_ids)
        implemented = {row['dialectId'] for row in adapters if row['status'] in {'IMPLEMENTED','IMPLEMENTED_BLOCKING'}}
        self.assertEqual(compiler.SUPPORTED_COMPILER_DIALECTS, implemented)
        self.assertFalse(any(row['resultPolicy'] in {'DROP','SKIP'} for row in adapters))

if __name__ == '__main__': unittest.main()
