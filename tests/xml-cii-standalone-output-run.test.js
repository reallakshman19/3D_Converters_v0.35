const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { createStaticEsmFixture } = require('./xml-cii-standalone-esm-fixture-helper');

const root = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }

function prepareEsmFixture() {
  return createStaticEsmFixture(root, {
    prefix: 'xml-cii-output-run-test-',
    entryFiles: [
      'tabs/xml-cii-2019-standalone/xml-cii-output-run-readiness.js',
      'tabs/xml-cii-2019-standalone/xml-cii-workflow-types.js',
      'tabs/xml-cii-2019-standalone/xml-cii-workflow-ui-adapter.js',
      'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-output-run.js',
      'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-state.js',
    ],
  }).tempRoot;
}

class TestElement {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.dataset = {}; this.className = ''; this.attributes = {};
    this.value = ''; this.checked = false; this.disabled = false; this.style = {}; this._text = ''; this.listeners = {};
  }
  appendChild(child) { this.children.push(child); return child; }
  append(...items) { for (const item of items) this.children.push(item); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  removeEventListener(type) { delete this.listeners[type]; }
  get textContent() { return `${this._text}${this.children.map((child) => typeof child === 'string' ? child : child.textContent || '').join('')}`; }
  set textContent(value) { this._text = String(value ?? ''); }
  set innerHTML(value) { this._text = String(value ?? ''); this.children = []; }
  get innerHTML() { return this._text; }
}

globalThis.document = { createElement: (tag) => new TestElement(tag) };
globalThis.DOMParser = undefined;

function readyXmlState() {
  return {
    sourceKind: 'xml', sourceText: '<PipeStressExport></PipeStressExport>', options: { outputMode: 'both' }, supportConfigJson: '{}',
    masterContext: { rowCounts: { lineList: 1, pipingClass: 2, materialMap: 3, weight: 4 }, config: {} },
    regexTesterResult: { summary: { matchedCount: 4, rejectedCount: 1 } },
    resolverJsonTraceResult: { summary: { matchedFacts: 3, rejectedFacts: 1 } },
    manualElementSideloadResult: { summary: { matchedRows: 2, rejectedRows: 1 } },
    previewDiagnosticsAuditReport: { summary: { matchedFacts: 5, rejectedFacts: 2 } },
    weightMatchResult: { issueRows: [{ id: 'w1' }], finalizedRows: [{ id: 'f1' }] },
    supportTypeMapperResult: { previewRows: [{ id: 's1' }], diagnostics: [] }, supportTypeMapperStatus: 'Support Type Mapper saved into standalone config.',
    result: { ok: true, enrichedText: '<x/>', enrichedName: 'out.xml', ciiText: 'CII', ciiName: 'out.cii', diagnostics: { elementCount: 1 }, logs: ['run complete'] },
  };
}

