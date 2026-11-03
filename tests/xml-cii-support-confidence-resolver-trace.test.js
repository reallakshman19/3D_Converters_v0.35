const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { createStaticEsmFixture } = require('./xml-cii-standalone-esm-fixture-helper');

const root = path.resolve(__dirname, '..');
const fixture = createStaticEsmFixture(root, {
  prefix: 'xml-cii-support-trace-confidence-',
  entryFiles: ['tabs/xml-cii-2019-standalone/xml-cii-support-type-mapper.js'],
});

(async () => {
  const helper = await import(pathToFileURL(path.join(fixture.tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-support-type-mapper.js')).href);
  const trace = 'Pipe Rest XRT01(NAME=/SL-142005.1),SPRE=/MDS/PIPE-REST.3-PMP,MDSSUPPTYPE=PIPE-REST | LINE STOP ON BARE PIPE WITH WEAR PAD (LENGTH = 804) CS(NAME=/SL-142005.4),SPRE=/MDS/GT575-80-PMP,MDSSUPPTYPE=GT575,CMPSUPGAP=10mm GAP';
  const result = helper.runStandaloneSupportTypeMapper({
    supportConfigJson: '{}',
    resolverJsonTraceResult: {
      resolvedFacts: [{
        xmlBranch: '/GLRD/B1',
        xmlNodeNumber: '500',
        effectiveDtxr: trace,
        dtxrPosValue: '',
        dtxrPsValue: '',
        positionMembers: [],
      }],
    },
  });

  assert.strictEqual(result.raw.resolverTraceRows, 1);
  assert.strictEqual(result.previewRows.length, 2, 'resolver trace pipe-delimited evidence must become two physical support occurrences');
  const rest = result.previewRows.find((row) => row.occurrenceName === '/SL-142005.1');
  const lineStop = result.previewRows.find((row) => row.occurrenceName === '/SL-142005.4');
  assert(rest && lineStop);
  assert.strictEqual(rest.supportKind, 'REST');
  assert.strictEqual(rest.confidence, 'HIGH');
  assert.strictEqual(lineStop.supportKind, 'LINESTOP');
  assert.strictEqual(lineStop.confidence, 'HIGH');
  assert(lineStop.source.includes('resolver-json-trace'));
  assert(lineStop.suppressedCandidates.some((entry) => entry.startsWith('GUIDE:GT:LOW:')));
  assert(!result.previewRows.some((row) => row.occurrenceName === '/SL-142005.4' && row.supportKind === 'GUIDE'));
  console.log('XML/CII resolver-trace support confidence checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
