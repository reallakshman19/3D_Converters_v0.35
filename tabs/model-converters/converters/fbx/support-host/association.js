import { canonicalJson } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import { scaledBound } from './profile.js';
import {
  add, compareText, distance, dot, midpoint, normalize, scale, subtract,
} from './vector.js';

function finitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function pipeCylinder(classification) {
  if (!classification?.admitted) return null;
  const originMm = classification.A?.centreMm;
  const endMm = classification.L?.centreMm;
  const axis = normalize(classification.axis || (
    originMm && endMm ? subtract(endMm, originMm) : null
  ));
  const spanMm = classification.spanMm
    || (originMm && endMm ? distance(originMm, endMm) : null);
  const radii = [classification.A?.radiusMm, classification.L?.radiusMm]
    .filter(finitePositive);
  const radiusMm = radii.length === 2 ? (radii[0] + radii[1]) / 2 : null;
  if (!originMm || !endMm || !axis || !finitePositive(spanMm) || !finitePositive(radiusMm)) {
    throw new Error('BLOCKED_SUPPORT_HOST_BINDING admitted PIPE cylinder evidence is invalid.');
  }
  return Object.freeze({
    sourceOccurrenceId: classification.sourceOccurrenceId,
    sourceModelObjectId: classification.sourceModelObjectId,
    geometryObjectId: classification.geometryObjectId,
    originMm: Object.freeze([...originMm]), endMm: Object.freeze([...endMm]),
    axis: Object.freeze(axis), radiusMm, spanMm,
  });
}

export function buildPipeHostAuthority(classifications = [], profile) {
  if (!Array.isArray(classifications)) {
    throw new Error('BLOCKED_SUPPORT_HOST_BINDING PIPE classifications must be an array.');
  }
  const admitted = classifications.filter((item) => item?.admitted);
  if (admitted.length > profile.maximumAdmittedPipes) {
    throw new Error('BLOCKED_SUPPORT_HOST_RESOURCE admitted PIPE count exceeds the approved limit.');
  }
  const occurrences = new Set(), geometries = new Set();
  const cylinders = admitted.map((classification) => {
    if (occurrences.has(classification.sourceOccurrenceId)
        || geometries.has(classification.geometryObjectId)) {
      throw new Error('BLOCKED_SUPPORT_HOST_BINDING PIPE host authority is not exclusive.');
    }
    occurrences.add(classification.sourceOccurrenceId);
    geometries.add(classification.geometryObjectId);
    return pipeCylinder(classification);
  }).sort((left, right) => compareText(left.sourceOccurrenceId, right.sourceOccurrenceId));
  return Object.freeze({
    cylinders: Object.freeze(cylinders),
    admittedPipeCount: cylinders.length,
    rejectedPipeCount: classifications.length - admitted.length,
  });
}

function pipeSearchBounds(pipe, searchRadius) {
  return Object.freeze({
    minMm: pipe.originMm.map((value, axis) => (
      Math.min(value, pipe.endMm[axis]) - pipe.radiusMm - searchRadius
    )),
    maxMm: pipe.originMm.map((value, axis) => (
      Math.max(value, pipe.endMm[axis]) + pipe.radiusMm + searchRadius
    )),
  });
}

function boundsIntersect(left, right) {
  return left.minMm.every((minimum, axis) => (
    minimum <= right.maxMm[axis] && right.minMm[axis] <= left.maxMm[axis]
  ));
}

function samplePoints(points) {
  const centroid = scale(points.reduce((sum, point) => add(sum, point), [0, 0, 0]), 1 / 3);
  return [
    ...points,
    midpoint(points[0], points[1]),
    midpoint(points[1], points[2]),
    midpoint(points[2], points[0]),
    centroid,
  ];
}

