import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  evaluateSbcFacilityType3,
  sbcFacilityScopeId,
} from '../converters/vibration/sbc/facility.js';
import { SBC_TYPE3_BLOCKERS } from '../converters/vibration/sbc/type3-user-data.js';
import { handleVibrationUserDataClick } from '../tabs/vibration-integrity-user-data-shell.js';

const viewSource = readFileSync(new URL('../tabs/vibration-integrity-view.js', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../tabs/vibration-integrity-user-data-shell.js', import.meta.url), 'utf8');

function facilityRow() {
  return { line: 'L 100/A', caseId: 'RELIEF CASE', canonicalId: 'CAN/01' };
}

function inputRow(scopeId, blockerId, value) {
  return {
    mechanismId: 'smallBoreConnections', blockerId, scopeId, recordKey: 'TYPE3',
    xValue: '', xUnit: '', yValue: '', yUnit: '', value: String(value), unit: '1',
    sourceReference: 'Independent facility test', notes: '',
  };
}

function completeRows(row = facilityRow()) {
  const scopeId = sbcFacilityScopeId(row);
  return [
    inputRow(scopeId, SBC_TYPE3_BLOCKERS.mainlineLof, 1),
    inputRow(scopeId, SBC_TYPE3_BLOCKERS.mainlineMultiplier, 1.42),
    inputRow(scopeId, SBC_TYPE3_BLOCKERS.firstHasMass, 'TRUE'),
    inputRow(scopeId, SBC_TYPE3_BLOCKERS.firstMassGeometryLof, 0.4),
    inputRow(scopeId, SBC_TYPE3_BLOCKERS.figureT31, 0.2),
    inputRow(scopeId, SBC_TYPE3_BLOCKERS.firstMinimumSpanLof, 0.7),
    inputRow(scopeId, SBC_TYPE3_BLOCKERS.firstLocationLof, 1),
    inputRow(scopeId, SBC_TYPE3_BLOCKERS.figureT33, 0.6),
    inputRow(scopeId, SBC_TYPE3_BLOCKERS.figureT34, 0.2),
  ];
}

test('facility SBC scope is deterministic and URL-safe across line/case/canonical identity', () => {
  assert.equal(
    sbcFacilityScopeId(facilityRow()),
    'SBC-FACILITY/L%20100%2FA/RELIEF%20CASE/CAN%2F01',
  );
  assert.equal(
    sbcFacilityScopeId({ line: 'L-1', caseId: null, canonicalId: 'C-1' }),
    'SBC-FACILITY/L-1/-/C-1',
  );
});

test('facility evaluator requires exact scoped user data and does not borrow another row scope', () => {
  const target = facilityRow();
  const noData = evaluateSbcFacilityType3(target, { userRows: completeRows({
    line: 'OTHER', caseId: 'RELIEF CASE', canonicalId: 'CAN/01',
  }) });
  assert.equal(noData.status, 'INPUT_REQUIRED');
  assert.equal(noData.ok, false);
  assert.equal(noData.authority.screeningAuthority, 'NOT_AUTHORIZED');
});

test('facility evaluator reuses the existing Type-3 candidate arithmetic unchanged', () => {
  const target = facilityRow();
  const evaluated = evaluateSbcFacilityType3(target, { userRows: completeRows(target) });
  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.result.lof, 0.7);
  assert.equal(evaluated.result.firstSpan.modifier, 0.7);
  assert.equal(evaluated.result.subsequentSpans.modifier, 0.6);
  assert.equal(evaluated.result.authority.engineeringAuthority, 'NONE');
  assert.equal(evaluated.result.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(evaluated.result.authority.designAuthority, false);
});

test('facility SBC matrix action opens the existing User Engineering Data tab with exact scope', () => {
  const scopeId = 'SBC-FACILITY/L-100/NORMAL/CAN-1';
  const state = {
    workspaceTab: 'screening', sbcType3ScopeId: '', sbcType3Result: { ok: true }, error: 'old',
  };
  let renders = 0;
  const event = {
    target: {
      closest(selector) {
        return selector === '[data-vi-sbc-facility-scope]'
          ? { dataset: { viSbcFacilityScope: scopeId } }
          : null;
      },
    },
  };
  assert.equal(handleVibrationUserDataClick(state, event, () => { renders += 1; }), true);
  assert.equal(state.workspaceTab, 'user-data');
  assert.equal(state.sbcType3ScopeId, scopeId);
  assert.equal(state.sbcType3Result, null);
  assert.equal(state.error, null);
  assert.equal(renders, 1);
});

test('facility matrix exposes SBC input navigation and separate authority columns', () => {
  assert.match(viewSource, /data-vi-sbc-facility-scope/u);
  assert.match(viewSource, /userEngineeringDataRows/u);
  assert.match(viewSource, /Screening governing/u);
  assert.match(viewSource, /Candidate governing/u);
  assert.match(viewSource, /SBC CANDIDATE/u);
  assert.match(shellSource, /openFacilitySbcInputs/u);
  assert.match(shellSource, /state\.workspaceTab = 'user-data'/u);
  assert.match(shellSource, /state\.sbcType3ScopeId = scopeId/u);
});
