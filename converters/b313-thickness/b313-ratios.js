import { pressureToMPa, stressToMPa } from './b313-units.js';

export function calculateB313PressureStressRatios({
  designPressure,
  pressureUnit = 'MPa',
  allowableStress,
  stressUnit = pressureUnit,
  qualityFactorE,
} = {}) {
  try {
    const pressureMPa = pressureToMPa(designPressure, pressureUnit, 'designPressure');
    const allowableStressMPa = stressToMPa(allowableStress, stressUnit, 'allowableStress');
    const pressureAllowableStressRatio = pressureMPa / allowableStressMPa;

    let pressureEffectiveStressRatio = null;
    let normalizedQualityFactorE = null;
    if (qualityFactorE !== undefined && qualityFactorE !== null && qualityFactorE !== '') {
      normalizedQualityFactorE = Number(qualityFactorE);
      if (!Number.isFinite(normalizedQualityFactorE) || normalizedQualityFactorE <= 0 || normalizedQualityFactorE > 1) {
        throw new RangeError('qualityFactorE must be > 0 and <= 1');
      }
      pressureEffectiveStressRatio = pressureMPa / (allowableStressMPa * normalizedQualityFactorE);
    }

    return {
      ok: true,
      code: 'B313_PRESSURE_STRESS_RATIOS_CALCULATED',
      pressureMPa,
      allowableStressMPa,
      qualityFactorE: normalizedQualityFactorE,
      pressureAllowableStressRatio,
      pressureEffectiveStressRatio,
    };
  } catch (error) {
    return {
      ok: false,
      code: 'INVALID_B313_RATIO_INPUT',
      message: error.message,
    };
  }
}
