const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
const BASE_BRANCH = '/ASIM-1885-PL-4"-CS-M8810041-01';
const XML_BRANCH = `${BASE_BRANCH}/B3`;

const SOURCE_XML = `<CAESARII><Branch><Branchname>${XML_BRANCH}</Branchname><Node><NodeNumber>1020</NodeNumber><NodeName>PS02213.1</NodeName><ComponentType>ANCI</ComponentType><Position>555136.11 -1125469.20 99707.60</Position></Node><Node><NodeNumber>1030</NodeNumber><NodeName>PS02214.1</NodeName><ComponentType>ANCI</ComponentType><Position>563136.11 -1125469.20 99707.60</Position></Node></Branch></CAESARII>`;

const STAGED_JSON = JSON.stringify([{ type: 'BRANCH', name: BASE_BRANCH, children: [
  { type: 'DTXR_POS', attributes: { NODE: '145', POSI: '555136.11 -1125469.20 99707.60' }, children: [
    { type: 'REST', name: 'REST', attributes: { NODE: '145', NAME: '/PS02213.1' } },
  ] },
  { type: 'DTXR_POS', attributes: { NODE: '146', POSI: '563136.11 -1125469.20 99707.60' }, children: [
    { type: 'GUIDE', name: 'GUIDE PDO-TYPE-604A/B', attributes: { NODE: '146', NAME: '=1006649755/5218' } },
    { type: 'REST', name: 'REST', attributes: { NODE: '146', NAME: '/PS02214.1', POSI: '563139.11 -1125469.20 99707.60' } },
  ] },
] }]);

(async () => {
  const ledgerApi = await import(pathToFileURL(path.join(root, 'tabs/xml-cii-2019-standalone/xml-cii-trace-resolution-ledger.js')).href);
  const resolverApi = await import(pathToFileURL(path.join(root, 'tabs/xml-cii-2019-standalone/xml-cii-resolver-json-trace.js')).href);
  const config = { resolverJsonTrace: { coordinateTolerance: 6 } };
  const direct = ledgerApi.buildStandaloneDtxrResolutionLedger(SOURCE_XML, STAGED_JSON, config);
  const resolver = resolverApi.runStandaloneResolverJsonTrace({
    sourceKind: 'xml',
    sourceText: SOURCE_XML,
    stagedJsonText: STAGED_JSON,
    supportConfigJson: JSON.stringify(config),
  });

  assert.strictEqual(direct.schema, 'xml-cii-trace-resolution-ledger/v1');
  assert.strictEqual(direct.records.length, 2, 'one authoritative record is required per XML node');
  assert.deepStrictEqual(resolver.resolutionLedger, direct.records, 'Resolver UI must consume the authoritative ledger without recomputing matches');

  const node1020 = direct.records.find((row) => row.xmlNodeNumber === '1020');
  assert.strictEqual(node1020.status, 'RESOLVED_POS_PS');
  assert.strictEqual(node1020.effectiveSource, 'DTXR_POS');
  assert.strictEqual(node1020.dtxrPosValue, 'REST(NAME=/PS02213.1)');
  assert.strictEqual(node1020.dtxrPsValue, 'REST');
  assert(node1020.dtxrPosNodeNumbers.includes('145'));
  assert(node1020.dtxrPsNodeNumbers.includes('145'));

  const node1030 = direct.records.find((row) => row.xmlNodeNumber === '1030');
  assert.strictEqual(node1030.status, 'RESOLVED_POS_PS');
  assert.strictEqual(node1030.matchType, 'POS_PS');
  assert.strictEqual(node1030.branchRelationship, 'same-root');
  assert(node1030.positionDistanceMm <= 6);
  assert(node1030.maxInternalDistanceMm <= 6);
  assert(node1030.dtxrPosValue.includes('GUIDE PDO-TYPE-604A/B'));
  assert(node1030.dtxrPosValue.includes('REST(NAME=/PS02214.1)'));
  assert.strictEqual(node1030.dtxrPsValue, 'REST');
  assert(node1030.derivedSupportTypes.includes('GUIDE'));
  assert(node1030.derivedSupportTypes.includes('REST'));
  assert(node1030.dtxrPosNodeNumbers.includes('146'));
  assert(node1030.dtxrPsNodeNumbers.includes('146'));

  assert.strictEqual(resolver.resolvedFacts.length, 2, 'resolved facts must remain one row per XML node');
  assert.strictEqual(resolver.matchedFacts.length, 2);
  console.log('XML CII standalone authoritative trace ledger checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
