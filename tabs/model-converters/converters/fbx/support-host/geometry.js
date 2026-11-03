import { triangulateSelection } from './topology.js';
import { compareText } from './vector.js';

function bounds(points) {
  const minMm = [Infinity, Infinity, Infinity], maxMm = [-Infinity, -Infinity, -Infinity];
  for (const point of points) for (let axis = 0; axis < 3; axis += 1) {
    minMm[axis] = Math.min(minMm[axis], point[axis]);
    maxMm[axis] = Math.max(maxMm[axis], point[axis]);
  }
  return { minMm, maxMm, extentMm: maxMm.map((value, axis) => value - minMm[axis]) };
}

function selectionIndex(selections) {
  return new Map((selections || []).map((selection) => (
    [selection.geometry.geometryObjectId, selection]
  )));
}

function occurrenceIndex(scope) {
  return new Map((scope?.selectedOccurrences || []).map((occurrence) => (
    [occurrence.sourceOccurrenceId, occurrence]
  )));
}

function resourceCounts(derived) {
  return derived.reduce((counts, item) => {
    counts.polygons += item.polygonCount;
    counts.vertexReferences += item.vertexReferenceCount;
    counts.triangles += item.triangles.length;
    return counts;
  }, { polygons: 0, vertexReferences: 0, triangles: 0 });
}

function requireCandidateLimits(counts, profile) {
  if (counts.polygons > profile.maximumPolygonsPerCandidate
      || counts.vertexReferences > profile.maximumVertexReferencesPerCandidate
      || counts.triangles > profile.maximumTrianglesPerCandidate) {
    throw new Error('BLOCKED_SUPPORT_HOST_RESOURCE candidate topology limit exceeded.');
  }
}

function blockedRecord(candidate, occurrence, geometryObjectIds, reason) {
  return Object.freeze({
    candidate, occurrence, geometryObjectIds: Object.freeze(geometryObjectIds),
    geometryDisposition: 'BLOCKED', reasons: Object.freeze([reason]),
    triangles: Object.freeze([]), points: Object.freeze([]), bounds: null,
    counts: Object.freeze({ polygons: 0, vertexReferences: 0, triangles: 0 }),
  });
}

function buildCandidateGeometry(candidate, occurrence, selectionsById, profile) {
  const geometryObjectIds = [...new Set(occurrence.geometryObjectIds || [])].sort(compareText);
  if (!geometryObjectIds.length) {
    return blockedRecord(candidate, occurrence, geometryObjectIds, 'CANDIDATE_HAS_NO_SELECTED_GEOMETRY');
  }
  const selected = geometryObjectIds.map((id) => selectionsById.get(id));
  if (selected.some((item) => !item)) {
    return blockedRecord(candidate, occurrence, geometryObjectIds,
      'CANDIDATE_GEOMETRY_SELECTION_MISSING');
  }
  let derived;
  try {
    derived = selected.map((selection) => triangulateSelection(selection, occurrence, profile));
  } catch (error) {
    return blockedRecord(candidate, occurrence, geometryObjectIds,
      String(error?.message || error).split(' ')[0]);
  }
  const counts = resourceCounts(derived);
  requireCandidateLimits(counts, profile);
  const rejected = derived.flatMap((item) => item.rejectedPolygonKeys);
  const triangles = derived.flatMap((item) => item.triangles);
  const points = derived.flatMap((item) => item.points);
  const reasons = [];
  if (!triangles.length) reasons.push('CANDIDATE_HAS_NO_TRIANGULATED_SURFACE');
  if (rejected.length) reasons.push('CANDIDATE_HAS_UNTRIANGULATED_POLYGONS');
  return Object.freeze({
    candidate, occurrence, geometryObjectIds: Object.freeze(geometryObjectIds),
    geometryDisposition: reasons.length ? 'BLOCKED' : 'ELIGIBLE',
    reasons: Object.freeze(reasons), triangles: Object.freeze(triangles),
    points: Object.freeze(points), bounds: points.length ? Object.freeze(bounds(points)) : null,
    counts: Object.freeze(counts),
  });
}

export function buildSupportCandidateGeometry({
  supportEvidence, scope, selections, profile,
} = {}) {
  if (supportEvidence?.schema !== 'FbxSupportEvidence.v1'
      || !Array.isArray(supportEvidence.candidates)
      || !Array.isArray(scope?.selectedOccurrences)
      || !Array.isArray(selections)) {
    throw new Error('BLOCKED_SUPPORT_HOST_BINDING candidate geometry inputs are invalid.');
  }
  if (supportEvidence.candidates.length > profile.maximumCandidates) {
    throw new Error('BLOCKED_SUPPORT_HOST_RESOURCE candidate count exceeds the approved limit.');
  }
  const occurrences = occurrenceIndex(scope), selectionsById = selectionIndex(selections);
  const records = supportEvidence.candidates.map((candidate) => {
    const occurrence = occurrences.get(candidate.occurrenceId);
    if (!occurrence) {
      throw new Error(`BLOCKED_SUPPORT_HOST_BINDING candidate ${candidate.candidateId} is outside scope.`);
    }
    return buildCandidateGeometry(candidate, occurrence, selectionsById, profile);
  });
  const totalTriangles = records.reduce((sum, item) => sum + item.counts.triangles, 0);
  if (totalTriangles > profile.maximumTrianglesPerZone) {
    throw new Error('BLOCKED_SUPPORT_HOST_RESOURCE zone triangle limit exceeded.');
  }
  return Object.freeze(records.sort((left, right) => compareText(
    left.candidate.candidateId, right.candidate.candidateId)));
}
