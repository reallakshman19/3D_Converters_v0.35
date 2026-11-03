import assert from 'node:assert/strict';
import { buildLiveZonePackageInputs } from '../../tabs/model-converters/converters/fbx/zone-package/live-input.js';
import {
  buildSelectedZonePackage, validateSelectedZonePackage,
} from '../../tabs/model-converters/converters/fbx/zone-package/package-builder.js';
import { sourceIdentityFixture, COMPLETE_SOURCE_GRAPH_SHA256 } from './zone-package-fixtures.mjs';

function float64Bytes(values) {
  const bytes = new Uint8Array(values.length * 8), view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat64(index * 8, value, true));
  return bytes;
}
function uint32Bytes(values) {
  const bytes = new Uint8Array(values.length * 4), view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return bytes;
}
function selectedBuffer(role, scalarType, values) {
  const bytes = scalarType === 'Float64' ? float64Bytes(values) : uint32Bytes(values);
  return { role, descriptor: { scalarType }, buffer: { bytes } };
}

const geometryId = '10';
const occurrences = [
  { sourceOccurrenceId: 'occ:2', sourceModelObjectId: '2', parentOccurrenceId: null,
    geometryObjectIds: [geometryId] },
  { sourceOccurrenceId: 'occ:1', sourceModelObjectId: '1', parentOccurrenceId: null,
    geometryObjectIds: [geometryId] },
];
const sourceGraph = {
  schema: 'FbxSourceGraph.v2',
  sourceObjects: [
    { sourceObjectId: '1', ufbxElementType: 'NODE', customProperties: [] },
    { sourceObjectId: '2', ufbxElementType: 'NODE', customProperties: [] },
    { sourceObjectId: geometryId, ufbxElementType: 'MESH', customProperties: [] },
  ],
  occurrences,
  geometries: [{
    geometryObjectId: geometryId, sourceObjectId: geometryId, kind: 'MESH',
    verticesMm: [[0, 0, 0]], ownerOccurrenceIds: occurrences.map((item) => item.sourceOccurrenceId),
  }],
};
const zoneGeometryEvidence = {
  schema: 'FbxZoneGeometryEvidence.v1',
  artifactId: `fbx-zone-geometry-evidence:${'1'.repeat(64)}`,
  sourceGraphSha256: COMPLETE_SOURCE_GRAPH_SHA256,
  sourceIdentity: sourceIdentityFixture(),
  selectedZone: { zoneId: 'occ:1', label: 'ZONE' },
  selectedOccurrenceIds: occurrences.map((item) => item.sourceOccurrenceId),
  selectedGeometryIds: [geometryId],
};
const inputs = await buildLiveZonePackageInputs({
  zoneGeometryEvidence,
  sourceGraph,
  scope: {
    zoneId: 'occ:1', zoneLabel: 'ZONE', selectedOccurrences: occurrences,
    selectedGeometryIds: [geometryId], ancestorOccurrenceIds: [],
  },
  selections: [{
    geometry: { geometryObjectId: geometryId, sourceObjectId: geometryId },
    buffers: [
      selectedBuffer('control-points-mm', 'Float64', [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]),
      selectedBuffer('polygon-offsets', 'Uint32', [0, 4]),
      selectedBuffer('polygon-vertex-indices', 'Uint32', [0, 1, 2, 3]),
    ],
  }],
  pipeClassifications: [],
  stagedJsonText: '[]\n',
});

assert.deepEqual(inputs.manifest.geometries[0].occurrenceIds, ['occ:1', 'occ:2']);
assert.equal(inputs.manifest.byteOrder, 'little-endian');
assert.equal(inputs.stagedJsonText, '[]\n');
assert.equal(inputs.supportHostAssociationEvidence.status, 'PASS');
assert.equal(inputs.supportHostAssociationEvidence.counts.candidateCount, 0);
assert.equal(inputs.supportAssemblyEvidence.status, 'PASS');
assert.equal(inputs.supportAssemblyEvidence.counts.candidateCount, 0);
assert.equal(inputs.supportAssemblyEvidence.counts.assemblyCount, 0);
const packageValue = await buildSelectedZonePackage(inputs);
await validateSelectedZonePackage(packageValue);
assert.equal(packageValue.audit.geometryCount, 1);
assert.ok(packageValue.files.some((file) => file.path === 'stagedjson.json'));
assert.ok(packageValue.files.some((file) => file.path === 'evidence/support-host-associations.json'));
assert.ok(packageValue.files.some((file) => file.path === 'evidence/support-assemblies.json'));

console.log('test-zone-package-live-input: PASS');
