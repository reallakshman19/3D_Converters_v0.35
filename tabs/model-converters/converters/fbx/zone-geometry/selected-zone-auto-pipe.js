// Rank bounded source-graph zones, then qualify one zone at a time with the
// existing exact auto-pipe classifier. Whole-model orchestration stays separate.
import { canonicalJson } from '../canonical-json.js';
import { analyseFbxZoneGeometry } from './analyse-zone.js?v=20260729-fbx2-direct-pipe-1';
import { listFbxZoneScopeSummaries } from './zone-scope.js';
import { mergeWholeModelBranches } from './whole-model-identities.js';

export const FBX_SELECTED_ZONE_AUTO_PIPE_POLICY = 'FbxSelectedZoneAutoPipePolicy.v1';
export const STAGEDJSON_SELECTED_ZONE_PASS = 'STAGEDJSON_SELECTED_ZONE_PASS';
export const SELECTED_ZONE_EVIDENCE_PASS = 'SELECTED_ZONE_EVIDENCE_PASS';
export const BLOCKED_SELECTED_ZONE_AUTO_PIPE = 'BLOCKED_SELECTED_ZONE_AUTO_PIPE';

const DEFAULT_MAX_GEOMETRIES = 2000;
const DEFAULT_MAX_SOURCE_POINTS = 2000000;
const DEFAULT_MAX_ATTEMPTS = 1;
const MAX_MAX_ATTEMPTS = 12;
const SHAPE_SAMPLE_LIMIT = 512;
const PIPE_NAME = /(^|[^A-Z0-9])(PIPE|PIPING|PIPELINE|FLOWLINE|FL|PL|SPOOL|TUBE|TUBING)([^A-Z0-9]|$)/i;
const NON_PIPE_NAME = /(^|[^A-Z0-9])(TEE|SUPP|SUPPORT|VALVE|FLANGE|ELBOW|REDUCER|GASK|BOLT|MEQP|EQUIP|BUILDING|STRUCTURE|CABLE|TRAY|EQUIPMENT)([^A-Z0-9]|$)/i;

