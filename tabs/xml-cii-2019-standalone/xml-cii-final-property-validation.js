/** Exact numeric representations, units and encoding validation for registered CII fields. */
const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?$/;
export const layouts = Object.freeze({ RIGID: 1, ELEMENTS: 15, CONTROL: 4 });
export const encoder = new TextEncoder();
export const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
export function refuse(message) { throw new Error('CII property transaction REFUSED: ' + message); }
export function assert(condition, message) { if (!condition) refuse(message); }
const decimal = (v) => String(v).replace(/[dD]/g, 'E');

export function decimalSignature(text) {
  const value = decimal(text).trim();
  assert(value.length <= 128 && numeric.test(value), 'invalid numeric representation');
  const match = /^([+-]?)(\d*(?:\.\d*)?|\.\d+)(?:E([+-]?\d+))?$/i.exec(value);
  assert(match, 'invalid decimal representation');
  const [whole, fraction = ''] = match[2].split('.');
  let digits = (whole + fraction).replace(/^0+/, '');
  if (!digits) return '0';
  let exp = BigInt(match[3] || 0) - BigInt(fraction.length);
  while (digits.endsWith('0')) { digits = digits.slice(0, -1); exp += 1n; }
  return (match[1] === '-' ? '-' : '') + digits + 'e' + String(exp);
}

export function numericalValue(text) {
  const canonical = decimalSignature(text);
  const number = Number(decimal(text));
  assert(Number.isFinite(number), 'nonfinite or out-of-range numeric value');
  assert(number !== 0 || canonical === '0', 'underflow to zero');
  return { number, canonical };
}

export function encodeField(descriptor, raw) {
  const value = String(raw ?? '').trim();
  const parsed = numericalValue(value);
  if (descriptor.min !== undefined) assert(parsed.number >= descriptor.min, 'below allowed range');
  if (descriptor.max !== undefined) assert(parsed.number <= descriptor.max, 'above allowed range');
  if (!descriptor.allowNegative) assert(parsed.number >= 0, 'negative value disallowed');
  if (descriptor.validate) assert(descriptor.validate(parsed.number, value) === true, 'property validation refused');
  // Keep the exact requested decimal whenever it fits; otherwise use a
  // shorter exact equivalent, never an approximate rounded conversion.
  const candidates = [decimal(value), String(parsed.number)];
  const candidate = candidates.find((entry) => entry.length <= descriptor.widths[descriptor.fieldIndex]
    && decimalSignature(entry) === parsed.canonical);
  assert(candidate, 'field-width overflow or unrepresentable decimal precision');
  const width = descriptor.widths[descriptor.fieldIndex];
  return { number: parsed.number, raw: candidate, encoded: candidate.padStart(width, ' ') };
}

