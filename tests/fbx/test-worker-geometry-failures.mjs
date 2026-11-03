import assert from 'node:assert/strict';
import { buildFbxGeometryBundle } from '../../tabs/model-converters/converters/fbx/geometry-bundle.js';
import { parseFbxGeometryBundleInWorker } from '../../tabs/model-converters/converters/fbx/geometry-transport.js';
import { loadFbxParserIdentity } from '../../tabs/model-converters/converters/fbx/parser-wasm.js';
import { handleFbxWorkerMessage } from '../../tabs/model-converters/converters/fbx/parser-worker.js';
import { sha256Hex } from '../../tabs/model-converters/converters/fbx/sha256.js';
import { FBX_BINARY_MAGIC } from '../../tabs/model-converters/converters/fbx/worker-preflight.js';
import {
  FBX_GEOMETRY_WORKER_ERROR_CODES, FBX_GEOMETRY_WORKER_JOB_SCHEMA,
  FBX_GEOMETRY_WORKER_OPERATION, FBX_GEOMETRY_WORKER_TYPES,
  makeGeometryAccepted,
  makeGeometryComplete, makeGeometryProgress,
} from '../../tabs/model-converters/converters/fbx/geometry-worker-protocol.js';
import { FBX_WORKER_ERROR_CODES, FBX_WORKER_STAGES } from '../../tabs/model-converters/converters/fbx/worker-protocol.js';

function f64(values) { const buffer = new ArrayBuffer(values.length * 8), view = new DataView(buffer); values.forEach((value, index) => view.setFloat64(index * 8, value, true)); return buffer; }
function u32(values) { const buffer = new ArrayBuffer(values.length * 4), view = new DataView(buffer); values.forEach((value, index) => view.setUint32(index * 4, value, true)); return buffer; }
function rawFixture() {
  const points = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
  const source = { sourceObjectId: '2', ufbxElementId: 2, ufbxTypedId: 0,
    ufbxElementType: 'MESH', ufbxElementTypeValue: 2, domClass: 'Geometry',
    domSubtype: 'Mesh', domSourceName: '', displayName: '', customProperties: [],
    sourceRecordDisposition: 'supported-geometry', nodeAttributeType: null,
    nodeAttributeTypeValue: null, objectPropertyPath: null,
    connectionPropertyNames: [], sourceDocumentOrder: 0 };
  const graph = { schema: 'FbxSourceGraph.v2', file: { version: 7400, ascii: false, creator: '' },
    documentMetadata: { originalApplication: '', latestApplication: '' },
    globalSettings: { unitMeters: 1, axes: { right: 0, up: 1, front: 2 } },
    sourceObjects: [source], occurrences: [], geometries: [{ geometryObjectId: '2',
      sourceObjectId: '2', kind: 'MESH', verticesSource: [], verticesMm: points,
      ownerOccurrenceIds: [] }], hierarchyEdges: [], connectionEdges: [], warnings: [],
    unsupportedRecords: [], unresolvedReferences: [], duplicateSourceObjectIds: [] };
  return { rawTopology: { schema: 'FbxRawMeshTopology.v1', sourceGraph: graph,
    geometries: [{ geometryObjectId: '2', sourceObjectId: '2', controlPointCount: 3,
      polygonCount: 1, polygonVertexCount: 3, emptyPolygonCount: 0, pointPolygonCount: 0,
      linePolygonCount: 0, reversedWinding: false,
      bufferIndices: { controlPointsMm: 0, polygonOffsets: 1, polygonVertexIndices: 2 } }] },
    buffers: [f64(points.flat()), u32([0, 3]), u32([0, 1, 2])] };
}
function validFbxBytes() {
  const bytes = new Uint8Array(27); bytes.set(FBX_BINARY_MAGIC);
  new DataView(bytes.buffer).setUint32(23, 7400, true); return bytes;
}
function manualWorker(send) {
  return { onmessage: null, onerror: null, onmessageerror: null, terminateCount: 0,
    terminate() { this.terminateCount += 1; },
    postMessage(job, transfer) {
      const delivered = structuredClone(job, { transfer });
      queueMicrotask(() => send(this, delivered));
    } };
}
function emitProgress(worker, job, count = FBX_WORKER_STAGES.length - 1) {
  for (const [ordinal, stage] of FBX_WORKER_STAGES.slice(0, count).entries()) {
    worker.onmessage?.({ data: makeGeometryProgress(job.jobId, stage, ordinal) });
  }
}

