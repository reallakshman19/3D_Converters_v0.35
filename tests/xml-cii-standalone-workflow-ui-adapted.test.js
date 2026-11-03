const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function gitBlobSha(text) { const buf = Buffer.from(text, 'utf8'); return crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex'); }
function walk(dir) { const abs = path.join(root, dir); if (!fs.existsSync(abs)) return []; const out = []; for (const entry of fs.readdirSync(abs, { withFileTypes: true })) { const rel = path.join(dir, entry.name).replace(/\\/g, '/'); if (entry.isDirectory()) out.push(...walk(rel)); else out.push(rel); } return out; }

const runtime = read('core/app-standalone-runtime.js');
assert(runtime.includes("id: 'xml-cii-2019-standalone'"), 'app-level standalone XML CII tab must exist');
assert(runtime.includes("id: 'model-converters'"), 'existing model-converters tab must remain registered');

const tab = read('tabs/xml-cii-2019-standalone-tab.js');
assert(tab.includes('renderXmlCiiAdaptedWorkflowShell'), 'standalone tab must use adapted workflow shell');
assert(tab.includes('XML_CII_STANDALONE_UI_SMOKE_LABELS'), 'standalone tab must expose smoke label contract');

const registry = read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-phase-registry.js');
assert(registry.includes('Reference contract: tabs/model-converters/WorkflowShell.js / XML_CII_WORKFLOW_PHASES'), 'adapted registry must state canonical reference');
assert(registry.includes('XML_CII_WORKFLOW_PHASES'), 'adapted registry must expose XML_CII_WORKFLOW_PHASES');
// Phase ids are the stable contract other modules (phase-panels.js, state) switch on; display
// labels are free to reword, so assert on ids rather than pinning exact copy.
for (const id of ['source', 'regex', 'json-trace', 'preview', 'diagnostics', 'matched-audit', 'weight-match', 'support-mapper', 'config', 'run']) {
  assert(registry.includes(`id: '${id}'`), `missing phase id ${id}`);
}

const runWorkflow = read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-run-workflow.js');
assert(runWorkflow.includes('runXmlCii2019Workflow('), 'adapted UI must call runXmlCii2019Workflow');
assert(runWorkflow.includes('buildXmlCiiWorkflowJobFromUiState'), 'adapted UI must build API job from UI state');

const controls = read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-controls.js');
for (const token of ['InputXML / Element Side-load', 'source-kind', 'InputXML file/text', 'elementSideLoadText', 'inputXmlOutputMode', 'pointPropertiesBasis', 'inputXmlRestraintPolicy', 'fillSentinelFromLineContext', 'normalizePressureCaseNames']) assert(controls.includes(token), `missing UI token ${token}`);

const forbidden = ['#model-converters-run', 'xmlCiiWorkflowRequestFinalRun', '__xmlCiiWorkflow' + 'RunHandoff_v1', '__xmlCiiConversionWorkflow' + 'AllowDirectRun'];
for (const file of ['tabs/xml-cii-2019-standalone-tab.js', ...walk('tabs/xml-cii-2019-standalone/ui-adapted')]) {
  const text = read(file);
  for (const token of forbidden) assert(!text.includes(token), `${file} references forbidden legacy handoff token ${token}`);
}

const expectedLegacyBlobShas = {
  // Updated 2026-07-18 (2): added a dedicated "Restraint" tab to the
  // InputXML->CII(2019) config popup - the restraint TYPE mutation card and
  // the per-file type overrides moved out of "Support Mapping" into it, plus
  // a new default-restraint-stiffness setting with a never-zero (auto-revert
  // to the CAESAR rigid default) guard. This test still freezes the file
  // against accidental edits by this standalone PR.
  'tabs/model-converters/legacy-adapter.js': '92530b9b4b696e58f9707bda221a167b06091fa4',
  'tabs/model-converters/WorkflowShell.js': '282c3bbcb8374ac9b759652bb1d36f31e3d270f9',
  'tabs/model-converters/xml-cii-workflow-runner.js': '407b990f9442ffe83abdec60f30ffe1c2e032f9b',
  'tabs/model-converters/xml-cii-finalise-run-button.js': '9075e3d0f8962b326d3c0a710213075f9ad300bc',
  'tabs/model-converters/xml-cii-simple-workflow-controller.js': '8690d2d7adf494fc702a1f156c81f5da2b8585bc',
};
for (const [file, expectedSha] of Object.entries(expectedLegacyBlobShas)) assert.strictEqual(gitBlobSha(read(file)), expectedSha, `${file} must remain unchanged`);

console.log('XML CII standalone adapted workflow UI checks passed.');
