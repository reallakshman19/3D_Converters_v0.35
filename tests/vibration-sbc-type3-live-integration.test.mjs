import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSbcFacilityType3, sbcFacilityScopeId } from '../converters/vibration/sbc/facility.js';
import { buildVibrationMechanismMatrixRow } from '../tabs/vibration-integrity-mechanisms.js';
import {
  evaluateSbcType3MasterAssisted,
  handleSbcType3Change,
  openSbcType3FacilityScope,
} from '../tabs/vibration-integrity-sbc-type3-controller.js';
import {
  createSbcType3UiState,
  recordSbcType3UserDataTableMutation,
} from '../tabs/vibration-integrity-sbc-type3-state.js';
import { renderSbcType3UserInputPanel } from '../tabs/vibration-integrity-sbc-type3-view.js';
import { createVibrationUserEngineeringDataTable } from '../tabs/vibration-integrity-user-data-model.js';

function facilityRow() {
  return {
    line: 'L-100', caseId: 'NORMAL', canonicalId: 'CAN-1',
    standardLof: 0.34, governingReferenceLof: 0.34,
    referenceBand: 'LOF_0_3_TO_LT_0_5', qualificationState: 'SCREENING',
  };
}

function candidate(scopeId, lof = 0.7) {
  return Object.freeze({
    ok: true,
    status: 'CALCULATED_MASTER_ASSISTED_CANDIDATE',
    methodId: 'VIB.SBC.T3.TYPE3.MASTER_ASSISTED_CANDIDATE',
    scopeId,
    lof,
    firstSpan: Object.freeze({ c: 0.68, d: 0.2, e: 0.7, locationLof: 1, modifier: 0.7 }),
    subsequentSpans: Object.freeze({ f: 0.6, g: 0.2, modifier: 0.6 }),
    overallModifier: 0.7,
    mainline: Object.freeze({ lof: 1, multiplier: 1.42, adjustedLof: 1.42 }),
    authority: Object.freeze({
      engineeringAuthority: 'NONE', screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false, masterDataAuthority: false,
    }),
  });
}

function uiState(scopeId) {
  return {
    ...createSbcType3UiState(),
    workspaceTab: 'screening',
    userEngineeringData: createVibrationUserEngineeringDataTable(),
    error: null,
    sbcType3ScopeId: scopeId,
  };
}

