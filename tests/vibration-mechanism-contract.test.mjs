import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VIBRATION_MECHANISM_ASSESSMENT_ITEM_SCHEMA,
  VIBRATION_MECHANISM_ASSESSMENT_SET_SCHEMA,
  VIBRATION_MECHANISM_IMPLEMENTATION_STATES,
  createVibrationMechanismAssessmentItem,
  createVibrationMechanismAssessmentSet,
  vibrationMechanismAssessmentItemId,
} from '../converters/vibration/mechanisms/index.js';

const scope = Object.freeze({ line: 'L-100', caseId: 'NORMAL', canonicalId: 'CAN-1' });

function item(childKey = 'main', implementationState = 'IMPLEMENTED_BENCHMARK_ONLY') {
  return createVibrationMechanismAssessmentItem({
    mechanismId: 'fit', scope, childKey,
    implementationState,
    assessmentState: 'CALCULATED', resultState: 'CURRENT_RESULT',
    readiness: { missing: [], invalid: [], reasons: [] },
    benchmark: { status: 'PASS' },
    trace: {
      equationIds: ['FIT-EQ-001'], correlationIds: ['FIT.STD.STIFF.v1'], ruleIds: [],
      inputTrace: { status: 'SOURCE_AND_NORMALIZED_ONLY', normalizedInputs: { phase: 'GAS' } },
    },
  });
}

test('mechanism lifecycle explicitly supports screening and both candidate authority classes', () => {
  assert.deepEqual(VIBRATION_MECHANISM_IMPLEMENTATION_STATES, [
    'NOT_IMPLEMENTED',
    'IMPLEMENTED_BENCHMARK_ONLY',
    'IMPLEMENTED_SCREENING',
    'IMPLEMENTED_CANDIDATE_USER_INPUT',
    'IMPLEMENTED_CANDIDATE_MASTER',
  ]);
  assert.equal(item('screening', 'IMPLEMENTED_SCREENING').implementationState, 'IMPLEMENTED_SCREENING');
  assert.equal(item('user-candidate', 'IMPLEMENTED_CANDIDATE_USER_INPUT').implementationState, 'IMPLEMENTED_CANDIDATE_USER_INPUT');
  assert.equal(item('master-candidate', 'IMPLEMENTED_CANDIDATE_MASTER').implementationState, 'IMPLEMENTED_CANDIDATE_MASTER');
});

test('mechanism assessment item identity is deterministic and delimiter-safe', () => {
  const id = vibrationMechanismAssessmentItemId({
    mechanismId: 'fit',
    scope: { line: 'L|1', caseId: 'C:1', canonicalId: 'CAN/1' },
    childKey: 'main|child',
  });
  assert.equal(id, '["fit","L|1","C:1","CAN/1","main|child"]');
  assert.equal(item().schema, VIBRATION_MECHANISM_ASSESSMENT_ITEM_SCHEMA);
  assert.equal(item().itemId, '["fit","L-100","NORMAL","CAN-1","main"]');
});

test('assessment sets expose zero, one and many child cardinality without inventing items', () => {
  const zero = createVibrationMechanismAssessmentSet({ mechanismId: 'aiv', scope, items: [] });
  const one = createVibrationMechanismAssessmentSet({ mechanismId: 'fit', scope, items: [item()] });
  const many = createVibrationMechanismAssessmentSet({ mechanismId: 'fit', scope, items: [item('a'), item('b')] });
  assert.equal(zero.schema, VIBRATION_MECHANISM_ASSESSMENT_SET_SCHEMA);
  assert.deepEqual(zero.cardinality, { count: 0, kind: 'ZERO' });
  assert.deepEqual(one.cardinality, { count: 1, kind: 'ONE' });
  assert.deepEqual(many.cardinality, { count: 2, kind: 'MANY' });
});

test('assessment set rejects duplicate child identity and cross-scope items', () => {
  const duplicate = item('same');
  assert.throws(
    () => createVibrationMechanismAssessmentSet({ mechanismId: 'fit', scope, items: [duplicate, duplicate] }),
    /Duplicate mechanism assessment item/u,
  );
  assert.throws(
    () => createVibrationMechanismAssessmentSet({ mechanismId: 'aiv', scope, items: [item()] }),
    /scope\/mechanism mismatch/u,
  );
});

test('invalid lifecycle, result and trace states fail closed', () => {
  assert.throws(() => createVibrationMechanismAssessmentItem({
    mechanismId: 'fit', scope, childKey: 'main',
    implementationState: 'IMPLEMENTED_BENCHMARK_ONLY',
    assessmentState: 'SAFE', resultState: 'CURRENT_RESULT',
  }), /assessmentState must be one of/u);
  assert.throws(() => createVibrationMechanismAssessmentItem({
    mechanismId: 'fit', scope, childKey: 'main',
    implementationState: 'IMPLEMENTED_BENCHMARK_ONLY',
    assessmentState: 'READY', resultState: 'PASS',
  }), /resultState must be one of/u);
  assert.throws(() => createVibrationMechanismAssessmentItem({
    mechanismId: 'fit', scope, childKey: 'main',
    implementationState: 'IMPLEMENTED_DESIGN',
    assessmentState: 'READY', resultState: 'READY',
  }), /implementationState must be one of/u);
});
