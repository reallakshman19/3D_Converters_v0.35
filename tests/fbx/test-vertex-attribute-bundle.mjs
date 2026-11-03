import assert from 'node:assert/strict';
import { buildFbxGeometryBundle } from '../../tabs/model-converters/converters/fbx/geometry-bundle.js';
import {
  FBX_ATTRIBUTE_ERROR_CODES,
  FBX_VERTEX_ATTRIBUTE_BUNDLE_SCHEMA,
  FbxVertexAttributeContractError,
  buildFbxVertexAttributeBundle,
  validateFbxVertexAttributeBundle,
} from '../../tabs/model-converters/converters/fbx/vertex-attribute-bundle.js';

const hash = (char) => char.repeat(64);
const sourceIdentity = { sha256: hash('a'), byteLength: 128, fbxVersion: 7400 };
const parserIdentity = {
  provenanceSchema: 'UfbxWasmProvenance.v1', upstreamRevision: 'b'.repeat(40),
  sourceSha256: hash('c'), wasmSha256: hash('d'),
};
function sourceObject() {
  return { sourceObjectId: '7', ufbxElementId: 7, ufbxTypedId: 0,
    ufbxElementType: 'MESH', ufbxElementTypeValue: 2, domClass: 'Geometry',
    domSubtype: 'Mesh', domSourceName: '', displayName: '', customProperties: [],
    sourceRecordDisposition: 'supported-geometry', nodeAttributeType: null,
    nodeAttributeTypeValue: null, objectPropertyPath: null,
    connectionPropertyNames: [], sourceDocumentOrder: 0 };
}
async function geometryFixture() {
  const points = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
  const graph = { schema: 'FbxSourceGraph.v2', file: { version: 7400, ascii: false, creator: '' },
    documentMetadata: { originalApplication: '', latestApplication: '' },
    globalSettings: { unitMeters: 1, axes: { right: 0, up: 1, front: 2 } },
    sourceObjects: [sourceObject()], occurrences: [],
    geometries: [{ geometryObjectId: '7', sourceObjectId: '7', kind: 'MESH',
      verticesSource: [], verticesMm: points, ownerOccurrenceIds: [] }],
    hierarchyEdges: [], connectionEdges: [], warnings: [], unsupportedRecords: [],
    unresolvedReferences: [], duplicateSourceObjectIds: [] };
  return buildFbxGeometryBundle({ rawTopology: { schema: 'FbxRawMeshTopology.v1', sourceGraph: graph,
    geometries: [{ geometryObjectId: '7', sourceObjectId: '7', controlPointCount: 3,
      polygonCount: 1, polygonVertexCount: 3, emptyPolygonCount: 0,
      pointPolygonCount: 0, linePolygonCount: 0, reversedWinding: false,
      bufferIndices: { controlPointsMm: 0, polygonOffsets: 1, polygonVertexIndices: 2 } }] },
    buffers: [float64(points.flat()), uint32([0, 3]), uint32([0, 1, 2])],
    sourceIdentity, parserIdentity });
}

function float64(values) {
  const bytes = new ArrayBuffer(values.length * 8), view = new DataView(bytes);
  values.forEach((value, index) => view.setFloat64(index * 8, value, true));
  return bytes;
}
function uint32(values) {
  const bytes = new ArrayBuffer(values.length * 4), view = new DataView(bytes);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return bytes;
}
let bufferList = [];
function attribute(valueCount, valueReals, values, indices, uniquePerVertex = false) {
  const valueIndex = bufferList.push(float64(values)) - 1;
  const indexIndex = bufferList.push(uint32(indices)) - 1;
  return {
    sourceDomain: uniquePerVertex ? 'control-point' : 'polygon-vertex',
    referenceMode: 'indexed-value-table', valueCount, valueReals,
    uniquePerVertex, bufferIndices: { values: valueIndex, indices: indexIndex },
  };
}
function setAttribute(setOrdinal, sourceSetIndex, name, components, values, indices) {
  return {
    ...attribute(values.length / components, components, values, indices),
    setOrdinal, sourceSetIndex, name,
  };
}
function fixtureSets() {
  const uvSets = [
    setAttribute(0, 5, '', 2, [0, 0, 1, 0, 0, 1], [0, 1, 2]),
    setAttribute(1, 6, '', 2, [0, 0, 2, 0, 0, 2], [0, 1, 2]),
  ];
  const colorSets = [
    setAttribute(0, 2, 'Color', 4, [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1], [0, 1, 2]),
  ];
  return { uvSets, colorSets };
}
function fixtureGeometry() {
  const normal = attribute(3, 3, [1, 0, -0, 0, 1, 0, 0, 0, 1], [0, 1, 2]);
  const materialIndex = bufferList.push(uint32([4])) - 1;
  return {
    geometryObjectId: '7', normalOrigin: 'source', normal,
    tangent: null, bitangent: null, ...fixtureSets(),
    faceMaterialSlots: { count: 1, bufferIndex: materialIndex },
  };
}
function fixture() {
  bufferList = [];
  return {
    rawAttributes: {
      schema: 'FbxRawVertexAttributes.v1', geometries: [fixtureGeometry()],
    },
    buffers: bufferList,
  };
}

