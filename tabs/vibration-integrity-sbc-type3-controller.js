import { calculateSbcType3MasterAssistedCandidate } from '../converters/vibration/sbc/type3-master-assisted-candidate.js?v=20260815-sbc-pf05-cache-1';
import { deriveSbcType3MasterAssistedInputs } from '../converters/vibration/sbc/type3-master-assisted-derivation.js?v=20260815-sbc-pf05-cache-1';
import {
  SBC_TYPE3_ENGINEERING_CHANGE_KINDS,
  beginSbcType3CandidateEvaluation,
  commitSbcType3CandidateEvaluation,
  failSbcType3CandidateEvaluation,
} from './vibration-integrity-sbc-candidate-currentness.js?v=20260815-sbc-pf05-cache-1';
import {
  addVibrationUserEngineeringDataRow,
  deleteVibrationUserEngineeringDataRow,
  vibrationUserEngineeringDataResolverRows,
} from './vibration-integrity-user-data-model.js';
import {
  deleteSbcType3StateKey,
  invalidateSbcType3Scope,
  isSbcType3CurveEvidenceRow,
  sbcType3ScopeRevision,
  syncVisibleSbcType3Result,
  visibleSbcType3Result,
} from './vibration-integrity-sbc-type3-state.js?v=20260815-sbc-pf05-cache-1';

const PHYSICAL = SBC_TYPE3_ENGINEERING_CHANGE_KINDS.physicalInput;

function scopeId(value) {
  const scope = String(value ?? '').trim();
  if (!scope) throw new Error('Enter or open an SBC facility scope first.');
  return scope;
}

function normalizedPhysical(state, scope) {
  const raw = state.sbcType3PhysicalByScope?.[scope] ?? {};
  const mass = String(raw.firstSpanHasUnsupportedMass ?? '').trim().toUpperCase();
  return {
    ...raw,
    firstSpanHasUnsupportedMass: mass === 'TRUE' ? true : mass === 'FALSE' ? false : undefined,
  };
}

export function openSbcType3FacilityScope(state, scopeValue, render, audit) {
  const scope = scopeId(scopeValue);
  state.workspaceTab = 'user-data';
  state.sbcType3ScopeId = scope;
  state.sbcType3Result = visibleSbcType3Result(state, scope);
  state.error = null;
  audit?.('SBC_INPUTS_OPENED', { mode: 'MASTER_ASSISTED' }, scope);
  render?.();
}

function updatePhysical(state, scope, field, value) {
  const current = state.sbcType3PhysicalByScope?.[scope] ?? {};
  state.sbcType3PhysicalByScope = {
    ...state.sbcType3PhysicalByScope,
    [scope]: { ...current, [field]: value },
  };
  state.sbcType3DerivationByScope = deleteSbcType3StateKey(state.sbcType3DerivationByScope, scope);
  invalidateSbcType3Scope(state, scope, PHYSICAL);
}

function updateMainline(state, scope, value) {
  state.sbcType3MainlineByScope = { ...state.sbcType3MainlineByScope, [scope]: value };
  state.sbcType3DerivationByScope = deleteSbcType3StateKey(state.sbcType3DerivationByScope, scope);
  invalidateSbcType3Scope(state, scope, PHYSICAL);
}

function removeCurveRows(table, scope) {
  let next = table;
  for (let index = next.rows.length - 1; index >= 0; index -= 1) {
    const row = next.rows[index];
    if (row.scopeId === scope && isSbcType3CurveEvidenceRow(row)) {
      next = deleteVibrationUserEngineeringDataRow(next, index);
    }
  }
  return next;
}

function addCurveRequests(table, requests) {
  return requests.reduce((next, request) => addVibrationUserEngineeringDataRow(next, request), table);
}

function preparationToken(state, scope, revision) {
  const sequence = state.sbcType3PreparationSequence + 1;
  state.sbcType3PreparationSequence = sequence;
  const token = `SBC-T3-PREP/${encodeURIComponent(scope)}/${revision}/${sequence}`;
  state.sbcType3PreparationTokenByScope = {
    ...state.sbcType3PreparationTokenByScope, [scope]: token,
  };
  return token;
}

function preparationIsCurrent(state, scope, revision, token) {
  return sbcType3ScopeRevision(state, scope) === revision
    && state.sbcType3PreparationTokenByScope?.[scope] === token;
}

export async function prepareSbcType3CurveEvidence(
  state, render, audit, derive = deriveSbcType3MasterAssistedInputs,
) {
  const scope = scopeId(state.sbcType3ScopeId);
  const revision = sbcType3ScopeRevision(state, scope);
  const token = preparationToken(state, scope, revision);
  state.error = null;
  render?.();
  const derivation = await derive({
    scopeId: scope,
    physical: normalizedPhysical(state, scope),
    mainlineLof: state.sbcType3MainlineByScope?.[scope] ?? null,
  });
  if (!preparationIsCurrent(state, scope, revision, token)) return false;
  state.sbcType3DerivationByScope = { ...state.sbcType3DerivationByScope, [scope]: derivation };
  if (!derivation.ok) {
    state.error = derivation.problems?.[0]?.reason ?? 'SBC_T3_PHYSICAL_INPUT_NOT_READY';
    render?.();
    return false;
  }
  const before = state.userEngineeringData;
  state.userEngineeringData = addCurveRequests(removeCurveRows(before, scope), derivation.curveRequests);
  invalidateSbcType3Scope(state, scope, SBC_TYPE3_ENGINEERING_CHANGE_KINDS.manualCurveEvidence);
  audit?.('USER_DATA_CHANGED', { action: 'SBC_EXACT_CURVE_ROWS_PREPARED' }, scope);
  state.error = null;
  render?.();
  return true;
}

