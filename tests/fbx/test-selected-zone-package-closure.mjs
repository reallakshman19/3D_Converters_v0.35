import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { buildSupportAssemblyEvidence } from '../../tabs/model-converters/converters/fbx/support-assembly/evidence.js';
import { buildSupportHostAssociationEvidence } from '../../tabs/model-converters/converters/fbx/support-host/evidence.js';
import { buildPackageArchive } from '../../tabs/model-converters/converters/fbx/zone-package/archive.js';
import { buildSelectedZoneGeometryManifest } from '../../tabs/model-converters/converters/fbx/zone-package/geometry-manifest.js';
import { buildSelectedZonePackage, validateSelectedZonePackage } from '../../tabs/model-converters/converters/fbx/zone-package/package-builder.js';
import { buildSelectedZoneQualificationRoot } from '../../tabs/model-converters/converters/fbx/zone-package/qualification-root.js';
import { buildSelectedZoneEngineeringAttributeLedger } from '../../tabs/model-converters/converters/fbx/zone-package/selected-engineering-attributes.js';
import { buildSelectedZoneSourceGraph } from '../../tabs/model-converters/converters/fbx/zone-package/selected-source-graph.js';
import { buildSupportCandidateEvidence } from '../../tabs/model-converters/converters/fbx/zone-package/support-evidence.js';

