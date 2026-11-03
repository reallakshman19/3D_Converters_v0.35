import assert from 'node:assert/strict';
import { buildDerivedPortEvidence } from '../../tabs/model-converters/converters/fbx/zone-geometry/derived-ports.js';
import { buildSolidFittingPortEvidence } from '../../tabs/model-converters/converters/fbx/solid-fitting-ports/evidence.js';
import { runFbxAutoPipe } from '../../tabs/model-converters/converters/fbx/auto-pipe/pipeline.js';
import {
  occurrenceFixture, prismGeometry, selectionFromGeometry,
} from './solid-fitting-port-fixtures.mjs';

const hash = (digit) => digit.repeat(64);

async function main() {
  const occurrence = occurrenceFixture('occ:1', '1', '101');
  const geometry = prismGeometry(10, 50, 8);
  const selection = selectionFromGeometry('101', 'src:1', geometry);
  const scope = { selectedOccurrences: [occurrence] };

  const zoneGeometryEvidence = {
    artifactId: `fbx-zone-geometry-evidence:${hash('1')}`,
    sourceIdentity: { sha256: hash('2'), byteLength: 64, fbxVersion: 7400 },
    parserIdentity: {
      provenanceSchema: 'FbxParserProvenance.v1',
      upstreamRevision: '3'.repeat(40), sourceSha256: hash('4'), wasmSha256: hash('5'),
    },
    sourceGraphSha256: hash('6'), selectedZone: { zoneId: 'zone:pipe', label: 'Pipe' },
    occurrenceEvidence: [occurrence],
    conservation: { selectedOccurrenceCount: 1 },
  };

  // Real open-boundary evidence over a watertight solid finds zero boundary
  // loops at all — this confirms the router only reaches for the
  // closed-solid path because open-boundary structurally cannot apply
  // (BOUNDARY_COUNT), not because of a relaxed check.
  const derivedPortEvidence = await buildDerivedPortEvidence(zoneGeometryEvidence, scope, [selection]);
  assert.equal(derivedPortEvidence.candidates.filter(
    (item) => item.sourceOccurrenceId === 'occ:1').length, 0);

  const closedSolidPipeEvidence = await buildSolidFittingPortEvidence(zoneGeometryEvidence, scope, [selection]);
  const [record] = closedSolidPipeEvidence.occurrenceEvidence;
  assert.equal(record.topologyDisposition, 'STRAIGHT_TWO_PORT');

  const result = await runFbxAutoPipe({
    zoneGeometryEvidence, derivedPortEvidence, closedSolidPipeEvidence, selections: [selection],
  });

  assert.equal(result.status, 'STAGEDJSON_PASS');
  assert.equal(result.classificationStatus, 'PIPE_INFERENCE_PASS');
  const [classification] = result.classificationDispositions;
  assert.equal(classification.admitted, true);
  assert.equal(classification.inferenceMethod, 'CLOSED_SOLID_CYLINDER');
  const branch = result.stagedJson[0];
  assert.equal(branch.attributes.mappingSchema, 'FbxInternalPipeMapping.v1');
  assert.equal(branch.children.length, 1);
  assert.equal(branch.children[0].type, 'PIPE');

  console.log('PASS test-auto-pipe-closed-solid-router');
}

await main();
