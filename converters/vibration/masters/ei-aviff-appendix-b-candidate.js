import { deepFreezeVibrationMaster } from './canonical.js';
import { buildVibrationMasterRegistry, inspectVibrationMasterCandidate } from './registry.js';
import {
  EI_APPENDIX_B_DEFAULT_USE_POLICY,
  EI_AVIFF_APPENDIX_B_MASTER_IDS,
  EI_AVIFF_APPENDIX_B_SOURCE,
  EI_GAS_THERMODYNAMIC_ROWS,
  EI_GAS_VISCOSITY_ROWS,
  EI_LIQUID_SOUND_ROWS,
  EI_MECHANICAL_EXCITATION_ROWS,
  EI_REYNOLDS_RULE,
  EI_SHARED_SUPPORT_TRANSFER_RULE,
  EI_WATER_VAPOR_PRESSURE_ROWS,
} from './ei-aviff-appendix-b-data.js';

const COMMON = Object.freeze({
  schema: 'VibrationMaster.v1',
  edition: 'EI AVIFF 2nd Edition (2008)',
  revision: 'AA-6111DDBC-APPENDIX-B-STAGE3',
  publicationState: 'CANDIDATE',
});

function source(locator) {
  return { ...EI_AVIFF_APPENDIX_B_SOURCE, locator };
}

const MASTERS = Object.freeze([
  Object.freeze({
    ...COMMON,
    masterId: EI_AVIFF_APPENDIX_B_MASTER_IDS.liquidSpeedOfSound,
    methodId: 'EI_AVIFF.APPENDIX_B.B8_2.LIQUID_SPEED_OF_SOUND',
    authorityClass: 'EI_DEFAULT_PROPERTY',
    source: source({
      sourceType: 'TABLE', identifier: 'Section B.8.2 liquid speed of sound',
      section: 'Appendix B.8.2', printedPage: 158, pdfPage: 166,
    }),
    dataSchema: 'EiLiquidSpeedOfSoundDefaultTable.v1',
    data: { referenceTemperatureC: 20, unit: 'm/s', rows: EI_LIQUID_SOUND_ROWS },
  }),
  Object.freeze({
    ...COMMON,
    masterId: EI_AVIFF_APPENDIX_B_MASTER_IDS.reynoldsRule,
    methodId: 'EI_AVIFF.APPENDIX_B.B9.REYNOLDS',
    authorityClass: 'EI_METHOD_MASTER',
    source: source({
      sourceType: 'EQUATION', identifier: 'Section B.9 Reynolds number and Dchar rules',
      section: 'Appendix B.9 / T2.6.3 / T4', printedPage: 158, pdfPage: 166,
    }),
    dataSchema: 'EiReynoldsCharacteristicDimensionRule.v1', data: EI_REYNOLDS_RULE,
  }),
  Object.freeze({
    ...COMMON,
    masterId: EI_AVIFF_APPENDIX_B_MASTER_IDS.gasDynamicViscosity,
    methodId: 'EI_AVIFF.APPENDIX_B.B2.GAS_DYNAMIC_VISCOSITY',
    authorityClass: 'EI_DEFAULT_PROPERTY',
    source: source({
      sourceType: 'CURVE', identifier: 'Figure B-1 gas dynamic viscosity vs temperature',
      section: 'Appendix B.2', printedPage: 159, pdfPage: 167,
    }),
    dataSchema: 'EiGasDynamicViscosityDefaultGrid.v1',
    data: { unit: 'Pa.s', interpolationPolicy: 'NONE', rows: EI_GAS_VISCOSITY_ROWS },
  }),
  Object.freeze({
    ...COMMON,
    masterId: EI_AVIFF_APPENDIX_B_MASTER_IDS.gasThermodynamicDefaults,
    methodId: 'EI_AVIFF.APPENDIX_B.B2_B5.GAS_THERMODYNAMIC_DEFAULTS',
    authorityClass: 'EI_DEFAULT_PROPERTY',
    source: source({
      sourceType: 'CURVE', identifier: 'Figures B-2 to B-5 gamma and sonic-velocity defaults',
      section: 'Appendix B, printed pages 159-161', printedPage: 159, pdfPage: 167,
    }),
    dataSchema: 'EiGasThermodynamicDefaultTable.v1',
    data: {
      gasConstantJPerKmolK: 8314.5,
      sonicVelocityExpression: 'sqrt(gamma*Z*R*T/Mw)',
      rows: EI_GAS_THERMODYNAMIC_ROWS,
    },
  }),
  Object.freeze({
    ...COMMON,
    masterId: EI_AVIFF_APPENDIX_B_MASTER_IDS.waterVaporPressure,
    methodId: 'EI_AVIFF.APPENDIX_B.B6.WATER_VAPOR_PRESSURE',
    authorityClass: 'EI_DEFAULT_PROPERTY',
    source: source({
      sourceType: 'CURVE', identifier: 'Figure B-6 water vapor pressure vs temperature',
      section: 'Appendix B.6', printedPage: 161, pdfPage: 169,
    }),
    dataSchema: 'EiWaterVaporPressureDefaultGrid.v1',
    data: { interpolationPolicy: 'NONE', rows: EI_WATER_VAPOR_PRESSURE_ROWS },
  }),
  Object.freeze({
    ...COMMON,
    masterId: EI_AVIFF_APPENDIX_B_MASTER_IDS.mechanicalExcitation,
    methodId: 'VIB.MECHANICAL.T2_3.BASELINE',
    authorityClass: 'EI_METHOD_MASTER',
    source: source({
      sourceType: 'TABLE', identifier: 'Table T2-3 mechanical excitation baseline LOFs',
      section: 'Technical Module T2.3', printedPage: 54, pdfPage: 62,
    }),
    dataSchema: 'EiMechanicalExcitationBaselineLofTable.v1',
    data: { rows: EI_MECHANICAL_EXCITATION_ROWS, sharedSupportTransferRule: EI_SHARED_SUPPORT_TRANSFER_RULE },
  }),
]);

