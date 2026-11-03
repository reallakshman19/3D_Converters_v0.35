import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  assessFit,
  calculateFit,
} from '../converters/vibration/fit/index.js';

const benchmarkSet = JSON.parse(fs.readFileSync(
  new URL('../Benchmarks/VibrationFIT/fit-ei-worked-examples-v1.json', import.meta.url),
  'utf8',
));

function closePublished(actual, expected, absoluteTolerance) {
  assert(Number.isFinite(actual), `Expected finite value, received ${actual}`);
  assert(Number.isFinite(absoluteTolerance) && absoluteTolerance >= 0, 'Published benchmark tolerance is required.');
  assert(Math.abs(actual - expected) <= absoluteTolerance,
    `${actual} != ${expected} within absolute tolerance ${absoluteTolerance}`);
}

function closeExact(actual, expected, relativeTolerance = 1e-12, absoluteTolerance = 1e-12) {
  const tolerance = Math.max(absoluteTolerance, Math.abs(expected) * relativeTolerance);
  assert(Number.isFinite(actual), `Expected finite value, received ${actual}`);
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} within ${tolerance}`);
}

function d4EquivalentInputs() {
  const gasMassFlowKgS = 27180 / 3600;
  const liquidMassFlowKgS = 828796 / 3600;
  const liquidVolumetricFlowM3S = (326 + 532) / 3600;
  const liquidDensityKgM3 = liquidMassFlowKgS / liquidVolumetricFlowM3S;
  const gasDensityKgM3 = 5;
  const totalMassFlowKgS = gasMassFlowKgS + liquidMassFlowKgS;
  const totalVolumetricFlowM3S = (5436 + 326 + 532) / 3600;
  const effectiveDensityKgM3 = totalMassFlowKgS / totalVolumetricFlowM3S;
  return {
    common: {
      phase: 'MULTIPHASE',
      outsideDiameterM: 0.508,
      wallThicknessM: 0.009525,
      maximumUnsupportedSpanM: 5,
    },
    aggregate: { massFlowKgS: totalMassFlowKgS, densityKgM3: effectiveDensityKgM3 },
    components: { gasMassFlowKgS, gasDensityKgM3, liquidMassFlowKgS, liquidDensityKgM3 },
  };
}

test('EI benchmark tolerance policy is independently reconciled and non-authorizing', () => {
  assert.equal(benchmarkSet.engineeringAuthority, 'BENCHMARK_ONLY');
  assert.equal(benchmarkSet.digitizedSource.repository, 'reallaksh19/Advanced_Analysis');
  assert.equal(benchmarkSet.digitizedSource.commit, '04328852dced9f5c4827da8afe8a82aeb8b1a1d3');
  assert.equal(benchmarkSet.digitizedSource.authority, 'CORROBORATING_TRANSCRIPTION_ONLY');
  assert.equal(benchmarkSet.tolerancePolicy.id, 'FIT-EI-PUBLISHED-RECONCILIATION-V1');
  assert.equal(benchmarkSet.tolerancePolicy.authority, 'BENCHMARK_RECONCILIATION_ONLY');
  assert.equal(benchmarkSet.tolerancePolicy.screeningPromotionState, 'RECONCILED_FOR_BENCHMARK_USE');
  assert.match(benchmarkSet.tolerancePolicy.basis, /INDEPENDENT_RECALCULATION/u);
  assert.equal(Object.hasOwn(benchmarkSet, 'roundingPolicy'), false);
  for (const row of benchmarkSet.cases) {
    assert(Number.isFinite(row.tolerance?.rhoV2Pa));
    assert(Number.isFinite(row.tolerance?.fluidViscosityFactor));
    assert(Number.isFinite(row.tolerance?.standardFvPa));
    assert(Number.isFinite(row.tolerance?.standardLof));
    assert.match(row.independentRecalculation?.basis ?? '', /equation register/u);
  }
});


test('EI D2.1 benchmark pack preserves all eight published FIT rows', () => {
  const d2Ids = benchmarkSet.cases
    .filter((row) => row.id.startsWith('EI-D2-FIT-'))
    .map((row) => row.id)
    .sort();
  assert.deepEqual(d2Ids, [
    'EI-D2-FIT-RECYCLE-DISCHARGE-8IN',
    'EI-D2-FIT-RECYCLE-SUCTION-6IN',
    'EI-D2-FIT-RELIEF-DOWNSTREAM-6IN',
    'EI-D2-FIT-RELIEF-UPSTREAM-4IN',
    'EI-D2-FIT-STREAM-4-SUPPLY-COOLER-14IN',
    'EI-D2-FIT-STREAM-5-SUCTION-SCRUBBER-14IN',
    'EI-D2-FIT-STREAM-6-COMPRESSOR-SUCTION-14IN',
    'EI-D2-FIT-STREAM-7-COMPRESSOR-DISCHARGE-8IN',
  ]);
});

for (const row of benchmarkSet.cases) {
  test(`${row.id}: reproduces published EI FIT worked-example result`, () => {
    const result = calculateFit(row.input);
    assert.equal(result.ok, true, `${row.id}: ${JSON.stringify(result)}`);
    assert.equal(result.support.stiffness, row.published.supportStiffness, row.id);
    if (row.published.supportCategory) assert.equal(result.support.category, row.published.supportCategory, row.id);
    closePublished(result.excitation.rhoV2, row.published.rhoV2Pa, row.tolerance.rhoV2Pa);
    closePublished(result.standard.fluidViscosityFactor,
      row.published.fluidViscosityFactor, row.tolerance.fluidViscosityFactor);
    closePublished(result.standard.correlation.fv, row.published.standardFvPa, row.tolerance.standardFvPa);
    closePublished(result.standard.lof, row.published.standardLof, row.tolerance.standardLof);
    assert.equal(assessFit(result).referenceBand, row.published.referenceBand, row.id);
    assert.equal(result.qualification.method, 'SCREENING');
    assert.equal(result.qualification.data, 'SCREENING');
    assert.equal(result.qualification.designAuthority, false);
  });
}

test('EI boundary: advanced FIT is excluded at exactly 1 Hz and allowed at exactly 3 Hz', () => {
  const base = {
    phase: 'LIQUID',
    outsideDiameterM: 0.1683,
    wallThicknessM: 0.00711,
    maximumUnsupportedSpanM: 10,
    densityKgM3: 1000,
    fluidVelocityMS: 1.6589405806551936,
  };
  const atOne = calculateFit({ ...base, naturalFrequencyHz: 1 });
  assert.equal(atOne.ok, true, JSON.stringify(atOne));
  assert(atOne.standard.lof >= 1);
  assert.equal(atOne.advanced, null);
  assert.equal(atOne.advancedEligibility.reason, 'NATURAL_FREQUENCY_OUTSIDE_DECLARED_RANGE');

  const atThree = calculateFit({ ...base, naturalFrequencyHz: 3 });
  assert.equal(atThree.ok, true, JSON.stringify(atThree));
  assert.equal(atThree.advancedEligibility.eligible, true);
  assert(atThree.advanced);
});

test('EI D4 boundary: 273 mm flexible line resolves to FLEXIBLE_LARGE', () => {
  const row = benchmarkSet.cases.find((item) => item.id === 'EI-D4-FIT-PRODUCED-WATER-10IN');
  const result = calculateFit(row.input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.support.stiffness, 'FLEXIBLE');
  assert.equal(result.support.category, 'FLEXIBLE_LARGE');
});

test('multiphase aggregate effective inputs and component-derived inputs converge when each shape is unambiguous', () => {
  const { common, aggregate: aggregateInput, components: componentInput } = d4EquivalentInputs();
  const aggregate = calculateFit({ ...common, ...aggregateInput });
  const components = calculateFit({ ...common, ...componentInput });

  assert.equal(aggregate.ok, true, JSON.stringify(aggregate));
  assert.equal(components.ok, true, JSON.stringify(components));
  assert.equal(aggregate.hydraulics.resolutionMode, 'AGGREGATE_EFFECTIVE');
  assert.equal(aggregate.hydraulics.resolutionModeSelection, 'INFERRED');
  assert.equal(components.hydraulics.resolutionMode, 'COMPONENT_DERIVED');
  assert.equal(components.hydraulics.resolutionModeSelection, 'INFERRED');
  closeExact(aggregate.hydraulics.velocityMS, components.hydraulics.velocityMS);
  closeExact(aggregate.excitation.densityKgM3, components.excitation.densityKgM3);
  closeExact(aggregate.standard.lof, components.standard.lof);
});

test('mixed multiphase input shapes fail closed without an explicit resolution mode', () => {
  const { common, aggregate, components } = d4EquivalentInputs();
  const result = calculateFit({ ...common, ...aggregate, ...components });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert(result.errors.some((error) => error.code === 'FIT_MULTIPHASE_INPUT_AMBIGUOUS'));
});

test('explicit aggregate multiphase mode is deterministic when both data shapes are supplied', () => {
  const { common, aggregate, components } = d4EquivalentInputs();
  const result = calculateFit({
    ...common,
    ...aggregate,
    ...components,
    multiphaseResolutionMode: 'AGGREGATE_EFFECTIVE',
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.hydraulics.resolutionMode, 'AGGREGATE_EFFECTIVE');
  assert.equal(result.hydraulics.resolutionModeSelection, 'EXPLICIT');
  assert.equal(result.hydraulics.alternateModeDataPresent, true);
  assert.equal(result.evidence.inputResolution.selection, 'EXPLICIT');
});

test('explicit component multiphase mode is deterministic when both data shapes are supplied', () => {
  const { common, aggregate, components } = d4EquivalentInputs();
  const result = calculateFit({
    ...common,
    ...aggregate,
    ...components,
    multiphaseResolutionMode: 'COMPONENT_DERIVED',
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.hydraulics.resolutionMode, 'COMPONENT_DERIVED');
  assert.equal(result.hydraulics.resolutionModeSelection, 'EXPLICIT');
  assert.equal(result.hydraulics.alternateModeDataPresent, true);
  assert.equal(result.evidence.inputResolution.selection, 'EXPLICIT');
});

test('invalid explicit multiphase mode fails validation', () => {
  const { common, aggregate } = d4EquivalentInputs();
  const result = calculateFit({
    ...common,
    ...aggregate,
    multiphaseResolutionMode: 'AUTO',
  });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert(result.errors.some((error) => error.code === 'FIT_INPUT_INVALID' && error.field === 'multiphaseResolutionMode'));
});
