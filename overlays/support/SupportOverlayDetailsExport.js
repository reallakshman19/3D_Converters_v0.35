export const SUPPORT_OVERLAY_DETAILS_EXPORT_SCHEMA = 'support-overlay-details-export/v1';

export function buildSupportOverlayDetailsExportSnapshot(state = {}, context = {}) {
  const selected = state && state.status === 'selected';
  const now = context.now || (() => new Date());
  const generatedAt = toIsoTimestamp(now);
  return {
    schema: SUPPORT_OVERLAY_DETAILS_EXPORT_SCHEMA,
    snapshotKind: 'non-primitive-support-overlay-details',
    generatedAt,
    status: selected ? 'selected' : 'empty',
    sourceKind: text(state.sourceKind || context.sourceKind || ''),
    sourceFile: text(state.sourceFile || context.sourceFile || context.fileName || ''),
    primitiveExcluded: true,
    rvmSearchIndexed: false,
    pickable: false,
    selectable: false,
    support: selected ? sanitizeDetailsState(state) : null,
  };
}

export function supportOverlayDetailsExportJson(state = {}, context = {}) {
  return JSON.stringify(buildSupportOverlayDetailsExportSnapshot(state, context), null, 2);
}

export function supportOverlayDetailsExportFileName(snapshotOrState = {}, context = {}) {
  const snapshot = snapshotOrState?.snapshotKind
    ? snapshotOrState
    : buildSupportOverlayDetailsExportSnapshot(snapshotOrState, context);
  const kind = cleanToken(snapshot.sourceKind || 'source');
  const support = cleanToken(snapshot.support?.supportNo || snapshot.support?.supportId || snapshot.status || 'support');
  const stamp = cleanToken(String(snapshot.generatedAt || new Date().toISOString()).replace(/[:.]/g, '-'));
  return `nonprimitive-support-details-${kind}-${support}-${stamp}.json`;
}

export async function copySupportOverlayDetailsJson(state = {}, context = {}) {
  const json = supportOverlayDetailsExportJson(state, context);
  const clipboard = context.clipboard || globalThis.navigator?.clipboard;
  if (!clipboard?.writeText) {
    return {
      status: 'skipped',
      reason: 'clipboard-unavailable',
      json,
    };
  }
  await clipboard.writeText(json);
  return {
    status: 'copied',
    bytes: json.length,
    supportId: state.supportId || state.supportNo || '',
  };
}

export function downloadSupportOverlayDetailsJson(state = {}, context = {}) {
  const doc = context.document || globalThis.document;
  const URLCtor = context.URL || globalThis.URL;
  const BlobCtor = context.Blob || globalThis.Blob;
  const json = supportOverlayDetailsExportJson(state, context);
  const snapshot = buildSupportOverlayDetailsExportSnapshot(state, context);
  const fileName = supportOverlayDetailsExportFileName(snapshot);

  if (!doc?.createElement || !URLCtor?.createObjectURL || !BlobCtor) {
    return {
      status: 'skipped',
      reason: 'download-unavailable',
      fileName,
      json,
    };
  }

  const blob = new BlobCtor([json], { type: 'application/json' });
  const url = URLCtor.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  doc.body?.appendChild?.(anchor);
  anchor.click?.();
  anchor.remove?.();
  try { URLCtor.revokeObjectURL?.(url); } catch (_) {}
  return {
    status: 'downloaded',
    fileName,
    bytes: json.length,
  };
}

function sanitizeDetailsState(state = {}) {
  return {
    supportId: text(state.supportId),
    supportNo: text(state.supportNo),
    family: text(state.family || 'UNKNOWN'),
    rawType: text(state.rawType),
    nodeId: text(state.nodeId),
    sourceKind: text(state.sourceKind),
    sourceFile: text(state.sourceFile),
    sourceCoordinate: copyVec3(state.sourceCoordinate),
    mappedCoordinate: copyVec3(state.mappedCoordinate),
    pipeAxis: copyVec3(state.pipeAxis),
    pipeAxisSource: text(state.pipeAxisSource),
    matchedPipeSegmentId: text(state.matchedPipeSegmentId),
    explicitSign: text(state.explicitSign),
    gapMm: nullableNumber(state.gapMm),
    gapVisualSeparationMm: nullableNumber(state.gapVisualSeparationMm),
    pipeOdMm: nullableNumber(state.pipeOdMm),
    popupRequired: Boolean(state.popupRequired),
    warningCount: Number(state.warningCount || state.warnings?.length || 0) || 0,
    warnings: Array.isArray(state.warnings) ? state.warnings.map(text).filter(Boolean) : [],
    attributes: Array.isArray(state.attributes)
      ? state.attributes.map((row) => ({ key: text(row?.key), value: text(row?.value) })).filter((row) => row.key)
      : [],
    primitiveExcluded: true,
    rvmSearchIndexed: false,
    pickable: false,
    selectable: false,
  };
}

function copyVec3(value) {
  if (!value || typeof value !== 'object') return null;
  const x = nullableNumber(value.x);
  const y = nullableNumber(value.y);
  const z = nullableNumber(value.z);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

function nullableNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanToken(value) {
  return String(value || '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    || 'source';
}

function toIsoTimestamp(now) {
  const value = typeof now === 'function' ? now() : now;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function text(value) {
  return String(value ?? '').trim();
}
