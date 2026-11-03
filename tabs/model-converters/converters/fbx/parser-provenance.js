import { sha256Hex } from './sha256.js';
import { acceptUfbxWasmProvenance } from './ufbx-provenance.js';
import { inspectFbxWasmAbi } from './wasm-abi.js';

function fail(message) {
  throw new Error(`BLOCKED_PARSER_BINDING ${message}`);
}

export async function observeParserEvidence({ provenance, wasmBytes }) {
  const accepted = acceptUfbxWasmProvenance(provenance);
  const bytes = wasmBytes instanceof Uint8Array ? wasmBytes.slice()
    : new Uint8Array(wasmBytes).slice();
  inspectFbxWasmAbi(bytes);
  const observedWasmSha256 = await sha256Hex(bytes);
  if (observedWasmSha256 !== accepted.wasmSha256
    || bytes.byteLength !== accepted.wasmByteLength) {
    fail('Committed parser WASM does not match repository provenance.');
  }
  return Object.freeze({
    provenanceSchema: accepted.schema,
    upstreamRevision: accepted.upstreamRevision,
    sourceSha256: accepted.sourceSha256,
    wasmSha256: observedWasmSha256,
  });
}

async function fetchRequired(url, kind) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) fail(`Unable to load repository parser ${kind}: HTTP ${response.status}.`);
  return response;
}

export async function loadBrowserParserEvidence() {
  const base = new URL('../../../../third_party/ufbx/', import.meta.url);
  const [provenanceResponse, wasmResponse] = await Promise.all([
    fetchRequired(new URL('provenance.json', base), 'provenance'),
    fetchRequired(new URL('fbx_parser.wasm', base), 'WASM'),
  ]);
  return observeParserEvidence({
    provenance: await provenanceResponse.json(),
    wasmBytes: new Uint8Array(await wasmResponse.arrayBuffer()),
  });
}
