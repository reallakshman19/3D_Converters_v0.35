import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createVibrationMechanismAssessmentItem,
  createVibrationMechanismAssessmentSet,
} from '../converters/vibration/mechanisms/contracts.js';
import {
  createRequiredVibrationAssessmentSet,
  evaluateVibrationCoverageAndCompleteness,
} from '../converters/vibration/mechanisms/coverage.js';

const KNOWN = Object.freeze(['fit', 'mechanicalExcitation', 'smallBoreConnections', 'aiv']);
const BASE_SCOPE = Object.freeze({ line: 'L-100', caseId: 'CASE-1', canonicalId: 'ROW-1' });

function identification(disposition = 'REQUIRED', overrides = {}) {
  return {
    mechanismId: 'fit',
    scope: BASE_SCOPE,
    assessmentUnitType: 'MAIN_LINE_SECTION',
    disposition,
    evidence: { sourceId: 'T1-EXPLICIT-001' },
    reason: 'Synthetic independent coverage fixture',
    ...overrides,
  };
}

function assessmentSet(overrides = {}) {
  const mechanismId = overrides.mechanismId ?? 'fit';
  const scope = overrides.scope ?? BASE_SCOPE;
  if (overrides.zero === true) {
    return createVibrationMechanismAssessmentSet({ mechanismId, scope, items: [] });
  }
  const item = createVibrationMechanismAssessmentItem({
    mechanismId,
    scope,
    childKey: overrides.childKey ?? 'mainline',
    implementationState: overrides.implementationState ?? 'IMPLEMENTED_SCREENING',
    assessmentState: overrides.assessmentState ?? 'CALCULATED',
    resultState: overrides.resultState ?? 'CURRENT_RESULT',
    readiness: {},
    result: { calculated: true },
    qualification: overrides.qualification ?? { effective: 'SCREENING' },
    evidence: { fixture: true },
  });
  return createVibrationMechanismAssessmentSet({ mechanismId, scope, items: [item] });
}

function evaluate(identifications, assessmentSets = []) {
  return evaluateVibrationCoverageAndCompleteness({
    identifications,
    knownMechanismIds: KNOWN,
    assessmentSets,
  });
}

test('VIB-COV-001: missing identification evidence can never produce COMPLETE', () => {
  const result = evaluate([], []);
  assert.equal(result.completeness.state, 'INCOMPLETE');
  assert.deepEqual(result.completeness.reasons, ['IDENTIFICATION_EVIDENCE_MISSING']);
});

test('VIB-COV-002: REQUIRED assessment missing is INCOMPLETE', () => {
  const result = evaluate([identification()], []);
  assert.equal(result.completeness.state, 'INCOMPLETE');
  assert.equal(result.coverage.required[0].reason, 'MISSING_ASSESSMENT_SET');
});

test('VIB-COV-003: REQUIRED NOT_IMPLEMENTED is INCOMPLETE', () => {
  const set = assessmentSet({
    implementationState: 'NOT_IMPLEMENTED',
    assessmentState: 'NOT_EVALUATED',
    resultState: 'UNRUN',
    qualification: { effective: 'NONE' },
  });
  const result = evaluate([identification()], [set]);
  assert.equal(result.completeness.state, 'INCOMPLETE');
  assert.equal(result.coverage.required[0].reason, 'NOT_IMPLEMENTED');
});

test('VIB-COV-004: REQUIRED stale result is INCOMPLETE', () => {
  const result = evaluate([identification()], [assessmentSet({ resultState: 'STALE_RESULT' })]);
  assert.equal(result.completeness.state, 'INCOMPLETE');
  assert.equal(result.coverage.required[0].reason, 'STALE_RESULT');
});

test('VIB-COV-005: candidate-only result cannot satisfy SCREENING coverage', () => {
  const candidate = assessmentSet({
    implementationState: 'IMPLEMENTED_CANDIDATE_MASTER',
    qualification: { effective: 'CANDIDATE_MASTER' },
  });
  const result = evaluate([identification()], [candidate]);
  assert.equal(result.completeness.state, 'INCOMPLETE');
  assert.equal(result.coverage.required[0].reason, 'CANDIDATE_OR_UNQUALIFIED_RESULT');
});

test('VIB-COV-006: explicit NOT_APPLICABLE remains distinct from missing', () => {
  const result = evaluate([identification('NOT_APPLICABLE')], []);
  assert.equal(result.completeness.state, 'NOT_APPLICABLE');
  assert.equal(result.completeness.notApplicableCount, 1);
  assert.equal(result.completeness.incompleteCount, 0);
});

