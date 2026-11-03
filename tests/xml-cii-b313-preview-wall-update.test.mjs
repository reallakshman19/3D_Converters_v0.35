import assert from 'node:assert/strict';

import {
  B313_PREVIEW_NEGATIVE_MILL_TOLERANCE_PCT,
  calculateAndSelectPreviewB313Wall,
  resolvePreviewB313FactorBasis,
  resolvePreviewB313MaterialIdentity,
} from '../converters/xml-cii2019-core/b313-preview-wall-update.js';

const base = {
  dn: 250,
  outsideDiameterMm: 273,
  designPressure: 51.1,
  pressureUnit: 'barg',
  corrosionAllowanceMm: 6,
  allowableStress: 20000,
  stressUnit: 'psi',
  qualityFactorE: 1,
  weldStrengthReductionW: 1,
  coefficientY: 0.4,
  dimensionStandard: 'ASME B36.10M',
};

assert.equal(B313_PREVIEW_NEGATIVE_MILL_TOLERANCE_PCT, 12.5);

const exactMaterial = resolvePreviewB313MaterialIdentity({ material: 'ASTM A106-B', materialSource: 'piping-class-fallback' });
assert.equal(exactMaterial.ok, true, JSON.stringify(exactMaterial, null, 2));
assert.equal(exactMaterial.material.materialId, 'CS-A106-B');
assert.equal(exactMaterial.resolutionSource, 'PREVIEW_MATERIAL');

const corroboratedCs = resolvePreviewB313MaterialIdentity({
  material: 'CS',
  materialSource: 'process-linelist-material',
  corroboratingMaterial: 'A106-B',
  corroboratingSource: 'process-material-map',
  corroboratingNeedsReview: false,
});
assert.equal(corroboratedCs.ok, true, JSON.stringify(corroboratedCs, null, 2));
assert.equal(corroboratedCs.material.materialId, 'CS-A106-B');
assert.equal(corroboratedCs.corroborationStatus, 'MATCHED');

const ambiguousSs = resolvePreviewB313MaterialIdentity({ material: 'SS', materialSource: 'process-linelist-material' });
assert.equal(ambiguousSs.ok, false);
assert.equal(ambiguousSs.code, 'B313_PREVIEW_MATERIAL_AMBIGUOUS');

const disambiguatedSs = resolvePreviewB313MaterialIdentity({
  material: 'SS',
  materialSource: 'process-linelist-material',
  corroboratingMaterial: 'A312-TP316',
  corroboratingSource: 'process-material-map',
  corroboratingNeedsReview: false,
});
assert.equal(disambiguatedSs.ok, true, JSON.stringify(disambiguatedSs, null, 2));
assert.equal(disambiguatedSs.material.materialId, 'SS-A312-TP316');
assert.equal(disambiguatedSs.resolutionSource, 'PREVIEW_MATERIAL_CODE_CORROBORATION');
assert.equal(disambiguatedSs.corroborationStatus, 'DISAMBIGUATED');

const materialConflict = resolvePreviewB313MaterialIdentity({
  material: 'ASTM A106-B',
  corroboratingMaterial: 'A312-TP316',
  corroboratingSource: 'process-material-map',
  corroboratingNeedsReview: false,
});
assert.equal(materialConflict.ok, false);
assert.equal(materialConflict.code, 'B313_PREVIEW_MATERIAL_CONFLICT');

// The active master currently contains A106 benchmark-only factors. Preview must
// not silently enable them: strict resolution fails until controlled rows exist.
const strictUnavailable = resolvePreviewB313FactorBasis({
  materialIdentity: exactMaterial,
  designTemperatureC: 0,
  manualBasis: {},
});
assert.equal(strictUnavailable.ok, false);
assert.equal(strictUnavailable.code, 'B313_PREVIEW_FACTOR_BASIS_UNAVAILABLE');
assert.equal(strictUnavailable.details.strictResult.code, 'B313_FACTOR_DATA_INCOMPLETE');

