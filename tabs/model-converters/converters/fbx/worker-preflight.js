import {
  FBX_WORKER_ERROR_CODES,
  FbxWorkerRuntimeError,
} from './worker-protocol.js';

export const FBX_BINARY_MAGIC = Object.freeze([
  0x4b, 0x61, 0x79, 0x64, 0x61, 0x72, 0x61, 0x20,
  0x46, 0x42, 0x58, 0x20, 0x42, 0x69, 0x6e, 0x61,
  0x72, 0x79, 0x20, 0x20, 0x00, 0x1a, 0x00,
]);

const MIN_FBX_VERSION = 3000;
const MAX_FBX_VERSION = 7700;
const ASCII_SCAN_LIMIT = 512;

function fail(code, message, detail) {
  throw new FbxWorkerRuntimeError(code, message, { stage: 'preflight', detail });
}

function matchesPrefix(bytes) {
  const count = Math.min(bytes.byteLength, FBX_BINARY_MAGIC.length);
  for (let i = 0; i < count; i += 1) {
    if (bytes[i] !== FBX_BINARY_MAGIC[i]) return false;
  }
  return true;
}

function matchesMagic(bytes) {
  if (bytes.byteLength < FBX_BINARY_MAGIC.length) return false;
  for (let i = 0; i < FBX_BINARY_MAGIC.length; i += 1) {
    if (bytes[i] !== FBX_BINARY_MAGIC[i]) return false;
  }
  return true;
}

function isAsciiWhitespace(byte) {
  return byte === 0x09 || byte === 0x0a || byte === 0x0c || byte === 0x0d || byte === 0x20;
}

function isAsciiFbx(bytes) {
  const limit = Math.min(bytes.byteLength, ASCII_SCAN_LIMIT);
  let offset = limit >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  while (offset < limit && isAsciiWhitespace(bytes[offset])) offset += 1;
  const marker = [0x3b, 0x20, 0x46, 0x42, 0x58];
  if (offset + marker.length > limit) return false;
  return marker.every((byte, index) => bytes[offset + index] === byte);
}

function assertLengths(bytes, declaredLength) {
  if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
    fail(FBX_WORKER_ERROR_CODES.PREFLIGHT_SIZE_MISMATCH, 'The FBX input size is invalid.', 'declared-length-invalid');
  }
  if (declaredLength !== bytes.byteLength) {
    fail(
      FBX_WORKER_ERROR_CODES.PREFLIGHT_SIZE_MISMATCH,
      'The FBX input size does not match the transferred buffer.',
      `declared=${declaredLength};actual=${bytes.byteLength}`,
    );
  }
}

export function preflightFbxInput(input, declaredLength = undefined) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  assertLengths(bytes, declaredLength ?? bytes.byteLength);
  if (bytes.byteLength === 0) {
    fail(FBX_WORKER_ERROR_CODES.PREFLIGHT_EMPTY_INPUT, 'The FBX input is empty.', 'empty-input');
  }
  if (bytes.byteLength < FBX_BINARY_MAGIC.length && matchesPrefix(bytes)) {
    fail(FBX_WORKER_ERROR_CODES.PREFLIGHT_UNSUPPORTED_HEADER, 'The FBX binary header is truncated.', 'truncated-binary-header');
  }
  if (!matchesMagic(bytes)) {
    const detail = isAsciiFbx(bytes) ? 'ascii-fbx-not-supported' : 'unrecognized-header';
    fail(FBX_WORKER_ERROR_CODES.PREFLIGHT_UNSUPPORTED_HEADER, 'The FBX header is unsupported.', detail);
  }
  if (bytes.byteLength < 27) {
    fail(FBX_WORKER_ERROR_CODES.PREFLIGHT_UNSUPPORTED_HEADER, 'The FBX version field is truncated.', 'truncated-version-field');
  }
  const version = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(23, true);
  if (version < MIN_FBX_VERSION || version > MAX_FBX_VERSION) {
    fail(FBX_WORKER_ERROR_CODES.PREFLIGHT_UNSUPPORTED_VERSION, `Unsupported FBX version ${version}.`, String(version));
  }
  return Object.freeze({ format: 'binary', version, warnings: Object.freeze([]) });
}
