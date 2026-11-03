import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createHpPipingClassProject,
  evaluateHpPipingClassProject,
} from '../converters/b313-chapter-ix/hp-piping-class.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');

const LEGACY_NPS4 = Object.freeze({
  pressureDesignThicknessMm: 7.7103934983403475,
  requiredMinimumThicknessMm: 10.710393498340348,
  requiredNominalThicknessMm: 12.240449712388969,
  minimumAsManufacturedThicknessMm: 11.80375,
  effectiveNetWallMm: 8.80375,
  pressureRatingMpa: 23.086120852009273,
  staticPass: true,
  cycleSalt2To20Mpa: 63.29949581051363,
});

function close(actual, expected, tolerance = 1e-10) {
  assert(Number.isFinite(actual), `actual is not finite: ${actual}`);
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function fatigueBasis() {
  return {
    code: 'ASME BPVC VIII-3', edition: '2025', methodRef: 'KD-3 external calculation',
    calculationRef: 'HP-FAT-EXT-001', calculatedBy: 'ENGINEER_A', checkedBy: 'ENGINEER_B',
    checkedAt: '2026-08-16T04:30:00Z',
  };
}

function directProject({ withFatigue = true, brownfield = false, nominalWallMm = 13.49 } = {}) {
  const selectedSalt = brownfield ? 63.99142829153606 : LEGACY_NPS4.cycleSalt2To20Mpa;
  return createHpPipingClassProject({
    metadata: { projectId: 'HP-PROJ-001', classId: 'HP-CS-001', revision: 'A' },
    methodManifest: { b313Edition: '2024', viii3Edition: '2025', calculationMode: 'USER_CALCULATED_KD3' },
    classBasis: { designPressureMpa: 20, internalAllowanceMm: 3, externalAllowanceMm: 0 },
    products: [{
      productId: 'NPS4-S160',
      calculationBasis: {
        mode: 'DIRECT_ENGINEERING_INPUT', outsideDiameterMm: 114.3, allowableStressMpa: 138,
        nominalWallMm, minusTolerancePct: 12.5,
      },
      wallState: brownfield ? {
        fatigueWallBasis: 'PROJECTED_END_OF_LIFE', measuredCurrentWallMm: 10.2,
        futureInternalLossMm: 1.2, futureExternalLossMm: 0.3,
      } : { fatigueWallBasis: 'END_OF_LIFE_EFFECTIVE' },
    }],
    transient: withFatigue ? {
      spectrum: { spectrumId: 'HP-CS-001-SPECTRUM', designLifeYears: 20 },
      states: [
        { spectrumId: 'HP-CS-001-SPECTRUM', stateId: 'LOW', pressureMpa: 2, materialTemperatureC: 40, structuralTemperatureC: 40 },
        { spectrumId: 'HP-CS-001-SPECTRUM', stateId: 'HIGH', pressureMpa: 20, materialTemperatureC: 200, structuralTemperatureC: 200 },
      ],
      transitions: [{
        spectrumId: 'HP-CS-001-SPECTRUM', cycleId: 'C1', fromStateId: 'LOW', toStateId: 'HIGH',
        totalCycles: 500, category: 'PROCESS_CYCLE',
      }],
    } : { spectrum: null, states: [], transitions: [] },
    fatigueEvidence: withFatigue ? [{
      productId: 'NPS4-S160',
      externalResults: [{
        cycleId: 'C1', locationId: 'BORE_INNER_SURFACE', fromStateId: 'LOW', toStateId: 'HIGH',
        userAlternatingStressIntensityMpa: selectedSalt, equivalentAlternatingStressMpa: 70,
        permissibleCycles: 10000, calculationBasis: fatigueBasis(),
      }],
    }] : [],
  });
}

function checkedSource(overrides) {
  return {
    qualificationState: 'INDEPENDENTLY_CHECKED', verifiedBy: 'ENGINEER_A', independentCheckBy: 'ENGINEER_B',
    verifiedAt: '2026-08-15T10:00:00Z', independentCheckedAt: '2026-08-15T11:00:00Z', ...overrides,
  };
}

function governedProject() {
  const basisPackage = {
    packageVersion: 'b313-ch9-basis-package/v1',
    query: { materialId: 'TEST-MAT', b313Edition: '2024', materialTemperatureC: 150, productId: 'TEST-PROD-NPS4' },
    masters: {
      sources: [
        checkedSource({ sourceId: 'SRC-B313', role: 'B313_ALLOWABLE_STRESS', standard: 'ASME B31.3', edition: '2024', documentHash: `sha256:${'a'.repeat(64)}` }),
        checkedSource({ sourceId: 'SRC-DIM', role: 'PIPE_DIMENSION', standard: 'TEST DIMENSION STANDARD', edition: 'R1', documentHash: `sha256:${'b'.repeat(64)}` }),
        checkedSource({ sourceId: 'SRC-TOL', role: 'PRODUCT_TOLERANCE', standard: 'TEST TOLERANCE STANDARD', edition: 'R1', documentHash: `sha256:${'c'.repeat(64)}` }),
      ],
      materialAllowable: [
        { materialId: 'TEST-MAT', b313Edition: '2024', temperatureC: 100, allowableStressMpa: 150, sourceId: 'SRC-B313', sourceLocator: 'Synthetic 100C', interpolationPolicy: 'LINEAR_NO_EXTRAPOLATION', qualificationState: 'INDEPENDENTLY_CHECKED' },
        { materialId: 'TEST-MAT', b313Edition: '2024', temperatureC: 200, allowableStressMpa: 130, sourceId: 'SRC-B313', sourceLocator: 'Synthetic 200C', interpolationPolicy: 'LINEAR_NO_EXTRAPOLATION', qualificationState: 'INDEPENDENTLY_CHECKED' },
      ],
      pipeProduct: [{ productId: 'TEST-PROD-NPS4', dimensionId: 'TEST-DIM-NPS4', materialId: 'TEST-MAT', productSpec: 'TEST PIPE SPEC', manufacturingProcess: 'TEST_PROCESS', toleranceRuleId: 'TEST-TOL-12.5', qualificationState: 'INDEPENDENTLY_CHECKED' }],
      pipeDimension: [{ dimensionId: 'TEST-DIM-NPS4', nps: 4, odMm: 114.3, schedule: 'TEST_160', nominalWallMm: 13.49, dimensionStandard: 'TEST DIMENSION STANDARD', dimensionEdition: 'R1', sourceId: 'SRC-DIM', sourceLocator: 'Synthetic dimension row', qualificationState: 'INDEPENDENTLY_CHECKED' }],
      manufacturingTolerance: [{ toleranceRuleId: 'TEST-TOL-12.5', productSpec: 'TEST PIPE SPEC', manufacturingProcess: 'TEST_PROCESS', minusTolerancePct: 12.5, toleranceStandard: 'TEST TOLERANCE STANDARD', toleranceEdition: 'R1', sourceId: 'SRC-TOL', sourceLocator: 'Synthetic tolerance row', qualificationState: 'INDEPENDENTLY_CHECKED' }],
    },
  };
  return createHpPipingClassProject({
    metadata: { projectId: 'HP-PROJ-GOV', classId: 'HP-CS-GOV', revision: 'A' },
    methodManifest: { b313Edition: '2024', calculationMode: 'USER_CALCULATED_KD3' },
    classBasis: { designPressureMpa: 20, internalAllowanceMm: 3, externalAllowanceMm: 0 },
    products: [{ productId: 'TEST-PROD-NPS4', calculationBasis: { mode: 'GOVERNED_BASIS_PACKAGE', basisPackage }, wallState: { fatigueWallBasis: 'END_OF_LIFE_EFFECTIVE' } }],
    transient: { spectrum: null, states: [], transitions: [] }, fatigueEvidence: [],
  });
}

test('direct canonical orchestration reproduces the frozen legacy NPS4 reference and pressure-cycle Salt', () => {
  const result = evaluateHpPipingClassProject(directProject(), { includeEvidence: true });
  assert.equal(result.ok, true, JSON.stringify(result));
  const product = result.products[0];
  const actual = product.calculations.static.outputs;
  for (const key of ['pressureDesignThicknessMm','requiredMinimumThicknessMm','requiredNominalThicknessMm','minimumAsManufacturedThicknessMm','effectiveNetWallMm','pressureRatingMpa']) {
    close(actual[key], LEGACY_NPS4[key]);
  }
  assert.equal(actual.staticPass, LEGACY_NPS4.staticPass);
  close(product.selectedFatigueWallMm, LEGACY_NPS4.effectiveNetWallMm);
  close(product.calculations.fatigue.outputs.cycles[0].coreSaltMpa, LEGACY_NPS4.cycleSalt2To20Mpa);
  close(product.calculations.fatigue.outputs.cumulativeUsage, 0.05);
  assert.equal(product.engineeringState, 'REVIEW_COMPLETE_NOT_AUTHORIZED');
});

test('governed basis route reproduces the existing synthetic resolver/static reference', () => {
  const result = evaluateHpPipingClassProject(governedProject());
  assert.equal(result.ok, true, JSON.stringify(result));
  const product = result.products[0];
  assert.equal(product.calculations.basis.outputs.resolverState, 'RESOLVED_NOT_AUTHORIZED');
  close(product.resolvedBasis.allowableStressMpa, 140);
  close(product.calculations.static.outputs.pressureDesignThicknessMm, 7.607928029277122);
  close(product.calculations.static.outputs.requiredNominalThicknessMm, 12.123346319173853);
  close(product.calculations.static.outputs.pressureRatingMpa, 23.420702313632596);
  assert.equal(product.calculations.static.outputs.staticReferencePass, true);
});

test('brownfield route uses the explicitly selected projected end-of-life wall for fatigue', () => {
  const product = evaluateHpPipingClassProject(directProject({ brownfield: true })).products[0];
  close(product.calculations.wallState.outputs.projectedEndOfLifeWallMm, 8.7);
  close(product.selectedFatigueWallMm, 8.7);
  close(product.calculations.fatigue.outputs.cycles[0].coreSaltMpa, 63.99142829153606);
});

test('static engineering failure remains a successful calculation and static-only fatigue stays not evaluated', () => {
  const result = evaluateHpPipingClassProject(directProject({ nominalWallMm: 11.5, withFatigue: false }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.products[0].calculationOk, true);
  assert.equal(result.products[0].assessment.staticPass, false);
  assert.equal(result.products[0].engineeringState, 'STATIC_REFERENCE_FAIL');
  assert.equal(result.products[0].calculations.fatigue.state, 'NOT_EVALUATED');
});

test('production orchestrator uses the public central API and contains no UI or legacy calculation dependency', () => {
  const source = fs.readFileSync(path.join(repo, 'converters/b313-chapter-ix/hp-piping-class-orchestrator.js'), 'utf8');
  assert.match(source, /calculateEngineering/);
  assert.doesNotMatch(source, /engineering-calculations\/adapters/);
  assert.doesNotMatch(source, /createEngineeringCalculationRegistry|createEngineeringCalculationEngine/);
  assert.doesNotMatch(source, /engineering\/hp-class-standardization|document\.|getElementById|querySelector/);
  assert.doesNotMatch(source, /requiredPressureWall|pressureRating\s*\(|calculateAutomaticSeq|interpolateFatigueLife/);
  assert.match(source, /PIPE\.B313\.CH9\.STRAIGHT_PRESSURE_FROM_BASIS/);
  assert.match(source, /PIPE\.B313\.CH9\.FATIGUE_USER_CALCULATED/);
});
