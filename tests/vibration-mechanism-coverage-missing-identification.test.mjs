import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVibrationMechanismAssessmentItem,
  createVibrationMechanismAssessmentSet,
} from '../converters/vibration/mechanisms/contracts.js';
import {
  evaluateVibrationCoverageAndCompleteness,
} from '../converters/vibration/mechanisms/coverage.js';

const scope = Object.freeze({ line: 'L-EXISTING', caseId: 'CASE-1', canonicalId: 'ROW-EXISTING' });

function currentFitAssessmentSet() {
  const item = createVibrationMechanismAssessmentItem({
    mechanismId: 'fit',
    scope,
    childKey: 'mainline',
    implementationState: 'IMPLEMENTED_SCREENING',
    assessmentState: 'CALCULATED',
    resultState: 'CURRENT_RESULT',
    qualification: { effective: 'SCREENING' },
    readiness: {},
    result: { calculated: true },
  });
  return createVibrationMechanismAssessmentSet({ mechanismId: 'fit', scope, items: [item] });
}

test('VIB-COV-001: current mechanism results cannot substitute for missing identification evidence', () => {
  const result = evaluateVibrationCoverageAndCompleteness({
    identifications: [],
    knownMechanismIds: ['fit'],
    assessmentSets: [currentFitAssessmentSet()],
  });
  assert.equal(result.completeness.state, 'INCOMPLETE');
  assert.deepEqual(result.completeness.reasons, ['IDENTIFICATION_EVIDENCE_MISSING']);
  assert.equal(result.completeness.completeCount, 0);
});