let registryPromise = null;

export function buildEiAviffAppendixBCandidateRegistry() {
  registryPromise ??= buildVibrationMasterRegistry(MASTERS);
  return registryPromise;
}

export async function inspectEiAviffAppendixBCandidate(masterId) {
  const registry = await buildEiAviffAppendixBCandidateRegistry();
  const inspected = await inspectVibrationMasterCandidate(registry, masterId);
  return deepFreezeVibrationMaster({
    ...inspected,
    usagePolicy: EI_APPENDIX_B_DEFAULT_USE_POLICY,
  });
}

function candidateRow(inspected, row) {
  if (!row) throw new Error('EI_APPENDIX_B_MASTER_GRID_MISS');
  return deepFreezeVibrationMaster({
    schema: 'EiAppendixBCandidateRowResolution.v1',
    status: 'CANDIDATE_ONLY', row,
    provenance: inspected.provenance,
    authority: inspected.authority,
    usagePolicy: EI_APPENDIX_B_DEFAULT_USE_POLICY,
  });
}

function exactText(value, code) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(code);
  return text;
}

function exactNumber(value, code) {
  if (value === '' || value === null || value === undefined) throw new TypeError(code);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(code);
  return number;
}

export async function inspectEiAviffLiquidSoundCandidate(liquidKey) {
  const inspected = await inspectEiAviffAppendixBCandidate(EI_AVIFF_APPENDIX_B_MASTER_IDS.liquidSpeedOfSound);
  const key = exactText(liquidKey, 'EI_APPENDIX_B_LIQUID_KEY_REQUIRED');
  return candidateRow(inspected, inspected.master.data.rows.find((row) => row.liquidKey === key));
}

export async function inspectEiAviffGasViscosityCandidate(gasKey, temperatureC) {
  const inspected = await inspectEiAviffAppendixBCandidate(EI_AVIFF_APPENDIX_B_MASTER_IDS.gasDynamicViscosity);
  const key = exactText(gasKey, 'EI_APPENDIX_B_GAS_KEY_REQUIRED');
  const temperature = exactNumber(temperatureC, 'EI_APPENDIX_B_TEMPERATURE_REQUIRED');
  const gas = inspected.master.data.rows.find((row) => row.gasKey === key);
  const point = gas?.points.find((row) => row.temperatureC === temperature);
  return candidateRow(inspected, point ? { gasKey: key, ...point } : null);
}

export async function inspectEiAviffGasThermodynamicCandidate(gasKey) {
  const inspected = await inspectEiAviffAppendixBCandidate(EI_AVIFF_APPENDIX_B_MASTER_IDS.gasThermodynamicDefaults);
  const key = exactText(gasKey, 'EI_APPENDIX_B_GAS_KEY_REQUIRED');
  return candidateRow(inspected, inspected.master.data.rows.find((row) => row.gasKey === key));
}

export async function inspectEiAviffWaterVaporPressureCandidate(temperatureC) {
  const inspected = await inspectEiAviffAppendixBCandidate(EI_AVIFF_APPENDIX_B_MASTER_IDS.waterVaporPressure);
  const temperature = exactNumber(temperatureC, 'EI_APPENDIX_B_TEMPERATURE_REQUIRED');
  return candidateRow(inspected, inspected.master.data.rows.find((row) => row.temperatureC === temperature));
}

export async function inspectEiAviffReynoldsRuleCandidate() {
  return inspectEiAviffAppendixBCandidate(EI_AVIFF_APPENDIX_B_MASTER_IDS.reynoldsRule);
}

export async function inspectEiAviffMechanicalExcitationCandidate(sourceKey) {
  const inspected = await inspectEiAviffAppendixBCandidate(EI_AVIFF_APPENDIX_B_MASTER_IDS.mechanicalExcitation);
  const key = exactText(sourceKey, 'EI_T2_3_MECHANICAL_SOURCE_KEY_REQUIRED');
  const row = inspected.master.data.rows.find((item) => item.sourceKey === key)
    ?? (inspected.master.data.sharedSupportTransferRule.sourceKey === key
      ? inspected.master.data.sharedSupportTransferRule : null);
  return candidateRow(inspected, row);
}