function setBusy(state, scope, token) {
  state.sbcType3BusyTokenByScope = { ...state.sbcType3BusyTokenByScope, [scope]: token };
}

function clearBusy(state, scope, token) {
  if (state.sbcType3BusyTokenByScope?.[scope] !== token) return;
  state.sbcType3BusyTokenByScope = deleteSbcType3StateKey(state.sbcType3BusyTokenByScope, scope);
}

function commitAcceptedCandidate(state, scope, result, completed) {
  state.sbcType3CurrentnessStore = completed.store;
  state.sbcFacilityCandidateResults = { ...state.sbcFacilityCandidateResults, [scope]: result };
  state.sbcType3LastEvaluationByScope = { ...state.sbcType3LastEvaluationByScope, [scope]: result };
  syncVisibleSbcType3Result(state, scope);
}

function commitNotReady(state, scope, operation, result) {
  const failed = failSbcType3CandidateEvaluation(
    state.sbcType3CurrentnessStore, operation, result.problems?.[0]?.reason ?? result.status,
  );
  state.sbcType3CurrentnessStore = failed.store;
  if (!failed.handled) return false;
  state.sbcFacilityCandidateResults = deleteSbcType3StateKey(state.sbcFacilityCandidateResults, scope);
  state.sbcType3LastEvaluationByScope = { ...state.sbcType3LastEvaluationByScope, [scope]: result };
  syncVisibleSbcType3Result(state, scope);
  return true;
}

export async function evaluateSbcType3MasterAssisted(
  state, render, audit, calculate = calculateSbcType3MasterAssistedCandidate,
) {
  const scope = scopeId(state.sbcType3ScopeId);
  const started = beginSbcType3CandidateEvaluation(state.sbcType3CurrentnessStore, scope);
  state.sbcType3CurrentnessStore = started.store;
  setBusy(state, scope, started.operation.token);
  state.error = null;
  render?.();
  try {
    const result = await calculate({
      scopeId: scope,
      physical: normalizedPhysical(state, scope),
      mainlineLof: state.sbcType3MainlineByScope?.[scope] ?? null,
      userRows: vibrationUserEngineeringDataResolverRows(state.userEngineeringData),
    });
    if (!result.ok) return commitNotReady(state, scope, started.operation, result);
    const completed = commitSbcType3CandidateEvaluation(
      state.sbcType3CurrentnessStore, started.operation, result,
    );
    if (!completed.accepted) return false;
    commitAcceptedCandidate(state, scope, result, completed);
    audit?.('SBC_TYPE3_EVALUATED', { status: result.status, lof: result.lof }, scope);
    return true;
  } catch (error) {
    const failed = failSbcType3CandidateEvaluation(
      state.sbcType3CurrentnessStore, started.operation, String(error?.message || error),
    );
    state.sbcType3CurrentnessStore = failed.store;
    if (failed.handled) state.error = String(error?.message || error);
    return false;
  } finally {
    clearBusy(state, scope, started.operation.token);
    render?.();
  }
}

export function handleSbcType3Click(state, event, render, audit) {
  const facilityScope = event.target.closest('[data-vi-sbc-facility-scope]')?.dataset.viSbcFacilityScope;
  if (facilityScope) {
    openSbcType3FacilityScope(state, facilityScope, render, audit);
    return true;
  }
  if (event.target.closest('[data-vi-sbc-master-template]')) {
    void prepareSbcType3CurveEvidence(state, render, audit);
    return true;
  }
  if (event.target.closest('[data-vi-sbc-master-evaluate]')) {
    void evaluateSbcType3MasterAssisted(state, render, audit);
    return true;
  }
  return false;
}

export function handleSbcType3Change(state, event, render, audit) {
  if (event.target.matches('[data-vi-sbc-type3-scope]')) {
    state.sbcType3ScopeId = event.target.value;
    const scope = String(event.target.value).trim();
    if (scope) state.sbcType3Result = visibleSbcType3Result(state, scope);
    state.error = null;
    render?.();
    return true;
  }
  const field = event.target.dataset.viSbcMasterPhysical;
  if (field) {
    const scope = scopeId(state.sbcType3ScopeId);
    updatePhysical(state, scope, field, event.target.value);
    audit?.('USER_DATA_CHANGED', { action: 'SBC_PHYSICAL_INPUT_CHANGED', field }, scope);
    state.error = null;
    render?.();
    return true;
  }
  if (!event.target.matches('[data-vi-sbc-master-mainline]')) return false;
  const scope = scopeId(state.sbcType3ScopeId);
  updateMainline(state, scope, event.target.value);
  audit?.('USER_DATA_CHANGED', { action: 'SBC_MAINLINE_INPUT_CHANGED' }, scope);
  state.error = null;
  render?.();
  return true;
}