function pointWitness(point, pipe, clearance) {
  const offset = subtract(point, pipe.originMm), axialMm = dot(offset, pipe.axis);
  if (axialMm < -clearance || axialMm > pipe.spanMm + clearance) return null;
  const centrelineMm = add(pipe.originMm, scale(pipe.axis, axialMm));
  const radial = subtract(point, centrelineMm), radialDistance = Math.hypot(...radial);
  if (!finitePositive(radialDistance)) return null;
  const surfaceDistanceMm = Math.abs(radialDistance - pipe.radiusMm);
  if (surfaceDistanceMm > clearance) return null;
  const radialDirection = scale(radial, 1 / radialDistance);
  return Object.freeze({
    pointMm: Object.freeze([...point]), axialMm,
    centrelineMm: Object.freeze(centrelineMm),
    pipeSurfaceMm: Object.freeze(add(centrelineMm, scale(radialDirection, pipe.radiusMm))),
    radialDirection: Object.freeze(radialDirection), surfaceDistanceMm,
  });
}

function contactRegion(triangle, pipe, profile, clearance) {
  const minimumCosine = Math.cos(profile.contactNormalToleranceDegrees * Math.PI / 180);
  const witnesses = samplePoints(triangle.points)
    .map((point) => pointWitness(point, pipe, clearance)).filter(Boolean);
  const aligned = witnesses.filter((item) => (
    Math.abs(dot(triangle.normal, item.radialDirection)) >= minimumCosine
  ));
  const unique = new Map(aligned.map((item) => [
    item.pointMm.map((value) => value.toPrecision(17)).join('|'), item,
  ]));
  if (unique.size < profile.minimumContactWitnessCount) return null;
  const accepted = [...unique.values()];
  return Object.freeze({
    geometryObjectId: triangle.geometryObjectId,
    polygonKey: triangle.polygonKey,
    sourceVertexIndices: Object.freeze([...triangle.indices]),
    witnessPointsMm: Object.freeze(accepted.map((item) => item.pointMm)),
    pipeSurfacePointsMm: Object.freeze(accepted.map((item) => item.pipeSurfaceMm)),
    pipeCentrelinePointsMm: Object.freeze(accepted.map((item) => item.centrelineMm)),
    minimumNormalRadialCosine: Math.min(...accepted.map((item) => (
      Math.abs(dot(triangle.normal, item.radialDirection))
    ))),
    maximumSurfaceDistanceMm: Math.max(...accepted.map((item) => item.surfaceDistanceMm)),
    axialValuesMm: Object.freeze(accepted.map((item) => item.axialMm)),
  });
}

function structuralContinuation(points, pipe, threshold) {
  return points.some((point) => {
    const offset = subtract(point, pipe.originMm);
    const axial = Math.max(0, Math.min(pipe.spanMm, dot(offset, pipe.axis)));
    const centreline = add(pipe.originMm, scale(pipe.axis, axial));
    return Math.abs(distance(point, centreline) - pipe.radiusMm) >= threshold;
  });
}

function contactDraft(candidateGeometry, pipe, profile) {
  const diameter = pipe.radiusMm * 2;
  const clearanceMm = scaledBound(profile.contactClearanceAbsoluteMm,
    profile.contactClearanceMaximumMm, profile.contactClearanceDiameterRatio, diameter);
  const regions = candidateGeometry.triangles.map((triangle) => (
    contactRegion(triangle, pipe, profile, clearanceMm)
  )).filter(Boolean);
  if (regions.length < profile.minimumContactTriangleCount) return null;
  const witnesses = new Map();
  for (const region of regions) region.witnessPointsMm.forEach((point, index) => {
    const key = point.map((value) => value.toPrecision(17)).join('|');
    witnesses.set(key, region.axialValuesMm[index]);
  });
  if (witnesses.size < profile.minimumContactWitnessCount) return null;
  const axial = [...witnesses.values()], axialOverlapMm = Math.max(...axial) - Math.min(...axial);
  const minimumOverlap = scaledBound(profile.minimumAxialContactOverlapAbsoluteMm,
    profile.minimumAxialContactOverlapMaximumMm,
    profile.minimumAxialContactOverlapDiameterRatio, diameter);
  const continuation = scaledBound(profile.minimumStructuralContinuationAbsoluteMm,
    profile.minimumStructuralContinuationMaximumMm,
    profile.minimumStructuralContinuationDiameterRatio, diameter);
  if (axialOverlapMm < minimumOverlap
      || !structuralContinuation(candidateGeometry.points, pipe, continuation)) return null;
  return Object.freeze({
    candidateId: candidateGeometry.candidate.candidateId,
    candidateOccurrenceId: candidateGeometry.candidate.occurrenceId,
    pipe, clearanceMm, axialOverlapMm,
    witnessCount: witnesses.size, contactTriangleCount: regions.length,
    maximumSurfaceDistanceMm: Math.max(...regions.map((item) => item.maximumSurfaceDistanceMm)),
    contactRegions: Object.freeze(regions),
  });
}

