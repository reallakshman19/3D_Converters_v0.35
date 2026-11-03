import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  B313_CHAPTER_IX_USER_CALCULATED_FATIGUE_ID,
  calculateEngineering,
  getEngineeringCalculationDefinition,
} from '../converters/engineering-calculations/index.js';
import {
  USER_CALCULATED_FATIGUE_EXCHANGE_SCHEMA,
  createUserCalculatedFatigueExchangePackage,
  parseUserCalculatedFatigueCsv,
  parseUserCalculatedFatigueJson,
  serializeUserCalculatedFatigueCsv,
  serializeUserCalculatedFatigueJson,
} from '../converters/b313-chapter-ix/user-calculated-fatigue-exchange.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');

function basis(overrides = {}) {
  return {
    code: 'ASME BPVC VIII-3',
    edition: '2025',
    methodRef: 'KD-3',
    calculationRef: 'HP-FAT-001',
    calculatedBy: 'ENGINEER_A',
    checkedBy: 'ENGINEER_B',
    checkedAt: '2026-08-16T00:00:00Z',
    ...overrides,
  };
}

function canonicalInputs(resultOverrides = {}) {
  return {
    outsideDiameter: 114.3,
    effectiveWall: 8.80375,
    spectrum: { spectrumId: 'S1', designLifeYears: 20 },
    states: [
      { spectrumId: 'S1', stateId: 'LOW', pressureMpa: 5, materialTemperatureC: 40, structuralTemperatureC: 40 },
      { spectrumId: 'S1', stateId: 'HIGH', pressureMpa: 30, materialTemperatureC: 40, structuralTemperatureC: 40 },
    ],
    transitions: [
      { spectrumId: 'S1', cycleId: 'C1', fromStateId: 'LOW', toStateId: 'HIGH', totalCycles: 10000, category: 'PROCESS_CYCLE' },
    ],
    externalResults: [{
      cycleId: 'C1',
      locationId: 'BORE_INNER_SURFACE',
      fromStateId: 'LOW',
      toStateId: 'HIGH',
      userAlternatingStressIntensityMpa: 87.91596640349115,
      equivalentAlternatingStressMpa: 95,
      permissibleCycles: 20000,
      calculationBasis: basis(),
      ...resultOverrides,
    }],
  };
}

test('central registry exposes the canonical USER_CALCULATED_KD3 calculation', () => {
  const definition = getEngineeringCalculationDefinition(B313_CHAPTER_IX_USER_CALCULATED_FATIGUE_ID);
  assert.ok(definition);
  assert.equal(definition.id, 'PIPE.B313.CH9.FATIGUE_USER_CALCULATED');
  assert.equal(definition.authority.qualificationState, 'IMPLEMENTED');
  assert.equal(definition.authority.codeCompliance, false);
  assert.equal(definition.ui.calculationMode, 'USER_CALCULATED_KD3');
  assert.match(definition.ui.nativeAlternative, /Not Qualified/i);
});

