import assert from 'node:assert/strict';
import test from 'node:test';
import { createEnrichmentProposalController } from '../tabs/universal-enrichment-workbench/proposal-controller.js';
import { renderEnrichmentProposalPanel } from '../tabs/universal-enrichment-workbench/proposal-renderer.js';
import { createEnrichmentProposalSet } from '../tabs/universal-enrichment-workbench/proposal-set.js';
import { deps, proposalFixture } from './universal-enrichment-workbench-proposal-fixtures.test.js';

class FakeElement {
  constructor(ownerDocument) { this.ownerDocument = ownerDocument; this.children = []; this.listeners = new Map(); this.dataset = {}; this.value = ''; this.disabled = false; this.textContent = ''; }
  addEventListener(type, handler) { const rows = this.listeners.get(type) || []; rows.push(handler); this.listeners.set(type, rows); }
  removeEventListener(type, handler) { this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== handler)); }
  replaceChildren(...children) { this.children = children; }
  async dispatch(type, target = this) { for (const handler of this.listeners.get(type) || []) await handler({ target }); }
  closest() { return this; }
}
class FakeDocument { createElement() { return new FakeElement(this); } }

const IDS = [
  'proposal-build','proposal-json-download','proposal-csv-download','proposal-group-csv-download','proposal-exclusion-csv-download',
  'proposal-status','proposal-set-id','proposal-count','proposal-excluded-count','proposal-single-count','proposal-equivalent-count',
  'proposal-conflicting-count','proposal-view','proposal-entity-filter','proposal-field-filter','proposal-dataset-filter',
  'proposal-status-filter','proposal-search','proposal-row-list','proposal-prev','proposal-next','proposal-visible-count',
  'proposal-details','proposal-entry-list','proposal-entry-count','proposal-entry-more','proposal-errors','proposal-warnings',
];
function elements() { const document = new FakeDocument(); return Object.fromEntries(IDS.map((id) => [id, new FakeElement(document)])); }
function masterElements() { const document = new FakeDocument(); return Object.fromEntries([
  'master-import','master-import-status','master-remove','master-attach','master-registry-clear',
].map((id) => [id, new FakeElement(document)])); }
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('renders 200 group rows per page and keeps later groups reachable', () => {
  const e = elements(); const groups = Array.from({ length: 401 }, (_, index) => ({ proposalGroupId: `g-${index}`,
    sourceOrder: index, entityId: `entity-${index}`, fieldKey: 'field', status: 'single-proposal',
    proposalIds: [], proposalCount: 1, distinctValueCount: 1 }));
  const state = { proposalSet: { groups, proposals: [], exclusions: [], summary: {} }, status: 'valid',
    authorityValidation: { errors: [], warnings: [] }, view: 'single', entityFilter: '', fieldFilter: '',
    datasetFilter: '', statusFilter: '', search: '', page: 0, selectedEvidenceId: '', proposalLimit: 200 };
  renderEnrichmentProposalPanel(e, state); assert.equal(e['proposal-row-list'].children.length, 200);
  assert.equal(e['proposal-next'].disabled, false);
  renderEnrichmentProposalPanel(e, { ...state, page: 1 }); assert.equal(e['proposal-row-list'].children.length, 200);
  renderEnrichmentProposalPanel(e, { ...state, page: 2 }); assert.equal(e['proposal-row-list'].children.length, 1);
});

test('reveals selected-group proposals in 200-row increments', () => {
  const e = elements(); const proposals = Array.from({ length: 401 }, (_, index) => ({ proposalId: `p-${index}`, datasetId: 'd', proposedValue: index }));
  const group = { proposalGroupId: 'g', sourceOrder: 0, entityId: 'e', fieldKey: 'f', status: 'conflicting-proposals',
    proposalIds: proposals.map((item) => item.proposalId), proposalCount: 401, distinctValueCount: 401 };
  const base = { proposalSet: { groups: [group], proposals, exclusions: [], summary: {} }, status: 'valid',
    authorityValidation: { errors: [], warnings: [] }, view: 'conflicting', entityFilter: '', fieldFilter: '',
    datasetFilter: '', statusFilter: '', search: '', page: 0, selectedEvidenceId: 'g' };
  renderEnrichmentProposalPanel(e, { ...base, proposalLimit: 200 }); assert.equal(e['proposal-entry-list'].children.length, 200);
  renderEnrichmentProposalPanel(e, { ...base, proposalLimit: 400 }); assert.equal(e['proposal-entry-list'].children.length, 400);
  renderEnrichmentProposalPanel(e, { ...base, proposalLimit: 600 }); assert.equal(e['proposal-entry-list'].children.length, 401);
});

