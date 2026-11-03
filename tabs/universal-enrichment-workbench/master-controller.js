import { createMasterDataset, serializeMasterDataset } from './master-dataset.js';
import { addMasterDataset, createMasterRegistry, findMasterDataset, removeMasterDataset } from './master-registry.js';
import {
  attachMasterDataset,
  createMasterAttachmentSet,
  detachMasterDataset,
  serializeMasterAttachmentSet,
} from './master-attachments.js';
import { acceptMasterText, createMasterInputState, readMasterFile } from './master-source.js';
import { renderMasterRegistryPanel } from './master-renderer.js';

const MASTER_IDS = [
  'master-file', 'master-format', 'master-role', 'master-text', 'master-import',
  'master-import-status', 'master-errors', 'master-warnings', 'master-dataset-list',
  'master-search', 'master-prev', 'master-next', 'master-preview-count',
  'master-preview-head', 'master-preview-body', 'master-details', 'master-download',
  'master-remove', 'master-attach', 'master-attachment-list', 'master-attachment-status',
  'master-attachment-errors', 'master-attachment-warnings', 'master-attachment-download',
  'master-registry-clear',
];

export function collectMasterRegistryElements(container) {
  return Object.fromEntries(MASTER_IDS.map((id) => [id, container.querySelector(`#uew-${id}`)]));
}

function initialState() {
  return {
    input: createMasterInputState(), registry: createMasterRegistry(),
    selectedDatasetId: '', selectedRowId: '', filter: '', page: 0,
    importStatus: 'Not imported', importValidation: { ok: false, errors: [], warnings: [] },
    attachmentSet: null, graphIdentity: '',
  };
}

function addListener(context, element, type, handler) {
  element.addEventListener(type, handler);
  context.listeners.push([element, type, handler]);
}

function removeListeners(context) {
  context.listeners.splice(0).forEach(([element, type, handler]) => element.removeEventListener(type, handler));
}

function currentDataset(context) {
  return findMasterDataset(context.state.registry, context.state.selectedDatasetId);
}

function graphIdentity(graph) {
  if (!graph?.validation?.ok) return '';
  return [graph.sourceFileId, graph.sourceRevision, graph.contentHash, graph.schema].join('|');
}

function render(context) {
  renderMasterRegistryPanel(context.elements, context.state, context.getGraph());
}

function revokeSet(urls, api) {
  urls.forEach((url) => api.revokeObjectURL(url));
  urls.clear();
}

function revokeDatasetUrls(context, datasetId) {
  const urls = context.datasetUrls.get(datasetId);
  if (!urls) return;
  revokeSet(urls, context.dependencies.urlApi);
  context.datasetUrls.delete(datasetId);
}

function revokeAttachmentUrls(context) {
  revokeSet(context.attachmentUrls, context.dependencies.urlApi);
}

function replaceAttachmentSet(context, attachmentSet) {
  revokeAttachmentUrls(context);
  context.state = { ...context.state, attachmentSet };
}

function inferredFormat(name, current) {
  const extension = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return ['csv', 'tsv', 'json'].includes(extension) ? extension : current;
}

async function handleFile(context) {
  const file = context.elements['master-file'].files?.[0];
  if (!file) return;
  const requestId = ++context.fileRequestId; context.importRequestId += 1;
  const loaded = await readMasterFile(file, context.dependencies.readMasterFile);
  if (context.disposed || requestId !== context.fileRequestId) return;
  const sourceKind = inferredFormat(loaded.sourceName, context.state.input.sourceKind);
  const input = acceptMasterText(context.state.input, { ...loaded, origin: 'file' });
  context.state = { ...context.state, input: { ...input, sourceKind }, importStatus: 'Ready to import' };
  context.elements['master-text'].value = input.sourceText;
  context.elements['master-format'].value = sourceKind;
  render(context);
}

function handleText(context) {
  context.fileRequestId += 1;
  const origin = context.state.input.pendingPaste ? 'paste' : 'editor';
  const input = acceptMasterText(context.state.input, {
    sourceText: context.elements['master-text'].value, origin,
  });
  context.state = { ...context.state, input, importStatus: 'Ready to import' };
  render(context);
}

