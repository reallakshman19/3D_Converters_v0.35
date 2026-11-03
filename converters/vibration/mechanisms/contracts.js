export const VIBRATION_MECHANISM_ASSESSMENT_ITEM_SCHEMA = 'VibrationMechanismAssessmentItem.v1';
export const VIBRATION_MECHANISM_ASSESSMENT_SET_SCHEMA = 'VibrationMechanismAssessmentSet.v1';

export const VIBRATION_MECHANISM_IMPLEMENTATION_STATES = Object.freeze([
  'NOT_IMPLEMENTED',
  'IMPLEMENTED_BENCHMARK_ONLY',
  'IMPLEMENTED_SCREENING',
  'IMPLEMENTED_CANDIDATE_USER_INPUT',
  'IMPLEMENTED_CANDIDATE_MASTER',
]);

export const VIBRATION_MECHANISM_ASSESSMENT_STATES = Object.freeze([
  'NOT_EVALUATED',
  'APPLICABILITY_UNKNOWN',
  'NOT_APPLICABLE',
  'APPLICABLE_INCOMPLETE',
  'READY',
  'CALCULATED',
  'FAILED',
  'REVIEW_REQUIRED',
]);

export const VIBRATION_MECHANISM_RESULT_STATES = Object.freeze([
  'UNRUN',
  'READY',
  'RUNNING',
  'CURRENT_RESULT',
  'STALE_RESULT',
  'INVALID_INPUT',
]);

export const VIBRATION_MECHANISM_BENCHMARK_STATES = Object.freeze([
  'NOT_CONFIGURED',
  'NOT_RUN',
  'PASS',
  'FAIL',
  'STALE_RESULT',
  'NOT_APPLICABLE_MODIFIED_INPUTS',
]);

export const VIBRATION_MECHANISM_INPUT_TRACE_STATES = Object.freeze([
  'UNAVAILABLE',
  'SOURCE_AND_NORMALIZED_ONLY',
  'COMPLETE_WORKING_TRACE',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
  return value;
}

function enumValue(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new RangeError(`${field} must be one of ${allowed.join(', ')}.`);
  }
  return value;
}

function scopeValue(scope = {}) {
  return {
    line: requiredText(scope.line, 'scope.line'),
    caseId: scope.caseId === null || scope.caseId === undefined ? null : requiredText(scope.caseId, 'scope.caseId'),
    canonicalId: requiredText(scope.canonicalId, 'scope.canonicalId'),
  };
}

function cloneArray(value) {
  return Array.isArray(value) ? [...value] : [];
}

function readinessValue(value = {}) {
  return {
    missing: cloneArray(value.missing),
    invalid: cloneArray(value.invalid),
    reasons: cloneArray(value.reasons),
  };
}

function benchmarkValue(value = null) {
  if (!value) return { status: 'NOT_CONFIGURED' };
  return {
    ...value,
    status: enumValue(value.status, VIBRATION_MECHANISM_BENCHMARK_STATES, 'benchmark.status'),
  };
}

function traceValue(value = {}) {
  const inputTrace = value.inputTrace ?? {};
  const inputTraceStatus = inputTrace.status ?? 'UNAVAILABLE';
  enumValue(inputTraceStatus, VIBRATION_MECHANISM_INPUT_TRACE_STATES, 'trace.inputTrace.status');
  return {
    equationIds: cloneArray(value.equationIds),
    ruleIds: cloneArray(value.ruleIds),
    correlationIds: cloneArray(value.correlationIds),
    inputTrace: {
      status: inputTraceStatus,
      normalizedInputs: inputTrace.normalizedInputs ?? {},
      workingCells: inputTrace.workingCells ?? {},
      sourceTrace: inputTrace.sourceTrace ?? null,
    },
  };
}

export function vibrationMechanismAssessmentItemId({
  mechanismId,
  scope,
  childKey,
} = {}) {
  const resolvedScope = scopeValue(scope);
  const mechanism = requiredText(mechanismId, 'mechanismId');
  const child = requiredText(childKey, 'childKey');
  return JSON.stringify([
    mechanism,
    resolvedScope.line,
    resolvedScope.caseId,
    resolvedScope.canonicalId,
    child,
  ]);
}

export function vibrationMechanismAssessmentSetId({ mechanismId, scope } = {}) {
  const resolvedScope = scopeValue(scope);
  return JSON.stringify([
    requiredText(mechanismId, 'mechanismId'),
    resolvedScope.line,
    resolvedScope.caseId,
    resolvedScope.canonicalId,
  ]);
}

export function createVibrationMechanismAssessmentItem(input = {}) {
  const scope = scopeValue(input.scope);
  const childKey = requiredText(input.childKey, 'childKey');
  const ordinal = input.childOrdinal ?? 0;
  if (!Number.isInteger(ordinal) || ordinal < 0) {
    throw new RangeError('childOrdinal must be a non-negative integer.');
  }
  const mechanismId = requiredText(input.mechanismId, 'mechanismId');
  const implementationState = enumValue(
    input.implementationState,
    VIBRATION_MECHANISM_IMPLEMENTATION_STATES,
    'implementationState',
  );
  const assessmentState = enumValue(
    input.assessmentState,
    VIBRATION_MECHANISM_ASSESSMENT_STATES,
    'assessmentState',
  );
  const resultState = enumValue(
    input.resultState,
    VIBRATION_MECHANISM_RESULT_STATES,
    'resultState',
  );

  return deepFreeze({
    schema: VIBRATION_MECHANISM_ASSESSMENT_ITEM_SCHEMA,
    itemId: vibrationMechanismAssessmentItemId({ mechanismId, scope, childKey }),
    mechanismId,
    scope,
    child: { key: childKey, ordinal },
    implementationState,
    assessmentState,
    resultState,
    applicability: input.applicability ?? null,
    readiness: readinessValue(input.readiness),
    request: input.request ?? null,
    execution: input.execution ?? null,
    result: input.result ?? null,
    benchmark: benchmarkValue(input.benchmark),
    trace: traceValue(input.trace),
    qualification: input.qualification ?? null,
    evidence: input.evidence ?? null,
  });
}

export function createVibrationMechanismAssessmentSet(input = {}) {
  const mechanismId = requiredText(input.mechanismId, 'mechanismId');
  const scope = scopeValue(input.scope);
  const items = Array.isArray(input.items) ? [...input.items] : [];
  const ids = new Set();
  for (const item of items) {
    if (item?.schema !== VIBRATION_MECHANISM_ASSESSMENT_ITEM_SCHEMA) {
      throw new TypeError(`Assessment set items must use ${VIBRATION_MECHANISM_ASSESSMENT_ITEM_SCHEMA}.`);
    }
    if (item.mechanismId !== mechanismId
        || item.scope.line !== scope.line
        || item.scope.caseId !== scope.caseId
        || item.scope.canonicalId !== scope.canonicalId) {
      throw new Error('Assessment set item scope/mechanism mismatch.');
    }
    if (ids.has(item.itemId)) throw new Error(`Duplicate mechanism assessment item: ${item.itemId}`);
    ids.add(item.itemId);
  }
  const count = items.length;
  return deepFreeze({
    schema: VIBRATION_MECHANISM_ASSESSMENT_SET_SCHEMA,
    setId: vibrationMechanismAssessmentSetId({ mechanismId, scope }),
    mechanismId,
    scope,
    cardinality: {
      count,
      kind: count === 0 ? 'ZERO' : count === 1 ? 'ONE' : 'MANY',
    },
    items,
  });
}
