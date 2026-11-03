import { SBC_TYPE3_BLOCKERS, SBC_TYPE3_RECORD_KEY } from '../converters/vibration/sbc/type3-user-data.js?v=20260815-sbc-pf05-cache-1';
import {
  SBC_TYPE3_ENGINEERING_CHANGE_KINDS,
  createSbcType3CandidateCurrentnessStore,
  readCurrentSbcType3Candidate,
  recordSbcType3EngineeringChange,
} from './vibration-integrity-sbc-candidate-currentness.js?v=20260815-sbc-pf05-cache-1';

const CURVE = SBC_TYPE3_ENGINEERING_CHANGE_KINDS.manualCurveEvidence;
const CURVE_BLOCKERS = new Set([
  SBC_TYPE3_BLOCKERS.figureT31,
  SBC_TYPE3_BLOCKERS.figureT32,
  SBC_TYPE3_BLOCKERS.figureT33,
  SBC_TYPE3_BLOCKERS.figureT34,
]);

function deleteKey(map, key) {
  const next = { ...(map ?? {}) };
  delete next[key];
  return next;
}

function relevantCurveRow(row) {
  return row?.mechanismId === 'smallBoreConnections'
    && row?.recordKey === SBC_TYPE3_RECORD_KEY
    && CURVE_BLOCKERS.has(row?.blockerId);
}

function curveSignature(table) {
  const grouped = {};
  (table?.rows ?? []).filter(relevantCurveRow).forEach((row) => {
    const scope = String(row.scopeId ?? '').trim();
    if (!scope) return;
    (grouped[scope] ??= []).push([
      row.blockerId, row.xValue, row.xUnit, row.yValue, row.yUnit,
      row.value, row.unit, row.sourceReference, row.notes,
    ].map((value) => String(value ?? '')).join('|'));
  });
  return Object.fromEntries(Object.entries(grouped)
    .map(([scope, values]) => [scope, values.sort().join('\n')]));
}

export function createSbcType3UiState() {
  return {
    sbcType3ScopeId: '',
    sbcType3PhysicalByScope: {},
    sbcType3MainlineByScope: {},
    sbcType3DerivationByScope: {},
    sbcType3LastEvaluationByScope: {},
    sbcType3CurrentnessStore: createSbcType3CandidateCurrentnessStore(),
    sbcFacilityCandidateResults: {},
    sbcType3BusyTokenByScope: {},
    sbcType3PreparationSequence: 0,
    sbcType3PreparationTokenByScope: {},
    sbcType3Result: null,
  };
}

export function sbcType3ScopeRevision(state, scope) {
  return state.sbcType3CurrentnessStore?.scopes?.[scope]?.engineeringRevision ?? 0;
}

export function currentSbcType3Result(state, scope) {
  const current = readCurrentSbcType3Candidate(state.sbcType3CurrentnessStore, scope);
  return current.current ? current.result : null;
}

export function visibleSbcType3Result(state, scope) {
  return currentSbcType3Result(state, scope)
    ?? state.sbcType3LastEvaluationByScope?.[scope]
    ?? null;
}

export function syncVisibleSbcType3Result(state, scope) {
  if (state.sbcType3ScopeId === scope) state.sbcType3Result = visibleSbcType3Result(state, scope);
}

export function invalidateSbcType3Scope(state, scope, kind) {
  state.sbcType3CurrentnessStore = recordSbcType3EngineeringChange(
    state.sbcType3CurrentnessStore, scope, kind,
  );
  state.sbcFacilityCandidateResults = deleteKey(state.sbcFacilityCandidateResults, scope);
  state.sbcType3LastEvaluationByScope = deleteKey(state.sbcType3LastEvaluationByScope, scope);
  state.sbcType3BusyTokenByScope = deleteKey(state.sbcType3BusyTokenByScope, scope);
  syncVisibleSbcType3Result(state, scope);
}

export function recordSbcType3UserDataTableMutation(state, beforeTable, afterTable) {
  const before = curveSignature(beforeTable);
  const after = curveSignature(afterTable);
  const scopes = new Set([...Object.keys(before), ...Object.keys(after)]);
  scopes.forEach((scope) => {
    if ((before[scope] ?? '') !== (after[scope] ?? '')) invalidateSbcType3Scope(state, scope, CURVE);
  });
}

export function deleteSbcType3StateKey(map, key) {
  return deleteKey(map, key);
}

export function isSbcType3CurveEvidenceRow(row) {
  return relevantCurveRow(row);
}
