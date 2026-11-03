export const COMPARISON_PAGE_SIZE = 200;
export const COMPARISON_MATCH_STEP = 200;

function setText(element, value) {
  if (element) element.textContent = value === '' || value == null ? '—' : String(value);
}

function option(documentRef, value, label, selected) {
  const item = documentRef.createElement('option'); item.value = value; item.textContent = label; item.selected = selected;
  return item;
}

function select(documentRef, values, selected, action, index) {
  const element = documentRef.createElement('select'); element.dataset.comparisonAction = action; element.dataset.bindingIndex = String(index);
  element.replaceChildren(...values.map((item) => option(documentRef, item.value, item.label, item.value === selected)));
  return element;
}

function button(documentRef, text, action, index) {
  const element = documentRef.createElement('button'); element.type = 'button'; element.textContent = text;
  element.dataset.comparisonAction = action; element.dataset.bindingIndex = String(index); return element;
}

function checkbox(documentRef, checked, action, index, key = '') {
  const element = documentRef.createElement('input'); element.type = 'checkbox'; element.checked = checked;
  element.dataset.comparisonAction = action; element.dataset.bindingIndex = String(index);
  if (key) element.dataset.normalizationKey = key; return element;
}

function attachedDatasets(upstream) {
  const ids = new Set((upstream?.attachmentSet?.attachments || []).map((item) => item.datasetId));
  return (upstream?.registry?.datasets || []).filter((dataset) => ids.has(dataset.datasetId));
}

function fieldOptions(upstream) {
  const fields = [...new Set((upstream?.ledger?.entries || []).filter((entry) => entry.status === 'candidate').map((entry) => entry.fieldKey))];
  return fields.map((value) => ({ value, label: value }));
}

function datasetOptions(upstream) {
  return attachedDatasets(upstream).map((dataset) => ({ value: dataset.datasetId, label: `${dataset.datasetRole}: ${dataset.sourceName}` }));
}

function columnOptions(upstream, datasetId) {
  const dataset = attachedDatasets(upstream).find((item) => item.datasetId === datasetId);
  return (dataset?.columns || []).map((column) => ({ value: column.columnId, label: column.name }));
}

function normalizationCell(documentRef, draft, index) {
  const wrap = documentRef.createElement('div');
  for (const key of ['unicodeNfc','trim','collapseWhitespace','caseFold']) {
    const label = documentRef.createElement('label'); label.append(checkbox(documentRef, draft.normalization?.[key], 'normalization', index, key), ` ${key}`);
    wrap.append(label);
  }
  return wrap;
}

function bindingRow(elements, draft, index, upstream) {
  const documentRef = elements['comparison-binding-list'].ownerDocument; const row = documentRef.createElement('tr');
  const cells = Array.from({ length: 8 }, () => documentRef.createElement('td'));
  cells[0].append(checkbox(documentRef, draft.enabled, 'enabled', index));
  cells[1].append(select(documentRef, fieldOptions(upstream), draft.fieldKey, 'field', index));
  cells[2].append(select(documentRef, datasetOptions(upstream), draft.datasetId, 'dataset', index));
  cells[3].append(select(documentRef, columnOptions(upstream, draft.datasetId), draft.columnId, 'column', index));
  cells[4].append(select(documentRef, ['strict','text-exact','text-normalized'].map((value) => ({ value, label: value })), draft.comparisonMode, 'mode', index));
  cells[5].append(normalizationCell(documentRef, draft, index));
  cells[6].append(button(documentRef, '↑', 'up', index), button(documentRef, '↓', 'down', index));
  cells[7].append(button(documentRef, 'Remove', 'remove', index)); row.append(...cells); return row;
}

export function renderComparisonBindings(elements, state, upstream) {
  elements['comparison-binding-list'].replaceChildren(...state.bindingDrafts.map((draft, index) => bindingRow(elements, draft, index, upstream)));
}

function filteredRows(state) {
  const results = state.run?.results || []; const unbound = state.run?.unbound || [];
  const rows = state.view === 'unbound' ? unbound.map((item) => ({ ...item, status: 'unbound', matches: [] }))
    : results.filter((item) => item.status === `${state.view}-match` || item.status === state.view);
  const needles = [state.entityFilter,state.fieldFilter,state.datasetFilter,state.search].map((value) => String(value || '').toLowerCase());
  return rows.filter((row) => {
    const text = JSON.stringify(row).toLowerCase();
    return (!needles[0] || String(row.entityId).toLowerCase().includes(needles[0]))
      && (!needles[1] || String(row.fieldKey).toLowerCase().includes(needles[1]))
      && (!needles[2] || String(row.datasetId || '').toLowerCase().includes(needles[2]))
      && (!needles[3] || text.includes(needles[3]));
  });
}

