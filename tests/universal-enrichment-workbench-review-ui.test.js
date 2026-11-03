import assert from 'node:assert/strict';
import test from 'node:test';
import { collectComparisonReviewElements, createComparisonReviewController } from '../tabs/universal-enrichment-workbench/review-controller.js';
import { createComparisonReviewLedger, createComparisonReviewSubjects } from '../tabs/universal-enrichment-workbench/review-ledger.js';
import { renderComparisonReviewPanel, REVIEW_MATCH_STEP, REVIEW_PAGE_SIZE } from '../tabs/universal-enrichment-workbench/review-renderer.js';
import { renderComparisonReviewMarkup } from '../tabs/universal-enrichment-workbench/review-template.js';
import { normalizeComparisonReviewDraft, reviewSubjectKey } from '../tabs/universal-enrichment-workbench/review-draft.js';
import { normalizedUpstream, dependencies as fixtureDependencies } from './universal-enrichment-workbench-review-fixtures.test.js';

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || 'div').toUpperCase(); this.ownerDocument = ownerDocument;
    this.listeners = new Map(); this.children = []; this.dataset = {}; this.value = '';
    this.disabled = false; this.textContent = ''; this.className = ''; this.type = ''; this.id = '';
  }
  addEventListener(type, handler) { const set = this.listeners.get(type) || new Set(); set.add(handler); this.listeners.set(type, set); }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  async dispatch(type, target = this) { for (const handler of [...(this.listeners.get(type) || [])]) await handler({ type, target }); }
  click(target = this) { return this.dispatch('click', target); }
  replaceChildren(...children) { this.children = children; }
}

class FakeDocument {
  createElement(tagName) { return new FakeElement(tagName, this); }
}

