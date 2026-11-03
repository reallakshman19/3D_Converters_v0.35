import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import {
  ADVANCED_ANALYSIS_EXPORT_AUTHORITY,
  ADVANCED_ANALYSIS_TOPOLOGY_EXPORT_SCHEMA,
  VIBRATION_TABLE_EXCHANGE_FORMAT,
  VIBRATION_TABLE_EXCHANGE_INTEGRITY,
  VIBRATION_TABLE_EXCHANGE_SCHEMA,
  VIBRATION_TABLE_EXCHANGE_SHEETS,
  parseVibrationTableExchangeCsv,
  parseVibrationTableExchangeWorkbook,
  parseVibrationTableExchangeXlsx,
} from '../converters/vibration/exchange/index.js';

const ELEMENT_ROWS = Object.freeze([
  Object.freeze([
    'P-100', 'PIPE', 'L-100', 'N-1', 'N-2', 150, 150, 1200,
    'SCH40', 'A106-B', 'P1', '150', 'CATALOGUE', 'CERTIFIED', 'CANON-001',
  ]),
  Object.freeze([
    'EL-200', 'ELBOW', 'L-100', 'N-2', 'N-3', 150, 150, '',
    'SCH40', 'A234-WPB', 'P1', '150', 'CATALOGUE', 'CERTIFIED', 'CANON-002',
  ]),
]);

const CONNECTION_ROWS = Object.freeze([
  Object.freeze(['CANON-001', 'PIPE', 'IN', 'P1', 'N-1']),
  Object.freeze(['CANON-001', 'PIPE', 'OUT', 'P2', 'N-2']),
  Object.freeze(['CANON-002', 'ELBOW', 'IN', 'P1', 'N-2']),
  Object.freeze(['CANON-002', 'ELBOW', 'OUT', 'P2', 'N-3']),
]);

const SOURCE_ROWS = Object.freeze([
  Object.freeze(['CANON-001', 'pipe-1', 'entity-1', 'source-1', 'model.json', 'node-1', '/pipes/0', 'CERTIFIED', 'sha256:source']),
  Object.freeze(['CANON-002', 'elbow-1', 'entity-2', 'source-2', 'model.json', 'node-2', '/elbows/0', 'CERTIFIED', 'sha256:source']),
]);

const CATALOGUE_ROWS = Object.freeze([
  Object.freeze(['CANON-001', 'CATALOGUE', 'cat', 'v1', 'sha256:cat', 'sha256:source', 'pipe-150-sch40', 'sha256:r1', '{"standard":"ASME"}']),
  Object.freeze(['CANON-002', 'CATALOGUE', 'cat', 'v1', 'sha256:cat', 'sha256:source', 'elbow-150', 'sha256:r2', '{"standard":"ASME"}']),
]);

function metadataRows(overrides = {}) {
  const values = {
    Schema: ADVANCED_ANALYSIS_TOPOLOGY_EXPORT_SCHEMA,
    'Canonical Hash': 'sha256:canonical',
    'Projection Hash': 'sha256:projection',
    'Source Hash': 'sha256:source',
    'Dataset ID': 'plant-a',
    'Dataset Version': 'rev-4',
    'Journal Hash': 'sha256:journal',
    'Active Ledger Hash': 'sha256:ledger',
    'Session Version': 7,
    'Row Count': ELEMENT_ROWS.length,
    Ordering: 'DETERMINISTIC_CANONICAL_ROW_ID',
    Authority: ADVANCED_ANALYSIS_EXPORT_AUTHORITY,
    ...overrides,
  };
  return Object.entries(values);
}

function workbook(options = {}) {
  const rows = {
    Elements: options.elementRows ?? ELEMENT_ROWS,
    Connections: options.connectionRows ?? CONNECTION_ROWS,
    'Source Mapping': options.sourceRows ?? SOURCE_ROWS,
    'Catalogue Evidence': options.catalogueRows ?? CATALOGUE_ROWS,
    'Export Metadata': options.metadataRows ?? metadataRows(options.metadataOverrides),
  };
  const book = XLSX.utils.book_new();
  book.Props = {
    Title: '3D Edit Certified Engineering Table',
    Comments: 'Export authority sha256:upstream-export',
  };
  const order = options.sheetOrder ?? Object.keys(VIBRATION_TABLE_EXCHANGE_SHEETS);
  for (const name of order) {
    if (options.omitSheet === name) continue;
    const header = VIBRATION_TABLE_EXCHANGE_SHEETS[name];
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([header, ...rows[name]]), name);
  }
  if (options.extraSheet) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Unexpected'], ['value']]), 'Extra');
  }
  return book;
}

