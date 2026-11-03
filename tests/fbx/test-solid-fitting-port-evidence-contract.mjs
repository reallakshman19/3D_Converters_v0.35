import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { buildSolidFittingPortEvidence } from '../../tabs/model-converters/converters/fbx/solid-fitting-ports/evidence.js';
import {
  occurrenceFixture, prismGeometry, selectionFromGeometry,
} from './solid-fitting-port-fixtures.mjs';

function validateSchema(schema, instances) {
  const program = String.raw`
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload["schema"])
validator = Draft202012Validator(payload["schema"])
print(json.dumps([[error.message for error in validator.iter_errors(item)] for item in payload["instances"]]))
`;
  const python = process.env.FBX_SCHEMA_PYTHON || 'python3';
  const result = spawnSync(python, ['-c', program], {
    input: JSON.stringify({ schema, instances }), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return JSON.parse(result.stdout);
}

function splitCappedCylinder(seam = 5e-5, radius = 10, height = 50, sides = 8) {
  const points = [];
  for (let end = 0; end < 2; end += 1) for (let index = 0; index < sides; index += 1) {
    const angle = (index * Math.PI * 2) / sides;
    points.push([radius * Math.cos(angle), radius * Math.sin(angle), end * height]);
  }
  const faces = [Array.from({ length: sides }, (_, index) => sides - 1 - index)];
  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    faces.push([index, next, sides + next, sides + index]);
  }
  const capStart = points.length;
  for (let index = 0; index < sides; index += 1) {
    const angle = (index * Math.PI * 2) / sides;
    points.push([radius * Math.cos(angle), radius * Math.sin(angle), height + seam]);
  }
  const centre = points.length;
  points.push([0, 0, height + seam]);
  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    faces.push([centre, capStart + index, capStart + next]);
  }
  const polygonOffsets = [0], polygonVertexIndices = [];
  for (const face of faces) {
    polygonVertexIndices.push(...face);
    polygonOffsets.push(polygonVertexIndices.length);
  }
  return { controlPointsMm: points.flat(), polygonOffsets, polygonVertexIndices };
}

async function evidenceFor(geometryId, sourceId, geometry) {
  const selection = selectionFromGeometry(geometryId, sourceId, geometry);
  const occurrence = occurrenceFixture(`occ:${sourceId}`, sourceId, geometryId);
  return buildSolidFittingPortEvidence(
    { artifactId: `fbx-zone-geometry-evidence:${'a'.repeat(64)}` },
    { selectedOccurrences: [occurrence] }, [selection]);
}

async function main() {
  const evidence = await evidenceFor('101', '1', prismGeometry(10, 50, 8));
  const bridgeEvidence = await evidenceFor('102', '2', splitCappedCylinder());
  assert.equal(bridgeEvidence.occurrenceEvidence[0]
    .analysisProjection.terminalCapBridge?.disposition, 'APPLIED');

  const extra = structuredClone(evidence);
  extra.unexpected = true;
  const malformed = structuredClone(evidence);
  malformed.artifactId = 'not-a-valid-id';
  const missingProjection = structuredClone(evidence);
  delete missingProjection.occurrenceEvidence[0].analysisProjection;
  const tamperedBridge = structuredClone(bridgeEvidence);
  delete tamperedBridge.occurrenceEvidence[0]
    .analysisProjection.terminalCapBridge.pairedVertexCount;

  const schema = JSON.parse(await readFile(
    new URL('../../contracts/fbx/fbx-solid-fitting-port-evidence.v3.schema.json', import.meta.url), 'utf8',
  ));
  const results = validateSchema(schema, [
    evidence, bridgeEvidence, extra, malformed, missingProjection, tamperedBridge,
  ]);
  assert.equal(results[0].length, 0, JSON.stringify(results[0]));
  assert.equal(results[1].length, 0, JSON.stringify(results[1]));
  assert.notEqual(results[2].length, 0, 'unexpected top-level field passed schema');
  assert.notEqual(results[3].length, 0, 'malformed artifactId passed schema');
  assert.notEqual(results[4].length, 0, 'missing analysis projection passed schema');
  assert.notEqual(results[5].length, 0, 'tampered bridge evidence passed schema');

  console.log('PASS test-solid-fitting-port-evidence-contract');
}

await main();
