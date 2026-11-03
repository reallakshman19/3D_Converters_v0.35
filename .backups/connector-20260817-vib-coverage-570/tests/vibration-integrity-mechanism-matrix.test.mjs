import assert from 'node:assert/strict';
import test from 'node:test';
import { mechanicalFacilityScopeId } from '../converters/vibration/mechanical/facility.js';
import { sbcFacilityScopeId } from '../converters/vibration/sbc/facility.js';
import { SBC_TYPE3_BLOCKERS } from '../converters/vibration/sbc/type3-user-data.js';
import {
  VIBRATION_INTEGRITY_MECHANISMS,
  buildVibrationMechanismAssessment,
  buildVibrationMechanismMatrixRow,
} from '../tabs/vibration-integrity-mechanisms.js';

function row() {
  return {
    line: 'L-100', caseId: 'NORMAL', canonicalId: 'CAN-1',
    standardLof: 0.34, governingReferenceLof: 0.34,
    referenceBand: 'LOF_0_3_TO_LT_0_5', qualificationState: 'SCREENING',
  };
}

function userRow(scopeId, blockerId, value) {
  return {
    mechanismId: 'smallBoreConnections', blockerId, scopeId, recordKey: 'TYPE3',
    xValue: '', xUnit: '', yValue: '', yUnit: '', value: String(value), unit: '1',
    sourceReference: 'Independent facility test input', notes: '',
  };
}

function sbcRows(targetRow = row()) {
  const scopeId = sbcFacilityScopeId(targetRow);
  return [
    userRow(scopeId, SBC_TYPE3_BLOCKERS.mainlineLof, 1),
    userRow(scopeId, SBC_TYPE3_BLOCKERS.mainlineMultiplier, 1.42),
    userRow(scopeId, SBC_TYPE3_BLOCKERS.firstHasMass, 'TRUE'),
    userRow(scopeId, SBC_TYPE3_BLOCKERS.firstMassGeometryLof, 0.4),
    userRow(scopeId, SBC_TYPE3_BLOCKERS.figureT31, 0.2),
    userRow(scopeId, SBC_TYPE3_BLOCKERS.firstMinimumSpanLof, 0.7),
    userRow(scopeId, SBC_TYPE3_BLOCKERS.firstLocationLof, 1),
    userRow(scopeId, SBC_TYPE3_BLOCKERS.figureT33, 0.6),
    userRow(scopeId, SBC_TYPE3_BLOCKERS.figureT34, 0.2),
  ];
}

function mechanicalCandidate(targetRow = row(), lof = 0.4, scopeId = mechanicalFacilityScopeId(targetRow)) {
  return Object.freeze({
    schema: 'MechanicalFacilityCandidate.v1', status: 'CALCULATED_MASTER_CANDIDATE',
    scope: Object.freeze({
      schema: 'MechanicalFacilityScope.v1', scopeId,
      line: targetRow.line, caseId: targetRow.caseId, canonicalId: targetRow.canonicalId,
    }),
    sourceKeys: Object.freeze(['ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW']),
    governingLof: lof,
    governingSourceKey: 'ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW',
    rows: Object.freeze([{ sourceKey: 'ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW', baselineLof: lof }]),
    provenance: Object.freeze({ masterId: 'EI_AVIFF.T2_3.MECHANICAL_EXCITATION_BASELINE_LOF' }),
    usagePolicy: Object.freeze({ automaticFallbackAllowed: false }),
    authority: Object.freeze({
      engineeringAuthority: 'NONE', screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false, masterDataAuthority: false,
    }),
  });
}

function mechanicalContext(targetRow = row(), candidate = mechanicalCandidate(targetRow)) {
  const scopeId = mechanicalFacilityScopeId(targetRow);
  return {
    mechanicalSourceKeysByScope: { [scopeId]: ['ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW'] },
    mechanicalCandidateResultsByScope: { [scopeId]: candidate },
  };
}

test('catalogue exposes FIT screening plus Mechanical/SBC candidates without promoting other mechanisms', () => {
  assert.deepEqual(
    VIBRATION_INTEGRITY_MECHANISMS.map((mechanism) => mechanism.id),
    [
      'fit','mechanicalExcitation','reciprocatingPulsation','rotatingStall',
      'deadlegPulsation','corrugationPulsation','slugFlow','aiv',
      'valveTransients','cavitationFlashing','thermowells','smallBoreConnections',
    ],
  );
  assert.equal(
    VIBRATION_INTEGRITY_MECHANISMS.filter((item) => item.implementationState !== 'NOT_IMPLEMENTED').length,
    3,
  );
  assert.equal(VIBRATION_INTEGRITY_MECHANISMS[0].implementationState, 'SCREENING');
  assert.equal(VIBRATION_INTEGRITY_MECHANISMS[1].implementationState, 'CANDIDATE_MASTER');
  assert.equal(VIBRATION_INTEGRITY_MECHANISMS.at(-1).implementationState, 'CANDIDATE_USER_INPUT');
});

