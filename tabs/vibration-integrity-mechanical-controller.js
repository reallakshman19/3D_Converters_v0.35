import {
  evaluateMechanicalFacilityCandidate,
  mechanicalFacilityScopeId,
} from '../converters/vibration/mechanical/facility.js';

export function createMechanicalFacilityUiState() {
  return {
    mechanicalFacilityScopeId: '',
    mechanicalSourceKeysByScope: {},
    mechanicalNotApplicableByScope: {},
    mechanicalCandidateResultsByScope: {},
    mechanicalPendingByScope: {},
    mechanicalEvaluationSequence: 0,
  };
}

function sourceKeys(state, scopeId) {
  return state.mechanicalSourceKeysByScope?.[scopeId] ?? [];
}

function candidateRow(state, scopeId) {
  const rows = state.workspace?.rows ?? [];
  return rows.find((row) => mechanicalFacilityScopeId(row) === scopeId) ?? null;
}

function invalidateResult(state, scopeId) {
  const results = { ...state.mechanicalCandidateResultsByScope };
  delete results[scopeId];
  state.mechanicalCandidateResultsByScope = results;
  const pending = { ...state.mechanicalPendingByScope };
  delete pending[scopeId];
  state.mechanicalPendingByScope = pending;
}

function setSourceKeys(state, scopeId, keys) {
  state.mechanicalSourceKeysByScope = {
    ...state.mechanicalSourceKeysByScope,
    [scopeId]: Object.freeze([...keys]),
  };
  invalidateResult(state, scopeId);
}

function setNotApplicable(state, scopeId, value) {
  state.mechanicalNotApplicableByScope = {
    ...state.mechanicalNotApplicableByScope,
    [scopeId]: Boolean(value),
  };
  if (value) state.mechanicalSourceKeysByScope = { ...state.mechanicalSourceKeysByScope, [scopeId]: [] };
  invalidateResult(state, scopeId);
}

export function openMechanicalFacilityInputs(state, scopeId, render, audit) {
  state.workspaceTab = 'mechanical';
  state.mechanicalFacilityScopeId = String(scopeId ?? '').trim();
  state.error = null;
  audit?.('MECHANICAL_INPUTS_OPENED', {}, state.mechanicalFacilityScopeId || null);
  render();
}

function clearMechanicalFacilityInputs(state, render, audit) {
  const scopeId = state.mechanicalFacilityScopeId;
  if (!scopeId) return;
  setSourceKeys(state, scopeId, []);
  setNotApplicable(state, scopeId, false);
  state.error = null;
  audit?.('MECHANICAL_INPUTS_CLEARED', {}, scopeId);
  render();
}

function commitEvaluation(state, scopeId, token, result, render, audit) {
  if (state.mechanicalPendingByScope?.[scopeId] !== token) return;
  state.mechanicalCandidateResultsByScope = {
    ...state.mechanicalCandidateResultsByScope,
    [scopeId]: result,
  };
  const pending = { ...state.mechanicalPendingByScope };
  delete pending[scopeId];
  state.mechanicalPendingByScope = pending;
  state.error = null;
  audit?.('MECHANICAL_EVALUATED', {
    governingLof: result.governingLof,
    governingSourceKey: result.governingSourceKey,
  }, scopeId);
  render();
}

function failEvaluation(state, scopeId, token, error, render, audit) {
  if (state.mechanicalPendingByScope?.[scopeId] !== token) return;
  const pending = { ...state.mechanicalPendingByScope };
  delete pending[scopeId];
  state.mechanicalPendingByScope = pending;
  state.error = String(error?.message || error);
  audit?.('MECHANICAL_EVALUATION_FAILED', { error: state.error.slice(0, 500) }, scopeId);
  render();
}

function evaluateMechanicalInputs(state, render, audit) {
  const scopeId = state.mechanicalFacilityScopeId;
  const row = candidateRow(state, scopeId);
  const keys = [...sourceKeys(state, scopeId)];
  if (!row || state.mechanicalNotApplicableByScope?.[scopeId]) {
    state.error = !row
      ? 'Mechanical facility scope is not available in the current facility register.'
      : 'Mechanical T2.3 is explicitly marked not applicable for this facility scope.';
    render();
    return;
  }
  invalidateResult(state, scopeId);
  const token = state.mechanicalEvaluationSequence + 1;
  state.mechanicalEvaluationSequence = token;
  state.mechanicalPendingByScope = { ...state.mechanicalPendingByScope, [scopeId]: token };
  state.error = null;
  audit?.('MECHANICAL_EVALUATION_STARTED', { sourceKeys: keys }, scopeId);
  render();
  evaluateMechanicalFacilityCandidate(row, keys)
    .then((result) => commitEvaluation(state, scopeId, token, result, render, audit))
    .catch((error) => failEvaluation(state, scopeId, token, error, render, audit));
}

export function handleMechanicalFacilityClick(state, event, render, audit) {
  const scopeId = event.target.closest('[data-vi-mechanical-facility-scope]')
    ?.dataset.viMechanicalFacilityScope;
  if (scopeId) {
    openMechanicalFacilityInputs(state, scopeId, render, audit);
    return true;
  }
  if (event.target.closest('[data-vi-mechanical-evaluate]')) {
    evaluateMechanicalInputs(state, render, audit);
    return true;
  }
  if (event.target.closest('[data-vi-mechanical-clear]')) {
    clearMechanicalFacilityInputs(state, render, audit);
    return true;
  }
  return false;
}

export function handleMechanicalFacilityChange(state, event, render, audit) {
  const scopeId = state.mechanicalFacilityScopeId;
  if (event.target.matches('[data-vi-mechanical-not-applicable]')) {
    if (scopeId) setNotApplicable(state, scopeId, event.target.checked);
    state.error = null;
    if (scopeId) audit?.('MECHANICAL_NOT_APPLICABLE', { value: event.target.checked }, scopeId);
    render();
    return true;
  }
  const sourceKey = event.target.dataset.viMechanicalSource;
  if (!sourceKey) return false;
  if (!scopeId) return true;
  const selected = new Set(sourceKeys(state, scopeId));
  if (event.target.checked) selected.add(sourceKey);
  else selected.delete(sourceKey);
  state.mechanicalNotApplicableByScope = { ...state.mechanicalNotApplicableByScope, [scopeId]: false };
  setSourceKeys(state, scopeId, [...selected]);
  state.error = null;
  audit?.('MECHANICAL_SOURCES_CHANGED', { sourceKey, selected: event.target.checked }, scopeId);
  render();
  return true;
}
