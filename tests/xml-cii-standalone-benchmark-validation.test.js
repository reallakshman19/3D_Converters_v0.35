const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { createStaticEsmFixture } = require('./xml-cii-standalone-esm-fixture-helper');

const root = path.resolve(__dirname, '..');
const fixtureRoot = path.join(root, 'tests/fixtures/xml-cii-standalone');

function readFixture(name) {
  return fs.readFileSync(path.join(fixtureRoot, name), 'utf8');
}

function normalizeXmlish(value) {
  return String(value || '')
    .replace(/^\s*<\?xml[^>]*>\s*/i, '')
    .replace(/\r\n|\r/g, '\n')
    .replace(/>\s+</g, '><')
    .replace(/\s+\/>/g, '/>')
    .replace(/\s+/g, ' ')
    .trim();
}

function prepareEsmFixture() {
  const fixture = createStaticEsmFixture(root, {
    prefix: 'xml-cii-benchmark-test-',
    entryFiles: [
      'tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js',
      'tabs/xml-cii-2019-standalone/xml-cii-standalone-default-config.js',
    ],
  });
  for (const required of [
    'tabs/xml-cii-2019-standalone/xml-cii-standalone-dtxr-enrichment.js',
    'converters/xml-cii2019-core/restraint-type-mutation.js',
    'converters/xml-cii2019-core/restraint-type-codes.js',
  ]) assert(fixture.files.includes(required), `ESM fixture dependency closure missing ${required}`);
  return fixture.tempRoot;
}

function assertBenchmarkInput(xml) {
  assert(xml.includes('PipeStressExport'), 'benchmark must be PSI116 PipeStressExport XML');
  assert(xml.includes('PSI116-BENCHMARK-VALIDATION'), 'benchmark must identify validation export version');
  assert(xml.includes('/ASIM-1836-6&quot;-S8810010-91261M7-HC/B1'), 'benchmark must preserve escaped 6 inch line id');
  assert.strictEqual((xml.match(/<PipingElement\b/g) || []).length, 3, 'benchmark must contain three PipingElement records');
}

(async () => {
  const tempRoot = prepareEsmFixture();
  const api = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js')).href);
  const defaults = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-standalone-default-config.js')).href);
  const benchmarkXml = readFixture('psi116-benchmark-validation.xml');
  const expectedEnriched = readFixture('psi116-benchmark-validation-expected-enriched.xml');

  assertBenchmarkInput(benchmarkXml);
  assert.strictEqual(api.detectXmlCiiWorkflowSourceKind(benchmarkXml), 'xml', 'benchmark XML must auto-detect as xml');

  const engineCalls = [];
  const result = await api.runXmlCii2019Workflow({
    sourceKind: 'auto',
    sourceName: 'psi116-benchmark-validation.xml',
    sourceText: benchmarkXml,
    supportConfigJson: defaults.defaultXmlCii2019SupportConfigJson(),
    options: { outputMode: 'enriched-only' },
  }, {
    engineRunner: async (job) => {
      engineCalls.push(job);
      assert.strictEqual(job.sourceKind, 'xml', 'benchmark engine receives resolved XML sourceKind');
      assert(job.sourceText.includes('PSI116-BENCHMARK-VALIDATION'), 'engine receives benchmark XML source text');
      return {
        ok: true,
        sourceKind: 'xml',
        outputKind: 'enrichedXML',
        enrichedText: expectedEnriched,
        enrichedName: 'psi116-benchmark-validation-expected-enriched.xml',
        ciiText: null,
        ciiName: null,
        diagnostics: { benchmark: true, elementCount: 3, warnings: [] },
        logs: ['fake benchmark XML enrichment engine'],
        error: null,
      };
    },
  });

  assert.strictEqual(engineCalls.length, 1, 'benchmark XML route must call engineRunner once');
  assert.strictEqual(result.ok, true, 'benchmark XML workflow must succeed');
  assert.strictEqual(result.outputKind, 'enrichedXML', 'benchmark XML must return enrichedXML');
  assert.strictEqual(result.diagnostics.schema, 'xml-cii-2019-workflow-diagnostics/v1');
  assert.strictEqual(result.diagnostics.branch, 'psi116-xml-compatibility-engine');
  assert.strictEqual(result.diagnostics.engineDiagnostics.benchmark, true);
  assert.strictEqual(result.diagnostics.engineDiagnostics.elementCount, 3);
  assert.strictEqual(normalizeXmlish(result.enrichedText), normalizeXmlish(expectedEnriched), 'benchmark enriched XML must match expected fixture');

  console.log('XML CII standalone benchmark validation checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
