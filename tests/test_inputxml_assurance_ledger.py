import hashlib
import importlib.util
import json
import sys
import unittest
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / 'scripts' / 'inputxml_assurance_ledger.py'
spec = importlib.util.spec_from_file_location('inputxml_assurance_ledger', MODULE_PATH)
assurance = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = assurance
spec.loader.exec_module(assurance)
SCHEMA = json.loads((ROOT / 'contracts' / 'inputxml' / 'v1' / 'assurance' / 'inputxml-cii-assurance-ledger.schema.json').read_text())

CANONICAL = b'''<?xml version="1.0" encoding="UTF-8"?>
<CAESARII xmlns="COADE" VERSION="11.00" XML_TYPE="Input"><PIPINGMODEL xmlns="" JOBNAME="ASSURANCE" NUMELT="1" NUMNOZ="0" NOHGRS="0" NUMBEND="0" NUMRIGID="0" NUMEXPJNT="0" NUMREST="0" NUMFORCMNT="0" NUMUNFLOAD="0" NUMWIND="0" NUMELEOFF="0" NUMALLOW="0" NUMISECT="0" NORTH_X="0" NORTH_Y="1" NORTH_Z="0"><PIPINGELEMENT ID="E1" FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="114.3" WALL_THICK="6.02" LINE="L1"/></PIPINGMODEL></CAESARII>'''

FIELD_COLUMNS = [
    'id','canonicalName','aliases','parentElement','xmlKind','type','units','cardinality','requiredCondition',
    'sentinelPolicy','inheritancePolicy','defaultPolicy','ciiTargetSection','ciiTargetSlot','criticality',
    'producerCoverage','consumerCoverage','projectionStatus','expandsTo','notes'
]
FIELD_CATALOG = {
    'schema':'InputXmlFieldCatalog.v1',
    'recordEncoding':{'columns':FIELD_COLUMNS},
    'records':[
        ['F1','DIAMETER',[],'PIPINGELEMENT','attribute','decimal','mm','1','always','none','none','none','ELEMENTS','REL','BLOCKING',[],[],'PROJECTED',[],''],
        ['F2','WALL_THICK',[],'PIPINGELEMENT','attribute','decimal','mm','1','always','none','none','none','ELEMENTS','REL','BLOCKING',[],[],'PROJECTED',[],''],
        ['F3','LINE',[],'PIPINGELEMENT','attribute','string','none','1','always','none','none','none','ELEMENTS/NODENAME','line','HIGH',[],[],'PROJECTED',[],''],
    ]
}
PROJECTION = {
    'schema':'InputXmlCiiProjectionContract.v1',
    'sectionOrder':['VERSION','CONTROL','ELEMENTS','NODENAME','BEND','RIGID','RESTRANT','SIF&TEES','MISCEL_1','COORDS','UNITS'],
    'projectionGroups':[]
}
VALIDATION = {'schema':'InputXmlCanonicalValidation.v1','dialect':'managed-stage-json','status':'PASS','xsdErrors':[],'semanticErrors':[],'diagnostics':[]}

def base_ledger():
    return {
        'schema':'InputXmlCanonicalizationDecisionLedger.v1',
        'sourceRepository':'r',
        'sourcePath':'source.json',
        'producer':'test',
        'dialect':'managed-stage-json',
        'sourceHashSha256':'1'*64,
        'canonicalHashSha256':hashlib.sha256(CANONICAL).hexdigest(),
        'status':'PASS',
        'summary':{},
        'diagnostics':[],
        'records':[
            {
                'recordId':'IXCDL-000001',
                'sourceRepository':'r','sourcePath':'source.json','producer':'test','dialect':'managed-stage-json',
                'sourceEntityId':'SRC-1','sourceType':'PIPE','sourceFields':{'od':114.3},
                'canonicalComponentIds':[],'canonicalNodeIds':['CN-1','CN-2'],'canonicalElementIds':['EDGE-1'],
                'InputXMLElementIds':['E1'],'CIISection':'ELEMENTS','CIIIndex':None,
                'projectionCardinality':'1_TO_1','disposition':'EMIT_1_TO_1',
                'evidence':['source'],'confidence':{'identity':1.0,'topology':1.0,'geometry':1.0,'dimensions':1.0,'attributes':1.0,'ciiProjection':1.0},
                'diagnostics':[]
            }
        ]
    }

