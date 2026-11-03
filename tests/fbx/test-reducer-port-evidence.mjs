import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { buildReducerPortEvidence } from '../../tabs/model-converters/converters/fbx/fitting-kernels/reducer/evidence.js';
import { buildReducerGeometry } from '../../tabs/model-converters/converters/fbx/fitting-kernels/reducer/geometry.js';

const ZONE_ARTIFACT_ID = `fbx-zone-geometry-evidence:${'c'.repeat(64)}`;

function capId(character) {
  return `cap-ring:${character.repeat(64)}`;
}

function candidate(character, occurrenceId, geometryId, centreMm, normal, radiusMm) {
  const portEvidenceId = capId(character);
  return {
    capRingId: portEvidenceId, portEvidenceId, boundaryLoopId: portEvidenceId,
    sourceOccurrenceId: occurrenceId, geometryObjectId: geometryId,
    shellId: `shell:${geometryId.padStart(64, '0')}`, faceIds: [], centreMm, normal,
    radiusMm, diameterMm: radiusMm * 2, innerRadiusMm: null,
    admissionDisposition: 'ADMITTED', rejectionReasons: [],
  };
}

function occurrence(sourceOccurrenceId, geometryObjectId, disposition, candidates) {
  return {
    sourceOccurrenceId, sourceModelObjectId: sourceOccurrenceId.replace('occ:', ''),
    geometryObjectId, shellId: `shell:${geometryObjectId.padStart(64, '0')}`,
    analysisProjection: {}, topologyDisposition: disposition, candidates,
    rejectionReasons: disposition === 'REJECTED' ? ['NON_MANIFOLD_SHELL'] : [],
  };
}

function managed(id, rawType, overrides = {}) {
  return {
    managedRecordId: `BRANCH-1::${id}`, branchId: 'BRANCH-1',
    outerType: overrides.outerType ?? rawType, rawType, reference: id, displayName: id,
    sourceOccurrenceId: null, sourceModelObjectId: null, sourceGeometryObjectIds: [],
    generated: false, generationMethod: null, generationProvenanceStatus: 'NOT_APPLICABLE',
    exactSourceOccurrenceId: null, candidateSourceOccurrenceIds: [],
    disposition: 'UNMATCHED_MANAGED_COMPONENT', ...overrides,
  };
}

function matchedReducer(id, occurrenceId) {
  return managed(id, 'REDU', {
    sourceOccurrenceId: occurrenceId, exactSourceOccurrenceId: occurrenceId,
    disposition: 'MATCHED_SOURCE_COMPONENT',
  });
}

function reducerPorts(occurrenceId, geometryId, largeRadius = 5, smallRadius = 3) {
  return [
    candidate('1', occurrenceId, geometryId, [0, 0, 0], [-1, 0, 0], largeRadius),
    candidate('2', occurrenceId, geometryId, [100, 0, 0], [1, 0, 0], smallRadius),
  ];
}

