export const AIV_INPUT_MODE = Object.freeze({
  NETWORK_DRIVEN: 'NETWORK_DRIVEN',
  TABLE_DRIVEN: 'TABLE_DRIVEN',
});

const OPERATION_KEYS = Object.freeze({
  readiness: 'pendingReadiness',
  screening: 'pendingScreening',
});

const LINEAGE_KEYS = Object.freeze({
  readiness: 'readinessState',
  screening: 'screeningState',
});

function requireState(state) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('AIV engineering revision requires mutable workspace state.');
  }
}

function normalizeRevision(value) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function operationKey(kind) {
  const key = OPERATION_KEYS[kind];
  if (!key) throw new TypeError(`Unsupported AIV async operation: ${kind}`);
  return key;
}

export function createAivEngineeringRevisionState() {
  return {
    inputMode: AIV_INPUT_MODE.TABLE_DRIVEN,
    inputRevision: 0,
    networkRevision: null,
    generatedProjectionRevision: null,
    asyncSequence: 0,
    pendingReadiness: null,
    pendingScreening: null,
    readinessState: null,
    screeningState: null,
    detachedNetworkEvidence: null,
  };
}

export function currentAivInputRevision(state) {
  return normalizeRevision(state?.inputRevision);
}

export function cancelAivAsyncOperations(state) {
  requireState(state);
  state.pendingReadiness = null;
  state.pendingScreening = null;
}

export function markAivEngineeringInputChanged(state, options = {}) {
  requireState(state);
  const inputMode = options.inputMode ?? state.inputMode ?? AIV_INPUT_MODE.TABLE_DRIVEN;
  const networkMode = inputMode === AIV_INPUT_MODE.NETWORK_DRIVEN;
  state.inputMode = inputMode;
  state.inputRevision = currentAivInputRevision(state) + 1;
  state.networkRevision = networkMode
    ? (options.networkRevision ?? state.networkRevision ?? null)
    : null;
  state.generatedProjectionRevision = networkMode
    ? (options.generatedProjectionRevision ?? state.generatedProjectionRevision ?? null)
    : null;
  cancelAivAsyncOperations(state);
  state.readinessState = null;
  state.screeningState = null;
  return state.inputRevision;
}

export function beginAivAsyncOperation(state, kind) {
  requireState(state);
  const key = operationKey(kind);
  state.asyncSequence = normalizeRevision(state.asyncSequence) + 1;
  const operation = Object.freeze({
    token: state.asyncSequence,
    inputRevision: currentAivInputRevision(state),
  });
  state[key] = operation;
  return operation;
}

export function isAivAsyncOperationCurrent(state, kind, operation) {
  if (!state || state.destroyed || !operation) return false;
  const pending = state[operationKey(kind)];
  return Boolean(
    pending
    && pending.token === operation.token
    && pending.inputRevision === operation.inputRevision
    && currentAivInputRevision(state) === operation.inputRevision
  );
}

export function finishAivAsyncOperation(state, kind, operation, committed = false) {
  requireState(state);
  const key = operationKey(kind);
  const current = isAivAsyncOperationCurrent(state, kind, operation);
  if (state[key]?.token === operation?.token) state[key] = null;
  if (current && committed) {
    state[LINEAGE_KEYS[kind]] = Object.freeze({
      token: operation.token,
      inputRevision: operation.inputRevision,
    });
  }
  return current;
}

export function isAivLineageCurrent(state, kind) {
  const lineage = state?.[LINEAGE_KEYS[kind]];
  return Boolean(
    lineage
    && lineage.inputRevision === currentAivInputRevision(state)
    && !state?.destroyed
  );
}
