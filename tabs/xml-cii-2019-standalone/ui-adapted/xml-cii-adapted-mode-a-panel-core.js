import { createElement } from './xml-cii-adapted-dom.js?v=20260804-mode-a-v1';
import { buildModeAPreflight, normalizeModeABatchState } from '../xml-cii-mode-a-batch.js?v=20260804-mode-a-v1';

function text(value) { return value === undefined || value === null ? '' : String(value); }

function button(label, action, sourceId = '') {
  const control = createElement('button', label);
  control.type = 'button';
  control.dataset.modeAAction = action;
  if (sourceId) control.dataset.modeASourceId = sourceId;
  if (control.style) Object.assign(control.style, {
    padding: '5px 9px', borderRadius: '5px', border: '1px solid #475569',
    background: '#172033', color: '#dbeafe', cursor: 'pointer', fontSize: '11px',
  });
  return control;
}

function badge(label, kind = 'info') {
  const span = createElement('span', label);
  const palette = kind === 'bad'
    ? ['#7f1d1d', '#fee2e2', '#ef4444']
    : kind === 'warn'
      ? ['#78350f', '#fef3c7', '#f59e0b']
      : ['#1e3a8a', '#dbeafe', '#2563eb'];
  if (span.style) Object.assign(span.style, { color: palette[0], background: palette[1], border: `1px solid ${palette[2]}`, borderRadius: '999px', padding: '2px 7px', fontSize: '10px' });
  return span;
}

function sourceRow(source, activeId) {
  const tr = createElement('tr');
  const enabledCell = createElement('td');
  const enabled = createElement('input');
  enabled.type = 'checkbox';
  enabled.checked = source.enabled !== false;
  enabled.dataset.modeAEnable = source.sourceId;
  enabledCell.appendChild(enabled);

  const sourceCell = createElement('td');
  const name = createElement('strong', source.alias || source.fileName);
  const meta = createElement('div', `${source.fileName} · ${source.sourceId}`, 'xml-cii-phase-help');
  sourceCell.append(name, meta);

  const selectedBranchCount = source.branchSelection?.selectedBranchOccurrenceIds?.length
    ?? source.branchSelection?.selectedBranchNames?.length
    ?? 0;
  const branchCell = createElement('td', `${selectedBranchCount}/${source.metrics?.branchCount || 0}`);
  const nodeCell = createElement('td', String(source.metrics?.nodeCount || 0));
  const stagedCell = createElement('td', source.stagedJsonText ? 'Paired' : 'Not paired');
  const conflictCell = createElement('td');
  const conflicts = [];
  if (source.metrics?.duplicateBranchNames?.length) conflicts.push(`${source.metrics.duplicateBranchNames.length} repeated branch name(s) aliased by occurrence`);
  if (source.metrics?.duplicateNodesWithinBranch?.length) conflicts.push(`${source.metrics.duplicateNodesWithinBranch.length} duplicate node-in-branch occurrence`);
  if (source.metrics?.duplicateNodeNumbers?.length) conflicts.push(`${source.metrics.duplicateNodeNumbers.length} repeated node number(s)`);
  const hasBlockingConflict = source.metrics?.duplicateNodesWithinBranch?.length > 0;
  conflictCell.appendChild(badge(conflicts.length ? conflicts.join(' · ') : 'None', hasBlockingConflict ? 'bad' : (conflicts.length ? 'warn' : 'info')));

  const actions = createElement('td');
  const select = button(source.sourceId === activeId ? 'Active' : 'Open', 'activate', source.sourceId);
  select.disabled = source.sourceId === activeId;
  const remove = button('Remove', 'remove', source.sourceId);
  actions.append(select, document.createTextNode(' '), remove);
  for (const cell of [enabledCell, sourceCell, branchCell, nodeCell, stagedCell, conflictCell, actions]) {
    if (cell.style) Object.assign(cell.style, { padding: '7px', borderBottom: '1px solid #273449', verticalAlign: 'top' });
    tr.appendChild(cell);
  }
  if (source.sourceId === activeId && tr.style) tr.style.background = 'rgba(37,99,235,.10)';
  return tr;
}

