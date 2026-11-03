import assert from 'node:assert/strict';
import { classifySelectedPipes } from '../../tabs/model-converters/converters/fbx/auto-pipe/classify.js';

const hash = (digit) => digit.repeat(64);
const matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

function zoneGeometryEvidence(occurrenceOverride) {
  return {
    occurrenceEvidence: [{
      sourceOccurrenceId: 'occ:1', sourceModelObjectId: '1',
      geometryObjectIds: ['2'], geometryMatrixMm: matrix, ...occurrenceOverride,
    }],
  };
}

const buffer = new Float64Array([
  0, 1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1,
  10, 1, 0, 10, 0, 1, 10, -1, 0, 10, 0, -1,
]).buffer;
const selections = [{
  geometry: { geometryObjectId: '2' },
  buffers: [{ role: 'control-points-mm', buffer: { bytes: buffer } }],
}];

const derivedPortEvidence = {
  candidates: [
    {
      portEvidenceId: `port-evidence:${hash('1')}`, boundaryLoopId: `boundary-loop:${hash('2')}`,
      shellId: `shell:${hash('3')}`, sourceOccurrenceId: 'occ:1', geometryObjectId: '2',
      admissionDisposition: 'ADMITTED', centreMm: [0, 0, 0], normal: [-1, 0, 0], radiusMm: 1, diameterMm: 2,
    },
    {
      portEvidenceId: `port-evidence:${hash('4')}`, boundaryLoopId: `boundary-loop:${hash('5')}`,
      shellId: `shell:${hash('3')}`, sourceOccurrenceId: 'occ:1', geometryObjectId: '2',
      admissionDisposition: 'ADMITTED', centreMm: [10, 0, 0], normal: [1, 0, 0], radiusMm: 1, diameterMm: 2,
    },
  ],
};

// A closed-solid record that would also admit as STRAIGHT_TWO_PORT is present
// for the same occurrence, but open-boundary already classifies it — the
// router must never consult the closed-solid route once open-boundary
// applies at all, even though both could pass.
const closedSolidPipeEvidence = {
  occurrenceEvidence: [{
    sourceOccurrenceId: 'occ:1', geometryObjectId: '2', topologyDisposition: 'STRAIGHT_TWO_PORT',
    candidates: [
      {
        capRingId: `cap-ring:${hash('6')}`, portEvidenceId: `cap-ring:${hash('6')}`,
        boundaryLoopId: `cap-ring:${hash('6')}`, sourceOccurrenceId: 'occ:1', geometryObjectId: '2',
        admissionDisposition: 'ADMITTED', centreMm: [0, 0, 0], normal: [-1, 0, 0], radiusMm: 1, diameterMm: 2,
      },
      {
        capRingId: `cap-ring:${hash('7')}`, portEvidenceId: `cap-ring:${hash('7')}`,
        boundaryLoopId: `cap-ring:${hash('7')}`, sourceOccurrenceId: 'occ:1', geometryObjectId: '2',
        admissionDisposition: 'ADMITTED', centreMm: [10, 0, 0], normal: [1, 0, 0], radiusMm: 1, diameterMm: 2,
      },
    ],
  }],
};

const [openBoundaryResult] = classifySelectedPipes({
  zoneGeometryEvidence: zoneGeometryEvidence(), derivedPortEvidence, closedSolidPipeEvidence, selections,
});
assert.equal(openBoundaryResult.admitted, true);
assert.equal(openBoundaryResult.inferenceMethod, undefined, 'open-boundary admission must not carry a closed-solid inferenceMethod tag');
assert.equal(openBoundaryResult.A.boundaryLoopId, `boundary-loop:${hash('2')}`, 'open-boundary port evidence must win, not the closed-solid candidate');

// A structural rejection other than BOUNDARY_COUNT (here: two admitted loops
// on different shells) must never fall through to the closed-solid route.
const shellMismatchEvidence = {
  candidates: derivedPortEvidence.candidates.map((item, index) => (
    index === 1 ? { ...item, shellId: `shell:${hash('9')}` } : item
  )),
};
const [shellMismatchResult] = classifySelectedPipes({
  zoneGeometryEvidence: zoneGeometryEvidence(), derivedPortEvidence: shellMismatchEvidence,
  closedSolidPipeEvidence, selections,
});
assert.equal(shellMismatchResult.admitted, false);
assert.equal(shellMismatchResult.reason, 'SHELL_COUNT');

// No closed-solid evidence supplied at all: existing callers are unaffected.
const [noClosedSolidResult] = classifySelectedPipes({
  zoneGeometryEvidence: zoneGeometryEvidence(), derivedPortEvidence, selections,
});
assert.equal(noClosedSolidResult.admitted, true);

console.log('PASS test-auto-pipe-router-priority');
