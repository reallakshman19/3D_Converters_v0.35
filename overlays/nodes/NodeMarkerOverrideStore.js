import { normalizeNodeMarkerOverrides } from './NodeMarkerOverrides.js';
import { stableHash } from './NodeMarkerDiagnostics.js';

export const NODE_MARKER_OVERRIDE_STORE_SCHEMA = 'non-primitive-node-marker-override-store/v1';
const STORAGE_PREFIX = 'rvm.nodeMarkers.overrides.v1';

export function buildNodeMarkerOverrideStoreContext(buildOrContext = {}) {
  const diagnostics = buildOrContext.diagnostics || buildOrContext;
  return {
    schema: NODE_MARKER_OVERRIDE_STORE_SCHEMA,
    sourceKind: String(diagnostics.sourceKind || buildOrContext.sourceKind || 'json'),
    sourceSubKind: String(diagnostics.sourceSubKind || buildOrContext.sourceSubKind || 'unknown'),
    sourceFile: String(diagnostics.sourceFile || buildOrContext.sourceFile || ''),
    sourceRevision: String(diagnostics.sourceRevision || buildOrContext.sourceRevision || ''),
  };
}

export function nodeMarkerOverrideStorageKey(context = {}) {
  const ctx = buildNodeMarkerOverrideStoreContext(context);
  return `${STORAGE_PREFIX}:${stableHash({ sourceKind: ctx.sourceKind, sourceSubKind: ctx.sourceSubKind, sourceFile: ctx.sourceFile, sourceRevision: ctx.sourceRevision })}`;
}

export function loadNodeMarkerOverrideSet(context = {}, storage = globalThis.localStorage) {
  const key = nodeMarkerOverrideStorageKey(context);
  if (!storage?.getItem) return emptySet(context, key, 'storage-unavailable');
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null');
    if (!parsed || parsed.schema !== NODE_MARKER_OVERRIDE_STORE_SCHEMA) return emptySet(context, key, 'not-found');
    return { ...parsed, key, overrides: normalizeNodeMarkerOverrides(parsed.overrides || []) };
  } catch (error) {
    return emptySet(context, key, 'parse-error', String(error?.message || error));
  }
}

export function saveNodeMarkerOverrideSet(context = {}, overrides = [], storage = globalThis.localStorage) {
  const ctx = buildNodeMarkerOverrideStoreContext(context);
  const key = nodeMarkerOverrideStorageKey(ctx);
  const normalized = normalizeNodeMarkerOverrides(overrides);
  const payload = {
    schema: NODE_MARKER_OVERRIDE_STORE_SCHEMA,
    key,
    context: ctx,
    overrides: normalized,
    overrideHash: stableHash(normalized),
    savedAt: new Date(0).toISOString(),
  };
  if (storage?.setItem) storage.setItem(key, JSON.stringify(payload));
  return payload;
}

export function upsertNodeMarkerOverride(overrides = [], override = {}) {
  const normalized = normalizeNodeMarkerOverrides([override])[0];
  if (!normalized) return normalizeNodeMarkerOverrides(overrides);
  const list = normalizeNodeMarkerOverrides(overrides).filter((entry) => !sameOverrideTarget(entry, normalized));
  list.push(normalized);
  return list;
}

export function removeNodeMarkerOverride(overrides = [], target = {}) {
  const normalized = normalizeNodeMarkerOverrides([target])[0] || target;
  return normalizeNodeMarkerOverrides(overrides).filter((entry) => !sameOverrideTarget(entry, normalized));
}

function sameOverrideTarget(a = {}, b = {}) {
  if (a.markerId && b.markerId) return a.markerId === b.markerId;
  if (a.sourcePath && b.sourcePath) return a.sourcePath === b.sourcePath;
  return false;
}

function emptySet(context, key, reason, error = '') {
  return {
    schema: NODE_MARKER_OVERRIDE_STORE_SCHEMA,
    key,
    context: buildNodeMarkerOverrideStoreContext(context),
    overrides: [],
    overrideHash: stableHash([]),
    status: 'empty',
    reason,
    error,
  };
}
