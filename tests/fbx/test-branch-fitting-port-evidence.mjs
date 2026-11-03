import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { buildBranchFittingPortEvidence } from '../../tabs/model-converters/converters/fbx/fitting-kernels/branch-fitting/evidence.js';
import { buildBranchFittingGeometry } from '../../tabs/model-converters/converters/fbx/fitting-kernels/branch-fitting/geometry.js';

const ZONE_ID = `fbx-zone-geometry-evidence:${'c'.repeat(64)}`;
const shellId = (character) => `shell:${character.repeat(64)}`;
const capId = (character) => `cap-ring:${character.repeat(64)}`;

function candidate(character, occurrenceId, geometryId, centreMm, normal, radiusMm) {
  const portEvidenceId = capId(character);
  return {
    capRingId: portEvidenceId,
    portEvidenceId,
    boundaryLoopId: portEvidenceId,
    sourceOccurrenceId: occurrenceId,
    geometryObjectId: geometryId,
    shellId: shellId(character),
    faceIds: [],
    centreMm,
    normal,
    radiusMm,
    diameterMm: radiusMm * 2,
    innerRadiusMm: null,
    admissionDisposition: 'ADMITTED',
    rejectionReasons: [],
  };
}

function occurrence(id, geometryId, disposition, candidates) {
  return {
    sourceOccurrenceId: id,
    sourceModelObjectId: id.replace('occ:', ''),
    geometryObjectId: geometryId,
    shellId: shellId(geometryId.slice(-1)),
    analysisProjection: {},
    topologyDisposition: disposition,
    candidates,
    rejectionReasons: [],
  };
}

function managed(id, overrides = {}) {
  return {
    managedRecordId: `BRANCH-1::${id}`,
    branchId: 'BRANCH-1',
    outerType: 'OLET',
    rawType: 'OLET',
    reference: id,
    displayName: id,
    sourceOccurrenceId: null,
    sourceModelObjectId: null,
    sourceGeometryObjectIds: [],
    generated: false,
    generationMethod: null,
    generationProvenanceStatus: 'NOT_APPLICABLE',
    exactSourceOccurrenceId: null,
    candidateSourceOccurrenceIds: [],
    disposition: 'UNMATCHED_MANAGED_COMPONENT',
    ...overrides,
  };
}

function taperedPorts(id, geometryId, largeRadius = 8, smallRadius = 4, lengthMm = 100) {
  return [
    candidate('1', id, geometryId, [0, 0, 0], [0, 0, -1], largeRadius),
    candidate('2', id, geometryId, [0, 0, lengthMm], [0, 0, 1], smallRadius),
  ];
}

function fixtures() {
  const componentCrosswalk = {
    schema: 'FbxSelectedZoneComponentCrosswalk.v1',
    artifactId: `FBXZCROSS-${'a'.repeat(32)}`,
    inputs: { zoneGeometryArtifactId: ZONE_ID },
    managedComponents: [
      managed('OLET-1', { sourceOccurrenceId: 'occ:1', exactSourceOccurrenceId: 'occ:1', disposition: 'MATCHED_SOURCE_COMPONENT' }),
      managed('OLET-2', { sourceOccurrenceId: 'occ:2', exactSourceOccurrenceId: 'occ:2', disposition: 'MATCHED_SOURCE_COMPONENT' }),
      managed('OLET-3', { candidateSourceOccurrenceIds: ['occ:3'], disposition: 'SOURCE_OCCURRENCE_CANDIDATES' }),
      managed('OLET-4', { generated: true, generationMethod: 'TEST', generationProvenanceStatus: 'EVIDENCED', disposition: 'GENERATED_MANAGED_COMPONENT' }),
      managed('OLET-5', { sourceOccurrenceId: 'occ:5', exactSourceOccurrenceId: 'occ:5', disposition: 'MATCHED_SOURCE_COMPONENT' }),
      managed('OLET-6', { sourceOccurrenceId: 'occ:6', exactSourceOccurrenceId: 'occ:6', disposition: 'MATCHED_SOURCE_COMPONENT' }),
      { ...managed('REDU-1', { sourceOccurrenceId: 'occ:9', exactSourceOccurrenceId: 'occ:9', disposition: 'MATCHED_SOURCE_COMPONENT' }), outerType: 'REDU', rawType: 'REDU' },
    ],
  };
  const equalPorts = taperedPorts('occ:5', '105', 5, 5);
  const solidFittingPortEvidence = {
    schema: 'FbxSolidFittingPortEvidence.v3',
    artifactId: `fbx-solid-fitting-port-evidence:${'b'.repeat(64)}`,
    sourceZoneGeometryArtifactId: ZONE_ID,
    occurrenceEvidence: [
      occurrence('occ:1', '101', 'TAPERED_TWO_PORT', taperedPorts('occ:1', '101')),
      occurrence('occ:2', '102', 'SHORT_TWO_PORT', taperedPorts('occ:2', '102')),
      occurrence('occ:5', '105', 'TAPERED_TWO_PORT', equalPorts),
      occurrence('occ:6', '106', 'TAPERED_TWO_PORT', taperedPorts('occ:6', '106')),
      occurrence('occ:6', '107', 'TAPERED_TWO_PORT', taperedPorts('occ:6', '107')),
    ],
  };
  return { componentCrosswalk, solidFittingPortEvidence };
}

