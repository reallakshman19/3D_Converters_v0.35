import assert from 'node:assert/strict';
import { runFbxAutoPipe } from '../../tabs/model-converters/converters/fbx/auto-pipe/pipeline.js';

const hash = (digit) => digit.repeat(64);
const matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

function buffer(start, end) {
  return new Float64Array([
    start, 1, 0, start, 0, 1, start, -1, 0, start, 0, -1,
    end, 1, 0, end, 0, 1, end, -1, 0, end, 0, -1,
  ]).buffer;
}

function candidate(occurrence, geometry, suffix, centreMm, normal, shell) {
  return {
    portEvidenceId: `port-evidence:${hash(suffix)}`,
    boundaryLoopId: `boundary-loop:${hash(suffix)}`,
    shellId: `shell:${hash(shell)}`,
    sourceOccurrenceId: occurrence,
    geometryObjectId: geometry,
    admissionDisposition: 'ADMITTED',
    centreMm, normal, radiusMm: 1, diameterMm: 2,
  };
}

function input(reverse = false) {
  const occurrences = [
    {
      sourceOccurrenceId: 'occ:0', sourceModelObjectId: '9',
      geometryObjectIds: [], geometryMatrixMm: matrix,
    },
    {
      sourceOccurrenceId: 'occ:1', sourceModelObjectId: '1',
      geometryObjectIds: ['2'], geometryMatrixMm: matrix,
    },
    {
      sourceOccurrenceId: 'occ:2', sourceModelObjectId: '3',
      geometryObjectIds: ['4'], geometryMatrixMm: matrix,
    },
  ];
  const selections = [
    {
      geometry: { geometryObjectId: '2' },
      buffers: [{ role: 'control-points-mm', buffer: { bytes: buffer(0, 10) } }],
    },
    {
      geometry: { geometryObjectId: '4' },
      buffers: [{ role: 'control-points-mm', buffer: { bytes: buffer(10, 20) } }],
    },
  ];
  const candidates = [
    candidate('occ:1', '2', '1', [0, 0, 0], [-1, 0, 0], 'a'),
    candidate('occ:1', '2', '2', [10, 0, 0], [1, 0, 0], 'a'),
    candidate('occ:2', '4', '3', [10, 0, 0], [-1, 0, 0], 'b'),
    candidate('occ:2', '4', '4', [20, 0, 0], [1, 0, 0], 'b'),
  ];
  return {
    zoneGeometryEvidence: {
      artifactId: `fbx-zone-geometry-evidence:${hash('5')}`,
      sourceIdentity: { sha256: hash('6'), byteLength: 128, fbxVersion: 7400 },
      parserIdentity: {
        provenanceSchema: 'FbxParserProvenance.v1',
        upstreamRevision: '7'.repeat(40), sourceSha256: hash('8'), wasmSha256: hash('9'),
      },
      sourceGraphSha256: hash('0'),
      selectedZone: { zoneId: 'zone:1', label: 'Ignored display label' },
      occurrenceEvidence: reverse ? [...occurrences].reverse() : occurrences,
      conservation: { selectedOccurrenceCount: 3 },
    },
    derivedPortEvidence: {
      artifactId: `fbx-derived-port-evidence:${hash('a')}`,
      candidates: reverse ? [...candidates].reverse() : candidates,
    },
    selections: reverse ? [...selections].reverse() : selections,
  };
}

const first = await runFbxAutoPipe(input(false));
const second = await runFbxAutoPipe(input(true));
assert.equal(first.status, 'STAGEDJSON_PASS');
assert.equal(first.internalPipeMappingJson, second.internalPipeMappingJson);
assert.equal(first.stagedJsonText, second.stagedJsonText);
assert.equal(first.internalPipeMapping.entries.length, 2);
assert.equal(first.internalPipeMapping.links.length, 1);
assert.equal(first.internalPipeMapping.conservation.contextOccurrenceCount, 1);
assert.equal(first.stagedJson.length, 1);
console.log('PASS test-auto-pipe-determinism');
