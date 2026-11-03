import { markerWarning, stableHash } from './NodeMarkerDiagnostics.js';

export const NODE_MARKER_OVERRIDES_SCHEMA = 'non-primitive-node-marker-overrides/v1';
const OVERRIDABLE_FIELDS = new Set(['nodeNumber', 'branchName', 'componentRefNo', 'componentType', 'positionSource']);

export function normalizeNodeMarkerOverrides(input = {}) {
  const list = Array.isArray(input) ? input : Object.entries(input || {}).map(([key, value]) => ({ markerId: key, ...(value || {}) }));
  return list.map((override, index) => ({
    schema: NODE_MARKER_OVERRIDES_SCHEMA,
    overrideId: override.overrideId || `OVERRIDE-${String(index + 1).padStart(5, '0')}`,
    markerId: clean(override.markerId),
    sourcePath: clean(override.sourcePath),
    nodeNumber: normalizeNodeNumber(override.nodeNumber),
    branchName: clean(override.branchName),
    componentRefNo: clean(override.componentRefNo),
    componentType: clean(override.componentType),
    positionSource: clean(override.positionSource),
    suppressExport: Boolean(override.suppressExport || override.suppressed || override.export === false),
    locked: Boolean(override.locked || override.lock),
    reason: clean(override.reason),
  })).filter((override) => override.markerId || override.sourcePath);
}

export function applyNodeMarkerOverrides(markers = [], overridesInput = []) {
  const overrides = normalizeNodeMarkerOverrides(overridesInput);
  if (!overrides.length) return { markers, diagnostics: buildOverrideDiagnostics(markers, overrides, []) };
  const warnings = [];
  const used = new Set();
  const out = markers.map((marker) => {
    const override = findOverride(marker, overrides);
    if (!override) return { ...marker, overrideStatus: marker.overrideStatus || 'none' };
    used.add(override.overrideId);
    return applyOverride(marker, override, warnings);
  }).filter((marker) => marker.overrideStatus !== 'suppressed');
  for (const override of overrides) if (!used.has(override.overrideId)) warnings.push(markerWarning('override-unmatched', 'Node Marker override did not match any marker.', { overrideId: override.overrideId, markerId: override.markerId, sourcePath: override.sourcePath }));
  return { markers: out, diagnostics: buildOverrideDiagnostics(out, overrides, warnings) };
}

function applyOverride(marker, override, warnings) {
  const next = { ...marker, overrideStatus: override.locked ? 'locked' : 'overridden', overrideId: override.overrideId };
  const markerWarnings = [...(marker.warnings || [])];
  if (override.suppressExport) {
    next.overrideStatus = 'suppressed';
    next.suppressedByOverride = true;
    return next;
  }
  for (const field of OVERRIDABLE_FIELDS) {
    const value = override[field];
    if (value === '' || value === null || value === undefined) continue;
    next[field] = value;
    next[`${field}Source`] = 'override';
  }
  if (override.locked) next.lockedByOverride = true;
  if (override.reason) next.overrideReason = override.reason;
  markerWarnings.push(markerWarning('marker-overridden', 'Node Marker field override applied.', { overrideId: override.overrideId, fields: overriddenFields(override) }));
  next.warnings = markerWarnings;
  next.overrideHash = stableHash({ override, markerId: marker.markerId, sourcePath: marker.sourcePath });
  warnings.push(markerWarning('override-applied', 'Node Marker override applied.', { overrideId: override.overrideId, markerId: marker.markerId }));
  return next;
}

function overriddenFields(override) {
  return [...OVERRIDABLE_FIELDS].filter((field) => override[field] !== '' && override[field] !== null && override[field] !== undefined);
}

function findOverride(marker, overrides) {
  return overrides.find((override) => (override.markerId && override.markerId === marker.markerId) || (override.sourcePath && override.sourcePath === marker.sourcePath));
}

function buildOverrideDiagnostics(markers, overrides, warnings) {
  return {
    schema: NODE_MARKER_OVERRIDES_SCHEMA,
    overrideCount: overrides.length,
    appliedCount: warnings.filter((warning) => warning.code === 'override-applied').length,
    unmatchedCount: warnings.filter((warning) => warning.code === 'override-unmatched').length,
    suppressedCount: overrides.filter((override) => override.suppressExport).length,
    outputMarkerCount: markers.length,
    overrideHash: stableHash(overrides),
    warnings,
  };
}

function normalizeNodeNumber(value) {
  if (value === undefined || value === null || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : clean(value);
}
function clean(value) { return String(value ?? '').trim(); }
