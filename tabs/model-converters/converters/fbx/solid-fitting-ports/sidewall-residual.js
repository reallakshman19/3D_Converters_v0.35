import { transformPoint } from '../transform-policy.js?v=20260729-fbx2-direct-pipe-1';
import { decodeExactPolygonTopology } from '../zone-geometry/polygon-topology.js';
import { dot, finiteVector, subtract } from '../auto-pipe/vector.js';
import { scaledTolerance } from '../auto-pipe/profile.js';

function sidewallIndices(topology, capFaceIds) {
  const indices = new Set();
  for (const face of topology.faces) {
    if (capFaceIds.has(face.faceId)) continue;
    for (const index of face.vertices) indices.add(index);
  }
  return [...indices].sort((a, b) => a - b);
}

function inferredRadii(admitted, ports) {
  const outer = (ports.A.radiusMm + ports.L.radiusMm) / 2;
  const innerValues = admitted.map((item) => item.innerRadiusMm)
    .filter((value) => Number.isFinite(value) && value > 0 && value < outer);
  const inner = innerValues.length
    ? innerValues.reduce((sum, value) => sum + value, 0) / innerValues.length : null;
  return { outer, inner };
}

function pointResidual(point, ports, radii, profile) {
  if (!finiteVector(point)) return { valid: false, outer: false };
  const offset = subtract(point, ports.A.centreMm), axial = dot(offset, ports.axis);
  const axialTolerance = scaledTolerance(
    profile.axialAbsoluteMm, profile.axialSpanRatio, ports.spanMm);
  if (axial < -axialTolerance || axial > ports.spanMm + axialTolerance) {
    return { valid: false, outer: false };
  }
  const radialVector = subtract(offset, ports.axis.map((value) => value * axial));
  const radius = Math.hypot(...radialVector);
  const outerTolerance = scaledTolerance(
    profile.radialAbsoluteMm, profile.radialRadiusRatio, radii.outer);
  if (Math.abs(radius - radii.outer) <= outerTolerance) return { valid: true, outer: true };
  if (!radii.inner) return { valid: false, outer: false };
  const innerTolerance = scaledTolerance(
    profile.radialAbsoluteMm, profile.radialRadiusRatio, radii.inner);
  return { valid: Math.abs(radius - radii.inner) <= innerTolerance, outer: false };
}

export function closedSolidSidewallResiduals({
  occurrence, selection, record, ports, profile,
}) {
  const topology = decodeExactPolygonTopology(selection);
  const admitted = record.candidates.filter((item) => item.admissionDisposition === 'ADMITTED');
  const capFaceIds = new Set(admitted.flatMap((item) => item.faceIds));
  const indices = sidewallIndices(topology, capFaceIds);
  if (indices.length < 6) return false;
  const radii = inferredRadii(admitted, ports);
  let outerCount = 0;
  for (const index of indices) {
    const result = pointResidual(
      transformPoint(occurrence.geometryMatrixMm, topology.points[index]), ports, radii, profile);
    if (!result.valid) return false;
    if (result.outer) outerCount += 1;
  }
  return outerCount >= 6;
}
