import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EI_MAIN_LINE_AGGREGATION_POLICY,
  EI_MAIN_LINE_MECHANISM_IDS,
  eiMainLineAggregationPolicyFingerprint,
  evaluateEiMainLineAggregation,
} from '../converters/vibration/ei-mainline-aggregation.js';
import {
  createVibrationMechanismAssessmentItem,
  createVibrationMechanismAssessmentSet,
} from '../converters/vibration/mechanisms/contracts.js';
import { VIBRATION_MECHANISM_IDS } from '../converters/vibration/mechanisms/registry.js';
import { buildVibrationMechanismMatrixRow } from '../tabs/vibration-integrity-mechanisms.js';

const MAIN_LINE_IDS = [
  'fit', 'mechanicalExcitation', 'reciprocatingPulsation', 'rotatingStall',
  'deadlegPulsation', 'aiv', 'valveTransients', 'cavitationFlashing',
];

function row(overrides = {}) {
  return {
    line: 'L-100', caseId: 'NORMAL', canonicalId: 'CAN-1',
    standardLof: 0.34, governingReferenceLof: 0.34,
    referenceBand: 'LOF_0_3_TO_LT_0_5', qualificationState: 'SCREENING',
    ...overrides,
  };
}

function scope(target = row()) {
  return { line: target.line, caseId: target.caseId, canonicalId: target.canonicalId };
}

function unitType(mechanismId) {
  if (mechanismId === 'deadlegPulsation') return 'DEADLEG_BRANCH';
  if (mechanismId === 'aiv') return 'AIV_SOURCE_ASSESSMENT_PAIR';
  if (mechanismId === 'valveTransients') return 'TRANSIENT_EVENT_PATH';
  return 'MAIN_LINE_SECTION';
}

function identification(mechanismId, disposition, target = row()) {
  return {
    mechanismId, scope: scope(target), assessmentUnitType: unitType(mechanismId), disposition,
    evidence: { sourceId: `T1-M4-${mechanismId}-${disposition}` },
    reason: `M4 fixture ${disposition}`,
  };
}

function identifications({ required = [], unresolved = [], target = row() } = {}) {
  const requiredSet = new Set(required);
  const unresolvedSet = new Set(unresolved);
  return MAIN_LINE_IDS.map((mechanismId) => identification(
    mechanismId,
    requiredSet.has(mechanismId) ? 'REQUIRED' : unresolvedSet.has(mechanismId) ? 'UNRESOLVED' : 'NOT_APPLICABLE',
    target,
  ));
}

function assessmentSet(mechanismId, lofs, {
  target = row(), implementationState = 'IMPLEMENTED_SCREENING',
  qualification = 'SCREENING', resultState = 'CURRENT_RESULT', assessmentState = 'CALCULATED',
} = {}) {
  const values = Array.isArray(lofs) ? lofs : [lofs];
  const items = values.map((lof, index) => createVibrationMechanismAssessmentItem({
    mechanismId, scope: scope(target), childKey: `child-${index + 1}`, childOrdinal: index,
    implementationState, assessmentState, resultState, readiness: {},
    result: { calculated: true, governingLof: lof },
    qualification: { effective: qualification }, evidence: { fixture: true },
  }));
  return createVibrationMechanismAssessmentSet({ mechanismId, scope: scope(target), items });
}

function evaluate({ ids = identifications(), sets = [], target = row(), extra = {} } = {}) {
  return evaluateEiMainLineAggregation({
    scope: scope(target), identifications: ids, assessmentSets: sets, ...extra,
  });
}

