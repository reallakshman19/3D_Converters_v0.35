const PRESSURE_TO_MPA = Object.freeze({
  PA: 1e-6,
  KPA: 1e-3,
  MPA: 1,
  BAR: 0.1,
  BARG: 0.1,
  PSI: 0.006894757293168361,
  PSIG: 0.006894757293168361,
  KSI: 6.894757293168361,
});

const LENGTH_TO_MM = Object.freeze({
  MM: 1,
  CM: 10,
  M: 1000,
  IN: 25.4,
  INCH: 25.4,
  INCHES: 25.4,
});

function normUnit(unit) {
  return String(unit ?? '').trim().toUpperCase().replace(/[.\s_-]+/g, '');
}

function positiveFinite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${field} must be a positive finite number`);
  }
  return number;
}

function nonNegativeFinite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new RangeError(`${field} must be a non-negative finite number`);
  }
  return number;
}

export function pressureToMPa(value, unit, field = 'pressure') {
  const factor = PRESSURE_TO_MPA[normUnit(unit)];
  if (!factor) throw new RangeError(`Unsupported ${field} unit: ${unit}`);
  return positiveFinite(value, field) * factor;
}

export function stressToMPa(value, unit, field = 'allowableStress') {
  return pressureToMPa(value, unit, field);
}

export function lengthToMm(value, unit, field = 'length', { allowZero = false } = {}) {
  const factor = LENGTH_TO_MM[normUnit(unit)];
  if (!factor) throw new RangeError(`Unsupported ${field} unit: ${unit}`);
  const number = allowZero ? nonNegativeFinite(value, field) : positiveFinite(value, field);
  return number * factor;
}

export function normalizeLengthValue(value, defaultUnit, field, { allowZero = false } = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return lengthToMm(value.value, value.unit || defaultUnit, field, { allowZero });
  }
  return lengthToMm(value, defaultUnit, field, { allowZero });
}

export function normalizeUnitName(unit) {
  return normUnit(unit);
}
