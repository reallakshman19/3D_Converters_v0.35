import { summarizeMasterDataset } from './master-dataset.js';

export const MASTER_PREVIEW_LIMIT = 200;

function setText(element, value) {
  if (element) element.textContent = value === '' || value == null ? '—' : String(value);
}

function renderFindings(list, findings) {
  if (!list) return;
  const values = findings?.length ? findings : ['None'];
  list.replaceChildren(...values.map((text) => {
    const item = list.ownerDocument.createElement('li');
    item.textContent = text;
    return item;
  }));
}

function selectedDataset(state) {
  return state.registry.datasets.find((dataset) => dataset.datasetId === state.selectedDatasetId) || null;
}

function datasetButton(elements, dataset, selected) {
  const button = elements['master-dataset-list'].ownerDocument.createElement('button');
  button.type = 'button';
  button.dataset.datasetId = dataset.datasetId;
  button.className = `uew-master-dataset${selected ? ' is-selected' : ''}`;
  const status = dataset.validation.ok ? 'Valid' : 'Invalid';
  button.textContent = `${dataset.datasetRole} · ${dataset.sourceName} · ${dataset.summary.rowCount}×${dataset.summary.columnCount} · ${status} · ${dataset.datasetId} · ${dataset.contentHash.slice(0, 12)}`;
  return button;
}

function renderDatasetList(elements, state) {
  const buttons = state.registry.datasets.map((dataset) => datasetButton(elements, dataset, dataset.datasetId === state.selectedDatasetId));
  elements['master-dataset-list'].replaceChildren(...buttons);
  if (!buttons.length) setText(elements['master-dataset-list'], 'No datasets registered.');
}

function searchableRows(dataset, filter) {
  if (!dataset) return [];
  const query = String(filter || '').trim().toLowerCase();
  if (!query) return dataset.rows;
  return dataset.rows.filter((row) => Object.values(row.values).some((value) => String(value ?? '').toLowerCase().includes(query)));
}

function previewSlice(dataset, filter, page) {
  const rows = searchableRows(dataset, filter);
  const pageCount = Math.max(1, Math.ceil(rows.length / MASTER_PREVIEW_LIMIT));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const start = safePage * MASTER_PREVIEW_LIMIT;
  return { rows, visible: rows.slice(start, start + MASTER_PREVIEW_LIMIT), safePage, pageCount, start };
}

function renderPreviewHeader(elements, dataset) {
  const row = elements['master-preview-head'].ownerDocument.createElement('div');
  row.className = 'uew-master-row uew-master-head-row';
  dataset.columns.forEach((column) => {
    const cell = row.ownerDocument.createElement('span');
    cell.textContent = column.name || '(empty header)';
    row.appendChild(cell);
  });
  elements['master-preview-head'].replaceChildren(row);
}

function renderPreviewRows(elements, dataset, slice, selectedRowId) {
  const documentRef = elements['master-preview-body'].ownerDocument;
  const rows = slice.visible.map((record) => {
    const row = documentRef.createElement('button');
    row.type = 'button'; row.className = `uew-master-row${record.rowId === selectedRowId ? ' is-selected' : ''}`; row.dataset.rowId = record.rowId;
    dataset.columns.forEach((column) => {
      const cell = documentRef.createElement('span');
      cell.textContent = String(record.values[column.columnId] ?? '');
      row.appendChild(cell);
    });
    return row;
  });
  elements['master-preview-body'].replaceChildren(...rows);
  if (!rows.length) setText(elements['master-preview-body'], 'No rows match the current search.');
}

function renderPreview(elements, state, dataset) {
  if (!dataset) {
    elements['master-preview-head'].replaceChildren();
    elements['master-preview-body'].replaceChildren();
    setText(elements['master-preview-count'], '0 of 0');
    elements['master-prev'].disabled = true; elements['master-next'].disabled = true;
    return;
  }
  const slice = previewSlice(dataset, state.filter, state.page);
  renderPreviewHeader(elements, dataset);
  renderPreviewRows(elements, dataset, slice, state.selectedRowId);
  setText(elements['master-preview-count'], `${slice.visible.length} of ${slice.rows.length} · page ${slice.safePage + 1}/${slice.pageCount}`);
  elements['master-prev'].disabled = slice.safePage === 0;
  elements['master-next'].disabled = slice.safePage >= slice.pageCount - 1;
}

function renderDetails(elements, state, dataset) {
  if (!dataset) { setText(elements['master-details'], 'Select a dataset to inspect.'); return; }
  const summary = summarizeMasterDataset(dataset);
  const selectedRow = dataset.rows.find((row) => row.rowId === state.selectedRowId) || null;
  const columns = dataset.columns.map((column) => ({
    columnId: column.columnId, name: column.name, sourceOrder: column.sourceOrder,
    inferredValueType: column.inferredValueType,
  }));
  elements['master-details'].textContent = JSON.stringify({ ...summary, columns, selectedRow }, null, 2);
}

function renderAttachments(elements, state, graph) {
  const attachments = state.attachmentSet?.attachments || [];
  const documentRef = elements['master-attachment-list'].ownerDocument;
  const rows = attachments.map((attachment) => {
    const item = documentRef.createElement('div');
    item.textContent = `${attachment.attachmentOrder + 1}. ${attachment.datasetRole} · ${attachment.datasetId}`;
    return item;
  });
  elements['master-attachment-list'].replaceChildren(...rows);
  if (!rows.length) setText(elements['master-attachment-list'], graph?.validation?.ok ? 'No datasets attached.' : 'Build a valid source graph to attach datasets.');
  const validation = state.attachmentSet?.validation || { ok: false, errors: [], warnings: [] };
  setText(elements['master-attachment-status'], state.attachmentSet ? (validation.ok ? 'Valid' : 'Invalid') : 'Not created');
  renderFindings(elements['master-attachment-errors'], validation.errors || []);
  renderFindings(elements['master-attachment-warnings'], validation.warnings || []);
}

function actionState(elements, state, dataset, graph) {
  const attached = state.attachmentSet?.attachments?.some((item) => item.datasetId === dataset?.datasetId);
  elements['master-download'].disabled = !dataset?.validation?.ok;
  elements['master-remove'].disabled = !dataset;
  elements['master-attach'].disabled = !dataset?.validation?.ok || !graph?.validation?.ok;
  elements['master-attach'].textContent = attached ? 'Detach from Graph' : 'Attach to Graph';
  elements['master-attachment-download'].disabled = !state.attachmentSet?.validation?.ok;
  elements['master-registry-clear'].disabled = state.registry.datasets.length === 0;
}

export function renderMasterRegistryPanel(elements, state, graph) {
  const dataset = selectedDataset(state);
  setText(elements['master-import-status'], state.importStatus);
  renderFindings(elements['master-errors'], state.importValidation.errors || []);
  renderFindings(elements['master-warnings'], state.importValidation.warnings || []);
  renderDatasetList(elements, state);
  renderDetails(elements, state, dataset);
  renderPreview(elements, state, dataset);
  renderAttachments(elements, state, graph);
  actionState(elements, state, dataset, graph);
}