function assertExchangeAuthority(exchange) {
  assert.equal(exchange.schema, VIBRATION_TABLE_EXCHANGE_SCHEMA);
  assert.equal(exchange.sourceSchema, ADVANCED_ANALYSIS_TOPOLOGY_EXPORT_SCHEMA);
  assert.equal(exchange.sourceFormat, VIBRATION_TABLE_EXCHANGE_FORMAT.XLSX);
  assert.equal(exchange.integrityStatus, VIBRATION_TABLE_EXCHANGE_INTEGRITY.DECLARED_NOT_REVERIFIED);
  assert.equal(exchange.completeExchange, true);
  assert.equal(exchange.authority.canonicalHash, 'sha256:canonical');
  assert.equal(exchange.authority.projectionHash, 'sha256:projection');
  assert.equal(exchange.authority.datasetId, 'plant-a');
  assert.equal(exchange.authority.sourceAuthority, ADVANCED_ANALYSIS_EXPORT_AUTHORITY);
  assert.equal(exchange.authority.sourceExportHash, 'sha256:upstream-export');
}

test('five-sheet Advanced_Analysis XLSX workbook parses into a frozen VibrationTableExchange.v1', () => {
  const exchange = parseVibrationTableExchangeWorkbook(workbook(), { sourceFileName: 'plant-a-3d-edit.xlsx' });
  assertExchangeAuthority(exchange);
  assert.equal(exchange.sourceFileName, 'plant-a-3d-edit.xlsx');
  assert.equal(exchange.elements.length, 2);
  assert.equal(exchange.elements[0].canonicalId, 'CANON-001');
  assert.equal(exchange.elements[0].dnInMm, 150);
  assert.equal(exchange.elements[1].lengthMm, null);
  assert.equal(exchange.connections.length, 4);
  assert.equal(exchange.sourceMapping.length, 2);
  assert.equal(exchange.catalogueEvidence.length, 2);
  assert.deepEqual(exchange.catalogueEvidence[0].sourceReference, { standard: 'ASME' });
  assert(exchange.warnings.some((warning) => warning.code === 'UPSTREAM_EXPORT_HASH_DECLARED_NOT_REVERIFIED'));
  assert(Object.isFrozen(exchange));
  assert(Object.isFrozen(exchange.elements));
  assert(Object.isFrozen(exchange.elements[0]));
});

test('sheet ordering does not change the canonical parsed result', () => {
  const normal = parseVibrationTableExchangeWorkbook(workbook());
  const reversed = parseVibrationTableExchangeWorkbook(workbook({
    sheetOrder: [...Object.keys(VIBRATION_TABLE_EXCHANGE_SHEETS)].reverse(),
  }));
  assert.deepEqual(reversed, normal);
});

test('XLSX byte parser uses the same workbook contract', () => {
  const bytes = XLSX.write(workbook(), { type: 'array', bookType: 'xlsx', compression: true });
  const exchange = parseVibrationTableExchangeXlsx(bytes);
  assertExchangeAuthority(exchange);
  assert.equal(exchange.elements[1].canonicalId, 'CANON-002');
});

test('missing sheet, wrong schema and wrong authority fail closed', () => {
  assert.throws(
    () => parseVibrationTableExchangeWorkbook(workbook({ omitSheet: 'Source Mapping' })),
    (error) => error.code === 'VIBRATION_TABLE_EXCHANGE_MISSING_SHEET',
  );
  assert.throws(
    () => parseVibrationTableExchangeWorkbook(workbook({ metadataOverrides: { Schema: 'Other.v1' } })),
    (error) => error.code === 'VIBRATION_TABLE_EXCHANGE_SOURCE_SCHEMA_MISMATCH',
  );
  assert.throws(
    () => parseVibrationTableExchangeWorkbook(workbook({ metadataOverrides: { Authority: 'UNVERIFIED' } })),
    (error) => error.code === 'VIBRATION_TABLE_EXCHANGE_AUTHORITY_MISMATCH',
  );
});

test('duplicate element identities and orphan references fail closed', () => {
  const duplicateRows = [ELEMENT_ROWS[0], [...ELEMENT_ROWS[1].slice(0, 14), 'CANON-001']];
  assert.throws(
    () => parseVibrationTableExchangeWorkbook(workbook({ elementRows: duplicateRows })),
    (error) => error.code === 'VIBRATION_TABLE_EXCHANGE_DUPLICATE_CANONICAL_ID',
  );

  const orphanConnections = [...CONNECTION_ROWS, ['CANON-999', 'PIPE', 'OUT', 'P9', 'N-9']];
  assert.throws(
    () => parseVibrationTableExchangeWorkbook(workbook({ connectionRows: orphanConnections })),
    (error) => error.code === 'VIBRATION_TABLE_EXCHANGE_ORPHAN_REFERENCE',
  );
});

