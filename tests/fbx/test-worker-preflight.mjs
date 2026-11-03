import assert from 'node:assert/strict';
import {
  FBX_WORKER_ERROR_CODES,
} from '../../tabs/model-converters/converters/fbx/worker-protocol.js';
import {
  FBX_BINARY_MAGIC,
  preflightFbxInput,
} from '../../tabs/model-converters/converters/fbx/worker-preflight.js';

function binaryHeader(version = 7400, extra = 0) {
  const bytes = new Uint8Array(27 + extra);
  bytes.set(FBX_BINARY_MAGIC);
  new DataView(bytes.buffer).setUint32(23, version, true);
  return bytes;
}

function rejects(bytes, code, detail, declaredLength = bytes.byteLength) {
  assert.throws(() => preflightFbxInput(bytes, declaredLength), (error) => {
    assert.equal(error.code, code);
    if (detail) assert.match(error.detail, detail);
    return true;
  });
}

assert.deepEqual(preflightFbxInput(binaryHeader()), {
  format: 'binary',
  version: 7400,
  warnings: [],
});
rejects(new Uint8Array(), FBX_WORKER_ERROR_CODES.PREFLIGHT_EMPTY_INPUT, /empty/);
rejects(binaryHeader(), FBX_WORKER_ERROR_CODES.PREFLIGHT_SIZE_MISMATCH, /declared=28;actual=27/, 28);

for (let length = 1; length < FBX_BINARY_MAGIC.length; length += 1) {
  rejects(new Uint8Array(FBX_BINARY_MAGIC.slice(0, length)),
    FBX_WORKER_ERROR_CODES.PREFLIGHT_UNSUPPORTED_HEADER,
    /truncated-binary-header/);
}
for (let length = 23; length < 27; length += 1) {
  const bytes = new Uint8Array(length);
  bytes.set(FBX_BINARY_MAGIC);
  rejects(bytes, FBX_WORKER_ERROR_CODES.PREFLIGHT_UNSUPPORTED_HEADER, /truncated-version-field/);
}

const ascii = new TextEncoder().encode('\ufeff \r\n\t; FBX 7.4.0 project file');
rejects(ascii, FBX_WORKER_ERROR_CODES.PREFLIGHT_UNSUPPORTED_HEADER, /ascii-fbx-not-supported/);
rejects(new TextEncoder().encode('not an fbx file'),
  FBX_WORKER_ERROR_CODES.PREFLIGHT_UNSUPPORTED_HEADER,
  /unrecognized-header/);
rejects(binaryHeader(2999), FBX_WORKER_ERROR_CODES.PREFLIGHT_UNSUPPORTED_VERSION, /2999/);
rejects(binaryHeader(7701), FBX_WORKER_ERROR_CODES.PREFLIGHT_UNSUPPORTED_VERSION, /7701/);

for (let index = 0; index < FBX_BINARY_MAGIC.length; index += 1) {
  const bytes = binaryHeader();
  bytes[index] ^= 0xff;
  rejects(bytes, FBX_WORKER_ERROR_CODES.PREFLIGHT_UNSUPPORTED_HEADER, /unrecognized-header/);
}

const swapped = binaryHeader();
new DataView(swapped.buffer).setUint32(23, 7400, false);
rejects(swapped, FBX_WORKER_ERROR_CODES.PREFLIGHT_UNSUPPORTED_VERSION);

const backing = new Uint8Array(64);
backing.set(binaryHeader(), 9);
const selected = new Uint8Array(backing.buffer, 9, 27);
assert.equal(preflightFbxInput(selected).version, 7400);

const longWhitespace = new Uint8Array(520);
longWhitespace.fill(0x20);
longWhitespace.set(new TextEncoder().encode('; FBX'), 513);
rejects(longWhitespace, FBX_WORKER_ERROR_CODES.PREFLIGHT_UNSUPPORTED_HEADER, /unrecognized-header/);

console.log('test-worker-preflight: PASS');