function schemaErrors(schema, instance) {
  const program = `
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload["schema"])
print(json.dumps([error.message for error in Draft202012Validator(payload["schema"]).iter_errors(payload["instance"])]))
`;
  const result = spawnSync(process.env.FBX_SCHEMA_PYTHON || 'python3', ['-c', program], {
    input: JSON.stringify({ schema, instance }), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return JSON.parse(result.stdout);
}

async function contract(name, instance) {
  const schema = JSON.parse(await readFile(new URL(`../../contracts/fbx/${name}`, import.meta.url), 'utf8'));
  assert.deepEqual(schemaErrors(schema, instance), [], `${name} rejected its production instance`);
}

const COMPLETE_GRAPH_HASH = 'a'.repeat(64);
const ZONE_ARTIFACT = `fbx-zone-geometry-evidence:${'b'.repeat(64)}`;
const CROSSWALK_ID = `FBXZCROSS-${'c'.repeat(32)}`;
const SOLID_ID = `fbx-solid-fitting-port-evidence:${'d'.repeat(64)}`;
const zoneGeometryEvidence = {
  schema: 'FbxZoneGeometryEvidence.v1', artifactId: ZONE_ARTIFACT,
  sourceGraphSha256: COMPLETE_GRAPH_HASH,
  sourceIdentity: { sha256: 'e'.repeat(64), byteLength: 1000, fbxVersion: 7500 },
  selectedZone: { zoneId: 'occ:10', label: 'ZONE-A' },
  selectedOccurrenceIds: ['occ:10'], selectedGeometryIds: ['100'],
};
const sourceGraph = {
  schema: 'FbxSourceGraph.v2',
  sourceObjects: [
    { sourceObjectId: '10', ufbxElementType: 'NODE', displayName: 'ZONE-A' },
    { sourceObjectId: '100', ufbxElementType: 'MESH', displayName: 'ELBOW-1' },
  ],
  occurrences: [{
    sourceOccurrenceId: 'occ:10', sourceModelObjectId: '10',
    parentOccurrenceId: null, geometryObjectIds: ['100'],
  }],
  geometries: [{ geometryObjectId: '100', sourceObjectId: '100', kind: 'MESH',
    verticesMm: [[0, 0, 0]], ownerOccurrenceIds: ['occ:10'] }],
};
const scope = {
  zoneId: 'occ:10', zoneLabel: 'ZONE-A',
  selectedOccurrences: sourceGraph.occurrences,
  selectedGeometryIds: ['100'], ancestorOccurrenceIds: [],
};
const componentCrosswalk = {
  schema: 'FbxSelectedZoneComponentCrosswalk.v1', artifactId: CROSSWALK_ID,
  inputs: { zoneGeometryArtifactId: ZONE_ARTIFACT, selectedZoneId: 'occ:10' },
  managedComponents: [{ mappingEntryId: 'map-1' }],
};
const globalEngineering = {
  schema: 'FbxEngineeringAttributeLedger.v1', status: 'PASS',
  components: [{
    mappingEntryId: 'map-1', logicalComponentId: 'ELBOW-1', componentType: 'ELBOW',
    generated: false, status: 'PASS', fields: [],
  }],
};
const stagedBranches = [{
  type: 'BRANCH', id: 'B1', attributes: { REF: 'B1' },
  children: [{ type: 'ELBO', id: 'ELBOW-1', attributes: { mappingEntryId: 'map-1' }, children: [] }],
}];

function boundFitting(schema) {
  return { schema, sourceComponentCrosswalkArtifactId: CROSSWALK_ID,
    sourceSolidFittingPortEvidenceArtifactId: SOLID_ID };
}

const { manifest, buffersByGeometryId } = await buildSelectedZoneGeometryManifest({
  completeSourceGraphSha256: COMPLETE_GRAPH_HASH,
  sourceIdentity: zoneGeometryEvidence.sourceIdentity,
  geometries: [{
    geometryId: '100', sourceObjectId: '100', occurrenceIds: ['occ:10'],
    controlPointsMm: [0, 0, 0, 10, 0, 0, 0, 10, 0],
    polygonOffsets: [0, 3], polygonVertexIndices: [0, 1, 2],
  }],
});
const selectedSourceGraph = await buildSelectedZoneSourceGraph({
  sourceGraph, scope, zoneGeometryEvidence,
});
assert.equal(selectedSourceGraph.geometries[0].verticesMm, undefined);
assert.equal(selectedSourceGraph.geometries[0].coordinatePayloadDisposition,
  'OMITTED_BINARY_BUFFER_AUTHORITY');
const selectedEngineering = await buildSelectedZoneEngineeringAttributeLedger({
  engineeringAttributeLedger: globalEngineering, componentCrosswalk, zoneGeometryEvidence,
});
const supportEvidence = await buildSupportCandidateEvidence({
  selectedZoneDigest: manifest.selectedZoneDigest, occurrences: [],
});
const supportHostAssociationEvidence = await buildSupportHostAssociationEvidence({
  supportEvidence, zoneGeometryEvidence, scope, selections: [],
  pipeClassifications: [], manifest,
});
const supportAssemblyEvidence = await buildSupportAssemblyEvidence({
  selectedSourceGraph, supportEvidence, hostEvidence: supportHostAssociationEvidence,
});
const artifacts = {
  ZONE_GEOMETRY_EVIDENCE: zoneGeometryEvidence,
  SELECTED_SOURCE_GRAPH: selectedSourceGraph,
  DERIVED_PORT_EVIDENCE: { schema: 'FbxDerivedPortEvidence.v1', sourceZoneGeometryArtifactId: ZONE_ARTIFACT },
  SOLID_FITTING_PORT_EVIDENCE: { schema: 'FbxSolidFittingPortEvidence.v3', artifactId: SOLID_ID, sourceZoneGeometryArtifactId: ZONE_ARTIFACT },
  COMPONENT_CROSSWALK: componentCrosswalk,
  ENGINEERING_ATTRIBUTES: selectedEngineering,
  CONNECTIVITY_EVIDENCE: { schema: 'FbxSelectedZoneConnectivityEvidence.v1', artifactId: 'CONN', status: 'PASS', sourceComponentCrosswalkArtifactId: CROSSWALK_ID, selectedZone: { zoneGeometryArtifactId: ZONE_ARTIFACT } },
  GENERATED_GAP_PIPE_EVIDENCE: null,
  ELBOW_EVIDENCE: boundFitting('FbxElbowPortEvidence.v1'),
  TEE_EVIDENCE: boundFitting('FbxTeePortEvidence.v1'),
  REDUCER_EVIDENCE: boundFitting('FbxReducerPortEvidence.v1'),
  BRANCH_FITTING_EVIDENCE: boundFitting('FbxBranchFittingPortEvidence.v1'),
  INLINE_ASSEMBLY_EVIDENCE: boundFitting('FbxInlineAssemblyPortEvidence.v1'),
  SUPPORT_HOST_ASSOCIATION_EVIDENCE: supportHostAssociationEvidence,
  SUPPORT_ASSEMBLY_EVIDENCE: supportAssemblyEvidence,
};
const qualificationRoot = await buildSelectedZoneQualificationRoot({
  manifest, stagedBranches, artifacts, supportEvidence,
});
assert.equal(qualificationRoot.status, 'PASS');
assert.equal(qualificationRoot.summary.passCount, 13);
artifacts.QUALIFICATION_ROOT = qualificationRoot;
const inputs = {
  manifest, buffersByGeometryId, stagedJsonText: JSON.stringify(stagedBranches),
  supportEvidence, artifacts,
  artifactOmissionReasons: { GENERATED_GAP_PIPE_EVIDENCE: 'No generated gap PIPE was applicable.' },
};
const first = await buildSelectedZonePackage(inputs);
const second = await buildSelectedZonePackage(inputs);
assert.equal(first.audit.packageDigest, second.audit.packageDigest);
assert.equal(first.audit.files.find((item) => item.role === 'QUALIFICATION_ROOT').disposition, 'PRESENT');
assert.equal(first.audit.files.find((item) => item.role === 'SUPPORT_EVIDENCE').disposition, 'PRESENT');
assert.equal(first.audit.files.find((item) => item.role === 'SUPPORT_HOST_ASSOCIATION_EVIDENCE').disposition, 'PRESENT');
assert.equal(first.audit.files.find((item) => item.role === 'SUPPORT_ASSEMBLY_EVIDENCE').disposition, 'PRESENT');
assert.equal(first.audit.files.find((item) => item.role === 'GENERATED_GAP_PIPE_EVIDENCE').disposition, 'OMITTED_BLOCKED');
const validated = await validateSelectedZonePackage(first);
assert.equal(validated.artifacts.QUALIFICATION_ROOT.status, 'PASS');
assert.equal(validated.artifacts.SUPPORT_HOST_ASSOCIATION_EVIDENCE.status, 'PASS');
assert.equal(validated.artifacts.SUPPORT_ASSEMBLY_EVIDENCE.status, 'PASS');
const archiveA = await buildPackageArchive(first.files);
const archiveB = await buildPackageArchive(second.files);
assert.equal(archiveA.sha256, archiveB.sha256);
await contract('fbx-selected-zone-package-audit.v1.schema.json', first.audit);
await contract('fbx-selected-zone-source-graph.v1.schema.json', selectedSourceGraph);
await contract('fbx-selected-zone-engineering-attribute-ledger.v1.schema.json', selectedEngineering);
await contract('fbx-support-host-association-evidence.v1.schema.json', supportHostAssociationEvidence);
await contract('fbx-support-assembly-evidence.v1.schema.json', supportAssemblyEvidence);
await contract('fbx-selected-zone-qualification-root.v1.schema.json', qualificationRoot);
const tampered = structuredClone(first);
const engineeringFile = tampered.files.find((item) => item.path === 'evidence/engineering-attributes.json');
engineeringFile.bytes[engineeringFile.bytes.length - 2] ^= 1;
await assert.rejects(() => validateSelectedZonePackage(tampered), /differs from its audit record/);
console.log('test-selected-zone-package-closure: PASS');