(async () => {
  const tempRoot = prepareEsmFixture();
  const helper = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-output-run-readiness.js')).href);
  const types = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-workflow-types.js')).href);
  const adapter = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-workflow-ui-adapter.js')).href);
  const ui = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-output-run.js')).href);
  const stateApi = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-state.js')).href);

  const xmlReport = helper.buildStandaloneOutputRunReadiness(readyXmlState());
  assert.strictEqual(xmlReport.summary.sourceMode, 'xml');
  assert.strictEqual(xmlReport.summary.blockingCount, 0);
  assert(xmlReport.checklistRows.some((row) => row.id === 'regex'));
  assert(xmlReport.checklistRows.some((row) => row.id === 'resolver-json'));
  assert(!xmlReport.checklistRows.some((row) => row.id === 'inputxml-side-load'));
  for (const kind of ['enriched', 'cii', 'diagnostics', 'manifest']) assert(xmlReport.artifactRows.find((row) => row.kind === kind).available);
  assert.strictEqual(xmlReport.manifest.masterRowCounts.weight, 4);
  assert.strictEqual(xmlReport.manifest.supportMapper.previewRows, 1);
  assert(xmlReport.logRows.some((row) => row.message === 'run complete'));

  const inputReport = helper.buildStandaloneOutputRunReadiness({ ...readyXmlState(), sourceKind: 'inputxml', sourceText: '<CAESARII XML_TYPE="Input"><PIPINGMODEL/></CAESARII>', elementSideLoadText: 'DTXR_POS=Pipe Rest', regexTesterResult: null, resolverJsonTraceResult: null });
  assert.strictEqual(inputReport.summary.sourceMode, 'inputxml');
  assert(inputReport.checklistRows.some((row) => row.id === 'inputxml-side-load'));
  assert(!inputReport.checklistRows.some((row) => row.id === 'regex'));

  const noIds = types.normalizeWorkflowJob({ sourceKind: 'xml', sourceText: '<PipeStressExport/>', supportConfigJson: '{}', options: { outputMode: 'both', analyzeTopology: true, generateTopoFix: true } });
  assert.strictEqual(noIds.ok, false, 'TopoFix generation without reviewed IDs must fail');
  assert(noIds.error.includes('reviewed topology action IDs'));

  const topologyOptions = {
    outputMode: 'both', analyzeTopology: true, generateTopoFix: true, useTopoFixForCii: true,
    topologyActionIds: ['ACT-000002', 'ACT-000001'],
  };
  const valid = types.normalizeWorkflowJob({ sourceKind: 'xml', sourceText: '<PipeStressExport/>', supportConfigJson: '{}', options: topologyOptions });
  assert.strictEqual(valid.ok, true);
  assert.deepStrictEqual(valid.job.options.topologyActionIds, topologyOptions.topologyActionIds);
  assert.strictEqual(types.normalizeWorkflowJob({ sourceKind: 'inputxml', sourceText: '<CAESARII/>', supportConfigJson: '{}', options: { analyzeTopology: true } }).ok, false);
  assert.strictEqual(types.normalizeWorkflowJob({ sourceKind: 'xml', sourceText: '<PipeStressExport/>', supportConfigJson: '{}', options: { ...topologyOptions, outputMode: 'enriched-only' } }).ok, false);
  assert.deepStrictEqual(adapter.workflowOptionsFromState({ options: topologyOptions }).topologyActionIds, topologyOptions.topologyActionIds);

  const topologyBlocked = helper.buildStandaloneOutputRunReadiness({ ...readyXmlState(), options: { outputMode: 'both', analyzeTopology: true, generateTopoFix: true, topologyActionIds: [] } });
  assert(topologyBlocked.checklistRows.find((row) => row.id === 'topofix-action-ids')?.blocking);
  const topologyReady = helper.buildStandaloneOutputRunReadiness({ ...readyXmlState(), options: topologyOptions });
  assert.strictEqual(topologyReady.checklistRows.filter((row) => row.id.startsWith('topo') && row.blocking).length, 0);
  assert.strictEqual(topologyReady.manifest.topology.useTopoFixForCii, true);

  const state = stateApi.applyStandaloneOutputRunReadiness(stateApi.createXmlCiiAdaptedWorkflowState(), xmlReport);
  assert(state.outputRunReadinessStatus.includes('0 blocking'));

  const card = new TestElement('section');
  ui.renderStandaloneOutputRunPanel(card, {
    ...readyXmlState(), options: topologyOptions,
    result: {
      ...readyXmlState().result,
      topologyFindingsText: '{"schema":"psi116-topology-findings/v1"}', topologyFindingsName: 'case.topology-findings.json',
      topologyFixPlanText: '{"schema":"psi116-topology-fix-plan/v1"}', topologyFixPlanName: 'case.topology-fix-plan.json',
      topoFixXmlText: '<PipeStressExport/>', topoFixXmlName: 'case.topofix.xml',
      topoFixTransactionText: '{"committed":true}', topoFixTransactionName: 'case.topofix-transaction.json',
      topoFixValidationText: '{"committed":true}', topoFixValidationName: 'case.topofix-validation.json',
      topoFixCommitted: true, ciiInputSource: 'topofix',
    },
  });
  for (const label of ['Pre-run Checklist', 'Run Conversion', 'Output Artifacts / Downloads', 'Logs', 'Run Manifest', 'Raw JSON advanced/debug', 'PSI116 Topology Sidecar', 'Analyze PSI116 topology', 'Generate reviewed TopoFix XML', 'Use committed TopoFix XML for CII', 'Reviewed TopoFix action IDs', 'Topology Sidecars / Downloads', 'Download Topology Findings JSON', 'Download Committed TopoFix XML']) {
    assert(card.textContent.includes(label), `Output / Run panel missing ${label}`);
  }

  const coreSource = read('tabs/xml-cii-2019-standalone/xml-cii-output-run-readiness.js');
  for (const token of ['document', 'querySelector', 'createElement', 'window']) assert(!coreSource.includes(token), `output readiness helper must remain DOM-free: ${token}`);
  const engineSource = read('converters/xml-cii-2019-standalone/engine.js');
  const topologySource = read('converters/xml-cii-2019-standalone/topology-integration.js');
  assert(engineSource.includes('runPsi116TopologyStage'));
  assert(engineSource.includes('topology.ciiInputPath'));
  for (const token of ['TransactionPolicy', 'selected_action_ids', 'transaction.committed', 'useTopoFixForCii', 'topology-findings.json', 'topofix-validation.json']) assert(topologySource.includes(token), `topology integration missing ${token}`);
  assert(!topologySource.includes('apply_all_safe=True'));
  const runWorkflowSource = read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-run-workflow.js');
  assert(runWorkflowSource.includes('runXmlCii2019Workflow(await buildXmlCiiWorkflowJobFromUiState'));

  console.log('XML CII standalone Output / Run checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
