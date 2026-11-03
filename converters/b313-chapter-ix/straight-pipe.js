const REQUIRED_FIELDS = Object.freeze([
  ['outsideDiameterMm', 'outside diameter'],
  ['designPressureMpa', 'design pressure'],
  ['allowableStressMpa', 'allowable stress'],
  ['internalAllowanceMm', 'internal allowance'],
  ['externalAllowanceMm', 'external allowance'],
  ['minusTolerancePct', 'minus manufacturing tolerance'],
]);

function failure(code, message, details = {}) {
  return { ok: false, code, message, details };
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateRequired(input) {
  for (const [key, label] of REQUIRED_FIELDS) {
    if (!finiteNumber(input[key])) {
      return failure('INPUT_INVALID', `${label} must be a finite number.`, { field: key });
    }
  }
  if (!(input.outsideDiameterMm > 0)) return failure('INPUT_INVALID', 'outside diameter must be > 0.', { field: 'outsideDiameterMm' });
  if (!(input.designPressureMpa > 0)) return failure('INPUT_INVALID', 'design pressure must be > 0.', { field: 'designPressureMpa' });
  if (!(input.allowableStressMpa > 0)) return failure('INPUT_INVALID', 'allowable stress must be > 0.', { field: 'allowableStressMpa' });
  if (input.internalAllowanceMm < 0 || input.externalAllowanceMm < 0) {
    return failure('INPUT_INVALID', 'allowances cannot be negative.');
  }
  if (!(input.minusTolerancePct >= 0 && input.minusTolerancePct < 100)) {
    return failure('INPUT_INVALID', 'minus manufacturing tolerance must be >= 0 and < 100%.', { field: 'minusTolerancePct' });
  }
  if (!(input.outsideDiameterMm > 2 * input.externalAllowanceMm)) {
    return failure('INPUT_INVALID', 'outside diameter must exceed 2 x external allowance.');
  }
  return null;
}

function baseResult(input) {
  const diameterForPressure = input.outsideDiameterMm - 2 * input.externalAllowanceMm;
  const pressureDesignThicknessMm = (diameterForPressure / 2)
    * (1 - Math.exp(-input.designPressureMpa / input.allowableStressMpa));
  const requiredMinimumThicknessMm = pressureDesignThicknessMm
    + input.internalAllowanceMm + input.externalAllowanceMm;
  const toleranceFactor = 1 - input.minusTolerancePct / 100;
  return {
    pressureDesignThicknessMm,
    requiredMinimumThicknessMm,
    requiredNominalThicknessMm: requiredMinimumThicknessMm / toleranceFactor,
    toleranceFactor,
  };
}

function providedWallResult(input, base) {
  if (input.providedNominalThicknessMm === undefined) return { ok: true };
  if (!finiteNumber(input.providedNominalThicknessMm) || !(input.providedNominalThicknessMm > 0)) {
    return failure('INPUT_INVALID', 'provided nominal thickness must be a positive finite number.', { field: 'providedNominalThicknessMm' });
  }
  const minimumAsManufacturedThicknessMm = input.providedNominalThicknessMm * base.toleranceFactor;
  const effectiveNetWallMm = minimumAsManufacturedThicknessMm
    - input.internalAllowanceMm - input.externalAllowanceMm;
  if (!(effectiveNetWallMm > 0)) {
    return failure('INPUT_INVALID', 'provided wall leaves a non-positive effective net wall.');
  }

  const numerator = input.outsideDiameterMm - 2 * input.externalAllowanceMm;
  const denominator = input.outsideDiameterMm
    - 2 * (minimumAsManufacturedThicknessMm - input.internalAllowanceMm);
  if (!(numerator > denominator && denominator > 0)) {
    return failure('INPUT_INVALID', 'provided wall produces an invalid pressure-rating geometry.');
  }
  const pressureRatingMpa = input.allowableStressMpa * Math.log(numerator / denominator);
  const staticPass = minimumAsManufacturedThicknessMm >= base.requiredMinimumThicknessMm
    && pressureRatingMpa >= input.designPressureMpa;
  return {
    ok: true,
    minimumAsManufacturedThicknessMm,
    effectiveNetWallMm,
    pressureRatingMpa,
    pressureRatingMargin: pressureRatingMpa / input.designPressureMpa,
    minimumWallMarginMm: minimumAsManufacturedThicknessMm - base.requiredMinimumThicknessMm,
    staticPass,
  };
}

export function calculateChapterIxStraightPressure(input = {}) {
  const validation = validateRequired(input);
  if (validation) return validation;
  const base = baseResult(input);
  const provided = providedWallResult(input, base);
  if (!provided.ok) return provided;
  return {
    ok: true,
    ...base,
    ...provided,
    formulation: 'MERGED_HP_STRAIGHT_PIPE_STATIC_REGRESSION_V1',
  };
}
