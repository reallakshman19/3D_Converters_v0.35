const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

function fixtureResult() {
  const group = {
    id: 'DTXR-G1',
    branch: { original: '/ASIM-1885-PL-4"-CS-M8810041-01' },
    anchor: { x: 563136.11, y: -1125469.2, z: 99707.6 },
    entries: [
      {
        jsonNodeNo: '146',
        branchName: '/ASIM-1885-PL-4"-CS-M8810041-01',
        bore: '100',
        point: { x: 563136.11, y: -1125469.2, z: 99707.6 },
        type: 'GUIDE',
        labeled: 'GUIDE PDO-TYPE-604A/B(NAME==1006649755/5218)',
        description: 'GUIDE PDO-TYPE-604A/B',
        name: '=1006649755/5218',
        cmpSupGap: '',
        componentRef: '=1006649755/5218',
        path: '$[0].children[1].children[0]',
      },
      {
        jsonNodeNo: '146',
        branchName: '/ASIM-1885-PL-4"-CS-M8810041-01',
        bore: '100',
        point: { x: 563139.11, y: -1125469.2, z: 99707.6 },
        type: 'REST',
        labeled: 'REST(NAME=/PS02214.1)',
        description: 'REST',
        name: '/PS02214.1',
        cmpSupGap: '0',
        componentRef: '',
        path: '$[0].children[1].children[1]',
      },
    ],
  };
  const record = {
    xmlIndex: 2,
    xmlNodeNumber: '1030',
    xmlNodeName: 'PS02214.1',
    componentType: 'ANCI',
    xmlBranch: '/ASIM-1885-PL-4"-CS-M8810041-01/B3',
    xmlPosition: '563136.11 -1125469.20 99707.60',
    matchedPosition: group.anchor,
    positionDistanceMm: 0,
    coordinateToleranceMm: 6,
    dtxrPosNodeNumbers: ['146'],
    dtxrPsNodeNumbers: ['146'],
    dtxrPosValue: 'GUIDE PDO-TYPE-604A/B(NAME==1006649755/5218) | REST(NAME=/PS02214.1)',
    dtxrPsName: 'PS02214.1',
    dtxrPsValue: 'REST',
    effectiveSource: 'DTXR_POS',
    derivedSupportTypes: ['GUIDE', 'REST'],
    matchType: 'POS_PS',
    status: 'RESOLVED_POS_PS',
    sourcePaths: group.entries.map((entry) => entry.path),
  };
  const fact = {
    xmlIndex: 2,
    nodeKeys: ['1030'],
    psKey: 'PS02214.1',
    posKey: 'E=563136.11 N=-1125469.2 EL=99707.6',
    hitCount: 2,
    sourcePaths: record.sourcePaths,
    ledgerRecord: record,
  };
  return {
    resolutionLedger: [record],
    traceResolutionLedger: { records: [record], groups: [group] },
    positionIndex: { groups: [group] },
    matchedFacts: [fact],
  };
}

(async () => {
  const api = await import(pathToFileURL(path.join(root, 'tabs/xml-cii-2019-standalone/xml-cii-trace-export.js')).href);
  const result = fixtureResult();

  const nodeRows = api.buildXmlNodeWiseTraceRows(result);
  assert.strictEqual(nodeRows.length, 1, 'one ledger record must produce one XML-node row');
  assert.strictEqual(nodeRows[0].xmlNode, '1030');
  assert.strictEqual(nodeRows[0].jsonNodeNoDtxrPs, '146');
  assert.strictEqual(nodeRows[0].jsonNodeNoDtxrPos, '146');
  assert.strictEqual(nodeRows[0].matchType, 'POS/PS');
  assert.strictEqual(nodeRows[0].distanceMm, '0.000');
  assert.strictEqual(nodeRows[0].toleranceMm, '6.000');
  assert.strictEqual(nodeRows[0].effectiveSource, 'DTXR_POS');
  assert.strictEqual(nodeRows[0].derivedRestraints, 'GUIDE | REST');
  assert.strictEqual(nodeRows[0].status, 'RESOLVED_POS_PS');

  const evidenceRows = api.buildEvidenceTreeRows(result);
  assert.strictEqual(evidenceRows.length, 2, 'each unique staged evidence member must export once');
  assert.strictEqual(evidenceRows[0].sourceNodeNo, '146');
  assert.strictEqual(evidenceRows[1].name, '/PS02214.1');

  const nodeCsv = api.buildXmlNodeWiseTraceCsv(result);
  assert(nodeCsv.startsWith('\uFEFFXML Node,XML Branch,Type,JsonNodeNo(DTXR_PS),JsonNodeNo(DTXR_POS)'), 'node CSV must be UTF-8 BOM encoded with deterministic headers');
  assert(nodeCsv.includes('"/ASIM-1885-PL-4""-CS-M8810041-01/B3"'), 'CSV must escape embedded quotes');
  assert(nodeCsv.includes('GUIDE PDO-TYPE-604A/B'));
  assert(nodeCsv.endsWith('\r\n'), 'CSV must use a final CRLF');

  const evidenceCsv = api.buildEvidenceTreeCsv(result);
  assert(evidenceCsv.includes('Branch,Bore,Source Node No,Position,Object Type,DTXR_POS,NAME,CMPSUPGAP,ComponentRefNo,Source Path'));
  assert.strictEqual(evidenceCsv.split('\r\n').filter(Boolean).length, 3, 'evidence CSV must contain one header plus two source rows');

  const matchedRows = api.buildMatchedFactsRows(result);
  assert.strictEqual(matchedRows.length, 1);
  assert.strictEqual(matchedRows[0].nodeKey, '1030');
  assert(matchedRows[0].path.includes('children[1].children[0]'));

  const tsv = api.buildMatchedFactsTsv(result);
  assert(tsv.startsWith('Path\tNode\tPS\tPOS\tHits\n'));
  assert(tsv.includes('\t1030\tPS02214.1\t'));
  assert(tsv.endsWith('\n'));

  console.log('XML CII standalone trace export checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
