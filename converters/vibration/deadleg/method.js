export const DEADLEG_STANDARD_METHOD_ID = 'EI.AVIFF.T2.6.DEADLEG_STANDARD.v1';

function positive(value, field) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${field} must be > 0.`);
  return value;
}

function validatedInput(input) {
  const value = {
    rhoV2Pa: positive(input.rhoV2Pa, 'rhoV2Pa'),
    densityKgM3: positive(input.densityKgM3, 'densityKgM3'),
    velocityMS: positive(input.velocityMS, 'velocityMS'),
    mainInsideDiameterMm: positive(input.mainInsideDiameterMm, 'mainInsideDiameterMm'),
    branchInsideDiameterMm: positive(input.branchInsideDiameterMm, 'branchInsideDiameterMm'),
    branchLengthM: positive(input.branchLengthM, 'branchLengthM'),
    dynamicViscosityPaS: positive(input.dynamicViscosityPaS, 'dynamicViscosityPaS'),
    speedOfSoundMS: positive(input.speedOfSoundMS, 'speedOfSoundMS'),
  };
  return Object.freeze(value);
}

function strouhalNumber(input, reynolds) {
  const diameterRatio = input.branchInsideDiameterMm / input.mainInsideDiameterMm;
  if (reynolds > 1.6e7) return 0.467 * diameterRatio ** 0.316;
  const s1 = 0.420
    * diameterRatio ** 0.316
    * (input.velocityMS / input.speedOfSoundMS) ** -0.083
    * (reynolds / 1e6) ** -0.065;
  return Math.abs(diameterRatio - 1) <= 1e-12 ? 2 * s1 : s1;
}

export function calculateDeadlegStandard(inputValue = {}) {
  const input = validatedInput(inputValue);
  const criticalBranchDiameterMm = 1000 * Math.sqrt(400 / (Math.PI * input.rhoV2Pa));
  if (input.branchInsideDiameterMm < criticalBranchDiameterMm) {
    return Object.freeze({
      methodId: DEADLEG_STANDARD_METHOD_ID,
      qualificationState: 'BENCHMARK_ONLY',
      engineeringAuthority: 'NONE',
      criticalBranchDiameterMm,
      diameterGatePassed: false,
      lof: 0.2,
      advanced: null,
    });
  }

  const reynolds = input.densityKgM3 * input.velocityMS
    * (input.mainInsideDiameterMm / 1000) / input.dynamicViscosityPaS;
  const strouhal = strouhalNumber(input, reynolds);
  const excitationFrequencyHz = 1000 * strouhal * input.velocityMS / input.branchInsideDiameterMm;
  const acousticNaturalFrequencyHz = 0.206 * input.speedOfSoundMS / input.branchLengthM;
  const frequencyRatio = excitationFrequencyHz / acousticNaturalFrequencyHz;
  return Object.freeze({
    methodId: DEADLEG_STANDARD_METHOD_ID,
    qualificationState: 'BENCHMARK_ONLY',
    engineeringAuthority: 'NONE',
    criticalBranchDiameterMm,
    diameterGatePassed: true,
    reynolds,
    strouhal,
    excitationFrequencyHz,
    acousticNaturalFrequencyHz,
    frequencyRatio,
    lof: frequencyRatio >= 1 ? 1 : 0.29,
    advanced: null,
  });
}