function fixtures() {
  const equalPorts = reducerPorts('occ:4', '104', 4, 4);
  const skewPorts = reducerPorts('occ:5', '105');
  skewPorts[1] = { ...skewPorts[1], normal: [0, 1, 0] };
  const componentCrosswalk = {
    schema: 'FbxSelectedZoneComponentCrosswalk.v1',
    artifactId: `FBXZCROSS-${'a'.repeat(32)}`,
    inputs: { zoneGeometryArtifactId: ZONE_ARTIFACT_ID },
    managedComponents: [
      matchedReducer('REDUCER-1', 'occ:1'), matchedReducer('REDUCER-2', 'occ:2'),
      managed('REDUCER-3', 'REDU', {
        candidateSourceOccurrenceIds: ['occ:3'], disposition: 'SOURCE_OCCURRENCE_CANDIDATES',
      }),
      managed('REDUCER-4', 'REDU', {
        generated: true, generationMethod: 'TEST_GENERATION',
        generationProvenanceStatus: 'EVIDENCED', disposition: 'GENERATED_MANAGED_COMPONENT',
      }),
      matchedReducer('REDUCER-5', 'occ:4'), matchedReducer('REDUCER-6', 'occ:5'),
      managed('TEE-1', 'TEE', {
        sourceOccurrenceId: 'occ:6', exactSourceOccurrenceId: 'occ:6',
        disposition: 'MATCHED_SOURCE_COMPONENT',
      }),
    ],
  };
  const solidFittingPortEvidence = {
    schema: 'FbxSolidFittingPortEvidence.v3',
    artifactId: `fbx-solid-fitting-port-evidence:${'b'.repeat(64)}`,
    sourceZoneGeometryArtifactId: ZONE_ARTIFACT_ID,
    occurrenceEvidence: [
      occurrence('occ:1', '101', 'TAPERED_TWO_PORT', reducerPorts('occ:1', '101')),
      occurrence('occ:2', '102', 'STRAIGHT_TWO_PORT', reducerPorts('occ:2', '102')),
      occurrence('occ:4', '104', 'TAPERED_TWO_PORT', equalPorts),
      occurrence('occ:5', '105', 'TAPERED_TWO_PORT', skewPorts),
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

function qualifyGeometry() {
  for (const [lengthMm, largeRadius, smallRadius] of [[50, 4, 3], [100, 5, 3], [200, 8, 2]]) {
    const ports = reducerPorts('occ:1', '101', largeRadius, smallRadius);
    ports[1] = { ...ports[1], centreMm: [lengthMm, 0, 0] };
    const result = buildReducerGeometry(ports[0], ports[1]);
    assert.equal(result.admitted, true);
    assert.equal(result.geometry.axialLengthMm, lengthMm);
    assert.equal(result.geometry.largeRadiusMm, largeRadius);
    assert.equal(result.geometry.smallRadiusMm, smallRadius);
  }
}

function qualifyArtifact(artifact, inputs, before) {
  assert.deepEqual(inputs, before, 'input artifacts were mutated');
  assert.equal(artifact.managedReducerCount, 6);
  assert.equal(artifact.admittedReducerCount, 1);
  assert.equal(artifact.blockedReducerCount, 5);
  const [admitted, wrongTopology, candidateOnly, generated, equalRadius, skewAxis] = artifact.reducerEvidence;
  assert.equal(admitted.disposition, 'ADMITTED');
  assert.deepEqual(admitted.ports.map((port) => port.role), ['LARGE_END', 'SMALL_END']);
  assert.equal(admitted.reducer.method, 'AXIAL_RADIUS_TAPER_V1');
  assert.equal(admitted.reducer.axialLengthMm, 100);
  assert.equal(admitted.reducer.largeRadiusMm, 5);
  assert.equal(admitted.reducer.smallRadiusMm, 3);
  assert.equal(wrongTopology.blockingReasons[0], 'TAPERED_TOPOLOGY_NOT_EVIDENCED');
  assert.equal(candidateOnly.blockingReasons[0], 'NO_EXACT_SOURCE_BINDING');
  assert.equal(generated.blockingReasons[0], 'GENERATED_COMPONENT_NOT_SUPPORTED');
  assert.equal(equalRadius.blockingReasons[0], 'PORT_RADIUS_ORDER_NOT_EVIDENCED');
  assert.equal(skewAxis.blockingReasons[0], 'PORT_DIRECTIONS_NOT_OPPOSED');
  assert.equal(artifact.authority.concentricityClassificationEmitted, false);
  assert.equal(Object.isFrozen(admitted.reducer), true);
}

async function qualifyDeterminism(artifact) {
  const reordered = fixtures();
  reordered.componentCrosswalk.managedComponents.reverse();
  reordered.solidFittingPortEvidence.occurrenceEvidence.reverse();
  for (const record of reordered.solidFittingPortEvidence.occurrenceEvidence) record.candidates.reverse();
  assert.deepEqual(await buildReducerPortEvidence(reordered), artifact, 'artifact is order-dependent');
}

async function qualifySchema(artifact) {
  const schema = JSON.parse(await readFile(new URL(
    '../../contracts/fbx/fbx-reducer-port-evidence.v1.schema.json', import.meta.url), 'utf8'));
  const unexpected = structuredClone(artifact); unexpected.unexpected = true;
  const missingPort = structuredClone(artifact); missingPort.reducerEvidence[0].ports.pop();
  const invalidRadius = structuredClone(artifact); invalidRadius.reducerEvidence[0].reducer.smallRadiusMm = -1;
  const falseAuthority = structuredClone(artifact);
  falseAuthority.authority.concentricityClassificationEmitted = true;
  const results = schemaErrors(schema, [artifact, unexpected, missingPort, invalidRadius, falseAuthority]);
  assert.equal(results[0].length, 0, JSON.stringify(results[0]));
  for (let index = 1; index < results.length; index += 1) {
    assert.notEqual(results[index].length, 0, `invalid schema instance ${index} passed`);
  }
}


function functionLengths(source) {
  const lines = source.split('\n'), lengths = [];
  for (let start = 0; start < lines.length; start += 1) {
    if (!/^(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(/.test(lines[start])) continue;
    let depth = 0, opened = false;
    for (let end = start; end < lines.length; end += 1) {
      for (const character of lines[end]) {
        if (character === '{') { depth += 1; opened = true; }
        if (character === '}') depth -= 1;
      }
      if (opened && depth === 0) { lengths.push(end - start + 1); break; }
    }
  }
  return lengths;
}

async function qualifyStaticGuards() {
  const paths = [
    '../../tabs/model-converters/converters/fbx/fitting-kernels/reducer/geometry.js',
    '../../tabs/model-converters/converters/fbx/fitting-kernels/reducer/evidence.js',
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.ok(source.split('\n').length - 1 < 300, `${path} exceeds 300 lines`);
    assert.ok(functionLengths(source).every((length) => length <= 40), `${path} has a long function`);
    assert.doesNotMatch(source, /export\s+default|localeCompare|Math\.random/);
  }
}

async function qualifyInputIdentity() {
  const inputs = fixtures();
  inputs.solidFittingPortEvidence.sourceZoneGeometryArtifactId
    = `fbx-zone-geometry-evidence:${'e'.repeat(64)}`;
  await assert.rejects(() => buildReducerPortEvidence(inputs), /identities do not match/);
}

async function main() {
  qualifyGeometry();
  const inputs = fixtures(), before = structuredClone(inputs);
  const artifact = await buildReducerPortEvidence(inputs);
  qualifyArtifact(artifact, inputs, before);
  await qualifyDeterminism(artifact);
  await qualifySchema(artifact);
  await qualifyInputIdentity();
  await qualifyStaticGuards();
  console.log('PASS test-reducer-port-evidence');
}

await main();
