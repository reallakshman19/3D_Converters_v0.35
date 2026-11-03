import { _xmlCiiLineListKeys } from './xml-cii-adapted-preview-diagnostics-audit.js';
import { resolveBranchLineKeySuggestion } from './xml-cii-adapted-branch-line-map-panel.js';
import { xmlCiiEnrichedConfigFromState } from './xml-cii-adapted-state.js';
import { replaceModeAState } from './xml-cii-adapted-mode-a-state.js';
import {
  createModeASourceProcessingRef,
  modeAExecutionRows,
  modeARawRef,
  modeARawState,
} from './xml-cii-adapted-mode-a-propagation.js';
import {
  buildModeAPreviewFillPlan,
  buildModeAProjectDataMatchPlan,
  modeAPreviewFillRule,
} from './xml-cii-adapted-mode-a-bulk-preview.js';
import {
  applyModeAProcessReferenceToConfig,
  buildModeAProcessReferencePlan,
  modeAProcessReferenceFields,
  modeAProcessReferenceFromConfig,
  modeAProcessReferenceTargetGroups,
} from './xml-cii-adapted-mode-a-process-reference.js?v=20260814-preview-tools-1';

const FIELD_COLUMNS = Object.freeze({
  material: 7,
  rating: 8,
  materialCode: 9,
  p1: 10,
  hydroPressure: 11,
  t1: 12,
  t2: 13,
  t3: 14,
  density: 15,
  wallThickness: 16,
  corrosion: 17,
});

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

function setProcess(config, lineKey, field, value) {
  if (!text(lineKey)) return;
  const overrides = ensureObject(config, 'overrides');
  const processData = ensureObject(overrides, 'processData');
  const row = ensureObject(processData, lineKey);
  row[field] = value;
}

