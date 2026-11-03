// Exercise immutable acceptance and fail-closed rejection for portable SDK provenance.
import assert from 'node:assert/strict';
import {
  UFBX_BUILD_SOURCE_FILES,
  UFBX_SOURCE_FILES,
  UFBX_UPSTREAM_REVISION,
  UFBX_WASI_SDK_ARCHIVE,
  UFBX_WASI_SDK_ARCHIVE_SHA256,
  UFBX_WASI_SDK_COMPILER,
  UFBX_WASI_SDK_LINKER,
  UFBX_WASI_SDK_RELEASE,
  UFBX_WASM_BUILD_COMMAND,
  acceptUfbxWasmProvenance,
} from '../../tabs/model-converters/converters/fbx/ufbx-provenance.js';
import {
  FBX_WASM_REQUIRED_EXPORTS,
  FBX_WASM_REQUIRED_IMPORTS,
} from '../../tabs/model-converters/converters/fbx/wasm-abi.js';

const HASH = '1'.repeat(64);
function valid() {
  return {
    schema: 'UfbxWasmProvenance.v1', upstreamRepository: 'ufbx/ufbx',
    upstreamRevision: UFBX_UPSTREAM_REVISION, upstreamTag: 'v0.18.0',
    license: 'MIT alternative', sourceFiles: [...UFBX_SOURCE_FILES],
    sourceSha256: HASH, buildSourceFiles: [...UFBX_BUILD_SOURCE_FILES],
    buildSourceSha256: HASH, buildScriptPath: 'scripts/fbx/build-ufbx-wasm.sh',
    buildScriptSha256: HASH, buildCommand: UFBX_WASM_BUILD_COMMAND,
    target: 'wasm32-wasi',
    compiler: { command: UFBX_WASI_SDK_COMPILER, sha256: HASH,
      version: 'clang version 18.1.2' },
    linker: { command: UFBX_WASI_SDK_LINKER, sha256: HASH, version: 'LLD 18.1.2' },
    wasiSysroot: { archive: UFBX_WASI_SDK_ARCHIVE,
      archiveSha256: UFBX_WASI_SDK_ARCHIVE_SHA256, distribution: 'wasi-sdk',
      release: UFBX_WASI_SDK_RELEASE, sha256: HASH },
    environment: { LC_ALL: 'C', SOURCE_DATE_EPOCH: '0', TZ: 'UTC' },
    requiredExports: FBX_WASM_REQUIRED_EXPORTS.map((item) => [...item]),
    requiredImports: FBX_WASM_REQUIRED_IMPORTS.map((item) => [...item]),
    wasmSha256: HASH, wasmByteLength: 123,
  };
}

const source = valid(), accepted = acceptUfbxWasmProvenance(source);
assert.ok(Object.isFrozen(accepted));
assert.ok(Object.isFrozen(accepted.compiler));
assert.ok(Object.isFrozen(accepted.wasiSysroot));
source.compiler.version = 'mutated';
source.requiredExports[0][0] = 'mutated';
assert.notEqual(accepted.compiler.version, 'mutated');
assert.notEqual(accepted.requiredExports[0][0], 'mutated');

for (const mutate of [
  (value) => { delete value.wasmByteLength; },
  (value) => { value.runtimeVersion = 'volatile'; },
  (value) => { value.upstreamRevision = '0'.repeat(40); },
  (value) => { value.sourceSha256 = '0'.repeat(64); value.sourceFiles.reverse(); },
  (value) => { value.compiler.command = 'clang'; },
  (value) => { value.wasiSysroot.release = 'uncontrolled'; },
  (value) => { value.wasiSysroot.archiveSha256 = HASH; },
  (value) => { value.requiredExports.pop(); },
  (value) => { value.requiredImports.push(['env', 'hidden', 'function']); },
  (value) => { value.environment.generatedAt = 'now'; },
]) {
  const candidate = valid(); mutate(candidate);
  assert.throws(() => acceptUfbxWasmProvenance(candidate), /BLOCKED_PARSER_PROVENANCE/);
}

assert.throws(() => acceptUfbxWasmProvenance(null), /BLOCKED_PARSER_PROVENANCE/);
console.log('test-ufbx-provenance-contract: PASS');
