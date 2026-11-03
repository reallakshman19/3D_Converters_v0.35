import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  calculateUfbxBuildSourceIdentity,
  calculateUfbxSourceIdentity,
} from '../../scripts/fbx/qualify-ufbx-wasm.mjs';
import { acceptUfbxWasmProvenance } from '../../tabs/model-converters/converters/fbx/ufbx-provenance.js';
import {
  acceptUfbxWasmReproducibility,
} from '../../tabs/model-converters/converters/fbx/ufbx-reproducibility.js';
import { inspectFbxWasmAbi } from '../../tabs/model-converters/converters/fbx/wasm-abi.js';

const base = new URL('../../third_party/ufbx/', import.meta.url);
const provenance = acceptUfbxWasmProvenance(
  JSON.parse(await readFile(new URL('provenance.json', base), 'utf8')));
const source = JSON.parse(await readFile(new URL('reproducibility.json', base), 'utf8'));
const evidence = acceptUfbxWasmReproducibility(source, provenance);
const wasm = new Uint8Array(await readFile(new URL('fbx_parser.wasm', base)));
const digest = createHash('sha256').update(wasm).digest('hex');

assert.equal(evidence.sourceSha256, await calculateUfbxSourceIdentity());
assert.equal(evidence.buildSourceSha256, await calculateUfbxBuildSourceIdentity());
assert.equal(evidence.committed.sha256, digest);
assert.equal(evidence.committed.byteLength, wasm.byteLength);
assert.deepEqual(evidence.builds[0], evidence.builds[1]);
assert.deepEqual(inspectFbxWasmAbi(wasm).exports, evidence.builds[0].exports);
assert.deepEqual(inspectFbxWasmAbi(wasm).imports, evidence.builds[0].imports);
assert.ok(Object.isFrozen(evidence));
assert.ok(Object.isFrozen(evidence.builds));
source.builds[0].sha256 = '0'.repeat(64);
assert.notEqual(evidence.builds[0].sha256, source.builds[0].sha256);

for (const mutate of [
  (value) => { delete value.byteIdentical; },
  (value) => { value.generatedAt = 'now'; },
  (value) => { value.byteIdentical = false; },
  (value) => { value.workingDirectoryIndependent = false; },
  (value) => { value.builds[1].sha256 = '2'.repeat(64); },
  (value) => { value.committed.matchesBuilds = false; },
]) {
  const candidate = structuredClone(evidence); mutate(candidate);
  assert.throws(() => acceptUfbxWasmReproducibility(candidate, provenance),
    /BLOCKED_WASM_REPRODUCIBILITY/);
}
console.log('test-ufbx-reproducibility: PASS');