def topology_pair(orphan=False, mismatch=False):
    records = [{
        'recordId':'TL-1','sourceEntityId':'SRC-1','sourceType':'PIPE','status':'OK','primaryDisposition':'EMIT_ROUTE_EDGE',
        'lossClassification':'NONE','canonicalNodeIds':['CN-1','CN-2'],'canonicalEdgeIds':['EDGE-1'],'junctionIds':[],
        'boundaryNodeIds':[],'inputXmlElementIds':['E1'],'inputXmlChildIds':[],'deferredProperties':[]
    }]
    if orphan:
        records.append({'recordId':'TL-2','sourceEntityId':'SRC-2','sourceType':'PIPE','status':'OK','primaryDisposition':'EMIT_ROUTE_EDGE','canonicalNodeIds':[],'canonicalEdgeIds':[],'inputXmlElementIds':[]})
    trace = {'schema':'TopologyTraceLedger.v1','canonicalTopologyHash':'ct-hash','topologyTraceLedgerHash':'tl-hash','records':records}
    parity = {'schema':'TopologyParityReport.v1','ok':not mismatch,'mismatchCount':1 if mismatch else 0,'summary':{},'sourceAnchors':{'canonicalTopologyHash':'ct-hash','topologyTraceLedgerHash':'wrong' if mismatch else 'tl-hash'}}
    return trace, parity

class AssuranceLedgerTests(unittest.TestCase):
    def build(self, ledger=None, validation=None, trace=None, parity=None):
        return assurance.build_assurance_ledger(
            canonical_xml=CANONICAL,
            canonicalization_ledger=ledger or base_ledger(),
            canonical_validation=validation or VALIDATION,
            field_catalog=FIELD_CATALOG,
            projection_contract=PROJECTION,
            topology_trace=trace,
            topology_parity=parity,
        )

    def assert_schema(self, value):
        jsonschema.Draft202012Validator(SCHEMA).validate(value)
        self.assertEqual([], assurance.validate_assurance_ledger(value))

    def test_pass_without_topology(self):
        value = self.build()
        self.assertEqual('PASS', value['status'])
        self.assertEqual('NOT_APPLICABLE', value['gates']['topologyParity'])
        self.assertEqual('READY', value['records'][0]['status'])
        self.assertIsNone(value['records'][0]['projection']['ciiIndex'])
        self.assertEqual('PENDING_WRITER_ADAPTER', value['records'][0]['projection']['indexStatus'])
        self.assert_schema(value)

    def test_pass_with_exact_topology_pair(self):
        trace, parity = topology_pair()
        value = self.build(trace=trace, parity=parity)
        self.assertEqual('PASS', value['status'])
        self.assertEqual('PASS', value['gates']['topologyParity'])
        self.assertEqual('TL-1', value['records'][0]['topology']['traceRecordId'])
        self.assert_schema(value)

    def test_canonical_hash_mismatch_blocks(self):
        ledger = base_ledger(); ledger['canonicalHashSha256'] = '0'*64
        value = self.build(ledger=ledger)
        self.assertEqual('BLOCKED', value['status'])
        self.assertTrue(any(row['code']=='CANONICAL_HASH_MISMATCH' for row in value['diagnostics']))

    def test_missing_inputxml_identity_blocks(self):
        ledger = base_ledger(); ledger['records'][0]['InputXMLElementIds'] = ['MISSING']
        value = self.build(ledger=ledger)
        self.assertEqual('BLOCKED', value['status'])
        self.assertEqual('BLOCKED', value['records'][0]['status'])

    def test_orphan_topology_record_blocks(self):
        trace, parity = topology_pair(orphan=True)
        value = self.build(trace=trace, parity=parity)
        self.assertEqual('BLOCKED', value['status'])
        self.assertTrue(any(row['code']=='ORPHAN_TOPOLOGY_TRACE_RECORD' for row in value['diagnostics']))

    def test_parity_mismatch_blocks(self):
        trace, parity = topology_pair(mismatch=True)
        value = self.build(trace=trace, parity=parity)
        self.assertEqual('BLOCKED', value['status'])
        self.assertEqual('BLOCKED', value['gates']['topologyParity'])

    def test_pre_writer_cii_index_must_remain_null(self):
        ledger = base_ledger(); ledger['records'][0]['CIIIndex'] = 7
        value = self.build(ledger=ledger)
        self.assertEqual('BLOCKED', value['status'])
        self.assertIn('PR-E forbids non-null CIIIndex before writer projection', value['records'][0]['diagnostics'])
        self.assertIsNone(value['records'][0]['projection']['ciiIndex'])

    def test_blocking_disposition_propagates(self):
        ledger = base_ledger(); ledger['records'][0]['disposition'] = 'UNSUPPORTED_BLOCKING'; ledger['status'] = 'BLOCKED'
        value = self.build(ledger=ledger)
        self.assertEqual('BLOCKED', value['status'])
        self.assertEqual('BLOCKED', value['records'][0]['status'])

    def test_output_is_deterministic(self):
        first = self.build()
        second = self.build()
        self.assertEqual(first, second)
        self.assertEqual(first['assuranceHashSha256'], second['assuranceHashSha256'])

if __name__ == '__main__':
    unittest.main()
