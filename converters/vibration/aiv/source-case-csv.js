import {
  assertExactVibrationCsvHeader,
  nonBlankVibrationCsvRows,
  parseStrictVibrationCsvRows,
  serializeVibrationCsvRows,
  vibrationTabularInputError,
} from '../tabular/csv.js';

export const AIV_SOURCE_CASE_CSV_SCHEMA = 'AivSourceCaseCsv.v1';

export const AIV_SOURCE_CASE_CSV_HEADER = Object.freeze([
  'Source Canonical ID',
  'Assessment Canonical ID',
  'Operating Case',
  'Source Device Type',
  'Source State',
  'Phase',
  'Mass Flow',
  'Mass Flow Unit',
  'Upstream Pressure',
  'Upstream Pressure Unit',
  'Upstream Pressure Basis',
  'Downstream Pressure',
  'Downstream Pressure Unit',
  'Downstream Pressure Basis',
  'Reference Pressure',
  'Reference Pressure Unit',
  'Reference Pressure Source',
  'Reference Pressure Source Revision',
  'Upstream Temperature',
  'Upstream Temperature Unit',
  'Molecular Weight',
  'Molecular Weight Unit',
  'Low Noise Trim State',
  'Low Noise Trim Reduction',
  'Low Noise Trim Unit',
  'Low Noise Trim Source',
  'Low Noise Trim Source Revision',
  'Sonic State',
  'Source',
  'Source Revision',
  'Record ID',
  'Status',
  'Reviewer',
]);

export const AIV_SOURCE_DEVICE_TYPES = Object.freeze([
  'CONTROL_VALVE',
  'RELIEF_VALVE',
  'RESTRICTION_ORIFICE',
  'PRESSURE_REDUCING_BRANCH_CONNECTION',
]);
export const AIV_SOURCE_STATES = Object.freeze(['OPEN', 'RELIEVING', 'ACTIVE', 'CLOSED']);
export const AIV_SOURCE_PHASES = Object.freeze(['GAS', 'WET_GAS', 'TWO_PHASE', 'LIQUID']);
export const AIV_PRESSURE_BASES = Object.freeze(['ABSOLUTE', 'GAUGE']);
export const AIV_TRIM_STATES = Object.freeze(['NONE', 'MANUFACTURER_REDUCTION', 'UNRESOLVED']);
export const AIV_SONIC_STATES = Object.freeze(['NON_SONIC', 'SONIC', 'UNRESOLVED']);

function text(value) {
  return String(value ?? '');
}

function optionalText(value) {
  const result = text(value).trim();
  return result === '' ? undefined : result;
}

function requiredText(value, field, rowNumber) {
  const result = text(value).trim();
  if (!result) {
    throw vibrationTabularInputError(
      'AIV_SOURCE_CASE_REQUIRED_VALUE',
      `${field} is required.`,
      { row: rowNumber, field },
    );
  }
  return result;
}

function enumValue(value, field, allowed, rowNumber) {
  const result = requiredText(value, field, rowNumber).toUpperCase();
  if (!allowed.includes(result)) {
    throw vibrationTabularInputError(
      'AIV_SOURCE_CASE_ENUM_UNSUPPORTED',
      `${field} must be one of ${allowed.join(', ')}.`,
      { row: rowNumber, field, value: result, allowed },
    );
  }
  return result;
}

function quantity(row, rowNumber, valueIndex, unitIndex, field, { optional = false } = {}) {
  const rawValue = text(row[valueIndex]).trim();
  const rawUnit = text(row[unitIndex]).trim();
  if (optional && rawValue === '' && rawUnit === '') return undefined;
  if (rawValue === '' || rawUnit === '') {
    throw vibrationTabularInputError(
      'AIV_SOURCE_CASE_QUANTITY_PAIR_REQUIRED',
      `${field} requires both value and unit.`,
      { row: rowNumber, field, value: rawValue, unit: rawUnit },
    );
  }
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw vibrationTabularInputError(
      'AIV_SOURCE_CASE_INVALID_NUMBER',
      `${field} must be a finite number.`,
      { row: rowNumber, field, value: rawValue },
    );
  }
  return Object.freeze({ value, unit: rawUnit });
}

function pressure(row, rowNumber, valueIndex, unitIndex, basisIndex, field) {
  return Object.freeze({
    ...quantity(row, rowNumber, valueIndex, unitIndex, field),
    basis: enumValue(row[basisIndex], `${field} Basis`, AIV_PRESSURE_BASES, rowNumber),
  });
}