test('VIB-M4-001/002: policy freezes the governed #429 T2 set with deterministic identity', () => {
  assert.deepEqual(EI_MAIN_LINE_MECHANISM_IDS, MAIN_LINE_IDS);
  assert.ok(EI_MAIN_LINE_MECHANISM_IDS.every((id) => VIBRATION_MECHANISM_IDS.includes(id)));
  assert.equal(EI_MAIN_LINE_AGGREGATION_POLICY.fingerprint, eiMainLineAggregationPolicyFingerprint());
  const changed = structuredClone(EI_MAIN_LINE_AGGREGATION_POLICY);
  changed.includedMechanismIds = changed.includedMechanismIds.slice(1);
  assert.notEqual(eiMainLineAggregationPolicyFingerprint(changed), EI_MAIN_LINE_AGGREGATION_POLICY.fingerprint);
  assert.deepEqual(EI_MAIN_LINE_AGGREGATION_POLICY.excludedMechanisms.map((item) => item.mechanismId), [
    'corrugationPulsation', 'slugFlow', 'thermowells', 'smallBoreConnections',
  ]);
});

test('VIB-M4-003/004: caller cannot redefine the universe and missing T2 identification blocks a numeric LOF', () => {
  assert.throws(
    () => evaluate({
      ids: [identification('fit', 'REQUIRED')],
      sets: [assessmentSet('fit', 0.34)],
      extra: { mainLineMechanismIds: ['fit'] },
    }),
    /CALLER_MAINLINE_POLICY_OVERRIDE_FORBIDDEN/u,
  );
  const result = evaluate({ ids: [identification('fit', 'REQUIRED')], sets: [assessmentSet('fit', 0.34)] });
  assert.equal(result.state, 'INCOMPLETE');
  assert.equal(result.eiMainLineLof, null);
  assert.ok(result.mainLineCompleteness.missingIdentificationCount > 0);
});

test('VIB-M4-005/006: unresolved is incomplete; all explicit N/A is NOT_APPLICABLE', () => {
  const unresolved = evaluate({ ids: identifications({ unresolved: ['aiv'] }) });
  assert.equal(unresolved.state, 'INCOMPLETE');
  assert.equal(unresolved.eiMainLineLof, null);
  assert.ok(unresolved.reasons.includes('UNRESOLVED_MAINLINE_IDENTIFICATION'));

  const notApplicable = evaluate({ ids: identifications() });
  assert.equal(notApplicable.state, 'NOT_APPLICABLE');
  assert.equal(notApplicable.eiMainLineLof, null);
  assert.deepEqual(notApplicable.contributors, []);
});

test('VIB-M4-007/008: only complete qualified current contributors form the deterministic maximum', () => {
  const fitOnly = evaluate({
    ids: identifications({ required: ['fit'] }),
    sets: [assessmentSet('fit', 0.34)],
  });
  assert.equal(fitOnly.state, 'COMPLETE');
  assert.equal(fitOnly.eiMainLineLof, 0.34);
  assert.equal(fitOnly.governingContributor.mechanismId, 'fit');

  const fitAndAiv = evaluate({
    ids: identifications({ required: ['fit', 'aiv'] }),
    sets: [assessmentSet('fit', 0.34), assessmentSet('aiv', 0.52)],
  });
  assert.equal(fitAndAiv.state, 'COMPLETE');
  assert.equal(fitAndAiv.eiMainLineLof, 0.52);
  assert.equal(fitAndAiv.governingContributor.mechanismId, 'aiv');
});

test('VIB-M4-009/010/011: stale, candidate and M3-pending mechanisms cannot contribute', () => {
  const stale = evaluate({
    ids: identifications({ required: ['fit'] }),
    sets: [assessmentSet('fit', 0.34, { resultState: 'STALE_RESULT' })],
  });
  assert.equal(stale.state, 'INCOMPLETE');
  assert.equal(stale.eiMainLineLof, null);

  const candidate = evaluate({
    ids: identifications({ required: ['mechanicalExcitation'] }),
    sets: [assessmentSet('mechanicalExcitation', 0.9, {
      implementationState: 'IMPLEMENTED_CANDIDATE_MASTER', qualification: 'CANDIDATE_MASTER',
    })],
  });
  assert.equal(candidate.state, 'INCOMPLETE');
  assert.equal(candidate.eiMainLineLof, null);

  const forgedScreening = evaluate({
    ids: identifications({ required: ['mechanicalExcitation'] }),
    sets: [assessmentSet('mechanicalExcitation', 0.9)],
  });
  assert.equal(forgedScreening.state, 'INCOMPLETE');
  assert.ok(forgedScreening.reasons.includes('BENCHMARK_NOT_READY:mechanicalExcitation'));
});

