const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertTokens(relativePath, tokens) {
  const source = read(relativePath);
  for (const token of tokens) {
    assert(source.includes(token), `${relativePath} is missing retained XML CII token: ${token}`);
  }
}

test('existing XML CII routes and all standalone phases remain registered', () => {
  assertTokens('core/app-standalone-runtime.js', [
    "id: 'model-converters'",
    "id: 'xml-cii-2019-standalone'",
    "id: 'universal-enrichment-workbench'",
  ]);
  const registry = read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-phase-registry.js');
  for (const id of [
    'source', 'regex', 'json-trace', 'preview', 'diagnostics',
    'weight-match', 'support-mapper', 'config', 'matched-audit', 'run',
  ]) {
    assert(registry.includes(`id: '${id}'`), `XML CII Standalone phase missing: ${id}`);
  }
});

test('masters, regex, JSON trace hierarchy, preview, weight and support UI contracts remain present', () => {
  const contracts = [
    ['tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-import-masters.js', ['STANDALONE_IMPORT_MASTER_DEFS', 'Load / refresh master context']],
    ['tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-regex-tester.js', ['renderStandaloneRegexTesterPanel', 'Run Extraction', 'Save Config']],
    ['tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-resolver-json-trace.js', ['renderStandaloneResolverJsonTracePanel', 'Evidence Trace Tree', 'Matched Facts', 'Rejected Facts']],
    ['tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-diagnostics-audit.js', ['renderStandalonePreviewReportPanel', 'renderStandaloneDiagnosticsReportPanel', 'renderStandaloneMatchedAuditPanel']],
    ['tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-weight-match.js', ['renderAdaptedWeightMatchPanel', 'Build Weight Data', 'Use all']],
    ['tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-support-type-mapper.js', ['renderStandaloneSupportTypeMapperPanel', 'Test support mapper', 'CII Support Kind Preview']],
  ];
  for (const [relativePath, tokens] of contracts) assertTokens(relativePath, tokens);
});

test('standalone final-run API boundary remains wired', () => {
  assertTokens('tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js', [
    'export async function runXmlCii2019Workflow',
  ]);
  assertTokens('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-run-workflow.js', [
    'runXmlCii2019Workflow(',
    'buildXmlCiiWorkflowJobFromUiState',
  ]);
});
