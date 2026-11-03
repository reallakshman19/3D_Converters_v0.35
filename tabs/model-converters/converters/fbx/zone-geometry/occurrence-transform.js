import { transformPoint, validateOccurrenceTransform } from '../transform-policy.js?v=20260729-fbx2-direct-pipe-1';
import { FBX_DERIVED_PORT_TOLERANCE_PROFILE } from './constants.js';
import { normalizedNumber } from './compare.js';
import { windingNormalForPoints } from './circle-fit.js';

function linearMatrix(matrix) {
  return [[matrix[0], matrix[3], matrix[6]], [matrix[1], matrix[4], matrix[7]],
    [matrix[2], matrix[5], matrix[8]]];
}

function determinant(value) {
  return value[0][0] * (value[1][1] * value[2][2] - value[1][2] * value[2][1])
    - value[0][1] * (value[1][0] * value[2][2] - value[1][2] * value[2][0])
    + value[0][2] * (value[1][0] * value[2][1] - value[1][1] * value[2][0]);
}

function inverse(value, det) {
  return [
    [(value[1][1] * value[2][2] - value[1][2] * value[2][1]) / det,
      (value[0][2] * value[2][1] - value[0][1] * value[2][2]) / det,
      (value[0][1] * value[1][2] - value[0][2] * value[1][1]) / det],
    [(value[1][2] * value[2][0] - value[1][0] * value[2][2]) / det,
      (value[0][0] * value[2][2] - value[0][2] * value[2][0]) / det,
      (value[0][2] * value[1][0] - value[0][0] * value[1][2]) / det],
    [(value[1][0] * value[2][1] - value[1][1] * value[2][0]) / det,
      (value[0][1] * value[2][0] - value[0][0] * value[2][1]) / det,
      (value[0][0] * value[1][1] - value[0][1] * value[1][0]) / det],
  ];
}

function multiplyTranspose(matrix, vector) {
  return [matrix[0][0] * vector[0] + matrix[1][0] * vector[1] + matrix[2][0] * vector[2],
    matrix[0][1] * vector[0] + matrix[1][1] * vector[1] + matrix[2][1] * vector[2],
    matrix[0][2] * vector[0] + matrix[1][2] * vector[1] + matrix[2][2] * vector[2]];
}

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function length(value) { return Math.sqrt(dot(value, value)); }
function finiteVector(value) { return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite); }
function finiteMatrix(value) { return value.flat().every(Number.isFinite); }
function nonFiniteResult() { return { rejectionReasons: ['NON_FINITE_RESULT'] }; }
function clean(value) { return value.map(normalizedNumber); }

function normalize(value) {
  if (!finiteVector(value)) return null;
  const size = length(value);
  if (!Number.isFinite(size) || size <= 0) return null;
  const result = value.map((item) => item / size);
  return finiteVector(result) ? result : null;
}

function transformReason(error) {
  const text = String(error?.message || error);
  if (/inheritance/i.test(text)) return 'UNSUPPORTED_INHERITANCE';
  if (/missing geometry matrix/i.test(text)) return 'MISSING_TRANSFORM';
  if (/shear/i.test(text)) return 'SHEAR_TRANSFORM';
  if (/non-uniform/i.test(text)) return 'NON_UNIFORM_SCALE';
  if (/singular/i.test(text) && !/non-finite/i.test(text)) return 'SINGULAR_TRANSFORM';
  return 'NON_FINITE_RESULT';
}

function scaleFor(matrix) {
  const columns = [[matrix[0], matrix[1], matrix[2]], [matrix[3], matrix[4], matrix[5]],
    [matrix[6], matrix[7], matrix[8]]];
  return columns.reduce((sum, column) => sum + length(column), 0) / 3;
}

function tolerance(radiusMm) {
  const profile = FBX_DERIVED_PORT_TOLERANCE_PROFILE;
  return {
    planarityMm: Math.max(profile.planarityAbsoluteMm, radiusMm * profile.planarityRadiusRatio),
    circularMm: Math.max(profile.circularAbsoluteMm, radiusMm * profile.circularRadiusRatio),
  };
}

function validLocalEvidence(fit, localPoints) {
  const values = [fit?.radius, fit?.planarityResidual, fit?.circularResidual];
  return Array.isArray(localPoints) && finiteVector(fit?.centre) && finiteVector(fit?.normal)
    && values.every(Number.isFinite) && localPoints.every(finiteVector);
}

function finiteOutput(centre, normal, radius, planarity, circular, limits) {
  return finiteVector(centre) && finiteVector(normal)
    && [radius, radius * 2, planarity, circular,
      limits.planarityMm, limits.circularMm].every(Number.isFinite);
}

