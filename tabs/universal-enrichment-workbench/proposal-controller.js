import {
  buildEnrichmentExclusionCsv, buildEnrichmentProposalCsv, buildEnrichmentProposalGroupCsv,
} from './proposal-csv.js';
import {
  createEnrichmentProposalSet, serializeEnrichmentProposalSet,
} from './proposal-set.js';
import { validateEnrichmentProposalAuthority } from './proposal-authority.js';
import {
  ENRICHMENT_PROPOSAL_STEP, renderEnrichmentProposalPanel,
} from './proposal-renderer.js';

const IDS = [
  'proposal-build','proposal-json-download','proposal-csv-download','proposal-group-csv-download',
  'proposal-exclusion-csv-download','proposal-status','proposal-set-id','proposal-count','proposal-excluded-count',
  'proposal-single-count','proposal-equivalent-count','proposal-conflicting-count','proposal-view',
  'proposal-entity-filter','proposal-field-filter','proposal-dataset-filter','proposal-status-filter','proposal-search',
  'proposal-row-list','proposal-prev','proposal-next','proposal-visible-count','proposal-details',
  'proposal-entry-list','proposal-entry-count','proposal-entry-more','proposal-errors','proposal-warnings',
];

export function collectEnrichmentProposalElements(container) {
  return Object.fromEntries(IDS.map((id) => [id, container.querySelector(`#uew-${id}`)]));
}

function initialState() {
  return {
    proposalSet: null, status: 'Not ready', authorityValidation: { ok: false, errors: [], warnings: [] },
    view: 'single', entityFilter: '', fieldFilter: '', datasetFilter: '', statusFilter: '', search: '',
    page: 0, selectedEvidenceId: '', proposalLimit: ENRICHMENT_PROPOSAL_STEP,
  };
}

function addListener(context, element, type, handler) {
  if (!element) return; element.addEventListener(type, handler); context.listeners.push([element, type, handler]);
}

function revokeUrls(context) {
  context.objectUrls.forEach((url) => context.dependencies.urlApi.revokeObjectURL(url)); context.objectUrls.clear();
}

function authorityIdentity(upstream) {
  const datasets = (upstream?.registry?.datasets || [])
    .map((item) => `${item.datasetId}:${item.contentHash}:${item.datasetRole}`).join(',');
  const attachments = (upstream?.attachmentSet?.attachments || [])
    .map((item) => `${item.attachmentOrder}:${item.datasetId}:${item.datasetRole}`).join(',');
  return [upstream?.graph?.sourceFileId,upstream?.graph?.sourceRevision,upstream?.graph?.contentHash,
    upstream?.ledger?.ledgerId,upstream?.config?.bindingConfigId,upstream?.run?.comparisonRunId,
    upstream?.reviewLedger?.reviewLedgerId,upstream?.run?.attachmentSetIdentity,attachments,datasets].join('|');
}

function render(context) {
  renderEnrichmentProposalPanel(context.elements, context.state);
  const busy = ['Checking proposal authority','Building proposal set'].includes(context.state.status);
  context.elements['proposal-build'].disabled = !context.state.authorityValidation.ok || busy;
  const valid = context.state.proposalSet?.validation?.ok;
  ['proposal-json-download','proposal-csv-download','proposal-group-csv-download','proposal-exclusion-csv-download']
    .forEach((id) => { context.elements[id].disabled = !valid; });
}

function invalidate(context, status) {
  context.requestId += 1; revokeUrls(context);
  context.state = { ...context.state, proposalSet: null, status, page: 0, selectedEvidenceId: '' };
  render(context);
}

async function syncAuthority(context) {
  const upstream = context.getUpstream(); const identity = authorityIdentity(upstream);
  if (identity === context.lastAuthorityIdentity) { render(context); return; }
  context.lastAuthorityIdentity = identity; const requestId = ++context.requestId; revokeUrls(context);
  context.state = {
    ...context.state, proposalSet: null, authorityValidation: { ok: false, errors: [], warnings: [] },
    status: 'Checking proposal authority', page: 0, selectedEvidenceId: '', proposalLimit: ENRICHMENT_PROPOSAL_STEP,
  };
  render(context);
  const validate = context.dependencies.validateEnrichmentProposalAuthority || validateEnrichmentProposalAuthority;
  const validation = await validate(upstream, context.dependencies);
  if (context.disposed || requestId !== context.requestId
    || identity !== authorityIdentity(context.getUpstream())) return;
  context.state = { ...context.state, authorityValidation: validation, status: validation.ok ? 'Ready to build' : 'Authority invalid' };
  render(context);
}

function queueMasterSync(context) {
  const schedule = context.dependencies.queueMicrotask || globalThis.queueMicrotask
    || ((callback) => Promise.resolve().then(callback));
  schedule(() => { if (!context.disposed) void syncAuthority(context); });
}

function waitForMasterImport(context) {
  const schedule = context.dependencies.setTimeout || globalThis.setTimeout;
  const status = context.dependencies.masterElements?.['master-import-status'];
  const poll = () => {
    if (context.disposed) return;
    if (status?.textContent === 'Importing') { schedule(poll, 0); return; }
    void syncAuthority(context);
  };
  schedule(poll, 0);
}