test('central API consumes external Seq/N and derives Salt QA plus Miner usage without promoting external data', () => {
  const result = calculateEngineering({
    calculationId: B313_CHAPTER_IX_USER_CALCULATED_FATIGUE_ID,
    inputs: canonicalInputs(),
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.outputs.calculationMode, 'USER_CALCULATED_KD3');
  assert.equal(result.outputs.calculationState, 'EXTERNAL_KD3_CALCULATED_CHECKED_NOT_AUTHORIZED');
  assert.equal(result.outputs.independentCheckComplete, true);
  assert.equal(result.outputs.cumulativeUsage, 0.5);
  assert.equal(result.outputs.cycles[0].saltCrossCheckStatus, 'MATCH');
  assert.equal(result.outputs.cycles[0].equivalentAlternatingStressMpa, 95);
  assert.equal(result.outputs.cycles[0].permissibleCycles, 20000);
  assert.equal(result.outputs.cycles[0].usage, 0.5);
  assert.equal(result.qualification.method, 'IMPLEMENTED');
  assert.equal(result.qualification.data, 'DRAFT');
  assert.equal(result.qualification.designAuthority, false);
  assert.equal(result.provenance.externalDataQualification, 'DRAFT');
  assert.equal(result.provenance.codeCompliance, false);
  assert.equal(result.provenance.canUseForDesignAuthority, false);
  assert.equal(result.assessment.authority, 'EXTERNAL_KD3_REVIEW_ONLY');
});

test('central adapter fails closed on user Salt mismatch', () => {
  const result = calculateEngineering({
    calculationId: B313_CHAPTER_IX_USER_CALCULATED_FATIGUE_ID,
    inputs: canonicalInputs({ userAlternatingStressIntensityMpa: 100 }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'USER_SALT_MISMATCH');
  assert.equal(result.qualification.designAuthority, false);
});

test('central adapter rejects checker identity collision after normalization', () => {
  const result = calculateEngineering({
    calculationId: B313_CHAPTER_IX_USER_CALCULATED_FATIGUE_ID,
    inputs: canonicalInputs({
      calculationBasis: basis({ checkedBy: ' engineer_a ' }),
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'USER_FATIGUE_CHECKER_NOT_INDEPENDENT');
  assert.equal(result.qualification.designAuthority, false);
});

test('central adapter preserves explicit zero-damage semantics', () => {
  const result = calculateEngineering({
    calculationId: B313_CHAPTER_IX_USER_CALCULATED_FATIGUE_ID,
    inputs: {
      outsideDiameter: 88.9,
      effectiveWall: 6.06,
      spectrum: { spectrumId: 'Z' },
      states: [
        { spectrumId: 'Z', stateId: 'A', pressureMpa: 15, materialTemperatureC: 40, structuralTemperatureC: 40 },
        { spectrumId: 'Z', stateId: 'B', pressureMpa: 15, materialTemperatureC: 40, structuralTemperatureC: 40 },
      ],
      transitions: [{ spectrumId: 'Z', cycleId: 'C0', fromStateId: 'A', toStateId: 'B', totalCycles: 25000 }],
      externalResults: [{
        cycleId: 'C0',
        locationId: 'BORE_INNER_SURFACE',
        fromStateId: 'A',
        toStateId: 'B',
        userAlternatingStressIntensityMpa: 0,
        equivalentAlternatingStressMpa: 0,
        calculationBasis: basis(),
      }],
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.outputs.cycles[0].zeroDamage, true);
  assert.equal(result.outputs.cycles[0].permissibleCycles, null);
  assert.equal(result.outputs.cycles[0].usage, 0);
  assert.equal(result.outputs.cumulativeUsage, 0);
});

test('CSV exchange round-trips per-cycle Seq/N, Salt and provenance', () => {
  const rows = canonicalInputs().externalResults;
  const csv = serializeUserCalculatedFatigueCsv(rows);
  const parsed = parseUserCalculatedFatigueCsv(csv);
  assert.deepEqual(parsed, rows);
  assert.match(csv, /calculationRef/);
  assert.match(csv, /checkedAt/);
});

test('CSV exchange preserves quoted calculation references', () => {
  const rows = canonicalInputs({
    calculationBasis: basis({ calculationRef: 'CALC,REV "B"' }),
  }).externalResults;
  const parsed = parseUserCalculatedFatigueCsv(serializeUserCalculatedFatigueCsv(rows));
  assert.equal(parsed[0].calculationBasis.calculationRef, 'CALC,REV "B"');
});

test('JSON exchange round-trips governed geometry, spectrum and external results with authority false', () => {
  const input = canonicalInputs();
  const pkg = createUserCalculatedFatigueExchangePackage({
    outsideDiameterMm: input.outsideDiameter,
    effectiveWallMm: input.effectiveWall,
    spectrum: input.spectrum,
    states: input.states,
    transitions: input.transitions,
    externalResults: input.externalResults,
    generatedAt: '2026-08-16T00:00:00Z',
  });
  const parsed = parseUserCalculatedFatigueJson(serializeUserCalculatedFatigueJson(pkg));
  assert.equal(parsed.schema, USER_CALCULATED_FATIGUE_EXCHANGE_SCHEMA);
  assert.deepEqual(parsed.externalResults, input.externalResults);
  assert.equal(parsed.authority.nativeCoreKd3Qualified, false);
  assert.equal(parsed.authority.codeCompliance, false);
  assert.equal(parsed.authority.canUseForDesignAuthority, false);
});

test('JSON exchange rejects authority promotion', () => {
  const input = canonicalInputs();
  const pkg = createUserCalculatedFatigueExchangePackage({
    outsideDiameterMm: input.outsideDiameter,
    effectiveWallMm: input.effectiveWall,
    spectrum: input.spectrum,
    states: input.states,
    transitions: input.transitions,
    externalResults: input.externalResults,
  });
  pkg.authority.canUseForDesignAuthority = true;
  assert.throws(() => serializeUserCalculatedFatigueJson(pkg), /canUseForDesignAuthority must remain false/);
});

test('HP UI product surface is bound to the canonical evaluator and exchange modules', () => {
  const product = fs.readFileSync(path.join(repo, 'engineering/hp-class-standardization/user-calculated-fatigue-product.js'), 'utf8');
  const guard = fs.readFileSync(path.join(repo, 'engineering/hp-class-standardization/fatigue-authority-guard.js'), 'utf8');
  assert.match(product, /evaluateChapterIxUserCalculatedFatigueSpectrum/);
  assert.match(product, /createUserCalculatedFatigueExchangePackage/);
  assert.match(product, /CORE Salt/);
  assert.match(product, /User Salt/);
  assert.match(product, /User Seq/);
  assert.match(product, /User N/);
  assert.match(product, /Ui=n\/N/);
  assert.match(product, /ZERO DAMAGE/);
  assert.match(product, /Per-cycle provenance/);
  assert.doesNotMatch(product, /calculateAutomaticSeq/);
  assert.match(guard, /import\('\.\/user-calculated-fatigue-product\.js'\)/);
  assert.match(guard, /CORE KD-3 Seq is not qualified/);
});