function handleFormat(context) {
  const input = { ...context.state.input, sourceKind: context.elements['master-format'].value };
  context.state = { ...context.state, input, importStatus: 'Ready to import' };
  render(context);
}

function handleRole(context) {
  const input = { ...context.state.input, datasetRole: context.elements['master-role'].value };
  context.state = { ...context.state, input, importStatus: 'Ready to import' };
  render(context);
}

function importStale(context, snapshot, requestId) {
  const current = context.state.input;
  return requestId !== context.importRequestId
    || snapshot.revision !== current.revision
    || snapshot.normalizedText !== current.normalizedText
    || snapshot.sourceKind !== current.sourceKind
    || snapshot.datasetRole !== current.datasetRole;
}

async function handleImport(context) {
  const snapshot = context.state.input;
  const requestId = ++context.importRequestId;
  context.state = { ...context.state, importStatus: 'Importing' };
  render(context);
  const createDataset = context.dependencies.createDataset || createMasterDataset;
  let dataset;
  try { dataset = await createDataset(snapshot, context.dependencies); }
  catch (error) {
    if (context.disposed || importStale(context, snapshot, requestId)) return;
    context.state = { ...context.state, importStatus: 'Import failed', importValidation: { ok: false, errors: [error.message], warnings: [] } };
    render(context); return;
  }
  if (context.disposed || importStale(context, snapshot, requestId)) return;
  if (!dataset.validation.ok) {
    context.state = { ...context.state, importStatus: 'Invalid', importValidation: dataset.validation };
    render(context); return;
  }
  const result = addMasterDataset(context.state.registry, dataset);
  const warning = result.duplicate ? [`Dataset ${dataset.datasetId} is already registered.`] : [];
  context.state = {
    ...context.state, registry: result.registry, selectedDatasetId: dataset.datasetId,
    selectedRowId: '', page: 0, importStatus: result.duplicate ? 'Duplicate ignored' : 'Imported',
    importValidation: { ok: true, errors: [], warnings: warning },
  };
  render(context);
}

function handleDatasetSelect(context, event) {
  const datasetId = event.target?.dataset?.datasetId;
  if (!datasetId) return;
  context.state = { ...context.state, selectedDatasetId: datasetId, selectedRowId: '', page: 0 };
  context.elements['master-search'].value = '';
  context.state = { ...context.state, filter: '' };
  render(context);
}

function handlePreviewSelect(context, event) {
  const rowId = event.target?.dataset?.rowId;
  if (!rowId) return;
  context.state = { ...context.state, selectedRowId: rowId }; render(context);
}

function handleSearch(context) {
  context.state = { ...context.state, filter: context.elements['master-search'].value, page: 0 };
  render(context);
}

function handlePage(context, direction) {
  context.state = { ...context.state, page: Math.max(0, context.state.page + direction) };
  render(context);
}

function download(context, text, name, targetSet) {
  const blob = new context.dependencies.BlobCtor([text], { type: 'application/json' });
  const url = context.dependencies.urlApi.createObjectURL(blob);
  targetSet.add(url);
  context.dependencies.triggerDownload(url, name);
}

function datasetDownloadName(dataset) {
  const stem = String(dataset.sourceName || 'master').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-');
  return `${stem || 'master'}.master-dataset.json`;
}

function handleDatasetDownload(context) {
  const dataset = currentDataset(context);
  if (!dataset?.validation.ok) return;
  revokeDatasetUrls(context, dataset.datasetId);
  const urls = new Set(); context.datasetUrls.set(dataset.datasetId, urls);
  download(context, serializeMasterDataset(dataset), datasetDownloadName(dataset), urls);
}

function detachDataset(context, datasetId) {
  if (!context.state.attachmentSet) return;
  const next = detachMasterDataset(context.state.attachmentSet, context.getGraph(), context.state.registry, datasetId);
  replaceAttachmentSet(context, next);
}

function handleRemove(context) {
  const dataset = currentDataset(context);
  if (!dataset) return;
  detachDataset(context, dataset.datasetId);
  const result = removeMasterDataset(context.state.registry, dataset.datasetId);
  revokeDatasetUrls(context, dataset.datasetId);
  const selectedDatasetId = result.registry.datasets[0]?.datasetId || '';
  context.state = { ...context.state, registry: result.registry, selectedDatasetId, selectedRowId: '', page: 0 };
  render(context);
}

