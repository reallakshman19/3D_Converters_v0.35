/**
 * Functionality: normalizes batched stdout/stderr values from the Pyodide
 * worker. Parameters: an array-like list of log values. Output: trimmed,
 * non-empty strings. Fallback: nullish values are converted to empty text and
 * filtered out; invalid containers raise a TypeError.
 */

export function decodeLogBatches(values) {
  if (!Array.isArray(values)) throw new TypeError('Log batches must be an array.');
  return values
    .map((line) => toLogText(line))
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

function toLogText(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}
