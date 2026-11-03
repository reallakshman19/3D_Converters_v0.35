function failure(code, message, details = {}) {
  return { ok: false, code, message, details, canUseForDesignAuthority: false };
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validate(input) {
  for (const field of ['outsideDiameterMm', 'effectiveWallMm', 'internalPressureMpa']) {
    if (!finite(input[field])) return failure('INPUT_INVALID', `${field} must be finite.`, { field });
  }
  if (!(input.outsideDiameterMm > 0)) return failure('INPUT_INVALID', 'outsideDiameterMm must be > 0.');
  if (!(input.effectiveWallMm > 0)) return failure('INPUT_INVALID', 'effectiveWallMm must be > 0.');
  if (input.internalPressureMpa < 0) return failure('INPUT_INVALID', 'internalPressureMpa cannot be negative.');
  if (!(input.outsideDiameterMm > 2 * input.effectiveWallMm)) {
    return failure('INPUT_INVALID', 'effective wall must leave a positive internal diameter.');
  }
  return null;
}

export function calculateChapterIxPressureStress(input = {}) {
  const error = validate(input);
  if (error) return error;
  const innerDiameterMm = input.outsideDiameterMm - 2 * input.effectiveWallMm;
  const diameterRatioY = input.outsideDiameterMm / innerDiameterMm;
  const ySquared = diameterRatioY ** 2;
  const denominator = ySquared - 1;
  const pressure = input.internalPressureMpa;
  const hoopStressMpa = pressure * (ySquared + 1) / denominator;
  const radialStressMpa = -pressure;
  const longitudinalStressMpa = pressure / denominator;
  const s12Mpa = hoopStressMpa - longitudinalStressMpa;
  const s23Mpa = longitudinalStressMpa - radialStressMpa;
  const s31Mpa = radialStressMpa - hoopStressMpa;
  const stressIntensityMpa = Math.max(Math.abs(s12Mpa), Math.abs(s23Mpa), Math.abs(s31Mpa));
  return {
    ok: true,
    canUseForDesignAuthority: false,
    outsideDiameterMm: input.outsideDiameterMm,
    effectiveWallMm: input.effectiveWallMm,
    innerDiameterMm,
    diameterRatioY,
    internalPressureMpa: pressure,
    principalStressMpa: {
      hoop: hoopStressMpa,
      longitudinal: longitudinalStressMpa,
      radial: radialStressMpa,
    },
    principalStressDifferenceMpa: { s12: s12Mpa, s23: s23Mpa, s31: s31Mpa },
    stressIntensityMpa,
    formulation: 'HIGH_PR_SPEC_KD2_BORE_PRESSURE_STRESS_V1',
  };
}
