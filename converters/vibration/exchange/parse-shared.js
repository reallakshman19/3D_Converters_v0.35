import {
  VIBRATION_TABLE_EXCHANGE_SHEETS,
  vibrationTableExchangeError,
} from './schema.js';

export const EXPECTED_EXCHANGE_SHEET_NAMES = Object.freeze(Object.keys(VIBRATION_TABLE_EXCHANGE_SHEETS));
export const COMPLETE_ONLY_EXCHANGE_SHEETS = Object.freeze(
  EXPECTED_EXCHANGE_SHEET_NAMES.filter((name) => name !== 'Elements'),
);

export function exchangeText(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

export function requiredExchangeText(value, field, details = {}) {
  const result = exchangeText(value);
  if (!result || !result.trim()) {
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_REQUIRED_VALUE',
      `${field} is required.`,
      details,
    );
  }
  return result;
}

function optionalNumber(value, field, details = {}) {
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_INVALID_NUMBER',
      `${field} must be numeric when present.`,
      { ...details, value },
    );
  }
  return number;
}

export function trimTrailingExchangeRows(rows) {
  const result = rows.map((row) => Array.isArray(row) ? row : []);
  while (result.length && result.at(-1).every((cell) => cell === '' || cell === null || cell === undefined)) {
    result.pop();
  }
  return result;
}

export function assertExchangeHeader(sheetName, actualHeader) {
  const expected = VIBRATION_TABLE_EXCHANGE_SHEETS[sheetName];
  const actual = (actualHeader ?? []).map((value, index) => {
    const string = String(value ?? '');
    return index === 0 ? string.replace(/^\uFEFF/u, '') : string;
  });
  const same = actual.length === expected.length
    && expected.every((column, index) => actual[index] === column);
  if (!same) {
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_HEADER_MISMATCH',
      `Sheet ${sheetName} does not match the required column contract.`,
      { sheet: sheetName, expected: [...expected], actual },
    );
  }
}

export function exchangeElementFromRow(row, rowIndex) {
  const details = { sheet: 'Elements', row: rowIndex + 2 };
  return {
    tag: exchangeText(row[0]),
    type: exchangeText(row[1]),
    line: exchangeText(row[2]),
    connectFrom: exchangeText(row[3]),
    connectTo: exchangeText(row[4]),
    dnInMm: optionalNumber(row[5], 'DN In (mm)', details),
    dnOutMm: optionalNumber(row[6], 'DN Out (mm)', details),
    lengthMm: optionalNumber(row[7], 'Length (mm)', details),
    schedule: exchangeText(row[8]),
    material: exchangeText(row[9]),
    pipingClass: exchangeText(row[10]),
    pressureClass: exchangeText(row[11]),
    catalogueAuthority: exchangeText(row[12]),
    sourceStatus: exchangeText(row[13]),
    canonicalId: requiredExchangeText(row[14], 'Canonical ID', details),
  };
}

export function assertUniqueExchangeElementIds(elements) {
  const ids = new Set();
  for (const element of elements) {
    if (ids.has(element.canonicalId)) {
      throw vibrationTableExchangeError(
        'VIBRATION_TABLE_EXCHANGE_DUPLICATE_CANONICAL_ID',
        `Duplicate Elements Canonical ID ${element.canonicalId}.`,
        { canonicalId: element.canonicalId },
      );
    }
    ids.add(element.canonicalId);
  }
  return ids;
}
