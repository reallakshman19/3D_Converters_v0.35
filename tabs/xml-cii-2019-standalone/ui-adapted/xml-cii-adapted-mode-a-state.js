import {
  activateModeASource,
  createModeASourceEntry,
  normalizeModeABatchState,
  syncActiveModeASource,
} from '../xml-cii-mode-a-batch.js?v=20260813-mode-a-full-propagation-2';
import { clearPreviewCachesV7 } from './xml-cii-adapted-preview-cache-v7.js?v=20260813-mode-a-full-propagation-2';

const MODE_A_SOURCE_CACHE_KEYS = Object.freeze([
  'xml-cii-wm-cache-v1',
  'xml-cii-wm-cache-v2-preview-rating',
]);

export function clearModeASourceCaches() {
  clearPreviewCachesV7();
  try {
    for (const key of MODE_A_SOURCE_CACHE_KEYS) localStorage.removeItem(key);
  } catch {}
}

function stripMarker(state) {
  if (!state || typeof state !== 'object') return state;
  const { __modeAReplace, ...rest } = state;
  return rest;
}

export function createXmlCiiModeAStateRef(baseRef) {
  return {
    get current() {
      const normalized = normalizeModeABatchState(baseRef.current);
      if (normalized !== baseRef.current) baseRef.current = normalized;
      return baseRef.current;
    },
    set current(next) {
      if (next?.__modeAReplace === true) {
        baseRef.current = stripMarker(next);
        return;
      }
      baseRef.current = syncActiveModeASource(next);
    },
  };
}

export function replaceModeAState(stateRef, nextState) {
  stateRef.current = { ...nextState, __modeAReplace: true };
}

export function importModeASources(state = {}, rows = []) {
  const current = syncActiveModeASource(normalizeModeABatchState(state));
  const existing = Array.isArray(current.sourceBatch?.sources) ? current.sourceBatch.sources : [];
  const byDigest = new Map(existing.map((source) => [source.sourceDigest, source]));
  const added = [];
  const duplicates = [];
  for (const row of rows) {
    const entry = createModeASourceEntry(row, current);
    if (byDigest.has(entry.sourceDigest)) {
      duplicates.push(entry.fileName);
      continue;
    }
    byDigest.set(entry.sourceDigest, entry);
    added.push(entry);
  }
  const sources = [...existing, ...added];
  if (!sources.length) return { state: current, added, duplicates };
  const activeSourceId = added[0]?.sourceId || current.sourceBatch?.activeSourceId || sources[0].sourceId;
  const activeSource = sources.find((source) => source.sourceId === activeSourceId) || sources[0];
  const batch = {
    mode: 'separate-models',
    activeSourceId,
    sources,
    importStatus: duplicates.length
      ? `${added.length} source(s) added; skipped duplicate content: ${duplicates.join(', ')}`
      : `${added.length} source(s) added.`,
  };

  const seeded = {
    ...current,
    sourceKind: 'xml',
    sourceFile: activeSource.sourceFile || null,
    sourceText: activeSource.sourceText || '',
    stagedJsonFile: activeSource.stagedJsonFile || null,
    stagedJsonText: activeSource.stagedJsonText || '',
    branchSelection: activeSource.branchSelection || {},
    supportConfigJson: activeSource.supportConfigJson || current.supportConfigJson,
    sourceBatch: batch,
    batchRunResult: null,
  };
  const next = activateModeASource(seeded, activeSourceId);
  return { state: next, added, duplicates };
}

export function updateModeASource(state = {}, sourceId, patch = {}) {
  const current = syncActiveModeASource(normalizeModeABatchState(state));
  const sources = (current.sourceBatch?.sources || []).map((source) => source.sourceId === sourceId
    ? { ...source, ...patch }
    : source);
  const next = { ...current, sourceBatch: { ...current.sourceBatch, sources }, batchRunResult: null };
  return sourceId === current.sourceBatch?.activeSourceId
    ? activateModeASource(next, sourceId)
    : next;
}

export function removeModeASource(state = {}, sourceId) {
  const current = syncActiveModeASource(normalizeModeABatchState(state));
  const sources = (current.sourceBatch?.sources || []).filter((source) => source.sourceId !== sourceId);
  if (!sources.length) {
    return {
      ...current,
      sourceFile: null,
      sourceText: '',
      stagedJsonFile: null,
      stagedJsonText: '',
      branchSelection: {},
      sourceBatch: { mode: 'separate-models', activeSourceId: '', sources: [] },
      result: null,
      batchRunResult: null,
    };
  }
  const activeSourceId = current.sourceBatch.activeSourceId === sourceId
    ? sources[0].sourceId
    : current.sourceBatch.activeSourceId;
  return activateModeASource({
    ...current,
    sourceBatch: { ...current.sourceBatch, activeSourceId, sources },
    batchRunResult: null,
  }, activeSourceId);
}
