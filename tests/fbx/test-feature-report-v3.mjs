import assert from 'node:assert/strict';
import { buildFbxGeometryBundle } from '../../tabs/model-converters/converters/fbx/geometry-bundle.js';
import { buildFbxFeatureReportV3, validateFbxFeatureReportV3 } from '../../tabs/model-converters/converters/fbx/feature-report-v3.js';

const sourceIdentity = { sha256: 'a'.repeat(64), byteLength: 128, fbxVersion: 7400 };
const parserIdentity = { provenanceSchema: 'UfbxWasmProvenance.v1',
  upstreamRevision: 'b'.repeat(40), sourceSha256: 'c'.repeat(64), wasmSha256: 'd'.repeat(64) };
function f64(values) { const buffer = new ArrayBuffer(values.length * 8), view = new DataView(buffer); values.forEach((value, index) => view.setFloat64(index * 8, value, true)); return buffer; }
function u32(values) { const buffer = new ArrayBuffer(values.length * 4), view = new DataView(buffer); values.forEach((value, index) => view.setUint32(index * 4, value, true)); return buffer; }
function fixture() {
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
  return { graph, rawTopology: { schema: 'FbxRawMeshTopology.v1', sourceGraph: graph,
    geometries: [{ geometryObjectId: '2', sourceObjectId: '2', controlPointCount: 4,
      polygonCount: 2, polygonVertexCount: 7, emptyPolygonCount: 0, pointPolygonCount: 0,
      linePolygonCount: 0, reversedWinding: false,
      bufferIndices: { controlPointsMm: 0, polygonOffsets: 1, polygonVertexIndices: 2 } }] },
    buffers: [f64(points.flat()), u32([0, 4, 7]), u32([0, 1, 2, 3, 0, 2, 3])] };
}
const input = fixture();
const geometryBundle = await buildFbxGeometryBundle({ rawTopology: input.rawTopology,
  buffers: input.buffers, sourceIdentity, parserIdentity });
const report = await buildFbxFeatureReportV3({ graph: input.graph, geometryBundle });
validateFbxFeatureReportV3(report);
assert.equal(report.schema, 'FbxFeatureReport.v3');
assert.equal(report.geometryBundleSchema, 'FbxGeometryBundle.v1');
assert.equal(report.geometryBundleDigest, geometryBundle.manifest.bundleDigest);
assert.equal(report.counts.topologyGeometries, 1);
assert.equal(report.counts.polygonCount, 2);
assert.equal(report.counts.polygonVertexCount, 7);
const topology = report.features.find((item) => item.featureId === 'mesh-topology');
assert.equal(topology.evidenceCount, 1);
assert.equal(topology.parsed, true);
assert.equal(topology.engineeringMappingStatus, 'not-applicable');
assert.ok(topology.limitations.includes('TOPOLOGY_NOT_ENGINEERING_CONNECTIVITY'));
const forbidden = new Set(['jobId', 'workerId', 'timestamp', 'durationMs', 'stageTimingsMs',
  'memory', 'runtimeEnvironment', 'progressStages', 'terminalCode']);
(function visit(value) { if (Array.isArray(value)) return value.forEach(visit); if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) { assert.ok(!forbidden.has(key)); visit(child); } }(report));
const mismatched = structuredClone(geometryBundle);
mismatched.manifest.sourceGraphSha256 = '0'.repeat(64);
await assert.rejects(() => buildFbxFeatureReportV3({ graph: input.graph, geometryBundle: mismatched }));
const malformedWarning = structuredClone(report);
malformedWarning.warnings = [{ type: 0, description: 'x', elementId: 0, count: 1, extra: true }];
malformedWarning.counts.warnings = 1;
assert.throws(() => validateFbxFeatureReportV3(malformedWarning));
const malformedUnknown = structuredClone(report);
malformedUnknown.unknownElementTypes = [{ elementType: '', elementTypeValue: 42, count: 1 }];
assert.throws(() => validateFbxFeatureReportV3(malformedUnknown));
console.log('test-feature-report-v3: PASS');
