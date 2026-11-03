import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { buildInternalPipeMapping } from '../../tabs/model-converters/converters/fbx/auto-pipe/artifact.js';

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

const hash = (digit) => digit.repeat(64);
const matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

async function main() {
  // A closed-solid-admitted classification carries cap-ring: port evidence
  // instead of boundary-loop:, exercising the port sub-schema's widened
  // oneOf on a real buildInternalPipeMapping() output.
  const classification = {
    admitted: true,
    status: 'PIPE_INFERENCE_PASS',
    sourceOccurrenceId: 'occ:1',
    sourceModelObjectId: '1',
    geometryObjectId: '2',
    inferenceMethod: 'CLOSED_SOLID_CYLINDER',
    A: {
      portEvidenceId: `cap-ring:${hash('1')}`, boundaryLoopId: `cap-ring:${hash('1')}`,
      geometryObjectId: '2', centreMm: [0, 0, 0], normal: [0, 0, -1], radiusMm: 1, diameterMm: 2,
    },
    L: {
      portEvidenceId: `cap-ring:${hash('2')}`, boundaryLoopId: `cap-ring:${hash('2')}`,
      geometryObjectId: '2', centreMm: [0, 0, 10], normal: [0, 0, 1], radiusMm: 1, diameterMm: 2,
    },
    axis: [0, 0, 1], spanMm: 10,
  };

  const mapping = await buildInternalPipeMapping({
    zoneGeometryEvidence: {
      artifactId: `fbx-zone-geometry-evidence:${hash('3')}`,
      sourceIdentity: { sha256: hash('4'), byteLength: 64, fbxVersion: 7400 },
      parserIdentity: {
        provenanceSchema: 'FbxParserProvenance.v1',
        upstreamRevision: '5'.repeat(40), sourceSha256: hash('6'), wasmSha256: hash('7'),
      },
      sourceGraphSha256: hash('8'), selectedZone: { zoneId: 'zone:pipe', label: 'Pipe' },
      occurrenceEvidence: [{
        sourceOccurrenceId: 'occ:1', sourceModelObjectId: '1',
        geometryObjectIds: ['2'], geometryMatrixMm: matrix,
      }],
      conservation: { selectedOccurrenceCount: 1 },
    },
    derivedPortEvidence: { artifactId: `fbx-derived-port-evidence:${hash('9')}` },
    classifications: [classification],
  });

  const portInstance = mapping.entries[0].ports.A;
  assert.equal(portInstance.boundaryLoopId, `cap-ring:${hash('1')}`);
  assert.equal(portInstance.sourcePortEvidenceId, `cap-ring:${hash('1')}`);

  const fullSchema = JSON.parse(await readFile(
    new URL('../../contracts/fbx/fbx-internal-pipe-mapping.v1.schema.json', import.meta.url), 'utf8',
  ));
  const portSchema = { $schema: fullSchema.$schema, $defs: fullSchema.$defs, $ref: '#/$defs/port' };
  const malformed = { ...portInstance, boundaryLoopId: 'not-a-valid-id' };
  const results = validateSchema(portSchema, [portInstance, malformed]);
  assert.equal(results[0].length, 0, JSON.stringify(results[0]));
  assert.notEqual(results[1].length, 0, 'malformed boundaryLoopId passed the port schema');

  console.log('PASS test-internal-pipe-mapping-cap-ring-contract');
}

await main();