test('FIT screening survives generic contracts while Mechanical/SBC without data remain input-required', () => {
  const target = row();
  const fit = buildVibrationMechanismAssessment(target, 'fit', { resultState: 'CURRENT_RESULT' });
  const mechanical = buildVibrationMechanismAssessment(target, 'mechanicalExcitation');
  const sbc = buildVibrationMechanismAssessment(target, 'smallBoreConnections');
  const aiv = buildVibrationMechanismAssessment(target, 'aiv');
  assert.equal(fit.calculated, true);
  assert.equal(fit.assessmentState, 'CALCULATED_SCREENING');
  assert.equal(fit.implementationState, 'IMPLEMENTED_SCREENING');
  assert.equal(fit.qualificationState, 'SCREENING');
  assert.equal(mechanical.calculated, false);
  assert.equal(mechanical.assessmentState, 'APPLICABILITY_UNKNOWN');
  assert.equal(mechanical.implementationState, 'IMPLEMENTED_CANDIDATE_MASTER');
  assert.equal(mechanical.facilityScopeId, 'MECHANICAL-FACILITY/L-100/NORMAL/CAN-1');
  assert.deepEqual(mechanical.readiness.missing, ['MECHANICAL_T23_EQUIPMENT_SOURCE_SELECTION']);
  assert.equal(sbc.calculated, false);
  assert.equal(sbc.assessmentState, 'APPLICABILITY_UNKNOWN');
  assert.equal(sbc.implementationState, 'IMPLEMENTED_CANDIDATE_USER_INPUT');
  assert.equal(aiv.assessmentState, 'NOT_IMPLEMENTED');
  assert.deepEqual(aiv.contractSet.cardinality, { count: 0, kind: 'ZERO' });
});

test('master-backed Mechanical candidate participates only in candidate governing', () => {
  const target = row();
  const matrix = buildVibrationMechanismMatrixRow(target, {
    resultState: 'CURRENT_RESULT', ...mechanicalContext(target),
  });
  const mechanical = matrix.assessments.find((item) => item.mechanism.id === 'mechanicalExcitation');
  assert.equal(mechanical.calculated, true);
  assert.equal(mechanical.assessmentState, 'CALCULATED_CANDIDATE');
  assert.equal(mechanical.lof, 0.4);
  assert.equal(mechanical.qualificationState, 'CANDIDATE_MASTER');
  assert.equal(mechanical.contractSet.items[0].qualification.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(matrix.screeningGoverning.mechanism.id, 'fit');
  assert.equal(matrix.screeningGoverning.lof, 0.34);
  assert.equal(matrix.candidateGoverning.mechanism.id, 'mechanicalExcitation');
  assert.equal(matrix.candidateGoverning.lof, 0.4);
});

test('higher SBC candidate can govern candidate tier but cannot replace FIT screening', () => {
  const target = row();
  const matrix = buildVibrationMechanismMatrixRow(target, {
    resultState: 'CURRENT_RESULT',
    userEngineeringDataRows: sbcRows(target),
    ...mechanicalContext(target),
  });
  assert.equal(matrix.screeningGoverning.mechanism.id, 'fit');
  assert.equal(matrix.screeningGoverning.lof, 0.34);
  assert.equal(matrix.candidateGoverning.mechanism.id, 'smallBoreConnections');
  assert.equal(matrix.candidateGoverning.lof, 0.7);
  assert.equal(matrix.implementedGoverning.mechanism.id, 'fit');
  assert.equal(matrix.fullScreeningGoverningEstablished, false);
});

test('wrong-scope Mechanical cache fails closed and cannot create candidate governing', () => {
  const target = row();
  const scopeId = mechanicalFacilityScopeId(target);
  const wrong = mechanicalCandidate(target, 0.9, 'MECHANICAL-FACILITY/OTHER/NORMAL/CAN-9');
  const matrix = buildVibrationMechanismMatrixRow(target, {
    resultState: 'CURRENT_RESULT',
    mechanicalSourceKeysByScope: { [scopeId]: ['ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW'] },
    mechanicalCandidateResultsByScope: { [scopeId]: wrong },
  });
  const mechanical = matrix.assessments.find((item) => item.mechanism.id === 'mechanicalExcitation');
  assert.equal(mechanical.calculated, false);
  assert.equal(mechanical.assessmentState, 'APPLICABLE_INCOMPLETE');
  assert.deepEqual(mechanical.readiness.invalid, ['FACILITY_SCOPE_MISMATCH']);
  assert.equal(matrix.candidateGoverning, null);
  assert.equal(matrix.screeningGoverning.mechanism.id, 'fit');
});

test('stale facility state excludes screening and Mechanical candidate values from current governing', () => {
  const target = row();
  const matrix = buildVibrationMechanismMatrixRow(target, {
    resultState: 'STALE_RESULT', ...mechanicalContext(target),
  });
  assert.equal(matrix.screeningGoverning, null);
  assert.equal(matrix.candidateGoverning, null);
  assert.equal(matrix.implementedGoverning, null);
  assert.equal(matrix.retainedScreeningGoverning.mechanism.id, 'fit');
  assert.equal(matrix.retainedCandidateGoverning.mechanism.id, 'mechanicalExcitation');
  assert.equal(matrix.retainedCandidateGoverning.resultState, 'STALE_RESULT');
  assert.equal(matrix.fullScreeningGoverningEstablished, false);
});

test('incomplete SBC data remains fail-closed and does not create a candidate governing value', () => {
  const target = row();
  const rows = sbcRows(target).filter((item) => item.blockerId !== SBC_TYPE3_BLOCKERS.figureT34);
  const matrix = buildVibrationMechanismMatrixRow(target, {
    resultState: 'CURRENT_RESULT', userEngineeringDataRows: rows,
  });
  const sbc = matrix.assessments.find((item) => item.mechanism.id === 'smallBoreConnections');
  assert.equal(sbc.calculated, false);
  assert.equal(sbc.assessmentState, 'APPLICABLE_INCOMPLETE');
  assert.ok(sbc.readiness.missing.includes('LOFGEOM(G)'));
  assert.equal(matrix.candidateGoverning, null);
  assert.equal(matrix.screeningGoverning.mechanism.id, 'fit');
});

test('unknown mechanisms fail closed', () => {
  assert.throws(
    () => buildVibrationMechanismAssessment(row(), 'not-a-mechanism'),
    /Unknown vibration mechanism/u,
  );
});
