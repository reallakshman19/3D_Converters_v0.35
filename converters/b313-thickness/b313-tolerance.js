import { lengthToMm } from './b313-units.js';

function fail(message) {
  const error = new RangeError(message);
  error.code = 'INVALID_NEGATIVE_MILL_TOLERANCE';
  throw error;
}

export function normalizeNegativeMillTolerance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('negativeMillTolerance must be an object with an explicit basis');
  }

  const basis = String(value.basis ?? '').trim().toLowerCase();
  const number = Number(value.value);
  if (!Number.isFinite(number) || number < 0) {
    fail('negativeMillTolerance.value must be a non-negative finite number');
  }

  if (basis === 'percent' || basis === 'percentage') {
    if (number >= 100) fail('percent negative mill tolerance must be less than 100');
    return Object.freeze({
      basis: 'percent',
      inputValue: number,
      inputUnit: '%',
      fraction: number / 100,
      percent: number,
      absoluteMm: null,
    });
  }

  if (basis === 'absolute') {
    const unit = String(value.unit ?? '').trim();
    if (!unit) fail('absolute negative mill tolerance requires an explicit length unit');
    let absoluteMm;
    try {
      absoluteMm = lengthToMm(number, unit, 'negativeMillTolerance', { allowZero: true });
    } catch (error) {
      fail(error.message);
    }
    return Object.freeze({
      basis: 'absolute',
      inputValue: number,
      inputUnit: unit,
      fraction: null,
      percent: null,
      absoluteMm,
    });
  }

  fail(`Unsupported negative mill tolerance basis: ${value.basis}`);
}

export function requiredNominalFromMinimum(requiredMinimumThicknessMm, tolerance) {
  const minimum = Number(requiredMinimumThicknessMm);
  if (!Number.isFinite(minimum) || minimum <= 0) {
    throw new RangeError('requiredMinimumThicknessMm must be positive');
  }
  if (tolerance.basis === 'percent') return minimum / (1 - tolerance.fraction);
  return minimum + tolerance.absoluteMm;
}

export function minimumAsManufacturedFromNominal(nominalThicknessMm, tolerance) {
  const nominal = Number(nominalThicknessMm);
  if (!Number.isFinite(nominal) || nominal <= 0) {
    throw new RangeError('nominalThicknessMm must be positive');
  }
  if (tolerance.basis === 'percent') return nominal * (1 - tolerance.fraction);
  return nominal - tolerance.absoluteMm;
}

export function toleranceDeductionAtNominal(nominalThicknessMm, tolerance) {
  if (tolerance.basis === 'percent') return nominalThicknessMm * tolerance.fraction;
  return tolerance.absoluteMm;
}
