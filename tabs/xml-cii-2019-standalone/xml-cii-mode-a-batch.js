import * as core from './xml-cii-mode-a-batch-core.js';
export * from './xml-cii-mode-a-batch-core.js';

const DUPLICATE_CODES = new Set([
  'DUPLICATE_NODE_WITHIN_BRANCH',
  'DUPLICATE_BRANCH_NAME_WITHIN_FILE',
  'DUPLICATE_BRANCH_ACROSS_FILES',
  'DUPLICATE_NODE_ACROSS_FILES',
]);

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function parseJson(value) {
  try { return object(JSON.parse(String(value || '{}'))); } catch { return {}; }
}

function clone(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch { return {}; }
}

export function composeModeASupportConfig(sharedJson = '{}', sourceJson = '{}') {
  const shared = clone(parseJson(sharedJson));
  const source = parseJson(sourceJson);

  if (source.overrides && typeof source.overrides === 'object') shared.overrides = clone(source.overrides);

  const branchLineKeyMap = source.linelist?.branchLineKeyMap;
  if (branchLineKeyMap && typeof branchLineKeyMap === 'object' && !Array.isArray(branchLineKeyMap)) {
    shared.linelist = { ...object(shared.linelist), branchLineKeyMap: clone(branchLineKeyMap) };
  }

  const finalizedMatches = source.weight?.finalizedMatches;
  if (Array.isArray(finalizedMatches)) {
    shared.weight = { ...object(shared.weight), finalizedMatches: clone(finalizedMatches) };
  }

  return JSON.stringify(shared, null, 2);
}

export function commonModeASupportConfig(sourceJson = '{}') {
  const config = clone(parseJson(sourceJson));
  delete config.overrides;
  if (config.linelist && typeof config.linelist === 'object') delete config.linelist.branchLineKeyMap;
  if (config.weight && typeof config.weight === 'object') delete config.weight.finalizedMatches;
  return JSON.stringify(config, null, 2);
}

export function modeASharedSupportConfig(state = {}) {
  const stored = String(state.sourceBatch?.sharedSupportConfigJson || '').trim();
  return stored || commonModeASupportConfig(state.supportConfigJson || '{}');
}

export function normalizeModeABatchState(state = {}) {
  const next = core.normalizeModeABatchState(state);
  if (!next.sourceBatch?.sources?.length) return next;
  const sharedSupportConfigJson = modeASharedSupportConfig(next);
  if (next.sourceBatch.sharedSupportConfigJson === sharedSupportConfigJson) return next;
  return {
    ...next,
    sourceBatch: {
      ...next.sourceBatch,
      sharedSupportConfigJson,
    },
  };
}

export function syncActiveModeASource(state = {}) {
  const normalized = normalizeModeABatchState(state);
  const next = core.syncActiveModeASource(normalized);
  if (!next.sourceBatch?.sources?.length) return next;

  // The UI state represents the active source. Its common configuration is the
  // latest shared authority, while branch mappings / manual overrides / final
  // weight matches remain source-local and are stripped by this projection.
  const sharedSupportConfigJson = commonModeASupportConfig(
    next.supportConfigJson || normalized.sourceBatch.sharedSupportConfigJson || '{}',
  );

  return {
    ...next,
    sourceBatch: {
      ...next.sourceBatch,
      sharedSupportConfigJson,
    },
  };
}

export function activateModeASource(state = {}, sourceId) {
  const synced = syncActiveModeASource(state);
  const sharedSupportConfigJson = modeASharedSupportConfig(synced);
  const activated = core.activateModeASource(synced, sourceId);
  const target = activated.sourceBatch?.sources?.find((source) => source.sourceId === sourceId);
  if (!target) return activated;

  const effectiveSupportConfigJson = composeModeASupportConfig(
    sharedSupportConfigJson,
    target.supportConfigJson || '{}',
  );
  const sources = activated.sourceBatch.sources.map((source) => source.sourceId === sourceId
    ? { ...source, supportConfigJson: effectiveSupportConfigJson }
    : source);

  return {
    ...activated,
    supportConfigJson: effectiveSupportConfigJson,
    sourceBatch: {
      ...activated.sourceBatch,
      sources,
      sharedSupportConfigJson,
    },
  };
}

export function buildModeAExecutionState(baseState = {}, source = {}) {
  const normalized = normalizeModeABatchState(baseState);
  const next = core.buildModeAExecutionState(normalized, source);
  return {
    ...next,
    supportConfigJson: composeModeASupportConfig(
      modeASharedSupportConfig(normalized),
      source.supportConfigJson || '{}',
    ),
  };
}

export function buildModeAPreflight(batch = {}) {
  const report = core.buildModeAPreflight(batch);
  const blockingRows = (report.blockingRows || []).filter((row) => !DUPLICATE_CODES.has(row.code));
  const warnings = (report.warnings || []).filter((row) => !DUPLICATE_CODES.has(row.code));
  return {
    ...report,
    ready: blockingRows.length === 0,
    blockingRows,
    warnings,
    duplicateBranchesAcrossFiles: [],
    duplicateNodesAcrossFiles: [],
    duplicateValidation: 'disabled-mode-a',
  };
}

export function buildModeABatchManifest(batch = {}, resultRows = []) {
  const manifest = core.buildModeABatchManifest(batch, resultRows);
  return {
    ...manifest,
    duplicateBranchesAcrossFiles: [],
    duplicateNodesAcrossFiles: [],
    duplicateValidation: 'disabled-mode-a',
  };
}
