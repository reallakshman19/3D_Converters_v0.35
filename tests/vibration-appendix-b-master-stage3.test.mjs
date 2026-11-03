import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveVibrationMaster } from '../converters/vibration/masters/registry.js';
import {
  buildEiAviffAppendixBCandidateRegistry,
  inspectEiAviffAppendixBCandidate,
  inspectEiAviffGasThermodynamicCandidate,
  inspectEiAviffGasViscosityCandidate,
  inspectEiAviffLiquidSoundCandidate,
  inspectEiAviffMechanicalExcitationCandidate,
  inspectEiAviffReynoldsRuleCandidate,
  inspectEiAviffWaterVaporPressureCandidate,
} from '../converters/vibration/masters/ei-aviff-appendix-b-candidate.js';
import { EI_AVIFF_APPENDIX_B_MASTER_IDS } from '../converters/vibration/masters/ei-aviff-appendix-b-data.js';

function closeTo(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('Appendix B registry exposes six CANDIDATE records with no authority promotion', async () => {
  const registry = await buildEiAviffAppendixBCandidateRegistry();
  assert.equal(registry.records.length, 6);
  assert.ok(registry.records.every((record) => record.publicationState === 'CANDIDATE'));
  assert.equal(registry.records.filter((record) => record.authorityClass === 'EI_DEFAULT_PROPERTY').length, 4);
  assert.equal(registry.records.filter((record) => record.authorityClass === 'EI_METHOD_MASTER').length, 2);
  for (const record of registry.records) {
    assert.throws(() => resolveVibrationMaster(registry, record.masterId), /VIBRATION_MASTER_NOT_ACTIVE/u);
  }
});

test('liquid speed-of-sound defaults resolve exact canonical keys only', async () => {
  const water = await inspectEiAviffLiquidSoundCandidate('WATER_PURE_REF');
  const crude = await inspectEiAviffLiquidSoundCandidate('CRUDE_OIL');
  assert.equal(water.row.speedOfSoundMps, 1482);
  assert.equal(water.row.referenceTemperatureC, 20);
  assert.equal(crude.row.speedOfSoundMps, 1385);
  assert.equal(water.usagePolicy.automaticFallbackAllowed, false);
  assert.equal(water.usagePolicy.explicitAcceptanceRequired, true);
  await assert.rejects(() => inspectEiAviffLiquidSoundCandidate('WATER'), /EI_APPENDIX_B_MASTER_GRID_MISS/u);
});

test('gas viscosity uses the exact source grid and performs no interpolation', async () => {
  const methane = await inspectEiAviffGasViscosityCandidate('METHANE_SG_0_55', 50);
  closeTo(methane.row.dynamicViscosityPaS, 1.18e-5);
  assert.equal(methane.row.temperatureC, 50);
  await assert.rejects(
    () => inspectEiAviffGasViscosityCandidate('METHANE_SG_0_55', 25),
    /EI_APPENDIX_B_MASTER_GRID_MISS/u,
  );
  await assert.rejects(
    () => inspectEiAviffGasViscosityCandidate('UNKNOWN_GAS', 50),
    /EI_APPENDIX_B_MASTER_GRID_MISS/u,
  );
});

test('gas thermodynamic defaults preserve reference-temperature custody', async () => {
  const methane = await inspectEiAviffGasThermodynamicCandidate('METHANE');
  assert.equal(methane.row.molecularWeightKgPerKmol, 16.04);
  assert.equal(methane.row.gamma, 1.31);
  assert.equal(methane.row.sonicVelocityMps, 446);
  assert.equal(methane.row.referenceTemperatureC, 20);
  const steam = await inspectEiAviffGasThermodynamicCandidate('STEAM_WATER_VAPOR');
  assert.equal(steam.row.referenceTemperatureC, 100);
  assert.equal(steam.row.sonicVelocityMps, 478);
});

test('water vapor pressure resolves exact source temperatures only', async () => {
  const at100 = await inspectEiAviffWaterVaporPressureCandidate(100);
  assert.equal(at100.row.vaporPressureBarA, 1.0133);
  closeTo(at100.row.vaporPressureKPaA, 101.33);
  await assert.rejects(
    () => inspectEiAviffWaterVaporPressureCandidate(25),
    /EI_APPENDIX_B_MASTER_GRID_MISS/u,
  );
});

test('Reynolds candidate retains EI units and mechanism-specific Dchar rules', async () => {
  const rule = await inspectEiAviffReynoldsRuleCandidate();
  assert.equal(rule.master.data.expression, 'rho*v*Dchar/(1000*mu)');
  assert.equal(rule.master.data.characteristicDimensionUnit, 'mm');
  assert.equal(rule.master.data.dynamicViscosityUnit, 'Pa.s');
  assert.equal(rule.master.data.characteristicDimensions.DEADLEG_T2_6_3, 'MAIN_PIPE_INTERNAL_DIAMETER');
  assert.equal(rule.master.data.characteristicDimensions.THERMOWELL_STRAIGHT, 'D_TW_TIP');
  assert.equal(rule.master.data.characteristicDimensions.THERMOWELL_TAPERED, 'D2_TIP');
});

test('T2.3 mechanical baseline rows preserve qualification gates and transfer rule', async () => {
  const recip = await inspectEiAviffMechanicalExcitationCandidate('RECIP_PD_COMPRESSOR_OR_PUMP');
  assert.equal(recip.row.baselineLof, 0.90);
  assert.equal(recip.row.qualifiedReducedLof, 0.40);
  const motor = await inspectEiAviffMechanicalExcitationCandidate('ELECTRIC_MOTOR_OR_ALTERNATOR_LT_15KW');
  assert.equal(motor.row.baselineLof, 0.20);
  const shared = await inspectEiAviffMechanicalExcitationCandidate('PIPEWORK_SHARING_SUPPORTS_WITH_LINE_LOF_GE_0_50');
  assert.equal(shared.row.adjacentLofThreshold, 0.50);
  assert.equal(shared.row.resultRule, 'EQUAL_ADJACENT_LOF');
  assert.equal(shared.row.baselineLof, undefined);
});

test('candidate provenance is pinned to the owner-selected Advanced_Analysis object', async () => {
  const inspected = await inspectEiAviffAppendixBCandidate(EI_AVIFF_APPENDIX_B_MASTER_IDS.waterVaporPressure);
  assert.equal(inspected.provenance.sourceRepository, 'reallaksh19/Advanced_Analysis');
  assert.equal(inspected.provenance.sourceCommit, '6111ddbc0f27dd95b50a80c569a2c4daba3b3921');
  assert.equal(inspected.provenance.sourceGitBlob, 'sha1:1d26832aa3ba1e2a99f680ea3d8243490e0ffeb6');
  assert.equal(inspected.provenance.sourcePath, 'docs/EI data/Appendix_B_Defaults_and_Fluid_Properties.md');
  assert.equal(inspected.authority.engineeringAuthority, 'NONE');
  assert.equal(inspected.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(inspected.authority.designAuthority, false);
});

test('figure-derived default masters declare no interpolation policy', async () => {
  const viscosity = await inspectEiAviffAppendixBCandidate(EI_AVIFF_APPENDIX_B_MASTER_IDS.gasDynamicViscosity);
  const vapor = await inspectEiAviffAppendixBCandidate(EI_AVIFF_APPENDIX_B_MASTER_IDS.waterVaporPressure);
  assert.equal(viscosity.master.data.interpolationPolicy, 'NONE');
  assert.equal(vapor.master.data.interpolationPolicy, 'NONE');
  assert.equal(viscosity.usagePolicy.interpolationAllowed, false);
  assert.equal(viscosity.usagePolicy.extrapolationAllowed, false);
});
