import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  buildTeeGeometry,
} from '../../tabs/model-converters/converters/fbx/fitting-kernels/tee/geometry.js';
import {
  buildTeePortEvidence,
} from '../../tabs/model-converters/converters/fbx/fitting-kernels/tee/evidence.js';

const ZONE_ARTIFACT_ID = `fbx-zone-geometry-evidence:${'c'.repeat(64)}`;

function capId(character) {
  return `cap-ring:${character.repeat(64)}`;
}

function candidate(character, sourceOccurrenceId, geometryObjectId, centreMm, normal, radiusMm = 2) {
  const portEvidenceId = capId(character);
  return {
    capRingId: portEvidenceId,
    portEvidenceId,
    boundaryLoopId: portEvidenceId,
    sourceOccurrenceId,
    geometryObjectId,
    shellId: `shell:${geometryObjectId.padStart(64, '0')}`,
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

function teePorts(sourceOccurrenceId, geometryObjectId, characters = ['1', '2', '3']) {
  return [
    candidate(characters[0], sourceOccurrenceId, geometryObjectId, [-10, 0, 0], [-1, 0, 0], 2),
    candidate(characters[1], sourceOccurrenceId, geometryObjectId, [10, 0, 0], [1, 0, 0], 2),
    candidate(characters[2], sourceOccurrenceId, geometryObjectId, [0, 10, 0], [0, 1, 0], 1.5),
  ];
}

function fixtures() {
  const radiusMismatch = teePorts('occ:5', '105', ['4', '5', '6']);
  radiusMismatch[1] = { ...radiusMismatch[1], radiusMm: 3, diameterMm: 6 };
  const ambiguous = [
    candidate('7', 'occ:6', '106', [-10, 0, 0], [-1, 0, 0]),
    candidate('8', 'occ:6', '106', [10, 0, 0], [1, 0, 0]),
    candidate('9', 'occ:6', '106', [10, 10, 0], [1, 0, 0]),
  ];
  const componentCrosswalk = {
    schema: 'FbxSelectedZoneComponentCrosswalk.v1',
    artifactId: `FBXZCROSS-${'a'.repeat(32)}`,
    inputs: { zoneGeometryArtifactId: ZONE_ARTIFACT_ID },
    managedComponents: [
      managed('TEE-1', 'TEE', {
        sourceOccurrenceId: 'occ:1', exactSourceOccurrenceId: 'occ:1',
        disposition: 'MATCHED_SOURCE_COMPONENT',
      }),
      managed('TEE-2', 'TEE', {
        sourceOccurrenceId: 'occ:2', exactSourceOccurrenceId: 'occ:2',
        disposition: 'MATCHED_SOURCE_COMPONENT',
      }),
      managed('TEE-3', 'TEE', {
        candidateSourceOccurrenceIds: ['occ:3'], disposition: 'SOURCE_OCCURRENCE_CANDIDATES',
      }),
      managed('TEE-4', 'TEE', {
        generated: true, generationMethod: 'TEST_GENERATION',
        generationProvenanceStatus: 'EVIDENCED', disposition: 'GENERATED_MANAGED_COMPONENT',
      }),
      managed('TEE-5', 'TEE', {
        sourceOccurrenceId: 'occ:5', exactSourceOccurrenceId: 'occ:5',
        disposition: 'MATCHED_SOURCE_COMPONENT',
      }),
      managed('TEE-6', 'TEE', {
        sourceOccurrenceId: 'occ:6', exactSourceOccurrenceId: 'occ:6',
        disposition: 'MATCHED_SOURCE_COMPONENT',
      }),
      managed('ELBOW-1', 'ELBO', {
        sourceOccurrenceId: 'occ:7', exactSourceOccurrenceId: 'occ:7',
        disposition: 'MATCHED_SOURCE_COMPONENT',
      }),
    ],
  };
  const solidFittingPortEvidence = {
    schema: 'FbxSolidFittingPortEvidence.v3',
    artifactId: `fbx-solid-fitting-port-evidence:${'b'.repeat(64)}`,
    sourceZoneGeometryArtifactId: ZONE_ARTIFACT_ID,
    occurrenceEvidence: [
      occurrence('occ:1', '101', 'THREE_PORT', teePorts('occ:1', '101')),
      occurrence('occ:2', '102', 'BENT_TWO_PORT', teePorts('occ:2', '102', ['a', 'b', 'c'])),
      occurrence('occ:5', '105', 'THREE_PORT', radiusMismatch),
      occurrence('occ:6', '106', 'THREE_PORT', ambiguous),
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

function angledPorts(angleDeg) {
  const angle = angleDeg * Math.PI / 180;
  const distance = 10;
  return [
    { portEvidenceId: capId('d'), centreMm: [-20, 0, 0], normal: [-1, 0, 0], radiusMm: 2 },
    { portEvidenceId: capId('e'), centreMm: [20, 0, 0], normal: [1, 0, 0], radiusMm: 2 },
    {
      portEvidenceId: capId('f'),
      centreMm: [distance * Math.cos(angle), distance * Math.sin(angle), 0],
      normal: [Math.cos(angle), Math.sin(angle), 0], radiusMm: 1.5,
    },
  ];
}

function functionLengths(source) {
  const lines = source.split('\n'), lengths = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (!match) continue;
    let depth = 0, started = false, end = index;
    for (; end < lines.length; end += 1) {
      for (const character of lines[end]) {
        if (character === '{') { depth += 1; started = true; }
        if (character === '}') depth -= 1;
      }
      if (started && depth === 0) break;
    }
    lengths.push([match[1], end - index + 1]);
  }
  return lengths;
}

async function staticGuards() {
  const urls = [
    new URL('../../tabs/model-converters/converters/fbx/fitting-kernels/tee/geometry.js', import.meta.url),
    new URL('../../tabs/model-converters/converters/fbx/fitting-kernels/tee/evidence.js', import.meta.url),
  ];
  for (const url of urls) {
    const source = await readFile(url, 'utf8');
    assert.ok(source.split('\n').length - 1 < 300, `${url.pathname} exceeds 300 lines`);
    assert.doesNotMatch(source, /export\s+default|localeCompare|Math\.random|Date\.now/);
    for (const [name, length] of functionLengths(source)) {
      assert.ok(length <= 40, `${name} has ${length} lines`);
    }
  }
}

async function main() {
  const inputs = fixtures(), before = structuredClone(inputs);
  const artifact = await buildTeePortEvidence(inputs);
  assert.deepEqual(inputs, before, 'input artifacts were mutated');
  assert.equal(artifact.managedTeeCount, 6);
  assert.equal(artifact.admittedTeeCount, 1);
  assert.equal(artifact.blockedTeeCount, 5);
  const admitted = artifact.teeEvidence[0];
  assert.equal(admitted.managedRecordId, 'BRANCH-1::TEE-1');
  assert.deepEqual(admitted.ports.map((port) => port.role), ['RUN_NEGATIVE', 'RUN_POSITIVE', 'BRANCH']);
  assert.equal(admitted.tee.method, 'RUN_PAIR_INTERSECTION_V1');
  assert.deepEqual(admitted.tee.runAxis, [1, 0, 0]);
  assert.equal(admitted.tee.runSpanMm, 20);
  assert.deepEqual(admitted.tee.junctionMm, [0, 0, 0]);
  assert.equal(admitted.tee.branchAngleDeg, 90);
  assert.equal(admitted.tee.branchToRunRadiusRatio, 0.75);
  assert.equal(artifact.teeEvidence[1].blockingReasons[0], 'THREE_PORT_TOPOLOGY_NOT_EVIDENCED');
  assert.equal(artifact.teeEvidence[2].blockingReasons[0], 'NO_EXACT_SOURCE_BINDING');
  assert.equal(artifact.teeEvidence[3].blockingReasons[0], 'GENERATED_COMPONENT_NOT_SUPPORTED');
  assert.equal(artifact.teeEvidence[4].blockingReasons[0], 'RUN_RADIUS_MISMATCH');
  assert.equal(artifact.teeEvidence[5].blockingReasons[0], 'AMBIGUOUS_RUN_PAIR');
  assert.equal(Object.isFrozen(admitted.tee), true);
  assert.equal(artifact.authority.runRolesAreGeometric, true);
  assert.equal(artifact.authority.flowDirectionInferred, false);

  const angled = buildTeeGeometry(angledPorts(45));
  assert.equal(angled.admitted, true);
  assert.ok(Math.abs(angled.geometry.branchAngleDeg - 45) < 1e-9);
  const outside = angledPorts(90);
  outside[2] = { ...outside[2], centreMm: [30, 10, 0], normal: [0, 1, 0] };
  assert.equal(buildTeeGeometry(outside).reason, 'BRANCH_INTERSECTION_OUTSIDE');

  const reordered = fixtures();
  reordered.componentCrosswalk.managedComponents.reverse();
  reordered.solidFittingPortEvidence.occurrenceEvidence.reverse();
  for (const record of reordered.solidFittingPortEvidence.occurrenceEvidence) record.candidates.reverse();
  assert.deepEqual(await buildTeePortEvidence(reordered), artifact, 'artifact is order-dependent');

  const schema = JSON.parse(await readFile(new URL(
    '../../contracts/fbx/fbx-tee-port-evidence.v1.schema.json', import.meta.url), 'utf8'));
  const unexpected = structuredClone(artifact);
  unexpected.unexpected = true;
  const missingPort = structuredClone(artifact);
  missingPort.teeEvidence[0].ports.pop();
  const duplicateRole = structuredClone(artifact);
  duplicateRole.teeEvidence[0].ports[2].role = 'RUN_POSITIVE';
  const invalidSpan = structuredClone(artifact);
  invalidSpan.teeEvidence[0].tee.runSpanMm = -1;
  const results = schemaErrors(schema, [artifact, unexpected, missingPort, duplicateRole, invalidSpan]);
  assert.equal(results[0].length, 0, JSON.stringify(results[0]));
  for (let index = 1; index < results.length; index += 1) {
    assert.notEqual(results[index].length, 0, `invalid schema fixture ${index} passed`);
  }

  await assert.rejects(() => buildTeePortEvidence({
    ...fixtures(),
    solidFittingPortEvidence: {
      ...fixtures().solidFittingPortEvidence,
      sourceZoneGeometryArtifactId: `fbx-zone-geometry-evidence:${'e'.repeat(64)}`,
    },
  }), /identities do not match/);
  await staticGuards();
  console.log('PASS test-tee-port-evidence');
}

await main();
