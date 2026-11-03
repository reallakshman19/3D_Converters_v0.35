export const SBC_TYPE3_CANDIDATE_CURRENTNESS_SCHEMA =
  'SbcType3CandidateCurrentnessStore.v1';

export const SBC_TYPE3_ENGINEERING_CHANGE_KINDS = Object.freeze({
  physicalInput: 'PHYSICAL_INPUT',
  manualCurveEvidence: 'MANUAL_CURVE_EVIDENCE',
});

const CURRENT = 'CURRENT';
const STALE = 'STALE';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cloneJson(value, path = 'candidate') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`SBC_T3_CANDIDATE_NONFINITE: ${path}`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => cloneJson(item, `${path}[${index}]`));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value)
      .map(([key, child]) => [key, cloneJson(child, `${path}.${key}`)]));
  }
  throw new TypeError(`SBC_T3_CANDIDATE_JSON_VALUE_INVALID: ${path}`);
}

function requireScopeId(value) {
  const scopeId = String(value ?? '').trim();
  if (!scopeId) throw new TypeError('SBC_T3_SCOPE_ID_REQUIRED');
  return scopeId;
}

function requireStore(store) {
  if (store?.schema !== SBC_TYPE3_CANDIDATE_CURRENTNESS_SCHEMA
    || !Number.isInteger(store.evaluationSequence)
    || store.evaluationSequence < 0
    || !store.scopes
    || typeof store.scopes !== 'object'
    || Array.isArray(store.scopes)) {
    throw new TypeError('SBC_T3_CANDIDATE_CURRENTNESS_STORE_INVALID');
  }
  return store;
}

function emptyScope(scopeId) {
  return deepFreeze({
    scopeId,
    engineeringRevision: 0,
    candidate: null,
    pendingEvaluation: null,
    lastEngineeringChange: null,
    lastFailure: null,
  });
}

function scopeState(store, scopeId) {
  return store.scopes[scopeId] ?? emptyScope(scopeId);
}

function withScope(store, scopeId, nextScope, evaluationSequence = store.evaluationSequence) {
  return deepFreeze({
    schema: SBC_TYPE3_CANDIDATE_CURRENTNESS_SCHEMA,
    evaluationSequence,
    scopes: { ...store.scopes, [scopeId]: nextScope },
  });
}

export function createSbcType3CandidateCurrentnessStore() {
  return deepFreeze({
    schema: SBC_TYPE3_CANDIDATE_CURRENTNESS_SCHEMA,
    evaluationSequence: 0,
    scopes: {},
  });
}

function requireEngineeringChangeKind(kind) {
  const allowed = Object.values(SBC_TYPE3_ENGINEERING_CHANGE_KINDS);
  if (!allowed.includes(kind)) throw new TypeError('SBC_T3_ENGINEERING_CHANGE_KIND_INVALID');
  return kind;
}

export function recordSbcType3EngineeringChange(store, scopeIdValue, kindValue) {
  requireStore(store);
  const scopeId = requireScopeId(scopeIdValue);
  const kind = requireEngineeringChangeKind(kindValue);
  const current = scopeState(store, scopeId);
  const engineeringRevision = current.engineeringRevision + 1;
  const candidate = current.candidate
    ? deepFreeze({
      ...current.candidate,
      status: STALE,
      staleReason: kind,
      staleAtEngineeringRevision: engineeringRevision,
    })
    : null;
  return withScope(store, scopeId, deepFreeze({
    ...current,
    engineeringRevision,
    candidate,
    pendingEvaluation: null,
    lastEngineeringChange: deepFreeze({ kind, engineeringRevision }),
    lastFailure: null,
  }));
}

export function recordSbcType3PresentationChange(store) {
  requireStore(store);
  return store;
}

function operationToken(scopeId, revision, sequence) {
  return `SBC-T3-EVAL/${encodeURIComponent(scopeId)}/${revision}/${sequence}`;
}

