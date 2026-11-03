import {
  VIBRATION_TABLE_EXCHANGE_FORMAT,
  VIBRATION_TABLE_EXCHANGE_INTEGRITY,
  VIBRATION_TABLE_EXCHANGE_SCHEMA,
  assertVibrationTableExchangeShape,
  deepFreezeVibrationExchange,
  vibrationTableExchangeError,
} from './schema.js';
import {
  COMPLETE_ONLY_EXCHANGE_SHEETS,
  assertExchangeHeader,
  assertUniqueExchangeElementIds,
  exchangeElementFromRow,
  exchangeText,
  trimTrailingExchangeRows,
} from './parse-shared.js';

function parseCsvRows(csvText) {
  const input = String(csvText ?? '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (quoted) {
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_CSV_PARSE_FAILED',
      'CSV input ends inside a quoted field.',
    );
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return trimTrailingExchangeRows(rows);
}

export function parseVibrationTableExchangeCsv(csvText, options = {}) {
  const rows = parseCsvRows(csvText);
  if (!rows.length) {
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_HEADER_MISMATCH',
      'CSV input is empty.',
    );
  }
  assertExchangeHeader('Elements', rows[0]);
  const elements = rows.slice(1)
    .filter((row) => row.some((cell) => cell !== ''))
    .map(exchangeElementFromRow);
  assertUniqueExchangeElementIds(elements);

  return assertVibrationTableExchangeShape(deepFreezeVibrationExchange({
    schema: VIBRATION_TABLE_EXCHANGE_SCHEMA,
    sourceSchema: null,
    sourceFormat: VIBRATION_TABLE_EXCHANGE_FORMAT.CSV_ELEMENTS_ONLY,
    sourceSystem: 'UNVERIFIED_ELEMENTS_CSV',
    completeExchange: false,
    integrityStatus: VIBRATION_TABLE_EXCHANGE_INTEGRITY.LIMITED_ELEMENTS_ONLY,
    authority: {
      canonicalHash: null,
      projectionHash: null,
      sourceHash: null,
      datasetId: null,
      datasetVersion: null,
      journalHash: null,
      activeLedgerHash: null,
      sessionVersion: null,
      sourceAuthority: null,
      sourceExportHash: null,
    },
    elements,
    connections: [],
    sourceMapping: [],
    catalogueEvidence: [],
    metadata: {},
    warnings: [
      {
        code: 'UNVERIFIED_ELEMENTS_CSV_SOURCE',
        message: 'Elements CSV header compatibility does not establish certified Advanced_Analysis 3D EDIT source provenance.',
      },
      {
        code: 'LIMITED_ELEMENTS_ONLY',
        message: 'Elements CSV contains only the Elements sheet and is not a complete certified machine exchange.',
      },
      ...COMPLETE_ONLY_EXCHANGE_SHEETS.map((sheet) => ({
        code: 'MISSING_EXCHANGE_SHEET',
        message: `CSV source does not contain ${sheet}.`,
        details: { sheet },
      })),
    ],
    sourceFileName: exchangeText(options.sourceFileName),
  }), options);
}
