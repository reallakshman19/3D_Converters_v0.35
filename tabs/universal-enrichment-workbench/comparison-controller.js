import { createMasterFieldBindingConfig, serializeMasterFieldBindingConfig } from './comparison-binding.js';
import { createCandidateComparisonRun, serializeCandidateComparisonRun } from './comparison-run.js';
import { buildCandidateComparisonCsv, buildCandidateMatchCsv } from './comparison-csv.js';
import { renderComparisonPanel, COMPARISON_MATCH_STEP } from './comparison-renderer.js';

const IDS = [
  'comparison-add-binding','comparison-build-config','comparison-config-download','comparison-run','comparison-run-download',
  'comparison-csv-download','comparison-match-csv-download','comparison-status','comparison-binding-list','comparison-config-id',
  'comparison-run-id','comparison-count','comparison-unique-count','comparison-multiple-count','comparison-unmatched-count',
  'comparison-unbound-count','comparison-view','comparison-entity-filter','comparison-field-filter','comparison-dataset-filter',
  'comparison-search','comparison-result-list','comparison-prev','comparison-next','comparison-visible-count','comparison-details',
  'comparison-match-list','comparison-match-more','comparison-errors','comparison-warnings',
];

export function collectMasterCandidateComparisonElements(container) {
  return Object.fromEntries(IDS.map((id) => [id, container.querySelector(`#uew-${id}`)]));
}

function initialState() {
  return {
    bindingDrafts: [], config: null, run: null, status: 'Not configured', view: 'unique',
    entityFilter: '', fieldFilter: '', datasetFilter: '', search: '', page: 0,
    selectedResultId: '', matchLimit: COMPARISON_MATCH_STEP,
  };
}

function upstreamIdentity(upstream) {
  const datasets = (upstream?.registry?.datasets || []).map((item) => `${item.datasetId}:${item.contentHash}`).join(',');
  return [upstream?.graph?.sourceFileId,upstream?.graph?.sourceRevision,upstream?.graph?.contentHash,
    upstream?.ledger?.ledgerId,upstream?.attachmentSet?.validation?.ok,
    (upstream?.attachmentSet?.attachments || []).map((item) => item.datasetId).join(','),datasets].join('|');
}

const UPSTREAM_WATCH_IDS = [
  'uew-file','uew-kind','uew-source-text','uew-clear','uew-graph-build','uew-master-import',
  'uew-master-remove','uew-master-attach','uew-master-registry-clear','uew-evidence-build',
];

function notify(context) {
  context.dependencies.onComparisonChange?.(context.state);
}

function syncContext(context) {
  const identity = upstreamIdentity(context.getUpstream());
  if (identity === context.lastIdentity) { render(context); return; }
  context.lastIdentity = identity; invalidate(context);
}

function bindUpstreamWatchers(context) {
  const documentRef = context.elements['comparison-add-binding'].ownerDocument;
  const schedule = context.dependencies.queueMicrotask || globalThis.queueMicrotask || ((callback) => Promise.resolve().then(callback));
  for (const id of UPSTREAM_WATCH_IDS) {
    const element = documentRef.getElementById?.(id); if (!element) continue;
    for (const type of ['click','change','input']) addListener(context, element, type, () => schedule(() => {
      if (!context.disposed) syncContext(context);
    }));
  }
}

function authorityReady(upstream) {
  if (upstream?.graph?.schema !== 'UniversalSourceGraph.v1' || !upstream.graph.validation?.ok) return false;
  if (upstream?.ledger?.schema !== 'FieldCandidateLedger.v1' || !upstream.ledger.validation?.ok) return false;
  if (upstream?.attachmentSet?.schema !== 'MasterAttachmentSet.v1' || !upstream.attachmentSet.validation?.ok) return false;
  const datasets = new Map((upstream?.registry?.datasets || []).map((item) => [item.datasetId, item]));
  return upstream.attachmentSet.attachments.every((item) => datasets.get(item.datasetId)?.validation?.ok);
}

function addListener(context, element, type, handler) {
  if (!element) return; element.addEventListener(type, handler); context.listeners.push([element, type, handler]);
}

function revokeUrls(context) {
  context.objectUrls.forEach((url) => context.dependencies.urlApi.revokeObjectURL(url)); context.objectUrls.clear();
}

