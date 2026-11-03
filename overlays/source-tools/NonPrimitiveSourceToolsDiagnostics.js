export const NON_PRIMITIVE_SOURCE_TOOLS_DIAGNOSTICS_SCHEMA = 'non-primitive-source-tools-diagnostics/v1';

const MAX_SNAPSHOT_ARRAY_LENGTH = 1000;
const MAX_SNAPSHOT_DEPTH = 9;

export function buildNonPrimitiveSourceToolsDiagnosticsSnapshot({
  viewer = null,
  context = {},
  uiSchema = '',
  normalizeSourceKind = defaultNormalizeSourceKind,
  now = () => new Date(),
} = {}) {
  const autoDiagnostics = sanitizeDiagnosticsJson(viewer?.nonPrimitiveAutoBendDiagnostics || {});
  const supportDiagnostics = sanitizeDiagnosticsJson(viewer?.nonPrimitiveSupportOverlayDiagnostics || {});
  const sourceKind = normalizeSourceKind(
    context.sourceKind
      || autoDiagnostics.sourceKind
      || supportDiagnostics.sourceKind
      || viewer?.sourceKind
      || ''
  );
  const sourceFile = context.sourceFile || context.fileName || autoDiagnostics.sourceFile || supportDiagnostics.sourceFile || '';
  return {
    schema: uiSchema || NON_PRIMITIVE_SOURCE_TOOLS_DIAGNOSTICS_SCHEMA,
    diagnosticsSchema: NON_PRIMITIVE_SOURCE_TOOLS_DIAGNOSTICS_SCHEMA,
    snapshotKind: 'non-primitive-source-tools-diagnostics',
    generatedAt: toIsoTimestamp(now),
    sourceKind,
    sourceFile,
    primitiveExcluded: true,
    counts: {
      autoBendSegments: Number(autoDiagnostics.segmentCount || 0),
      autoBendBends: Number(autoDiagnostics.bendCount || 0),
      autoBendTrims: Number(autoDiagnostics.trimCount || 0),
      supportSourceRecords: Number(supportDiagnostics.sourceSupports || 0),
      supportCreated: Number(supportDiagnostics.created || 0),
      supportWarnings: Number(supportDiagnostics.warningCount ?? supportDiagnostics.warnings?.length ?? 0) || 0,
      supportPipeSegments: Number(supportDiagnostics.sourcePipeSegments || 0),
    },
    autoBend: autoDiagnostics,
    supportOverlay: supportDiagnostics,
  };
}

export function sourceToolsDiagnosticsFileName(snapshot = {}) {
  const kind = String(snapshot.sourceKind || 'source').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'source';
  const stamp = String(snapshot.generatedAt || new Date().toISOString()).replace(/[:.]/g, '-');
  return `nonprimitive-source-tools-diagnostics-${kind}-${stamp}.json`;
}

export function sanitizeDiagnosticsJson(value, depth = 0, seen = new WeakSet()) {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (depth >= MAX_SNAPSHOT_DEPTH) return '[max-depth]';
  if (typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_SNAPSHOT_ARRAY_LENGTH).map((item) => sanitizeDiagnosticsJson(item, depth + 1, seen));
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    const clean = sanitizeDiagnosticsJson(item, depth + 1, seen);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}

function toIsoTimestamp(now) {
  const value = typeof now === 'function' ? now() : now;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function defaultNormalizeSourceKind(value) {
  const kind = String(value || '').trim().toLowerCase().replace(/^\./, '');
  if (!kind || kind === 'aveva-json' || kind === 'source-preview') return 'json';
  if (kind === 'xml' || kind === 'uxml') return 'inputxml';
  return kind;
}
