import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AIV_BENCHMARK_COMPARISON_SCHEMA,
  AIV_BENCHMARK_COMPARISON_STATUS,
  buildAivBenchmarkComparison,
} from '../converters/vibration/aiv/aiv-benchmark-comparison.js';

function d23Items() {
  return [
    {
      metricId: 'RELIEF_RAW_SOURCE_PWL',
      resultScope: 'SOURCE',
      actual: 164.6851759525391,
      expected: 164.7,
      toleranceAbs: 0.05,
    },
    {
      metricId: 'FIRST_WELDOLET_POINT_PWL',
      resultScope: 'ASSESSMENT',
      actual: 164.3734876408508,
      expected: 164.4,
      toleranceAbs: 0.05,
    },
    {
      metricId: 'FIRST_WELDOLET_FLM1',
      resultScope: 'ASSESSMENT',
      actual: 1.2109758194311824,
      expected: 1.2133,
      toleranceAbs: 0.00005,
      reviewRequired: true,
      reviewReason: 'PUBLISHED_FLM1_ARITHMETIC_RECONCILIATION_REQUIRED',
    },
    {
      metricId: 'FIRST_WELDOLET_LOF',
      resultScope: 'ASSESSMENT',
      actual: 0.29,
      expected: 0.29,
      toleranceAbs: 0,
    },
  ];
}

test('controlled D2.3 comparison distinguishes parity from engineering review', () => {
  const comparison = buildAivBenchmarkComparison({
    benchmarkId: 'AIV-EI-D2-3',
    inputIdentityState: 'CONTROLLED_INPUT_REFERENCE',
    items: d23Items(),
  });
  assert.equal(comparison.schema, AIV_BENCHMARK_COMPARISON_SCHEMA);
  assert.equal(comparison.officialParityApplicable, true);
  assert.equal(comparison.status, AIV_BENCHMARK_COMPARISON_STATUS.REVIEW_REQUIRED);
  assert.equal(comparison.counts.pass, 3);
  assert.equal(comparison.counts.reviewRequired, 1);
  assert.equal(comparison.counts.fail, 0);
  const flm1 = comparison.items.find((item) => item.metricId === 'FIRST_WELDOLET_FLM1');
  assert.equal(flm1.status, AIV_BENCHMARK_COMPARISON_STATUS.REVIEW_REQUIRED);
  assert.equal(flm1.withinTolerance, false);
  assert.equal(flm1.reviewReason, 'PUBLISHED_FLM1_ARITHMETIC_RECONCILIATION_REQUIRED');
  assert.equal(comparison.productionExecutionAuthorized, false);
  assert.equal(comparison.screeningExecutionAuthorized, false);
});

test('benchmark comparison fails when a non-review metric exceeds tolerance', () => {
  const comparison = buildAivBenchmarkComparison({
    benchmarkId: 'AIV-EI-D2-3',
    inputIdentityState: 'CONTROLLED_INPUT_REFERENCE',
    items: [{
      metricId: 'RELIEF_RAW_SOURCE_PWL',
      resultScope: 'SOURCE',
      actual: 165.0,
      expected: 164.7,
      toleranceAbs: 0.05,
    }],
  });
  assert.equal(comparison.status, AIV_BENCHMARK_COMPARISON_STATUS.FAIL);
  assert.equal(comparison.counts.fail, 1);
});

test('modified benchmark inputs make official parity not applicable', () => {
  const comparison = buildAivBenchmarkComparison({
    benchmarkId: 'AIV-EI-D2-3',
    inputIdentityState: 'NOT_APPLICABLE_MODIFIED_INPUTS',
    items: d23Items(),
  });
  assert.equal(comparison.officialParityApplicable, false);
  assert.equal(comparison.status, AIV_BENCHMARK_COMPARISON_STATUS.NOT_APPLICABLE_INPUTS_MODIFIED);
  assert.equal(comparison.counts.notApplicable, d23Items().length);
  assert(comparison.items.every((item) => item.absoluteDifference === null));
  assert(comparison.items.every((item) => item.withinTolerance === null));
});

test('comparison contract fails closed on invalid scope and tolerance', () => {
  assert.throws(
    () => buildAivBenchmarkComparison({
      benchmarkId: 'X',
      inputIdentityState: 'CONTROLLED_INPUT_REFERENCE',
      items: [{ metricId: 'M', resultScope: 'UNKNOWN', actual: 1, expected: 1, toleranceAbs: 0 }],
    }),
    (error) => error?.code === 'AIV_BENCHMARK_RESULT_SCOPE_INVALID',
  );
  assert.throws(
    () => buildAivBenchmarkComparison({
      benchmarkId: 'X',
      inputIdentityState: 'CONTROLLED_INPUT_REFERENCE',
      items: [{ metricId: 'M', resultScope: 'SOURCE', actual: 1, expected: 1, toleranceAbs: -1 }],
    }),
    (error) => error?.code === 'AIV_BENCHMARK_TOLERANCE_INVALID',
  );
});
