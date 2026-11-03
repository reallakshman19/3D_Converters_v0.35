export function subtract(left, right) {
  return left.map((value, index) => value - right[index]);
}

export function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

export function length(value) {
  return Math.hypot(...value);
}

export function scale(value, factor) {
  return value.map((item) => item * factor);
}

export function normalize(value) {
  const magnitude = length(value);
  return magnitude > 0 && Number.isFinite(magnitude)
    ? scale(value, 1 / magnitude) : null;
}

export function distance(left, right) {
  return length(subtract(left, right));
}

export function finiteVector(value) {
  return Array.isArray(value) && value.length === 3
    && value.every((item) => Number.isFinite(item));
}
