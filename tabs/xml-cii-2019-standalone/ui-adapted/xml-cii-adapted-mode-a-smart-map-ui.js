import { _xmlCiiLineListKeys } from './xml-cii-adapted-preview-diagnostics-audit.js';
import { xmlCiiEnrichedConfigFromState } from './xml-cii-adapted-state.js';
import { replaceModeAState } from './xml-cii-adapted-mode-a-state.js';
import {
  createModeASourceProcessingRef,
  modeAExecutionRows,
  modeARawRef,
  modeARawState,
} from './xml-cii-adapted-mode-a-propagation.js';
import {
  buildModeASmartMapChanges,
  buildModeASmartMapGroups,
  modeASmartMapGroupForRow,
  modeASmartMapSummary,
} from './xml-cii-adapted-mode-a-smart-map.js?v=20260814-smart-map-1';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function parseSupportConfig(value) {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function ensureObject(parent, key) {
  if (!parent[key] || typeof parent[key] !== 'object' || Array.isArray(parent[key])) parent[key] = {};
  return parent[key];
}

function projectLineKeys(stateRef) {
  const out = {};
  for (const { source, state } of modeAExecutionRows(stateRef)) {
    out[source.sourceId] = _xmlCiiLineListKeys(xmlCiiEnrichedConfigFromState(state));
  }
  return out;
}

function sourceSnapshots(stateRef, sourceIds) {
  return [...new Set(sourceIds)].map((sourceId) => {
    const ref = createModeASourceProcessingRef(stateRef, sourceId);
    return { sourceId, supportConfigJson: ref.current.supportConfigJson || '{}' };
  });
}

function persistSourceConfig(stateRef, sourceId, mutate) {
  const ref = createModeASourceProcessingRef(stateRef, sourceId);
  const current = ref.current;
  const config = parseSupportConfig(current.supportConfigJson);
  mutate(config);
  ref.current = {
    ...current,
    supportConfigJson: JSON.stringify(config, null, 2),
  };
}

function setUndo(stateRef, label, snapshots) {
  const rawRef = modeARawRef(stateRef);
  const current = modeARawState(rawRef);
  replaceModeAState(rawRef, {
    ...current,
    modeAConsolidatedPreviewUndo: { label, snapshots, createdAt: new Date().toISOString() },
  });
}

function requestRebuild(panel) {
  panel.querySelector('[data-mode-a-consolidated-build="preview"]')?.click();
}

function styleButton(button, { primary = false, warning = false, compact = false } = {}) {
  Object.assign(button.style, {
    padding: compact ? '3px 6px' : '5px 9px',
    border: `1px solid ${warning ? '#d97706' : (primary ? '#2563eb' : '#475569')}`,
    borderRadius: '5px',
    background: warning ? '#3a240f' : (primary ? '#1d4ed8' : '#172033'),
    color: warning ? '#fde68a' : '#e2e8f0',
    cursor: 'pointer',
    fontSize: compact ? '10px' : '11px',
    whiteSpace: 'nowrap',
  });
}

function openDialog(dialog) {
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.remove();
}

function statusStyle(status) {
  if (status === 'exact') return { label: '✓ EXACT', color: '#34d399', border: '#059669', background: '#052e25' };
  if (status === 'similar') return { label: '◇ SIMILAR', color: '#93c5fd', border: '#2563eb', background: '#0f2344' };
  if (status === 'conflict') return { label: '⚠ CONFLICT', color: '#fbbf24', border: '#d97706', background: '#3a240f' };
  return { label: '? UNRESOLVED', color: '#cbd5e1', border: '#64748b', background: '#1e293b' };
}

function makeBadge(status) {
  const style = statusStyle(status);
  const badge = document.createElement('span');
  badge.textContent = style.label;
  Object.assign(badge.style, {
    display: 'inline-block', padding: '2px 6px', borderRadius: '999px',
    border: `1px solid ${style.border}`, color: style.color, background: style.background,
    fontSize: '9px', fontWeight: '700', whiteSpace: 'nowrap',
  });
  return badge;
}

function branchShortList(group) {
  const labels = group.branchLabels || [];
  if (labels.length <= 5) return labels.join(' ');
  return `${labels.slice(0, 5).join(' ')} +${labels.length - 5}`;
}

function candidateSummary(group) {
  const candidates = group.candidates || [];
  if (!candidates.length) return 'No ranked candidate';
  return candidates.slice(0, 3).map((item) => {
    if (item.basis === 'exact') return `${item.key} · exact`;
    if (item.basis === 'existing-sibling') return `${item.key} · sibling`;
    return `${item.key} · ${Math.round(Number(item.score || 0) * 100)}%`;
  }).join(' | ');
}

function buildDatalist(keysBySource) {
  const datalist = document.createElement('datalist');
  datalist.id = `mode-a-smart-map-${Math.random().toString(36).slice(2, 9)}`;
  const all = [...new Set(Object.values(keysBySource || {}).flat().map(text).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const key of all) datalist.appendChild(new Option(key, key));
  return datalist;
}

function applySmartSelections(panel, stateRef, keysBySource, selections) {
  const allChanges = [];
  const invalid = [];
  for (const selection of selections) {
    const plan = buildModeASmartMapChanges(selection.group, selection.lineKey, keysBySource);
    if (!plan.valid) {
      invalid.push(`${selection.group.fileName} / ${selection.group.lineHint || selection.group.family}: ${plan.reason}`);
      continue;
    }
    allChanges.push(...plan.changes);
  }
  if (invalid.length) return { applied: false, invalid, branchCount: 0 };
  if (!allChanges.length) return { applied: false, invalid: ['No mappings selected.'], branchCount: 0 };

  const snapshots = sourceSnapshots(stateRef, allChanges.map((change) => change.sourceId));
  const bySource = new Map();
  for (const change of allChanges) {
    if (!bySource.has(change.sourceId)) bySource.set(change.sourceId, []);
    bySource.get(change.sourceId).push(change);
  }
  for (const [sourceId, changes] of bySource.entries()) {
    persistSourceConfig(stateRef, sourceId, (config) => {
      const linelist = ensureObject(config, 'linelist');
      const map = ensureObject(linelist, 'branchLineKeyMap');
      for (const change of changes) map[change.branchName] = change.lineKey;
    });
  }
  setUndo(stateRef, `Smart Map ${selections.length} line group(s) / ${allChanges.length} branch(es)`, snapshots);
  requestRebuild(panel);
  return { applied: true, invalid: [], branchCount: allChanges.length };
}

function openSmartMapWorkbench(panel, result, stateRef, requestedGroupKey = '') {
  const keysBySource = projectLineKeys(stateRef);
  const allGroups = buildModeASmartMapGroups(result.rows || [], keysBySource);
  const groups = requestedGroupKey
    ? allGroups.filter((group) => group.groupKey === requestedGroupKey)
    : allGroups.filter((group) => group.unmappedCount > 0);
  if (!groups.length) {
    if (typeof alert === 'function') alert(requestedGroupKey ? 'No Smart Map group is available for this row.' : 'No unmapped line groups remain.');
    return;
  }

  const summary = modeASmartMapSummary(requestedGroupKey ? groups.map((group) => ({ ...group, unmappedCount: Math.max(1, group.unmappedCount) })) : groups);
  const dialog = document.createElement('dialog');
  Object.assign(dialog.style, {
    width: 'min(1240px, 96vw)', maxHeight: '88vh', overflow: 'auto', padding: '16px',
    border: '1px solid #475569', borderRadius: '10px', background: '#0b1220', color: '#e2e8f0',
  });

  const titleRow = document.createElement('div');
  Object.assign(titleRow.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' });
  const title = document.createElement('h3');
  title.textContent = requestedGroupKey ? '✨ Smart Map — Line Group' : '✨ Smart Map — Unmapped Lines';
  const overview = document.createElement('div');
  overview.className = 'xml-cii-phase-help';
  overview.textContent = requestedGroupKey
    ? `${groups[0].branchCount} branch occurrence(s) in ${groups[0].fileName}`
    : `${summary.groupCount} unmapped line group(s) · ${summary.branchCount} unmapped branch occurrence(s)`;
  titleRow.append(title, overview);

  const note = document.createElement('p');
  note.className = 'xml-cii-phase-help';
  note.textContent = 'Smart Map proposes project Line Keys but does not write anything until Apply Selected. Exact suggestions may be bulk-selected; Similar and Conflict rows always require engineer selection.';

  const counters = document.createElement('div');
  Object.assign(counters.style, { display: 'flex', gap: '7px', flexWrap: 'wrap', marginBottom: '10px' });
  [['✓ Exact', summary.exact], ['◇ Similar', summary.similar], ['⚠ Conflict', summary.conflict], ['? Unresolved', summary.unresolved]].forEach(([label, value]) => {
    const span = document.createElement('span');
    span.textContent = `${label}: ${value}`;
    Object.assign(span.style, { padding: '3px 7px', border: '1px solid #475569', borderRadius: '999px', fontSize: '10px', background: '#111827' });
    counters.appendChild(span);
  });

  const controls = document.createElement('div');
  Object.assign(controls.style, { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', margin: '8px 0' });
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search source / line / branch...';
  Object.assign(search.style, { minWidth: '240px', padding: '6px 8px', background: '#111827', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '5px' });
  const sourceFilter = document.createElement('select');
  Object.assign(sourceFilter.style, { padding: '6px 8px', background: '#111827', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '5px' });
  sourceFilter.appendChild(new Option('All XML files', ''));
  [...new Map(groups.map((group) => [group.sourceId, group.fileName])).entries()].forEach(([id, name]) => sourceFilter.appendChild(new Option(name, id)));
  const statusFilter = document.createElement('select');
  Object.assign(statusFilter.style, { padding: '6px 8px', background: '#111827', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '5px' });
  [['all', 'All confidence'], ['exact', 'Exact'], ['similar', 'Similar'], ['conflict', 'Conflict'], ['unresolved', 'Unresolved']].forEach(([value, label]) => statusFilter.appendChild(new Option(label, value)));

  const acceptExact = document.createElement('button');
  acceptExact.type = 'button';
  acceptExact.textContent = 'Accept All Exact';
  styleButton(acceptExact, { primary: true });
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Reset Suggestions';
  styleButton(reset);
  controls.append(search, sourceFilter, statusFilter, acceptExact, reset);

  const datalist = buildDatalist(keysBySource);
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { overflow: 'auto', maxHeight: '52vh', border: '1px solid #334155', borderRadius: '7px' });
  const table = document.createElement('table');
  Object.assign(table.style, { width: '100%', minWidth: '1120px', borderCollapse: 'collapse', fontSize: '10px' });
  const thead = document.createElement('thead');
  const head = document.createElement('tr');
  ['Use', 'Source XML', 'Line / Branch Family', 'Branches', 'Existing Mapping', 'Smart Evidence', 'Map To'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    Object.assign(th.style, { position: 'sticky', top: '0', zIndex: '2', padding: '8px', textAlign: 'left', background: '#0f172a', borderBottom: '1px solid #475569', whiteSpace: 'nowrap' });
    head.appendChild(th);
  });
  thead.appendChild(head);
  const tbody = document.createElement('tbody');
  const rowRecords = [];

  for (const group of groups) {
    const tr = document.createElement('tr');
    tr.dataset.groupKey = group.groupKey;
    tr.dataset.sourceId = group.sourceId;
    tr.dataset.status = group.status;
    tr.dataset.searchText = [group.fileName, group.family, group.lineHint, ...(group.branchNames || []), ...(group.existingMappings || [])].map((value) => text(value).toLowerCase()).join(' ');
    Object.assign(tr.style, { borderBottom: '1px solid #1e293b' });

    const selectCell = document.createElement('td');
    selectCell.style.padding = '8px';
    const use = document.createElement('input');
    use.type = 'checkbox';
    use.dataset.smartMapUse = group.groupKey;
    selectCell.appendChild(use);

    const sourceCell = document.createElement('td');
    sourceCell.textContent = group.fileName || group.sourceId;
    sourceCell.style.padding = '8px';

    const familyCell = document.createElement('td');
    familyCell.style.padding = '8px';
    const line = document.createElement('strong');
    line.textContent = group.lineHint || group.family || 'Unknown line';
    const family = document.createElement('div');
    family.textContent = group.family;
    Object.assign(family.style, { color: '#94a3b8', marginTop: '2px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
    family.title = group.family;
    familyCell.append(line, family);

    const branchCell = document.createElement('td');
    branchCell.style.padding = '8px';
    branchCell.textContent = `${branchShortList(group)} (${group.branchCount})`;
    branchCell.title = (group.branchNames || []).join('\n');

    const existingCell = document.createElement('td');
    existingCell.style.padding = '8px';
    existingCell.textContent = group.existingMappings.length ? group.existingMappings.join(', ') : '—';
    if (group.status === 'conflict' && group.existingMappings.length) existingCell.style.color = '#fbbf24';

    const evidenceCell = document.createElement('td');
    evidenceCell.style.padding = '8px';
    const badge = makeBadge(group.status);
    const reason = document.createElement('div');
    reason.textContent = group.reason;
    Object.assign(reason.style, { marginTop: '4px', maxWidth: '310px' });
    const alternatives = document.createElement('div');
    alternatives.textContent = candidateSummary(group);
    Object.assign(alternatives.style, { marginTop: '3px', color: '#94a3b8' });
    evidenceCell.append(badge, reason, alternatives);

    const mapCell = document.createElement('td');
    mapCell.style.padding = '8px';
    const mapRow = document.createElement('div');
    Object.assign(mapRow.style, { display: 'flex', alignItems: 'center', gap: '5px' });
    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('list', datalist.id);
    input.value = group.recommended || '';
    input.placeholder = 'Search project Line Key...';
    input.dataset.smartMapValue = group.groupKey;
    Object.assign(input.style, { width: '180px', padding: '5px 7px', background: '#111827', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '5px' });
    const useSmart = document.createElement('button');
    useSmart.type = 'button';
    useSmart.textContent = '✨';
    useSmart.title = group.recommended ? `Adopt Smart Map suggestion ${group.recommended}` : 'No Smart Map suggestion is available; choose a project Line Key manually.';
    styleButton(useSmart, { warning: group.status === 'conflict', compact: true });
    useSmart.disabled = !group.recommended;
    useSmart.addEventListener('click', () => {
      input.value = group.recommended || '';
      use.checked = Boolean(group.recommended);
      updateApplyLabel();
    });
    input.addEventListener('input', () => {
      if (text(input.value)) use.checked = true;
      updateApplyLabel();
    });
    use.addEventListener('change', updateApplyLabel);
    mapRow.append(input, useSmart);
    mapCell.appendChild(mapRow);

    tr.append(selectCell, sourceCell, familyCell, branchCell, existingCell, evidenceCell, mapCell);
    tbody.appendChild(tr);
    rowRecords.push({ group, tr, use, input });
  }
  table.append(thead, tbody);
  wrap.appendChild(table);

  const statusBox = document.createElement('div');
  statusBox.className = 'xml-cii-phase-help';
  Object.assign(statusBox.style, { minHeight: '18px', marginTop: '8px', color: '#93c5fd' });

  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px' });
  const left = document.createElement('div');
  left.className = 'xml-cii-phase-help';
  left.textContent = 'Applying a line group writes the selected Line Key to all branch occurrences in that source group, including an existing conflicting sibling mapping.';
  const actionButtons = document.createElement('div');
  Object.assign(actionButtons.style, { display: 'flex', gap: '8px' });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  styleButton(cancel);
  const apply = document.createElement('button');
  apply.type = 'button';
  styleButton(apply, { primary: true });
  actionButtons.append(cancel, apply);
  actions.append(left, actionButtons);

  function selectedRecords() {
    return rowRecords.filter((record) => record.use.checked);
  }
  function updateApplyLabel() {
    const selected = selectedRecords();
    const branches = selected.reduce((sum, record) => sum + record.group.branchCount, 0);
    apply.textContent = selected.length ? `Apply Selected ${selected.length} Line(s) / ${branches} Branch(es)` : 'Apply Selected';
  }
  function filterRows() {
    const q = text(search.value).toLowerCase();
    for (const record of rowRecords) {
      const sourceOk = !sourceFilter.value || sourceFilter.value === record.group.sourceId;
      const statusOk = statusFilter.value === 'all' || statusFilter.value === record.group.status;
      const searchOk = !q || (record.tr.dataset.searchText || '').includes(q);
      record.tr.style.display = sourceOk && statusOk && searchOk ? '' : 'none';
    }
  }

  search.addEventListener('input', filterRows);
  sourceFilter.addEventListener('change', filterRows);
  statusFilter.addEventListener('change', filterRows);
  acceptExact.addEventListener('click', () => {
    for (const record of rowRecords) {
      if (record.group.status !== 'exact' || !record.group.recommended) continue;
      record.input.value = record.group.recommended;
      record.use.checked = true;
    }
    updateApplyLabel();
    statusBox.style.color = '#93c5fd';
    statusBox.textContent = `Selected ${rowRecords.filter((record) => record.group.status === 'exact').length} exact line group(s). Similar/Conflict rows remain unselected.`;
  });
  reset.addEventListener('click', () => {
    for (const record of rowRecords) {
      record.input.value = record.group.recommended || '';
      record.use.checked = false;
    }
    updateApplyLabel();
    statusBox.textContent = '';
  });
  cancel.addEventListener('click', () => closeDialog(dialog));
  apply.addEventListener('click', () => {
    const selected = selectedRecords();
    if (!selected.length) {
      statusBox.style.color = '#fca5a5';
      statusBox.textContent = 'Select at least one line group.';
      return;
    }
    const invalid = selected.filter((record) => !text(record.input.value));
    if (invalid.length) {
      statusBox.style.color = '#fca5a5';
      statusBox.textContent = `${invalid.length} selected line group(s) do not have a target project Line Key.`;
      return;
    }
    const branchCount = selected.reduce((sum, record) => sum + record.group.branchCount, 0);
    const sourceCount = new Set(selected.map((record) => record.group.sourceId)).size;
    const conflictCount = selected.filter((record) => record.group.status === 'conflict').length;
    const confirmText = [
      `Apply Smart Map to ${selected.length} line group(s), ${branchCount} branch occurrence(s), ${sourceCount} XML source(s)?`,
      conflictCount ? `\n${conflictCount} selected group(s) are CONFLICT rows; their existing sibling mappings will be updated to your selected Line Key.` : '',
    ].join('');
    if (typeof confirm === 'function' && !confirm(confirmText)) return;
    const resultApply = applySmartSelections(panel, stateRef, keysBySource, selected.map((record) => ({ group: record.group, lineKey: text(record.input.value) })));
    if (!resultApply.applied) {
      statusBox.style.color = '#fca5a5';
      statusBox.textContent = resultApply.invalid.join(' | ');
      return;
    }
    closeDialog(dialog);
  });

  updateApplyLabel();
  dialog.append(titleRow, note, counters, controls, datalist, wrap, statusBox, actions);
  openDialog(dialog);
}

function replaceToolbarMappingAction(panel, result, stateRef, groups) {
  const toolbar = panel.querySelector('[data-mode-a-consolidated-easy-toolbar]');
  if (!toolbar) return;
  [...toolbar.querySelectorAll('button')].forEach((button) => {
    if (/Auto-map Exact/i.test(button.textContent || '')) button.remove();
  });
  const label = [...toolbar.querySelectorAll('strong')].find((node) => /Branch\s*→\s*Line Mapping/i.test(node.textContent || ''));
  if (label) label.textContent = 'Smart Branch → Line Mapping';
  const unmapped = groups.filter((group) => group.unmappedCount > 0);
  const smart = document.createElement('button');
  smart.type = 'button';
  smart.textContent = `✨ Smart Map Unmapped (${unmapped.length})`;
  smart.title = 'Review all unmapped line groups together, including exact, similar, conflict and unresolved suggestions.';
  styleButton(smart, { primary: true });
  smart.disabled = !unmapped.length;
  smart.addEventListener('click', () => openSmartMapWorkbench(panel, result, stateRef));
  if (label?.nextSibling) toolbar.insertBefore(smart, label.nextSibling);
  else toolbar.prepend(smart);

  const note = [...toolbar.querySelectorAll('.xml-cii-phase-help')].find((node) => /Map… changes line identity/i.test(node.textContent || ''));
  if (note) note.textContent = '✨ Smart Map reviews line groups in bulk. Process Ref… remains a separate process-data inheritance action.';
}

function replaceRowMappingActions(panel, result, stateRef, groups) {
  const rows = [...panel.querySelectorAll('[data-mode-a-preview-consolidated-row]')];
  (result.rows || []).forEach((row, index) => {
    const tr = rows[index];
    const cell = tr?.children?.[2];
    if (!cell) return;
    [...cell.querySelectorAll('button')].forEach((button) => {
      if (/^(Map…|Remap…)$/i.test(text(button.textContent))) button.remove();
    });
    const group = modeASmartMapGroupForRow(groups, row);
    if (!group) return;
    const smart = document.createElement('button');
    smart.type = 'button';
    smart.textContent = '✨';
    smart.title = `Smart Map this line group: ${group.status.toUpperCase()} · ${group.reason}`;
    styleButton(smart, { warning: group.status === 'conflict', compact: true });
    smart.style.marginLeft = '5px';
    smart.addEventListener('click', (event) => {
      event.stopPropagation();
      openSmartMapWorkbench(panel, result, stateRef, group.groupKey);
    });
    cell.appendChild(smart);
  });
}

export function installModeASmartMapUi(panel, result, stateRef) {
  if (!panel || !Array.isArray(result?.rows)) return false;
  const keysBySource = projectLineKeys(stateRef);
  const groups = buildModeASmartMapGroups(result.rows, keysBySource);
  replaceToolbarMappingAction(panel, result, stateRef, groups);
  replaceRowMappingActions(panel, result, stateRef, groups);
  return true;
}