const bytes = validFbxBytes(), parserIdentity = await loadFbxParserIdentity();
const sourceIdentity = { sha256: await sha256Hex(bytes), byteLength: bytes.byteLength, fbxVersion: 7400 };
const built = await buildFbxGeometryBundle({ ...rawFixture(), sourceIdentity, parserIdentity });

let factoryCalls = 0;
const preAborted = new AbortController(); preAborted.abort();
await assert.rejects(() => parseFbxGeometryBundleInWorker(bytes, {
  signal: preAborted.signal, workerFactory() { factoryCalls += 1; return {}; },
}), (error) => error.code === FBX_WORKER_ERROR_CODES.ABORTED);
assert.equal(factoryCalls, 0);
let identityFactoryCalls = 0;
await assert.rejects(() => parseFbxGeometryBundleInWorker(bytes, {
  sourceIdentity: { ...sourceIdentity, sha256: '0'.repeat(64) },
  workerFactory() { identityFactoryCalls += 1; return {}; },
}), (error) => error.code === FBX_GEOMETRY_WORKER_ERROR_CODES.BUNDLE_INVALID);
await assert.rejects(() => parseFbxGeometryBundleInWorker(bytes, {
  parserIdentity: { ...parserIdentity, wasmSha256: '0'.repeat(64) },
  workerFactory() { identityFactoryCalls += 1; return {}; },
}), (error) => error.code === FBX_WORKER_ERROR_CODES.WASM_LOAD_FAILED);
assert.equal(identityFactoryCalls, 0);

let resolveCancelStarted;
const cancelStarted = new Promise((resolve) => { resolveCancelStarted = resolve; });
const cancelWorker = manualWorker((worker, job) => {
  worker.onmessage?.({ data: makeGeometryAccepted(job) });
  worker.onmessage?.({ data: makeGeometryProgress(job.jobId, 'preflight', 0) });
  resolveCancelStarted();
});
const controller = new AbortController();
const cancelled = parseFbxGeometryBundleInWorker(bytes, {
  signal: controller.signal, workerFactory: () => cancelWorker, timeoutMs: 100,
});
await cancelStarted; controller.abort();
await assert.rejects(() => cancelled, (error) => error.code === FBX_WORKER_ERROR_CODES.ABORTED
  && error.progressStages.join(',') === 'preflight');
assert.equal(cancelWorker.terminateCount, 1);

const timeoutWorker = manualWorker((worker, job) => {
  worker.onmessage?.({ data: makeGeometryAccepted(job) }); emitProgress(worker, job, 6);
});
await assert.rejects(() => parseFbxGeometryBundleInWorker(bytes, {
  workerFactory: () => timeoutWorker, timeoutMs: 5,
}), (error) => error.code === FBX_WORKER_ERROR_CODES.TIMEOUT
  && error.progressStages.at(-1) === 'enforcing-source-policy');
assert.equal(timeoutWorker.terminateCount, 1);

const wrongIdWorker = manualWorker((worker, job) => {
  worker.onmessage?.({ data: { ...makeGeometryAccepted(job), jobId: 'wrong-job' } });
});
await assert.rejects(() => parseFbxGeometryBundleInWorker(bytes, {
  workerFactory: () => wrongIdWorker, timeoutMs: 100,
}), (error) => error.code === FBX_WORKER_ERROR_CODES.RUNTIME_ERROR);

const duplicateAcceptWorker = manualWorker((worker, job) => {
  worker.onmessage?.({ data: makeGeometryAccepted(job) });
  worker.onmessage?.({ data: makeGeometryAccepted(job) });
});
await assert.rejects(() => parseFbxGeometryBundleInWorker(bytes, {
  workerFactory: () => duplicateAcceptWorker, timeoutMs: 100,
}), (error) => error.code === FBX_WORKER_ERROR_CODES.RUNTIME_ERROR);