function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}
function sampledBounds(points) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const stride = Math.max(1, Math.ceil(points.length / SHAPE_SAMPLE_LIMIT));
  for (let index = 0; index < points.length; index += stride) {
    const point = points[index];
    if (!Array.isArray(point) || point.length < 3) continue;
    for (let axis = 0; axis < 3; axis += 1) {
      const value = point[axis];
      if (!Number.isFinite(value)) continue;
      min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
    }
  }
  return min.map((value, axis) => max[axis] - value);
}
function pipeShapeHint(geometry) {
  const points = geometry?.kind === 'MESH' ? geometry.verticesMm : null;
  if (!Array.isArray(points) || points.length < 8) return 0;
  const extents = sampledBounds(points).filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (extents.length !== 3) return 0;
  const slenderness = extents[2] / extents[1], crossSectionRatio = extents[0] / extents[1];
  return slenderness >= 2.5 && crossSectionRatio >= 0.35 ? 1 : 0;
}
function geometryName(geometry, sourceById) {
  const source = sourceById.get(geometry?.sourceObjectId);
  return [source?.displayName, source?.domSourceName, source?.domSubtype].filter(Boolean).join(' ');
}
function candidateEvidence(summary, maps, shapeCache, limits) {
  let pipeLikeGeometryCount = 0, positiveNames = PIPE_NAME.test(summary.label) ? 1 : 0;
  let negativeNames = NON_PIPE_NAME.test(summary.label) ? 1 : 0;
  for (const id of summary.selectedGeometryIds) {
    const geometry = maps.geometryById.get(id);
    if (!shapeCache.has(id)) shapeCache.set(id, pipeShapeHint(geometry));
    pipeLikeGeometryCount += shapeCache.get(id);
    const name = geometryName(geometry, maps.sourceById);
    positiveNames += PIPE_NAME.test(name) ? 1 : 0;
    negativeNames += NON_PIPE_NAME.test(name) ? 1 : 0;
  }
  const eligible = summary.selectedGeometryCount <= limits.maxGeometries
    && summary.sourcePointCount <= limits.maxSourcePoints;
  return { ...summary, eligible, positiveNames, negativeNames,
    pipeLikeGeometryCount, pipeLikeRatio: summary.selectedGeometryCount
      ? pipeLikeGeometryCount / summary.selectedGeometryCount : 0 };
}
function compareCandidates(left, right) {
  if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
  const leftPenalty = left.negativeNames > left.positiveNames ? 1 : 0;
  const rightPenalty = right.negativeNames > right.positiveNames ? 1 : 0;
  if (leftPenalty !== rightPenalty) return leftPenalty - rightPenalty;
  const leftNames = left.positiveNames - left.negativeNames;
  const rightNames = right.positiveNames - right.negativeNames;
  if (leftNames !== rightNames) return rightNames - leftNames;
  if (left.pipeLikeRatio !== right.pipeLikeRatio) return right.pipeLikeRatio - left.pipeLikeRatio;
  if (left.pipeLikeGeometryCount !== right.pipeLikeGeometryCount) {
    return right.pipeLikeGeometryCount - left.pipeLikeGeometryCount;
  }
  return left.selectedGeometryCount - right.selectedGeometryCount
    || left.sourcePointCount - right.sourcePointCount
    || compareText(left.label, right.label) || compareText(left.zoneId, right.zoneId);
}
function selectedEvidence(candidate, metadata, reason, rank) {
  return Object.freeze({
    policy: FBX_SELECTED_ZONE_AUTO_PIPE_POLICY, reason, rank,
    zoneId: candidate.zoneId, label: candidate.label,
    sourcePointCount: candidate.sourcePointCount,
    selectedOccurrenceCount: candidate.selectedOccurrenceCount,
    selectedGeometryCount: candidate.selectedGeometryCount,
    pipeLikeGeometryCount: candidate.pipeLikeGeometryCount,
    pipeLikeRatio: candidate.pipeLikeRatio,
    positiveNameHints: candidate.positiveNames,
    negativeNameHints: candidate.negativeNames,
    candidateCount: metadata.candidateCount,
    eligibleCandidateCount: metadata.eligibleCandidateCount,
  });
}
function rankedCandidateData(sourceGraph, options) {
  const summaries = listFbxZoneScopeSummaries(sourceGraph);
  if (!summaries.length) throw new Error(`${BLOCKED_SELECTED_ZONE_AUTO_PIPE} no mesh-bearing zone is available.`);
  const maps = {
    geometryById: new Map(sourceGraph.geometries.map((item) => [item.geometryObjectId, item])),
    sourceById: new Map(sourceGraph.sourceObjects.map((item) => [item.sourceObjectId, item])),
  };
  const limits = {
    maxGeometries: positiveInteger(options.maxGeometries, DEFAULT_MAX_GEOMETRIES),
    maxSourcePoints: positiveInteger(options.maxSourcePoints, DEFAULT_MAX_SOURCE_POINTS),
  };
  const shapeCache = new Map();
  return summaries.map((item) => candidateEvidence(item, maps, shapeCache, limits))
    .sort(compareCandidates);
}
export function rankFbxAutoPipeZones(sourceGraph, options = {}) {
  const ranked = rankedCandidateData(sourceGraph, options);
  const metadata = { candidateCount: ranked.length,
    eligibleCandidateCount: ranked.filter((item) => item.eligible).length };
  const requested = options.zoneId
    ? ranked.find((item) => item.zoneId === options.zoneId) : null;
  if (options.zoneId && !requested) throw new Error(
    `${BLOCKED_SELECTED_ZONE_AUTO_PIPE} requested zone ${options.zoneId} is unavailable.`);
  if (requested && !requested.eligible) throw new Error(
    `${BLOCKED_SELECTED_ZONE_AUTO_PIPE} requested zone exceeds the automatic resource ceiling.`);
  const eligible = requested ? [requested] : ranked.filter((item) => item.eligible);
  if (!eligible.length) throw new Error(
    `${BLOCKED_SELECTED_ZONE_AUTO_PIPE} every zone exceeds the automatic resource ceiling.`);
  const reason = requested ? 'explicit-zone' : 'ranked-source-graph';
  return Object.freeze(eligible.map((item, index) =>
    selectedEvidence(item, metadata, reason, index + 1)));
}
export function selectFbxAutoPipeZone(sourceGraph, options = {}) {
  return rankFbxAutoPipeZones(sourceGraph, options)[0];
}
function validatedBranches(text) {
  const value = JSON.parse(text);
  if (!Array.isArray(value) || value.some((branch) => !branch || branch.type !== 'BRANCH'
    || !Array.isArray(branch.children) || !branch.children.length)) {
    throw new Error('STAGEDJSON_PASS selected-zone payload is malformed.');
  }
  return value;
}
function reportFor(selection, status, admittedPipes, error = null) {
  return { zoneId: selection.zoneId, label: selection.label, rank: selection.rank,
    status, admittedPipes, error };
}
function countsFor(candidates, reports, branches = 0, evidenceZones = 0) {
  const passedZones = reports.filter((item) => item.status === 'STAGEDJSON_PASS').length;
  const errorZones = reports.filter((item) => item.status === 'ERROR').length;
  return { totalZones: candidates[0]?.candidateCount || 0,
    eligibleZones: candidates[0]?.eligibleCandidateCount || 0,
    attemptedZones: reports.length, passedZones, evidenceZones,
    blockedZones: reports.length - passedZones - errorZones,
    errorZones, branches };
}
function blocked(candidates, reports, reason) {
  return { conversionStatus: BLOCKED_SELECTED_ZONE_AUTO_PIPE, stagedJsonText: null,
    selectedZone: null, candidateZones: candidates, zoneReports: reports,
    duplicateIdentifiers: [], unresolvedCrefs: [], blockingReasons: [reason],
    counts: countsFor(candidates, reports) };
}
async function qualifyCandidate(input, selection) {
  try {
    input.onAttempt?.(selection);
    const result = await input.analyse({ sourceGraph: input.sourceGraph,
      geometryBundle: input.geometryBundle, zoneId: selection.zoneId,
      includeZonePackageInputs: true });
    const status = result?.autoPipe?.status || 'UNKNOWN';
    return { selection, result, report: reportFor(selection, status,
      result?.counts?.admittedPipes || 0, result?.autoPipe?.error || null) };
  } catch (error) {
    const message = error?.message || String(error);
    return { selection, result: null,
      report: reportFor(selection, 'ERROR', 0, message) };
  }
}
function analysisEvidence(qualified) {
  const result = qualified.result;
  return Object.freeze({
    zoneGeometryEvidence: result.zoneGeometryEvidence,
    derivedPortEvidence: result.derivedPortEvidence,
    zonePackageManifest: result.zonePackageInputs?.manifest || null,
    zonePackageError: result.zonePackageError,
    counts: result.counts,
    autoPipeStatus: result.autoPipe?.status || 'UNKNOWN',
    autoPipeCounts: result.autoPipe?.counts || null,
    classificationStatus: result.autoPipe?.classificationStatus || null,
    classificationDispositions: result.autoPipe?.classificationDispositions || [],
    autoPipeError: result.autoPipe?.error || null,
  });
}
function evidenceResult(candidates, attempts, qualified) {
  const status = qualified.report.status;
  return { conversionStatus: SELECTED_ZONE_EVIDENCE_PASS, stagedJsonText: null,
    selectedZone: qualified.selection, candidateZones: candidates,
    selectedZoneAnalysis: analysisEvidence(qualified), zoneReports: attempts,
    duplicateIdentifiers: [], unresolvedCrefs: [],
    blockingReasons: [`PIPE_INFERENCE_NOT_RELEASED:${status}`],
    counts: countsFor(candidates, attempts, 0, 1) };
}
async function successfulResult(candidates, attempts, qualified) {
  const branches = validatedBranches(qualified.result.autoPipe.stagedJsonText);
  const identity = await mergeWholeModelBranches([
    { zoneId: qualified.selection.zoneId, status: 'STAGEDJSON_PASS', branches },
  ]);
  if (identity.duplicateIdentifiers.length || identity.unresolvedCrefs.length) {
    return { ...blocked(candidates, attempts, 'SELECTED_ZONE_IDENTITY_INVALID'), ...identity };
  }
  return { conversionStatus: STAGEDJSON_SELECTED_ZONE_PASS,
    stagedJsonText: canonicalJson(identity.merged), selectedZone: qualified.selection,
    selectedZoneAnalysis: analysisEvidence(qualified),
    candidateZones: candidates, zoneReports: attempts,
    duplicateIdentifiers: [], unresolvedCrefs: [], blockingReasons: [],
    counts: countsFor(candidates, attempts, identity.merged.length, 1) };
}
export async function runFbxSelectedZoneAutoPipe({
  sourceGraph, geometryBundle, selection, selections, options = {},
  analyse = analyseFbxZoneGeometry, onAttempt,
} = {}) {
  let candidates;
  try {
    candidates = selection ? [selection]
      : selections || rankFbxAutoPipeZones(sourceGraph, options);
    const limit = selection || options.zoneId ? 1
      : positiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS, MAX_MAX_ATTEMPTS);
    const attempts = [], input = { sourceGraph, geometryBundle, analyse, onAttempt };
    let firstEvidence = null;
    for (const candidate of candidates.slice(0, limit)) {
      const qualified = await qualifyCandidate(input, candidate);
      attempts.push(qualified.report);
      if (qualified.result && !firstEvidence) firstEvidence = qualified;
      if (qualified.report.status === 'STAGEDJSON_PASS') {
        return successfulResult(candidates, attempts, qualified);
      }
    }
    if (firstEvidence) return evidenceResult(candidates, attempts, firstEvidence);
    return blocked(candidates, attempts,
      `NO_ZONE_EVIDENCE_PASSED_WITHIN_ATTEMPT_LIMIT:${Math.min(limit, candidates.length)}`);
  } catch (error) {
    const message = error?.message || String(error);
    const fallback = candidates || [];
    const report = reportFor(fallback[0] || { zoneId: null, label: null, rank: null },
      'ERROR', 0, message);
    return blocked(fallback, [report], message);
  }
}
