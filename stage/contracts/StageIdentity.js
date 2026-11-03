export function makeStageId(prefix, index) {
  const cleanPrefix = String(prefix || '').trim();
  const numericIndex = Number(index);
  if (!cleanPrefix) throw new TypeError('prefix must be a non-empty string');
  if (!Number.isInteger(numericIndex) || numericIndex < 0) {
    throw new TypeError('index must be a non-negative integer');
  }
  return `${cleanPrefix}-${String(numericIndex).padStart(6, '0')}`;
}
