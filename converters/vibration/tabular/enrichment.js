import {
  assertExactVibrationCsvHeader,
  nonBlankVibrationCsvRows,
  parseStrictVibrationCsvRows,
  vibrationTabularInputError,
} from './csv.js';

export const VIBRATION_ENRICHMENT_CSV_SCHEMA = 'VibrationEnrichmentCsv.v1';

export const VIBRATION_ENRICHMENT_CSV_HEADER = Object.freeze([
  'Canonical ID',
  'Line',
  'Operating Case',
  'Property',
  'Value',
  'Value Type',
  'Unit',
  'Source',
  'Source Revision',
  'Record ID',
  'Status',
  'Reviewer',
]);

const VALUE_TYPES = Object.freeze(['NUMBER', 'STRING', 'BOOLEAN']);

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
      'VIBRATION_ENRICHMENT_REQUIRED_VALUE',
      `${field} is required.`,
      { row: rowNumber, field },
    );
  }
  return result;
}

function typedValue(rawValue, valueType, rowNumber) {
  if (!VALUE_TYPES.includes(valueType)) {
    throw vibrationTabularInputError(
      'VIBRATION_ENRICHMENT_VALUE_TYPE_UNSUPPORTED',
      `Value Type must be one of ${VALUE_TYPES.join(', ')}.`,
      { row: rowNumber, valueType },
    );
  }
  if (valueType === 'STRING') return rawValue;
  if (!rawValue.trim()) {
    throw vibrationTabularInputError(
      'VIBRATION_ENRICHMENT_REQUIRED_VALUE',
      `Value is required for ${valueType}.`,
      { row: rowNumber, valueType },
    );
  }
  if (valueType === 'NUMBER') {
    const number = Number(rawValue.trim());
    if (!Number.isFinite(number)) {
      throw vibrationTabularInputError(
        'VIBRATION_ENRICHMENT_INVALID_NUMBER',
        'NUMBER enrichment value must be finite numeric text.',
        { row: rowNumber, value: rawValue },
      );
    }
    return number;
  }
  const normalized = rawValue.trim().toLowerCase();
  if (normalized !== 'true' && normalized !== 'false') {
    throw vibrationTabularInputError(
      'VIBRATION_ENRICHMENT_INVALID_BOOLEAN',
      'BOOLEAN enrichment value must be true or false.',
      { row: rowNumber, value: rawValue },
    );
  }
  return normalized === 'true';
}

function parseRow(row, index) {
  const rowNumber = index + 2;
  if (row.length !== VIBRATION_ENRICHMENT_CSV_HEADER.length) {
    throw vibrationTabularInputError(
      'VIBRATION_ENRICHMENT_COLUMN_COUNT_MISMATCH',
      'Enrichment row does not match the v1 column count.',
      { row: rowNumber, expected: VIBRATION_ENRICHMENT_CSV_HEADER.length, actual: row.length },
    );
  }
  const canonicalId = requiredText(row[0], 'Canonical ID', rowNumber);
  const property = requiredText(row[3], 'Property', rowNumber);
  const valueType = requiredText(row[5], 'Value Type', rowNumber);
  const source = requiredText(row[7], 'Source', rowNumber);
  const result = {
    canonicalId,
    property,
    value: typedValue(text(row[4]), valueType, rowNumber),
    source,
  };
  const fieldMap = [
    ['line', 1],
    ['caseId', 2],
    ['unit', 6],
    ['sourceRevision', 8],
    ['recordId', 9],
    ['status', 10],
    ['reviewer', 11],
  ];
  for (const [field, column] of fieldMap) {
    const value = optionalText(row[column]);
    if (value !== undefined) result[field] = value;
  }
  return Object.freeze(result);
}

export function parseVibrationEnrichmentCsv(csvText) {
  const rows = parseStrictVibrationCsvRows(csvText);
  assertExactVibrationCsvHeader(rows, VIBRATION_ENRICHMENT_CSV_HEADER, VIBRATION_ENRICHMENT_CSV_SCHEMA);
  const body = nonBlankVibrationCsvRows(rows.slice(1));
  return Object.freeze(body.map(parseRow));
}