function resolveWorldNormal(linear, det, localNormal) {
  const inverseMatrix = inverse(linear, det);
  if (!finiteMatrix(inverseMatrix)) return nonFiniteResult();
  const transformed = multiplyTranspose(inverseMatrix, localNormal)
    .map((value) => value * Math.sign(det));
  if (!finiteVector(transformed)) return nonFiniteResult();
  const worldNormal = normalize(transformed);
  return worldNormal ? { worldNormal } : { rejectionReasons: ['SINGULAR_TRANSFORM'] };
}

function verifyWorldOrientation(matrix, localPoints, worldNormal) {
  const worldPoints = localPoints.map((point) => transformPoint(matrix, point));
  if (!worldPoints.every(finiteVector)) return nonFiniteResult();
  const winding = windingNormalForPoints(worldPoints);
  if (winding && !finiteVector(winding)) return nonFiniteResult();
  const orientation = winding ? dot(worldNormal, winding) : 0;
  if (!Number.isFinite(orientation)) return nonFiniteResult();
  return winding && orientation > 0 ? {} : { rejectionReasons: ['MIRRORED_ORIENTATION_MISMATCH'] };
}

function scaleWorldEvidence(matrix, fit, worldNormal) {
  const uniformScale = scaleFor(matrix);
  if (!Number.isFinite(uniformScale)) return nonFiniteResult();
  if (uniformScale <= 0) return { rejectionReasons: ['SINGULAR_TRANSFORM'] };
  const radiusMm = fit.radius * uniformScale;
  const planarityResidualMm = fit.planarityResidual * uniformScale;
  const circularResidualMm = fit.circularResidual * uniformScale;
  const limits = tolerance(radiusMm), centreMm = transformPoint(matrix, fit.centre);
  if (!finiteOutput(centreMm, worldNormal, radiusMm,
    planarityResidualMm, circularResidualMm, limits)) return nonFiniteResult();
  return { centreMm, radiusMm, planarityResidualMm, circularResidualMm, limits };
}

function admittedEvidence(det, worldNormal, scaled) {
  const reasons = [];
  if (scaled.radiusMm < FBX_DERIVED_PORT_TOLERANCE_PROFILE.minimumRadiusMm) reasons.push('RADIUS_BELOW_MINIMUM');
  if (scaled.planarityResidualMm > scaled.limits.planarityMm) reasons.push('NON_PLANAR');
  if (scaled.circularResidualMm > scaled.limits.circularMm) reasons.push('NON_CIRCULAR');
  return {
    centreMm: clean(scaled.centreMm), normal: clean(worldNormal),
    radiusMm: normalizedNumber(scaled.radiusMm), diameterMm: normalizedNumber(scaled.radiusMm * 2),
    planarityResidualMm: normalizedNumber(scaled.planarityResidualMm),
    circularResidualMm: normalizedNumber(scaled.circularResidualMm),
    tolerancesMm: { planarityMm: normalizedNumber(scaled.limits.planarityMm),
      circularMm: normalizedNumber(scaled.limits.circularMm) },
    orientationRule: 'sign(det(A))*inverse-transpose(local-winding-normal)',
    transformDisposition: det < 0 ? 'MIRRORED_NEGATIVE_DETERMINANT_ACCEPTED' : 'ORDINARY_POSITIVE_DETERMINANT',
    rejectionReasons: reasons,
  };
}

export function transformBoundaryFit(occurrence, fit, localPoints) {
  if (!validLocalEvidence(fit, localPoints)) return nonFiniteResult();
  const matrix = occurrence?.geometryMatrixMm;
  if (Array.isArray(matrix) && matrix.length === 12 && !matrix.every(Number.isFinite)) return nonFiniteResult();
  try { validateOccurrenceTransform(occurrence); }
  catch (error) { return { rejectionReasons: [transformReason(error)] }; }
  const linear = linearMatrix(matrix), det = determinant(linear);
  if (!Number.isFinite(det)) return nonFiniteResult();
  if (Math.abs(det) < 1e-12) return { rejectionReasons: ['SINGULAR_TRANSFORM'] };
  const normal = resolveWorldNormal(linear, det, fit.normal);
  if (normal.rejectionReasons) return normal;
  const orientation = verifyWorldOrientation(matrix, localPoints, normal.worldNormal);
  if (orientation.rejectionReasons) return orientation;
  const scaled = scaleWorldEvidence(matrix, fit, normal.worldNormal);
  return scaled.rejectionReasons ? scaled : admittedEvidence(det, normal.worldNormal, scaled);
}