test('supports excluded dataset filtering and all other filters without reordering', () => {
  const e = elements(); const proposals = [{ proposalId: 'p', datasetId: 'dataset-a', proposedValue: 'needle' }];
  const group = { proposalGroupId: 'g', sourceOrder: 0, entityId: 'entity-a', fieldKey: 'field-a', status: 'single-proposal', proposalIds: ['p'], proposalCount: 1, distinctValueCount: 1 };
  const exclusion = { exclusionId: 'x', sourceOrder: 0, entityId: 'entity-b', fieldKey: 'field-b', datasetId: 'dataset-b', disposition: 'defer', reason: 'Review decision was deferred.' };
  const base = { proposalSet: { groups: [group], proposals, exclusions: [exclusion], summary: {} }, status: 'valid', authorityValidation: { errors: [], warnings: [] }, page: 0, selectedEvidenceId: '', proposalLimit: 200 };
  renderEnrichmentProposalPanel(e, { ...base, view: 'single', entityFilter: 'entity-a', fieldFilter: 'field-a', datasetFilter: 'dataset-a', statusFilter: 'single', search: 'needle' });
  assert.equal(e['proposal-row-list'].children.length, 1);
  renderEnrichmentProposalPanel(e, { ...base, view: 'excluded', entityFilter: 'entity-b', fieldFilter: '', datasetFilter: 'dataset-b', statusFilter: 'defer', search: 'deferred' });
  assert.equal(e['proposal-row-list'].children.length, 1);
  renderEnrichmentProposalPanel(e, { ...base, view: 'excluded', entityFilter: '', fieldFilter: '', datasetFilter: 'dataset-a', statusFilter: '', search: '' });
  assert.equal(e['proposal-row-list'].children.length, 0);
});

test('controller gates build on exact authority and builds only from immutable review ledger', async () => {
  const e = elements(); const upstream = proposalFixture(); let received = null;
  const controller = createEnrichmentProposalController(e, {
    ...deps, BlobCtor: Blob, urlApi: { createObjectURL: () => 'blob:1', revokeObjectURL() {} }, triggerDownload() {},
    validateEnrichmentProposalAuthority: async () => ({ ok: true, errors: [], warnings: [] }),
    createEnrichmentProposalSet: async (value) => { received = value; return createEnrichmentProposalSet(value, deps); },
  }, () => upstream);
  await tick(); assert.equal(e['proposal-build'].disabled, false);
  await e['proposal-build'].dispatch('click'); await tick();
  assert.equal(received.reviewLedger, upstream.reviewLedger); assert.equal(controller.getState().proposalSet.schema, 'EnrichmentProposalSet.v1');
  controller.cleanup();
});

test('stale asynchronous builds cannot replace newer review authority', async () => {
  const e = elements(); let upstream = proposalFixture(); let resolveBuild;
  const pending = new Promise((resolve) => { resolveBuild = resolve; });
  const controller = createEnrichmentProposalController(e, {
    BlobCtor: Blob, urlApi: { createObjectURL: () => 'blob:1', revokeObjectURL() {} }, triggerDownload() {},
    validateEnrichmentProposalAuthority: async () => ({ ok: true, errors: [], warnings: [] }),
    createEnrichmentProposalSet: async () => pending,
  }, () => upstream);
  await tick(); void e['proposal-build'].dispatch('click'); await tick();
  upstream = proposalFixture(); upstream.reviewLedger.reviewLedgerId = 'new-review'; await controller.syncUpstream();
  resolveBuild({ schema: 'EnrichmentProposalSet.v1', proposalSetId: 'stale', groups: [], exclusions: [], proposals: [], validation: { ok: true } }); await tick();
  assert.equal(controller.getState().proposalSet, null); controller.cleanup();
});

