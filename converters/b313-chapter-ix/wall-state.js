function failure(code, message, details = {}) {
  return { ok: false, code, message, details };
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validatePercent(value, field) {
  if (!finite(value) || value < 0 || value >= 100) {
    return failure('INPUT_INVALID', `${field} must be >= 0 and < 100%.`, { field });
  }
  return null;
}

function validateNonNegative(value, field) {
  if (!finite(value) || value < 0) {
    return failure('INPUT_INVALID', `${field} must be a non-negative finite number.`, { field });
  }
  return null;
}

function validateBrownfield(input) {
  const hasMeasured = input.measuredCurrentWallMm !== undefined;
  const hasFutureLoss = input.futureInternalLossMm !== undefined
    || input.futureExternalLossMm !== undefined;
  if (!hasMeasured && hasFutureLoss) {
    return failure('INPUT_INVALID', 'future wall-loss inputs require a measured current wall.', { field: 'measuredCurrentWallMm' });
  }
  if (!hasMeasured) return null;
  if (!finite(input.measuredCurrentWallMm) || !(input.measuredCurrentWallMm > 0)) {
    return failure('INPUT_INVALID', 'measured current wall must be a positive finite number.', { field: 'measuredCurrentWallMm' });
  }
  for (const field of ['futureInternalLossMm', 'futureExternalLossMm']) {
    const error = validateNonNegative(input[field], field);
    if (error) return error;
  }
  return null;
}

function validate(input) {
  if (!finite(input.nominalWallMm) || !(input.nominalWallMm > 0)) {
    return failure('INPUT_INVALID', 'nominal wall must be a positive finite number.', { field: 'nominalWallMm' });
  }
  const toleranceError = validatePercent(input.minusTolerancePct, 'minusTolerancePct');
  if (toleranceError) return toleranceError;
  for (const field of ['internalServiceAllowanceMm', 'externalServiceAllowanceMm']) {
    const error = validateNonNegative(input[field], field);
    if (error) return error;
  }
  return validateBrownfield(input);
}

function greenfieldState(input) {
  const toleranceFactor = 1 - input.minusTolerancePct / 100;
  const minimumAsManufacturedWallMm = input.nominalWallMm * toleranceFactor;
  const reservedServiceLossMm = input.internalServiceAllowanceMm + input.externalServiceAllowanceMm;
  const endOfLifeEffectiveWallMm = minimumAsManufacturedWallMm - reservedServiceLossMm;
  if (!(endOfLifeEffectiveWallMm > 0)) {
    return failure('INPUT_INVALID', 'reserved service loss leaves a non-positive end-of-life effective wall.');
  }
  return {
    ok: true,
    toleranceFactor,
    nominalWallMm: input.nominalWallMm,
    minimumAsManufacturedWallMm,
    beginOfLifeConservativeWallMm: minimumAsManufacturedWallMm,
    reservedServiceLossMm,
    endOfLifeEffectiveWallMm,
  };
}

function brownfieldState(input, result) {
  if (input.measuredCurrentWallMm === undefined) return result;
  const futureServiceLossMm = input.futureInternalLossMm + input.futureExternalLossMm;
  const projectedEndOfLifeWallMm = input.measuredCurrentWallMm - futureServiceLossMm;
  if (!(projectedEndOfLifeWallMm > 0)) {
    return failure('INPUT_INVALID', 'future service loss leaves a non-positive projected end-of-life wall.');
  }
  return {
    ...result,
    measuredCurrentWallMm: input.measuredCurrentWallMm,
    futureServiceLossMm,
    projectedEndOfLifeWallMm,
  };
}

export function calculateChapterIxWallState(input = {}) {
  const validation = validate(input);
  if (validation) return validation;
  const greenfield = greenfieldState(input);
  if (!greenfield.ok) return greenfield;
  return brownfieldState(input, {
    ...greenfield,
    wallStateContract: 'B313_CH9_WALL_STATE_V1',
  });
}
