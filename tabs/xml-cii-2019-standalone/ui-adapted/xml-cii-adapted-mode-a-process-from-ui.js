import { replaceModeAState } from './xml-cii-adapted-mode-a-state.js';
import {
  createModeASourceProcessingRef,
  modeARawRef,
  modeARawState,
} from './xml-cii-adapted-mode-a-propagation.js';
import {
  applyModeAProcessFromReferenceToConfig,
  buildModeAProcessFromPlan,
  clearModeAProcessFromReference,
  modeAProcessFromFields,
  modeAProcessFromReferenceFromConfig,
  modeAProcessFromSourceChoices,
} from './xml-cii-adapted-mode-a-process-from.js?v=20260814-process-from-1';

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

function requestRebuild(panel) {
  panel.querySelector('[data-mode-a-consolidated-build="preview"]')?.click();
}

function sourceSnapshot(stateRef, sourceId) {
  const ref = createModeASourceProcessingRef(stateRef, sourceId);
  return { sourceId, supportConfigJson: ref.current.supportConfigJson || '{}' };
}

function setUndo(stateRef, label, snapshot) {
  const rawRef = modeARawRef(stateRef);
  const current = modeARawState(rawRef);
  replaceModeAState(rawRef, {
    ...current,
    modeAConsolidatedPreviewUndo: {
      label,
      snapshots: [snapshot],
      createdAt: new Date().toISOString(),
    },
  });
}

function persistTargetConfig(stateRef, sourceId, mutate) {
  const ref = createModeASourceProcessingRef(stateRef, sourceId);
  const current = ref.current;
  const config = parseSupportConfig(current.supportConfigJson);
  mutate(config);
  ref.current = {
    ...current,
    supportConfigJson: JSON.stringify(config, null, 2),
  };
}

function currentReference(stateRef, targetRow) {
  const sourceId = text(targetRow?.sourceId);
  const lineKey = text(targetRow?.lineKey);
  if (!sourceId || !lineKey) return null;
  const ref = createModeASourceProcessingRef(stateRef, sourceId);
  return modeAProcessFromReferenceFromConfig(parseSupportConfig(ref.current.supportConfigJson), lineKey);
}

function sourceIdentity(choice) {
  return `${text(choice?.sourceId)}::${text(choice?.lineKey)}`;
}