function bindMasterWatchers(context) {
  const master = context.dependencies.masterElements || {};
  addListener(context, master['master-import'], 'click', () => waitForMasterImport(context));
  for (const id of ['master-remove','master-attach','master-registry-clear']) {
    addListener(context, master[id], 'click', () => queueMasterSync(context));
  }
}

async function handleBuild(context) {
  if (!context.state.authorityValidation.ok) return;
  const upstream = context.getUpstream(); const identity = authorityIdentity(upstream);
  const reviewLedgerId = upstream?.reviewLedger?.reviewLedgerId; const requestId = ++context.requestId;
  context.state = { ...context.state, proposalSet: null, status: 'Building proposal set' }; render(context);
  try {
    const build = context.dependencies.createEnrichmentProposalSet || createEnrichmentProposalSet;
    const proposalSet = await build(upstream, context.dependencies);
    if (context.disposed || requestId !== context.requestId
      || identity !== authorityIdentity(context.getUpstream())
      || reviewLedgerId !== context.getUpstream()?.reviewLedger?.reviewLedgerId) return;
    revokeUrls(context);
    context.state = {
      ...context.state, proposalSet, status: proposalSet.validation.ok ? 'Proposal set valid' : 'Proposal set invalid',
      page: 0, selectedEvidenceId: proposalSet.groups[0]?.proposalGroupId || proposalSet.exclusions[0]?.exclusionId || '',
    };
    render(context);
  } catch (error) {
    if (context.disposed || requestId !== context.requestId) return;
    context.state = { ...context.state, status: `Proposal build failed [${error.code || 'ERROR'}]: ${error.message}` };
    render(context);
  }
}

function download(context, content, type, name) {
  const blob = new context.dependencies.BlobCtor([content], { type });
  const url = context.dependencies.urlApi.createObjectURL(blob); context.objectUrls.add(url);
  context.dependencies.triggerDownload(url, name);
}

function bindDownloads(context) {
  const e = context.elements;
  addListener(context, e['proposal-json-download'], 'click', () => download(context,
    serializeEnrichmentProposalSet(context.state.proposalSet), 'application/json', 'enrichment-proposal-set.json'));
  addListener(context, e['proposal-csv-download'], 'click', () => download(context,
    buildEnrichmentProposalCsv(context.state.proposalSet), 'text/csv;charset=utf-8', 'enrichment-proposals.csv'));
  addListener(context, e['proposal-group-csv-download'], 'click', () => download(context,
    buildEnrichmentProposalGroupCsv(context.state.proposalSet), 'text/csv;charset=utf-8', 'enrichment-proposal-groups.csv'));
  addListener(context, e['proposal-exclusion-csv-download'], 'click', () => download(context,
    buildEnrichmentExclusionCsv(context.state.proposalSet), 'text/csv;charset=utf-8', 'enrichment-exclusions.csv'));
}

function bindFilters(context) {
  const e = context.elements;
  addListener(context, e['proposal-view'], 'change', () => {
    context.state = { ...context.state, view: e['proposal-view'].value, page: 0, selectedEvidenceId: '' }; render(context);
  });
  const pairs = [
    ['proposal-entity-filter','entityFilter'],['proposal-field-filter','fieldFilter'],
    ['proposal-dataset-filter','datasetFilter'],['proposal-status-filter','statusFilter'],['proposal-search','search'],
  ];
  pairs.forEach(([id, key]) => addListener(context, e[id], 'input', () => {
    context.state = { ...context.state, [key]: e[id].value, page: 0 }; render(context);
  }));
  addListener(context, e['proposal-prev'], 'click', () => {
    context.state = { ...context.state, page: Math.max(0, context.state.page - 1) }; render(context);
  });
  addListener(context, e['proposal-next'], 'click', () => {
    context.state = { ...context.state, page: context.state.page + 1 }; render(context);
  });
}

function bindSelection(context) {
  addListener(context, context.elements['proposal-row-list'], 'click', (event) => {
    const target = event.target?.closest?.('[data-proposal-evidence-id]') || event.target;
    const id = target?.dataset?.proposalEvidenceId; if (!id) return;
    context.state = { ...context.state, selectedEvidenceId: id, proposalLimit: ENRICHMENT_PROPOSAL_STEP }; render(context);
  });
  addListener(context, context.elements['proposal-entry-more'], 'click', () => {
    context.state = { ...context.state, proposalLimit: context.state.proposalLimit + ENRICHMENT_PROPOSAL_STEP }; render(context);
  });
}

export function createEnrichmentProposalController(elements, dependencies = {}, getUpstream = () => ({})) {
  const context = {
    elements, dependencies, getUpstream, listeners: [], objectUrls: new Set(), disposed: false,
    requestId: 0, lastAuthorityIdentity: '', state: initialState(),
  };
  addListener(context, elements['proposal-build'], 'click', () => handleBuild(context));
  bindDownloads(context); bindFilters(context); bindSelection(context); bindMasterWatchers(context);
  render(context); void syncAuthority(context);
  return {
    getState: () => context.state, syncUpstream: () => syncAuthority(context),
    invalidate: (status = 'Upstream changed') => invalidate(context, status),
    cleanup() {
      if (context.disposed) return; context.disposed = true; context.requestId += 1;
      context.listeners.splice(0).forEach(([element, type, handler]) => element.removeEventListener(type, handler));
      revokeUrls(context);
    },
  };
}
