export const B313_STANDARD = 'ASME B31.3';
export const B313_EDITION = '2024';
export const B313_PARAGRAPH = '304.1.2';
export const B313_EQUATION = '3a';

export function normalizeEdition(value = B313_EDITION) {
  const text = String(value ?? '').trim().toUpperCase();
  if (!text) return B313_EDITION;
  const match = text.match(/(20\d{2})/);
  return match ? match[1] : text;
}

export function preflightScope(input = {}) {
  const edition = normalizeEdition(input.edition);
  if (edition !== B313_EDITION) {
    return {
      ok: false,
      code: 'UNSUPPORTED_B313_EDITION',
      message: `Only ASME B31.3-${B313_EDITION} is implemented by this API`,
      details: { requestedEdition: edition, supportedEdition: B313_EDITION },
    };
  }

  const pressureMode = String(input.pressureMode ?? input.pressureType ?? 'internal').trim().toLowerCase();
  if (pressureMode !== 'internal') {
    return {
      ok: false,
      code: 'UNSUPPORTED_B313_SCOPE',
      message: 'B31.3 thickness API v1 supports internal pressure only',
      details: { pressureMode },
    };
  }

  if (input.chapterIX === true || input.highPressureFluidService === true) {
    return {
      ok: false,
      code: 'UNSUPPORTED_B313_SCOPE',
      message: 'B31.3 thickness API v1 does not implement Chapter IX high-pressure fluid service rules',
      details: { chapterIX: true },
    };
  }

  return { ok: true, edition };
}

export function postflightApplicability({ pressureMPa, allowableStressMPa, qualityFactorE, pressureDesignThicknessMm, outsideDiameterMm }) {
  const pressureAllowableStressRatio = pressureMPa / allowableStressMPa;
  const pressureEffectiveStressRatio = pressureMPa / (allowableStressMPa * qualityFactorE);
  const thicknessDiameterRatio = pressureDesignThicknessMm / outsideDiameterMm;
  const checks = [
    {
      id: 'P_OVER_SE',
      value: pressureEffectiveStressRatio,
      limit: 0.385,
      operator: '<=',
      pass: pressureEffectiveStressRatio <= 0.385,
    },
    {
      id: 'T_OVER_D',
      value: thicknessDiameterRatio,
      limit: 1 / 6,
      operator: '<',
      pass: pressureDesignThicknessMm < outsideDiameterMm / 6,
    },
  ];
  const failed = checks.filter((check) => !check.pass);
  return {
    valid: failed.length === 0,
    pressureAllowableStressRatio,
    pressureEffectiveStressRatio,
    pressureStressRatio: pressureEffectiveStressRatio,
    thicknessDiameterRatio,
    checks,
    failed,
  };
}
