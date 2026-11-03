import assert from 'node:assert/strict';
import { classifyPipeOccurrence } from '../../tabs/model-converters/converters/fbx/auto-pipe/classify.js';

function topologyBuffer() {
  return new Float64Array([
    0, 1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1,
    10, 1, 0, 10, 0, 1, 10, -1, 0, 10, 0, -1,
  ]).buffer;
}

const occurrence = {
  sourceOccurrenceId: 'occ:1',
  sourceModelObjectId: '1',
  geometryObjectIds: ['2'],
  geometryMatrixMm: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
};
const selection = {
  geometry: { geometryObjectId: '2' },
  buffers: [{ role: 'control-points-mm', buffer: { bytes: topologyBuffer() } }],
};
const derivedPortEvidence = {
  candidates: [
    {
      portEvidenceId: `port-evidence:${'1'.repeat(64)}`,
      boundaryLoopId: `boundary-loop:${'2'.repeat(64)}`,
      shellId: `shell:${'3'.repeat(64)}`,
      sourceOccurrenceId: 'occ:1', geometryObjectId: '2',
      admissionDisposition: 'ADMITTED', centreMm: [0, 0, 0],
      normal: [-1, 0, 0], radiusMm: 1, diameterMm: 2,
    },
    {
      portEvidenceId: `port-evidence:${'4'.repeat(64)}`,
      boundaryLoopId: `boundary-loop:${'5'.repeat(64)}`,
      shellId: `shell:${'3'.repeat(64)}`,
      sourceOccurrenceId: 'occ:1', geometryObjectId: '2',
      admissionDisposition: 'ADMITTED', centreMm: [10, 0, 0],
      normal: [1, 0, 0], radiusMm: 1, diameterMm: 2,
    },
  ],
};

const result = classifyPipeOccurrence({ occurrence, selection, derivedPortEvidence });
assert.equal(result.status, 'PIPE_INFERENCE_PASS');
assert.equal(result.sourceModelObjectId, '1');
assert.deepEqual(result.A.centreMm, [0, 0, 0]);
assert.deepEqual(result.L.centreMm, [10, 0, 0]);
assert.equal(result.spanMm, 10);
console.log('PASS test-auto-pipe-classification');
