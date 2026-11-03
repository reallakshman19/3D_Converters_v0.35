export function compareText(left, right) {
  const a = String(left), b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareDecimalId(left, right) {
  const a = BigInt(left), b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareOccurrenceId(left, right) {
  const a = String(left).replace(/^occ:/, '');
  const b = String(right).replace(/^occ:/, '');
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return compareDecimalId(a, b);
  return compareText(left, right);
}

export function compareNumberArrays(left, right) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return left.length - right.length;
}

export function normalizedNumber(value) {
  return Object.is(value, -0) ? 0 : value;
}
