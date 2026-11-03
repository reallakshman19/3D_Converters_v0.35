import * as XLSX from 'xlsx';
import {
  ADVANCED_ANALYSIS_EXPORT_AUTHORITY,
  ADVANCED_ANALYSIS_TOPOLOGY_EXPORT_SCHEMA,
  VIBRATION_TABLE_EXCHANGE_FORMAT,
  VIBRATION_TABLE_EXCHANGE_INTEGRITY,
  VIBRATION_TABLE_EXCHANGE_REQUIRED_METADATA,
  VIBRATION_TABLE_EXCHANGE_SCHEMA,
  assertVibrationTableExchangeShape,
  deepFreezeVibrationExchange,
  vibrationTableExchangeError,
} from './schema.js';
import {
  EXPECTED_EXCHANGE_SHEET_NAMES,
  assertExchangeHeader,
  assertUniqueExchangeElementIds,
  exchangeElementFromRow,
  exchangeText,
  requiredExchangeText,
  trimTrailingExchangeRows,
} from './parse-shared.js';

function rowsFromWorksheet(workbook, name) {
  const worksheet = workbook?.Sheets?.[name];
  if (!worksheet) {
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_MISSING_SHEET',
      `Required sheet ${name} is missing.`,
      { sheet: name },
    );
  }
  return trimTrailingExchangeRows(XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false,
  }));
}

function sheetBody(workbook, name) {
  const rows = rowsFromWorksheet(workbook, name);
  if (!rows.length) {
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_HEADER_MISMATCH',
      `Sheet ${name} is empty and has no header.`,
      { sheet: name },
    );
  }
  assertExchangeHeader(name, rows[0]);
  return rows.slice(1).filter((row) => row.some((cell) => cell !== '' && cell !== null && cell !== undefined));
}

function connectionFromRow(row, rowIndex) {
  const details = { sheet: 'Connections', row: rowIndex + 2 };
  return {
    canonicalId: requiredExchangeText(row[0], 'Canonical ID', details),
    elementType: exchangeText(row[1]),
    portRole: exchangeText(row[2]),
    portKey: exchangeText(row[3]),
    nodeId: requiredExchangeText(row[4], 'Node ID', details),
  };
}

function sourceMappingFromRow(row, rowIndex) {
  const details = { sheet: 'Source Mapping', row: rowIndex + 2 };
  return {
    canonicalId: requiredExchangeText(row[0], 'Canonical ID', details),
    componentKey: exchangeText(row[1]),
    entityId: exchangeText(row[2]),
    sourceEntityId: exchangeText(row[3]),
    sourcePath: exchangeText(row[4]),
    sourceNodeKey: exchangeText(row[5]),
    jsonPointer: exchangeText(row[6]),
    sourceStatus: exchangeText(row[7]),
    sourceHash: exchangeText(row[8]),
  };
}

function sourceReference(value, details) {
  const raw = exchangeText(value);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_INVALID_SOURCE_REFERENCE',
      'Catalogue Evidence Source Reference must contain valid JSON when present.',
      { ...details, value: raw, cause: cause?.message ?? String(cause) },
    );
  }
}

function catalogueEvidenceFromRow(row, rowIndex) {
  const details = { sheet: 'Catalogue Evidence', row: rowIndex + 2 };
  return {
    canonicalId: requiredExchangeText(row[0], 'Canonical ID', details),
    authority: exchangeText(row[1]),
    catalogueId: exchangeText(row[2]),
    catalogueVersion: exchangeText(row[3]),
    catalogueHash: exchangeText(row[4]),
    sourceHash: exchangeText(row[5]),
    recordId: exchangeText(row[6]),
    recordHash: exchangeText(row[7]),
    sourceReference: sourceReference(row[8], details),
  };
}