test('source mapping and catalogue evidence must cover every element exactly once', () => {
  assert.throws(
    () => parseVibrationTableExchangeWorkbook(workbook({ sourceRows: [SOURCE_ROWS[0]] })),
    (error) => error.code === 'VIBRATION_TABLE_EXCHANGE_CUSTODY_COVERAGE_MISMATCH',
  );
  assert.throws(
    () => parseVibrationTableExchangeWorkbook(workbook({ catalogueRows: [CATALOGUE_ROWS[0], CATALOGUE_ROWS[0]] })),
    (error) => error.code === 'VIBRATION_TABLE_EXCHANGE_CUSTODY_COVERAGE_MISMATCH',
  );
});

test('metadata row count and deterministic ordering are enforced', () => {
  assert.throws(
    () => parseVibrationTableExchangeWorkbook(workbook({ metadataOverrides: { 'Row Count': 99 } })),
    (error) => error.code === 'VIBRATION_TABLE_EXCHANGE_ROW_COUNT_MISMATCH',
  );
  assert.throws(
    () => parseVibrationTableExchangeWorkbook(workbook({ metadataOverrides: { Ordering: 'ARBITRARY' } })),
    (error) => error.code === 'VIBRATION_TABLE_EXCHANGE_ORDERING_MISMATCH',
  );
});

test('extra XLSX sheets are ignored with an explicit warning', () => {
  const exchange = parseVibrationTableExchangeWorkbook(workbook({ extraSheet: true }));
  const warning = exchange.warnings.find((item) => item.code === 'UNRECOGNIZED_EXTRA_SHEETS');
  assert(warning);
  assert.deepEqual(warning.details.sheetNames, ['Extra']);
});

test('current 3D EDIT CSV parses as Elements-only limited exchange', () => {
  const header = VIBRATION_TABLE_EXCHANGE_SHEETS.Elements.join(',');
  const csv = [
    header,
    '"P-100, upstream",PIPE,L-100,N-1,N-2,150,150,1200,SCH40,A106-B,P1,150,CATALOGUE,CERTIFIED,CANON-001',
    'EL-200,ELBOW,L-100,N-2,N-3,150,150,,SCH40,A234-WPB,P1,150,CATALOGUE,CERTIFIED,CANON-002',
    '',
  ].join('\r\n');
  const exchange = parseVibrationTableExchangeCsv(csv, { sourceFileName: 'plant.csv' });
  assert.equal(exchange.schema, VIBRATION_TABLE_EXCHANGE_SCHEMA);
  assert.equal(exchange.sourceSchema, null);
  assert.equal(exchange.sourceFormat, VIBRATION_TABLE_EXCHANGE_FORMAT.CSV_ELEMENTS_ONLY);
  assert.equal(exchange.integrityStatus, VIBRATION_TABLE_EXCHANGE_INTEGRITY.LIMITED_ELEMENTS_ONLY);
  assert.equal(exchange.completeExchange, false);
  assert.equal(exchange.elements[0].tag, 'P-100, upstream');
  assert.equal(exchange.elements[0].dnInMm, 150);
  assert.equal(exchange.connections.length, 0);
  assert.equal(exchange.sourceMapping.length, 0);
  assert.equal(exchange.catalogueEvidence.length, 0);
  assert(exchange.warnings.some((warning) => warning.code === 'LIMITED_ELEMENTS_ONLY'));
  assert.equal(exchange.warnings.filter((warning) => warning.code === 'MISSING_EXCHANGE_SHEET').length, 4);
});

test('Elements-only CSV is rejected when caller requires a complete exchange', () => {
  const csv = [
    VIBRATION_TABLE_EXCHANGE_SHEETS.Elements.join(','),
    ELEMENT_ROWS[0].join(','),
  ].join('\r\n');
  assert.throws(
    () => parseVibrationTableExchangeCsv(csv, { requireCompleteExchange: true }),
    (error) => error.code === 'VIBRATION_TABLE_EXCHANGE_INCOMPLETE',
  );
});

test('CSV column drift fails closed rather than aliasing headers', () => {
  const headers = [...VIBRATION_TABLE_EXCHANGE_SHEETS.Elements];
  headers[14] = 'CanonicalId';
  assert.throws(
    () => parseVibrationTableExchangeCsv(`${headers.join(',')}\r\n${ELEMENT_ROWS[0].join(',')}\r\n`),
    (error) => error.code === 'VIBRATION_TABLE_EXCHANGE_HEADER_MISMATCH',
  );
});
