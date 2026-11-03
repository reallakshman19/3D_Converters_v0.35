import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  calculateUfbxBuildSourceIdentity,
  calculateUfbxSourceIdentity,
} from '../../scripts/fbx/qualify-ufbx-wasm.mjs';
import {
  observeParserEvidence,
} from '../../tabs/model-converters/converters/fbx/parser-provenance.js';
import {
  UFBX_UPSTREAM_REVISION,
  acceptUfbxWasmProvenance,
} from '../../tabs/model-converters/converters/fbx/ufbx-provenance.js';
import { inspectFbxWasmAbi } from '../../tabs/model-converters/converters/fbx/wasm-abi.js';

const root = new URL('../../', import.meta.url);
const base = new URL('third_party/ufbx/', root);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const provenanceSource = JSON.parse(await readFile(new URL('provenance.json', base), 'utf8'));
const provenance = acceptUfbxWasmProvenance(provenanceSource);
const wasmBytes = new Uint8Array(await readFile(new URL('fbx_parser.wasm', base)));
const identity = await observeParserEvidence({ provenance, wasmBytes });

assert.equal(provenance.upstreamRevision, UFBX_UPSTREAM_REVISION);
assert.equal(provenance.sourceSha256, await calculateUfbxSourceIdentity());
assert.equal(provenance.buildSourceSha256, await calculateUfbxBuildSourceIdentity());
assert.equal(provenance.buildScriptSha256,
  digest(await readFile(new URL('scripts/fbx/build-ufbx-wasm.sh', root))));
assert.equal(provenance.wasmSha256, digest(wasmBytes));
assert.equal(provenance.wasmByteLength, wasmBytes.byteLength);
assert.equal(identity.wasmSha256, provenance.wasmSha256);
assert.deepEqual(inspectFbxWasmAbi(wasmBytes).exports, provenance.requiredExports);
assert.deepEqual(inspectFbxWasmAbi(wasmBytes).imports, provenance.requiredImports);
assert.ok(Object.isFrozen(provenance));
assert.ok(Object.isFrozen(provenance.compiler));
assert.match(await readFile(new URL('LICENSE', base), 'utf8'), /MIT License/);
console.log('test-provenance: PASS');
