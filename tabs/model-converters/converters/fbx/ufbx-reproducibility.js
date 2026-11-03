// Validate two-build FBX WASM evidence against optional accepted provenance.
// The output is immutable and rejects missing, divergent, or fallback build identities.
import { deepFreeze } from './canonical-json.js';
import {
  UFBX_UPSTREAM_REVISION,
  UFBX_WASI_SDK_ARCHIVE,
  UFBX_WASI_SDK_ARCHIVE_SHA256,
  UFBX_WASI_SDK_COMPILER,
  UFBX_WASI_SDK_LINKER,
  UFBX_WASI_SDK_RELEASE,
} from './ufbx-provenance.js';
import {
  FBX_WASM_REQUIRED_EXPORTS,
  FBX_WASM_REQUIRED_IMPORTS,
  FBX_WASM_TARGET,
} from './wasm-abi.js';

export const UFBX_WASM_REPRODUCIBILITY_SCHEMA = 'UfbxWasmReproducibility.v1';
const TOP_KEYS = ['schema', 'upstreamRevision', 'sourceSha256', 'buildSourceSha256',
  'compiler', 'linker', 'wasiSysroot', 'builds', 'byteIdentical',
  'workingDirectoryIndependent', 'committed'];
const TOOL_KEYS = ['command', 'sha256', 'version'];
const SYSROOT_KEYS = ['archive', 'archiveSha256', 'distribution', 'release', 'sha256'];
const BUILD_KEYS = ['sha256', 'byteLength', 'target', 'exports', 'imports'];
const COMMITTED_KEYS = ['sha256', 'byteLength', 'matchesBuilds'];
const HASH = /^[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(`BLOCKED_WASM_REPRODUCIBILITY ${message}`);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  if (Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) {
    fail(`${label} fields are invalid.`);
  }
}

function hash(value, label) {
  if (typeof value !== 'string' || !HASH.test(value)) fail(`${label} is invalid.`);
}

function tool(value, label, command) {
  exactKeys(value, TOOL_KEYS, label);
  if (value.command !== command || typeof value.version !== 'string' || !value.version) {
    fail(`${label} is invalid.`);
  }
  hash(value.sha256, `${label}.sha256`);
}

function sysroot(value) {
  exactKeys(value, SYSROOT_KEYS, 'wasiSysroot');
  hash(value.sha256, 'wasiSysroot.sha256');
  hash(value.archiveSha256, 'wasiSysroot.archiveSha256');
  if (value.distribution !== 'wasi-sdk'
    || value.release !== UFBX_WASI_SDK_RELEASE
    || value.archive !== UFBX_WASI_SDK_ARCHIVE
    || value.archiveSha256 !== UFBX_WASI_SDK_ARCHIVE_SHA256) {
    fail('wasiSysroot SDK identity is invalid.');
  }
}

function build(value, index) {
  exactKeys(value, BUILD_KEYS, `builds[${index}]`);
  hash(value.sha256, `builds[${index}].sha256`);
  if (!Number.isSafeInteger(value.byteLength) || value.byteLength <= 0
    || value.target !== FBX_WASM_TARGET
    || JSON.stringify(value.exports) !== JSON.stringify(FBX_WASM_REQUIRED_EXPORTS)
    || JSON.stringify(value.imports) !== JSON.stringify(FBX_WASM_REQUIRED_IMPORTS)) {
    fail(`builds[${index}] identity is invalid.`);
  }
}

export function acceptUfbxWasmReproducibility(value, provenance = null) {
  const evidence = structuredClone(value);
  exactKeys(evidence, TOP_KEYS, 'reproducibility');
  if (evidence.schema !== UFBX_WASM_REPRODUCIBILITY_SCHEMA
    || evidence.upstreamRevision !== UFBX_UPSTREAM_REVISION) {
    fail('Reproducibility schema or upstream revision is invalid.');
  }
  hash(evidence.sourceSha256, 'sourceSha256');
  hash(evidence.buildSourceSha256, 'buildSourceSha256');
  tool(evidence.compiler, 'compiler', UFBX_WASI_SDK_COMPILER);
  tool(evidence.linker, 'linker', UFBX_WASI_SDK_LINKER);
  sysroot(evidence.wasiSysroot);
  if (!Array.isArray(evidence.builds) || evidence.builds.length !== 2) {
    fail('Exactly two builds are required.');
  }
  evidence.builds.forEach(build);
  exactKeys(evidence.committed, COMMITTED_KEYS, 'committed');
  hash(evidence.committed.sha256, 'committed.sha256');
  const [left, right] = evidence.builds;
  if (evidence.byteIdentical !== true || evidence.workingDirectoryIndependent !== true
    || left.sha256 !== right.sha256 || left.byteLength !== right.byteLength
    || evidence.committed.matchesBuilds !== true
    || evidence.committed.sha256 !== left.sha256
    || evidence.committed.byteLength !== left.byteLength) {
    fail('Repeated builds or committed WASM are not byte-identical.');
  }
  if (provenance && (provenance.sourceSha256 !== evidence.sourceSha256
    || provenance.buildSourceSha256 !== evidence.buildSourceSha256
    || provenance.wasmSha256 !== left.sha256
    || provenance.wasmByteLength !== left.byteLength
    || JSON.stringify(provenance.compiler) !== JSON.stringify(evidence.compiler)
    || JSON.stringify(provenance.linker) !== JSON.stringify(evidence.linker)
    || JSON.stringify(provenance.wasiSysroot) !== JSON.stringify(evidence.wasiSysroot))) {
    fail('Reproducibility evidence differs from provenance.');
  }
  return deepFreeze(evidence);
}