function metadataFromRows(rows) {
  const metadata = {};
  rows.forEach((row, index) => {
    const details = { sheet: 'Export Metadata', row: index + 2 };
    const key = requiredExchangeText(row[0], 'Metadata Key', details);
    if (Object.hasOwn(metadata, key)) {
      throw vibrationTableExchangeError(
        'VIBRATION_TABLE_EXCHANGE_DUPLICATE_METADATA_KEY',
        `Export Metadata contains duplicate key ${key}.`,
        { ...details, key },
      );
    }
    metadata[key] = row[1] ?? '';
  });
  for (const key of VIBRATION_TABLE_EXCHANGE_REQUIRED_METADATA) {
    if (!Object.hasOwn(metadata, key)) {
      throw vibrationTableExchangeError(
        'VIBRATION_TABLE_EXCHANGE_MISSING_METADATA',
        `Export Metadata is missing required key ${key}.`,
        { key },
      );
    }
  }
  return metadata;
}

function assertMetadata(metadata, elementCount) {
  if (String(metadata.Schema) !== ADVANCED_ANALYSIS_TOPOLOGY_EXPORT_SCHEMA) {
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_SOURCE_SCHEMA_MISMATCH',
      `Expected source schema ${ADVANCED_ANALYSIS_TOPOLOGY_EXPORT_SCHEMA}.`,
      { actual: metadata.Schema },
    );
  }
  if (String(metadata.Authority) !== ADVANCED_ANALYSIS_EXPORT_AUTHORITY) {
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_AUTHORITY_MISMATCH',
      `Expected export authority ${ADVANCED_ANALYSIS_EXPORT_AUTHORITY}.`,
      { actual: metadata.Authority },
    );
  }
  requiredExchangeText(metadata['Canonical Hash'], 'Canonical Hash', { sheet: 'Export Metadata' });
  requiredExchangeText(metadata['Projection Hash'], 'Projection Hash', { sheet: 'Export Metadata' });
  if (String(metadata.Ordering) !== 'DETERMINISTIC_CANONICAL_ROW_ID') {
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_ORDERING_MISMATCH',
      'Export ordering must be DETERMINISTIC_CANONICAL_ROW_ID.',
      { actual: metadata.Ordering },
    );
  }
  const rowCount = Number(metadata['Row Count']);
  if (!Number.isInteger(rowCount) || rowCount < 0 || rowCount !== elementCount) {
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_ROW_COUNT_MISMATCH',
      'Export Metadata Row Count must equal the parsed Elements row count.',
      { declared: metadata['Row Count'], parsed: elementCount },
    );
  }
}

function assertReferencesExist(rows, ids, sheetName) {
  for (const row of rows) {
    if (!ids.has(row.canonicalId)) {
      throw vibrationTableExchangeError(
        'VIBRATION_TABLE_EXCHANGE_ORPHAN_REFERENCE',
        `${sheetName} references unknown Canonical ID ${row.canonicalId}.`,
        { sheet: sheetName, canonicalId: row.canonicalId },
      );
    }
  }
}

function assertExactlyOnePerElement(rows, ids, sheetName) {
  const counts = new Map([...ids].map((id) => [id, 0]));
  for (const row of rows) counts.set(row.canonicalId, (counts.get(row.canonicalId) ?? 0) + 1);
  for (const [canonicalId, count] of counts) {
    if (count !== 1) {
      throw vibrationTableExchangeError(
        'VIBRATION_TABLE_EXCHANGE_CUSTODY_COVERAGE_MISMATCH',
        `${sheetName} must contain exactly one row for each Elements Canonical ID.`,
        { sheet: sheetName, canonicalId, count },
      );
    }
  }
}

function declaredExportHash(workbook) {
  const comments = exchangeText(workbook?.Props?.Comments);
  if (!comments) return null;
  return /^Export authority\s+(.+)$/u.exec(comments.trim())?.[1] ?? null;
}

function authorityFromMetadata(metadata, workbook) {
  return {
    canonicalHash: String(metadata['Canonical Hash']),
    projectionHash: String(metadata['Projection Hash']),
    sourceHash: exchangeText(metadata['Source Hash']),
    datasetId: exchangeText(metadata['Dataset ID']),
    datasetVersion: exchangeText(metadata['Dataset Version']),
    journalHash: exchangeText(metadata['Journal Hash']),
    activeLedgerHash: exchangeText(metadata['Active Ledger Hash']),
    sessionVersion: metadata['Session Version'] === '' || metadata['Session Version'] === undefined
      ? null
      : metadata['Session Version'],
    sourceAuthority: String(metadata.Authority),
    sourceExportHash: declaredExportHash(workbook),
  };
}

