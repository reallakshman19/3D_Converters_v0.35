import { calculateChapterIxPressureStress } from './pressure-stress.js';

function failure(code, message, details = {}) {
  return { ok: false, code, message, details, canUseForDesignAuthority: false };
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function calculateChapterIxPressureCycleStress(input = {}) {
  for (const field of ['outsideDiameterMm', 'effectiveWallMm', 'fromPressureMpa', 'toPressureMpa']) {
    if (!finite(input[field])) return failure('INPUT_INVALID', `${field} must be finite.`, { field });
  }
  const from = calculateChapterIxPressureStress({
    outsideDiameterMm: input.outsideDiameterMm,
    effectiveWallMm: input.effectiveWallMm,
    internalPressureMpa: input.fromPressureMpa,
  });
  if (!from.ok) return failure(from.code, from.message, { stage: 'FROM_STATE', ...(from.details ?? {}) });
  const to = calculateChapterIxPressureStress({
    outsideDiameterMm: input.outsideDiameterMm,
    effectiveWallMm: input.effectiveWallMm,
    internalPressureMpa: input.toPressureMpa,
  });
  if (!to.ok) return failure(to.code, to.message, { stage: 'TO_STATE', ...(to.details ?? {}) });

  const pressureRangeMpa = Math.abs(input.toPressureMpa - input.fromPressureMpa);
  const stressIntensityRangeMpa = Math.abs(to.stressIntensityMpa - from.stressIntensityMpa);
  const alternatingStressIntensityMpa = stressIntensityRangeMpa / 2;
  const explicitAlternatingMpa = pressureRangeMpa
    * (from.diameterRatioY ** 2) / ((from.diameterRatioY ** 2) - 1);
  const consistencyErrorMpa = Math.abs(alternatingStressIntensityMpa - explicitAlternatingMpa);
  return {
    ok: true,
    canUseForDesignAuthority: false,
    from,
    to,
    pressureRangeMpa,
    meanPressureMpa: (input.fromPressureMpa + input.toPressureMpa) / 2,
    stressIntensityRangeMpa,
    alternatingStressIntensityMpa,
    explicitAlternatingStressIntensityMpa: explicitAlternatingMpa,
    consistencyErrorMpa,
    meanStressIntensityMpa: (from.stressIntensityMpa + to.stressIntensityMpa) / 2,
    formulation: 'HIGH_PR_SPEC_KD3_PRESSURE_CYCLE_STRESS_V1',
  };
}
