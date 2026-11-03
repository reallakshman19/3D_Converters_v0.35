function bytesOf(value) {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError('SHA-256 input must be text or bytes.');
}

async function subtleCrypto() {
  if (globalThis.crypto?.subtle) return globalThis.crypto.subtle;
  const { webcrypto } = await import('node:crypto');
  return webcrypto.subtle;
}

function hexOf(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value) {
  const subtle = await subtleCrypto();
  const digest = await subtle.digest('SHA-256', bytesOf(value));
  return hexOf(new Uint8Array(digest));
}
