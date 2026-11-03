import assert from 'node:assert/strict';
import test from 'node:test';
import { createEvidenceLedgerController } from '../tabs/universal-enrichment-workbench/evidence-controller.js';
import { createFieldCandidateLedger, serializeFieldCandidateLedger } from '../tabs/universal-enrichment-workbench/evidence-ledger.js';
import { createExtractionEvidenceTrace, serializeExtractionEvidenceTrace } from '../tabs/universal-enrichment-workbench/evidence-trace.js';
import { buildCandidateLedgerCsv } from '../tabs/universal-enrichment-workbench/evidence-csv.js';
import { renderEvidencePanel } from '../tabs/universal-enrichment-workbench/evidence-renderer.js';
import { evidenceFixtures } from './universal-enrichment-workbench-evidence-fixtures.test.js';

class FakeElement {
  constructor(ownerDocument) { this.ownerDocument = ownerDocument; this.listeners = new Map(); this.children = []; this.dataset = {}; this.style = {}; this.value = ''; this.textContent = ''; this.disabled = false; this.hidden = false; }
  addEventListener(type, handler) { const set = this.listeners.get(type) || new Set(); set.add(handler); this.listeners.set(type, set); }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  async dispatch(type, target = this) { for (const handler of this.listeners.get(type) || []) await handler({ target }); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
}
class FakeDocument { createElement() { return new FakeElement(this); } }

function evidenceElements() {
  const documentRef = new FakeDocument();
  const ids = ['evidence-build','evidence-ledger-download','evidence-trace-download','evidence-candidate-csv','evidence-rejected-csv','evidence-status','evidence-ledger-id','evidence-trace-id','evidence-entry-count','evidence-candidate-count','evidence-rejected-count','evidence-entity-count','evidence-field-count','evidence-errors','evidence-warnings','evidence-view','evidence-entity-filter','evidence-field-filter','evidence-search','evidence-ledger-list','evidence-ledger-count','evidence-ledger-prev','evidence-ledger-next','evidence-trace-tree','evidence-trace-count','evidence-trace-more','evidence-entry-details','evidence-trace-details'];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(documentRef)]));
  elements['evidence-view'].value = 'candidates'; return elements;
}

function urlHarness() {
  let id = 0; const blobs = new Map(); const revoked = [];
  return { blobs, revoked, api: { createObjectURL(blob) { const url = `blob:${++id}`; blobs.set(url, blob); return url; }, revokeObjectURL(url) { revoked.push(url); blobs.delete(url); } } };
}

function largeArtifacts(count = 450) {
  const entries = Array.from({ length: count }, (_, index) => ({ entryId: `entry-${index}`, sourceOrder: index, entityId: `entity-${index}`, entitySourceOrder: index, sourcePath: `/R[1]/I[${index + 1}]`, ruleId: 'rule-1', ruleSourceOrder: 0, fieldKey: index % 2 ? 'odd' : 'even', status: 'candidate', candidates: [{ candidateId: `candidate-${index}`, value: `value-${index}`, winningStrategyIndex: 0, attemptCount: 1 }], attemptCount: 1, rejectionReason: '', traceResultId: `node-${index}` }));
  const ledger = { schema: 'FieldCandidateLedger.v1', ledgerId: 'ledger', entries, summary: { entryCount: count, candidateEntryCount: count, rejectedEntryCount: 0, candidateCount: count, entityCount: count, fieldCount: 2 }, validation: { ok: true, errors: [], warnings: [] } };
  const nodes = Array.from({ length: count + 1 }, (_, index) => ({ traceNodeId: `node-${index}`, traceNodeKind: index ? 'result' : 'root', parentTraceNodeId: index ? 'node-0' : null, childTraceNodeIds: index ? [] : Array.from({ length: count }, (__, child) => `node-${child + 1}`), sourceOrder: index, label: `node ${index}`, evidence: {}, ruleId: index ? 'rule-1' : null, entityId: index ? `entity-${index - 1}` : null, resultIndex: index ? index - 1 : null, attemptIndex: null, status: index ? 'matched' : '' }));
  const trace = { schema: 'ExtractionEvidenceTrace.v1', traceId: 'trace', rootTraceNodeIds: ['node-0'], nodes, summary: { nodeCount: nodes.length, ruleNodeCount: 0, resultNodeCount: count, attemptNodeCount: 0, maxDepth: 2 }, validation: { ok: true, errors: [], warnings: [] } };
  return { ledger, trace };
}

test('build is blocked until graph, config and run are valid and mutually consistent', () => {
  const elements = evidenceElements(); const harness = urlHarness(); let upstream = {};
  const controller = createEvidenceLedgerController(elements, { BlobCtor: Blob, urlApi: harness.api, triggerDownload() {} }, () => upstream);
  assert.equal(elements['evidence-build'].disabled, true);
  upstream = evidenceFixtures(); controller.syncUpstream();
  assert.equal(elements['evidence-build'].disabled, false);
  controller.cleanup();
});

test('controller builds only from displayed artifacts without extraction execution', async () => {
  const elements = evidenceElements(); const harness = urlHarness(); const upstream = evidenceFixtures();
  let executorCalls = 0;
  const controller = createEvidenceLedgerController(elements, { BlobCtor: Blob, urlApi: harness.api, triggerDownload() {}, executeExtractionStrategy() { executorCalls += 1; } }, () => upstream);
  controller.syncUpstream(); await elements['evidence-build'].dispatch('click');
  assert.equal(controller.getState().status, 'Valid');
  assert.equal(controller.getState().ledger.entries.length, upstream.run.results.length);
  assert.equal(executorCalls, 0);
  controller.cleanup();
});

