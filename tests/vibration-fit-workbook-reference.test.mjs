import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIT_REFERENCE_AUTHORITY,
  assessFit,
  calculateFit,
  evaluateFitApplicability,
  fitSpanBoundaries,
  fitStandardCorrelation,
} from '../converters/vibration/fit/index.js';

function close(actual, expected, tolerance = 1e-9) {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

const example1 = Object.freeze({
  phase: 'GAS',
  outsideDiameterM: 0.1683,
  wallThicknessM: 0.0219456,
  insideDiameterM: 0.1243838,
  maximumUnsupportedSpanM: 4,
  densityKgM3: 5,
  massFlowKgS: 20000 / 3600,
  gasDynamicViscosityPaS: 0.00002,
});

const example3 = Object.freeze({
  phase: 'MULTIPHASE',
  outsideDiameterM: 0.7112,
  wallThicknessM: 0.0127,
  insideDiameterM: 0.6858,
  maximumUnsupportedSpanM: 15,
  gasDensityKgM3: 18,
  liquidDensityKgM3: 965.96,
  gasMassFlowKgS: 53482 / 3600,
  liquidMassFlowKgS: 828796 / 3600,
});

test('source-transcription: retained gas example reproduces standard workbook reference values', () => {
  const result = calculateFit(example1);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.authority, FIT_REFERENCE_AUTHORITY);
  assert.equal(result.support.stiffness, 'STIFF');
  assert.equal(result.support.category, 'STIFF');
  close(result.hydraulics.velocityMS, 91.4407896716322, 1e-9);
  close(result.standard.fluidViscosityFactor, 0.14142135623730953, 1e-14);
  close(result.standard.correlation.fv, 96734.96621707715, 1e-8);
  close(result.standard.lof, 0.06111973374777248, 1e-12);
  assert.equal(assessFit(result).status, 'REFERENCE_BELOW_THRESHOLD');
});

test('source-transcription: retained multiphase example reproduces standard workbook reference values', () => {
  const result = calculateFit(example3);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.support.stiffness, 'MEDIUM_STIFF');
  assert.equal(result.support.category, 'MEDIUM_STIFF');
  close(result.hydraulics.velocityMS, 2.8795425431994497, 1e-12);
  close(result.excitation.rhoV2, 1910.476085046737, 1e-9);
  close(result.standard.correlation.fv, 24195.051024856213, 1e-9);
  close(result.standard.lof, 0.07896144063031958, 1e-12);
});

test('all six standard support correlations reproduce source-cell formulas at representative dimensions', () => {
  const cases = [
    ['STIFF', 168.3, 21.9456, 96734.96621707715],
    ['MEDIUM_STIFF', 406.4, 7.9248, 16115.417893070906],
    ['MEDIUM_SMALL', 168.3, 21.9456, 28904.192244833637],
    ['MEDIUM_LARGE', 406.4, 7.9248, 8708.755355031448],
    ['FLEXIBLE_SMALL', 406.4, 7.9248, 2226.4419426429668],
    ['FLEXIBLE_LARGE', 711.2, 12.7, 2581.1039252545097],
  ];
  for (const [category, diameterMm, wallMm, expectedFv] of cases) {
    close(fitStandardCorrelation(diameterMm, wallMm, category).fv, expectedFv, 1e-8);
  }
});

