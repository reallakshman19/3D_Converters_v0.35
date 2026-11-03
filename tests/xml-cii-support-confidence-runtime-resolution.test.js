const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { createStaticEsmFixture } = require('./xml-cii-standalone-esm-fixture-helper');

const root = path.resolve(__dirname, '..');
const fixture = createStaticEsmFixture(root, {
  prefix: 'xml-cii-support-runtime-confidence-',
  entryFiles: [
    'tabs/xml-cii-2019-standalone/xml-cii-support-type-mapper.js',
    'converters/xml-cii2019-core/support-mapping.js',
  ],
});

(async () => {
  const mapper = await import(pathToFileURL(path.join(fixture.tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-support-type-mapper.js')).href);
  const runtime = await import(pathToFileURL(path.join(fixture.tempRoot, 'converters/xml-cii2019-core/support-mapping.js')).href);

  const evidence = 'LINE STOP ON BARE PIPE WITH WEAR PAD (LENGTH = 804) CS(NAME=/SL-142005.4),SPRE=/MDS/GT575-80-PMP,MDSSUPPTYPE=GT575,CMPSUPGAP=10mm GAP';
  const audit = mapper.runStandaloneSupportTypeMapper({ testInput: evidence, supportConfigJson: '{}' });
  const config = JSON.parse(audit.supportConfigJson);
  const attrs = {
    NAME: '/SL-142005.4',
    DESCRIPTION: 'LINE STOP ON BARE PIPE WITH WEAR PAD (LENGTH = 804)',
    SPRE: '/MDS/GT575-80-PMP',
    MDSSUPPTYPE: 'GT575',
    CMPSUPGAP: '10mm GAP',
  };
  const descriptor = runtime.resolveXmlCiiSupportDescriptor(attrs, config);

  assert.strictEqual(audit.previewRows[0].supportKind, 'LINESTOP');
  assert.strictEqual(audit.previewRows[0].confidence, 'HIGH');
  assert(audit.previewRows[0].suppressedCandidates.some((entry) => entry.startsWith('GUIDE:GT:LOW:')));
  assert.strictEqual(descriptor.primaryKind, 'LINESTOP', 'runtime support mapping must stop at explicit line-stop rule before GT fallback');
  assert.strictEqual(descriptor.source, 'supportMapping');

  const lowOnly = runtime.resolveXmlCiiSupportDescriptor({ NAME: '/SL-LOW', MDSSUPPTYPE: 'GT575' }, config);
  assert.strictEqual(lowOnly.primaryKind, 'GUIDE', 'GT remains a low-specificity fallback when no explicit semantic rule exists');

  console.log('XML/CII high-confidence support mapper runtime resolution checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