class FakeContainer extends FakeElement {
  constructor(ownerDocument) { super('div', ownerDocument); this.elements = new Map(); }
  set innerHTML(markup) {
    this.markup = markup; this.elements.clear();
    for (const match of markup.matchAll(/<([a-z0-9-]+)[^>]*id="([^"]+)"[^>]*>/gi)) {
      const element = new FakeElement(match[1], this.ownerDocument); element.id = match[2];
      const value = match[0].match(/value="([^"]*)"/)?.[1]; if (value != null) element.value = value;
      this.elements.set(element.id, element);
    }
  }
  get innerHTML() { return this.markup || ''; }
  querySelector(selector) { return this.elements.get(selector.replace(/^#/, '')) || null; }
}

function makeElements() {
  const documentRef = new FakeDocument(); const container = new FakeContainer(documentRef);
  container.innerHTML = renderComparisonReviewMarkup(); return collectComparisonReviewElements(container);
}

function urlHarness() {
  let next = 1; const blobs = new Map(); const revoked = []; const downloads = [];
  return {
    blobs, revoked, downloads,
    api: { createObjectURL(blob) { const url = `blob:review-${next++}`; blobs.set(url, blob); return url; },
      revokeObjectURL(url) { revoked.push(url); blobs.delete(url); } },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function rendererState(run, page = 0, matchLimit = REVIEW_MATCH_STEP) {
  const drafts = new Map(createComparisonReviewSubjects(run).map((subject) => {
    const key = reviewSubjectKey(subject); return [key, normalizeComparisonReviewDraft({}, subject)];
  }));
  const selectedSubjectKey = drafts.keys().next().value || '';
  return { drafts, ledger: null, status: 'Ready', authorityValidation: { ok: true, errors: [], warnings: [] },
    view: 'pending', entityFilter: '', fieldFilter: '', datasetFilter: '', statusFilter: '', search: '',
    page, selectedSubjectKey, matchLimit };
}

test('review renderer pages subjects by 200 and keeps later rows reachable', () => {
  const elements = makeElements();
  const run = { results: Array.from({ length: 401 }, (_, sourceOrder) => ({
    comparisonResultId: `r-${sourceOrder}`, sourceOrder, entryId: `e-${sourceOrder}`, candidateId: `c-${sourceOrder}`,
    entityId: `entity-${sourceOrder}`, fieldKey: 'field', bindingId: 'binding', datasetId: 'dataset', columnId: 'column',
    candidateValue: sourceOrder, normalizedCandidate: sourceOrder, status: 'unmatched', matches: [],
  })), unbound: [] };
  renderComparisonReviewPanel(elements, rendererState(run, 0), { run });
  assert.equal(elements['review-subject-list'].children.length, REVIEW_PAGE_SIZE);
  assert.equal(elements['review-visible-count'].textContent, '200 / 401');
  renderComparisonReviewPanel(elements, rendererState(run, 2), { run });
  assert.equal(elements['review-subject-list'].children.length, 1);
  assert.match(elements['review-subject-list'].children[0].textContent, /400/);
});

test('review renderer exposes retained matches in bounded 200-row continuation', () => {
  const elements = makeElements(); const matches = Array.from({ length: 405 }, (_, rowSourceOrder) => ({
    matchId: `match-${rowSourceOrder}`, rowId: `row-${rowSourceOrder}`, rowSourceOrder,
    masterValue: rowSourceOrder, normalizedMasterValue: rowSourceOrder,
  }));
  const run = { results: [{ comparisonResultId: 'result', sourceOrder: 0, entryId: 'entry', candidateId: 'candidate',
    entityId: 'entity', fieldKey: 'field', bindingId: 'binding', datasetId: 'dataset', columnId: 'column',
    candidateValue: 0, normalizedCandidate: 0, status: 'multiple-match', matches }], unbound: [] };
  renderComparisonReviewPanel(elements, rendererState(run, 0, 200), { run });
  assert.equal(elements['review-match-list'].children.length, 200); assert.equal(elements['review-match-count'].textContent, '200 / 405');
  renderComparisonReviewPanel(elements, rendererState(run, 0, 400), { run });
  assert.equal(elements['review-match-list'].children.length, 400); assert.equal(elements['review-match-more'].disabled, false);
});



test('review renderer supports all disposition views and projection-only filters', () => {
  const elements = makeElements();
  const run = { results: [
    { comparisonResultId: 'r1', sourceOrder: 0, entryId: 'e1', candidateId: 'c1', entityId: 'entity-a', fieldKey: 'alpha', bindingId: 'b1', datasetId: 'dataset-a', columnId: 'col', candidateValue: 'A', normalizedCandidate: 'A', status: 'unique-match', matches: [{ matchId: 'm1', rowId: 'row', rowSourceOrder: 0, masterValue: 'A', normalizedMasterValue: 'A' }] },
    { comparisonResultId: 'r2', sourceOrder: 1, entryId: 'e2', candidateId: 'c2', entityId: 'entity-b', fieldKey: 'beta', bindingId: 'b2', datasetId: 'dataset-b', columnId: 'col', candidateValue: 'B', normalizedCandidate: 'B', status: 'unmatched', matches: [] },
    { comparisonResultId: 'r3', sourceOrder: 2, entryId: 'e3', candidateId: 'c3', entityId: 'entity-c', fieldKey: 'gamma', bindingId: 'b3', datasetId: 'dataset-c', columnId: 'col', candidateValue: 'C', normalizedCandidate: 'C', status: 'multiple-match', matches: [] },
  ], unbound: [{ sourceOrder: 0, entryId: 'e4', candidateId: 'c4', entityId: 'entity-d', fieldKey: 'delta', reason: 'No binding.' }] };
  const state = rendererState(run); const subjects = createComparisonReviewSubjects(run);
  state.drafts.set(reviewSubjectKey(subjects[0]), normalizeComparisonReviewDraft({ disposition: 'confirm-match', selectedMatchId: 'm1' }, subjects[0]));
  state.drafts.set(reviewSubjectKey(subjects[1]), normalizeComparisonReviewDraft({ disposition: 'reject-result' }, subjects[1]));
  state.drafts.set(reviewSubjectKey(subjects[2]), normalizeComparisonReviewDraft({ disposition: 'defer' }, subjects[2]));
  for (const [view, expected] of [['pending','delta'],['confirmed','alpha'],['rejected','beta'],['deferred','gamma']]) {
    renderComparisonReviewPanel(elements, { ...state, view }, { run });
    assert.equal(elements['review-subject-list'].children.length, 1);
    assert.match(elements['review-subject-list'].children[0].textContent, new RegExp(expected));
  }
  renderComparisonReviewPanel(elements, { ...state, view: 'confirmed', entityFilter: 'entity-a', datasetFilter: 'dataset-a', statusFilter: 'unique', search: 'alpha' }, { run });
  assert.equal(elements['review-subject-list'].children.length, 1);
  renderComparisonReviewPanel(elements, { ...state, view: 'confirmed', fieldFilter: 'not-present' }, { run });
  assert.equal(elements['review-subject-list'].children.length, 0);
  renderComparisonReviewPanel(elements, { ...state, view: 'diagnostics' }, { run });
  assert.equal(elements['review-subject-list'].children.length, 0);
});

test('controller requires explicit confirmation, invalidates drafts and downloads exact artifacts', async () => {
  let upstream = await normalizedUpstream(); const before = JSON.stringify(upstream); const elements = makeElements(); const urls = urlHarness();
  const deps = { ...fixtureDependencies, BlobCtor: Blob, urlApi: urls.api,
    triggerDownload: (url, name) => urls.downloads.push({ url, name }) };
  const controller = createComparisonReviewController(elements, deps, () => upstream);
  await flush(); await flush();
  const initial = controller.getState(); const firstKey = initial.selectedSubjectKey;
  assert.equal(initial.authorityValidation.ok, true); assert.equal(initial.drafts.get(firstKey).disposition, 'unreviewed');
  assert.equal(elements['review-selected-match'].disabled, true);
  elements['review-disposition'].value = 'confirm-match'; await elements['review-disposition'].dispatch('change');
  assert.equal(elements['review-selected-match'].disabled, false); assert.equal(controller.getState().ledger, null);
  elements['review-selected-match'].value = upstream.run.results[0].matches[0].matchId;
  await elements['review-selected-match'].dispatch('change');
  elements['review-note'].value = 'Explicit review'; await elements['review-note'].dispatch('input');
  assert.equal(elements['review-note-count'].textContent, '15 / 1000');
  await elements['review-build'].click();
  assert.equal(controller.getState().ledger.validation.ok, true);
  assert.equal(controller.getState().ledger.decisions[0].disposition, 'confirm-match');
  assert.equal(controller.getState().ledger.decisions[0].selectedMatch.matchId, upstream.run.results[0].matches[0].matchId);
  await elements['review-json-download'].click(); await elements['review-csv-download'].click();
  assert.deepEqual(urls.downloads.map((item) => item.name), ['comparison-review-ledger.json', 'comparison-review.csv']);
  const json = await urls.blobs.get(urls.downloads[0].url).text();
  assert.deepEqual(JSON.parse(json), controller.getState().ledger);
  const csv = await urls.blobs.get(urls.downloads[1].url).text(); assert.match(csv, /review_decision_id/);
  assert.equal(JSON.stringify(upstream), before);
  upstream = structuredClone(upstream); upstream.registry.datasets = []; await controller.syncUpstream(); await flush();
  assert.equal(controller.getState().ledger, null); assert.equal(urls.revoked.length, 2);
  controller.cleanup(); assert.equal(urls.revoked.length, 2);
});

test('controller rejects stale async builds and reconciles only exact current subjects', async () => {
  let upstream = await normalizedUpstream(); const elements = makeElements(); let resolveBuild;
  const pending = new Promise((resolve) => { resolveBuild = resolve; });
  const deps = { ...fixtureDependencies, BlobCtor: Blob,
    urlApi: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, triggerDownload() {},
    createComparisonReviewLedger: () => pending };
  const controller = createComparisonReviewController(elements, deps, () => upstream);
  await flush(); const buildDispatch = elements['review-build'].click(); await flush();
  const staleLedger = await createComparisonReviewLedger(upstream, controller.getState().drafts, fixtureDependencies);
  upstream = structuredClone(upstream); upstream.run.comparisonRunId = 'replacement-run'; upstream.run.results = upstream.run.results.slice(1);
  await controller.syncUpstream(); await flush(); resolveBuild(staleLedger); await buildDispatch; await flush();
  assert.equal(controller.getState().ledger, null); assert.equal(controller.getState().drafts.has('result:' + staleLedger.decisions[0].comparisonResultId), false);
  controller.cleanup();
});
