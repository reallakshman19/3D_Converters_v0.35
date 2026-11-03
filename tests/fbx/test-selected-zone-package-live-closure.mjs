import assert from 'node:assert/strict';
import { encodeSelectedGeometryBuffers } from '../../tabs/model-converters/converters/fbx/zone-package/geometry-buffers.js';
import { buildLiveZonePackageInputs } from '../../tabs/model-converters/converters/fbx/zone-package/live-input.js';
import { buildSelectedZonePackage } from '../../tabs/model-converters/converters/fbx/zone-package/package-builder.js';

const zoneId = 'occ:10';
const zoneArtifactId = `fbx-zone-geometry-evidence:${'1'.repeat(64)}`;
const crosswalkId = `FBXZCROSS-${'2'.repeat(32)}`;
const solidId = `fbx-solid-fitting-port-evidence:${'3'.repeat(64)}`;
const sourceGraphSha256 = '4'.repeat(64);
const geometry = {
  geometryId: '100', sourceObjectId: '100', occurrenceIds: [zoneId],
  controlPointsMm: [0, 0, 0, 10, 0, 0, 0, 10, 0],
  polygonOffsets: [0, 3], polygonVertexIndices: [0, 1, 2],
};
const encoded = await encodeSelectedGeometryBuffers(geometry);
const selections = [{
  geometry: { geometryObjectId: '100', sourceObjectId: '100' },
  buffers: Object.values(encoded.buffers).map((buffer) => ({
    role: buffer.role,
    descriptor: {
      scalarType: buffer.scalarType, componentCount: buffer.componentCount,
    },
    buffer: {
      bytes: buffer.bytes, sha256: buffer.sha256, byteLength: buffer.byteLength,
    },
  })),
}];
const sourceGraph = {
  schema: 'FbxSourceGraph.v2',
  sourceObjects: [
    { sourceObjectId: '10', ufbxElementType: 'NODE' },
    { sourceObjectId: '100', ufbxElementType: 'MESH' },
  ],
  occurrences: [{
    sourceOccurrenceId: zoneId, sourceModelObjectId: '10',
    parentOccurrenceId: null, geometryObjectIds: ['100'],
  }],
  geometries: [{ geometryObjectId: '100', sourceObjectId: '100', kind: 'MESH',
    verticesMm: [[0, 0, 0]], ownerOccurrenceIds: [zoneId] }],
};
const zoneGeometryEvidence = {
  schema: 'FbxZoneGeometryEvidence.v1', artifactId: zoneArtifactId,
  sourceGraphSha256,
  sourceIdentity: { sha256: '5'.repeat(64), byteLength: 100, fbxVersion: 7500 },
  selectedZone: { zoneId, label: 'LIVE-ZONE' },
  selectedOccurrenceIds: [zoneId], selectedGeometryIds: ['100'],
};
const componentCrosswalk = {
  schema: 'FbxSelectedZoneComponentCrosswalk.v1', artifactId: crosswalkId,
  inputs: { zoneGeometryArtifactId: zoneArtifactId, selectedZoneId: zoneId },
  managedComponents: [{ mappingEntryId: 'map-1' }],
};
const engineeringAttributeLedger = {
  schema: 'FbxEngineeringAttributeLedger.v1', status: 'PASS',
  components: [{ mappingEntryId: 'map-1', componentType: 'ELBOW', generated: false, status: 'PASS', fields: [] }],
};
const stagedBranches = [{
  type: 'BRANCH', children: [{ type: 'ELBO', attributes: { mappingEntryId: 'map-1' }, children: [] }],
}];
const fitting = (schema) => ({
  schema, sourceComponentCrosswalkArtifactId: crosswalkId,
  sourceSolidFittingPortEvidenceArtifactId: solidId,
});
const inputs = await buildLiveZonePackageInputs({
  zoneGeometryEvidence, sourceGraph,
  scope: { zoneId, zoneLabel: 'LIVE-ZONE', selectedOccurrences: sourceGraph.occurrences,
    selectedGeometryIds: ['100'], ancestorOccurrenceIds: [] },
  selections, stagedBranches, mappedStageStatus: 'MAPPED_STAGE_AVAILABLE',
  engineeringAttributeStatus: 'ENGINEERING_ATTRIBUTE_LEDGER_AVAILABLE',
  engineeringAttributeLedger,
  derivedPortEvidence: { schema: 'FbxDerivedPortEvidence.v1', sourceZoneGeometryArtifactId: zoneArtifactId },
  solidFittingPortEvidence: { schema: 'FbxSolidFittingPortEvidence.v3', artifactId: solidId, sourceZoneGeometryArtifactId: zoneArtifactId },
  componentCrosswalk,
  connectivityEvidence: { schema: 'FbxSelectedZoneConnectivityEvidence.v1', status: 'PASS', sourceComponentCrosswalkArtifactId: crosswalkId, selectedZone: { zoneGeometryArtifactId: zoneArtifactId } },
  generatedGapPipeEvidence: null,
  elbowEvidence: fitting('FbxElbowPortEvidence.v1'), teeEvidence: fitting('FbxTeePortEvidence.v1'),
  reducerEvidence: fitting('FbxReducerPortEvidence.v1'),
  branchFittingEvidence: fitting('FbxBranchFittingPortEvidence.v1'),
  inlineAssemblyEvidence: fitting('FbxInlineAssemblyPortEvidence.v1'),
});
assert.equal(inputs.qualificationRoot.status, 'PASS');
assert.equal(inputs.artifacts.ENGINEERING_ATTRIBUTES.components.length, 1);
assert.equal(inputs.artifacts.SELECTED_SOURCE_GRAPH.geometries.length, 1);
const packaged = await buildSelectedZonePackage(inputs);
assert.ok(packaged.files.some((file) => file.path === 'qualification-root.json'));
assert.ok(packaged.files.some((file) => file.path === 'evidence/engineering-attributes.json'));
console.log('test-selected-zone-package-live-closure: PASS');
