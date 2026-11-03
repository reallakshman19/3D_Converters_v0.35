import assert from 'node:assert/strict';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { buildFbxGeometryBundle } from '../../tabs/model-converters/converters/fbx/geometry-bundle.js';
import { parseFbxGeometryBundleInWorker } from '../../tabs/model-converters/converters/fbx/geometry-transport.js';
import { loadFbxParserIdentity } from '../../tabs/model-converters/converters/fbx/parser-wasm.js';
import { handleFbxWorkerMessage } from '../../tabs/model-converters/converters/fbx/parser-worker.js';
import { sha256Hex } from '../../tabs/model-converters/converters/fbx/sha256.js';
import { FBX_BINARY_MAGIC } from '../../tabs/model-converters/converters/fbx/worker-preflight.js';
import { FBX_GEOMETRY_WORKER_TYPES } from '../../tabs/model-converters/converters/fbx/geometry-worker-protocol.js';
import { FBX_WORKER_STAGES } from '../../tabs/model-converters/converters/fbx/worker-protocol.js';

function f64(values) { const buffer = new ArrayBuffer(values.length * 8), view = new DataView(buffer); values.forEach((value, index) => view.setFloat64(index * 8, value, true)); return buffer; }
function u32(values) { const buffer = new ArrayBuffer(values.length * 4), view = new DataView(buffer); values.forEach((value, index) => view.setUint32(index * 4, value, true)); return buffer; }
function rawFixture() {
  const points = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]];
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
  const geometry = { geometryObjectId: '2', sourceObjectId: '2', controlPointCount: 4,
    polygonCount: 2, polygonVertexCount: 7, emptyPolygonCount: 0, pointPolygonCount: 0,
    linePolygonCount: 0, reversedWinding: false,
    bufferIndices: { controlPointsMm: 0, polygonOffsets: 1, polygonVertexIndices: 2 } };
  return { rawTopology: { schema: 'FbxRawMeshTopology.v1', sourceGraph: graph,
    geometries: [geometry] }, buffers: [f64(points.flat()), u32([0, 4, 7]),
      u32([0, 1, 2, 3, 0, 2, 3])] };
}
function validFbxBytes() {
  const bytes = new Uint8Array(27); bytes.set(FBX_BINARY_MAGIC);
  new DataView(bytes.buffer).setUint32(23, 7400, true); return bytes;
}
function workerWith(overrides) {
  return {
    onmessage: null, onerror: null, onmessageerror: null,
    terminateCount: 0, inputDetached: false, outputDetached: false,
    terminate() { this.terminateCount += 1; },
    postMessage(job, transfer) {
      const workerJob = structuredClone(job, { transfer });
      this.inputDetached = transfer.every((item) => item.byteLength === 0);
      queueMicrotask(() => {
        void handleFbxWorkerMessage(workerJob, (message, outputTransfer = []) => {
          const delivered = structuredClone(message, { transfer: outputTransfer });
          if (message.type === FBX_GEOMETRY_WORKER_TYPES.COMPLETE) {
            this.outputDetached = outputTransfer.length > 0
              && outputTransfer.every((item) => item.byteLength === 0);
          }
          queueMicrotask(() => this.onmessage?.({ data: delivered }));
        }, overrides);
      });
    },
  };
}

const source = validFbxBytes(), sourceBefore = source.slice();
const raw = rawFixture(), parserIdentity = await loadFbxParserIdentity();
const sourceIdentity = { sha256: await sha256Hex(source), byteLength: source.byteLength, fbxVersion: 7400 };
const direct = await buildFbxGeometryBundle({ ...raw, sourceIdentity, parserIdentity });
const progress = [], diagnostics = [];
const worker = workerWith({
  async parseGeometry(_bytes, { onStage }) {
    for (const stage of FBX_WORKER_STAGES.slice(1, 5)) onStage(stage);
    const fixture = rawFixture();
    return { rawTopology: fixture.rawTopology, buffers: fixture.buffers };
  },
});
const managed = await parseFbxGeometryBundleInWorker(source, {
  workerFactory: () => worker, timeoutMs: 100,
  onProgress: (stage) => progress.push(stage),
  onDiagnostics: (value) => diagnostics.push(value),
});
assert.deepEqual(source, sourceBefore, 'caller input must remain owned and unchanged');
assert.equal(worker.inputDetached, true, 'worker input snapshot must transfer ownership');
assert.equal(worker.outputDetached, true, 'worker output buffers must detach after transfer');
assert.equal(worker.terminateCount, 1, 'managed worker must terminate after success');
assert.deepEqual(progress, FBX_WORKER_STAGES.slice(0, -1));
assert.equal(diagnostics.length, 1);
assert.equal(canonicalJson(managed.manifest), canonicalJson(direct.manifest));
assert.deepEqual(managed.buffers.map((item) => [item.bufferId, [...new Uint8Array(item.bytes)]]),
  direct.buffers.map((item) => [item.bufferId, [...new Uint8Array(item.bytes)]]));
assert.ok(managed.buffers.every((item) => item.bytes.byteLength > 0));
console.log('test-worker-geometry-transfer: PASS');
