import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { VIBRATION_FIT_ENGINEERING_CALCULATION_DEFINITION } from '../converters/engineering-calculations/adapters/vibration-fit.js';
import {
  FIT_QUALIFICATION_EVIDENCE_STRENGTH,
  FIT_SCREENING_QUALIFICATION_BASIS,
  calculateFit,
} from '../converters/vibration/fit/index.js';

const eiBenchmarks = JSON.parse(fs.readFileSync(
  new URL('../Benchmarks/VibrationFIT/fit-ei-worked-examples-v1.json', import.meta.url),
  'utf8',
));

function eiCase(id) {
  return eiBenchmarks.cases.find((row) => row.id === id);
}

function assertScreeningAuthority(coverage) {
  assert.equal(coverage.coverageId, 'FIT-REFERENCE-COVERAGE-V1');
  assert.equal(coverage.screeningQualified, true);
  assert.equal(coverage.engineeringAuthority, 'SCREENING');
  assert.equal(coverage.qualificationBasis, FIT_SCREENING_QUALIFICATION_BASIS);
  assert.equal(coverage.qualificationBasis.productPathBenchmarkId, 'EI-D4-FIT-PRODUCED-WATER-10IN');
  assert.equal(coverage.qualificationBasis.designAuthority, false);
  assert(Object.isFrozen(coverage));
}

test('EI D2 medium-stiff gas result reports published-example coverage with bounded screening authority', () => {
  const result = calculateFit(eiCase('EI-D2-FIT-RECYCLE-SUCTION-6IN').input);
  assert.equal(result.ok, true, JSON.stringify(result));
  const coverage = result.qualificationCoverage;
  assertScreeningAuthority(coverage);
  assert.equal(coverage.phasePath.path, 'SINGLE_PHASE_GAS');
  assert.equal(coverage.phasePath.evidenceStrength, FIT_QUALIFICATION_EVIDENCE_STRENGTH.EI_PUBLISHED_EXAMPLE);
  assert.equal(coverage.phasePath.eiPublishedExampleCoverage, true);
  assert.equal(coverage.standardCorrelation.supportCategory, 'MEDIUM_STIFF');
  assert.equal(coverage.standardCorrelation.eiPublishedExampleCoverage, true);
  assert(coverage.standardCorrelation.evidenceIds.includes('EI-D2-FIT-RECYCLE-SUCTION-6IN'));
  assert.equal(result.evidence.qualificationCoverage, coverage);
});

test('EI D4 aggregate multiphase and flexible-large liquid slices retain published-example coverage', () => {
  const separator = calculateFit(eiCase('EI-D4-FIT-SEPARATOR-INLET-20IN').input);
  assert.equal(separator.ok, true, JSON.stringify(separator));
  assertScreeningAuthority(separator.qualificationCoverage);
  assert.equal(separator.qualificationCoverage.phasePath.path, 'MULTIPHASE_AGGREGATE_EFFECTIVE');
  assert.equal(separator.qualificationCoverage.phasePath.eiPublishedExampleCoverage, true);
  assert.equal(separator.qualificationCoverage.phasePath.equivalenceCoverage, true);
  assert.equal(separator.qualificationCoverage.standardCorrelation.supportCategory, 'STIFF');
  assert.equal(separator.qualificationCoverage.standardCorrelation.eiPublishedExampleCoverage, true);

  const water = calculateFit(eiCase('EI-D4-FIT-PRODUCED-WATER-10IN').input);
  assert.equal(water.ok, true, JSON.stringify(water));
  assertScreeningAuthority(water.qualificationCoverage);
  assert.equal(water.qualificationCoverage.phasePath.path, 'SINGLE_PHASE_LIQUID');
  assert.equal(water.qualificationCoverage.standardCorrelation.supportCategory, 'FLEXIBLE_LARGE');
  assert.equal(water.qualificationCoverage.standardCorrelation.evidenceStrength, FIT_QUALIFICATION_EVIDENCE_STRENGTH.EI_PUBLISHED_EXAMPLE);
  assert.equal(water.qualificationCoverage.standardCorrelation.eiPublishedExampleCoverage, true);
});

test('medium-small standard correlation has explicit independent hand-benchmark screening evidence', () => {
  const mediumSmall = calculateFit({
    phase: 'LIQUID',
    outsideDiameterM: 0.1683,
    wallThicknessM: 0.00711,
    maximumUnsupportedSpanM: 8.5,
    densityKgM3: 1000,
    fluidVelocityMS: 1.2,
  });
  assert.equal(mediumSmall.ok, true, JSON.stringify(mediumSmall));
  assert.equal(mediumSmall.support.category, 'MEDIUM_SMALL');
  const evidence = mediumSmall.qualificationCoverage.standardCorrelation;
  assert.equal(evidence.evidenceStrength, FIT_QUALIFICATION_EVIDENCE_STRENGTH.INDEPENDENT_HAND_BENCHMARK);
  assert.equal(evidence.eiPublishedExampleCoverage, false);
  assert.equal(evidence.independentHandBenchmarkCoverage, true);
  assert.equal(evidence.noIndependentExample, false);
  assert(evidence.evidenceIds.includes('FIT-HAND-LIQ-MEDIUM-SMALL-008'));
  assertScreeningAuthority(mediumSmall.qualificationCoverage);
});

