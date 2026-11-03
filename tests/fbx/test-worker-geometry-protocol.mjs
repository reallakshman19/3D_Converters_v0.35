import assert from 'node:assert/strict';
import { buildFbxGeometryBundle } from '../../tabs/model-converters/converters/fbx/geometry-bundle.js';
import {
  FBX_GEOMETRY_WORKER_ERROR_CODES, FBX_GEOMETRY_WORKER_JOB_SCHEMA,
  FBX_GEOMETRY_WORKER_MESSAGE_SCHEMA, FBX_GEOMETRY_WORKER_OPERATION,
  FBX_GEOMETRY_WORKER_TYPES,
  assertFbxGeometryWorkerJob, assertGeometryAcceptedMessage,
  assertGeometryCompleteMessage, assertGeometryErrorMessage,
  assertGeometryProgressMessage, assertGeometryWorkerEnvelope,
  makeGeometryAccepted, makeGeometryComplete, makeGeometryProgress,
  makeGeometryWorkerError,
} from '../../tabs/model-converters/converters/fbx/geometry-worker-protocol.js';
import { FBX_WORKER_STAGES, FbxWorkerRuntimeError } from '../../tabs/model-converters/converters/fbx/worker-protocol.js';

const sourceIdentity = { sha256: 'a'.repeat(64), byteLength: 128, fbxVersion: 7400 };
const parserIdentity = { provenanceSchema: 'UfbxWasmProvenance.v1',
  upstreamRevision: 'b'.repeat(40), sourceSha256: 'c'.repeat(64), wasmSha256: 'd'.repeat(64) };
function f64(values) { const buffer = new ArrayBuffer(values.length * 8), view = new DataView(buffer); values.forEach((value, index) => view.setFloat64(index * 8, value, true)); return buffer; }
function u32(values) { const buffer = new ArrayBuffer(values.length * 4), view = new DataView(buffer); values.forEach((value, index) => view.setUint32(index * 4, value, true)); return buffer; }
function bundleInput() {
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
  const geometry = { geometryObjectId: '2', sourceObjectId: '2', controlPointCount: 3,
    polygonCount: 1, polygonVertexCount: 3, emptyPolygonCount: 0, pointPolygonCount: 0,
    linePolygonCount: 0, reversedWinding: false,
    bufferIndices: { controlPointsMm: 0, polygonOffsets: 1, polygonVertexIndices: 2 } };
  return { rawTopology: { schema: 'FbxRawMeshTopology.v1', sourceGraph: graph,
    geometries: [geometry] }, buffers: [f64(points.flat()), u32([0, 3]), u32([0, 1, 2])],
    sourceIdentity, parserIdentity };
}

const bytes = new ArrayBuffer(sourceIdentity.byteLength);
const job = { schema: FBX_GEOMETRY_WORKER_JOB_SCHEMA,
  operation: FBX_GEOMETRY_WORKER_OPERATION, jobId: 'geometry-job-1',
  inputByteLength: bytes.byteLength, bytes, sourceIdentity, parserIdentity };
assert.equal(assertFbxGeometryWorkerJob(job), job);
for (const invalid of [
  { ...job, unexpected: true }, { ...job, schema: 'FbxWorkerJob.v1' },
  { ...job, sourceIdentity: { ...sourceIdentity, sha256: 'x'.repeat(64) } },
  { ...job, parserIdentity: { ...parserIdentity, provenanceSchema: 'wrong' } },
]) assert.throws(() => assertFbxGeometryWorkerJob(invalid),
  (error) => error.code === FBX_GEOMETRY_WORKER_ERROR_CODES.JOB_INVALID);

const accepted = makeGeometryAccepted(job);
assert.equal(accepted.schema, FBX_GEOMETRY_WORKER_MESSAGE_SCHEMA);
assert.equal(accepted.type, FBX_GEOMETRY_WORKER_TYPES.ACCEPTED);
assertGeometryAcceptedMessage(assertGeometryWorkerEnvelope(accepted, job.jobId), bytes.byteLength);
assert.throws(() => assertGeometryAcceptedMessage({ ...accepted, extra: true }, bytes.byteLength));

const progress = [];
for (const [ordinal, stage] of FBX_WORKER_STAGES.slice(0, -1).entries()) {
  const message = makeGeometryProgress(job.jobId, stage, ordinal);
  assertGeometryProgressMessage(assertGeometryWorkerEnvelope(message, job.jobId), progress);
  assert.throws(() => assertGeometryProgressMessage({ ...message, extra: true }, progress));
  progress.push(stage);
}

const bundle = await buildFbxGeometryBundle(bundleInput());
const complete = makeGeometryComplete(job.jobId, bundle, {});
await assertGeometryCompleteMessage(assertGeometryWorkerEnvelope(complete, job.jobId), progress);
await assert.rejects(() => assertGeometryCompleteMessage({ ...complete, extra: true }, progress));
const tampered = structuredClone(complete);
tampered.buffers = complete.buffers.map((item) => ({ bufferId: item.bufferId, bytes: item.bytes.slice(0) }));
new Uint8Array(tampered.buffers[2].bytes)[0] ^= 1;
await assert.rejects(() => assertGeometryCompleteMessage(tampered, progress), /DIGEST_MISMATCH/);

const failure = new FbxWorkerRuntimeError(FBX_GEOMETRY_WORKER_ERROR_CODES.JOB_INVALID,
  'invalid job', { detail: 'proof' });
const errorMessage = makeGeometryWorkerError(job.jobId, failure, [], {});
assertGeometryErrorMessage(assertGeometryWorkerEnvelope(errorMessage, job.jobId), []);
assert.throws(() => assertGeometryErrorMessage({ ...errorMessage, extra: true }, []));
assert.throws(() => assertGeometryWorkerEnvelope(accepted, 'wrong-job'));
console.log('test-worker-geometry-protocol: PASS');
