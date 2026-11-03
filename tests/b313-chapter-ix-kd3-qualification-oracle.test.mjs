import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { auditOracle } from '../scripts/audit-b313-ch9-kd3-oracle.mjs';
import { independentMiner, independentPressureSalt, solveFoundationCases } from '../scripts/solve-b313-ch9-kd3-qualification-foundation.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const qdir = path.join(root, 'engineering/hp-class-standardization/qualification/kd3-oracle');
const catalog = JSON.parse(fs.readFileSync(path.join(qdir, 'catalog.json'), 'utf8'));
const ledger = JSON.parse(fs.readFileSync(path.join(qdir, 'source-ledger.json'), 'utf8'));

function close(actual, expected, rel = 1e-4) {
  const limit = Math.max(Math.abs(expected) * rel, 1e-12);
  assert.ok(Math.abs(actual - expected) <= limit, `${actual} != ${expected} within ${limit}`);
}

test('oracle catalog audit is fail-closed and complete', () => {
  const result = auditOracle();
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.counts.cases, 23);
  assert.ok(result.counts.pendingNative >= 10);
  assert.deepEqual(result.authority, { nativeCoreKd3Qualified: false, codeCompliance: false, canUseForDesignAuthority: false });
});

test('qualification-only pressure Salt independently reproduces frozen analytical benchmark', () => {
  const result = independentPressureSalt({ outsideDiameterMm: 114.3, effectiveWallMm: 8.80375, fromPressureMpa: 2, toPressureMpa: 20 });
  close(result.stressIntensityRangeMpa, 126.598991621);
  close(result.alternatingStressIntensityMpa, 63.299495811);
});

test('qualification-only zero-range benchmark returns zero Salt', () => {
  const result = independentPressureSalt({ outsideDiameterMm: 88.9, effectiveWallMm: 6.06, fromPressureMpa: 15, toPressureMpa: 15 });
  assert.equal(result.stressIntensityRangeMpa, 0);
  assert.equal(result.alternatingStressIntensityMpa, 0);
});

test('qualification-only Miner arithmetic is cycle-order invariant', () => {
  const cycles = [
    { cycleId: 'B1', appliedCycles: 1000, permissibleCycles: 10000 },
    { cycleId: 'B2', appliedCycles: 5000, permissibleCycles: 50000 }
  ];
  const forward = independentMiner(cycles);
  const reverse = independentMiner([...cycles].reverse());
  close(forward.cumulativeUsage, 0.2);
  close(reverse.cumulativeUsage, 0.2);
});

test('all admitted foundation vectors execute without invoking native KD320', () => {
  const result = solveFoundationCases();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.qualificationOnly, true);
  assert.equal(result.productionKernelUsed, false);
  assert.equal(result.nativeKd320Executed, false);
  assert.equal(result.results.length, 7);
});

test('pending native KD320 cases contain no invented Seq or N oracle', () => {
  for (const item of catalog.cases.filter((row) => row.scope === 'NATIVE_KD320' && row.status.startsWith('PENDING_'))) {
    assert.equal(item.expected, null, item.benchmarkId);
    assert.equal(item.solver, undefined, item.benchmarkId);
  }
});

test('public ASME identity pages are explicitly non-formula/non-curve oracles', () => {
  for (const sourceId of ['ASME-B313-2024-PUBLIC', 'ASME-VIII3-2025-PUBLIC']) {
    const source = ledger.sources.find((row) => row.sourceId === sourceId);
    assert.ok(source, sourceId);
    assert.equal(source.formulaOracle, false);
    assert.equal(source.fatigueCurveOracle, false);
    assert.match(source.admissibility, /IDENTITY_ONLY/);
  }
});

test('controlled licensed source remains pending secure reconciliation and public content is prohibited', () => {
  const source = ledger.sources.find((row) => row.sourceId === 'SRC-VIII3-2025-CONTROLLED');
  assert.equal(source.status, 'PENDING_SECURE_HASH_AND_LOCATOR_RECONCILIATION');
  assert.equal(source.publicRepositoryContentAllowed, false);
  assert.equal(source.formulaOracle, false);
});

test('qualification scripts do not import production converter/UI/registry paths', () => {
  for (const name of ['audit-b313-ch9-kd3-oracle.mjs', 'solve-b313-ch9-kd3-qualification-foundation.mjs']) {
    const source = fs.readFileSync(path.join(root, 'scripts', name), 'utf8');
    assert.doesNotMatch(source, /converters\//);
    assert.doesNotMatch(source, /engineering-calculations/);
    assert.doesNotMatch(source, /hp-class-standardization\/(?:app|ui|index)/);
    assert.doesNotMatch(source, /KD320_MEAN_STRESS_CORRECTION/);
  }
});