function schemaErrors(schema, instances) {
  const code = String.raw`
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload['schema'])
validator = Draft202012Validator(payload['schema'])
print(json.dumps([[error.message for error in validator.iter_errors(item)] for item in payload['instances']]))
`;
  const result = spawnSync(process.env.FBX_SCHEMA_PYTHON || 'python3', ['-c', code], {
    input: JSON.stringify({ schema, instances }), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return JSON.parse(result.stdout);
}

async function main() {
  const inputs = fixtures(), before = structuredClone(inputs);
  const artifact = await buildBranchFittingPortEvidence(inputs);
  assert.deepEqual(inputs, before, 'input artifacts were mutated');
  assert.equal(artifact.managedBranchFittingCount, 6);
  assert.equal(artifact.admittedBranchFittingCount, 1);
  assert.equal(artifact.blockedBranchFittingCount, 5);
  const admitted = artifact.branchFittingEvidence[0];
  assert.equal(admitted.managedRecordId, 'BRANCH-1::OLET-1');
  assert.deepEqual(admitted.ports.map((port) => port.role), ['LARGE_PORT', 'SMALL_PORT']);
  assert.equal(admitted.branchFitting.method, 'AXIAL_BRANCH_FITTING_TAPER_V1');
  assert.equal(admitted.branchFitting.axialLengthMm, 100);
  assert.equal(admitted.branchFitting.largeRadiusMm, 8);
  assert.equal(admitted.branchFitting.smallRadiusMm, 4);
  assert.equal(artifact.branchFittingEvidence[1].blockingReasons[0], 'TAPERED_TOPOLOGY_NOT_EVIDENCED');
  assert.equal(artifact.branchFittingEvidence[2].blockingReasons[0], 'NO_EXACT_SOURCE_BINDING');
  assert.equal(artifact.branchFittingEvidence[3].blockingReasons[0], 'GENERATED_COMPONENT_NOT_SUPPORTED');
  assert.equal(artifact.branchFittingEvidence[4].blockingReasons[0], 'PORT_RADIUS_ORDER_NOT_EVIDENCED');
  assert.equal(artifact.branchFittingEvidence[5].blockingReasons[0], 'AMBIGUOUS_TAPERED_GEOMETRY');
  assert.equal(artifact.authority.runAttachmentClaimed, false);
  assert.equal(artifact.authority.branchOutletClaimed, false);
  assert.equal(artifact.authority.branchFittingSubtypeInferred, false);
  assert.equal(Object.isFrozen(admitted.branchFitting), true);

  const reversed = fixtures();
  reversed.componentCrosswalk.managedComponents.reverse();
  reversed.solidFittingPortEvidence.occurrenceEvidence.reverse();
  for (const record of reversed.solidFittingPortEvidence.occurrenceEvidence) record.candidates.reverse();
  assert.deepEqual(await buildBranchFittingPortEvidence(reversed), artifact, 'artifact is order-dependent');

  for (const lengthMm of [20, 50, 200]) {
    const result = buildBranchFittingGeometry(...taperedPorts('occ:8', '108', 9, 3, lengthMm));
    assert.equal(result.admitted, true);
    assert.equal(result.geometry.axialLengthMm, lengthMm);
  }
  const equal = buildBranchFittingGeometry(...taperedPorts('occ:8', '108', 5, 5));
  assert.equal(equal.reason, 'PORT_RADIUS_ORDER_NOT_EVIDENCED');
  const skewed = taperedPorts('occ:8', '108');
  skewed[1].normal = [1, 0, 0];
  assert.equal(buildBranchFittingGeometry(...skewed).reason, 'PORT_DIRECTIONS_NOT_OPPOSED');

  const schema = JSON.parse(await readFile(new URL(
    '../../contracts/fbx/fbx-branch-fitting-port-evidence.v1.schema.json', import.meta.url), 'utf8'));
  const unexpected = structuredClone(artifact); unexpected.unexpected = true;
  const invalidRole = structuredClone(artifact); invalidRole.branchFittingEvidence[0].ports[0].role = 'RUN_ATTACHMENT';
  const falseClaim = structuredClone(artifact); falseClaim.authority.runAttachmentClaimed = true;
  const results = schemaErrors(schema, [artifact, unexpected, invalidRole, falseClaim]);
  assert.equal(results[0].length, 0, JSON.stringify(results[0]));
  assert.notEqual(results[1].length, 0, 'unexpected field passed schema');
  assert.notEqual(results[2].length, 0, 'unsupported semantic role passed schema');
  assert.notEqual(results[3].length, 0, 'unsupported run attachment claim passed schema');

  await assert.rejects(() => buildBranchFittingPortEvidence({
    ...fixtures(),
    solidFittingPortEvidence: {
      ...fixtures().solidFittingPortEvidence,
      sourceZoneGeometryArtifactId: `fbx-zone-geometry-evidence:${'e'.repeat(64)}`,
    },
  }), /identities do not match/);
  console.log('PASS test-branch-fitting-port-evidence');
}

await main();
