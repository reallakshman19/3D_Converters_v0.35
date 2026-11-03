import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  B313_MATERIAL_FACTOR_MASTER,
  normalizeB313MaterialFamily,
  resolveB313MaterialIdentity,
  resolveB313DesignFactors,
  getB313MaterialFactorCoverage,
  calculateB313MaterialDesign,
} from '../converters/b313-material-factors/index.js';

const KSI_TO_MPA = 6.894757293168361;
const b = JSON.parse(fs.readFileSync(new URL('../Benchmarks/B313MaterialFactors/a106-grb-full-pipeline-benchmark.json', import.meta.url), 'utf8'));

test('family routing covers CS LT/LTCS SS DSS SDSS without inventing an SS grade default', () => {
  assert.equal(normalizeB313MaterialFamily('LT'), 'LTCS');
  for (const f of ['CS', 'LTCS', 'DSS', 'SDSS']) {
    const r = resolveB313MaterialIdentity({ material: { family: f }, allowProjectFamilyDefault: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.material.family, f);
  }
  const ss = resolveB313MaterialIdentity({ material: { family: 'SS' }, allowProjectFamilyDefault: true });
  assert.equal(ss.ok, false);
  assert.equal(ss.code, 'B313_MATERIAL_AMBIGUOUS');
  assert.deepEqual(ss.details.candidates.sort(), ['SS-A312-TP304', 'SS-A312-TP316']);
  assert.equal(resolveB313MaterialIdentity({ material: { spec: 'ASTM A312-TP304' } }).material.materialId, 'SS-A312-TP304');
  assert.equal(resolveB313MaterialIdentity({ material: { spec: 'ASTM A312-TP316' } }).material.materialId, 'SS-A312-TP316');
});

test('A106 benchmark factors resolve only in benchmark mode', () => {
  const strict = resolveB313DesignFactors({ ...b.input });
  assert.equal(strict.ok, false);
  assert.equal(strict.code, 'B313_FACTOR_DATA_INCOMPLETE');
  const r = resolveB313DesignFactors({ ...b.input, qualificationMode: 'benchmark' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert(Math.abs(r.factors.allowableStressMPa - b.expected.S_MPa) < 1e-12);
  assert.equal(r.factors.qualityFactorE, 1);
  assert.equal(r.factors.weldStrengthReductionW, 1);
  assert.equal(r.factors.coefficientY, .4);
  assert.equal(r.designAuthority, false);
});

test('LTCS remains fail-closed outside supplied exact screening temperatures', () => {
  const r = resolveB313DesignFactors({ material: { family: 'LT' }, allowProjectFamilyDefault: true, designTemperature: -46 });
  assert.equal(r.ok, false);
  assert.equal(r.details.material.materialId, 'LTCS-A333-6');
  assert.deepEqual(r.details.missing, ['S', 'E', 'W', 'Y']);
});

test('caller overrides complete DSS without hidden family defaults', () => {
  const r = resolveB313DesignFactors({ material: { family: 'DSS' }, allowProjectFamilyDefault: true, designTemperature: 50, factorOverrides: { S: 170, E: 1, W: 1, Y: .4 } });
  assert.equal(r.ok, true);
  assert.equal(r.material.materialId, 'DSS-A790-S31803');
  assert.equal(r.factorSources.S.authority, 'CALLER_OVERRIDE');
});

test('screening basis resolves supplied material, temperature, and manufacturing-route values', () => {
  const cases = [
    ['LTCS-A333-6', 20, 'SEAMLESS', 20.0, 1.0],
    ['SS-A312-TP304', 300, 'SEAMLESS', 16.9, 1.0],
    ['SS-A312-TP316', 300, 'EFW_DOUBLE_BUTT', 17.3, 0.85],
    ['DSS-A790-S31803', 120, 'EFW_SINGLE_BUTT', 29.5, 0.80],
    ['SDSS-A790-S32760', 300, 'EFW_100_PERCENT_RT', 34.0, 1.0],
  ];
  for (const [materialId, designTemperature, manufacturingRoute, sKsi, e] of cases) {
    const r = resolveB313DesignFactors({
      material: { materialId },
      designTemperature,
      temperatureUnit: 'C',
      manufacturingRoute,
      qualificationMode: 'screening',
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert(Math.abs(r.factors.allowableStressMPa - sKsi * KSI_TO_MPA) < 1e-10);
    assert.equal(r.factors.qualityFactorE, e);
    assert.equal(r.factors.weldStrengthReductionW, 1);
    assert.equal(r.factors.coefficientY, .4);
    assert.equal(r.designAuthority, false);
    assert.equal(r.factorSources.S.status, 'SCREENING');
    assert.equal(r.factorSources.S.basisId, 'OWNER-B313-SEWY-2026-08-11');
  }
});

test('screening rows never leak into strict design authority', () => {
  const strict = resolveB313DesignFactors({
    material: { materialId: 'LTCS-A333-6' },
    designTemperature: 20,
    manufacturingRoute: 'SEAMLESS',
    qualificationMode: 'strict',
  });
  assert.equal(strict.ok, false);
  assert.deepEqual(strict.details.missing, ['S', 'E', 'W', 'Y']);
});

test('route-specific E requires an explicit matching manufacturing route', () => {
  const noRoute = resolveB313DesignFactors({
    material: { materialId: 'SS-A312-TP304' },
    designTemperature: 20,
    qualificationMode: 'screening',
  });
  assert.equal(noRoute.ok, false);
  assert.deepEqual(noRoute.details.missing, ['E']);

  const unsupported = resolveB313DesignFactors({
    material: { materialId: 'SS-A312-TP304' },
    designTemperature: 20,
    manufacturingRoute: 'UNQUALIFIED_WELD_ROUTE',
    qualificationMode: 'screening',
  });
  assert.equal(unsupported.ok, false);
  assert.deepEqual(unsupported.details.missing, ['E']);
});

test('duplex 420 C screening basis intentionally has no S value or generated S record', () => {
  for (const materialId of ['DSS-A790-S31803', 'SDSS-A790-S32760']) {
    const r = resolveB313DesignFactors({
      material: { materialId },
      designTemperature: 420,
      manufacturingRoute: 'SEAMLESS',
      qualificationMode: 'screening',
    });
    assert.equal(r.ok, false);
    assert.deepEqual(r.details.missing, ['S']);
    assert.equal(B313_MATERIAL_FACTOR_MASTER.factors.S.records.some((row) => row.materialId === materialId && row.temperatureC === 420), false);
  }
});

test('coverage reports all factor families present after screening-basis expansion', () => {
  const c = getB313MaterialFactorCoverage();
  assert.equal(c.length, 6);
  for (const row of c) {
    assert.equal(row.hasS, true, row.materialId);
    assert.equal(row.hasE, true, row.materialId);
    assert.equal(row.hasW, true, row.materialId);
    assert.equal(row.hasY, true, row.materialId);
  }
  const basis = B313_MATERIAL_FACTOR_MASTER.screeningBases['OWNER-B313-SEWY-2026-08-11'];
  assert.equal(basis.status, 'SCREENING');
  assert.match(basis.editionBasis, /not independently verified/i);
});

test('A106 full pipeline resolves factors, B31.3 wall and commercial schedule', () => {
  const r = calculateB313MaterialDesign({ ...b.input, qualificationMode: 'benchmark' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.materialFactors.material.materialId, b.expected.materialId);
  assert(Math.abs(r.calculation.requiredNominalThicknessMm - b.expected.requiredNominalThicknessMm) < 1e-9);
  assert.equal(r.pipeWall.selected.nominalWallMm, b.expected.selectedWallMm);
  assert.equal(r.pipeWall.selected.schedule, b.expected.schedule);
  assert.deepEqual(r.pipeWall.selected.equivalentSchedules, b.expected.equivalentSchedules);
});