export function beginSbcType3CandidateEvaluation(store, scopeIdValue) {
  requireStore(store);
  const scopeId = requireScopeId(scopeIdValue);
  const current = scopeState(store, scopeId);
  const sequence = store.evaluationSequence + 1;
  const operation = deepFreeze({
    schema: 'SbcType3CandidateEvaluationOperation.v1',
    scopeId,
    engineeringRevision: current.engineeringRevision,
    sequence,
    token: operationToken(scopeId, current.engineeringRevision, sequence),
  });
  const nextStore = withScope(store, scopeId, deepFreeze({
    ...current,
    pendingEvaluation: operation,
    lastFailure: null,
  }), sequence);
  return deepFreeze({ store: nextStore, operation });
}

function operationMatch(store, operation) {
  const scopeId = requireScopeId(operation?.scopeId);
  const current = scopeState(store, scopeId);
  const pending = current.pendingEvaluation;
  if (!pending) return { ok: false, scopeId, current, reason: 'NO_MATCHING_PENDING_EVALUATION' };
  if (pending.token !== operation.token) return { ok: false, scopeId, current, reason: 'EVALUATION_TOKEN_MISMATCH' };
  if (current.engineeringRevision !== operation.engineeringRevision) {
    return { ok: false, scopeId, current, reason: 'ENGINEERING_REVISION_MISMATCH' };
  }
  return { ok: true, scopeId, current };
}

export function commitSbcType3CandidateEvaluation(store, operation, candidateValue) {
  requireStore(store);
  const match = operationMatch(store, operation);
  if (!match.ok) return deepFreeze({ store, accepted: false, reason: match.reason });
  const candidate = cloneJson(candidateValue);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('SBC_T3_CANDIDATE_RESULT_REQUIRED');
  }
  if (requireScopeId(candidate.scopeId) !== match.scopeId) {
    return deepFreeze({ store, accepted: false, reason: 'CANDIDATE_SCOPE_MISMATCH' });
  }
  const record = deepFreeze({
    status: CURRENT,
    scopeId: match.scopeId,
    engineeringRevision: operation.engineeringRevision,
    evaluationToken: operation.token,
    result: candidate,
    staleReason: null,
    staleAtEngineeringRevision: null,
  });
  const nextStore = withScope(store, match.scopeId, deepFreeze({
    ...match.current,
    candidate: record,
    pendingEvaluation: null,
    lastFailure: null,
  }));
  return deepFreeze({ store: nextStore, accepted: true, reason: null });
}

export function failSbcType3CandidateEvaluation(store, operation, errorCodeValue) {
  requireStore(store);
  const match = operationMatch(store, operation);
  if (!match.ok) return deepFreeze({ store, handled: false, reason: match.reason });
  const errorCode = String(errorCodeValue ?? '').trim() || 'SBC_T3_EVALUATION_FAILED';
  const nextStore = withScope(store, match.scopeId, deepFreeze({
    ...match.current,
    pendingEvaluation: null,
    lastFailure: deepFreeze({
      errorCode,
      engineeringRevision: operation.engineeringRevision,
      evaluationToken: operation.token,
    }),
  }));
  return deepFreeze({ store: nextStore, handled: true, reason: null });
}

export function inspectSbcType3CandidateCurrentness(candidateRecord, expected = {}) {
  if (!candidateRecord) return deepFreeze({ current: false, reason: 'NO_CANDIDATE' });
  const scopeId = requireScopeId(expected.scopeId);
  if (candidateRecord.scopeId !== scopeId) {
    return deepFreeze({ current: false, reason: 'CANDIDATE_SCOPE_MISMATCH' });
  }
  if (candidateRecord.status !== CURRENT) {
    return deepFreeze({ current: false, reason: 'CANDIDATE_NOT_CURRENT' });
  }
  if (candidateRecord.engineeringRevision !== expected.engineeringRevision) {
    return deepFreeze({ current: false, reason: 'CANDIDATE_REVISION_MISMATCH' });
  }
  return deepFreeze({ current: true, reason: null, result: candidateRecord.result });
}

export function readCurrentSbcType3Candidate(store, scopeIdValue) {
  requireStore(store);
  const scopeId = requireScopeId(scopeIdValue);
  const current = scopeState(store, scopeId);
  return inspectSbcType3CandidateCurrentness(current.candidate, {
    scopeId,
    engineeringRevision: current.engineeringRevision,
  });
}
