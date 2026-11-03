export function normalizeSourceText(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

export function byteLengthOf(value, TextEncoderCtor = globalThis.TextEncoder) {
  if (typeof TextEncoderCtor !== 'function') {
    throw new Error('TextEncoder is required to measure source bytes.');
  }
  return new TextEncoderCtor().encode(String(value ?? '')).byteLength;
}