function openProcessFromDialog(panel, result, stateRef, targetRow) {
  if (targetRow?.lineMiss === true || !text(targetRow?.lineKey)) {
    if (typeof alert === 'function') alert('Map this branch to a project Line Key before assigning Process From.');
    return;
  }

  const choices = modeAProcessFromSourceChoices(result.rows || [], targetRow);
  if (!choices.length) {
    if (typeof alert === 'function') alert('No other mapped line is available as a process-data source.');
    return;
  }

  const existing = currentReference(stateRef, targetRow);
  const dialog = document.createElement('dialog');
  Object.assign(dialog.style, {
    width: 'min(780px, 94vw)', maxHeight: '86vh', overflow: 'auto', padding: '16px',
    border: '1px solid #475569', borderRadius: '10px', background: '#0b1220', color: '#e2e8f0',
  });

  const title = document.createElement('h3');
  title.textContent = 'Process From';
  const note = document.createElement('p');
  note.className = 'xml-cii-phase-help';
  note.textContent = 'The current mapped line is the fixed target. Choose only the source line to take process data FROM. Selecting a new source replaces the previous Process From reference; branch-to-line mapping is not changed.';

  const targetBox = document.createElement('div');
  Object.assign(targetBox.style, { padding: '9px', border: '1px solid #334155', borderRadius: '6px', background: '#0f172a', marginBottom: '10px' });
  targetBox.innerHTML = `<strong>Current target:</strong> ${text(targetRow.lineKey)} &nbsp; <span style="color:#94a3b8">${text(targetRow.fileName)}</span>`;

  const currentBox = document.createElement('div');
  Object.assign(currentBox.style, { padding: '7px 9px', borderRadius: '6px', marginBottom: '10px', background: existing ? '#172554' : '#111827', color: existing ? '#bfdbfe' : '#94a3b8' });
  currentBox.textContent = existing
    ? `Current Process From: ${text(existing.sourceLineKey)} · ${text(existing.sourceFileName) || text(existing.sourceSourceId)}`
    : 'Current Process From: none — own mapped-line process data is used.';

  const sourceLabel = document.createElement('label');
  sourceLabel.textContent = 'Process From (source)';
  Object.assign(sourceLabel.style, { display: 'grid', gap: '5px', fontWeight: '700', marginBottom: '10px' });
  const sourceSelect = document.createElement('select');
  Object.assign(sourceSelect.style, { width: '100%', padding: '7px', background: '#111827', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '5px' });
  sourceSelect.appendChild(new Option('Select mapped source line…', ''));
  for (const choice of choices) {
    sourceSelect.appendChild(new Option(`${choice.lineKey} · ${choice.fileName}`, sourceIdentity(choice)));
  }
  sourceLabel.appendChild(sourceSelect);

  const fieldTitle = document.createElement('strong');
  fieldTitle.textContent = 'Fields to take from source';
  const fields = document.createElement('div');
  Object.assign(fields.style, {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '7px',
    padding: '8px', border: '1px solid #334155', borderRadius: '6px', marginTop: '6px',
  });

  const status = document.createElement('div');
  status.className = 'xml-cii-phase-help';
  Object.assign(status.style, { minHeight: '20px', marginTop: '8px', color: '#93c5fd' });

  function selectedChoice() {
    return choices.find((choice) => sourceIdentity(choice) === sourceSelect.value) || null;
  }

  function renderFields() {
    fields.replaceChildren();
    const choice = selectedChoice();
    if (!choice) {
      const empty = document.createElement('span');
      empty.textContent = 'Select a source line to inspect available process values.';
      empty.style.color = '#94a3b8';
      fields.appendChild(empty);
      return;
    }
    const currentFields = new Set(existing?.fields || []);
    for (const item of modeAProcessFromFields(choice.row)) {
      const label = document.createElement('label');
      Object.assign(label.style, { display: 'flex', gap: '7px', alignItems: 'center', opacity: item.valid ? '1' : '.55' });
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.dataset.processFromField = item.field;
      check.disabled = !item.valid;
      check.checked = item.valid && (
        !existing
        || sourceIdentity(choice) !== `${text(existing.sourceSourceId)}::${text(existing.sourceLineKey)}`
        || currentFields.has(item.field)
      );
      const caption = document.createElement('span');
      caption.textContent = `${item.label}: ${item.rawValue || '—'}${item.valid ? '' : ` ⚠ ${item.reason}`}`;
      label.append(check, caption);
      fields.appendChild(label);
    }
  }

  if (existing) {
    const wanted = `${text(existing.sourceSourceId)}::${text(existing.sourceLineKey)}`;
    if ([...sourceSelect.options].some((option) => option.value === wanted)) sourceSelect.value = wanted;
  }
  sourceSelect.addEventListener('change', () => {
    renderFields();
    status.textContent = '';
  });
  renderFields();

  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '14px' });
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Use Own Line Data';
  styleButton(clear, { warning: Boolean(existing) });
  clear.disabled = !existing;
  clear.title = 'Clear the Process From reference. The mapped line remains unchanged and its own project process data will resolve again.';

  const right = document.createElement('div');
  Object.assign(right.style, { display: 'flex', gap: '8px' });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  styleButton(cancel);
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.textContent = existing ? 'Replace Process From' : 'Apply Process From';
  styleButton(apply, { primary: true });
  right.append(cancel, apply);
  actions.append(clear, right);

  cancel.addEventListener('click', () => closeDialog(dialog));
  clear.addEventListener('click', () => {
    if (!existing) return;
    const targetSourceId = text(targetRow.sourceId);
    const targetLineKey = text(targetRow.lineKey);
    const message = `Clear Process From ${text(existing.sourceLineKey)} for ${targetLineKey}?\n\nThe branch mapping stays ${targetLineKey}; own mapped-line process data will be used.`;
    if (typeof confirm === 'function' && !confirm(message)) return;
    const snapshot = sourceSnapshot(stateRef, targetSourceId);
    persistTargetConfig(stateRef, targetSourceId, (config) => clearModeAProcessFromReference(config, targetLineKey));
    setUndo(stateRef, `Clear Process From for ${targetLineKey}`, snapshot);
    closeDialog(dialog);
    requestRebuild(panel);
  });

  apply.addEventListener('click', () => {
    const choice = selectedChoice();
    if (!choice) {
      status.style.color = '#fca5a5';
      status.textContent = 'Select a mapped source line.';
      return;
    }
    const selectedFields = [...fields.querySelectorAll('[data-process-from-field]:checked')].map((input) => input.dataset.processFromField);
    const plan = buildModeAProcessFromPlan(
      result.rows || [],
      targetRow,
      choice.sourceId,
      choice.lineKey,
      selectedFields,
    );
    if (!plan.valid || !plan.change) {
      status.style.color = '#fca5a5';
      status.textContent = plan.reason || 'Unable to apply Process From.';
      return;
    }
    const invalidText = plan.invalidFields.length
      ? `\n${plan.invalidFields.length} selected invalid field(s) will not be copied.`
      : '';
    const confirmText = `${plan.targetLineKey} (${plan.targetFileName}) will take ${plan.change.fields.join(', ')} FROM ${plan.sourceLineKey} (${plan.sourceFileName}).${existing ? `\nExisting Process From ${text(existing.sourceLineKey)} will be replaced.` : ''}${invalidText}`;
    if (typeof confirm === 'function' && !confirm(confirmText)) return;

    const snapshot = sourceSnapshot(stateRef, plan.targetSourceId);
    persistTargetConfig(stateRef, plan.targetSourceId, (config) => applyModeAProcessFromReferenceToConfig(config, plan.change));
    setUndo(stateRef, `Process From ${plan.sourceLineKey} → ${plan.targetLineKey}`, snapshot);
    closeDialog(dialog);
    requestRebuild(panel);
  });

  dialog.append(title, note, targetBox, currentBox, sourceLabel, fieldTitle, fields, status, actions);
  openDialog(dialog);
}

function replaceProcessReferenceButtons(panel, result, stateRef) {
  const rows = [...panel.querySelectorAll('[data-mode-a-preview-consolidated-row]')];
  (result.rows || []).forEach((row, index) => {
    const tr = rows[index];
    const cell = tr?.children?.[2];
    if (!cell) return;

    [...cell.querySelectorAll('button')].forEach((button) => {
      if (/^Process\s*Ref/i.test(text(button.textContent))) button.remove();
    });

    if (row?.lineMiss === true || !text(row?.lineKey)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Process From…';
    button.title = `Keep ${text(row.lineKey)} as the mapped target and choose only the process-data source line.`;
    styleButton(button, { compact: true });
    button.style.marginLeft = '5px';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openProcessFromDialog(panel, result, stateRef, row);
    });
    cell.appendChild(button);
  });
}

export function installModeAProcessFromUi(panel, result, stateRef) {
  if (!panel || !Array.isArray(result?.rows)) return false;
  replaceProcessReferenceButtons(panel, result, stateRef);
  return true;
}