test('medium-large standard correlation retains independent hand-benchmark screening evidence', () => {
  const mediumLarge = calculateFit({
    phase: 'LIQUID',
    outsideDiameterM: 0.508,
    wallThicknessM: 0.009525,
    maximumUnsupportedSpanM: 15,
    densityKgM3: 1000,
    fluidVelocityMS: 1,
  });
  assert.equal(mediumLarge.ok, true, JSON.stringify(mediumLarge));
  assert.equal(mediumLarge.support.category, 'MEDIUM_LARGE');
  assert.equal(mediumLarge.qualificationCoverage.standardCorrelation.evidenceStrength, FIT_QUALIFICATION_EVIDENCE_STRENGTH.INDEPENDENT_HAND_BENCHMARK);
  assert.equal(mediumLarge.qualificationCoverage.standardCorrelation.eiPublishedExampleCoverage, false);
  assert.equal(mediumLarge.qualificationCoverage.standardCorrelation.independentHandBenchmarkCoverage, true);
  assertScreeningAuthority(mediumLarge.qualificationCoverage);
});

test('advanced flexible-small and flexible-large both have independent screening evidence', () => {
  const small = calculateFit({
    phase: 'LIQUID',
    outsideDiameterM: 0.1683,
    wallThicknessM: 0.00711,
    maximumUnsupportedSpanM: 10,
    densityKgM3: 1000,
    fluidVelocityMS: 1.6589405806551936,
    naturalFrequencyHz: 2,
  });
  assert.equal(small.ok, true, JSON.stringify(small));
  assert(small.advanced);
  assert.equal(small.support.category, 'FLEXIBLE_SMALL');
  assert.equal(small.qualificationCoverage.advancedCorrelation.evidenceStrength, FIT_QUALIFICATION_EVIDENCE_STRENGTH.INDEPENDENT_HAND_BENCHMARK);
  assert.equal(small.qualificationCoverage.referenceBand.evidenceStrength, FIT_QUALIFICATION_EVIDENCE_STRENGTH.INDEPENDENT_HAND_BENCHMARK);
  assert(small.qualificationCoverage.referenceBand.evidenceIds.includes('FIT-HAND-FLEX-SMALL-LOF-105-FN2'));
  assertScreeningAuthority(small.qualificationCoverage);

  const large = calculateFit({
    phase: 'LIQUID',
    outsideDiameterM: 0.3239,
    wallThicknessM: 0.00953,
    maximumUnsupportedSpanM: 15,
    densityKgM3: 1000,
    fluidVelocityMS: 1.7348455398663403,
    naturalFrequencyHz: 2,
  });
  assert.equal(large.ok, true, JSON.stringify(large));
  assert(large.advanced);
  assert.equal(large.support.category, 'FLEXIBLE_LARGE');
  assert.equal(large.qualificationCoverage.advancedCorrelation.evidenceStrength, FIT_QUALIFICATION_EVIDENCE_STRENGTH.INDEPENDENT_HAND_BENCHMARK);
  assert.equal(large.qualificationCoverage.advancedCorrelation.independentHandBenchmarkCoverage, true);
  assert(large.qualificationCoverage.advancedCorrelation.noIndependentExample, false);
  assert(large.qualificationCoverage.advancedCorrelation.evidenceIds.includes('FIT-HAND-FLEX-LARGE-LOF-120-FN2-009'));
  assert(large.qualificationCoverage.referenceBand.evidenceIds.includes('FIT-HAND-FLEX-LARGE-LOF-120-FN2-009'));
  assertScreeningAuthority(large.qualificationCoverage);
});

test('central FIT adapter exposes screening-qualified coverage while benchmark replay remains non-authorizing', () => {
  const row = eiCase('EI-D2-FIT-RELIEF-UPSTREAM-4IN');
  const input = row.input;
  const canonical = {
    phase: input.phase,
    outsideDiameter: input.outsideDiameterM,
    wallThickness: input.wallThicknessM,
    insideDiameter: input.insideDiameterM,
    maximumUnsupportedSpan: input.maximumUnsupportedSpanM,
    massFlow: input.massFlowKgS,
    density: input.densityKgM3,
    gasDynamicViscosity: input.gasDynamicViscosityPaS,
  };
  const benchmark = VIBRATION_FIT_ENGINEERING_CALCULATION_DEFINITION.calculate(
    canonical,
    { options: { qualificationMode: 'benchmark' } },
  );
  assert.equal(benchmark.ok, true, JSON.stringify(benchmark));
  assert.equal(benchmark.qualification.method, 'BENCHMARK_ONLY');
  assert.equal(benchmark.qualification.designAuthority, false);
  assert.equal(benchmark.evidence.qualificationCoverage.screeningQualified, true);
  assert.equal(benchmark.evidence.qualificationCoverage.engineeringAuthority, 'SCREENING');

  const screening = VIBRATION_FIT_ENGINEERING_CALCULATION_DEFINITION.calculate(
    canonical,
    { options: { qualificationMode: 'screening' } },
  );
  assert.equal(screening.ok, true, JSON.stringify(screening));
  assert.equal(screening.qualification.effective, 'SCREENING');
  assert.equal(screening.qualification.designAuthority, false);
  assert.equal(screening.provenance.engineeringAuthority, 'SCREENING');
  assert.equal(screening.provenance.qualificationCoverageId, 'FIT-REFERENCE-COVERAGE-V1');
});