test('VIB-COV-007: unresolved identification blocks completeness', () => {
  const result = evaluate([identification('UNRESOLVED')], []);
  assert.equal(result.completeness.state, 'INCOMPLETE');
  assert.equal(result.completeness.unresolvedIdentificationCount, 1);
  assert.ok(result.completeness.reasons.includes('UNRESOLVED_MECHANISM_IDENTIFICATION'));
});

test('VIB-COV-008: all required current SCREENING assessments produce COMPLETE', () => {
  const scope2 = { line: 'L-200', caseId: 'CASE-1', canonicalId: 'ROW-2' };
  const ids = [
    identification(),
    identification('REQUIRED', {
      mechanismId: 'aiv', scope: scope2, assessmentUnitType: 'AIV_SOURCE_ASSESSMENT_PAIR',
      evidence: { sourceId: 'T1-EXPLICIT-002' },
    }),
  ];
  const sets = [assessmentSet(), assessmentSet({ mechanismId: 'aiv', scope: scope2 })];
  const result = evaluate(ids, sets);
  assert.equal(result.completeness.state, 'COMPLETE');
  assert.equal(result.completeness.completeCount, 2);
});

test('VIB-COV-009: all explicitly not-applicable identifications produce NOT_APPLICABLE', () => {
  const result = evaluate([
    identification('NOT_APPLICABLE'),
    identification('NOT_APPLICABLE', {
      mechanismId: 'mechanicalExcitation',
      evidence: { sourceId: 'T1-EXPLICIT-002' },
    }),
  ]);
  assert.equal(result.completeness.state, 'NOT_APPLICABLE');
  assert.equal(result.completeness.notApplicableCount, 2);
});

test('VIB-COV-010/011: duplicate and contradictory identification fail closed', () => {
  assert.throws(
    () => createRequiredVibrationAssessmentSet({
      knownMechanismIds: KNOWN,
      identifications: [identification(), identification()],
    }),
    /DUPLICATE_MECHANISM_IDENTIFICATION/,
  );
  assert.throws(
    () => createRequiredVibrationAssessmentSet({
      knownMechanismIds: KNOWN,
      identifications: [identification(), identification('NOT_APPLICABLE')],
    }),
    /CONTRADICTORY_MECHANISM_IDENTIFICATION/,
  );
});

test('VIB-COV-012: unknown mechanism ID fails closed', () => {
  assert.throws(
    () => evaluate([identification('REQUIRED', { mechanismId: 'unknownMechanism' })]),
    /UNKNOWN_VIBRATION_MECHANISM/,
  );
});

test('VIB-COV-013: deterministic identities change when identification or coverage truth changes', () => {
  const first = evaluate([identification()], [assessmentSet()]);
  const changedIdentification = evaluate([
    identification('REQUIRED', { evidence: { sourceId: 'T1-EXPLICIT-CHANGED' } }),
  ], [assessmentSet()]);
  const changedCoverage = evaluate([identification()], [assessmentSet({ resultState: 'STALE_RESULT' })]);
  assert.notEqual(first.requiredAssessmentSet.setId, changedIdentification.requiredAssessmentSet.setId);
  assert.notEqual(first.coverage.coverageId, changedCoverage.coverage.coverageId);
});

test('ZERO assessment cardinality is incomplete, never implicit NOT_APPLICABLE', () => {
  const result = evaluate([identification()], [assessmentSet({ zero: true })]);
  assert.equal(result.completeness.state, 'INCOMPLETE');
  assert.equal(result.coverage.required[0].reason, 'ZERO_CARDINALITY_NOT_APPLICABLE_NOT_PROVEN');
});

test('CURRENT_RESULT qualification may be requested explicitly without inventing SCREENING authority', () => {
  const id = identification('REQUIRED', { requiredQualification: 'CURRENT_RESULT' });
  const candidate = assessmentSet({
    implementationState: 'IMPLEMENTED_CANDIDATE_MASTER',
    qualification: { effective: 'CANDIDATE_MASTER' },
  });
  const result = evaluate([id], [candidate]);
  assert.equal(result.completeness.state, 'COMPLETE');
  assert.equal(result.coverage.required[0].reason, 'CURRENT_REQUIRED_AUTHORITY_EVIDENCE');
});

test('VIB-COV-014: coverage core carries no mechanism numerical rules', async () => {
  const source = await readFile(new URL('../converters/vibration/mechanisms/coverage.js', import.meta.url), 'utf8');
  for (const forbidden of ['rhoV2', 'standardLof', 'QST-003', 'D.2.3', 'SBC_T3_CURVES']) {
    assert.equal(source.includes(forbidden), false, `coverage core must not contain ${forbidden}`);
  }
});
