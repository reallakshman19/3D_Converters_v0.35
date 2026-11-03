import { resolveNodeMarkersFromSource } from './NodeMarkerResolver.js';
import { applyNodeMarkerOverrides, normalizeNodeMarkerOverrides } from './NodeMarkerOverrides.js';
import {
  buildNodeMarkerBranchRows,
  buildNodeMarkerCoordinateRows,
  buildNodeMarkerCsvForXmlCii,
  buildNodeMarkerDtxrRows,
  buildNodeMarkerRestraintRows,
  buildNodeMarkerWeightRows,
  buildNodeMarkerXmlCiiTables,
} from './NodeMarkerXmlCiiTableMapper.js';
import { stableHash } from './NodeMarkerDiagnostics.js';

export const NODE_MARKER_API_SCHEMA = 'non-primitive-node-marker-api/v3';
const GLOBAL_KEY = 'rvmNodeMarkers';
let lastBuild = null;

export function buildNodeMarkersFromSource(source, options = {}) {
  lastBuild = completeBuild(resolveNodeMarkersFromSource(source, options), options);
  return lastBuild;
}

export function rebuildNodeMarkersFromSource(source, options = {}) {
  return buildNodeMarkersFromSource(source, { ...options, reason: options.reason || 'manual-rebuild' });
}

export function buildNodeMarkerXmlCiiTablesFromSource(source, options = {}) {
  return buildNodeMarkersFromSource(source, options).tables;
}

export function buildNodeMarkerXmlCiiTablesFromMarkers(markers, options = {}) {
  const overrideResult = applyNodeMarkerOverrides(markers, options.markerOverrides || options.overrides || []);
  return buildNodeMarkerXmlCiiTables(overrideResult.markers, options);
}

export function evaluateNodeMarkerStaleness(source, options = {}, previousBuild = lastBuild) {
  if (!previousBuild?.diagnostics?.sourceRevision) return { schema: 'non-primitive-node-marker-stale/v1', status: 'blocked', staleReason: 'no-previous-build' };
  const next = resolveNodeMarkersFromSource(source, options);
  const currentRevision = next.diagnostics?.sourceRevision || '';
  const previousRevision = previousBuild.diagnostics.sourceRevision;
  const overrideHash = stableHash(normalizeNodeMarkerOverrides(options.markerOverrides || options.overrides || []));
  const previousOverrideHash = previousBuild.overrideDiagnostics?.overrideHash || stableHash([]);
  const stale = currentRevision !== previousRevision || overrideHash !== previousOverrideHash;
  return {
    schema: 'non-primitive-node-marker-stale/v1',
    status: stale ? 'stale' : 'fresh',
    staleReason: currentRevision !== previousRevision ? 'source-revision-changed' : overrideHash !== previousOverrideHash ? 'override-revision-changed' : '',
    previousSourceRevision: previousRevision,
    currentSourceRevision: currentRevision,
    previousOverrideHash,
    currentOverrideHash: overrideHash,
    previousMarkerCount: previousBuild.markers?.length || 0,
    currentMarkerCount: next.markers?.length || 0,
  };
}

export function buildNodeMarkerJson(markersOrTables, options = {}) {
  const payload = Array.isArray(markersOrTables)
    ? { schema: 'non-primitive-node-marker-json/v1', markers: markersOrTables, tables: buildNodeMarkerXmlCiiTables(markersOrTables, options) }
    : { schema: 'non-primitive-node-marker-json/v1', tables: markersOrTables };
  payload.generatedAt = options.generatedAt || new Date(0).toISOString();
  payload.payloadHash = stableHash(payload);
  return payload;
}

export function getDiagnostics() { return lastBuild?.diagnostics || null; }
export function getLastBuild() { return lastBuild; }

export function installNodeMarkerApi(target = globalThis) {
  if (!target) return null;
  if (target[GLOBAL_KEY]?.schema === NODE_MARKER_API_SCHEMA) return target[GLOBAL_KEY];
  const api = {
    schema: NODE_MARKER_API_SCHEMA,
    buildNodeMarkersFromSource,
    rebuildNodeMarkersFromSource,
    evaluateNodeMarkerStaleness,
    buildNodeMarkerXmlCiiTablesFromSource,
    buildNodeMarkerXmlCiiTablesFromMarkers,
    buildNodeMarkerBranchRows,
    buildNodeMarkerCoordinateRows,
    buildNodeMarkerWeightRows,
    buildNodeMarkerRestraintRows,
    buildNodeMarkerDtxrRows,
    buildNodeMarkerCsvForXmlCii,
    buildNodeMarkerJson,
    applyNodeMarkerOverrides,
    normalizeNodeMarkerOverrides,
    getDiagnostics,
    getLastBuild,
    installNodeMarkerApi,
  };
  target[GLOBAL_KEY] = api;
  return api;
}

function completeBuild(build, options = {}) {
  const overrideResult = applyNodeMarkerOverrides(build.markers, options.markerOverrides || options.overrides || []);
  build.rawMarkers = build.markers;
  build.markers = overrideResult.markers;
  build.overrideDiagnostics = overrideResult.diagnostics;
  build.diagnostics = {
    ...(build.diagnostics || {}),
    markerCount: build.markers.length,
    overrideCount: overrideResult.diagnostics.overrideCount,
    suppressedOverrideCount: overrideResult.diagnostics.suppressedCount,
    overrideHash: overrideResult.diagnostics.overrideHash,
  };
  build.tables = buildNodeMarkerXmlCiiTables(build.markers, { ...options, ...build.diagnostics });
  build.tableHash = build.tables?.tableHash || '';
  build.exportStatus = build.markers.some((marker) => marker.status === 'stale' || marker.status === 'unresolved') ? 'blocked' : 'fresh';
  return build;
}

installNodeMarkerApi(typeof window !== 'undefined' ? window : globalThis);

export { buildNodeMarkerCsvForXmlCii, applyNodeMarkerOverrides, normalizeNodeMarkerOverrides };
