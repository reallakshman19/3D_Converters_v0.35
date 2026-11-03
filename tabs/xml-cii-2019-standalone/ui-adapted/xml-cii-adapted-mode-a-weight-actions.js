import { replaceModeAState } from './xml-cii-adapted-mode-a-state.js';
import { createModeASourceProcessingRef, modeARawRef, modeARawState } from './xml-cii-adapted-mode-a-propagation.js';

function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function parseConfig(value) { try { const out = JSON.parse(String(value || '{}')); return out && typeof out === 'object' && !Array.isArray(out) ? out : {}; } catch { return {}; } }
function object(parent, key) { if (!parent[key] || typeof parent[key] !== 'object' || Array.isArray(parent[key])) parent[key] = {}; return parent[key]; }
function clone(value) { try { return JSON.parse(JSON.stringify(value)); } catch { return null; } }

function snapshots(stateRef, sourceIds) {
  return [...new Set(sourceIds)].map((sourceId) => {
    const ref = createModeASourceProcessingRef(stateRef, sourceId);
    const config = parseConfig(ref.current.supportConfigJson);
    const rigidWeight = config?.overrides?.rigidWeight;
    return {
      sourceId,
      hadRigidWeight: Boolean(rigidWeight && typeof rigidWeight === 'object' && !Array.isArray(rigidWeight)),
      rigidWeight: clone(rigidWeight || {}),
    };
  });
}

export function applyModeAWeightChanges(stateRef, changes = [], label = 'Weight Match') {
  if (!changes.length) return false;
  const before = snapshots(stateRef, changes.map((row) => row.sourceId));
  const bySource = new Map();
  for (const change of changes) {
    if (!bySource.has(change.sourceId)) bySource.set(change.sourceId, []);
    bySource.get(change.sourceId).push(change);
  }
  for (const [sourceId, rows] of bySource.entries()) {
    const ref = createModeASourceProcessingRef(stateRef, sourceId);
    const current = ref.current;
    const config = parseConfig(current.supportConfigJson);
    const rigidWeight = object(object(config, 'overrides'), 'rigidWeight');
    for (const row of rows) if (text(row.key) && Number(row.weight) > 0) rigidWeight[row.key] = Number(row.weight);
    ref.current = { ...current, supportConfigJson: JSON.stringify(config, null, 2) };
  }
  const rawRef = modeARawRef(stateRef);
  const latest = modeARawState(rawRef);
  replaceModeAState(rawRef, { ...latest, modeAConsolidatedWeightUndo: { label, snapshots: before, createdAt: new Date().toISOString() } });
  return true;
}

export function undoModeAWeightChanges(stateRef) {
  const raw = modeARawState(stateRef);
  const undo = raw.modeAConsolidatedWeightUndo;
  if (!undo?.snapshots?.length) return false;
  for (const snapshot of undo.snapshots) {
    const ref = createModeASourceProcessingRef(stateRef, snapshot.sourceId);
    const current = ref.current;
    const config = parseConfig(current.supportConfigJson);
    const overrides = object(config, 'overrides');
    if (snapshot.hadRigidWeight) overrides.rigidWeight = clone(snapshot.rigidWeight || {}) || {};
    else delete overrides.rigidWeight;
    ref.current = { ...current, supportConfigJson: JSON.stringify(config, null, 2) };
  }
  const latest = modeARawState(stateRef);
  replaceModeAState(modeARawRef(stateRef), { ...latest, modeAConsolidatedWeightUndo: null });
  return true;
}
