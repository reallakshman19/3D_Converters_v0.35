import { createFieldCandidateLedger, serializeFieldCandidateLedger } from './evidence-ledger.js';
import { createExtractionEvidenceTrace, serializeExtractionEvidenceTrace } from './evidence-trace.js';
import { buildCandidateLedgerCsv, buildRejectedLedgerCsv } from './evidence-csv.js';
import { renderEvidenceDetails, renderEvidencePanel, renderEvidenceTrace, renderLedgerTable, TRACE_RENDER_LIMIT, TRACE_RENDER_STEP } from './evidence-renderer.js';

const IDS = [
  'evidence-build','evidence-ledger-download','evidence-trace-download','evidence-candidate-csv','evidence-rejected-csv',
  'evidence-status','evidence-ledger-id','evidence-trace-id','evidence-entry-count','evidence-candidate-count',
  'evidence-rejected-count','evidence-entity-count','evidence-field-count','evidence-errors','evidence-warnings',
  'evidence-view','evidence-entity-filter','evidence-field-filter','evidence-search','evidence-ledger-list','evidence-ledger-count',
  'evidence-ledger-prev','evidence-ledger-next','evidence-trace-tree','evidence-trace-count','evidence-trace-more',
  'evidence-entry-details','evidence-trace-details',
];

export function collectEvidenceLedgerElements(container) {
  return Object.fromEntries(IDS.map((id) => [id, container.querySelector(`#uew-${id}`)]));
}

function initialState() {
  return { ledger: null, trace: null, status: 'Not built', view: 'candidates', entityFilter: '', fieldFilter: '', search: '',
    page: 0, traceLimit: TRACE_RENDER_LIMIT, expandedTraceIds: new Set(), selectedEntryId: '', selectedTraceNodeId: '' };
}

function upstreamIdentity(upstream) {
  const { graph, config, run } = upstream || {};
  return [graph?.sourceFileId, graph?.sourceRevision, graph?.contentHash, graph?.schema, config?.configId, run?.runId].join('|');
}

function referencesReady(graph, config, run) {
  if (!Array.isArray(graph?.entities) || !Array.isArray(config?.rules) || !Array.isArray(run?.results)) return false;
  const entities = new Map(graph.entities.map((entity) => [entity.entityId, entity]));
  const rules = new Map(config.rules.map((rule) => [rule.ruleId, rule]));
  return run.results.every((result) => {
    const entity = entities.get(result.entityId); const rule = rules.get(result.ruleId);
    return Boolean(entity && rule?.enabled && result.sourcePath === entity.sourcePath && result.fieldKey === rule.fieldKey);
  });
}

function authorityReady(upstream) {
  const { graph, config, run } = upstream || {};
  return graph?.schema === 'UniversalSourceGraph.v1' && graph?.validation?.ok
    && config?.schema === 'ExtractionConfig.v1' && config?.validation?.ok
    && run?.schema === 'ExtractionTestRun.v1' && run?.validation?.ok
    && run.sourceFileId === graph.sourceFileId && run.sourceRevision === graph.sourceRevision
    && run.sourceContentHash === graph.contentHash && run.sourceGraphSchema === graph.schema
    && run.configId === config.configId && referencesReady(graph, config, run);
}

function addListener(context, element, type, handler) {
  if (!element) return; element.addEventListener(type, handler); context.listeners.push([element, type, handler]);
}

function revokeUrls(context) {
  context.objectUrls.forEach((url) => context.dependencies.urlApi.revokeObjectURL(url)); context.objectUrls.clear();
}

function render(context) {
  renderEvidencePanel(context.elements, context.state);
  const ready = authorityReady(context.getUpstream());
  context.elements['evidence-build'].disabled = !ready || context.state.status === 'Building';
  const valid = context.state.ledger?.validation?.ok && context.state.trace?.validation?.ok;
  ['evidence-ledger-download','evidence-trace-download','evidence-candidate-csv','evidence-rejected-csv']
    .forEach((id) => { context.elements[id].disabled = !valid; });
  context.dependencies.onEvidenceChange?.(context.state);
}

function invalidate(context, status = 'Not built') {
  context.requestId += 1; revokeUrls(context);
  context.state = { ...initialState(), view: context.state.view, status }; render(context);
}

