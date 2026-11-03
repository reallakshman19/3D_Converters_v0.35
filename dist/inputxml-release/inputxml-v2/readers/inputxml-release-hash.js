/**
 * Functionality: deterministic UTF-8/JSON encoding and SHA-256 hashing.
 * Parameters: byte-like values or JSON-compatible values with finite numbers.
 * Outputs: immutable bytes, stable JSON text, and lowercase SHA-256 strings.
 * Fallback: none; unavailable Web Crypto or unsupported values raise errors.
 */

function encodeText(value) {
  return new TextEncoder().encode(String(value));
}

export function releaseBytes(value) {
  if (typeof value === 'string') return encodeText(value);
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  throw new TypeError('Release content must be text, ArrayBuffer, or a typed array.');
}

function stableValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Release JSON cannot contain non-finite numbers.');
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (typeof value !== 'object') throw new TypeError(`Unsupported release JSON value: ${typeof value}.`);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function stableReleaseJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

export async function sha256Hex(value) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto SHA-256 is required for InputXML release evidence.');
  const digest = await subtle.digest('SHA-256', releaseBytes(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashReleaseJson(value, excludedField) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Release JSON hash input must be an object.');
  }
  const payload = Object.fromEntries(Object.entries(value).filter(([key]) => key !== excludedField));
  return sha256Hex(stableReleaseJson(payload));
}
