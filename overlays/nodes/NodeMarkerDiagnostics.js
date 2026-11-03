export const NODE_MARKER_DIAGNOSTICS_SCHEMA = 'non-primitive-node-marker-diagnostics/v1';

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function stableHash(value) {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function markerWarning(code, message, extra = {}) {
  return { code, message, ...extra };
}

export function buildNodeMarkerDiagnostics(markers = [], options = {}) {
  const count = (status) => markers.filter((marker) => marker.status === status).length;
  return {
    schema: NODE_MARKER_DIAGNOSTICS_SCHEMA,
    resolverVersion: options.resolverVersion || 'node-marker-resolver/v1',
    markerCount: markers.length,
    exactCount: count('exact'),
    approximateCount: count('approximate'),
    generatedCount: count('generated'),
    staleCount: count('stale'),
    unresolvedCount: count('unresolved'),
    sourceKind: options.sourceKind || '',
    sourceSubKind: options.sourceSubKind || 'unknown',
    sourceFile: options.sourceFile || '',
    sourceRevision: options.sourceRevision || '',
    toleranceMm: Number.isFinite(Number(options.toleranceMm)) ? Number(options.toleranceMm) : 2,
    diagnosticsHash: stableHash(markers.map((marker) => ({ markerId: marker.markerId, status: marker.status, warnings: marker.warnings || [] }))),
  };
}
