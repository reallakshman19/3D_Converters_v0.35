import { createUniversalSourceGraph, serializeUniversalSourceGraph } from './graph-projection.js';
import {
  renderEntityDetails, renderEntityTable, renderGraphPanel, renderHierarchyTree,
  TREE_RENDER_LIMIT, TREE_RENDER_STEP,
} from './graph-renderer.js';

const GRAPH_IDS = [
  'graph-build', 'graph-download', 'graph-status', 'graph-entity-count',
  'graph-root-count', 'graph-max-depth', 'graph-kind-counts', 'graph-errors',
  'graph-warnings', 'graph-tree', 'graph-tree-count', 'graph-tree-more', 'graph-filter',
  'graph-table-body', 'graph-table-count', 'graph-details',
];

export function collectSourceGraphElements(container) {
  return Object.fromEntries(GRAPH_IDS.map((id) => [id, container.querySelector(`#uew-${id}`)]));
}

function addListener(context, element, type, handler) {
  element.addEventListener(type, handler);
  context.listeners.push([element, type, handler]);
}

function removeListeners(context) {
  context.listeners.splice(0).forEach(([element, type, handler]) => element.removeEventListener(type, handler));
}

function graphDownloadName(envelope) {
  const stem = String(envelope?.sourceName || 'source').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-');
  return `${stem || 'source'}.universal-source-graph.json`;
}

function revokeUrls(context) {
  context.objectUrls.forEach((url) => context.dependencies.urlApi.revokeObjectURL(url));
  context.objectUrls.clear();
}

function envelopeIdentity(envelope) {
  if (!envelope) return '';
  return [envelope.sourceFileId, envelope.sourceKind, envelope.revision, envelope.contentHash].join('|');
}

function graphIdentity(graph) {
  if (!graph) return '';
  return [graph.sourceFileId, graph.sourceRevision, graph.contentHash, graph.schema].join('|');
}

function initialGraphState() {
  return {
    graph: null, status: 'Not built', expandedIds: new Set(), selectedEntityId: '',
    filter: '', treeLimit: TREE_RENDER_LIMIT,
  };
}

function notifyGraphChange(context) {
  const identity = graphIdentity(context.state.graph);
  if (identity === context.notifiedIdentity) return;
  context.notifiedIdentity = identity;
  context.dependencies.onGraphChange?.(context.state.graph);
}

function render(context) {
  renderGraphPanel(context.elements, context.state);
  const envelope = context.getEnvelope();
  context.elements['graph-build'].disabled = !envelope?.validation?.ok || context.state.status === 'Building';
  context.elements['graph-download'].disabled = !context.state.graph?.validation?.ok;
  notifyGraphChange(context);
}

export function invalidateSourceGraph(context) {
  context.requestId += 1;
  revokeUrls(context);
  context.state = initialGraphState();
  if (context.elements['graph-filter']) context.elements['graph-filter'].value = '';
  render(context);
}

async function handleBuild(context) {
  const envelope = context.getEnvelope();
  if (!envelope?.validation?.ok) return;
  const identity = envelopeIdentity(envelope);
  const requestId = ++context.requestId;
  context.state = { ...context.state, graph: null, status: 'Building' };
  render(context);
  const createGraph = context.dependencies.createGraph || createUniversalSourceGraph;
  let graph;
  try { graph = await createGraph(envelope, context.dependencies); }
  catch (error) {
    if (requestId !== context.requestId || context.disposed) return;
    context.state = { ...context.state, graph: null, status: `Build failed: ${error.message}` };
    render(context);
    return;
  }
  const stale = requestId !== context.requestId || identity !== envelopeIdentity(context.getEnvelope());
  if (context.disposed || stale) return;
  context.state = { ...context.state, graph, status: graph.validation.ok ? 'Valid' : 'Invalid' };
  render(context);
}

function handleDownload(context) {
  const graph = context.state.graph;
  if (!graph?.validation?.ok) return;
  const blob = new context.dependencies.BlobCtor([serializeUniversalSourceGraph(graph)], { type: 'application/json' });
  const url = context.dependencies.urlApi.createObjectURL(blob);
  context.objectUrls.add(url);
  context.dependencies.triggerDownload(url, graphDownloadName(context.getEnvelope()));
}

function handleTreeAction(context, event) {
  const action = event.target?.dataset?.graphAction;
  const entityId = event.target?.dataset?.entityId;
  if (!action || !entityId) return;
  if (action === 'toggle') {
    const expandedIds = new Set(context.state.expandedIds);
    if (expandedIds.has(entityId)) expandedIds.delete(entityId); else expandedIds.add(entityId);
    context.state = { ...context.state, expandedIds };
    renderHierarchyTree(context.elements, context.state.graph, expandedIds, context.state.treeLimit);
    return;
  }
  context.state = { ...context.state, selectedEntityId: entityId };
  renderEntityDetails(context.elements, context.state.graph, entityId);
}

function handleTreeMore(context) {
  context.state = { ...context.state, treeLimit: context.state.treeLimit + TREE_RENDER_STEP };
  renderHierarchyTree(context.elements, context.state.graph, context.state.expandedIds, context.state.treeLimit);
}

function handleTableAction(context, event) {
  const entityId = event.target?.dataset?.entityId;
  if (!entityId) return;
  context.state = { ...context.state, selectedEntityId: entityId };
  renderEntityDetails(context.elements, context.state.graph, entityId);
}

function handleFilter(context) {
  context.state = { ...context.state, filter: context.elements['graph-filter'].value };
  renderEntityTable(context.elements, context.state.graph, context.state.filter);
}

function bindListeners(context) {
  addListener(context, context.elements['graph-build'], 'click', () => handleBuild(context));
  addListener(context, context.elements['graph-download'], 'click', () => handleDownload(context));
  addListener(context, context.elements['graph-tree'], 'click', (event) => handleTreeAction(context, event));
  addListener(context, context.elements['graph-tree-more'], 'click', () => handleTreeMore(context));
  addListener(context, context.elements['graph-table-body'], 'click', (event) => handleTableAction(context, event));
  addListener(context, context.elements['graph-filter'], 'input', () => handleFilter(context));
}

export function createSourceGraphController(elements, dependencies, getEnvelope) {
  const context = {
    elements, dependencies, getEnvelope, listeners: [], objectUrls: new Set(),
    disposed: false, requestId: 0, state: initialGraphState(), notifiedIdentity: null,
  };
  bindListeners(context);
  render(context);
  return {
    getState: () => context.state,
    syncAvailability: () => render(context),
    invalidate: () => invalidateSourceGraph(context),
    cleanup() {
      if (context.disposed) return;
      context.disposed = true;
      context.requestId += 1;
      removeListeners(context);
      revokeUrls(context);
    },
  };
}
