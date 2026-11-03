import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AIV_EI_OFFICIAL_ERRATA_SOURCE,
  AIV_T2_6_ERRATA_FEED_EQUATION,
} from '../converters/vibration/aiv/aiv-errata-evidence.js';
import { AIV_D23_BENCHMARK_CASES } from '../converters/vibration/aiv/aiv-qualification-evidence.js';

function evaluateOfficialErrataLog10N(B) {
  const c = AIV_T2_6_ERRATA_FEED_EQUATION.coefficients;
  return c.c0
    + c.cLog10B * Math.log10(B)
    + c.cInvSqrtB / Math.sqrt(B)
    + c.cInvBPower / (B ** 0.1);
}

test('official EI page-61 errata equation is captured as qualification evidence only', () => {
  assert.equal(AIV_EI_OFFICIAL_ERRATA_SOURCE.publisher, 'Energy Institute');
  assert.equal(AIV_EI_OFFICIAL_ERRATA_SOURCE.aivRelevantPage, 61);
  assert.match(AIV_EI_OFFICIAL_ERRATA_SOURCE.errataLocator, /Feed in from Flowchart T2-5/u);
  assert.equal(AIV_T2_6_ERRATA_FEED_EQUATION.implementationAuthorized, false);
  assert.equal(AIV_T2_6_ERRATA_FEED_EQUATION.controlledCommonPdfParityRequired, true);
});

test('independent errata evaluation reproduces the published D.2.3 log10(N) intermediate', () => {
  const example = AIV_D23_BENCHMARK_CASES.find((row) => row.benchmarkId === 'AIV-EI-D2-3-RELIEF-DISCONTINUITY');
  const B = example.publishedIntermediates.B;
  const actual = evaluateOfficialErrataLog10N(B);
  assert(Math.abs(actual - example.publishedIntermediates.log10N) <= 0.00005, `${actual} != ${example.publishedIntermediates.log10N}`);
});

test('independent errata evaluation reproduces published N to displayed significant precision', () => {
  const example = AIV_D23_BENCHMARK_CASES.find((row) => row.benchmarkId === 'AIV-EI-D2-3-RELIEF-DISCONTINUITY');
  const log10N = evaluateOfficialErrataLog10N(example.publishedIntermediates.B);
  const N = 10 ** log10N;
  const publishedN = example.publishedIntermediates.N;
  assert(Math.abs(N - publishedN) / publishedN < 0.002, `${N} not consistent with published ${publishedN}`);
});
