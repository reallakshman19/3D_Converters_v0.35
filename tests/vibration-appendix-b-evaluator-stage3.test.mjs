import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateEiAviffReynoldsCandidate,
  evaluateEiAviffMechanicalBaselineCandidate,
} from '../converters/vibration/masters/ei-aviff-appendix-b-evaluator.js';

test('B.9 candidate evaluator preserves the source mm and Pa.s unit convention', async () => {
  const result = await calculateEiAviffReynoldsCandidate({
    densityKgM3: 1000,
    velocityMps: 2,
    characteristicDimensionMm: 100,
    dynamicViscosityPaS: 0.001,
  });
  assert.equal(result.reynoldsNumber, 200000);
  assert.equal(result.rule.expression, 'rho*v*Dchar/(1000*mu)');
  assert.equal(result.status, 'CALCULATED_CANDIDATE_ONLY');
  assert.equal(result.authority.screeningAuthority, 'NOT_AUTHORIZED');
});

test('Reynolds candidate fails closed on zero viscosity or missing characteristic dimension', async () => {
  await assert.rejects(
    () => calculateEiAviffReynoldsCandidate({
      densityKgM3: 1000, velocityMps: 2, characteristicDimensionMm: 100, dynamicViscosityPaS: 0,
    }),
    /EI_REYNOLDS_DYNAMIC_VISCOSITY_INVALID/u,
  );
  await assert.rejects(
    () => calculateEiAviffReynoldsCandidate({ densityKgM3: 1000, velocityMps: 2, dynamicViscosityPaS: 0.001 }),
    /EI_REYNOLDS_CHARACTERISTIC_DIMENSION_INVALID/u,
  );
});

test('D2.4 candidate evaluator governs motor-driven centrifugal compressor at LOF 0.4', async () => {
  const result = await evaluateEiAviffMechanicalBaselineCandidate([
    'CENTRIFUGAL_COMPRESSOR',
    'ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW',
  ]);
  assert.equal(result.governingSourceKey, 'ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW');
  assert.equal(result.governingLof, 0.4);
  assert.equal(result.status, 'CALCULATED_CANDIDATE_ONLY');
  assert.equal(result.authority.engineeringAuthority, 'NONE');
});

test('mechanical candidate evaluator deduplicates repeated sources', async () => {
  const result = await evaluateEiAviffMechanicalBaselineCandidate([
    'CENTRIFUGAL_PUMP', 'CENTRIFUGAL_PUMP', 'CENTRIFUGAL_COMPRESSOR',
  ]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.governingLof, 0.4);
});

test('shared-support transfer remains blocked from direct numeric baseline evaluation', async () => {
  await assert.rejects(
    () => evaluateEiAviffMechanicalBaselineCandidate([
      'PIPEWORK_SHARING_SUPPORTS_WITH_LINE_LOF_GE_0_50',
    ]),
    /EI_T2_3_MECHANICAL_DIRECT_BASELINE_UNAVAILABLE/u,
  );
});