const geometryBundle = await geometryFixture();
const input = fixture();
const bundle = await buildFbxVertexAttributeBundle({ geometryBundle, ...input });
assert.equal(bundle.manifest.schema, FBX_VERTEX_ATTRIBUTE_BUNDLE_SCHEMA);
assert.equal(bundle.manifest.geometryBundleDigest, geometryBundle.manifest.bundleDigest);
assert.equal(bundle.manifest.geometries[0].uvSets.length, 2);
assert.deepEqual(bundle.manifest.geometries[0].uvSets.map((item) => item.name), ['', '']);
assert.deepEqual(bundle.manifest.geometries[0].uvSets.map((item) => item.sourceSetIndex), [5, 6]);
assert.equal(bundle.manifest.geometries[0].faceMaterialSlots.count, 1);
assert.equal(await validateFbxVertexAttributeBundle(bundle), true);

const normalValues = bundle.buffers.find((item) => item.bufferId.endsWith('/normal-values')).bytes;
assert.equal(Object.is(new DataView(normalValues).getFloat64(16, true), -0), false);

const invalidIndex = fixture();
new DataView(invalidIndex.buffers[1]).setUint32(8, 3, true);
await assert.rejects(
  buildFbxVertexAttributeBundle({ geometryBundle, ...invalidIndex }),
  (error) => error instanceof FbxVertexAttributeContractError
    && error.code === FBX_ATTRIBUTE_ERROR_CODES.RAW_INVALID,
);

const duplicateSet = fixture();
duplicateSet.rawAttributes.geometries[0].uvSets[1].sourceSetIndex = 5;
await assert.rejects(
  buildFbxVertexAttributeBundle({ geometryBundle, ...duplicateSet }),
  (error) => error.code === FBX_ATTRIBUTE_ERROR_CODES.RAW_INVALID,
);

const malformedId = fixture();
malformedId.rawAttributes.geometries[0].geometryObjectId = '07';
await assert.rejects(
  buildFbxVertexAttributeBundle({ geometryBundle, ...malformedId }),
  (error) => error.code === FBX_ATTRIBUTE_ERROR_CODES.RAW_INVALID,
);

const incomplete = fixture();
incomplete.buffers.pop();
await assert.rejects(
  buildFbxVertexAttributeBundle({ geometryBundle, ...incomplete }),
  (error) => error.code === FBX_ATTRIBUTE_ERROR_CODES.BUFFER_INVALID,
);

const tooManyUvSets = fixture();
tooManyUvSets.rawAttributes.geometries[0].uvSets = Array.from({ length: 9 }, (_, index) => ({
  ...tooManyUvSets.rawAttributes.geometries[0].uvSets[0],
  setOrdinal: index, sourceSetIndex: index,
}));
await assert.rejects(
  buildFbxVertexAttributeBundle({ geometryBundle, ...tooManyUvSets }),
  (error) => error.code === FBX_ATTRIBUTE_ERROR_CODES.LIMIT_EXCEEDED,
);

console.log('test-vertex-attribute-bundle: PASS');
