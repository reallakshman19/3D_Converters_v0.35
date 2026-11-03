import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateEngineering,
  getEngineeringCalculationDefinition,
  resolveEngineeringCalculationInputs,
} from '../converters/engineering-calculations/index.js';
import { calculateChapterIxStraightPressure } from '../converters/b313-chapter-ix/straight-pipe.js';
import { calculateChapterIxWallState } from '../converters/b313-chapter-ix/wall-state.js';
import { evaluateChapterIxQualificationPackage } from '../converters/b313-chapter-ix/qualification-package.js';

const REGRESSION_INPUT = Object.freeze({
  outsideDiameter: 114.3,
  designPressure: 20,
  allowableStress: 138,
  internalAllowance: 3,
  externalAllowance: 0,
  minusTolerancePct: 12.5,
  providedNominalThickness: 13.49,
});

const DOMAIN_REGRESSION_INPUT = Object.freeze({
  outsideDiameterMm: 114.3,
  designPressureMpa: 20,
  allowableStressMpa: 138,
  internalAllowanceMm: 3,
  externalAllowanceMm: 0,
  minusTolerancePct: 12.5,
  providedNominalThicknessMm: 13.49,
});

const WALL_STATE_INPUT = Object.freeze({
  nominalWall: 13.49,
  minusTolerancePct: 12.5,
  internalServiceAllowance: 3,
  externalServiceAllowance: 0,
});

function close(actual, expected, tolerance = 1e-10) {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('Chapter IX domain kernel reproduces frozen NPS 4 software regression', () => {
  const result = calculateChapterIxStraightPressure(DOMAIN_REGRESSION_INPUT);
  assert.equal(result.ok, true, JSON.stringify(result));
  close(result.pressureDesignThicknessMm, 7.7103934983403475);
  close(result.requiredMinimumThicknessMm, 10.710393498340348);
  close(result.requiredNominalThicknessMm, 12.240449712388969);
  close(result.minimumAsManufacturedThicknessMm, 11.80375);
  close(result.effectiveNetWallMm, 8.80375);
  close(result.pressureRatingMpa, 23.086120852009273);
  close(result.pressureRatingMargin, 1.1543060426004637);
  assert.equal(result.staticPass, true);
});

test('Chapter IX domain kernel fails closed on invalid tolerance and effective wall', () => {
  const tolerance = calculateChapterIxStraightPressure({
    ...DOMAIN_REGRESSION_INPUT,
    minusTolerancePct: 100,
  });
  assert.equal(tolerance.ok, false);
  assert.equal(tolerance.code, 'INPUT_INVALID');

  const effectiveWall = calculateChapterIxStraightPressure({
    ...DOMAIN_REGRESSION_INPUT,
    providedNominalThicknessMm: 3,
  });
  assert.equal(effectiveWall.ok, false);
  assert.equal(effectiveWall.code, 'INPUT_INVALID');
  assert.match(effectiveWall.message, /non-positive effective net wall/i);
});

test('Chapter IX wall-state kernel preserves explicit greenfield and brownfield custody', () => {
  const greenfield = calculateChapterIxWallState({
    nominalWallMm: 13.49,
    minusTolerancePct: 12.5,
    internalServiceAllowanceMm: 3,
    externalServiceAllowanceMm: 0,
  });
  assert.equal(greenfield.ok, true, JSON.stringify(greenfield));
  close(greenfield.minimumAsManufacturedWallMm, 11.80375);
  close(greenfield.beginOfLifeConservativeWallMm, 11.80375);
  close(greenfield.reservedServiceLossMm, 3);
  close(greenfield.endOfLifeEffectiveWallMm, 8.80375);

  const brownfield = calculateChapterIxWallState({
    nominalWallMm: 13.49,
    minusTolerancePct: 12.5,
    internalServiceAllowanceMm: 3,
    externalServiceAllowanceMm: 0,
    measuredCurrentWallMm: 10.2,
    futureInternalLossMm: 1.2,
    futureExternalLossMm: 0.3,
  });
  assert.equal(brownfield.ok, true, JSON.stringify(brownfield));
  close(brownfield.futureServiceLossMm, 1.5);
  close(brownfield.projectedEndOfLifeWallMm, 8.7);
});

test('Chapter IX wall-state kernel rejects ambiguous or non-positive wall projections', () => {
  const orphan = calculateChapterIxWallState({
    nominalWallMm: 13.49,
    minusTolerancePct: 12.5,
    internalServiceAllowanceMm: 3,
    externalServiceAllowanceMm: 0,
    futureInternalLossMm: 1,
  });
  assert.equal(orphan.ok, false);
  assert.equal(orphan.details.field, 'measuredCurrentWallMm');

  const greenfield = calculateChapterIxWallState({
    nominalWallMm: 3,
    minusTolerancePct: 12.5,
    internalServiceAllowanceMm: 3,
    externalServiceAllowanceMm: 0,
  });
  assert.equal(greenfield.ok, false);
  assert.match(greenfield.message, /non-positive end-of-life effective wall/i);

  const brownfield = calculateChapterIxWallState({
    nominalWallMm: 13.49,
    minusTolerancePct: 12.5,
    internalServiceAllowanceMm: 3,
    externalServiceAllowanceMm: 0,
    measuredCurrentWallMm: 1,
    futureInternalLossMm: 1,
    futureExternalLossMm: 0.2,
  });
  assert.equal(brownfield.ok, false);
  assert.match(brownfield.message, /non-positive projected end-of-life wall/i);
});

test('central catalogue exposes Chapter IX static and wall state as benchmark-only', () => {
  for (const id of ['PIPE.B313.CH9.STRAIGHT_PRESSURE', 'PIPE.B313.CH9.WALL_STATE']) {
    const definition = getEngineeringCalculationDefinition(id);
    assert.equal(definition.authority.calculationState, 'IMPLEMENTED');
    assert.equal(definition.authority.qualificationState, 'BENCHMARK_ONLY');
    assert.equal(definition.authority.codeCompliance, false);
    assert.equal(definition.ui.requiredQualificationMode, 'benchmark');
    assert.equal(definition.ui.productSurface, 'ENGINEERING_CALCULATIONS');
    assert(definition.inputs.every((field) => field.engineeringDefault === undefined));
  }
});

test('central Chapter IX execution blocks default/strict/screening modes', () => {
  for (const mode of [undefined, 'strict', 'screening']) {
    const result = calculateEngineering({
      calculationId: 'PIPE.B313.CH9.STRAIGHT_PRESSURE',
      inputs: REGRESSION_INPUT,
      ...(mode ? { options: { qualificationMode: mode } } : {}),
    });
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, 'ENGINEERING_METHOD_NOT_QUALIFIED');
    assert.equal(result.qualification.effective, 'BENCHMARK_ONLY');
    assert.equal(result.qualification.designAuthority, false);
    assert.equal(Object.hasOwn(result, 'outputs'), false);
  }
});

