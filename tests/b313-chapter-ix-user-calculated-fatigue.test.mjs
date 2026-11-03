import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  USER_SALT_CROSSCHECK_RELATIVE_TOLERANCE,
  evaluateChapterIxUserCalculatedFatigueSpectrum,
} from '../converters/b313-chapter-ix/user-calculated-fatigue.js';
import { verifyChapterIxUserCalculatedFatigueFile } from '../scripts/verify-b313-ch9-user-calculated-fatigue.mjs';

const D = 114.3;
const T_EFF = 8.80375;

function basis(overrides = {}) {
  return {
    code: 'ASME BPVC VIII-3',
    edition: '2025',
    methodRef: 'KD-3',
    calculationRef: 'HP-FAT-001',
    calculatedBy: 'ENGINEER_A',
    checkedBy: null,
    checkedAt: null,
    ...overrides,
  };
}

function input(resultOverrides = {}) {
  return {
    outsideDiameterMm: D,
    effectiveWallMm: T_EFF,
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

test('user-calculated KD3 accepts Seq and N while CORE derives applied-cycle damage', () => {
  const result = evaluateChapterIxUserCalculatedFatigueSpectrum(input());
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.calculationMode, 'USER_CALCULATED_KD3');
  assert.equal(result.calculationState, 'EXTERNAL_KD3_CALCULATED_NOT_CHECKED');
  assert.equal(result.cycles[0].saltCrossCheck.status, 'MATCH');
  assert.equal(result.cycles[0].authorities.salt, 'CORE_AND_USER_CROSSCHECKED');
  assert.equal(result.cycles[0].authorities.equivalentAlternatingStress, 'USER_SUPPLIED');
  assert.equal(result.cycles[0].authorities.permissibleCycles, 'USER_SUPPLIED');
  assert.equal(result.cycles[0].authorities.damage, 'CORE_DERIVED');
  assert.equal(result.damage.cumulativeUsage, 0.5);
  assert.equal(result.canUseForDesignAuthority, false);
  assert.equal(result.codeCompliance, false);
});

test('user Salt is optional; Seq and N can still be consumed with explicit provenance', () => {
  const candidate = input();
  delete candidate.externalResults[0].userAlternatingStressIntensityMpa;
  const result = evaluateChapterIxUserCalculatedFatigueSpectrum(candidate);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.cycles[0].saltCrossCheck.status, 'NOT_PROVIDED');
  assert.equal(result.cycles[0].authorities.salt, 'CORE_CALCULATED_USER_NOT_PROVIDED');
});

test('user Salt mismatch fails closed using the repository QA comparison tolerance', () => {
  const result = evaluateChapterIxUserCalculatedFatigueSpectrum(input({
    userAlternatingStressIntensityMpa: 100,
  }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'USER_SALT_MISMATCH');
  assert.equal(result.details.saltCrossCheck.toleranceValue, USER_SALT_CROSSCHECK_RELATIVE_TOLERANCE);
});

test('governed cycle identity must match the external result state pair', () => {
  const result = evaluateChapterIxUserCalculatedFatigueSpectrum(input({ toStateId: 'LOW' }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'USER_FATIGUE_TRANSITION_MISMATCH');
});

test('Seq requires externally supplied permissible cycles when fatigue damage is nonzero', () => {
  const result = evaluateChapterIxUserCalculatedFatigueSpectrum(input({ permissibleCycles: null }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'USER_N_ALLOWED_INVALID');
});

test('external result requires auditable calculation basis but not an independent checker yet', () => {
  const bad = input({ calculationBasis: basis({ calculationRef: '' }) });
  const blocked = evaluateChapterIxUserCalculatedFatigueSpectrum(bad);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'USER_FATIGUE_BASIS_REQUIRED');

  const allowed = evaluateChapterIxUserCalculatedFatigueSpectrum(input());
  assert.equal(allowed.ok, true);
  assert.equal(allowed.independentCheckComplete, false);
  assert.equal(allowed.cycles[0].evidence.status, 'USER_CALCULATED_NOT_INDEPENDENTLY_CHECKED');
});

test('distinct checker custody promotes evidence state but never design authority', () => {
  const result = evaluateChapterIxUserCalculatedFatigueSpectrum(input({
    calculationBasis: basis({ checkedBy: 'ENGINEER_B', checkedAt: '2026-08-16T00:00:00Z' }),
  }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.independentCheckComplete, true);
  assert.equal(result.calculationState, 'EXTERNAL_KD3_CALCULATED_CHECKED_NOT_AUTHORIZED');
  assert.equal(result.cycles[0].evidence.status, 'USER_CALCULATED_INDEPENDENTLY_CHECKED');
  assert.equal(result.canUseForDesignAuthority, false);
});

test('checker cannot be the same person as the calculator', () => {
  const result = evaluateChapterIxUserCalculatedFatigueSpectrum(input({
    calculationBasis: basis({ checkedBy: 'ENGINEER_A', checkedAt: '2026-08-16T00:00:00Z' }),
  }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'USER_FATIGUE_CHECKER_NOT_INDEPENDENT');
});

test('exactly one external row is required for every governed transition', () => {
  const missing = input();
  missing.externalResults = [];
  const noRows = evaluateChapterIxUserCalculatedFatigueSpectrum(missing);
  assert.equal(noRows.ok, false);
  assert.equal(noRows.code, 'USER_FATIGUE_RESULTS_REQUIRED');

  const duplicate = input();
  duplicate.externalResults.push({ ...duplicate.externalResults[0] });
  const duplicates = evaluateChapterIxUserCalculatedFatigueSpectrum(duplicate);
  assert.equal(duplicates.ok, false);
  assert.equal(duplicates.code, 'USER_FATIGUE_CYCLE_DUPLICATE');
});

test('zero pressure range plus user Seq=0 is explicit zero damage and needs no N', () => {
  const candidate = {
    outsideDiameterMm: 88.9,
    effectiveWallMm: 6.06,
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
      permissibleCycles: null,
      calculationBasis: basis(),
    }],
  };
  const result = evaluateChapterIxUserCalculatedFatigueSpectrum(candidate);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.cycles[0].zeroDamage, true);
  assert.equal(result.cycles[0].usage, 0);
  assert.equal(result.damage.cumulativeUsage, 0);
});

test('file verifier consumes the same user-calculated candidate contract', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-user-fatigue-'));
  const filePath = path.join(dir, 'candidate.json');
  const candidate = input();
  candidate.geometry = {
    outsideDiameterMm: candidate.outsideDiameterMm,
    effectiveWallMm: candidate.effectiveWallMm,
  };
  delete candidate.outsideDiameterMm;
  delete candidate.effectiveWallMm;
  fs.writeFileSync(filePath, JSON.stringify(candidate));
  const result = verifyChapterIxUserCalculatedFatigueFile(filePath);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.calculationMode, 'USER_CALCULATED_KD3');
  assert.equal(result.damage.cumulativeUsage, 0.5);
});