function resultRow(elements, item) {
  const documentRef = elements['comparison-result-list'].ownerDocument; const row = documentRef.createElement('tr');
  row.dataset.comparisonAction = 'select-result'; row.dataset.resultId = item.comparisonResultId || `unbound:${item.candidateId}`;
  const values = [item.sourceOrder,item.entityId,item.fieldKey,JSON.stringify(item.candidateValue),item.datasetId || '',item.status,(item.matches || []).length];
  for (const value of values) { const cell = documentRef.createElement('td'); cell.textContent = value ?? ''; row.append(cell); }
  return row;
}

function renderDiagnostics(elements, state) {
  const findings = [...(state.config?.validation?.errors || []), ...(state.run?.validation?.errors || [])];
  elements['comparison-result-list'].replaceChildren(...findings.map((text, index) => resultRow(elements, {
    sourceOrder: index, entityId: '', fieldKey: '', candidateValue: text, datasetId: '', status: 'diagnostic', matches: [], comparisonResultId: `diagnostic:${index}`,
  })));
  setText(elements['comparison-visible-count'], findings.length);
}

export function renderComparisonResults(elements, state) {
  if (state.view === 'diagnostics') { renderDiagnostics(elements, state); return; }
  const rows = filteredRows(state); const start = state.page * COMPARISON_PAGE_SIZE; const visible = rows.slice(start, start + COMPARISON_PAGE_SIZE);
  elements['comparison-result-list'].replaceChildren(...visible.map((item) => resultRow(elements, item)));
  setText(elements['comparison-visible-count'], `${visible.length} of ${rows.length}`);
  elements['comparison-prev'].disabled = state.page === 0;
  elements['comparison-next'].disabled = start + COMPARISON_PAGE_SIZE >= rows.length;
}

function findingItems(element, values) {
  const documentRef = element.ownerDocument; const items = (values.length ? values : ['None']).map((text) => {
    const item = documentRef.createElement('li'); item.textContent = text; return item;
  });
  element.replaceChildren(...items);
}

export function renderComparisonDetails(elements, state) {
  const selected = (state.run?.results || []).find((item) => item.comparisonResultId === state.selectedResultId);
  elements['comparison-details'].textContent = selected ? JSON.stringify(selected, null, 2) : 'None';
  const matches = selected?.matches || []; const visible = matches.slice(0, state.matchLimit);
  const documentRef = elements['comparison-match-list'].ownerDocument;
  elements['comparison-match-list'].replaceChildren(...visible.map((match) => {
    const row = documentRef.createElement('tr');
    [match.rowId,match.rowSourceOrder,JSON.stringify(match.masterValue),JSON.stringify(match.normalizedMasterValue)].forEach((value) => {
      const cell = documentRef.createElement('td'); cell.textContent = value ?? ''; row.append(cell);
    });
    return row;
  }));
  elements['comparison-match-more'].disabled = visible.length >= matches.length;
}

export function renderComparisonPanel(elements, state, upstream) {
  renderComparisonBindings(elements, state, upstream); renderComparisonResults(elements, state); renderComparisonDetails(elements, state);
  const summary = state.run?.summary || {};
  setText(elements['comparison-status'], state.status); setText(elements['comparison-config-id'], state.config?.bindingConfigId);
  setText(elements['comparison-run-id'], state.run?.comparisonRunId);
  [['comparison-count','comparisonCount'],['comparison-unique-count','uniqueMatchCount'],['comparison-multiple-count','multipleMatchCount'],
    ['comparison-unmatched-count','unmatchedCount'],['comparison-unbound-count','unboundCandidateCount']]
    .forEach(([id, key]) => setText(elements[id], summary[key] || 0));
  findingItems(elements['comparison-errors'], [...(state.config?.validation?.errors || []), ...(state.run?.validation?.errors || [])]);
  findingItems(elements['comparison-warnings'], [...(state.config?.validation?.warnings || []), ...(state.run?.validation?.warnings || [])]);
}
