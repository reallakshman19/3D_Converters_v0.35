import { fitBoundaryCircleLocal } from '../zone-geometry/circle-fit.js';
import { transformBoundaryFit } from '../zone-geometry/occurrence-transform.js?v=20260729-fbx2-direct-pipe-1';
import { evidenceId } from '../zone-geometry/identity.js';

function subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

// A rectangle's four corners lie exactly on a circle, so circularity alone
// cannot tell a real disc-shaped cap from an elongated wall-facet quad. The
// enclosed area of a genuine N-gon disc approaches its circumscribed circle's
// area as N grows; an elongated rectangle fills only a small fraction of it.
function ringAreaRatio(points, radius) {
  const centroid = points.reduce((acc, point) => [
    acc[0] + point[0], acc[1] + point[1], acc[2] + point[2],
  ], [0, 0, 0]).map((value) => value / points.length);
  const sum = [0, 0, 0];
  for (let index = 0; index < points.length; index += 1) {
    const a = subtract(points[index], centroid), b = subtract(points[(index + 1) % points.length], centroid);
    const c = cross(a, b);
    sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2];
  }
  const area = 0.5 * Math.hypot(...sum);
  return area / (Math.PI * radius * radius);
}

function fitRingLoop(occurrence, points, profile) {
  const fit = fitBoundaryCircleLocal(points);
  if (fit.rejectionReasons.length) return { rejectionReasons: fit.rejectionReasons };
  if (!(ringAreaRatio(points, fit.radius) >= profile.minimumRegionAreaRatio)) {
    return { rejectionReasons: ['NON_CIRCULAR'] };
  }
  const transformed = transformBoundaryFit(occurrence, fit, points);
  if (transformed.rejectionReasons.length) return { rejectionReasons: transformed.rejectionReasons };
  return { transformed };
}

function rejectedCandidate(base, reasons) {
  return {
    ...base, centreMm: null, normal: null, radiusMm: null, diameterMm: null,
    innerRadiusMm: null, admissionDisposition: 'REJECTED', rejectionReasons: reasons,
  };
}

function admittedCandidate(base, transformed, inner) {
  return {
    ...base, centreMm: transformed.centreMm, normal: transformed.normal,
    radiusMm: transformed.radiusMm, diameterMm: transformed.diameterMm,
    innerRadiusMm: inner ? inner.radiusMm : null,
    admissionDisposition: 'ADMITTED', rejectionReasons: [],
  };
}

async function buildCandidate(base, outcome) {
  const capRingId = await evidenceId('FbxSolidFittingCapRegion.v1', 'cap-ring', {
    sourceOccurrenceId: base.sourceOccurrenceId,
    geometryObjectId: base.geometryObjectId,
    shellId: base.shellId,
    faceIds: base.faceIds,
  });
  return {
    capRingId, portEvidenceId: capRingId, boundaryLoopId: capRingId, ...outcome,
  };
}

export async function evaluateCapRegions(occurrence, geometryObjectId, shellId, regions, profile) {
  const candidates = [];
  for (const region of regions) {
    const base = {
      sourceOccurrenceId: occurrence.sourceOccurrenceId, geometryObjectId, shellId,
      faceIds: region.faceIds,
    };
    const fits = region.ringLoops.map((points) => ({ points, result: fitRingLoop(occurrence, points, profile) }));
    const admitted = fits.filter((item) => item.result.transformed)
      .sort((a, b) => b.result.transformed.radiusMm - a.result.transformed.radiusMm);
    if (!admitted.length) {
      const worst = fits.sort((a, b) => b.points.length - a.points.length)[0];
      candidates.push(await buildCandidate(base, rejectedCandidate(base, worst.result.rejectionReasons)));
      continue;
    }
    candidates.push(await buildCandidate(base,
      admittedCandidate(base, admitted[0].result.transformed, admitted[1]?.result.transformed)));
  }
  return candidates;
}
