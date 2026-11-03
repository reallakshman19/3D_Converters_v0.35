import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import { classifyGeometryTopology } from './mesh-topology-classifier.js';
import { FBX_ZONE_PACKAGE_SCHEMAS, fail } from './constants.js';

const GOVERNED_DISPOSITIONS = Object.freeze([
  'CLOSED', 'CAPPED', 'MERGED', 'MULTI_SHELL', 'INVALID_TOPOLOGY', 'OTHER_GOVERNED',
]);
function ledgerEntry(manifestGeometry, raw) {
  const { disposition, reasonCode, stats } = classifyGeometryTopology(raw);
  if (!GOVERNED_DISPOSITIONS.includes(disposition)) fail('ZONE_PACKAGE_UNGOVERNED_DISPOSITION', `${disposition} is not a governed disposition.`);
  return { geometryId: manifestGeometry.geometryId, occurrenceIds: [...manifestGeometry.occurrenceIds], disposition, reasonCode, stats };
}
function summarize(entries) {
  const countsByDisposition = Object.fromEntries(GOVERNED_DISPOSITIONS.map((value) => [value, 0]));
  for (const entry of entries) countsByDisposition[entry.disposition] += 1;
  return { totalGeometries: entries.length, countsByDisposition };
}
function exactRawGeometryMap(geometries, manifestIds) {
  const rawById = new Map();
  for (const geometry of geometries) {
    const geometryId = String(geometry?.geometryId || '');
    if (!geometryId || rawById.has(geometryId)) {
      fail('ZONE_PACKAGE_UNEXPLAINED_GEOMETRY', `raw geometry identity ${geometryId || '<missing>'} is invalid or duplicate.`);
    }
    rawById.set(geometryId, geometry);
  }
  if (canonicalJson([...rawById.keys()].sort()) !== canonicalJson([...manifestIds].sort())) {
    fail('ZONE_PACKAGE_UNEXPLAINED_GEOMETRY', 'raw geometry set must match the manifest exactly.');
  }
  return rawById;
}
export async function buildSelectedZoneDiagnosticLedger({ manifest, geometries } = {}) {
  if (!manifest || manifest.schema !== FBX_ZONE_PACKAGE_SCHEMAS.geometryManifest) {
    fail('ZONE_PACKAGE_INVALID_INPUT', 'manifest must be an FbxSelectedZoneGeometryManifest.v1.');
  }
  if (!Array.isArray(geometries)) fail('ZONE_PACKAGE_INVALID_INPUT', 'geometries must be an array.');
  const manifestIds = manifest.geometries.map((entry) => entry.geometryId);
  const rawById = exactRawGeometryMap(geometries, manifestIds);
  const entries = manifest.geometries.map((entry) => ledgerEntry(entry, rawById.get(entry.geometryId)));
  const payload = { schema: FBX_ZONE_PACKAGE_SCHEMAS.diagnosticLedger,
    selectedZoneDigest: manifest.selectedZoneDigest, manifestDigest: manifest.manifestDigest,
    entries, summary: summarize(entries) };
  return deepFreeze({ ...payload, ledgerDigest: await sha256Hex(canonicalJson(payload)) });
}
