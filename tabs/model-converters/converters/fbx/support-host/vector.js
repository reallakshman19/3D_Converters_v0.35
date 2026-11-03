export function add(left, right) {
  return left.map((value, index) => value + right[index]);
}

export function subtract(left, right) {
  return left.map((value, index) => value - right[index]);
}

export function scale(vector, factor) {
  return vector.map((value) => value * factor);
}

export function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

export function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

export function magnitude(vector) {
  return Math.hypot(...vector);
}

export function normalize(vector) {
  const length = magnitude(vector);
  return Number.isFinite(length) && length > 0 ? scale(vector, 1 / length) : null;
}

export function distance(left, right) {
  return magnitude(subtract(left, right));
}

export function finiteVector(value) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

export function midpoint(left, right) {
  return scale(add(left, right), 0.5);
}

export function triangleNormal(points) {
  const normal = normalize(cross(subtract(points[1], points[0]), subtract(points[2], points[0])));
  return normal && finiteVector(normal) ? normal : null;
}

export function canonicalDirection(vector) {
  const unit = normalize(vector);
  if (!unit) return null;
  const first = unit.find((value) => Math.abs(value) > 1e-15);
  return first !== undefined && first < 0 ? scale(unit, -1) : unit;
}

export function compareText(left, right) {
  const a = String(left ?? ''), b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}