export function renderModeASourceInventory(parent, stateRef) {
  const state = normalizeModeABatchState(stateRef.current);
  const batch = state.sourceBatch;
  const sources = Array.isArray(batch?.sources) ? batch.sources : [];
  const panel = createElement('section', '', 'model-converters-workflow-master-card xml-cii-mode-a-panel');
  panel.dataset.modeAPanel = 'source-inventory';
  if (panel.style) Object.assign(panel.style, { marginTop: '12px', padding: '12px', border: '1px solid #334155', borderRadius: '8px' });
  panel.append(
    createElement('div', 'Multiple XML — Separate Models (Mode A)', 'model-converters-workflow-section-title'),
    createElement('div', 'Each enabled XML is processed independently. Repeated Branchname text is isolated by branch occurrence; original engineering names are preserved.', 'model-converters-workflow-detail-note'),
  );
  const input = parent.querySelector?.('[data-field="source-file"]');
  if (input) {
    input.multiple = true;
    input.accept = '.xml,.XML';
    input.title = 'Select one or more PSI116 XML files. Each file remains a separate model.';
  }
  if (!sources.length) {
    panel.appendChild(createElement('div', 'Choose one or more XML files above. Duplicate file content will be skipped.', 'xml-cii-phase-help'));
    parent.appendChild(panel);
    return;
  }
  const tableWrap = createElement('div');
  if (tableWrap.style) tableWrap.style.overflow = 'auto';
  const table = createElement('table');
  if (table.style) Object.assign(table.style, { width: '100%', borderCollapse: 'collapse', fontSize: '11px' });
  const head = createElement('thead');
  const hr = createElement('tr');
  for (const label of ['Use', 'Source', 'Branches', 'Nodes', 'Staged JSON', 'Conflicts', 'Actions']) {
    const th = createElement('th', label);
    if (th.style) Object.assign(th.style, { padding: '7px', textAlign: 'left', borderBottom: '1px solid #475569' });
    hr.appendChild(th);
  }
  head.appendChild(hr);
  const body = createElement('tbody');
  for (const source of sources) body.appendChild(sourceRow(source, batch.activeSourceId));
  table.append(head, body);
  tableWrap.appendChild(table);
  panel.appendChild(tableWrap);

  const preflight = buildModeAPreflight(batch);
  const summary = createElement('div', '', 'model-converters-workflow-detail-note');
  summary.append(
    document.createTextNode(`${preflight.enabledSourceCount}/${preflight.sourceCount} files enabled · ${preflight.branchCount} branch occurrences · ${preflight.nodeCount} nodes · `),
    badge(`${preflight.duplicateBranchesAcrossFiles.length} duplicate branch names across files`, preflight.duplicateBranchesAcrossFiles.length ? 'warn' : 'info'),
    document.createTextNode(' '),
    badge(`${preflight.duplicateNodesAcrossFiles.length} duplicate node numbers across files`, preflight.duplicateNodesAcrossFiles.length ? 'warn' : 'info'),
  );
  panel.appendChild(summary);
  if (batch.importStatus) panel.appendChild(createElement('div', batch.importStatus, 'xml-cii-phase-help'));
  if (preflight.blockingRows.length) {
    const errors = createElement('div', preflight.blockingRows.map((row) => row.message).join(' | '), 'model-converters-workflow-detail-note');
    if (errors.style) Object.assign(errors.style, { color: '#7f1d1d', background: '#fff1f2', borderColor: '#ef4444' });
    panel.appendChild(errors);
  }
  parent.appendChild(panel);
}

function artifactButton(row, kind, label) {
  const control = button(label, 'download-batch-artifact', row.sourceId);
  control.dataset.modeAArtifact = kind;
  const value = kind === 'enriched' ? row.result?.enrichedText
    : kind === 'cii' ? row.result?.ciiText
      : kind === 'diagnostics' ? row.result?.diagnostics
        : row.sourceManifest;
  control.disabled = value == null || value === '';
  return control;
}

export function renderModeABatchResults(parent, state = {}) {
  const batchResult = state.batchRunResult;
  if (!batchResult?.sources?.length) return;
  const panel = createElement('section', '', 'xml-cii-weight-panel');
  panel.dataset.modeAPanel = 'batch-results';
  panel.appendChild(createElement('h3', 'Mode A Batch Results — Separate Models'));
  panel.appendChild(createElement('div', `${batchResult.summary?.succeeded || 0} succeeded · ${batchResult.summary?.failed || 0} failed · ${batchResult.summary?.blocked || 0} blocked · ${batchResult.sources.length} inspected`, 'model-converters-workflow-detail-note'));
  const downloadManifest = button('Download Batch Manifest', 'download-batch-manifest');
  panel.appendChild(downloadManifest);
  const table = createElement('table');
  if (table.style) Object.assign(table.style, { width: '100%', borderCollapse: 'collapse', marginTop: '10px', fontSize: '11px' });
  const head = createElement('thead');
  const hr = createElement('tr');
  for (const label of ['Source', 'Selected branches', 'Status', 'Artifacts']) hr.appendChild(createElement('th', label));
  head.appendChild(hr);
  const body = createElement('tbody');
  for (const row of batchResult.sources) {
    const tr = createElement('tr');
    const source = createElement('td', row.fileName);
    const selected = createElement('td', String(row.selectedBranchCount || 0));
    const status = createElement('td', row.status + (row.error ? `: ${row.error}` : ''));
    const actions = createElement('td');
    actions.append(
      artifactButton(row, 'enriched', 'Enriched XML'), document.createTextNode(' '),
      artifactButton(row, 'cii', 'CII'), document.createTextNode(' '),
      artifactButton(row, 'diagnostics', 'Diagnostics'), document.createTextNode(' '),
      artifactButton(row, 'manifest', 'Manifest'),
    );
    for (const cell of [source, selected, status, actions]) {
      if (cell.style) Object.assign(cell.style, { padding: '7px', borderBottom: '1px solid #273449', verticalAlign: 'top' });
      tr.appendChild(cell);
    }
    body.appendChild(tr);
  }
  table.append(head, body);
  panel.appendChild(table);
  parent.appendChild(panel);
}

export function modeABatchArtifactValue(batchResult, sourceId, kind) {
  const row = batchResult?.sources?.find((item) => item.sourceId === sourceId);
  if (!row) return null;
  if (kind === 'enriched') return { name: row.result?.enrichedName || `${row.alias}.enriched.xml`, text: row.result?.enrichedText || '', mime: 'application/xml;charset=utf-8' };
  if (kind === 'cii') return { name: row.result?.ciiName || `${row.alias}.cii`, text: row.result?.ciiText || '', mime: 'text/plain;charset=utf-8' };
  if (kind === 'diagnostics') return { name: `${row.alias}.diagnostics.json`, text: JSON.stringify(row.result?.diagnostics || {}, null, 2), mime: 'application/json;charset=utf-8' };
  if (kind === 'manifest') return { name: `${row.alias}.manifest.json`, text: JSON.stringify(row.sourceManifest || {}, null, 2), mime: 'application/json;charset=utf-8' };
  return null;
}
