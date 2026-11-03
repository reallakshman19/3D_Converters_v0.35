const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

function prepareEsmFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-cii-table-trace-test-'));
  fs.writeFileSync(path.join(tempRoot, 'package.json'), '{"type":"module"}', 'utf8');
  for (const relPath of [
    'tabs/xml-cii-2019-standalone/xml-cii-table-trace-source.js',
    'tabs/xml-cii-2019-standalone/xml-cii-table-trace-table.js',
    'tabs/xml-cii-2019-standalone/xml-cii-table-trace-config.js',
    'tabs/xml-cii-2019-standalone/xml-cii-table-trace-match.js',
    'tabs/xml-cii-2019-standalone/xml-cii-trace-resolution-ledger.js',
  ]) {
    const target = path.join(tempRoot, relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, relPath), target);
  }
  return tempRoot;
}

function csvCell(value) {
  const source = String(value ?? '');
  return /[",\r\n]/.test(source) ? `"${source.replace(/"/g, '""')}"` : source;
}

(async () => {
  const tempRoot = prepareEsmFixture();
  const mod = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-table-trace-source.js')).href);
  const tableText = [
    'PIPE,Detailing Text,Element Reference,Support Name',
    '/ASIM-1836/B1,Pipe Rest XRT01,=1006649732/121515,PS-14416.2',
  ].join('\n');
  const xmlText = '<PipeStressExport><Branchname>/ASIM-1836/B1</Branchname><Node><NodeNumber>10</NodeNumber><NodeName>PS-14416.2</NodeName><ComponentType>ATTA</ComponentType><ComponentRefNo>=1006649732/121515</ComponentRefNo><Position>1 2 3</Position></Node></PipeStressExport>';
  const rows = mod.parseTraceTableText(tableText);
  const result = mod.buildTraceTableResolverResult({ sourceText: xmlText, rawRows: rows });

  assert.strictEqual(result.fieldMap.componentRefNo, 'Element Reference');
  assert.strictEqual(result.fieldMap.dtxrPos, 'Detailing Text');
  assert.strictEqual(result.resolutionLedger.length, 1, 'table result must contain one ledger record per XML node');
  assert.strictEqual(result.matchedFacts.length, 1);
  assert.strictEqual(result.rejectedFacts.length, 0);
  assert.strictEqual(result.matchedFacts[0].matchedBy[0], 'componentRefNo+nodeName');
  assert.strictEqual(result.matchedFacts[0].dtxrPosValue, 'Pipe Rest XRT01(NAME=PS-14416.2)');
  assert.strictEqual(result.matchedFacts[0].status, 'RESOLVED_KEY_PS');
  assert.strictEqual(result.matchedFacts[0].dtxrPsValue, 'Pipe Rest XRT01');

  const comparison = mod.compareTraceResultsByComponentRef({ matchedFacts: [{ xmlIndex: 1, dtxrPosValue: 'Pipe Rest XRT01(NAME=PS-14416.2)' }] }, result);
  assert.strictEqual(comparison.compared, 1);
  assert.strictEqual(comparison.percent, 100);

  const wrongRefResult = mod.buildTraceTableResolverResult({
    sourceText: '<PipeStressExport><Node><NodeNumber>11</NodeNumber><NodeName>PS-14416.2</NodeName><ComponentType>ATTA</ComponentType><ComponentRefNo>=1006649732/999999</ComponentRefNo><Position>1 2 3</Position></Node></PipeStressExport>',
    rawRows: rows,
  });
  assert.strictEqual(wrongRefResult.matchedFacts.length, 0);
  assert.strictEqual(wrongRefResult.rejectedFacts.length, 1);
  assert.strictEqual(wrongRefResult.rejectedFacts[0].status, 'UNRESOLVED');

  const fcsgText = [
    'TYPE,REF,NAME,POS WRT /*,SPRE,PIPE OF COMPREF,SITE',
    'ANCI,67131562/2123,PS00298.1,E 129177mm N 229049.98mm U 109805mm,/MDS-Ancillaries/ANCI/PIPE-REST-600mm,/FCSG,MCA-CU-PI',
    'ANCI,67131562/2123,PS00999.9,E 129999mm N 229999mm U 109999mm,/MDS-Ancillaries/ANCI/OTHER,/FCSG,MCA-CU-PI',
  ].join('\n');
  const fcsgXml = '<PipeStressExport><Branchname>/FCSG/B1</Branchname><Node><NodeNumber>20</NodeNumber><NodeName>PS00298.1</NodeName><ComponentType>ANCI</ComponentType><ComponentRefNo>67131562/2123</ComponentRefNo><Position>129177 229049.98 109805</Position></Node></PipeStressExport>';
  const fcsgRows = mod.parseTraceTableText(fcsgText);
  const fcsgResult = mod.buildTraceTableResolverResult({
    sourceText: fcsgXml,
    rawRows: fcsgRows,
    traceConfig: { profileId: 'fcsg-component-report', ambiguityPolicy: 'reject-duplicates', coordinateTolerance: 6 },
  });

  assert.strictEqual(fcsgResult.fieldMap.componentRefNo, 'REF');
  assert.strictEqual(fcsgResult.fieldMap.nodeName, 'NAME');
  assert.strictEqual(fcsgResult.fieldMap.position, 'POS WRT /*');
  assert.strictEqual(fcsgResult.fieldMap.componentType, 'TYPE');
  assert.strictEqual(fcsgResult.fieldMap.dtxrPos, 'SPRE');
  assert.strictEqual(fcsgResult.traceConfig.profileId, 'fcsg-component-report');
  assert.strictEqual(fcsgResult.traceConfig.duplicateRefCount, 1);
  assert.strictEqual(fcsgResult.traceConfig.coordinateGroupCount, 2);
  assert.strictEqual(fcsgResult.matchedFacts.length, 1);
  assert.strictEqual(fcsgResult.rejectedFacts.length, 0);
  assert.strictEqual(fcsgResult.matchedFacts[0].matchedBy[0], 'coordinate-group');
  assert.strictEqual(fcsgResult.matchedFacts[0].dtxrPosValue, '/MDS-Ancillaries/ANCI/PIPE-REST-600mm(NAME=PS00298.1)');
  assert.strictEqual(fcsgResult.matchedFacts[0].sourceComponentType, 'ANCI');
  assert.strictEqual(fcsgResult.matchedFacts[0].branchRelationship, 'same-root');

  const baseBranch = '/ASIM-1885-PL-4"-CS-M8810041-01';
  const groupedRows = [
    ['PIPE', 'DTXR_POS', 'NAME', 'Position', 'TYPE', 'REF', 'DTXR_PS'],
    [baseBranch, 'REST', '/PS02213.1', '555136.11 -1125469.20 99707.60', 'ANCI', '1006666139/639', ''],
    [baseBranch, 'GUIDE PDO-TYPE-604A/B', '=1006649755/5218', '563136.11 -1125469.20 99707.60', 'ANCI', '1006649755/5218', ''],
    [baseBranch, 'REST', '/PS02214.1', '563139.11 -1125469.20 99707.60', 'ANCI', '1006666139/642', 'REST'],
    ['/UNRELATED-LINE/B1', 'WRONG BRANCH REST', '/PS02214.1', '563136.11 -1125469.20 99707.60', 'ANCI', '999/1', 'WRONG'],
  ];
  const groupedText = groupedRows.map((row) => row.map(csvCell).join(',')).join('\n');
  const groupedXml = `<PipeStressExport><Branchname>${baseBranch}/B3</Branchname><Node><NodeNumber>1020</NodeNumber><NodeName>PS02213.1</NodeName><ComponentType>ANCI</ComponentType><ComponentRefNo>=1006666139/639</ComponentRefNo><Position>555136.11 -1125469.20 99707.60</Position></Node><Node><NodeNumber>1030</NodeNumber><NodeName>PS02214.1</NodeName><ComponentType>ANCI</ComponentType><ComponentRefNo>=1006666139/642</ComponentRefNo><Position>563136.11 -1125469.20 99707.60</Position></Node></PipeStressExport>`;
  const groupedResult = mod.buildTraceTableResolverResult({
    sourceText: groupedXml,
    rawRows: mod.parseTraceTableText(groupedText),
    traceConfig: { coordinateTolerance: 6, ambiguityPolicy: 'reject-duplicates' },
  });

  assert.strictEqual(groupedResult.resolutionLedger.length, 2, 'two XML nodes must remain two consolidated records');
  assert.strictEqual(groupedResult.matchedFacts.length, 2);
  assert.strictEqual(groupedResult.traceConfig.coordinateGroupCount, 3, 'two related support positions plus unrelated branch form three groups');

  const node1020 = groupedResult.resolutionLedger.find((record) => record.xmlNodeNumber === '1020');
  assert.strictEqual(node1020.status, 'RESOLVED_POS_PS');
  assert.strictEqual(node1020.dtxrPosValue, 'REST(NAME=/PS02213.1)');
  assert.strictEqual(node1020.dtxrPsValue, 'REST');
  assert.deepStrictEqual(node1020.dtxrPosNodeNumbers, ['2']);
  assert.deepStrictEqual(node1020.dtxrPsNodeNumbers, ['2']);

  const node1030 = groupedResult.resolutionLedger.find((record) => record.xmlNodeNumber === '1030');
  assert.strictEqual(node1030.status, 'RESOLVED_POS_PS');
  assert.strictEqual(node1030.matchType, 'POS_PS');
  assert.strictEqual(node1030.branchRelationship, 'same-root');
  assert.strictEqual(node1030.positionDistanceMm, 0);
  assert(node1030.maxInternalDistanceMm <= 6);
  assert(node1030.dtxrPosValue.includes('GUIDE PDO-TYPE-604A/B(NAME==1006649755/5218)'));
  assert(node1030.dtxrPosValue.includes('REST(NAME=/PS02214.1)'));
  assert(!node1030.dtxrPosValue.includes('WRONG BRANCH'));
  assert.strictEqual(node1030.dtxrPsName, 'PS02214.1');
  assert.strictEqual(node1030.dtxrPsValue, 'REST');
  assert.deepStrictEqual(node1030.dtxrPosNodeNumbers, ['3', '4']);
  assert.deepStrictEqual(node1030.dtxrPsNodeNumbers, ['4']);
  assert.deepStrictEqual(node1030.derivedSupportTypes.sort(), ['GUIDE', 'REST']);

  console.log('XML CII table trace source checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