test('support stiffness is deterministically derived from span boundaries instead of hidden workbook selector state', () => {
  const boundaries = fitSpanBoundaries(406.4);
  close(boundaries.stiffMaxM, 8.14522278784, 1e-12);
  close(boundaries.mediumStiffMaxM, 11.66347362944, 1e-12);
  close(boundaries.mediumMaxM, 15.43984099072, 1e-12);

  const result = calculateFit({
    phase: 'LIQUID',
    outsideDiameterM: 0.4064,
    wallThicknessM: 0.0079248,
    insideDiameterM: 0.3905504,
    maximumUnsupportedSpanM: 10,
    densityKgM3: 965.96,
    massFlowKgS: 150000 / 3600,
    fluidVelocityMS: 4.2,
    naturalFrequencyHz: 4,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.support.stiffness, 'MEDIUM_STIFF');
  assert.equal(result.support.category, 'MEDIUM_STIFF');
  assert.equal(result.advancedEligibility.reason, 'SUPPORT_NOT_FLEXIBLE');
  assert.notEqual(result.standard.correlation.fv, 2226.4419426429668);
});

test('advanced reference screening is fail-closed outside the workbook-stated 1-3 Hz band', () => {
  const input = {
    phase: 'LIQUID',
    outsideDiameterM: 0.1683,
    wallThicknessM: 0.007112,
    maximumUnsupportedSpanM: 12,
    densityKgM3: 1000,
    fluidVelocityMS: 10,
  };
  const atTwo = calculateFit({ ...input, naturalFrequencyHz: 2 });
  assert.equal(atTwo.ok, true, JSON.stringify(atTwo));
  assert.equal(atTwo.support.category, 'FLEXIBLE_SMALL');
  assert(atTwo.standard.lof >= 1, 'test case must enter advanced path');
  assert.equal(atTwo.advancedEligibility.eligible, true);
  assert(atTwo.advanced);

  const atFour = calculateFit({ ...input, naturalFrequencyHz: 4 });
  assert.equal(atFour.ok, true, JSON.stringify(atFour));
  assert.equal(atFour.advanced, null);
  assert.equal(atFour.advancedEligibility.reason, 'NATURAL_FREQUENCY_OUTSIDE_DECLARED_RANGE');
  assert.equal(assessFit(atFour).status, 'REFERENCE_FURTHER_ENGINEERING_ASSESSMENT_REQUIRED');
});

test('manual diameter gap and maximum workbook diameter boundary fail closed', () => {
  const base = {
    phase: 'LIQUID',
    wallThicknessM: 0.01,
    maximumUnsupportedSpanM: 20,
    densityKgM3: 900,
    massFlowKgS: 10,
  };
  const gap = evaluateFitApplicability({ ...base, outsideDiameterM: 0.25 });
  assert.equal(gap.applicable, false);
  assert(gap.errors.some((row) => row.code === 'FIT_SUPPORT_SIZE_FAMILY_UNRESOLVED'));

  const max = evaluateFitApplicability({ ...base, outsideDiameterM: 0.762 });
  assert.equal(max.applicable, true, JSON.stringify(max));

  const above = evaluateFitApplicability({ ...base, outsideDiameterM: 0.762001 });
  assert.equal(above.applicable, false);
  assert(above.errors.some((row) => row.code === 'FIT_INPUT_OUTSIDE_APPLICABILITY'));
});

test('velocity override does not bypass density or multiphase mixture-data requirements', () => {
  const gas = evaluateFitApplicability({
    phase: 'GAS',
    outsideDiameterM: 0.1683,
    wallThicknessM: 0.007112,
    maximumUnsupportedSpanM: 4,
    fluidVelocityMS: 10,
    gasDynamicViscosityPaS: 0.00002,
  });
  assert.equal(gas.applicable, false);
  assert(gas.errors.some((row) => row.field === 'densityKgM3'));

  const multiphase = evaluateFitApplicability({
    phase: 'MULTIPHASE',
    outsideDiameterM: 0.1683,
    wallThicknessM: 0.007112,
    maximumUnsupportedSpanM: 4,
    fluidVelocityMS: 10,
  });
  assert.equal(multiphase.applicable, false);
  for (const field of ['gasMassFlowKgS', 'gasDensityKgM3', 'liquidMassFlowKgS', 'liquidDensityKgM3']) {
    assert(multiphase.errors.some((row) => row.field === field), field);
  }
});

test('reference calculation is deterministic and never emits design or screening authority', () => {
  const first = calculateFit(example3);
  const second = calculateFit(example3);
  assert.deepEqual(first, second);
  assert.equal(first.qualification.method, 'BENCHMARK_ONLY');
  assert.equal(first.qualification.designAuthority, false);
  assert(first.qualification.reasons.includes('WORKBOOK_REFERENCE_ONLY'));
  const assessment = assessFit(first);
  assert.equal(assessment.authority, FIT_REFERENCE_AUTHORITY);
  assert.equal(Object.hasOwn(assessment, 'pass'), false);
});
