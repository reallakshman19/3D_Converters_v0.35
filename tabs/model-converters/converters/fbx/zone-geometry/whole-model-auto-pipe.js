// Runs the existing per-zone auto-pipe classification across every preview
// zone and merges admitted StagedJSON with deterministic zone namespacing.
import { analyseFbxZoneGeometry } from './analyse-zone.js';
import { listFbxSourceGraphPreviewZones } from '../../../fbx-source-graph-preview.js';
import { UNOWNED_ZONE_ID } from './zone-scope.js';
import { canonicalJson } from '../canonical-json.js';
import { mergeWholeModelBranches } from './whole-model-identities.js';

const DEFAULT_CONCURRENCY = 4;
const MAX_ZONE_COUNT = 20000;
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function validatedZoneIds(sourceGraph, zoneIds) {
  const raw = Array.isArray(zoneIds)
    ? zoneIds
    : listFbxSourceGraphPreviewZones(sourceGraph).map((zone) => zone.zoneId);
  const ids = raw.filter((zoneId) => zoneId !== UNOWNED_ZONE_ID)
    .map((zoneId) => String(zoneId || '').trim());
  if (ids.some((zoneId) => !zoneId)) {
    throw new Error('BLOCKED_WHOLE_MODEL_AUTO_PIPE empty zone identity.');
  }
  if (ids.length > MAX_ZONE_COUNT) {
    throw new Error(`BLOCKED_WHOLE_MODEL_AUTO_PIPE zone count exceeds ${MAX_ZONE_COUNT}.`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error('BLOCKED_WHOLE_MODEL_AUTO_PIPE duplicate zone identity.');
  }
  return ids.sort(compareText);
}
function validatedBranches(value) {
  if (!Array.isArray(value)) throw new Error('STAGEDJSON_PASS payload must be an array.');
  for (const [index, branch] of value.entries()) {
    if (!branch || typeof branch !== 'object' || Array.isArray(branch)
        || branch.type !== 'BRANCH' || !Array.isArray(branch.children)
        || branch.children.length === 0) {
      throw new Error(`STAGEDJSON_PASS branch ${index} is malformed.`);
    }
  }
  return value;
}
async function analyseOneZone(analyse, sourceGraph, geometryBundle, zoneId) {
  try {
    const result = await analyse({
      sourceGraph, geometryBundle, zoneId, includeZonePackageInputs: false,
    });
    const status = result?.autoPipe?.status || 'UNKNOWN';
    const branches = status === 'STAGEDJSON_PASS'
      ? validatedBranches(JSON.parse(result.autoPipe.stagedJsonText)) : [];
    return { zoneId, status, branches,
      admittedPipes: result?.counts?.admittedPipes || 0, error: null };
  } catch (error) {
    return { zoneId, status: 'ERROR', branches: [], admittedPipes: 0,
      error: error?.message || String(error) };
  }
}
async function mapBounded(values, concurrency, worker) {
  const requested = Number.isSafeInteger(concurrency) ? concurrency : DEFAULT_CONCURRENCY;
  const limit = Math.max(1, Math.min(requested, values.length || 1));
  const results = new Array(values.length);
  let cursor = 0;
  async function runWorker() {
    while (cursor < values.length) {
      const index = cursor; cursor += 1;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, runWorker));
  return results;
}
function blockedResult(reason) {
  return { conversionStatus: 'BLOCKED_WHOLE_MODEL_AUTO_PIPE', stagedJsonText: null,
    zoneReports: [], duplicateIdentifiers: [], unresolvedCrefs: [],
    blockingReasons: [reason], counts: { totalZones: 0, passedZones: 0,
      blockedZones: 0, errorZones: 0, branches: 0 } };
}
function statusFor(ids, passedZones, merged, identityBlocked) {
  if (!merged.length || identityBlocked) return 'BLOCKED_WHOLE_MODEL_AUTO_PIPE';
  return passedZones === ids.length ? 'STAGEDJSON_PASS' : 'STAGEDJSON_PARTIAL_PASS';
}
export async function runFbxWholeModelAutoPipe({
  sourceGraph, geometryBundle, zoneIds, analyse = analyseFbxZoneGeometry,
  concurrency = DEFAULT_CONCURRENCY,
} = {}) {
  let ids;
  try { ids = validatedZoneIds(sourceGraph, zoneIds); }
  catch (error) { return blockedResult(error?.message || String(error)); }
  const zoneResults = await mapBounded(ids, concurrency,
    (zoneId) => analyseOneZone(analyse, sourceGraph, geometryBundle, zoneId));
  const { merged, duplicateIdentifiers, unresolvedCrefs } =
    await mergeWholeModelBranches(zoneResults);
  const passedZones = zoneResults.filter((zone) => zone.status === 'STAGEDJSON_PASS').length;
  const errorZones = zoneResults.filter((zone) => zone.status === 'ERROR').length;
  const blockedZones = ids.length - passedZones - errorZones;
  const identityBlocked = duplicateIdentifiers.length > 0 || unresolvedCrefs.length > 0;
  const conversionStatus = statusFor(ids, passedZones, merged, identityBlocked);
  const blockingReasons = [
    ...(duplicateIdentifiers.length
      ? [`DUPLICATE_IDENTIFIERS:${duplicateIdentifiers.join(',')}`] : []),
    ...(unresolvedCrefs.length ? [`UNRESOLVED_CREFS:${unresolvedCrefs.join(',')}`] : []),
  ];
  return { conversionStatus,
    stagedJsonText: conversionStatus === 'BLOCKED_WHOLE_MODEL_AUTO_PIPE'
      ? null : canonicalJson(merged),
    zoneReports: zoneResults.map(({ zoneId, status, admittedPipes, error }) =>
      ({ zoneId, status, admittedPipes, error })),
    duplicateIdentifiers, unresolvedCrefs, blockingReasons,
    counts: { totalZones: ids.length, passedZones, blockedZones,
      errorZones, branches: merged.length } };
}