function sameCylinder(left, right, profile) {
  const position = profile.duplicateCylinderPositionToleranceMm;
  const direction = profile.duplicateCylinderDirectionTolerance;
  return distance(left.originMm, right.originMm) <= position
    && distance(left.endMm, right.endMm) <= position
    && Math.abs(left.radiusMm - right.radiusMm) <= position
    && Math.abs(1 - Math.abs(dot(left.axis, right.axis))) <= direction;
}

function hasDuplicateCylinder(associations, profile) {
  for (let left = 0; left < associations.length; left += 1) {
    for (let right = left + 1; right < associations.length; right += 1) {
      if (sameCylinder(associations[left].pipe, associations[right].pipe, profile)) return true;
    }
  }
  return false;
}

async function identifiedAssociation(draft) {
  const core = {
    candidateId: draft.candidateId,
    candidateOccurrenceId: draft.candidateOccurrenceId,
    hostPipeOccurrenceId: draft.pipe.sourceOccurrenceId,
    hostPipeSourceModelObjectId: draft.pipe.sourceModelObjectId,
    hostPipeGeometryObjectId: draft.pipe.geometryObjectId,
    pipe: {
      originMm: draft.pipe.originMm, endMm: draft.pipe.endMm,
      axis: draft.pipe.axis, radiusMm: draft.pipe.radiusMm, spanMm: draft.pipe.spanMm,
    },
    contact: {
      clearanceMm: draft.clearanceMm, axialOverlapMm: draft.axialOverlapMm,
      witnessCount: draft.witnessCount, contactTriangleCount: draft.contactTriangleCount,
      maximumSurfaceDistanceMm: draft.maximumSurfaceDistanceMm,
      regions: draft.contactRegions,
    },
  };
  const digest = await sha256Hex(canonicalJson(core));
  return Object.freeze({ associationId: `FBXSHA-${digest.slice(0, 32)}`, ...core });
}

function hostDisposition(associations, profile) {
  if (!associations.length) return 'HOST_NOT_FOUND';
  if (hasDuplicateCylinder(associations, profile)) return 'HOST_AMBIGUOUS';
  return associations.length === 1 ? 'SINGLE_HOST_PROVED' : 'MULTI_HOST_PROVED';
}

export async function associateCandidateHosts(candidateGeometry, authority, profile, pairCounter) {
  if (candidateGeometry.geometryDisposition !== 'ELIGIBLE') {
    return Object.freeze({ disposition: 'NOT_APPLICABLE', associations: Object.freeze([]) });
  }
  const drafts = [];
  for (const pipe of authority.cylinders) {
    if (!boundsIntersect(candidateGeometry.bounds,
      pipeSearchBounds(pipe, profile.maximumPipeSearchRadiusMm))) continue;
    pairCounter.count += 1;
    if (pairCounter.count > profile.maximumCandidateHostPairs) {
      throw new Error('BLOCKED_SUPPORT_HOST_RESOURCE candidate-host pair limit exceeded.');
    }
    const draft = contactDraft(candidateGeometry, pipe, profile);
    if (draft) drafts.push(draft);
  }
  const associations = await Promise.all(drafts.map(identifiedAssociation));
  associations.sort((left, right) => compareText(left.associationId, right.associationId));
  return Object.freeze({
    disposition: hostDisposition(associations, profile),
    associations: Object.freeze(associations),
  });
}