test('ledger filters, paging and trace continuation are bounded and projection-only', () => {
  const elements = evidenceElements(); const artifacts = largeArtifacts();
  const state = { ...artifacts, status: 'Valid', view: 'candidates', entityFilter: '', fieldFilter: '', search: '', page: 0, traceLimit: 200, expandedTraceIds: new Set(['node-0']), selectedEntryId: '', selectedTraceNodeId: '' };
  renderEvidencePanel(elements, state);
  assert.equal(elements['evidence-ledger-list'].children.length, 200);
  assert.equal(elements['evidence-trace-tree'].children.length, 200);
  assert.equal(elements['evidence-trace-more'].hidden, false);
  const identity = JSON.stringify(artifacts.ledger);
  state.page = 2; state.fieldFilter = 'odd'; state.traceLimit = 400;
  renderEvidencePanel(elements, state);
  assert.ok(elements['evidence-ledger-list'].children.length <= 200);
  assert.equal(elements['evidence-trace-tree'].children.length, 400);
  assert.equal(elements['evidence-trace-more'].hidden, false);
  state.traceLimit = 600;
  renderEvidencePanel(elements, state);
  assert.equal(elements['evidence-trace-tree'].children.length, 451);
  assert.equal(elements['evidence-trace-more'].hidden, true);
  assert.equal(JSON.stringify(artifacts.ledger), identity);
});

test('entry and trace selection expose exact stored details', async () => {
  const elements = evidenceElements(); const harness = urlHarness(); const upstream = evidenceFixtures();
  const controller = createEvidenceLedgerController(elements, { BlobCtor: Blob, urlApi: harness.api, triggerDownload() {} }, () => upstream);
  controller.syncUpstream(); await elements['evidence-build'].dispatch('click');
  const state = controller.getState();
  await elements['evidence-ledger-list'].dispatch('click', { dataset: { evidenceAction: 'select-entry', entryId: state.ledger.entries[0].entryId } });
  await elements['evidence-trace-tree'].dispatch('click', { dataset: { evidenceAction: 'select-trace', traceNodeId: state.trace.nodes.find((node) => node.traceNodeKind === 'attempt').traceNodeId } });
  assert.ok(elements['evidence-entry-details'].textContent.includes(state.ledger.entries[0].entryId));
  assert.ok(elements['evidence-trace-details'].textContent.includes('strategyIndex'));
  controller.cleanup();
});

test('JSON and CSV downloads match the exact displayed artifacts', async () => {
  const elements = evidenceElements(); const harness = urlHarness(); const downloads = []; const upstream = evidenceFixtures();
  const controller = createEvidenceLedgerController(elements, { BlobCtor: Blob, urlApi: harness.api, triggerDownload(url, name) { downloads.push({ url, name }); } }, () => upstream);
  controller.syncUpstream(); await elements['evidence-build'].dispatch('click');
  await elements['evidence-ledger-download'].dispatch('click');
  await elements['evidence-trace-download'].dispatch('click');
  await elements['evidence-candidate-csv'].dispatch('click');
  const state = controller.getState();
  assert.equal(await harness.blobs.get(downloads[0].url).text(), serializeFieldCandidateLedger(state.ledger));
  assert.equal(await harness.blobs.get(downloads[1].url).text(), serializeExtractionEvidenceTrace(state.trace));
  assert.equal(await harness.blobs.get(downloads[2].url).text(), buildCandidateLedgerCsv(state.ledger));
  controller.cleanup();
  assert.ok(harness.revoked.length >= 3);
});

test('upstream replacement invalidates artifacts and stale builds cannot overwrite newer evidence', async () => {
  const elements = evidenceElements(); const harness = urlHarness(); let upstream = evidenceFixtures(); let resolveTrace;
  const tracePromise = new Promise((resolve) => { resolveTrace = resolve; });
  const controller = createEvidenceLedgerController(elements, { BlobCtor: Blob, urlApi: harness.api, triggerDownload() {}, createExtractionEvidenceTrace: () => tracePromise }, () => upstream);
  controller.syncUpstream(); const pending = elements['evidence-build'].dispatch('click');
  const old = upstream; upstream = evidenceFixtures(); upstream.run.runId = 'extract-run-new'; controller.syncUpstream();
  resolveTrace(await createExtractionEvidenceTrace(old.graph, old.config, old.run)); await pending;
  assert.equal(controller.getState().ledger, null);
  assert.equal(controller.getState().trace, null);
  controller.cleanup();
});

test('master registry object is untouched by ledger lifecycle', async () => {
  const elements = evidenceElements(); const harness = urlHarness(); const upstream = evidenceFixtures();
  const master = Object.freeze({ registry: Object.freeze({ datasets: Object.freeze([{ datasetId: 'master-1' }]) }) });
  const before = JSON.stringify(master);
  const controller = createEvidenceLedgerController(elements, { BlobCtor: Blob, urlApi: harness.api, triggerDownload() {}, masterState: master }, () => upstream);
  controller.syncUpstream(); await elements['evidence-build'].dispatch('click'); controller.syncUpstream();
  assert.equal(JSON.stringify(master), before); controller.cleanup();
});