const digestWorker = manualWorker((worker, job) => {
  worker.onmessage?.({ data: makeGeometryAccepted(job) }); emitProgress(worker, job);
  const malformed = { manifest: structuredClone(built.manifest),
    buffers: built.buffers.map((item) => ({ bufferId: item.bufferId, bytes: item.bytes.slice(0) })) };
  new Uint8Array(malformed.buffers[2].bytes)[0] ^= 1;
  worker.onmessage?.({ data: makeGeometryComplete(job.jobId, malformed, {}) });
});
await assert.rejects(() => parseFbxGeometryBundleInWorker(bytes, {
  workerFactory: () => digestWorker, timeoutMs: 100,
}), (error) => error.code === 'FBX_GEOMETRY_DIGEST_MISMATCH');

function malformedCompletionWorker(mutate) {
  return manualWorker((worker, job) => {
    worker.onmessage?.({ data: makeGeometryAccepted(job) }); emitProgress(worker, job);
    const malformed = { manifest: structuredClone(built.manifest),
      buffers: built.buffers.map((item) => ({ bufferId: item.bufferId, bytes: item.bytes.slice(0) })) };
    mutate(malformed); worker.onmessage?.({ data: makeGeometryComplete(job.jobId, malformed, {}) });
  });
}
const malformedCases = [
  (value) => value.buffers.pop(),
  (value) => value.buffers.push({ bufferId: 'unexpected', bytes: new ArrayBuffer(0) }),
  (value) => { value.buffers[1].bytes = value.buffers[0].bytes; },
  (value) => { value.buffers[0].bytes = value.buffers[0].bytes.slice(0, value.buffers[0].bytes.byteLength - 1); },
  (value) => { structuredClone(value.buffers[0].bytes, { transfer: [value.buffers[0].bytes] }); },
];
for (const mutate of malformedCases) await assert.rejects(
  () => parseFbxGeometryBundleInWorker(bytes, {
    workerFactory: () => malformedCompletionWorker(mutate), timeoutMs: 100,
  }), (error) => ['FBX_GEOMETRY_BUFFER_INVALID', 'FBX_GEOMETRY_BUNDLE_INVALID'].includes(error.code));

const lateErrorWorker = manualWorker((worker, job) => {
  worker.onmessage?.({ data: makeGeometryAccepted(job) }); emitProgress(worker, job);
  const success = { manifest: structuredClone(built.manifest),
    buffers: built.buffers.map((item) => ({ bufferId: item.bufferId, bytes: item.bytes.slice(0) })) };
  worker.onmessage?.({ data: makeGeometryComplete(job.jobId, success, {}) });
  worker.onmessage?.({ data: { schema: 'FbxWorkerMessage.v2', type: 'FBX_WORKER_ERROR',
    jobId: job.jobId, code: FBX_WORKER_ERROR_CODES.RUNTIME_ERROR, stage: 'preparing-transfer',
    message: 'late', detail: null, progressStages: FBX_WORKER_STAGES.slice(0, -1), diagnostics: {} } });
});
const lateResult = await parseFbxGeometryBundleInWorker(bytes, {
  workerFactory: () => lateErrorWorker, timeoutMs: 100,
});
assert.equal(lateResult.manifest.bundleDigest, built.manifest.bundleDigest);

const transferMessages = [];
const transferJob = { schema: FBX_GEOMETRY_WORKER_JOB_SCHEMA,
  operation: FBX_GEOMETRY_WORKER_OPERATION, jobId: 'transfer-failure',
  inputByteLength: bytes.byteLength, bytes: bytes.slice().buffer, sourceIdentity, parserIdentity };
await handleFbxWorkerMessage(transferJob, (message) => {
  if (message.type === FBX_GEOMETRY_WORKER_TYPES.COMPLETE) throw new Error('post-transfer-proof');
  transferMessages.push(message);
}, {
  async parseGeometry(_input, { onStage }) {
    for (const stage of FBX_WORKER_STAGES.slice(1, 5)) onStage(stage);
    return rawFixture();
  },
});
assert.equal(transferMessages.some((message) => message.type === FBX_GEOMETRY_WORKER_TYPES.COMPLETE), false);
assert.equal(transferMessages.at(-1).type, FBX_GEOMETRY_WORKER_TYPES.ERROR);
assert.equal(transferMessages.at(-1).code, FBX_GEOMETRY_WORKER_ERROR_CODES.TRANSFER_FAILED);
console.log('test-worker-geometry-failures: PASS');