function physicalChange(field, value) {
  return {
    target: {
      dataset: { viSbcMasterPhysical: field },
      value,
      matches: () => false,
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('PF-007 facility rejects a wrong-scope precomputed candidate', () => {
  const row = facilityRow();
  const scopeId = sbcFacilityScopeId(row);
  const result = evaluateSbcFacilityType3(row, {
    precomputedCandidate: candidate('SBC-FACILITY/L-200/NORMAL/CAN-2'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'INVALID_PRECOMPUTED_CANDIDATE');
  assert.equal(result.result.problems[0].reason, 'FACILITY_SCOPE_MISMATCH');
  assert.equal(result.scope.scopeId, scopeId);
});

test('PF-008 physical edit invalidates current candidate synchronously', async () => {
  const scopeId = 'SBC-FACILITY/L-100/NORMAL/CAN-1';
  const state = uiState(scopeId);
  await evaluateSbcType3MasterAssisted(state, null, null, async () => candidate(scopeId));
  assert.equal(state.sbcFacilityCandidateResults[scopeId].lof, 0.7);
  const revision = state.sbcType3CurrentnessStore.scopes[scopeId].engineeringRevision;
  handleSbcType3Change(state, physicalChange('branchLengthMm', '701'), null, null);
  assert.equal(state.sbcFacilityCandidateResults[scopeId], undefined);
  assert.equal(state.sbcType3CurrentnessStore.scopes[scopeId].engineeringRevision, revision + 1);
  assert.equal(state.sbcType3CurrentnessStore.scopes[scopeId].candidate.status, 'STALE');
});

test('PF-009 D/F/G table edit invalidates only the matching facility scope', async () => {
  const scopeA = 'SBC-FACILITY/L-100/NORMAL/CAN-1';
  const scopeB = 'SBC-FACILITY/L-200/NORMAL/CAN-2';
  const state = uiState(scopeA);
  await evaluateSbcType3MasterAssisted(state, null, null, async () => candidate(scopeA));
  openSbcType3FacilityScope(state, scopeB, null, null);
  await evaluateSbcType3MasterAssisted(state, null, null, async () => candidate(scopeB));
  const before = createVibrationUserEngineeringDataTable([{
    mechanismId: 'smallBoreConnections', recordKey: 'TYPE3', scopeId: scopeA,
    blockerId: 'EI_AVIFF.T3.SBC.FIGURE_T3_1', xValue: '1.5', xUnit: 'in',
    yValue: '1.2857142857142858', yUnit: 'm', value: '0.2', unit: '1',
    sourceReference: 'D7', notes: '',
  }]);
  const after = createVibrationUserEngineeringDataTable([{
    ...before.rows[0], value: '0.21',
  }]);
  recordSbcType3UserDataTableMutation(state, before, after);
  assert.equal(state.sbcFacilityCandidateResults[scopeA], undefined);
  assert.equal(state.sbcFacilityCandidateResults[scopeB].lof, 0.7);
});

test('PF-010 stale async completion cannot overwrite a newer physical edit', async () => {
  const scopeId = 'SBC-FACILITY/L-100/NORMAL/CAN-1';
  const state = uiState(scopeId);
  const pending = deferred();
  const evaluating = evaluateSbcType3MasterAssisted(state, null, null, () => pending.promise);
  handleSbcType3Change(state, physicalChange('branchLengthMm', '702'), null, null);
  pending.resolve(candidate(scopeId));
  assert.equal(await evaluating, false);
  assert.equal(state.sbcFacilityCandidateResults[scopeId], undefined);
});

test('facility navigation does not invalidate engineering currentness', async () => {
  const scopeA = 'SBC-FACILITY/L-100/NORMAL/CAN-1';
  const scopeB = 'SBC-FACILITY/L-200/NORMAL/CAN-2';
  const state = uiState(scopeA);
  await evaluateSbcType3MasterAssisted(state, null, null, async () => candidate(scopeA));
  const revision = state.sbcType3CurrentnessStore.scopes[scopeA].engineeringRevision;
  openSbcType3FacilityScope(state, scopeB, null, null);
  openSbcType3FacilityScope(state, scopeA, null, null);
  assert.equal(state.sbcType3CurrentnessStore.scopes[scopeA].engineeringRevision, revision);
  assert.equal(state.sbcFacilityCandidateResults[scopeA].lof, 0.7);
});

test('PF-011 SBC can govern candidate tier but FIT remains screening governing', () => {
  const row = facilityRow();
  const scopeId = sbcFacilityScopeId(row);
  const matrix = buildVibrationMechanismMatrixRow(row, {
    resultState: 'CURRENT_RESULT',
    sbcCandidateResultsByScope: { [scopeId]: candidate(scopeId) },
  });
  assert.equal(matrix.screeningGoverning.mechanism.id, 'fit');
  assert.equal(matrix.screeningGoverning.lof, 0.34);
  assert.equal(matrix.candidateGoverning.mechanism.id, 'smallBoreConnections');
  assert.equal(matrix.candidateGoverning.lof, 0.7);
  assert.equal(matrix.implementedGoverning.mechanism.id, 'fit');
});

test('professional SBC panel exposes scope, quarantine and authority without hiding legacy fallback', () => {
  const scopeId = 'SBC-FACILITY/L-100/NORMAL/CAN-1';
  const html = renderSbcType3UserInputPanel(uiState(scopeId));
  assert.match(html, /Facility scope:/u);
  assert.match(html, /AUTO-DERIVED/u);
  assert.match(html, /MANUAL EXACT CURVE EVIDENCE REQUIRED|Prepare exact D\/F\/G evidence rows/u);
  assert.match(html, /NOT SCREENING AUTHORITY|Screening authority:.*NOT AUTHORIZED/us);
  assert.match(html, /Legacy explicit intermediate-input mode/u);
});
