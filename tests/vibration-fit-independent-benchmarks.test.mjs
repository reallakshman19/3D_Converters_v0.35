import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { VIBRATION_FIT_ENGINEERING_CALCULATION_DEFINITION } from '../converters/engineering-calculations/adapters/vibration-fit.js';
import { createEngineeringCalculationEngine } from '../converters/engineering-calculations/engine.js';
import { createEngineeringCalculationRegistry } from '../converters/engineering-calculations/registry.js';
import {
  assessFit,
  calculateFit,
  classifyFitSupportStiffness,
  fitSpanBoundaries,
} from '../converters/vibration/fit/index.js';

const benchmarkSet = JSON.parse(fs.readFileSync(
  new URL('../Benchmarks/VibrationFIT/fit-independent-hand-benchmarks-v1.json', import.meta.url),
  'utf8',
));

const FIT_ENGINE = createEngineeringCalculationEngine({
  registry: createEngineeringCalculationRegistry({
    definitions: [VIBRATION_FIT_ENGINEERING_CALCULATION_DEFINITION],
  }),
  implementationRevision: 'fit-independent-benchmark-test',
  clock: () => '2026-08-11T00:00:00.000Z',
});

function close(actual, expected, relativeTolerance = 1e-10, absoluteTolerance = 1e-12) {
  const tolerance = Math.max(absoluteTolerance, Math.abs(expected) * relativeTolerance);
  assert(Number.isFinite(actual), `Expected finite value, received ${actual}`);
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} within ${tolerance}`);
}

function checkStandardCase(row) {
  const result = calculateFit(row.input);
  assert.equal(result.ok, true, `${row.id}: ${JSON.stringify(result)}`);
  const expected = row.expected;
  if (expected.supportStiffness) assert.equal(result.support.stiffness, expected.supportStiffness, row.id);
  if (expected.supportCategory) assert.equal(result.support.category, expected.supportCategory, row.id);
  if (expected.insideDiameterM !== undefined) close(result.hydraulics.insideDiameterM, expected.insideDiameterM);
  if (expected.flowAreaM2 !== undefined) close(result.hydraulics.flowAreaM2, expected.flowAreaM2);
  if (expected.gasVolumetricFlowM3S !== undefined) close(result.hydraulics.gasVolumetricFlowM3S, expected.gasVolumetricFlowM3S);
  if (expected.liquidVolumetricFlowM3S !== undefined) close(result.hydraulics.liquidVolumetricFlowM3S, expected.liquidVolumetricFlowM3S);
  if (expected.velocityMS !== undefined) close(result.hydraulics.velocityMS, expected.velocityMS);
  if (expected.mixtureDensityKgM3 !== undefined) close(result.excitation.densityKgM3, expected.mixtureDensityKgM3);
  if (expected.rhoV2Pa !== undefined) close(result.excitation.rhoV2, expected.rhoV2Pa);
  if (expected.fluidViscosityFactor !== undefined) close(result.standard.fluidViscosityFactor, expected.fluidViscosityFactor);
  if (expected.demandPa !== undefined) close(result.standard.demand, expected.demandPa);
  close(result.standard.correlation.fv, expected.standardFvPa);
  close(result.standard.lof, expected.standardLof);
  assert.equal(result.advancedEligibility.eligible, expected.advancedEligible, row.id);
  if (expected.governingReferenceLof !== undefined) close(result.governingReferenceLof, expected.governingReferenceLof);
  return result;
}

test('independent FIT benchmark set declares software-transcription authority only', () => {
  assert.equal(benchmarkSet.benchmarkSetId, 'FIT-INDEPENDENT-HAND-BENCHMARKS-V1');
  assert.equal(benchmarkSet.authority, 'SOFTWARE_TRANSCRIPTION_BENCHMARK_ONLY');
  assert.equal(benchmarkSet.engineeringAuthority, 'NONE');
  assert.match(benchmarkSet.origin, /not copied from retained workbook cached outputs/u);
});

for (const row of benchmarkSet.cases) {
  test(`${row.id}: independent hand-derived standard case`, () => {
    checkStandardCase(row);
  });
}

for (const row of benchmarkSet.thresholdCases) {
  test(`${row.id}: independent threshold/advanced case`, () => {
    const result = calculateFit(row.input);
    assert.equal(result.ok, true, `${row.id}: ${JSON.stringify(result)}`);
    assert.equal(result.support.category, row.expected.supportCategory, row.id);
    close(result.standard.correlation.fv, row.expected.standardFvPa);
    close(result.standard.lof, row.expected.standardLof);
    assert.equal(result.advancedEligibility.eligible, row.expected.advancedEligible, row.id);
    if (row.expected.advancedFvPa !== undefined) {
      assert(result.advanced, `${row.id}: expected advanced result`);
      close(result.advanced.correlation.fv, row.expected.advancedFvPa);
      close(result.advanced.lof, row.expected.refinedLof);
    } else {
      assert.equal(result.advanced, null, row.id);
    }
    assert.equal(assessFit(result).status, row.expected.assessmentStatus, row.id);
  });
}

test('FIT-HAND-SUPPORT-BOUNDARY-004: support boundary inclusivity matches controlled specification', () => {
  const row = benchmarkSet.supportBoundaryCase;
  const boundaries = fitSpanBoundaries(row.diameterMm);
  for (const [key, expected] of Object.entries(row.expectedBoundariesM)) close(boundaries[key], expected);
  for (const check of row.classificationChecks) {
    assert.equal(classifyFitSupportStiffness(check.spanM, boundaries), check.expectedStiffness, JSON.stringify(check));
  }
});

test('FIT-HAND-GAS-UNIT-INVARIANCE-005: central benchmark execution is SI/US invariant', () => {
  const row = benchmarkSet.unitInvariantGasCase;
  const run = (inputs, inputUnits) => FIT_ENGINE.calculate({
    calculationId: 'VIB.FIV.FLOW_TURBULENCE',
    inputs,
    inputUnits,
    options: { qualificationMode: 'benchmark', includeEvidence: true },
  });
  const si = run(row.siInput, row.siUnits);
  const us = run(row.usInput, row.usUnits);
  assert.equal(si.ok, true, JSON.stringify(si));
  assert.equal(us.ok, true, JSON.stringify(us));
  close(si.outputs.standardFv, row.expected.standardFvPa);
  close(si.outputs.standardLof, row.expected.standardLof);
  close(us.outputs.standardFv, si.outputs.standardFv);
  close(us.outputs.standardLof, si.outputs.standardLof);
  assert.equal(si.qualification.effective, 'BENCHMARK_ONLY');
  assert.equal(us.qualification.effective, 'BENCHMARK_ONLY');
  assert.equal(si.qualification.designAuthority, false);
  assert.equal(us.qualification.designAuthority, false);
});

test('FIT-HAND-GAP-FAIL-006: unresolved manual-diameter family remains fail-closed', () => {
  const row = benchmarkSet.failClosedCases.find((item) => item.id === 'FIT-HAND-GAP-FAIL-006');
  const result = calculateFit(row.input);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert(result.errors.some((error) => error.code === row.expectedErrorCode));
});

test('FIT-HAND-FN4-NO-ADVANCED-007: 4 Hz never enters the advanced reference path', () => {
  const row = benchmarkSet.failClosedCases.find((item) => item.id === 'FIT-HAND-FN4-NO-ADVANCED-007');
  const result = calculateFit(row.input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.advanced, null);
  assert.equal(result.advancedEligibility.reason, row.expectedAdvancedEligibilityReason);
  assert.equal(assessFit(result).status, 'REFERENCE_FURTHER_ENGINEERING_ASSESSMENT_REQUIRED');
});