test('central Chapter IX benchmark mode reproduces frozen static results', () => {
  const result = calculateEngineering({
    calculationId: 'PIPE.B313.CH9.STRAIGHT_PRESSURE',
    inputs: REGRESSION_INPUT,
    options: { qualificationMode: 'benchmark', includeEvidence: true },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  close(result.outputs.pressureDesignThicknessMm, 7.7103934983403475);
  close(result.outputs.requiredMinimumThicknessMm, 10.710393498340348);
  close(result.outputs.minimumAsManufacturedThicknessMm, 11.80375);
  close(result.outputs.effectiveNetWallMm, 8.80375);
  close(result.outputs.pressureRatingMpa, 23.086120852009273);
  assert.equal(result.outputs.staticPass, true);
  assert.equal(result.checks.length, 2);
  assert(result.checks.every((check) => check.status === 'PASS'));
  assert.equal(result.assessment.status, 'REFERENCE_PASS');
  assert.equal(result.qualification.effective, 'BENCHMARK_ONLY');
  assert.equal(result.qualification.designAuthority, false);
  assert.equal(result.provenance.engineeringAuthority, 'SOFTWARE_REGRESSION_ONLY');
  assert.equal(result.provenance.codeCompliance, false);
});

test('central Chapter IX wall-state benchmark exposes explicit state labels only', () => {
  const result = calculateEngineering({
    calculationId: 'PIPE.B313.CH9.WALL_STATE',
    inputs: {
      ...WALL_STATE_INPUT,
      measuredCurrentWall: 10.2,
      futureInternalLoss: 1.2,
      futureExternalLoss: 0.3,
    },
    options: { qualificationMode: 'benchmark', includeEvidence: true },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  close(result.outputs.minimumAsManufacturedWallMm, 11.80375);
  close(result.outputs.endOfLifeEffectiveWallMm, 8.80375);
  close(result.outputs.projectedEndOfLifeWallMm, 8.7);
  assert.equal(result.assessment.status, 'TRACE_ONLY');
  assert.equal(result.assessment.pass, null);
  assert.equal(result.qualification.effective, 'BENCHMARK_ONLY');
  assert.equal(result.qualification.designAuthority, false);
  assert.equal(result.provenance.engineeringAuthority, 'INPUT_CUSTODY_ONLY');
  assert.equal(result.provenance.codeCompliance, false);
});

test('central resolver preserves explicit unit conversion without engineering defaults', () => {
  const resolved = resolveEngineeringCalculationInputs(
    'PIPE.B313.CH9.STRAIGHT_PRESSURE',
    {
      ...REGRESSION_INPUT,
      designPressure: 200,
    }, {},
    {
      inputUnits: {
        outsideDiameter: 'mm',
        designPressure: 'barg',
        allowableStress: 'MPa',
        internalAllowance: 'mm',
        externalAllowance: 'mm',
        providedNominalThickness: 'mm',
      },
      qualificationMode: 'benchmark',
    },
  );
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  close(resolved.canonicalInput.designPressure, 20);
  assert.equal(resolved.canonicalInput.minusTolerancePct, 12.5);
});

test('Chapter IX qualification package keeps seed-like source records SOURCE_PENDING', () => {
  const result = evaluateChapterIxQualificationPackage({
    packageVersion: 'b313-ch9-qualification-package/v1',
    scope: 'STRAIGHT_PIPE_STATIC',
    method: { methodId: 'B313-CH9-STATIC-2024-R1', methodRevision: '1.0.0', b313Edition: '2024' },
    sources: [{
      role: 'B313_CHAPTER_IX', sourceId: 'SRC-B313-2024', standard: 'ASME B31.3', edition: '2024',
      documentHash: 'sha256:d8b72f1a94e803c4a22c56e3b091f6e27b68903c71ea63a756b19a7102e3b901',
      status: 'ACTIVE', verifiedBy: 'LEAD_PE', verifiedAt: '2026-01-15T08:00:00Z',
    }],
    benchmarks: [],
  });
  assert.equal(result.ok, true);
  assert.equal(result.packageState, 'SOURCE_PENDING');
  assert.equal(result.evidenceComplete, false);
  assert.equal(result.canPromoteCalculationAuthority, false);
  assert(result.issues.some((row) => row.code === 'QUAL_SOURCE_NOT_CHECKED'));
});

test('Chapter IX qualification package requires independent finite numerical benchmark evidence', () => {
  const source = {
    role: 'B313_CHAPTER_IX', sourceId: 'SRC-CONTROLLED', standard: 'ASME B31.3', edition: '2024',
    documentHash: `sha256:${'a'.repeat(64)}`,
    controlledSourceVerified: true, status: 'INDEPENDENTLY_CHECKED',
    verifiedBy: 'TRANSCRIBER_A', independentCheckBy: 'CHECKER_B',
    verifiedAt: '2026-08-15T10:00:00Z', independentCheckedAt: '2026-08-15T11:00:00Z',
  };
  const pending = evaluateChapterIxQualificationPackage({
    packageVersion: 'b313-ch9-qualification-package/v1', scope: 'STRAIGHT_PIPE_STATIC',
    method: { methodId: 'M-STATIC-24', methodRevision: '1.0.0', b313Edition: '2024' },
    sources: [source],
    benchmarks: [{
      benchmarkId: 'B-001', methodId: 'M-STATIC-24', sourceId: 'SRC-CONTROLLED',
      independent: true, status: 'INDEPENDENTLY_CHECKED', producedBy: 'CALC_A', reviewedBy: 'CALC_B',
      expected: { pressureDesignThicknessMm: 1, requiredMinimumThicknessMm: 2 },
    }],
  });
  assert.equal(pending.packageState, 'BENCHMARK_PENDING');
  assert(pending.issues.some((row) => row.code === 'QUAL_BENCHMARK_EXPECTED'));

  const complete = evaluateChapterIxQualificationPackage({
    packageVersion: 'b313-ch9-qualification-package/v1', scope: 'STRAIGHT_PIPE_STATIC',
    method: { methodId: 'M-STATIC-24', methodRevision: '1.0.0', b313Edition: '2024' },
    sources: [source],
    benchmarks: [{
      benchmarkId: 'B-002', methodId: 'M-STATIC-24', sourceId: 'SRC-CONTROLLED',
      independent: true, status: 'INDEPENDENTLY_CHECKED', producedBy: 'CALC_A', reviewedBy: 'CALC_B',
      expected: { pressureDesignThicknessMm: 1, requiredMinimumThicknessMm: 2, pressureRatingMpa: 3 },
    }],
  });
  assert.equal(complete.packageState, 'EVIDENCE_COMPLETE_NOT_AUTHORIZED');
  assert.equal(complete.evidenceComplete, true);
  assert.equal(complete.canPromoteCalculationAuthority, false);
});
