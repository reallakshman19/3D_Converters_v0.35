export const AIV_BENCHMARK_COMPARISON_SCHEMA = 'AivBenchmarkComparison.v1';
export const AIV_BENCHMARK_COMPARISON_STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  NOT_APPLICABLE_INPUTS_MODIFIED: 'NOT_APPLICABLE_INPUTS_MODIFIED',
});

const RESULT_SCOPES = new Set(['SOURCE', 'ASSESSMENT', 'LINE_CASE_SUMMARY']);
const BLOCKED_AUTHORITY = Object.freeze({
  calculationState: 'BLOCKED',
  qualificationState: 'BLOCKED',
  engineeringAuthority: 'NONE',
  productionEquationAuthorized: false,
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function comparisonError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'AivBenchmarkComparisonError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function assertFiniteNumber(value, field, metricId) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw comparisonError('AIV_BENCHMARK_NUMERIC_VALUE_REQUIRED', `${field} must be a finite number.`, { metricId, field, value });
  }
}

function normalizeItem(item, officialParityApplicable) {
  const metricId = String(item?.metricId ?? '').trim();
  if (!metricId) throw comparisonError('AIV_BENCHMARK_METRIC_ID_REQUIRED', 'Benchmark comparison item requires metricId.');
  const resultScope = String(item?.resultScope ?? '').trim();
  if (!RESULT_SCOPES.has(resultScope)) {
    throw comparisonError('AIV_BENCHMARK_RESULT_SCOPE_INVALID', 'Benchmark comparison item has invalid resultScope.', { metricId, resultScope });
  }
  assertFiniteNumber(item.actual, 'actual', metricId);
  assertFiniteNumber(item.expected, 'expected', metricId);
  assertFiniteNumber(item.toleranceAbs, 'toleranceAbs', metricId);
  if (item.toleranceAbs < 0) {
    throw comparisonError('AIV_BENCHMARK_TOLERANCE_INVALID', 'Benchmark absolute tolerance cannot be negative.', { metricId });
  }

  if (!officialParityApplicable) {
    return {
      metricId,
      resultScope,
      label: item.label ?? metricId,
      actual: item.actual,
      expected: item.expected,
      toleranceAbs: item.toleranceAbs,
      absoluteDifference: null,
      withinTolerance: null,
      status: AIV_BENCHMARK_COMPARISON_STATUS.NOT_APPLICABLE_INPUTS_MODIFIED,
      reviewReason: null,
    };
  }

  const absoluteDifference = Math.abs(item.actual - item.expected);
  const withinTolerance = absoluteDifference <= item.toleranceAbs;
  const reviewRequired = item.reviewRequired === true;
  return {
    metricId,
    resultScope,
    label: item.label ?? metricId,
    actual: item.actual,
    expected: item.expected,
    toleranceAbs: item.toleranceAbs,
    absoluteDifference,
    withinTolerance,
    status: reviewRequired
      ? AIV_BENCHMARK_COMPARISON_STATUS.REVIEW_REQUIRED
      : (withinTolerance ? AIV_BENCHMARK_COMPARISON_STATUS.PASS : AIV_BENCHMARK_COMPARISON_STATUS.FAIL),
    reviewReason: reviewRequired ? String(item.reviewReason ?? 'ENGINEERING_REVIEW_REQUIRED') : null,
  };
}

function rollupStatus(items, officialParityApplicable) {
  if (!officialParityApplicable) return AIV_BENCHMARK_COMPARISON_STATUS.NOT_APPLICABLE_INPUTS_MODIFIED;
  if (items.some((item) => item.status === AIV_BENCHMARK_COMPARISON_STATUS.FAIL)) return AIV_BENCHMARK_COMPARISON_STATUS.FAIL;
  if (items.some((item) => item.status === AIV_BENCHMARK_COMPARISON_STATUS.REVIEW_REQUIRED)) {
    return AIV_BENCHMARK_COMPARISON_STATUS.REVIEW_REQUIRED;
  }
  return AIV_BENCHMARK_COMPARISON_STATUS.PASS;
}

export function buildAivBenchmarkComparison({ benchmarkId, inputIdentityState, items }) {
  const normalizedBenchmarkId = String(benchmarkId ?? '').trim();
  if (!normalizedBenchmarkId) throw comparisonError('AIV_BENCHMARK_ID_REQUIRED', 'AIV benchmark comparison requires benchmarkId.');
  if (!Array.isArray(items) || items.length === 0) {
    throw comparisonError('AIV_BENCHMARK_ITEMS_REQUIRED', 'AIV benchmark comparison requires at least one metric item.');
  }
  const officialParityApplicable = inputIdentityState === 'CONTROLLED_INPUT_REFERENCE';
  const normalizedItems = items.map((item) => normalizeItem(item, officialParityApplicable));
  const counts = Object.freeze({
    total: normalizedItems.length,
    pass: normalizedItems.filter((item) => item.status === AIV_BENCHMARK_COMPARISON_STATUS.PASS).length,
    fail: normalizedItems.filter((item) => item.status === AIV_BENCHMARK_COMPARISON_STATUS.FAIL).length,
    reviewRequired: normalizedItems.filter((item) => item.status === AIV_BENCHMARK_COMPARISON_STATUS.REVIEW_REQUIRED).length,
    notApplicable: normalizedItems.filter((item) => item.status === AIV_BENCHMARK_COMPARISON_STATUS.NOT_APPLICABLE_INPUTS_MODIFIED).length,
  });

  return deepFreeze({
    schema: AIV_BENCHMARK_COMPARISON_SCHEMA,
    calculationId: 'VIB.AIV.ACOUSTIC',
    benchmarkId: normalizedBenchmarkId,
    inputIdentityState: String(inputIdentityState ?? 'UNKNOWN'),
    officialParityApplicable,
    status: rollupStatus(normalizedItems, officialParityApplicable),
    items: normalizedItems,
    counts,
    authority: BLOCKED_AUTHORITY,
    productionExecutionAuthorized: false,
    screeningExecutionAuthorized: false,
    notes: Object.freeze([
      'This contract compares externally supplied qualification results to controlled benchmark references; it performs no AIV engineering equations.',
      'REVIEW_REQUIRED records an unresolved engineering disposition and is not a numerical PASS.',
      'Modified benchmark inputs make official parity not applicable even when supplied numerical values happen to match references.',
    ]),
  });
}