function render(context) {
  const upstream = context.getUpstream(); renderComparisonPanel(context.elements, context.state, upstream);
  const ready = authorityReady(upstream); const busy = ['Building configuration','Running comparison'].includes(context.state.status);
  context.elements['comparison-add-binding'].disabled = !ready || busy;
  context.elements['comparison-build-config'].disabled = !ready || !context.state.bindingDrafts.length || busy;
  context.elements['comparison-config-download'].disabled = !context.state.config?.validation?.ok;
  context.elements['comparison-run'].disabled = !context.state.config?.validation?.ok || busy;
  ['comparison-run-download','comparison-csv-download','comparison-match-csv-download']
    .forEach((id) => { context.elements[id].disabled = !context.state.run?.validation?.ok; });
}

function invalidate(context, status = 'Upstream changed') {
  context.requestId += 1; revokeUrls(context);
  context.state = { ...context.state, config: null, run: null, status, page: 0, selectedResultId: '' };
  notify(context); render(context);
}

function defaultDraft(upstream) {
  const fieldKey = (upstream.ledger.entries || []).find((entry) => entry.status === 'candidate')?.fieldKey || '';
  const attachment = upstream.attachmentSet.attachments?.[0];
  const dataset = (upstream.registry.datasets || []).find((item) => item.datasetId === attachment?.datasetId);
  return {
    enabled: true, fieldKey, datasetId: dataset?.datasetId || '', datasetRole: dataset?.datasetRole || '',
    columnId: dataset?.columns?.[0]?.columnId || '', comparisonMode: 'strict',
    normalization: { unicodeNfc: false, trim: false, caseFold: false, collapseWhitespace: false },
  };
}

function updateDatasetDraft(draft, upstream, datasetId) {
  const dataset = (upstream.registry.datasets || []).find((item) => item.datasetId === datasetId);
  return { ...draft, datasetId, datasetRole: dataset?.datasetRole || '', columnId: dataset?.columns?.[0]?.columnId || '' };
}

function updateDraft(context, index, action, target) {
  const drafts = context.state.bindingDrafts.map((item) => ({ ...item, normalization: { ...item.normalization } }));
  const draft = drafts[index]; if (!draft) return;
  if (action === 'enabled') draft.enabled = target.checked;
  if (action === 'field') draft.fieldKey = target.value;
  if (action === 'dataset') drafts[index] = updateDatasetDraft(draft, context.getUpstream(), target.value);
  if (action === 'column') draft.columnId = target.value;
  if (action === 'mode') draft.comparisonMode = target.value;
  if (action === 'normalization') draft.normalization[target.dataset.normalizationKey] = target.checked;
  context.state = { ...context.state, bindingDrafts: drafts }; invalidate(context, 'Binding draft changed');
}

function moveDraft(context, index, direction) {
  const drafts = [...context.state.bindingDrafts]; const target = index + direction;
  if (target < 0 || target >= drafts.length) return;
  [drafts[index], drafts[target]] = [drafts[target], drafts[index]];
  context.state = { ...context.state, bindingDrafts: drafts }; invalidate(context, 'Binding order changed');
}

function handleBindingAction(context, event) {
  const target = event.target; const action = target?.dataset?.comparisonAction; const index = Number(target?.dataset?.bindingIndex);
  if (!action || !Number.isInteger(index)) return;
  if (['enabled','field','dataset','column','mode','normalization'].includes(action)) updateDraft(context, index, action, target);
  if (action === 'remove') {
    context.state = { ...context.state, bindingDrafts: context.state.bindingDrafts.filter((_, row) => row !== index) };
    invalidate(context, 'Binding removed');
  }
  if (action === 'up') moveDraft(context, index, -1);
  if (action === 'down') moveDraft(context, index, 1);
}

async function handleConfigBuild(context) {
  const upstream = context.getUpstream(); if (!authorityReady(upstream)) return;
  const identity = upstreamIdentity(upstream); const requestId = ++context.requestId;
  context.state = { ...context.state, config: null, run: null, status: 'Building configuration' }; notify(context); render(context);
  try {
    const build = context.dependencies.createMasterFieldBindingConfig || createMasterFieldBindingConfig;
    const config = await build(upstream.graph, upstream.ledger, upstream.attachmentSet, upstream.registry, context.state.bindingDrafts, context.dependencies);
    if (context.disposed || requestId !== context.requestId || identity !== upstreamIdentity(context.getUpstream())) return;
    context.state = { ...context.state, config, status: config.validation.ok ? 'Configuration valid' : 'Configuration invalid' }; notify(context); render(context);
  } catch (error) {
    if (context.disposed || requestId !== context.requestId) return;
    context.state = { ...context.state, status: `Configuration failed: ${error.message}` }; notify(context); render(context);
  }
}

