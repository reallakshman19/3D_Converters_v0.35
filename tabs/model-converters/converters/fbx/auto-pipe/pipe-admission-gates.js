import { transformPoint } from '../transform-policy.js';
import { compareText } from './identity.js';
import { scaledTolerance } from './profile.js';
import { dot, finiteVector, normalize, subtract } from './vector.js';

function compareCentre(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left.centreMm[index] < right.centreMm[index]) return -1;
    if (left.centreMm[index] > right.centreMm[index]) return 1;
  }
  return compareText(left.portEvidenceId, right.portEvidenceId);
}

function roleAssignment(left, right, profile) {
  if (!finiteVector(left.centreMm) || !finiteVector(right.centreMm)
      || !finiteVector(left.normal) || !finiteVector(right.normal)) return null;
  if (profile.roleOrdering !== 'world-centre-lexicographic'
      || compareCentre(left, right) >= 0) return null;
  const delta = subtract(right.centreMm, left.centreMm), span = Math.hypot(...delta);
  if (!(span > profile.minimumSpanMm)) return null;
  const axis = normalize(delta);
  if (!axis) return null;
  const aligned = dot(left.normal, axis) <= -1 + profile.normalDotTolerance
    && dot(right.normal, axis) >= 1 - profile.normalDotTolerance;
  return aligned ? { A: left, L: right, spanMm: span, axis } : null;
}

export function assignRoles(first, second, profile) {
  const assignments = [
    roleAssignment(first, second, profile),
    roleAssignment(second, first, profile),
  ].filter(Boolean);
  return assignments.length === 1 ? assignments[0] : null;
}

export function radiusMatches(ports, profile) {
  if (![ports.A.radiusMm, ports.L.radiusMm].every((value) => Number.isFinite(value) && value > 0)) {
    return false;
  }
  const scale = Math.max(ports.A.radiusMm, ports.L.radiusMm);
  const tolerance = scaledTolerance(profile.radiusAbsoluteMm, profile.radiusRatio, scale);
  return Math.abs(ports.A.radiusMm - ports.L.radiusMm) <= tolerance;
}

function float64View(value) {
  if (value instanceof ArrayBuffer) return new Float64Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Float64Array(value.buffer, value.byteOffset, value.byteLength / 8);
  }
  return null;
}

function localControlPoints(selection) {
  const item = selection?.buffers.find((buffer) => buffer.role === 'control-points-mm');
  const view = float64View(item?.buffer?.bytes);
  if (!view || view.length % 3 !== 0) return [];
  const points = [];
  for (let index = 0; index < view.length; index += 3) {
    points.push([view[index], view[index + 1], view[index + 2]]);
  }
  return points;
}

export function worldControlPoints(selection, occurrence) {
  return localControlPoints(selection).map((point) => (
    transformPoint(occurrence.geometryMatrixMm, point)
  ));
}

export function cylinderResiduals(points, ports, profile) {
  const origin = ports.A.centreMm, axis = ports.axis;
  const radius = (ports.A.radiusMm + ports.L.radiusMm) / 2;
  const axialTolerance = scaledTolerance(
    profile.axialAbsoluteMm, profile.axialSpanRatio, ports.spanMm);
  const radialTolerance = scaledTolerance(
    profile.radialAbsoluteMm, profile.radialRadiusRatio, radius);
  for (const point of points) {
    if (!finiteVector(point)) return false;
    const offset = subtract(point, origin), axial = dot(offset, axis);
    if (axial < -axialTolerance || axial > ports.spanMm + axialTolerance) return false;
    const radial = subtract(offset, axis.map((value) => value * axial));
    if (Math.abs(Math.hypot(...radial) - radius) > radialTolerance) return false;
  }
  return points.length >= 6;
}
