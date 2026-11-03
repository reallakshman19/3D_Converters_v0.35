import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPIRICAL_WEIGHT_MODEL,
  cloneEmpiricalWeightModel,
  evaluateEmpiricalWeightSandbox,
  listEmpiricalWeightSandboxOptions,
} from '../converters/empirical-weight/index.js';

test('sandbox options are backed by real model/master choices', () => {
  const options = listEmpiricalWeightSandboxOptions({
    target: 'RF/RTJ KG',
    typeDesc: 'Flanged Gate Valve',
    rating: 300,
  });
  assert(options.targets.includes('RF/RTJ KG'));
  assert(options.types.includes('Flanged Gate Valve'));
  assert(options.ratings.includes(300));
  assert(options.sizes.length > 0);
  assert(options.sizes.every((value) => Number.isFinite(value) && value > 0));
});

test('sandbox reports exact, A1, A2 and final paths for one request', () => {
  const result = evaluateEmpiricalWeightSandbox({
    input: { target: 'RF/RTJ KG', typeDesc: 'Flanged Gate Valve', rating: 300, ns: 4 },
  });
  assert.equal(result.active.exact.ok, true, JSON.stringify(result.active.exact));
  assert.equal(result.active.approach1.ok, true, JSON.stringify(result.active.approach1));
  assert.equal(result.active.approach2.ok, true, JSON.stringify(result.active.approach2));
  assert.equal(result.active.final.ok, true, JSON.stringify(result.active.final));
  assert.equal(result.active.final.approach, 'EXACT');
  assert.equal(result.active.final.weightKg, result.active.exact.weightKg);
  assert(Number.isFinite(result.active.approach2.predictions.band));
  assert(Number.isFinite(result.active.approach2.predictions.ratio));
  assert(Number.isFinite(result.active.approach2.predictions.cross));
});

test('candidate sandbox tuning is isolated from active model', () => {
  const candidate = cloneEmpiricalWeightModel(EMPIRICAL_WEIGHT_MODEL);
  const original = [...EMPIRICAL_WEIGHT_MODEL.approach2.stackWeights['RF/RTJ KG']['Flanged Gate Valve']];
  candidate.approach2.stackWeights['RF/RTJ KG']['Flanged Gate Valve'] = [1, 0, 0];

  const result = evaluateEmpiricalWeightSandbox({
    input: { target: 'RF/RTJ KG', typeDesc: 'Flanged Gate Valve', rating: 300, ns: 4 },
    candidateModel: candidate,
  });

  assert.equal(result.active.approach2.ok, true);
  assert.equal(result.candidate.approach2.ok, true);
  assert.notEqual(result.active.approach2.weightKg, result.candidate.approach2.weightKg);
  assert.deepEqual(EMPIRICAL_WEIGHT_MODEL.approach2.stackWeights['RF/RTJ KG']['Flanged Gate Valve'], original);
  assert(result.delta.approach2);
});
