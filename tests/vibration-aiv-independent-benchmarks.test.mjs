import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AIV_INDEPENDENT_BENCHMARKS,
  AIV_INDEPENDENT_BENCHMARK_EVIDENCE,
} from '../converters/vibration/aiv/aiv-independent-benchmark-evidence.js';

function benchmark(id) {
  return AIV_INDEPENDENT_BENCHMARKS.find((item) => item.benchmarkId === id);
}

function sourcePwl({ p1, p2, w, t, mw, sffDb }) {
  return 10 * Math.log10(
    (((p1 - p2) / p1) ** 3.6)
      * (w ** 2)
      * ((t / mw) ** 1.2),
  ) + 126.1 + sffDb;
}

function combinePwl(values) {
  return 10 * Math.log10(values.reduce((sum, value) => sum + (10 ** (value / 10)), 0));
}

test('sonic benchmark is independent of D2.3 and exercises an explicit +6 dB branch', () => {
  const item = benchmark('AIV-HAND-SONIC-SFF6-001');
  const inputs = item.inputs;
  const common = {
    p1: inputs.upstreamPressureAbsolute.value,
    p2: inputs.downstreamPressureAbsolute.value,
    w: inputs.massFlow.value,
    t: inputs.upstreamTemperature.value,
    mw: inputs.molecularWeight.value,
  };
  const nonSonic = sourcePwl({ ...common, sffDb: 0 });
  const sonic = sourcePwl({ ...common, sffDb: 6 });
  assert(Math.abs(nonSonic - item.expected.nonSonicReferencePwlDb) < 1e-12);
  assert(Math.abs(sonic - item.expected.sonicPwlDb) < 1e-12);
  assert(Math.abs((sonic - nonSonic) - item.expected.sonicDeltaDb) < 1e-12);
  assert.equal(inputs.sonicState, 'SONIC');
  assert.equal(inputs.sonicFlowFactorDb, 6);
});

test('equal simultaneous acoustic contributions combine to +3.0102999566 dB', () => {
  const item = benchmark('AIV-HAND-MULTI-SOURCE-EQUAL-001');
  const combined = combinePwl(item.inputs.contributionPwlDb);
  assert(Math.abs(combined - item.expected.combinedPwlDb) < 1e-12);
  assert(Math.abs((combined - 160) - item.expected.increaseAboveSingleSourceDb) < 1e-12);
});

test('10 dB asymmetric simultaneous contributions retain the weaker source in log-power sum', () => {
  const item = benchmark('AIV-HAND-MULTI-SOURCE-ASYM-001');
  const combined = combinePwl(item.inputs.contributionPwlDb);
  assert(Math.abs(combined - item.expected.combinedPwlDb) < 1e-12);
  assert(combined > 160 && combined < 161);
  assert(Math.abs(combinePwl([150, 160]) - combined) < 1e-12, 'combination must be order-invariant');
});

test('independent benchmark evidence cannot authorize production or screening', () => {
  assert(Object.isFrozen(AIV_INDEPENDENT_BENCHMARK_EVIDENCE));
  assert(Object.isFrozen(AIV_INDEPENDENT_BENCHMARKS));
  assert(AIV_INDEPENDENT_BENCHMARKS.every((item) => item.reviewState === 'HUMAN_ACCEPTANCE_REQUIRED'));
  assert(AIV_INDEPENDENT_BENCHMARKS.every((item) => item.productionAuthority === false));
  assert.equal(AIV_INDEPENDENT_BENCHMARK_EVIDENCE.authority.productionEquationAuthorized, false);
  assert.equal(AIV_INDEPENDENT_BENCHMARK_EVIDENCE.authority.screeningAuthority, 'NOT_AUTHORIZED');
});
