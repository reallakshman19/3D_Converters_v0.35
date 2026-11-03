const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

function copyFile(tempRoot, relPath) {
  const sourcePath = path.join(root, relPath);
  const targetPath = path.join(tempRoot, relPath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function fixtureFiles() {
  return [
    'tabs/xml-cii-2019-standalone/xml-cii-weight-match.js',
    'tabs/xml-cii-2019-standalone/xml-cii-regex-tester.js',
    'tabs/xml-cii-2019-standalone/xml-cii-resolver-json-trace.js',
    'tabs/xml-cii-2019-standalone/xml-cii-trace-resolution-ledger.js',
    'tabs/xml-cii-2019-standalone/xml-cii-manual-element-sideload.js',
    'tabs/xml-cii-2019-standalone/xml-cii-workflow-source-detect.js',
    'tabs/xml-cii-2019-standalone/xml-cii-standalone-default-config.js',
    'tabs/xml-cii-2019-standalone/xml-cii-table-trace-config.js',
    'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-weight-match.js',
    'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-state.js',
    'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-dom.js',
    'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-phase-registry.js',
    'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun.js',
    'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-provenance.js',
    'converters/xml-cii2019-core/branch-process-resolver.js',
    'converters/xml-cii2019-core/config.js',
    'converters/xml-cii2019-core/dtxr-resolver.js',
    'converters/xml-cii2019-core/dtxr-resolver-core.js',
    'converters/xml-cii2019-core/dtxr-wall-thickness-resolver.js',
    'converters/xml-cii2019-core/flange-weight-fallback.js',
    'converters/xml-cii2019-core/line-density-resolver.js',
    'converters/xml-cii2019-core/linelist-mapping.js',
    'converters/xml-cii2019-core/piping-class-material-code-resolver.js',
    'converters/xml-cii2019-core/piping-class-resolver.js',
    'converters/xml-cii2019-core/regex-line-key.js',
    'converters/xml-cii2019-core/restraint-type-mutation.js',
    'converters/xml-cii2019-core/restraint-type-codes.js',
    'converters/xml-cii2019-core/service-process-fallback.js',
    'converters/xml-cii2019-core/support-mapping-config.js',
    'converters/xml-cii2019-core/weight-match-model.js',
    'converters/xml-cii2019-core/weight-valve-hints.js',
    'converters/xml-cii2019-core/default-weight-master-rows.js',
    'converters/xml-cii2019-core/default-piping-class-material-code-rows.js',
    'support/SupportKindResolver.js',
    'vendor/create-pipe-data-db.js',
  ];
}

function prepareEsmFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-cii-weight-match-test-'));
  fs.writeFileSync(path.join(tempRoot, 'package.json'), '{"type":"module"}', 'utf8');
  for (const relPath of fixtureFiles()) copyFile(tempRoot, relPath);
  return tempRoot;
}

const { installMiniDom, MiniElement: TestElement } = require('./helpers/mini-dom.js');
installMiniDom();

function masterContext() {
  return {
    weightMasterRows: [
      { id: 'candidate-good', componentType: 'VALVE', bore: '10', rating: '900', length: '250', weight: '125' },
      { id: 'candidate-other', componentType: 'FLANGE', bore: '8', rating: '150', length: '100', weight: '45' },
    ],
  };
}

function componentRows() {
  return [
    { id: 'issue-valve', componentType: 'VALVE', bore: '10', rating: '900', length: '250', weight: '0' },
    { id: 'ok-valve', componentType: 'VALVE', bore: '10', rating: '900', length: '250', weight: '125' },
    { id: 'missing-flange', componentType: 'FLANGE', bore: '8', rating: '150', length: '100' },
  ];
}

(async () => {
  const tempRoot = prepareEsmFixture();
  const helper = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-weight-match.js')).href);
  const ui = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-weight-match.js')).href);
  const stateApi = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-state.js')).href);

  const result = helper.runStandaloneWeightMatch({ sourceKind: 'xml', masterContext: masterContext(), componentRows: componentRows(), supportConfigJson: '{}' });
  assert.strictEqual(result.summary.sourceMode, 'xml', 'XML source mode expected');
  assert.strictEqual(result.issueRows.length, 2, 'zero and missing weight issues expected');
  assert(result.candidateRows.some((row) => row.issueId === 'issue-valve' && row.candidateId === 'candidate-good'), 'candidate match expected');
  const scored = result.candidateRows.find((row) => row.issueId === 'issue-valve' && row.candidateId === 'candidate-good');
  assert.strictEqual(scored.boreScore, 25, 'bore score expected');
  assert.strictEqual(scored.ratingScore, 25, 'rating score expected');
  assert.strictEqual(scored.lengthScore, 25, 'length score expected');
  assert.strictEqual(scored.componentTypeScore, 25, 'component/type score expected');
  assert.strictEqual(scored.candidateWeight, 125, 'candidate weight expected');
  assert.strictEqual(result.finalizedRows.find((row) => row.issueId === 'issue-valve').finalizedWeight, 125, 'best candidate should finalize by default');
  assert(result.diagnostics.some((row) => row.type === 'zero-missing-weight-issues'), 'weight diagnostics expected');
  assert(result.supportConfigJson.includes('finalizedMatches'), 'support config must serialize finalized weight config');

  const override = helper.runStandaloneWeightMatch({ sourceKind: 'inputxml', masterContext: masterContext(), componentRows: componentRows(), weightMatchOverridesJson: JSON.stringify({ 'issue-valve': 'candidate-other' }), supportConfigJson: '{}' });
  assert.strictEqual(override.summary.sourceMode, 'inputxml', 'InputXML source mode expected');
  assert.strictEqual(override.finalizedRows.find((row) => row.issueId === 'issue-valve').selectedCandidateId, 'candidate-other', 'operator override must select requested candidate');
  assert(override.finalizedRows.find((row) => row.issueId === 'issue-valve').overrideApplied, 'override flag expected');

  const withResult = stateApi.applyStandaloneWeightMatchResult(stateApi.createXmlCiiAdaptedWorkflowState(), result, true);
  assert(withResult.supportConfigJson.includes('finalizedMatches'), 'state finalize must write support config');
  assert(withResult.weightMatchStatus.includes('finalized'), 'finalize status expected');

  const card = new TestElement('section');
  ui.renderAdaptedWeightMatchPanel(card, { ...withResult, weightMatchOverridesJson: '{}' });
  for (const label of ['Weight Match', 'Build Weight Data', 'Use all', 'preferred', 'Ready to build']) {
    assert(card.textContent.includes(label), `Weight Match panel missing ${label}`);
  }
  assert(card.querySelector('#mc-wm-content'), 'weight match panel must expose a content host');
  assert(card.querySelector('#mc-wm-refresh'), 'build action expected');
  assert(card.querySelector('#mc-wm-fill-best'), 'use-preferred action expected');

  const registry = fs.readFileSync(path.join(root, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-phase-registry.js'), 'utf8');
  assert(registry.includes(`id: 'weight-match'`), 'phase registry must expose the weight-match phase');
  const apiSource = fs.readFileSync(path.join(root, 'tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js'), 'utf8');
  assert(apiSource.includes('export async function runXmlCii2019Workflow'), 'public workflow API boundary must remain exported');
  const uiSource = fs.readFileSync(path.join(root, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-weight-match.js'), 'utf8');
  assert(!uiSource.includes('model-converters'), 'weight match UI must not use old Model Converters route tokens');

  console.log('XML CII standalone Weight Match checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