function applyFillChange(config, change) {
  const overrides = ensureObject(config, 'overrides');
  if (['p1', 'hydroPressure', 't1', 't2', 't3', 'density'].includes(change.field)) {
    setProcess(config, change.lineKey, change.field, change.value);
    return;
  }
  if (change.field === 'material') {
    ensureObject(overrides, 'material')[change.lineKey || change.branchName] = change.value;
    return;
  }
  if (change.field === 'rating') {
    ensureObject(overrides, 'rating')[change.ratingKey] = change.value;
    setProcess(config, change.lineKey, 'rating', change.value);
    return;
  }
  if (change.field === 'materialCode') {
    ensureObject(overrides, 'materialCode')[change.materialCodeKey] = change.value;
    return;
  }
  if (change.field === 'wallThickness') {
    ensureObject(overrides, 'wallThickness')[change.wallThicknessKey] = change.value;
    return;
  }
  if (change.field === 'corrosion') {
    ensureObject(overrides, 'corrosion')[change.corrosionKey] = change.value;
  }
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

function restoreUndo(stateRef) {
  const raw = modeARawState(stateRef);
  const undo = raw.modeAConsolidatedPreviewUndo;
  if (!undo?.snapshots?.length) return false;
  for (const snapshot of undo.snapshots) {
    const ref = createModeASourceProcessingRef(stateRef, snapshot.sourceId);
    const current = ref.current;
    ref.current = {
      ...current,
      supportConfigJson: snapshot.supportConfigJson || '{}',
    };
  }
  const latest = modeARawState(stateRef);
  replaceModeAState(modeARawRef(stateRef), { ...latest, modeAConsolidatedPreviewUndo: null });
  return true;
}

function requestRebuild(panel) {
  const button = panel.querySelector('[data-mode-a-consolidated-build="preview"]');
  button?.click();
}

function applyFillPlan(panel, result, stateRef, sourceRow, field) {
  const plan = buildModeAPreviewFillPlan(result.rows || [], sourceRow, field);
  if (!plan.changes.length) return false;
  const message = `Fill ${field} = ${plan.value} to ${plan.changes.length} ${plan.rule?.label || 'similar'} row(s)?\n\nExisting exact/master/manual values will be kept.`;
  if (typeof confirm === 'function' && !confirm(message)) return false;
  const snapshots = sourceSnapshots(stateRef, plan.changes.map((row) => row.sourceId));
  const bySource = new Map();
  for (const change of plan.changes) {
    if (!bySource.has(change.sourceId)) bySource.set(change.sourceId, []);
    bySource.get(change.sourceId).push(change);
  }
  for (const [sourceId, changes] of bySource.entries()) {
    persistSourceConfig(stateRef, sourceId, (config) => changes.forEach((change) => applyFillChange(config, change)));
  }
  setUndo(stateRef, `Fill ${field} (${plan.rule?.label || 'similar'})`, snapshots);
  requestRebuild(panel);
  return true;
}

function projectLineKeys(stateRef) {
  const out = {};
  for (const { source, state } of modeAExecutionRows(stateRef)) {
    out[source.sourceId] = _xmlCiiLineListKeys(xmlCiiEnrichedConfigFromState(state));
  }
  return out;
}

function applyProjectPlan(panel, stateRef, plan) {
  if (!plan.changes.length) return false;
  const snapshots = sourceSnapshots(stateRef, plan.changes.map((row) => row.sourceId));
  const bySource = new Map();
  for (const change of plan.changes) {
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
  setUndo(stateRef, `Branch → Line mapping (${plan.changes.length} branches)`, snapshots);
  requestRebuild(panel);
  return true;
}

function applyManualLineMapping(panel, stateRef, row, lineKey) {
  const sourceId = text(row.sourceId);
  const branchName = text(row.branchName);
  const key = text(lineKey);
  if (!sourceId || !branchName || !key) return false;
  const snapshots = sourceSnapshots(stateRef, [sourceId]);
  persistSourceConfig(stateRef, sourceId, (config) => {
    const linelist = ensureObject(config, 'linelist');
    ensureObject(linelist, 'branchLineKeyMap')[branchName] = key;
  });
  setUndo(stateRef, `Map ${branchName} → ${key}`, snapshots);
  requestRebuild(panel);
  return true;
}

function processReferenceForRow(stateRef, row) {
  const sourceId = text(row.sourceId);
  const lineKey = text(row.lineKey);
  if (!sourceId || !lineKey) return null;
  const ref = createModeASourceProcessingRef(stateRef, sourceId);
  return modeAProcessReferenceFromConfig(parseSupportConfig(ref.current.supportConfigJson), lineKey);
}

function applyProcessReferencePlan(panel, stateRef, plan) {
  if (!plan.changes.length || !Object.keys(plan.values || {}).length) return false;
  const snapshots = sourceSnapshots(stateRef, plan.changes.map((change) => change.sourceId));
  for (const change of plan.changes) {
    persistSourceConfig(stateRef, change.sourceId, (config) => applyModeAProcessReferenceToConfig(config, change));
  }
  setUndo(stateRef, `Process Reference ${plan.sourceLineKey} → ${plan.targetLineKey}`, snapshots);
  requestRebuild(panel);
  return true;
}

function styleSmallButton(button, primary = false, warning = false) {
  Object.assign(button.style, {
    padding: '4px 8px',
    border: `1px solid ${warning ? '#d97706' : (primary ? '#2563eb' : '#475569')}`,
    borderRadius: '5px',
    background: warning ? '#3a240f' : (primary ? '#1d4ed8' : '#172033'),
    color: warning ? '#fde68a' : '#e2e8f0',
    cursor: 'pointer',
    fontSize: '10px',
    whiteSpace: 'nowrap',
  });
}

function styleDialog(dialog) {
  Object.assign(dialog.style, {
    width: 'min(760px, 92vw)',
    maxHeight: '82vh',
    overflow: 'auto',
    padding: '16px',
    border: '1px solid #475569',
    borderRadius: '10px',
    background: '#0b1220',
    color: '#e2e8f0',
  });
}

function dialogRow(labelText, control) {
  const row = document.createElement('label');
  Object.assign(row.style, { display: 'grid', gridTemplateColumns: '180px minmax(0,1fr)', gap: '10px', alignItems: 'center', margin: '9px 0' });
  const label = document.createElement('strong');
  label.textContent = labelText;
  row.append(label, control);
  return row;
}

function openDialog(dialog) {
  document.body.appendChild(dialog);
  const cleanup = () => dialog.remove();
  dialog.addEventListener('close', cleanup, { once: true });
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.remove();
}

function openLineMappingDialog(panel, stateRef, row) {
  const keys = (projectLineKeys(stateRef)[text(row.sourceId)] || []).map(text).filter(Boolean).sort();
  if (!keys.length) {
    if (typeof alert === 'function') alert('No Line List keys are loaded for this XML source.');
    return;
  }
  const dialog = document.createElement('dialog');
  styleDialog(dialog);
  const title = document.createElement('h3');
  title.textContent = 'Branch → Line Mapping';
  const note = document.createElement('p');
  note.className = 'xml-cii-phase-help';
  note.textContent = 'This changes only the branch-to-project-line identity for this XML source. It does not copy process data.';
  const branch = document.createElement('div');
  branch.textContent = text(row.branchName);
  branch.style.wordBreak = 'break-all';
  const select = document.createElement('select');
  Object.assign(select.style, { width: '100%', padding: '7px', background: '#111827', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '5px' });
  select.appendChild(new Option('Select project Line Key…', ''));
  for (const key of keys) select.appendChild(new Option(key, key));
  if (keys.includes(text(row.lineKey))) select.value = text(row.lineKey);
  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  styleSmallButton(cancel);
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.textContent = 'Apply Mapping';
  styleSmallButton(apply, true);
  cancel.addEventListener('click', () => closeDialog(dialog));
  apply.addEventListener('click', () => {
    if (!text(select.value)) return;
    applyManualLineMapping(panel, stateRef, row, select.value);
    closeDialog(dialog);
  });
  actions.append(cancel, apply);
  dialog.append(title, note, dialogRow('Source XML', document.createTextNode(text(row.fileName))), dialogRow('Branch', branch), dialogRow('Project Line Key', select), actions);
  openDialog(dialog);
}

function openProcessReferenceDialog(panel, result, stateRef, sourceRow) {
  const sourceFields = modeAProcessReferenceFields(sourceRow);
  const targets = modeAProcessReferenceTargetGroups(result.rows || [], sourceRow);
  if (!targets.length) {
    if (typeof alert === 'function') alert('No other mapped Line Keys are available as process-reference targets.');
    return;
  }

  const dialog = document.createElement('dialog');
  styleDialog(dialog);
  const title = document.createElement('h3');
  title.textContent = 'Use as Process Reference';
  const note = document.createElement('p');
  note.className = 'xml-cii-phase-help';
  note.textContent = `Source ${text(sourceRow.lineKey)} supplies only selected numeric process fields. The target Line Key remains unchanged.`;

  const sourceSummary = document.createElement('div');
  sourceSummary.textContent = `${text(sourceRow.lineKey)} · ${text(sourceRow.fileName)}`;
  const targetSelect = document.createElement('select');
  Object.assign(targetSelect.style, { width: '100%', padding: '7px', background: '#111827', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '5px' });
  targetSelect.appendChild(new Option('Select target Line Key…', ''));
  for (const group of targets) targetSelect.appendChild(new Option(`${group.lineKey} · ${group.branchCount} branch(es)`, group.lineKey));

  const targetSources = document.createElement('div');
  Object.assign(targetSources.style, { display: 'grid', gap: '5px', padding: '8px', border: '1px solid #334155', borderRadius: '6px' });

  const fields = document.createElement('div');
  Object.assign(fields.style, { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: '7px', padding: '8px', border: '1px solid #334155', borderRadius: '6px' });
  for (const item of sourceFields) {
    const label = document.createElement('label');
    Object.assign(label.style, { display: 'flex', alignItems: 'center', gap: '7px', opacity: item.valid ? '1' : '.6' });
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.dataset.processReferenceField = item.field;
    check.checked = item.valid;
    check.disabled = !item.valid;
    const caption = document.createElement('span');
    caption.textContent = `${item.label}: ${item.rawValue || '—'}${item.valid ? '' : ` ⚠ ${item.reason}`}`;
    label.append(check, caption);
    fields.appendChild(label);
  }

  const updateTargetSources = () => {
    targetSources.innerHTML = '';
    const group = targets.find((item) => item.lineKey === targetSelect.value);
    if (!group) {
      targetSources.textContent = 'Select a target Line Key.';
      return;
    }
    for (const item of group.sources) {
      const label = document.createElement('label');
      Object.assign(label.style, { display: 'flex', alignItems: 'center', gap: '7px' });
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = true;
      check.dataset.processReferenceTargetSource = item.sourceId;
      label.append(check, document.createTextNode(`${item.fileName} · ${item.branchCount} branch(es)`));
      targetSources.appendChild(label);
    }
  };
  targetSelect.addEventListener('change', updateTargetSources);
  updateTargetSources();

  const status = document.createElement('div');
  status.className = 'xml-cii-phase-help';
  Object.assign(status.style, { marginTop: '8px', color: '#93c5fd' });
  status.textContent = 'Target engineering class/material/rating/wall data is not copied.';

  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  styleSmallButton(cancel);
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.textContent = 'Copy Process Data';
  styleSmallButton(apply, true);
  cancel.addEventListener('click', () => closeDialog(dialog));
  apply.addEventListener('click', () => {
    const targetLineKey = text(targetSelect.value);
    const targetSourceIds = [...targetSources.querySelectorAll('[data-process-reference-target-source]:checked')].map((input) => input.dataset.processReferenceTargetSource);
    const selectedFields = [...fields.querySelectorAll('[data-process-reference-field]:checked')].map((input) => input.dataset.processReferenceField);
    const plan = buildModeAProcessReferencePlan(result.rows || [], sourceRow, targetLineKey, targetSourceIds, selectedFields);
    if (!targetLineKey || !targetSourceIds.length || !Object.keys(plan.values || {}).length || !plan.changes.length) {
      status.style.color = '#fca5a5';
      status.textContent = 'Select a target Line Key, at least one target XML, and at least one valid numeric process field.';
      return;
    }
    applyProcessReferencePlan(panel, stateRef, plan);
    closeDialog(dialog);
  });

  actions.append(cancel, apply);
  dialog.append(
    title,
    note,
    dialogRow('Process source', sourceSummary),
    dialogRow('Target Line Key', targetSelect),
    dialogRow('Target XML source(s)', targetSources),
    dialogRow('Fields to inherit', fields),
    status,
    actions,
  );
  openDialog(dialog);
}

function makeToolbar(panel, result, stateRef) {
  const toolbar = document.createElement('div');
  toolbar.dataset.modeAConsolidatedEasyToolbar = 'true';
  Object.assign(toolbar.style, {
    display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap',
    margin: '8px 0 10px', padding: '8px', border: '1px solid #334155', borderRadius: '7px', background: '#0f172a',
  });

  const mappingLabel = document.createElement('strong');
  mappingLabel.textContent = 'Branch → Line Mapping';
  mappingLabel.style.fontSize = '11px';

  const match = document.createElement('button');
  match.type = 'button';
  match.textContent = '🔗 Auto-map Exact';
  match.title = 'Resolve only safe, unambiguous Branch → loaded Line List key matches.';
  styleSmallButton(match, true);

  const undo = document.createElement('button');
  undo.type = 'button';
  undo.textContent = '↶ Undo Last Change';
  styleSmallButton(undo);
  undo.disabled = !modeARawState(stateRef).modeAConsolidatedPreviewUndo;

  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search source / branch / line...';
  Object.assign(search.style, { minWidth: '220px', padding: '5px 8px', background: '#0b1220', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '5px' });

  const source = document.createElement('select');
  Object.assign(source.style, { padding: '5px 8px', background: '#0b1220', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '5px' });
  source.appendChild(new Option('All XML files', ''));
  [...new Map((result.rows || []).map((row) => [row.sourceId, row.fileName])).entries()].forEach(([id, name]) => source.appendChild(new Option(name, id)));

  const status = document.createElement('select');
  Object.assign(status.style, { padding: '5px 8px', background: '#0b1220', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '5px' });
  [['all','All rows'], ['unmapped','Unmapped'], ['defaults','Defaults / gaps'], ['mapped','Mapped']].forEach(([value,label]) => status.appendChild(new Option(label, value)));

  const note = document.createElement('span');
  note.className = 'xml-cii-phase-help';
  note.style.marginLeft = 'auto';
  note.textContent = 'Map… changes line identity. Process Ref… copies selected numeric process fields only; target Line Key stays unchanged.';

  toolbar.append(mappingLabel, match, undo, search, source, status, note);
  panel.querySelector('[data-mode-a-consolidated-build="preview"]')?.closest('div')?.after(toolbar);

  const tableRows = [...panel.querySelectorAll('[data-mode-a-preview-consolidated-row]')];
  const applyFilter = () => {
    const q = text(search.value).toLowerCase();
    for (const tr of tableRows) {
      const rowStatus = tr.dataset.rowStatus;
      const defaultHit = tr.dataset.hasDefault === 'true';
      const statusMatch = status.value === 'all'
        || status.value === rowStatus
        || (status.value === 'defaults' && defaultHit);
      const sourceMatch = !source.value || source.value === tr.dataset.sourceId;
      const searchMatch = !q || (tr.dataset.searchText || '').includes(q);
      tr.style.display = statusMatch && sourceMatch && searchMatch ? '' : 'none';
    }
  };
  search.addEventListener('input', applyFilter);
  source.addEventListener('change', applyFilter);
  status.addEventListener('change', applyFilter);

  undo.addEventListener('click', () => {
    if (!restoreUndo(stateRef)) return;
    requestRebuild(panel);
  });

  match.addEventListener('click', () => {
    toolbar.querySelectorAll('[data-project-match-preview], [data-project-match-apply]').forEach((node) => node.remove());
    const plan = buildModeAProjectDataMatchPlan(result.rows || [], projectLineKeys(stateRef), resolveBranchLineKeySuggestion);
    const preview = document.createElement('span');
    preview.dataset.projectMatchPreview = 'true';
    preview.className = 'xml-cii-phase-help';
    preview.textContent = `${plan.changes.length} safe exact mapping(s) · ${plan.ambiguous.length} ambiguous · ${plan.unmatched.length} unmatched.`;
    toolbar.appendChild(preview);
    if (plan.changes.length) {
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.dataset.projectMatchApply = 'true';
      apply.textContent = `Apply ${plan.changes.length} Exact Mappings`;
      styleSmallButton(apply, true);
      apply.addEventListener('click', () => applyProjectPlan(panel, stateRef, plan));
      toolbar.appendChild(apply);
    }
  });
}

export function installModeAConsolidatedPreviewEasyUi(panel, result, stateRef) {
  const body = panel?.querySelector('[data-mode-a-preview-consolidated-body]');
  if (!body || !Array.isArray(result?.rows)) return false;
  const trs = [...body.querySelectorAll('tr')];
  result.rows.forEach((row, index) => {
    const tr = trs[index];
    if (!tr) return;
    tr.dataset.modeAPreviewConsolidatedRow = 'true';
    tr.dataset.sourceId = row.sourceId || '';
    tr.dataset.rowStatus = row.lineMiss ? 'unmapped' : 'mapped';
    tr.dataset.hasDefault = ['p1','hydroPressure','t1','t2','t3','density','wallThickness','corrosion']
      .some((field) => /default/i.test(text(row?.[`${field}Source`])) ) ? 'true' : 'false';
    tr.dataset.searchText = [row.fileName, row.branchName, row.lineKey, row.pipingClass].map((value) => text(value).toLowerCase()).join(' ');

    const lineCell = tr.children[2];
    if (lineCell) {
      const map = document.createElement('button');
      map.type = 'button';
      map.textContent = row.lineMiss ? 'Map…' : 'Remap…';
      map.title = 'Set the Branch → Project Line Key mapping for this XML source.';
      styleSmallButton(map, false, row.lineMiss);
      map.style.marginLeft = '5px';
      map.addEventListener('click', (event) => {
        event.stopPropagation();
        openLineMappingDialog(panel, stateRef, row);
      });
      lineCell.appendChild(map);

      const fieldInfo = modeAProcessReferenceFields(row);
      if (text(row.lineKey) && fieldInfo.some((item) => item.valid) && modeAProcessReferenceTargetGroups(result.rows, row).length) {
        const process = document.createElement('button');
        process.type = 'button';
        process.textContent = 'Process Ref…';
        process.title = `Use ${text(row.lineKey)} as a process-data reference for another Line Key.`;
        styleSmallButton(process);
        process.style.marginLeft = '5px';
        process.addEventListener('click', (event) => {
          event.stopPropagation();
          openProcessReferenceDialog(panel, result, stateRef, row);
        });
        lineCell.appendChild(process);
      }

      const reference = processReferenceForRow(stateRef, row);
      if (reference?.sourceLineKey) {
        const badge = document.createElement('span');
        badge.textContent = ` REF ← ${reference.sourceLineKey}`;
        badge.title = `Process reference from ${reference.sourceFileName || reference.sourceSourceId || 'source'} · ${(reference.fields || []).join(', ')}`;
        Object.assign(badge.style, { marginLeft: '6px', padding: '2px 5px', borderRadius: '999px', border: '1px solid #2563eb', color: '#93c5fd', background: '#0f2344', fontSize: '9px', whiteSpace: 'nowrap' });
        lineCell.appendChild(badge);
      }
    }

    for (const [field, columnIndex] of Object.entries(FIELD_COLUMNS)) {
      const plan = buildModeAPreviewFillPlan(result.rows, row, field);
      if (!plan.changes.length || !modeAPreviewFillRule(field)) continue;
      const cell = tr.children[columnIndex];
      if (!cell) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '↓';
      button.title = `Fill ${plan.changes.length} ${plan.rule.label} unresolved/default row(s) with ${plan.value}. Exact/master/manual values are kept.`;
      styleSmallButton(button);
      button.style.marginLeft = '5px';
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        applyFillPlan(panel, result, stateRef, row, field);
      });
      cell.appendChild(button);
    }
  });
  makeToolbar(panel, result, stateRef);
  return true;
}
