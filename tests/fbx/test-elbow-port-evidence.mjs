import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { buildElbowPortEvidence } from '../../tabs/model-converters/converters/fbx/fitting-kernels/elbow/evidence.js';

const ZONE_ARTIFACT_ID = `fbx-zone-geometry-evidence:${'c'.repeat(64)}`;

function capId(character) {
  return `cap-ring:${character.repeat(64)}`;
}

function candidate(character, centreMm, normal, radiusMm = 2) {
  const portEvidenceId = capId(character);
  return {
    capRingId: portEvidenceId,
    portEvidenceId,
    boundaryLoopId: portEvidenceId,
    sourceOccurrenceId: 'occ:1',
    geometryObjectId: '101',
    shellId: `shell:${'d'.repeat(64)}`,
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

function occurrence(sourceOccurrenceId, geometryObjectId, disposition, candidates) {
  return {
    sourceOccurrenceId,
    sourceModelObjectId: sourceOccurrenceId.replace('occ:', ''),
    geometryObjectId,
    shellId: `shell:${geometryObjectId.padStart(64, '0')}`,
    analysisProjection: {},
    topologyDisposition: disposition,
    candidates,
    rejectionReasons: disposition === 'REJECTED' ? ['NON_MANIFOLD_SHELL'] : [],
  };
}

function managed(id, rawType, overrides = {}) {
  return {
    managedRecordId: `BRANCH-1::${id}`,
    branchId: 'BRANCH-1',
    outerType: overrides.outerType ?? rawType,
    rawType,
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

function fixtures() {
  const admittedPorts = [
    candidate('1', [10, 0, 0], [0, -1, 0]),
    candidate('2', [0, 10, 0], [-1, 0, 0]),
  ];
  const radiusMismatchPorts = [
    { ...candidate('3', [20, 0, 0], [0, -1, 0], 2), sourceOccurrenceId: 'occ:4', geometryObjectId: '104' },
    { ...candidate('4', [0, 20, 0], [-1, 0, 0], 3), sourceOccurrenceId: 'occ:4', geometryObjectId: '104' },
  ];
  const componentCrosswalk = {
    schema: 'FbxSelectedZoneComponentCrosswalk.v1',
    artifactId: `FBXZCROSS-${'a'.repeat(32)}`,
    inputs: { zoneGeometryArtifactId: ZONE_ARTIFACT_ID },
    managedComponents: [
      managed('ELBOW-1', 'ELBO', {
        sourceOccurrenceId: 'occ:1', exactSourceOccurrenceId: 'occ:1',
        disposition: 'MATCHED_SOURCE_COMPONENT',
      }),
      managed('ELBOW-2', 'BEND', {
        outerType: 'ELBO',
        sourceOccurrenceId: 'occ:2', exactSourceOccurrenceId: 'occ:2',
        disposition: 'MATCHED_SOURCE_COMPONENT',
      }),
      managed('ELBOW-3', 'ELBO', {
        candidateSourceOccurrenceIds: ['occ:3'], disposition: 'SOURCE_OCCURRENCE_CANDIDATES',
      }),
      managed('ELBOW-4', 'ELBO', {
        generated: true, generationMethod: 'TEST_GENERATION',
        generationProvenanceStatus: 'EVIDENCED', disposition: 'GENERATED_MANAGED_COMPONENT',
      }),
      managed('ELBOW-5', 'ELBO', {
        sourceOccurrenceId: 'occ:4', exactSourceOccurrenceId: 'occ:4',
        disposition: 'MATCHED_SOURCE_COMPONENT',
      }),
      managed('TEE-1', 'TEE', {
        sourceOccurrenceId: 'occ:5', exactSourceOccurrenceId: 'occ:5',
        disposition: 'MATCHED_SOURCE_COMPONENT',
      }),
    ],
  };
  const solidFittingPortEvidence = {
    schema: 'FbxSolidFittingPortEvidence.v3',
    artifactId: `fbx-solid-fitting-port-evidence:${'b'.repeat(64)}`,
    sourceZoneGeometryArtifactId: ZONE_ARTIFACT_ID,
    occurrenceEvidence: [
      occurrence('occ:1', '101', 'BENT_TWO_PORT', admittedPorts),
      occurrence('occ:2', '102', 'STRAIGHT_TWO_PORT', admittedPorts.map((port) => ({
        ...port, sourceOccurrenceId: 'occ:2', geometryObjectId: '102',
      }))),
      occurrence('occ:4', '104', 'BENT_TWO_PORT', radiusMismatchPorts),
    ],
  };
  return { componentCrosswalk, solidFittingPortEvidence };
}

function schemaErrors(schema, instances) {
  const program = String.raw`
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload["schema"])
validator = Draft202012Validator(payload["schema"])
print(json.dumps([[error.message for error in validator.iter_errors(item)] for item in payload["instances"]]))
`;
  const result = spawnSync(process.env.FBX_SCHEMA_PYTHON || 'python3', ['-c', program], {
    input: JSON.stringify({ schema, instances }), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return JSON.parse(result.stdout);
}

async function main() {
  const inputs = fixtures(), before = structuredClone(inputs);
  const artifact = await buildElbowPortEvidence(inputs);
  assert.deepEqual(inputs, before, 'input artifacts were mutated');
  assert.equal(artifact.managedElbowCount, 5);
  assert.equal(artifact.admittedElbowCount, 1);
  assert.equal(artifact.blockedElbowCount, 4);
  assert.equal(artifact.elbowEvidence[0].managedRecordId, 'BRANCH-1::ELBOW-1');
  assert.equal(artifact.elbowEvidence[0].bend.method, 'TANGENT_INTERSECTION_CIRCULAR_ARC_V1');
  assert.ok(Math.abs(artifact.elbowEvidence[0].bend.angleDeg - 90) < 1e-9);
  assert.ok(Math.abs(artifact.elbowEvidence[0].bend.radiusMm - 10) < 1e-9);
  assert.deepEqual(artifact.elbowEvidence[0].bend.centreMm, [0, 0, 0]);
  assert.equal(artifact.elbowEvidence[0].ports.length, 2);
  assert.equal(artifact.elbowEvidence[1].blockingReasons[0], 'BENT_TOPOLOGY_NOT_EVIDENCED');
  assert.equal(artifact.elbowEvidence[2].blockingReasons[0], 'NO_EXACT_SOURCE_BINDING');
  assert.equal(artifact.elbowEvidence[3].blockingReasons[0], 'GENERATED_COMPONENT_NOT_SUPPORTED');
  assert.equal(artifact.elbowEvidence[4].blockingReasons[0], 'PORT_RADIUS_MISMATCH');
  assert.equal(artifact.authority.runtimeAdmissionChanged, false);
  assert.equal(Object.isFrozen(artifact.elbowEvidence[0].bend), true);

  const reordered = fixtures();
  reordered.componentCrosswalk.managedComponents.reverse();
  reordered.solidFittingPortEvidence.occurrenceEvidence.reverse();
  assert.deepEqual(await buildElbowPortEvidence(reordered), artifact, 'artifact is order-dependent');

  const schema = JSON.parse(await readFile(new URL(
    '../../contracts/fbx/fbx-elbow-port-evidence.v1.schema.json', import.meta.url), 'utf8'));
  const unexpected = structuredClone(artifact);
  unexpected.unexpected = true;
  const missingPort = structuredClone(artifact);
  missingPort.elbowEvidence[0].ports.pop();
  const invalidRadius = structuredClone(artifact);
  invalidRadius.elbowEvidence[0].bend.radiusMm = -1;
  const results = schemaErrors(schema, [artifact, unexpected, missingPort, invalidRadius]);
  assert.equal(results[0].length, 0, JSON.stringify(results[0]));
  assert.notEqual(results[1].length, 0, 'unexpected field passed schema');
  assert.notEqual(results[2].length, 0, 'one-port admitted elbow passed schema');
  assert.notEqual(results[3].length, 0, 'negative bend radius passed schema');

  await assert.rejects(() => buildElbowPortEvidence({
    ...fixtures(),
    solidFittingPortEvidence: {
      ...fixtures().solidFittingPortEvidence,
      sourceZoneGeometryArtifactId: `fbx-zone-geometry-evidence:${'e'.repeat(64)}`,
    },
  }), /identities do not match/);
  console.log('PASS test-elbow-port-evidence');
}

await main();
