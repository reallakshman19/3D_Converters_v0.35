import assert from 'node:assert/strict';
import test from 'node:test';
import { mechanicalFacilityScopeId } from '../converters/vibration/mechanical/facility.js';
import {
  buildVibrationMechanismAssessment,
  buildVibrationMechanismMatrixRow,
} from '../tabs/vibration-integrity-mechanisms.js';

function row() {
  return {
    line: 'L-200', caseId: 'NORMAL', canonicalId: 'CAN-2',
    standardLof: 0.3, governingReferenceLof: 0.3,
    referenceBand: 'LOF_0_3_TO_LT_0_5', qualificationState: 'SCREENING',
  };
}

test('no Mechanical selection remains applicability-unknown, not automatically not-applicable', () => {
  const assessment = buildVibrationMechanismAssessment(row(), 'mechanicalExcitation');
  assert.equal(assessment.assessmentState, 'APPLICABILITY_UNKNOWN');
  assert.equal(assessment.calculated, false);
  assert.deepEqual(assessment.readiness.missing, ['MECHANICAL_T23_EQUIPMENT_SOURCE_SELECTION']);
});

test('explicit facility not-applicable decision is distinct and creates no candidate LOF', () => {
  const target = row();
  const scopeId = mechanicalFacilityScopeId(target);
  const context = { mechanicalNotApplicableByScope: { [scopeId]: true } };
  const assessment = buildVibrationMechanismAssessment(target, 'mechanicalExcitation', context);
  assert.equal(assessment.assessmentState, 'NOT_APPLICABLE');
  assert.equal(assessment.calculated, false);
  assert.deepEqual(assessment.readiness, { missing: [], invalid: [], reasons: [] });
  assert.equal(assessment.contractSet.items[0].applicability.status, 'NOT_APPLICABLE_USER_CONFIRMED');
  assert.equal(assessment.contractSet.items[0].result.status, 'NOT_APPLICABLE');
  const matrix = buildVibrationMechanismMatrixRow(target, { resultState: 'CURRENT_RESULT', ...context });
  assert.equal(matrix.candidateGoverning, null);
  assert.equal(matrix.screeningGoverning.mechanism.id, 'fit');
});
