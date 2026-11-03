import { deepFreezeVibrationMaster } from './canonical.js';
import {
  inspectEiAviffMechanicalExcitationCandidate,
  inspectEiAviffReynoldsRuleCandidate,
} from './ei-aviff-appendix-b-candidate.js';
import { EI_APPENDIX_B_DEFAULT_USE_POLICY } from './ei-aviff-appendix-b-data.js';

const AUTHORITY = Object.freeze({
  engineeringAuthority: 'NONE',
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
  masterDataAuthority: false,
});

function finiteNumber(value, code, { positive = false } = {}) {
  if (value === '' || value === null || value === undefined) throw new TypeError(code);
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (positive && number === 0)) throw new TypeError(code);
  return number;
}

export async function calculateEiAviffReynoldsCandidate(input = {}) {
  const densityKgM3 = finiteNumber(input.densityKgM3, 'EI_REYNOLDS_DENSITY_INVALID', { positive: true });
  const velocityMps = finiteNumber(input.velocityMps, 'EI_REYNOLDS_VELOCITY_INVALID');
  const characteristicDimensionMm = finiteNumber(
    input.characteristicDimensionMm, 'EI_REYNOLDS_CHARACTERISTIC_DIMENSION_INVALID', { positive: true },
  );
  const dynamicViscosityPaS = finiteNumber(
    input.dynamicViscosityPaS, 'EI_REYNOLDS_DYNAMIC_VISCOSITY_INVALID', { positive: true },
  );
  const rule = await inspectEiAviffReynoldsRuleCandidate();
  const reynoldsNumber = densityKgM3 * velocityMps * characteristicDimensionMm
    / (1000 * dynamicViscosityPaS);
  return deepFreezeVibrationMaster({
    schema: 'EiReynoldsCandidateCalculation.v1',
    status: 'CALCULATED_CANDIDATE_ONLY',
    reynoldsNumber,
    inputs: { densityKgM3, velocityMps, characteristicDimensionMm, dynamicViscosityPaS },
    rule: rule.master.data,
    provenance: rule.provenance,
    authority: AUTHORITY,
    usagePolicy: EI_APPENDIX_B_DEFAULT_USE_POLICY,
  });
}

export async function evaluateEiAviffMechanicalBaselineCandidate(sourceKeys = []) {
  if (!Array.isArray(sourceKeys) || !sourceKeys.length) {
    throw new TypeError('EI_T2_3_MECHANICAL_SOURCE_KEYS_REQUIRED');
  }
  const uniqueKeys = [...new Set(sourceKeys.map((value) => String(value ?? '').trim()))];
  if (uniqueKeys.some((key) => !key)) throw new TypeError('EI_T2_3_MECHANICAL_SOURCE_KEY_REQUIRED');
  const resolutions = await Promise.all(uniqueKeys.map(inspectEiAviffMechanicalExcitationCandidate));
  const nonNumeric = resolutions.find((item) => !Number.isFinite(item.row.baselineLof));
  if (nonNumeric) {
    throw new Error(`EI_T2_3_MECHANICAL_DIRECT_BASELINE_UNAVAILABLE:${nonNumeric.row.sourceKey}`);
  }
  const governing = resolutions.reduce((current, item) => (
    item.row.baselineLof > current.row.baselineLof ? item : current
  ));
  return deepFreezeVibrationMaster({
    schema: 'EiMechanicalExcitationCandidateEvaluation.v1',
    status: 'CALCULATED_CANDIDATE_ONLY',
    governingLof: governing.row.baselineLof,
    governingSourceKey: governing.row.sourceKey,
    rows: resolutions.map((item) => item.row),
    provenance: governing.provenance,
    authority: AUTHORITY,
    usagePolicy: EI_APPENDIX_B_DEFAULT_USE_POLICY,
  });
}
