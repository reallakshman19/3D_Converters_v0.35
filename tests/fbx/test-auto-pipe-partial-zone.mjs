import assert from 'node:assert/strict';
import { runFbxAutoPipe } from '../../tabs/model-converters/converters/fbx/auto-pipe/pipeline.js';

const hash = (digit) => digit.repeat(64);
const matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const buffer = (start, end) => new Float64Array([
  start, 1, 0, start, 0, 1, start, -1, 0, start, 0, -1,
  end, 1, 0, end, 0, 1, end, -1, 0, end, 0, -1,
]).buffer;
const port = (occ, geo, suffix, centreMm, normal, shell) => ({
  portEvidenceId: `port-evidence:${hash(suffix)}`,
  boundaryLoopId: `boundary-loop:${hash(suffix)}`,
  shellId: `shell:${hash(shell)}`,
  sourceOccurrenceId: occ, geometryObjectId: geo,
  admissionDisposition: 'ADMITTED', centreMm, normal, radiusMm: 1, diameterMm: 2,
});

const result = await runFbxAutoPipe({
  zoneGeometryEvidence: {
    artifactId: `fbx-zone-geometry-evidence:${hash('1')}`,
    sourceIdentity: { sha256: hash('2'), byteLength: 64, fbxVersion: 7400 },
    parserIdentity: {
      provenanceSchema: 'FbxParserProvenance.v1',
      upstreamRevision: '3'.repeat(40), sourceSha256: hash('4'), wasmSha256: hash('5'),
    },
    sourceGraphSha256: hash('6'), selectedZone: { zoneId: 'zone:mixed', label: 'Mixed' },
    occurrenceEvidence: [
      { sourceOccurrenceId: 'occ:1', sourceModelObjectId: '1',
        geometryObjectIds: ['2'], geometryMatrixMm: matrix },
      { sourceOccurrenceId: 'occ:2', sourceModelObjectId: '3',
        geometryObjectIds: ['4'], geometryMatrixMm: matrix },
      { sourceOccurrenceId: 'occ:3', sourceModelObjectId: '5',
        geometryObjectIds: ['6'], geometryMatrixMm: matrix },
    ],
    conservation: { selectedOccurrenceCount: 3 },
  },
  derivedPortEvidence: {
    artifactId: `fbx-derived-port-evidence:${hash('7')}`,
    candidates: [
      port('occ:1', '2', '8', [0, 0, 0], [-1, 0, 0], 'a'),
      port('occ:1', '2', '9', [10, 0, 0], [1, 0, 0], 'a'),
      port('occ:2', '4', 'b', [10, 0, 0], [-1, 0, 0], 'c'),
      port('occ:2', '4', 'd', [20, 0, 0], [1, 0, 0], 'c'),
    ],
  },
  selections: [
    { geometry: { geometryObjectId: '2' },
      buffers: [{ role: 'control-points-mm', buffer: { bytes: buffer(0, 10) } }] },
    { geometry: { geometryObjectId: '4' },
      buffers: [{ role: 'control-points-mm', buffer: { bytes: buffer(10, 20) } }] },
    { geometry: { geometryObjectId: '6' },
      buffers: [{ role: 'control-points-mm', buffer: { bytes: buffer(30, 31) } }] },
  ],
});

assert.equal(result.status, 'STAGEDJSON_PASS');
assert.equal(result.classificationStatus, 'PIPE_INFERENCE_PARTIAL_PASS');
assert.deepEqual(result.counts, {
  classifiedOccurrences: 3, admittedPipes: 2, rejectedOccurrences: 1,
  links: 1, branches: 1,
});
assert.equal(result.internalPipeMapping.entries.length, 2);
assert.equal(result.internalPipeMapping.conservation.admittedPipeCount, 2);
assert.equal(result.internalPipeMapping.conservation.rejectedOccurrenceCount, 1);
const rejected = result.internalPipeMapping.occurrenceDispositions
  .find((item) => item.sourceOccurrenceId === 'occ:3');
assert.equal(rejected.disposition, 'PIPE_REJECTED');
assert.equal(rejected.status, 'BLOCKED_AUTO_PIPE_CLASSIFICATION');
assert.equal(rejected.reason, 'BOUNDARY_COUNT');
assert.equal(result.stagedJson[0].children.length, 2,
  'only admitted PIPE occurrences may enter StagedJSON');

console.log('PASS test-auto-pipe-partial-zone');