function handleAttach(context) {
  const dataset = currentDataset(context);
  const graph = context.getGraph();
  if (!dataset?.validation.ok || !graph?.validation?.ok) return;
  const base = context.state.attachmentSet || createMasterAttachmentSet(graph, [], context.state.registry);
  const attached = base.attachments.some((item) => item.datasetId === dataset.datasetId);
  const next = attached
    ? detachMasterDataset(base, graph, context.state.registry, dataset.datasetId)
    : attachMasterDataset(base, graph, context.state.registry, dataset);
  replaceAttachmentSet(context, next);
  render(context);
}

function handleAttachmentDownload(context) {
  const attachmentSet = context.state.attachmentSet;
  if (!attachmentSet?.validation.ok) return;
  revokeAttachmentUrls(context);
  download(context, serializeMasterAttachmentSet(attachmentSet), 'master-attachment-set.json', context.attachmentUrls);
}

function handleRegistryClear(context) {
  context.datasetUrls.forEach((_, datasetId) => revokeDatasetUrls(context, datasetId));
  revokeAttachmentUrls(context);
  context.state = {
    ...context.state, registry: createMasterRegistry(), selectedDatasetId: '', selectedRowId: '',
    attachmentSet: null, page: 0, filter: '', importStatus: 'Registry cleared',
  };
  context.elements['master-search'].value = '';
  render(context);
}

function bindListeners(context) {
  const e = context.elements;
  addListener(context, e['master-file'], 'change', () => handleFile(context));
  addListener(context, e['master-text'], 'paste', () => { context.state = { ...context.state, input: { ...context.state.input, pendingPaste: true } }; });
  addListener(context, e['master-text'], 'input', () => handleText(context));
  addListener(context, e['master-format'], 'change', () => handleFormat(context));
  addListener(context, e['master-role'], 'change', () => handleRole(context));
  addListener(context, e['master-import'], 'click', () => handleImport(context));
  addListener(context, e['master-dataset-list'], 'click', (event) => handleDatasetSelect(context, event));
  addListener(context, e['master-preview-body'], 'click', (event) => handlePreviewSelect(context, event));
  addListener(context, e['master-search'], 'input', () => handleSearch(context));
  addListener(context, e['master-prev'], 'click', () => handlePage(context, -1));
  addListener(context, e['master-next'], 'click', () => handlePage(context, 1));
  addListener(context, e['master-download'], 'click', () => handleDatasetDownload(context));
  addListener(context, e['master-remove'], 'click', () => handleRemove(context));
  addListener(context, e['master-attach'], 'click', () => handleAttach(context));
  addListener(context, e['master-attachment-download'], 'click', () => handleAttachmentDownload(context));
  addListener(context, e['master-registry-clear'], 'click', () => handleRegistryClear(context));
}

export function syncMasterRegistryGraph(context, graph) {
  const nextIdentity = graphIdentity(graph);
  if (context.state.graphIdentity === nextIdentity) { render(context); return; }
  revokeAttachmentUrls(context);
  context.state = { ...context.state, graphIdentity: nextIdentity, attachmentSet: null };
  render(context);
}

export function createMasterRegistryController(elements, dependencies, getGraph) {
  const context = {
    elements, dependencies, getGraph, listeners: [], datasetUrls: new Map(), attachmentUrls: new Set(),
    state: initialState(), disposed: false, fileRequestId: 0, importRequestId: 0,
  };
  if (!elements['master-format'].value) elements['master-format'].value = context.state.input.sourceKind;
  if (!elements['master-role'].value) elements['master-role'].value = context.state.input.datasetRole;
  bindListeners(context);
  render(context);
  return {
    getState: () => context.state,
    syncGraph: (graph) => syncMasterRegistryGraph(context, graph),
    cleanup() {
      if (context.disposed) return;
      context.disposed = true; context.fileRequestId += 1; context.importRequestId += 1;
      removeListeners(context);
      context.datasetUrls.forEach((_, datasetId) => revokeDatasetUrls(context, datasetId));
      revokeAttachmentUrls(context);
    },
  };
}