test('VIB-M4-012/013: invalid LOFs fail closed and MANY qualified items contribute individually', () => {
  for (const invalid of [undefined, Number.NaN, Number.POSITIVE_INFINITY, -0.1]) {
    const result = evaluate({
      ids: identifications({ required: ['fit'] }), sets: [assessmentSet('fit', invalid)],
    });
    assert.equal(result.state, 'INCOMPLETE');
    assert.equal(result.eiMainLineLof, null);
  }

  const many = evaluate({
    ids: identifications({ required: ['aiv'] }),
    sets: [assessmentSet('aiv', [0.21, 0.63, 0.47])],
  });
  assert.equal(many.state, 'COMPLETE');
  assert.equal(many.eiMainLineLof, 0.63);
  assert.deepEqual(many.contributors.map((item) => item.lof), [0.21, 0.63, 0.47]);
});

test('VIB-M4-014/015/016: excluded mechanism values cannot change EI main-line aggregation', () => {
  const baseIds = identifications({ required: ['fit'] });
  const fit = assessmentSet('fit', 0.34);
  const extras = [
    assessmentSet('smallBoreConnections', 9.9),
    assessmentSet('thermowells', 8.8),
    assessmentSet('slugFlow', 7.7),
    assessmentSet('corrugationPulsation', 6.6),
  ];
  const result = evaluate({ ids: baseIds, sets: [fit, ...extras] });
  assert.equal(result.state, 'COMPLETE');
  assert.equal(result.eiMainLineLof, 0.34);
  assert.deepEqual(result.contributors.map((item) => item.mechanismId), ['fit']);
});

test('VIB-M4-017: cross-scope identification and assessment evidence fail closed', () => {
  const other = row({ line: 'L-200', canonicalId: 'CAN-2' });
  assert.throws(
    () => evaluate({ ids: identifications({ required: ['fit'], target: other }), sets: [assessmentSet('fit', 0.34, { target: other })] }),
    /EI_MAINLINE_SCOPE_MISMATCH/u,
  );
  assert.throws(
    () => evaluate({ ids: identifications({ required: ['fit'] }), sets: [assessmentSet('fit', 0.34, { target: other })] }),
    /EI_MAINLINE_SCOPE_MISMATCH/u,
  );
});

test('VIB-M4-019/020/021: matrix exposes M4 separately without widening family/authority semantics', () => {
  const target = row();
  const matrix = buildVibrationMechanismMatrixRow(target, {
    resultState: 'CURRENT_RESULT',
    mechanismIdentifications: identifications({ required: ['fit'], target }),
  });
  assert.equal(matrix.eiMainLineAggregation.state, 'COMPLETE');
  assert.equal(matrix.eiMainLineAggregation.eiMainLineLof, 0.34);
  assert.equal(matrix.screeningGoverning.mechanism.id, 'fit');
  assert.equal(matrix.assessmentCompleteness.state, 'INCOMPLETE');
  assert.equal(matrix.fullScreeningGoverningEstablished, false);
  assert.deepEqual(matrix.eiMainLineAggregation.authority, {
    authorityPromotion: false, contributorQualificationRequired: 'SCREENING',
    designAuthority: false, codeCompliance: false,
    fullVibrationAssessmentComplete: false, productFreezeImplied: false,
  });
});

test('VIB-M4 primary falsifier: valid FIT alone cannot masquerade as complete main-line coverage', () => {
  const matrix = buildVibrationMechanismMatrixRow(row(), {
    resultState: 'CURRENT_RESULT',
    mechanismIdentifications: [identification('fit', 'REQUIRED')],
  });
  assert.equal(matrix.screeningGoverning.lof, 0.34);
  assert.equal(matrix.eiMainLineAggregation.state, 'INCOMPLETE');
  assert.equal(matrix.eiMainLineAggregation.eiMainLineLof, null);
});
