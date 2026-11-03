import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FIT_CORRELATION_IDS,
  buildFitCorrelationTrace,
} from '../converters/vibration/fit/trace.js';

const STANDARD = Object.freeze({
  STIFF: 'FIT.STD.STIFF.v1',
  MEDIUM_STIFF: 'FIT.STD.MEDIUM_STIFF.v1',
  MEDIUM_SMALL: 'FIT.STD.MEDIUM_SMALL.v1',
  MEDIUM_LARGE: 'FIT.STD.MEDIUM_LARGE.v1',
  FLEXIBLE_SMALL: 'FIT.STD.FLEXIBLE_SMALL.v1',
  FLEXIBLE_LARGE: 'FIT.STD.FLEXIBLE_LARGE.v1',
});

const ADVANCED = Object.freeze({
  FLEXIBLE_SMALL: 'FIT.ADV.FLEXIBLE_SMALL.v1',
  FLEXIBLE_LARGE: 'FIT.ADV.FLEXIBLE_LARGE.v1',
});

function correlation(category) {
  return Object.freeze({ category, form: 'POWER', a: 11.25, b: -0.75, fv: 18022.5 });
}

test('FIT stable correlation IDs cover every standard and advanced branch', () => {
  assert.deepEqual(FIT_CORRELATION_IDS.STANDARD, STANDARD);
  assert.deepEqual(FIT_CORRELATION_IDS.ADVANCED, ADVANCED);
});

test('correlation trace adds identity without changing backend correlation values', () => {
  for (const [category, correlationId] of Object.entries(STANDARD)) {
    const source = correlation(category);
    const trace = buildFitCorrelationTrace(source, 'STANDARD');
    assert.equal(trace.correlationId, correlationId);
    assert.equal(trace.path, 'STANDARD');
    for (const field of ['category', 'form', 'a', 'b', 'fv']) assert.equal(trace[field], source[field]);
  }
  for (const [category, correlationId] of Object.entries(ADVANCED)) {
    const source = correlation(category);
    const trace = buildFitCorrelationTrace(source, 'ADVANCED');
    assert.equal(trace.correlationId, correlationId);
    assert.equal(trace.path, 'ADVANCED');
  }
});

test('correlation trace fails closed for an unknown path/category pair', () => {
  assert.throws(
    () => buildFitCorrelationTrace(correlation('MEDIUM_STIFF'), 'ADVANCED'),
    /No stable FIT ADVANCED correlation ID/u,
  );
});

test('trace layer contains no numerical FIT formulas and is consumed by the central adapter', () => {
  const traceSource = readFileSync(new URL('../converters/vibration/fit/trace.js', import.meta.url), 'utf8');
  const adapterSource = readFileSync(new URL('../converters/engineering-calculations/adapters/vibration-fit.js', import.meta.url), 'utf8');
  assert.doesNotMatch(traceSource, /Math\.|\*\*|outsideDiameter|wallThickness|naturalFrequency/u);
  assert.match(adapterSource, /buildFitCorrelationTrace\(result\.standard\.correlation, 'STANDARD'\)/u);
  assert.match(adapterSource, /advancedEligibility: result\.advancedEligibility/u);
  assert.match(adapterSource, /correlationIds: correlationIds\(intermediates\)/u);
});
