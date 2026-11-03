import {
  assertExactVibrationCsvHeader,
  nonBlankVibrationCsvRows,
  parseStrictVibrationCsvRows,
  serializeVibrationCsvRows,
  vibrationTabularInputError,
} from '../tabular/csv.js';
import {
  addOptionalAivTraceFields,
  aivEnumValue,
  aivQuantity,
  assertAivColumnCount,
  optionalAivText,
  requiredAivText,
} from './aiv-tabular-common.js';

export const AIV_SOURCE_CSV_SCHEMA = 'AivSourceCsv.v2';

export const AIV_SOURCE_CSV_HEADER = Object.freeze([
  'Source Canonical ID',
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

export const AIV_SOURCE_DEVICE_TYPES_V2 = Object.freeze([
  'CONTROL_VALVE',
  'RELIEF_VALVE',
  'RESTRICTION_ORIFICE',
  'PRESSURE_REDUCING_BRANCH_CONNECTION',
]);
export const AIV_SOURCE_STATES_V2 = Object.freeze(['OPEN', 'RELIEVING', 'ACTIVE', 'CLOSED']);
export const AIV_SOURCE_PHASES_V2 = Object.freeze(['GAS', 'WET_GAS', 'TWO_PHASE', 'LIQUID']);
export const AIV_PRESSURE_BASES_V2 = Object.freeze(['ABSOLUTE', 'GAUGE']);
export const AIV_TRIM_STATES_V2 = Object.freeze(['NONE', 'MANUFACTURER_REDUCTION', 'UNRESOLVED']);
export const AIV_SONIC_STATES_V2 = Object.freeze(['NON_SONIC', 'SONIC', 'UNRESOLVED']);

function pressure(row, rowNumber, valueIndex, unitIndex, basisIndex, field) {
  return Object.freeze({
    ...aivQuantity(row, rowNumber, valueIndex, unitIndex, field),
    basis: aivEnumValue(row[basisIndex], `${field} Basis`, AIV_PRESSURE_BASES_V2, rowNumber),
  });
}

function trimEvidence(row, rowNumber) {
  const state = aivEnumValue(row[21], 'Low Noise Trim State', AIV_TRIM_STATES_V2, rowNumber);
  const reduction = aivQuantity(row, rowNumber, 22, 23, 'Low Noise Trim Reduction', { optional: true });
  const source = optionalAivText(row[24]);
  const sourceRevision = optionalAivText(row[25]);
  return Object.freeze({
    state,
    ...(reduction ? { reduction } : {}),
    ...(source ? { source } : {}),
    ...(sourceRevision ? { sourceRevision } : {}),
  });
}

function parseRow(row, index) {
  const rowNumber = index + 2;
  assertAivColumnCount(row, AIV_SOURCE_CSV_HEADER, AIV_SOURCE_CSV_SCHEMA, rowNumber);
  const result = {
    sourceCanonicalId: requiredAivText(row[0], 'Source Canonical ID', rowNumber),
    caseId: requiredAivText(row[1], 'Operating Case', rowNumber),
    sourceDeviceType: aivEnumValue(row[2], 'Source Device Type', AIV_SOURCE_DEVICE_TYPES_V2, rowNumber),
    sourceState: aivEnumValue(row[3], 'Source State', AIV_SOURCE_STATES_V2, rowNumber),
    phase: aivEnumValue(row[4], 'Phase', AIV_SOURCE_PHASES_V2, rowNumber),
    massFlow: aivQuantity(row, rowNumber, 5, 6, 'Mass Flow'),
    upstreamPressure: pressure(row, rowNumber, 7, 8, 9, 'Upstream Pressure'),
    downstreamPressure: pressure(row, rowNumber, 10, 11, 12, 'Downstream Pressure'),
    upstreamTemperature: aivQuantity(row, rowNumber, 17, 18, 'Upstream Temperature'),
    molecularWeight: aivQuantity(row, rowNumber, 19, 20, 'Molecular Weight'),
    lowNoiseTrim: trimEvidence(row, rowNumber),
    sonicState: aivEnumValue(row[26], 'Sonic State', AIV_SONIC_STATES_V2, rowNumber),
    source: requiredAivText(row[27], 'Source', rowNumber),
  };
  const referencePressure = aivQuantity(row, rowNumber, 13, 14, 'Reference Pressure', { optional: true });
  if (referencePressure) result.referencePressure = referencePressure;
  const referencePressureSource = optionalAivText(row[15]);
  const referencePressureSourceRevision = optionalAivText(row[16]);
  if (referencePressureSource) result.referencePressureSource = referencePressureSource;
  if (referencePressureSourceRevision) result.referencePressureSourceRevision = referencePressureSourceRevision;
  addOptionalAivTraceFields(result, row, [
    ['sourceRevision', 28], ['recordId', 29], ['status', 30], ['reviewer', 31],
  ]);
  return Object.freeze(result);
}

export function parseAivSourceCsv(csvText) {
  const rows = parseStrictVibrationCsvRows(csvText);
  assertExactVibrationCsvHeader(rows, AIV_SOURCE_CSV_HEADER, AIV_SOURCE_CSV_SCHEMA);
  const records = nonBlankVibrationCsvRows(rows.slice(1)).map(parseRow);
  const seen = new Set();
  for (const row of records) {
    const key = `${row.sourceCanonicalId}\u0000${row.caseId}`;
    if (seen.has(key)) {
      throw vibrationTabularInputError(
        'AIV_SOURCE_DUPLICATE',
        'Duplicate AIV source/operating-case record.',
        { sourceCanonicalId: row.sourceCanonicalId, caseId: row.caseId },
      );
    }
    seen.add(key);
  }
  return Object.freeze(records.sort((a, b) => a.sourceCanonicalId.localeCompare(b.sourceCanonicalId)
    || a.caseId.localeCompare(b.caseId)));
}

export function createAivSourceCsvTemplate() {
  return serializeVibrationCsvRows([AIV_SOURCE_CSV_HEADER]);
}
