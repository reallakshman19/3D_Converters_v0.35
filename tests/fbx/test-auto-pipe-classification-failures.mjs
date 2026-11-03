import assert from 'node:assert/strict';
import { classifyPipeOccurrence } from '../../tabs/model-converters/converters/fbx/auto-pipe/classify.js';

function fixture() {
  const occurrence = {
    sourceOccurrenceId: 'occ:1', sourceModelObjectId: '1',
    geometryObjectIds: ['2'],
    geometryMatrixMm: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  };
  const values = new Float64Array([
    0, 1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1,
    10, 1, 0, 10, 0, 1, 10, -1, 0, 10, 0, -1,
  ]);
  const selection = {
    geometry: { geometryObjectId: '2' },
    buffers: [{ role: 'control-points-mm', buffer: { bytes: values.buffer } }],
  };
  const candidate = (suffix, centreMm, normal, shell = '3') => ({
    portEvidenceId: `port-evidence:${suffix.repeat(64)}`,
    boundaryLoopId: `boundary-loop:${suffix.repeat(64)}`,
    shellId: `shell:${shell.repeat(64)}`,
    sourceOccurrenceId: 'occ:1', geometryObjectId: '2',
    admissionDisposition: 'ADMITTED', centreMm, normal, radiusMm: 1, diameterMm: 2,
  });
  return { occurrence, selection, candidates: [
    candidate('1', [0, 0, 0], [-1, 0, 0]),
    candidate('2', [10, 0, 0], [1, 0, 0]),
  ] };
}

const missing = fixture();
missing.candidates.pop();
assert.equal(classifyPipeOccurrence({
  occurrence: missing.occurrence, selection: missing.selection,
  derivedPortEvidence: { candidates: missing.candidates },
}).reason, 'BOUNDARY_COUNT');

const shells = fixture();
shells.candidates[1] = { ...shells.candidates[1], shellId: `shell:${'4'.repeat(64)}` };
assert.equal(classifyPipeOccurrence({
  occurrence: shells.occurrence, selection: shells.selection,
  derivedPortEvidence: { candidates: shells.candidates },
}).reason, 'SHELL_COUNT');

const protrusion = fixture();
const view = new Float64Array(protrusion.selection.buffers[0].buffer.bytes);
view[1] = 2;
assert.equal(classifyPipeOccurrence({
  occurrence: protrusion.occurrence, selection: protrusion.selection,
  derivedPortEvidence: { candidates: protrusion.candidates },
}).reason, 'CYLINDER_RESIDUAL');

console.log('PASS test-auto-pipe-classification-failures');