async function handleRun(context) {
  const upstream = context.getUpstream(); if (!context.state.config?.validation?.ok || !authorityReady(upstream)) return;
  const identity = upstreamIdentity(upstream); const configId = context.state.config.bindingConfigId; const requestId = ++context.requestId;
  context.state = { ...context.state, run: null, status: 'Running comparison' }; notify(context); render(context);
  try {
    const build = context.dependencies.createCandidateComparisonRun || createCandidateComparisonRun;
    const run = await build(upstream.graph, upstream.ledger, context.state.config, upstream.attachmentSet, upstream.registry, context.dependencies);
    if (context.disposed || requestId !== context.requestId || identity !== upstreamIdentity(context.getUpstream())
      || configId !== context.state.config?.bindingConfigId) return;
    context.state = { ...context.state, run, status: run.validation.ok ? 'Comparison valid' : 'Comparison invalid', page: 0 }; notify(context); render(context);
  } catch (error) {
    if (context.disposed || requestId !== context.requestId) return;
    context.state = { ...context.state, status: `Comparison failed [${error.code || 'ERROR'}]: ${error.message}` }; notify(context); render(context);
  }
}

function download(context, content, type, name) {
  const blob = new context.dependencies.BlobCtor([content], { type }); const url = context.dependencies.urlApi.createObjectURL(blob);
  context.objectUrls.add(url); context.dependencies.triggerDownload(url, name);
}

function bindDownloads(context) {
  const e = context.elements;
  addListener(context, e['comparison-config-download'], 'click', () => download(context, serializeMasterFieldBindingConfig(context.state.config), 'application/json', 'master-field-binding-config.json'));
  addListener(context, e['comparison-run-download'], 'click', () => download(context, serializeCandidateComparisonRun(context.state.run), 'application/json', 'candidate-comparison-run.json'));
  addListener(context, e['comparison-csv-download'], 'click', () => download(context, buildCandidateComparisonCsv(context.state.run), 'text/csv;charset=utf-8', 'candidate-comparisons.csv'));
  addListener(context, e['comparison-match-csv-download'], 'click', () => download(context, buildCandidateMatchCsv(context.state.run), 'text/csv;charset=utf-8', 'candidate-matches.csv'));
}

function bindFilters(context) {
  const e = context.elements;
  addListener(context, e['comparison-view'], 'change', () => { context.state = { ...context.state, view: e['comparison-view'].value, page: 0 }; render(context); });
  [['comparison-entity-filter','entityFilter'],['comparison-field-filter','fieldFilter'],['comparison-dataset-filter','datasetFilter'],['comparison-search','search']]
    .forEach(([id, key]) => addListener(context, e[id], 'input', () => { context.state = { ...context.state, [key]: e[id].value, page: 0 }; render(context); }));
  addListener(context, e['comparison-prev'], 'click', () => { context.state = { ...context.state, page: Math.max(0, context.state.page - 1) }; render(context); });
  addListener(context, e['comparison-next'], 'click', () => { context.state = { ...context.state, page: context.state.page + 1 }; render(context); });
}

export function createMasterCandidateComparisonController(elements, dependencies = {}, getUpstream = () => ({})) {
  const context = { elements, dependencies, getUpstream, listeners: [], objectUrls: new Set(), disposed: false, requestId: 0, lastIdentity: '', state: initialState() };
  addListener(context, elements['comparison-add-binding'], 'click', () => {
    context.state = { ...context.state, bindingDrafts: [...context.state.bindingDrafts, defaultDraft(getUpstream())] }; invalidate(context, 'Binding added');
  });
  addListener(context, elements['comparison-binding-list'], 'click', (event) => handleBindingAction(context, event));
  addListener(context, elements['comparison-binding-list'], 'change', (event) => handleBindingAction(context, event));
  addListener(context, elements['comparison-build-config'], 'click', () => handleConfigBuild(context));
  addListener(context, elements['comparison-run'], 'click', () => handleRun(context));
  addListener(context, elements['comparison-result-list'], 'click', (event) => {
    const id = event.target?.closest?.('[data-result-id]')?.dataset?.resultId || event.target?.dataset?.resultId;
    if (id) { context.state = { ...context.state, selectedResultId: id, matchLimit: COMPARISON_MATCH_STEP }; render(context); }
  });
  addListener(context, elements['comparison-match-more'], 'click', () => { context.state = { ...context.state, matchLimit: context.state.matchLimit + COMPARISON_MATCH_STEP }; render(context); });
  bindFilters(context); bindDownloads(context); bindUpstreamWatchers(context); render(context);
  return {
    getState: () => context.state, syncUpstream() { syncContext(context); },
    cleanup() {
      if (context.disposed) return; context.disposed = true; context.requestId += 1;
      context.listeners.splice(0).forEach(([element, type, handler]) => element.removeEventListener(type, handler)); revokeUrls(context);
    },
  };
}