const explicitFallback = resolvePreviewB313FactorBasis({
  materialIdentity: exactMaterial,
  designTemperatureC: 0,
  manualBasis: {
    allowableStress: 20000,
    stressUnit: 'psi',
    qualityFactorE: 1,
    weldStrengthReductionW: 1,
    coefficientY: 0.4,
    sourceReference: 'CONTROLLED-PROJECT-BASIS-001',
  },
});
assert.equal(explicitFallback.ok, true, JSON.stringify(explicitFallback, null, 2));
assert.equal(explicitFallback.mode, 'MANUAL_EXPLICIT_FALLBACK');
assert.equal(explicitFallback.designAuthority, false);
assert.equal(explicitFallback.strictResult.code, 'B313_FACTOR_DATA_INCOMPLETE');

const dn250 = calculateAndSelectPreviewB313Wall(base);
assert.equal(dn250.ok, true, JSON.stringify(dn250, null, 2));
assert.ok(Math.abs(dn250.calculation.requiredNominalThicknessMm - 12.5536) < 0.0001);
assert.ok(Math.abs(dn250.selectedNominalWallMm - 12.7) < 1e-9);
assert.equal(dn250.selectedSchedule, '60');
assert.deepEqual(dn250.equivalentSchedules, ['60', 'XS']);
assert.ok(Math.abs(dn250.selectionMarginMm - (12.7 - dn250.calculation.requiredNominalThicknessMm)) < 1e-10);
assert.equal(dn250.calculation.manufacturingTolerance.basis, 'percent');
assert.equal(dn250.calculation.manufacturingTolerance.percent, 12.5);
assert.equal(dn250.calculation.manufacturingTolerance.inputValue, 12.5);
assert.equal(dn250.authority, 'EXPLICIT_PREVIEW_ACTION_NOT_AUTOMATIC_WALL_AUTHORITY');

const missingOd = calculateAndSelectPreviewB313Wall({ ...base, outsideDiameterMm: undefined });
assert.equal(missingOd.ok, false);
assert.equal(missingOd.code, 'B313_PREVIEW_OD_REQUIRED');

const missingPressureUnit = calculateAndSelectPreviewB313Wall({ ...base, pressureUnit: '' });
assert.equal(missingPressureUnit.ok, false);
assert.equal(missingPressureUnit.code, 'B313_PREVIEW_PRESSURE_UNIT_REQUIRED');

const missingStress = calculateAndSelectPreviewB313Wall({ ...base, allowableStress: '' });
assert.equal(missingStress.ok, false);
assert.equal(missingStress.code, 'B313_PREVIEW_ALLOWABLE_STRESS_REQUIRED');

const missingStressUnit = calculateAndSelectPreviewB313Wall({ ...base, stressUnit: '' });
assert.equal(missingStressUnit.ok, false);
assert.equal(missingStressUnit.code, 'B313_PREVIEW_STRESS_UNIT_REQUIRED');

const blankCorrosion = calculateAndSelectPreviewB313Wall({ ...base, corrosionAllowanceMm: '' });
assert.equal(blankCorrosion.ok, false);
assert.equal(blankCorrosion.code, 'B313_PREVIEW_CORROSION_REQUIRED');

const blankE = calculateAndSelectPreviewB313Wall({ ...base, qualityFactorE: '' });
assert.equal(blankE.ok, false);
assert.equal(blankE.code, 'B313_PREVIEW_QUALITY_FACTOR_E_REQUIRED');

const blankW = calculateAndSelectPreviewB313Wall({ ...base, weldStrengthReductionW: '' });
assert.equal(blankW.ok, false);
assert.equal(blankW.code, 'B313_PREVIEW_WELD_FACTOR_W_REQUIRED');

const blankY = calculateAndSelectPreviewB313Wall({ ...base, coefficientY: '' });
assert.equal(blankY.ok, false);
assert.equal(blankY.code, 'B313_PREVIEW_COEFFICIENT_Y_REQUIRED');

// Explicit zero is a valid Y input and must not be confused with blank.
const explicitZeroY = calculateAndSelectPreviewB313Wall({ ...base, coefficientY: 0 });
assert.equal(explicitZeroY.ok, true, JSON.stringify(explicitZeroY, null, 2));
assert.equal(explicitZeroY.calculation.inputs.coefficientY, 0);

console.log('XML/CII Preview B31.3 material-factor and wall API composition checks passed.');
