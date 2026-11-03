import {
  assertExactVibrationCsvHeader,
  nonBlankVibrationCsvRows,
  parseStrictVibrationCsvRows,
  vibrationTabularInputError,
} from './csv.js';

export const VIBRATION_OPERATING_CASE_CSV_SCHEMA = 'VibrationOperatingCaseCsv.v1';

export const VIBRATION_OPERATING_CASE_CSV_HEADER = Object.freeze([
  'Line',
  'Operating Case',
  'Label',
  'Phase',
  'Mass Flow',
  'Mass Flow Unit',
  'Density',
  'Density Unit',
  'Pressure',
  'Pressure Unit',
  'Pressure Reference',
  'Temperature',
  'Temperature Unit',
  'Dynamic Viscosity',
  'Dynamic Viscosity Unit',
  'Velocity',
  'Velocity Unit',
  'Source',
  'Source Revision',
  'Record ID',
]);

function text(value) {
  return String(value ?? '');
}

function optionalText(value) {
  const result = text(value);
  return result === '' ? undefined : result;
}

function requiredText(value, field, rowNumber) {
  const result = text(value);
  if (!result.trim()) {
    throw vibrationTabularInputError(
      'VIBRATION_OPERATING_CASE_REQUIRED_VALUE',
      `${field} is required.`,
      { row: rowNumber, field },
    );
  }
  return result;
}

function quantity(row, rowNumber, valueIndex, unitIndex, field, referenceIndex = null) {
  const rawValue = text(row[valueIndex]);
  const rawUnit = text(row[unitIndex]);
  const rawReference = referenceIndex === null ? '' : text(row[referenceIndex]);
  const hasValue = rawValue.trim() !== '';
  const hasUnit = rawUnit.trim() !== '';
  const hasReference = rawReference.trim() !== '';

  if (!hasValue && !hasUnit && !hasReference) return undefined;
  if (!hasValue || !hasUnit) {
    throw vibrationTabularInputError(
      'VIBRATION_OPERATING_CASE_QUANTITY_PAIR_REQUIRED',
      `${field} requires both value and unit when supplied.`,
      { row: rowNumber, field, value: rawValue, unit: rawUnit },
    );
  }
  const number = Number(rawValue.trim());
  if (!Number.isFinite(number)) {
    throw vibrationTabularInputError(
      'VIBRATION_OPERATING_CASE_INVALID_NUMBER',
      `${field} must contain a finite numeric value.`,
      { row: rowNumber, field, value: rawValue },
    );
  }
  const result = { value: number, unit: rawUnit };
  if (hasReference) result.reference = rawReference;
  return result;
}

function parseRow(row, index) {
  const rowNumber = index + 2;
  if (row.length !== VIBRATION_OPERATING_CASE_CSV_HEADER.length) {
    throw vibrationTabularInputError(
      'VIBRATION_OPERATING_CASE_COLUMN_COUNT_MISMATCH',
      'Operating-case row does not match the v1 column count.',
      { row: rowNumber, expected: VIBRATION_OPERATING_CASE_CSV_HEADER.length, actual: row.length },
    );
  }
  const result = {
    line: requiredText(row[0], 'Line', rowNumber),
    caseId: requiredText(row[1], 'Operating Case', rowNumber),
    source: requiredText(row[17], 'Source', rowNumber),
  };
  const label = optionalText(row[2]);
  const phase = optionalText(row[3]);
  const sourceRevision = optionalText(row[18]);
  const recordId = optionalText(row[19]);
  if (label !== undefined) result.label = label;
  if (phase !== undefined) result.phase = phase;
  if (sourceRevision !== undefined) result.sourceRevision = sourceRevision;
  if (recordId !== undefined) result.recordId = recordId;

  const massFlow = quantity(row, rowNumber, 4, 5, 'Mass Flow');
  const density = quantity(row, rowNumber, 6, 7, 'Density');
  const pressure = quantity(row, rowNumber, 8, 9, 'Pressure', 10);
  const temperature = quantity(row, rowNumber, 11, 12, 'Temperature');
  const dynamicViscosity = quantity(row, rowNumber, 13, 14, 'Dynamic Viscosity');
  const velocity = quantity(row, rowNumber, 15, 16, 'Velocity');
  if (massFlow) result.massFlow = massFlow;
  if (density) result.density = density;
  if (pressure) result.pressure = pressure;
  if (temperature) result.temperature = temperature;
  if (dynamicViscosity) result.dynamicViscosity = dynamicViscosity;
  if (velocity) result.velocity = velocity;
  return Object.freeze(result);
}

export function parseVibrationOperatingCaseCsv(csvText) {
  const rows = parseStrictVibrationCsvRows(csvText);
  assertExactVibrationCsvHeader(rows, VIBRATION_OPERATING_CASE_CSV_HEADER, VIBRATION_OPERATING_CASE_CSV_SCHEMA);
  const body = nonBlankVibrationCsvRows(rows.slice(1));
  return Object.freeze(body.map(parseRow));
}
