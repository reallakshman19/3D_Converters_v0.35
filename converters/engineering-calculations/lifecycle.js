export const ENGINEERING_CAPABILITY_LIFECYCLE_STATES = Object.freeze({
  RESERVED: 'RESERVED',
  QUALIFIED: 'QUALIFIED',
  ACTIVE: 'ACTIVE',
  DEPRECATED: 'DEPRECATED',
});

const ORDER = Object.freeze([
  ENGINEERING_CAPABILITY_LIFECYCLE_STATES.RESERVED,
  ENGINEERING_CAPABILITY_LIFECYCLE_STATES.QUALIFIED,
  ENGINEERING_CAPABILITY_LIFECYCLE_STATES.ACTIVE,
  ENGINEERING_CAPABILITY_LIFECYCLE_STATES.DEPRECATED,
]);

const NEXT = Object.freeze({
  RESERVED: 'QUALIFIED',
  QUALIFIED: 'ACTIVE',
  ACTIVE: 'DEPRECATED',
  DEPRECATED: null,
});

function normalizedState(value) {
  const state = String(value ?? '').trim().toUpperCase();
  if (!ORDER.includes(state)) throw new TypeError(`Unknown engineering capability lifecycle state: ${value}`);
  return state;
}

function frozenArray(value) {
  return Object.freeze((Array.isArray(value) ? value : []).map((item) => (
    typeof item === 'object' && item !== null ? Object.freeze({ ...item }) : item
  )));
}

export function canTransitionEngineeringCapability(fromState, toState) {
  const from = normalizedState(fromState);
  const to = normalizedState(toState);
  return NEXT[from] === to;
}

export function assertEngineeringCapabilityTransition(fromState, toState) {
  if (!canTransitionEngineeringCapability(fromState, toState)) {
    throw new Error(`ENGINEERING_LIFECYCLE_TRANSITION_FORBIDDEN:${fromState}->${toState}`);
  }
  return true;
}

export function createEngineeringCapabilityLifecycle(options = {}) {
  const state = normalizedState(options.state ?? 'RESERVED');
  return Object.freeze({
    schema: 'EngineeringCapabilityLifecycle.v1',
    state,
    nextState: NEXT[state],
    issueNumbers: frozenArray(options.issueNumbers),
    productionExecutionAllowed: state === 'ACTIVE',
    benchmarkExecutionAllowed: state === 'QUALIFIED' || state === 'ACTIVE',
    notes: frozenArray(options.notes),
  });
}