async function handleBuild(context) {
  const upstream = context.getUpstream(); if (!authorityReady(upstream)) return;
  const identity = upstreamIdentity(upstream); const requestId = ++context.requestId;
  context.state = { ...context.state, ledger: null, trace: null, status: 'Building' }; render(context);
  try {
    const makeTrace = context.dependencies.createExtractionEvidenceTrace || createExtractionEvidenceTrace;
    const makeLedger = context.dependencies.createFieldCandidateLedger || createFieldCandidateLedger;
    const trace = await makeTrace(upstream.graph, upstream.config, upstream.run, context.dependencies);
    const ledger = await makeLedger(upstream.graph, upstream.config, upstream.run, context.dependencies);
    if (context.disposed || requestId !== context.requestId || identity !== upstreamIdentity(context.getUpstream())) return;
    revokeUrls(context); const expandedTraceIds = new Set(trace.rootTraceNodeIds);
    trace.nodes.filter((node) => node.traceNodeKind === 'rule').forEach((node) => expandedTraceIds.add(node.traceNodeId));
    context.state = { ...context.state, ledger, trace, status: ledger.validation.ok && trace.validation.ok ? 'Valid' : 'Invalid',
      expandedTraceIds, page: 0, traceLimit: TRACE_RENDER_LIMIT }; render(context);
  } catch (error) {
    if (context.disposed || requestId !== context.requestId) return;
    context.state = { ...context.state, status: `Build failed: ${error.message}` }; render(context);
  }
}

function download(context, content, type, name) {
  const blob = new context.dependencies.BlobCtor([content], { type });
  const url = context.dependencies.urlApi.createObjectURL(blob); context.objectUrls.add(url);
  context.dependencies.triggerDownload(url, name);
}

function handleAction(context, event) {
  const action = event.target?.dataset?.evidenceAction;
  if (action === 'select-entry') { context.state = { ...context.state, selectedEntryId: event.target.dataset.entryId }; renderEvidenceDetails(context.elements, context.state); }
  if (action === 'select-trace') { context.state = { ...context.state, selectedTraceNodeId: event.target.dataset.traceNodeId }; renderEvidenceDetails(context.elements, context.state); }
  if (action === 'toggle-trace') {
    const id = event.target.dataset.traceNodeId; const expandedTraceIds = new Set(context.state.expandedTraceIds);
    if (expandedTraceIds.has(id)) expandedTraceIds.delete(id); else expandedTraceIds.add(id);
    context.state = { ...context.state, expandedTraceIds }; renderEvidenceTrace(context.elements, context.state);
  }
}

function bindFilters(context) {
  const e = context.elements;
  addListener(context, e['evidence-view'], 'change', () => { context.state = { ...context.state, view: e['evidence-view'].value, page: 0 }; render(context); });
  [['evidence-entity-filter','entityFilter'],['evidence-field-filter','fieldFilter'],['evidence-search','search']].forEach(([id, key]) => {
    addListener(context, e[id], 'input', () => { context.state = { ...context.state, [key]: e[id].value, page: 0 }; renderLedgerTable(e, context.state); });
  });
  addListener(context, e['evidence-ledger-prev'], 'click', () => { context.state = { ...context.state, page: Math.max(0, context.state.page - 1) }; renderLedgerTable(e, context.state); });
  addListener(context, e['evidence-ledger-next'], 'click', () => { context.state = { ...context.state, page: context.state.page + 1 }; renderLedgerTable(e, context.state); });
  addListener(context, e['evidence-trace-more'], 'click', () => { context.state = { ...context.state, traceLimit: context.state.traceLimit + TRACE_RENDER_STEP }; renderEvidenceTrace(e, context.state); });
}

function bindDownloads(context) {
  const e = context.elements;
  addListener(context, e['evidence-ledger-download'], 'click', () => download(context, serializeFieldCandidateLedger(context.state.ledger), 'application/json', 'field-candidate-ledger.json'));
  addListener(context, e['evidence-trace-download'], 'click', () => download(context, serializeExtractionEvidenceTrace(context.state.trace), 'application/json', 'extraction-evidence-trace.json'));
  addListener(context, e['evidence-candidate-csv'], 'click', () => download(context, buildCandidateLedgerCsv(context.state.ledger), 'text/csv;charset=utf-8', 'field-candidates.csv'));
  addListener(context, e['evidence-rejected-csv'], 'click', () => download(context, buildRejectedLedgerCsv(context.state.ledger), 'text/csv;charset=utf-8', 'field-rejections.csv'));
}

export function createEvidenceLedgerController(elements, dependencies = {}, getUpstream = () => ({})) {
  const context = { elements, dependencies, getUpstream, listeners: [], objectUrls: new Set(), disposed: false, requestId: 0,
    state: initialState(), lastUpstreamIdentity: '' };
  addListener(context, elements['evidence-build'], 'click', () => handleBuild(context));
  addListener(context, elements['evidence-ledger-list'], 'click', (event) => handleAction(context, event));
  addListener(context, elements['evidence-trace-tree'], 'click', (event) => handleAction(context, event));
  bindFilters(context); bindDownloads(context); render(context);
  return {
    getState: () => context.state,
    syncUpstream() {
      const identity = upstreamIdentity(getUpstream());
      if (identity === context.lastUpstreamIdentity) return;
      context.lastUpstreamIdentity = identity; invalidate(context, 'Upstream changed');
    },
    cleanup() {
      if (context.disposed) return; context.disposed = true; context.requestId += 1;
      context.listeners.splice(0).forEach(([element, type, handler]) => element.removeEventListener(type, handler)); revokeUrls(context);
    },
  };
}