test('completed asynchronous master import invalidates a built proposal set', async () => {
  const e = elements(); const master = masterElements(); const upstream = proposalFixture(); const scheduled = [];
  const controller = createEnrichmentProposalController(e, {
    ...deps, masterElements: master, setTimeout: (callback) => { scheduled.push(callback); },
    BlobCtor: Blob, urlApi: { createObjectURL: () => 'blob:1', revokeObjectURL() {} }, triggerDownload() {},
    validateEnrichmentProposalAuthority: async () => ({ ok: true, errors: [], warnings: [] }),
  }, () => upstream);
  await tick(); await e['proposal-build'].dispatch('click'); await tick(); assert.ok(controller.getState().proposalSet);
  master['master-import-status'].textContent = 'Importing'; await master['master-import'].dispatch('click');
  scheduled.shift()(); assert.equal(controller.getState().proposalSet.validation.ok, true);
  upstream.registry.datasets.push({ datasetId: 'dataset-new', contentHash: 'new-hash', datasetRole: 'custom' });
  master['master-import-status'].textContent = 'Imported'; scheduled.shift()(); await tick();
  assert.equal(controller.getState().proposalSet, null); controller.cleanup();
});

test('JSON and CSV downloads use exact displayed artifact and URLs are revoked on invalidation and cleanup', async () => {
  const e = elements(); const upstream = proposalFixture(); const downloads = []; const blobs = new Map(); const revoked = []; let next = 0;
  const urlApi = { createObjectURL(blob) { const url = `blob:${++next}`; blobs.set(url, blob); return url; }, revokeObjectURL(url) { revoked.push(url); blobs.delete(url); } };
  const controller = createEnrichmentProposalController(e, {
    ...deps, BlobCtor: Blob, urlApi, triggerDownload: (url, name) => downloads.push([url,name]),
    validateEnrichmentProposalAuthority: async () => ({ ok: true, errors: [], warnings: [] }),
  }, () => upstream);
  await tick(); await e['proposal-build'].dispatch('click'); await tick();
  for (const id of ['proposal-json-download','proposal-csv-download','proposal-group-csv-download','proposal-exclusion-csv-download']) await e[id].dispatch('click');
  assert.deepEqual(downloads.map((item) => item[1]), ['enrichment-proposal-set.json','enrichment-proposals.csv','enrichment-proposal-groups.csv','enrichment-exclusions.csv']);
  const json = await blobs.get(downloads[0][0]).text(); assert.deepEqual(JSON.parse(json), controller.getState().proposalSet);
  controller.invalidate('changed'); assert.equal(revoked.length, 4); controller.cleanup();
});

test('every authoritative identity change invalidates the built proposal set', async () => {
  const mutations = [
    (u) => { u.graph.contentHash = 'graph-new'; }, (u) => { u.ledger.ledgerId = 'ledger-new'; },
    (u) => { u.config.bindingConfigId = 'config-new'; }, (u) => { u.run.comparisonRunId = 'run-new'; },
    (u) => { u.reviewLedger.reviewLedgerId = 'review-new'; }, (u) => { u.attachmentSet.attachments = []; },
    (u) => { u.registry.datasets[0].contentHash = 'dataset-new'; },
  ];
  for (const mutate of mutations) {
    const e = elements(); const upstream = proposalFixture();
    const controller = createEnrichmentProposalController(e, {
      ...deps, BlobCtor: Blob, urlApi: { createObjectURL: () => 'blob:1', revokeObjectURL() {} }, triggerDownload() {},
      validateEnrichmentProposalAuthority: async () => ({ ok: true, errors: [], warnings: [] }),
    }, () => upstream);
    await tick(); await e['proposal-build'].dispatch('click'); await tick(); assert.ok(controller.getState().proposalSet);
    mutate(upstream); await controller.syncUpstream(); await tick(); assert.equal(controller.getState().proposalSet, null); controller.cleanup();
  }
});
