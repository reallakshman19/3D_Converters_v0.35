import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AIV_INDEPENDENT_QUALIFICATION_SOLVE_SCHEMA,
  solveAivIndependentQualificationBenchmarks,
} from '../scripts/solve-aiv-independent-qualification-benchmarks.mjs';

const ROOT = new URL('../', import.meta.url);

function close(actual, expected, tolerance, label) {
  assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected} within ${tolerance}`);
}

function byId(result, benchmarkId) {
  const item = result.results.find((entry) => entry.benchmarkId === benchmarkId);
  assert(item, `missing ${benchmarkId}`);
  return item;
}

test('independent qualification solver reproduces the explicit sonic SFF=6 vector', () => {
  const result = solveAivIndependentQualificationBenchmarks();
  assert.equal(result.schema, AIV_INDEPENDENT_QUALIFICATION_SOLVE_SCHEMA);
  const sonic = byId(result, 'AIV-HAND-SONIC-SFF6-001');
  close(sonic.calculated.nonSonicReferencePwlDb, sonic.expected.nonSonicReferencePwlDb, 1e-9, 'non-sonic PWL');
  close(sonic.calculated.sonicPwlDb, sonic.expected.sonicPwlDb, 1e-9, 'sonic PWL');
  close(sonic.calculated.sonicDeltaDb, 6, 1e-12, 'sonic delta');
  assert.equal(sonic.humanAcceptanceRequired, true);
});

test('independent qualification solver reproduces equal and asymmetric simultaneous-source vectors', () => {
  const result = solveAivIndependentQualificationBenchmarks();
  const equal = byId(result, 'AIV-HAND-MULTI-SOURCE-EQUAL-001');
  const asym = byId(result, 'AIV-HAND-MULTI-SOURCE-ASYM-001');
  close(equal.calculated.combinedPwlDb, equal.expected.combinedPwlDb, 1e-9, 'equal-source combination');
  close(equal.calculated.increaseAboveDominantSourceDb, equal.expected.increaseAboveSingleSourceDb, 1e-9, 'equal-source increase');
  close(asym.calculated.combinedPwlDb, asym.expected.combinedPwlDb, 1e-9, 'asymmetric-source combination');
  close(asym.calculated.increaseAboveDominantSourceDb, asym.expected.increaseAboveDominantSourceDb, 1e-9, 'asymmetric-source increase');
  assert.equal(equal.humanAcceptanceRequired, true);
  assert.equal(asym.humanAcceptanceRequired, true);
});

test('independent vector reproduction cannot grant AIV authority', () => {
  const result = solveAivIndependentQualificationBenchmarks();
  assert.equal(result.authority.calculationState, 'BLOCKED');
  assert.equal(result.authority.qualificationState, 'BLOCKED');
  assert.equal(result.authority.engineeringAuthority, 'NONE');
  assert.equal(result.authority.productionEquationAuthorized, false);
  assert.equal(result.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(result.authority.designAuthority, false);
});

test('qualification math remains isolated from production AIV facade and UI', () => {
  const paths = [
    'converters/vibration/aiv/index.js',
    'tabs/vibration-aiv-qualification-tab.js',
    'tabs/vibration-aiv-qualification-view.js',
  ];
  for (const path of paths) {
    const source = fs.readFileSync(new URL(path, ROOT), 'utf8');
    assert.doesNotMatch(source, /aiv-qualification-math|solve-aiv-independent-qualification-benchmarks/u);
  }
});
