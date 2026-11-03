import importlib.util
import json
import sys
import unittest
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / 'contracts' / 'inputxml' / 'v1'


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module

compiler = load_module('inputxml_canonical_compiler_assurance_integration', ROOT / 'scripts' / 'inputxml_canonical_compiler.py')
assurance = load_module('inputxml_assurance_ledger_integration', ROOT / 'scripts' / 'inputxml_assurance_ledger.py')
SCHEMA = json.loads((CONTRACTS / 'assurance' / 'inputxml-cii-assurance-ledger.schema.json').read_text())


class AssuranceIntegrationTests(unittest.TestCase):
    def test_direct_canonical_compiler_output_reaches_assurance_pass(self):
        source_path = CONTRACTS / 'golden' / 'positive' / 'minimal.canonical.input.xml'
        root, canonicalization, validation = compiler.compile_document(
            source_path.read_bytes(),
            source_name=source_path.name,
            source_repository='reallaksh19/3D_Converters',
            source_path=str(source_path.relative_to(ROOT)),
            producer='assurance-integration-test',
            registry_path=CONTRACTS / 'inputxml-dialect-registry.json',
            alias_registry_path=CONTRACTS / 'catalogs' / 'inputxml-alias-registry.json',
            canonical_xsd_path=CONTRACTS / 'inputxml-canonical-v1.xsd',
            categorized_xsd_path=CONTRACTS / 'categorized-inputxml-v3.xsd',
            semantic_rules_path=CONTRACTS / 'inputxml-semantic-rules-v1.sch',
            dialect_override='canonical-inputxml-v1',
            context={},
        )
        self.assertIsNotNone(root)
        self.assertEqual('PASS', validation['status'])
        canonical_bytes = compiler._compiler._xml_bytes(root)
        value = assurance.build_assurance_ledger(
            canonical_xml=canonical_bytes,
            canonicalization_ledger=canonicalization,
            canonical_validation=validation,
            field_catalog=json.loads((CONTRACTS / 'catalogs' / 'inputxml-field-catalog.json').read_text()),
            projection_contract=json.loads((CONTRACTS / 'catalogs' / 'inputxml-cii-projection-contract.json').read_text()),
        )
        self.assertEqual('PASS', value['status'])
        self.assertGreater(value['summary']['readyRecordCount'], 0)
        self.assertEqual(0, value['summary']['blockedRecordCount'])
        jsonschema.Draft202012Validator(SCHEMA).validate(value)


if __name__ == '__main__':
    unittest.main()
