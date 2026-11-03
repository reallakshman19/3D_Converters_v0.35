import { vibrationTabularInputError } from '../tabular/csv.js';

export function aivText(value) {
  return String(value ?? '');
}

export function optionalAivText(value) {
  const result = aivText(value).trim();
  return result === '' ? undefined : result;
}

export function requiredAivText(value, field, rowNumber) {
  const result = aivText(value).trim();
  if (!result) {
    throw vibrationTabularInputError(
      'AIV_TABULAR_REQUIRED_VALUE',
      `${field} is required.`,
      { row: rowNumber, field },
    );
  }
  return result;
}

export function aivEnumValue(value, field, allowed, rowNumber) {
  const result = requiredAivText(value, field, rowNumber).toUpperCase();
  if (!allowed.includes(result)) {
    throw vibrationTabularInputError(
      'AIV_TABULAR_ENUM_UNSUPPORTED',
      `${field} must be one of ${allowed.join(', ')}.`,
      { row: rowNumber, field, value: result, allowed },
    );
  }
  return result;
}

export function aivQuantity(row, rowNumber, valueIndex, unitIndex, field, { optional = false } = {}) {
  const rawValue = aivText(row[valueIndex]).trim();
  const rawUnit = aivText(row[unitIndex]).trim();
  if (optional && rawValue === '' && rawUnit === '') return undefined;
  if (rawValue === '' || rawUnit === '') {
    throw vibrationTabularInputError(
      'AIV_TABULAR_QUANTITY_PAIR_REQUIRED',
      `${field} requires both value and unit.`,
      { row: rowNumber, field, value: rawValue, unit: rawUnit },
    );
  }
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw vibrationTabularInputError(
      'AIV_TABULAR_INVALID_NUMBER',
      `${field} must be a finite number.`,
      { row: rowNumber, field, value: rawValue },
    );
  }
  return Object.freeze({ value, unit: rawUnit });
}

export function assertAivColumnCount(row, header, schema, rowNumber) {
  if (row.length === header.length) return;
  throw vibrationTabularInputError(
    'AIV_TABULAR_COLUMN_COUNT_MISMATCH',
    `${schema} row does not match the controlled column count.`,
    { row: rowNumber, expected: header.length, actual: row.length },
  );
}

export function addOptionalAivTraceFields(result, row, mapping) {
  for (const [field, column] of mapping) {
    const value = optionalAivText(row[column]);
    if (value !== undefined) result[field] = value;
  }
  return result;
}
