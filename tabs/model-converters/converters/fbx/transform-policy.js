const EPSILON = 1e-8;
const RESOLVED_INHERIT_MODES = new Set([0, 1, 2]);

function vector(matrix, offset) {
  return [matrix[offset], matrix[offset + 1], matrix[offset + 2]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(value) {
  return Math.sqrt(dot(value, value));
}

function determinant(matrix) {
  const a = vector(matrix, 0), b = vector(matrix, 3), c = vector(matrix, 6);
  return a[0] * (b[1] * c[2] - b[2] * c[1])
    - b[0] * (a[1] * c[2] - a[2] * c[1])
    + c[0] * (a[1] * b[2] - a[2] * b[1]);
}

export function validateOccurrenceTransform(occurrence) {
  if (!Number.isInteger(occurrence.inheritMode) || !RESOLVED_INHERIT_MODES.has(occurrence.inheritMode)) {
    throw new Error(`BLOCKED_TRANSFORM unsupported inheritance on ${occurrence.sourceOccurrenceId}.`);
  }
  const matrix = occurrence.geometryMatrixMm;
  if (!Array.isArray(matrix) || matrix.length !== 12) {
    throw new Error(`BLOCKED_TRANSFORM missing geometry matrix on ${occurrence.sourceOccurrenceId}.`);
  }
  const det = determinant(matrix);
  if (!Number.isFinite(det) || Math.abs(det) < EPSILON) {
    throw new Error(`BLOCKED_TRANSFORM singular matrix on ${occurrence.sourceOccurrenceId}.`);
  }
  const basis = [vector(matrix, 0), vector(matrix, 3), vector(matrix, 6)];
  const scales = basis.map(length);
  const shear = Math.max(
    Math.abs(dot(basis[0], basis[1])),
    Math.abs(dot(basis[0], basis[2])),
    Math.abs(dot(basis[1], basis[2])),
  );
  if (shear > EPSILON * Math.max(...scales) ** 2) {
    throw new Error(`BLOCKED_TRANSFORM shear on ${occurrence.sourceOccurrenceId}.`);
  }
  if (Math.max(...scales) - Math.min(...scales) > EPSILON * Math.max(...scales)) {
    throw new Error(`BLOCKED_TRANSFORM ambiguous non-uniform scaling on ${occurrence.sourceOccurrenceId}.`);
  }
}

export function transformPoint(matrix, point) {
  return [
    matrix[0] * point[0] + matrix[3] * point[1] + matrix[6] * point[2] + matrix[9],
    matrix[1] * point[0] + matrix[4] * point[1] + matrix[7] * point[2] + matrix[10],
    matrix[2] * point[0] + matrix[5] * point[1] + matrix[8] * point[2] + matrix[11],
  ].map((value) => Object.is(value, -0) ? 0 : value);
}