function xlsxWarnings(workbook, extraSheetNames) {
  const warnings = [{
    code: 'UPSTREAM_EXPORT_HASH_DECLARED_NOT_REVERIFIED',
    message: 'The workbook declares the upstream export hash, but this importer does not reconstruct Advanced_Analysis semanticHash material in v1.',
  }];
  if (!declaredExportHash(workbook)) warnings.push({
    code: 'UPSTREAM_EXPORT_HASH_NOT_PRESENT',
    message: 'Workbook properties do not contain the expected declared upstream export hash.',
  });
  if (extraSheetNames.length) warnings.push({
    code: 'UNRECOGNIZED_EXTRA_SHEETS',
    message: 'Workbook contains sheets outside the v1 exchange contract; they were ignored.',
    details: { sheetNames: extraSheetNames },
  });
  return warnings;
}

export function parseVibrationTableExchangeWorkbook(workbook, options = {}) {
  if (!workbook || typeof workbook !== 'object' || !Array.isArray(workbook.SheetNames)) {
    throw vibrationTableExchangeError('VIBRATION_TABLE_EXCHANGE_INVALID_WORKBOOK', 'A SheetJS workbook object is required.');
  }
  const missing = EXPECTED_EXCHANGE_SHEET_NAMES.filter((name) => !workbook.SheetNames.includes(name));
  if (missing.length) {
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_MISSING_SHEET',
      `Workbook is missing required sheets: ${missing.join(', ')}.`,
      { missing },
    );
  }
  const extra = workbook.SheetNames.filter((name) => !EXPECTED_EXCHANGE_SHEET_NAMES.includes(name));
  const elements = sheetBody(workbook, 'Elements').map(exchangeElementFromRow);
  const connections = sheetBody(workbook, 'Connections').map(connectionFromRow);
  const sourceMapping = sheetBody(workbook, 'Source Mapping').map(sourceMappingFromRow);
  const catalogueEvidence = sheetBody(workbook, 'Catalogue Evidence').map(catalogueEvidenceFromRow);
  const metadata = metadataFromRows(sheetBody(workbook, 'Export Metadata'));

  assertMetadata(metadata, elements.length);
  const ids = assertUniqueExchangeElementIds(elements);
  assertReferencesExist(connections, ids, 'Connections');
  assertReferencesExist(sourceMapping, ids, 'Source Mapping');
  assertReferencesExist(catalogueEvidence, ids, 'Catalogue Evidence');
  assertExactlyOnePerElement(sourceMapping, ids, 'Source Mapping');
  assertExactlyOnePerElement(catalogueEvidence, ids, 'Catalogue Evidence');

  return assertVibrationTableExchangeShape(deepFreezeVibrationExchange({
    schema: VIBRATION_TABLE_EXCHANGE_SCHEMA,
    sourceSchema: ADVANCED_ANALYSIS_TOPOLOGY_EXPORT_SCHEMA,
    sourceFormat: VIBRATION_TABLE_EXCHANGE_FORMAT.XLSX,
    sourceSystem: 'Advanced_Analysis.3D_EDIT',
    completeExchange: true,
    integrityStatus: VIBRATION_TABLE_EXCHANGE_INTEGRITY.DECLARED_NOT_REVERIFIED,
    authority: authorityFromMetadata(metadata, workbook),
    elements,
    connections,
    sourceMapping,
    catalogueEvidence,
    metadata,
    warnings: xlsxWarnings(workbook, extra),
    sourceFileName: exchangeText(options.sourceFileName),
  }), options);
}

export function parseVibrationTableExchangeXlsx(bytes, options = {}) {
  if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) {
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_INVALID_XLSX_BYTES',
      'XLSX input must be an ArrayBuffer or typed-array view.',
    );
  }
  try {
    return parseVibrationTableExchangeWorkbook(
      XLSX.read(bytes, { type: 'array', raw: true, cellDates: false }),
      options,
    );
  } catch (cause) {
    if (cause?.name === 'VibrationTableExchangeError') throw cause;
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_XLSX_PARSE_FAILED',
      'Unable to parse the XLSX input.',
      { cause: cause?.message ?? String(cause) },
    );
  }
}