function trimEvidence(row, rowNumber) {
  const state = enumValue(row[22], 'Low Noise Trim State', AIV_TRIM_STATES, rowNumber);
  const reduction = quantity(row, rowNumber, 23, 24, 'Low Noise Trim Reduction', { optional: true });
  const source = optionalText(row[25]);
  const sourceRevision = optionalText(row[26]);
  return Object.freeze({
    state,
    ...(reduction ? { reduction } : {}),
    ...(source ? { source } : {}),
    ...(sourceRevision ? { sourceRevision } : {}),
  });
}

function parseRow(row, index) {
  const rowNumber = index + 2;
  if (row.length !== AIV_SOURCE_CASE_CSV_HEADER.length) {
    throw vibrationTabularInputError(
      'AIV_SOURCE_CASE_COLUMN_COUNT_MISMATCH',
      'AIV source-case row does not match the v1 column count.',
      { row: rowNumber, expected: AIV_SOURCE_CASE_CSV_HEADER.length, actual: row.length },
    );
  }
  const result = {
    sourceCanonicalId: requiredText(row[0], 'Source Canonical ID', rowNumber),
    assessmentCanonicalId: requiredText(row[1], 'Assessment Canonical ID', rowNumber),
    caseId: requiredText(row[2], 'Operating Case', rowNumber),
    sourceDeviceType: enumValue(row[3], 'Source Device Type', AIV_SOURCE_DEVICE_TYPES, rowNumber),
    sourceState: enumValue(row[4], 'Source State', AIV_SOURCE_STATES, rowNumber),
    phase: enumValue(row[5], 'Phase', AIV_SOURCE_PHASES, rowNumber),
    massFlow: quantity(row, rowNumber, 6, 7, 'Mass Flow'),
    upstreamPressure: pressure(row, rowNumber, 8, 9, 10, 'Upstream Pressure'),
    downstreamPressure: pressure(row, rowNumber, 11, 12, 13, 'Downstream Pressure'),
    upstreamTemperature: quantity(row, rowNumber, 18, 19, 'Upstream Temperature'),
    molecularWeight: quantity(row, rowNumber, 20, 21, 'Molecular Weight'),
    lowNoiseTrim: trimEvidence(row, rowNumber),
    sonicState: enumValue(row[27], 'Sonic State', AIV_SONIC_STATES, rowNumber),
    source: requiredText(row[28], 'Source', rowNumber),
  };
  const referencePressure = quantity(row, rowNumber, 14, 15, 'Reference Pressure', { optional: true });
  if (referencePressure) result.referencePressure = referencePressure;
  const referencePressureSource = optionalText(row[16]);
  const referencePressureSourceRevision = optionalText(row[17]);
  if (referencePressureSource !== undefined) result.referencePressureSource = referencePressureSource;
  if (referencePressureSourceRevision !== undefined) result.referencePressureSourceRevision = referencePressureSourceRevision;
  for (const [field, column] of [
    ['sourceRevision', 29], ['recordId', 30], ['status', 31], ['reviewer', 32],
  ]) {
    const value = optionalText(row[column]);
    if (value !== undefined) result[field] = value;
  }
  return Object.freeze(result);
}

export function parseAivSourceCaseCsv(csvText) {
  const rows = parseStrictVibrationCsvRows(csvText);
  assertExactVibrationCsvHeader(rows, AIV_SOURCE_CASE_CSV_HEADER, AIV_SOURCE_CASE_CSV_SCHEMA);
  const records = nonBlankVibrationCsvRows(rows.slice(1)).map(parseRow);
  const seen = new Set();
  for (const row of records) {
    const key = `${row.sourceCanonicalId}\u0000${row.assessmentCanonicalId}\u0000${row.caseId}`;
    if (seen.has(key)) {
      throw vibrationTabularInputError(
        'AIV_SOURCE_CASE_DUPLICATE',
        'Duplicate AIV source/assessment/operating-case record.',
        {
          sourceCanonicalId: row.sourceCanonicalId,
          assessmentCanonicalId: row.assessmentCanonicalId,
          caseId: row.caseId,
        },
      );
    }
    seen.add(key);
  }
  return Object.freeze(records.sort((a, b) => a.sourceCanonicalId.localeCompare(b.sourceCanonicalId)
    || a.assessmentCanonicalId.localeCompare(b.assessmentCanonicalId)
    || a.caseId.localeCompare(b.caseId)));
}

export function createAivSourceCaseCsvTemplate() {
  return serializeVibrationCsvRows([AIV_SOURCE_CASE_CSV_HEADER]);
}
