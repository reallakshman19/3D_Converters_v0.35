import {
  _classSizeKey,
  _dtxrWallCandidateForRow,
  _dtxrWallCandidateIndex,
  xmlCiiDryRunPreview,
} from './xml-cii-adapted-preview-dryrun.js';
import { applyPreviewDtxrRatingOverrides } from './xml-cii-adapted-preview-rating-fetch.js';
import { xmlCiiEnrichedConfigFromState } from './xml-cii-adapted-state.js';
import { replaceModeAState } from './xml-cii-adapted-mode-a-state.js';
import {
  createModeASourceProcessingRef,
  modeAExecutionRows,
  modeARawRef,
  modeARawState,
} from './xml-cii-adapted-mode-a-propagation.js';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function parseConfig(value) {
  try { return object(JSON.parse(String(value || '{}'))); } catch { return {}; }
}

function ensureObject(parent, key) {
  if (!parent[key] || typeof parent[key] !== 'object' || Array.isArray(parent[key])) parent[key] = {};
  return parent[key];
}

function sourceSnapshots(stateRef, sourceIds) {
  return [...new Set(sourceIds)].map((sourceId) => {
    const ref = createModeASourceProcessingRef(stateRef, sourceId);
    return { sourceId, supportConfigJson: ref.current.supportConfigJson || '{}' };
  });
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

function previewRowsForExecution(entry) {
  const config = xmlCiiEnrichedConfigFromState(entry.state);
  const result = xmlCiiDryRunPreview(
    entry.state.sourceText || '',
    config,
    entry.state.stagedJsonText || '',
  ) || {};
  return Array.isArray(result.branchRows) ? result.branchRows : [];
}

function markWallManual(overrides, key) {
  const fill = ensureObject(overrides, '__previewFillDown');
  const wall = ensureObject(fill, 'wallThickness');
  wall[key] = { fillState: 'manual', fillSource: null };
}

export function applyModeAConsolidatedDtxrWall(stateRef) {
  const executions = modeAExecutionRows(stateRef);
  const snapshots = sourceSnapshots(stateRef, executions.map((entry) => entry.source.sourceId));
  let applied = 0;
  let available = 0;
  let sourceCount = 0;

  for (const entry of executions) {
    const rows = previewRowsForExecution(entry);
    const candidates = _dtxrWallCandidateIndex(rows);
    available += candidates.available;
    if (!candidates.available) continue;

    const sourceRef = createModeASourceProcessingRef(stateRef, entry.source.sourceId);
    const current = sourceRef.current;
    const config = parseConfig(current.supportConfigJson);
    const overrides = ensureObject(config, 'overrides');
    const wallThickness = ensureObject(overrides, 'wallThickness');
    const dtxrKeys = ensureObject(overrides, '__dtxrWallKeys');
    let sourceApplied = 0;

    for (const row of rows) {
      const candidate = _dtxrWallCandidateForRow(row, candidates.index);
      if (!candidate) continue;
      const key = text(row.wallThicknessKey || _classSizeKey(row) || row.lineKey || row.branchName);
      if (!key) continue;
      wallThickness[key] = candidate.value;
      dtxrKeys[key] = true;
      markWallManual(overrides, key);
      sourceApplied += 1;
    }

    if (sourceApplied) {
      sourceRef.current = { ...current, supportConfigJson: JSON.stringify(config, null, 2) };
      applied += sourceApplied;
      sourceCount += 1;
    }
  }

  if (applied) setUndo(stateRef, `DTXR Wall (${applied} override${applied === 1 ? '' : 's'})`, snapshots);
  return { changed: applied > 0, applied, available, sourceCount };
}

export function applyModeAConsolidatedDtxrRating(stateRef) {
  const executions = modeAExecutionRows(stateRef);
  const snapshots = sourceSnapshots(stateRef, executions.map((entry) => entry.source.sourceId));
  let applied = 0;
  let cleared = 0;
  let conflicts = 0;
  let missing = 0;
  let manualProtected = 0;
  let sourceCount = 0;

  for (const entry of executions) {
    const rows = previewRowsForExecution(entry);
    const sourceRef = createModeASourceProcessingRef(stateRef, entry.source.sourceId);
    const current = sourceRef.current;
    const config = parseConfig(current.supportConfigJson);
    const result = applyPreviewDtxrRatingOverrides(config, rows);
    const changed = result.applied > 0 || result.cleared > 0;
    if (changed) {
      sourceRef.current = { ...current, supportConfigJson: JSON.stringify(config, null, 2) };
      sourceCount += 1;
    }
    applied += result.applied || 0;
    cleared += result.cleared || 0;
    conflicts += result.conflicts || 0;
    missing += result.missing || 0;
    manualProtected += result.manualProtected || 0;
  }

  if (applied || cleared) setUndo(stateRef, `DTXR Rating (${applied} applied, ${cleared} cleared)`, snapshots);
  return { changed: applied > 0 || cleared > 0, applied, cleared, conflicts, missing, manualProtected, sourceCount };
}

function styleButton(button) {
  Object.assign(button.style, {
    padding: '4px 8px', border: '1px solid #475569', borderRadius: '5px',
    background: '#172033', color: '#e2e8f0', cursor: 'pointer', fontSize: '10px', whiteSpace: 'nowrap',
  });
}

function statusNode(toolbar) {
  let node = toolbar.querySelector('[data-mode-a-dtxr-status]');
  if (!node) {
    node = document.createElement('span');
    node.dataset.modeADtxrStatus = 'true';
    node.className = 'xml-cii-phase-help';
    node.style.color = '#93c5fd';
    const note = [...toolbar.querySelectorAll('.xml-cii-phase-help')].find((item) => item.style.marginLeft === 'auto');
    if (note) toolbar.insertBefore(node, note);
    else toolbar.appendChild(node);
  }
  return node;
}

export function installModeAConsolidatedDtxrTools(panel, stateRef) {
  const toolbar = panel?.querySelector('[data-mode-a-consolidated-easy-toolbar]');
  if (!toolbar || toolbar.dataset.modeADtxrTools === 'true') return false;
  toolbar.dataset.modeADtxrTools = 'true';

  const label = document.createElement('strong');
  label.textContent = 'DTXR';
  label.style.fontSize = '11px';

  const wall = document.createElement('button');
  wall.type = 'button';
  wall.textContent = 'Update Wall thickness based on DTXR';
  wall.title = 'Apply the existing DTXR schedule/bore wall-thickness authority independently inside each XML source.';
  styleButton(wall);

  const rating = document.createElement('button');
  rating.type = 'button';
  rating.textContent = 'Fetch Rating as per DTXR';
  rating.title = 'Fetch only unambiguous DTXR ratings as source-local branch overrides. Manual Preview ratings remain protected.';
  styleButton(rating);

  const individualNote = document.createElement('span');
  individualNote.className = 'xml-cii-phase-help';
  individualNote.textContent = 'B31.3 wall update remains source-specific under Individual Preview / Review.';

  const rightNote = [...toolbar.querySelectorAll('.xml-cii-phase-help')].find((node) => node.style.marginLeft === 'auto');
  for (const node of [label, wall, rating, individualNote]) {
    if (rightNote) toolbar.insertBefore(node, rightNote);
    else toolbar.appendChild(node);
  }

  wall.addEventListener('click', () => {
    if (typeof confirm === 'function' && !confirm('Apply DTXR wall-thickness updates independently to all enabled Mode A XML sources?')) return;
    const result = applyModeAConsolidatedDtxrWall(stateRef);
    const status = statusNode(toolbar);
    status.textContent = result.changed
      ? `DTXR Wall: ${result.applied} override(s) across ${result.sourceCount} XML source(s).`
      : `DTXR Wall: no applicable schedule/bore match found (${result.available} candidate row(s)).`;
    if (result.changed) requestRebuild(panel);
  });

  rating.addEventListener('click', () => {
    if (typeof confirm === 'function' && !confirm('Fetch unambiguous DTXR ratings independently for all enabled Mode A XML sources?')) return;
    const result = applyModeAConsolidatedDtxrRating(stateRef);
    const status = statusNode(toolbar);
    status.textContent = `DTXR Rating: ${result.applied} applied · ${result.cleared} stale cleared · ${result.conflicts} conflict · ${result.manualProtected} manual protected.`;
    if (result.changed) requestRebuild(panel);
  });

  return true;
}
