import { VIBRATION_TABLE_EXCHANGE_SHEETS } from '../converters/vibration/exchange/schema.js';
import { VIBRATION_ENRICHMENT_CSV_HEADER } from '../converters/vibration/tabular/enrichment.js';
import { VIBRATION_FIT_DATA_BLOCKER_CSV_HEADER } from '../converters/vibration/tabular/fit-data-blockers.js';
import { VIBRATION_OPERATING_CASE_CSV_HEADER } from '../converters/vibration/tabular/operating-cases.js';
import {
  assertExactVibrationCsvHeader,
  nonBlankVibrationCsvRows,
  parseStrictVibrationCsvRows,
  serializeVibrationCsvRows,
  vibrationTabularInputError,
} from '../converters/vibration/tabular/csv.js';
import {
  revertVibrationIntegrityUnitAwareCell,
  updateVibrationIntegrityUnitAwareCell,
} from './vibration-integrity-input-units.js';
import {
  addVibrationWorkingRow,
  createVibrationWorkingRecords,
  deleteVibrationWorkingRow,
  replaceVisibleVibrationWorkingRows,
  revertVibrationWorkingRow,
  revertVibrationWorkingTable,
  vibrationWorkingCellState,
  vibrationWorkingEditCount,
  vibrationWorkingRecordsDirty,
  vibrationWorkingRowState,
  visibleVibrationWorkingRowIds,
  visibleVibrationWorkingRows,
} from './vibration-integrity-working-state.js';

export const VIBRATION_INTEGRITY_INPUT_TABLE = Object.freeze({
  TOPOLOGY: 'topology', OPERATING: 'operating', ENRICHMENT: 'enrichment', DATA_BLOCKERS: 'dataBlockers',
});
export const VIBRATION_LOCAL_TOPOLOGY_SOURCE_STATUS = 'LOCAL_EDITED_UNVERIFIED';

const TABLE_CONFIG = Object.freeze({
  topology: Object.freeze({ header: VIBRATION_TABLE_EXCHANGE_SHEETS.Elements, contract: 'TopologyEditTableHumanExport.Elements' }),
  operating: Object.freeze({ header: VIBRATION_OPERATING_CASE_CSV_HEADER, contract: 'VibrationOperatingCaseCsv.v1' }),
  enrichment: Object.freeze({ header: VIBRATION_ENRICHMENT_CSV_HEADER, contract: 'VibrationEnrichmentCsv.v1' }),
  dataBlockers: Object.freeze({ header: VIBRATION_FIT_DATA_BLOCKER_CSV_HEADER, contract: 'VibrationFitDataBlockerCsv.v1' }),
});

function configFor(kind) {
  const config = TABLE_CONFIG[kind];
  if (config) return config;
  throw vibrationTabularInputError(
    'VIBRATION_INPUT_TABLE_KIND_UNSUPPORTED', `Unsupported vibration input table ${kind}.`, { kind },
  );
}

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function normalizeRow(row, width, rowIndex) {
  if (!Array.isArray(row) || row.length !== width) {
    throw vibrationTabularInputError(
      'VIBRATION_INPUT_TABLE_COLUMN_COUNT_MISMATCH',
      'Editable input row does not match the table column count.',
      { row: rowIndex, expected: width, actual: Array.isArray(row) ? row.length : null },
    );
  }
  return row.map(text);
}

function ignoredDirtyColumns(kind, header) {
  return kind === 'topology' ? [header.indexOf('Source Status')].filter((index) => index >= 0) : [];
}

function tableState(kind, rows, metadata = {}) {
  const config = configFor(kind);
  const normalized = rows.map((row, index) => normalizeRow(row, config.header.length, index + 1));
  const records = metadata.records ?? createVibrationWorkingRecords(kind, normalized);
  const visibleRows = visibleVibrationWorkingRows(records);
  const ignoredColumns = ignoredDirtyColumns(kind, config.header);
  const sourceKind = metadata.sourceKind ?? 'WORKING_TABLE';
  return Object.freeze({
    kind, contract: config.contract, header: Object.freeze([...config.header]), records,
    rows: visibleRows, rowIds: visibleVibrationWorkingRowIds(records),
    sourceName: metadata.sourceName ?? null, sourceKind,
    baseSourceKind: metadata.baseSourceKind ?? sourceKind,
    originalCertifiedExchange: metadata.originalCertifiedExchange === true,
    authorityDowngraded: metadata.authorityDowngraded === true,
    dirty: vibrationWorkingRecordsDirty(records, { ignoredColumns }),
    editCount: vibrationWorkingEditCount(records, { ignoredColumns }),
    nextLocalRowSequence: metadata.nextLocalRowSequence ?? 1,
  });
}

function topologyMutationRecords(table, records) {
  if (table.kind !== 'topology') return records;
  const sourceStatusIndex = table.header.indexOf('Source Status');
  const rows = visibleVibrationWorkingRows(records).map((row) => {
    const next = [...row];
    const hasWorkingData = next.some((value, index) => (
      index !== sourceStatusIndex && text(value).trim() !== ''
    ));
    next[sourceStatusIndex] = hasWorkingData ? VIBRATION_LOCAL_TOPOLOGY_SOURCE_STATUS : '';
    return next;
  });
  return replaceVisibleVibrationWorkingRows(records, rows);
}

function mutationState(table, records, metadata = {}) {
  const topology = table.kind === 'topology';
  const nextRecords = topologyMutationRecords(table, records);
  return tableState(table.kind, visibleVibrationWorkingRows(nextRecords), {
    ...table, ...metadata, records: nextRecords,
    sourceKind: topology ? 'LOCAL_ELEMENTS_OVERRIDE' : table.sourceKind,
    authorityDowngraded: topology ? true : table.authorityDowngraded,
  });
}

export function createEmptyVibrationIntegrityInputTable(kind) {
  return tableState(kind, []);
}

export function parseVibrationIntegrityInputCsv(kind, csvText, metadata = {}) {
  const config = configFor(kind);
  const parsed = parseStrictVibrationCsvRows(csvText);
  assertExactVibrationCsvHeader(parsed, config.header, config.contract);
  const body = nonBlankVibrationCsvRows(parsed.slice(1));
  return tableState(kind, body, { ...metadata, sourceKind: metadata.sourceKind ?? 'CSV' });
}

function exchangeElementRow(element) {
  return [
    element.tag, element.type, element.line, element.connectFrom, element.connectTo,
    element.dnInMm, element.dnOutMm, element.lengthMm, element.schedule, element.material,
    element.pipingClass, element.pressureClass, element.catalogueAuthority,
    element.sourceStatus, element.canonicalId,
  ].map(text);
}

export function createTopologyInputTableFromExchange(exchange, metadata = {}) {
  if (!exchange || !Array.isArray(exchange.elements)) {
    throw vibrationTabularInputError(
      'VIBRATION_INPUT_TOPOLOGY_EXCHANGE_INVALID', 'Parsed topology exchange with elements is required.',
    );
  }
  return tableState('topology', exchange.elements.map(exchangeElementRow), {
    sourceName: metadata.sourceName ?? exchange.sourceFileName ?? null,
    sourceKind: metadata.sourceKind ?? exchange.sourceFormat ?? 'PARSED_EXCHANGE',
    originalCertifiedExchange: exchange.completeExchange === true,
  });
}

export function createVibrationIntegrityInputTable(kind, rows, metadata = {}) {
  return tableState(kind, rows, metadata);
}

export function serializeVibrationIntegrityInputTable(table) {
  const config = configFor(table?.kind);
  return serializeVibrationCsvRows([config.header, ...(table.rows ?? [])]);
}

function assertCell(table, rowIndex, columnIndex) {
  const config = configFor(table?.kind);
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= table.rows.length) {
    throw new RangeError(`Editable input row ${rowIndex} is out of range.`);
  }
  if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= config.header.length) {
    throw new RangeError(`Editable input column ${columnIndex} is out of range.`);
  }
}

function assertRow(table, rowIndex) {
  configFor(table?.kind);
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= table.rows.length) {
    throw new RangeError(`Editable input row ${rowIndex} is out of range.`);
  }
}

export function updateVibrationIntegrityInputCell(table, rowIndex, columnIndex, value) {
  assertCell(table, rowIndex, columnIndex);
  return mutationState(
    table, updateVibrationIntegrityUnitAwareCell(table, rowIndex, columnIndex, value),
  );
}

export function revertVibrationIntegrityInputCell(table, rowIndex, columnIndex) {
  assertCell(table, rowIndex, columnIndex);
  return mutationState(table, revertVibrationIntegrityUnitAwareCell(table, rowIndex, columnIndex));
}

export function revertVibrationIntegrityInputRow(table, rowIndex) {
  assertRow(table, rowIndex);
  return mutationState(table, revertVibrationWorkingRow(table.records, rowIndex));
}

export function revertVibrationIntegrityInputTable(table) {
  const records = revertVibrationWorkingTable(table.records);
  if (table.kind === 'topology' && table.authorityDowngraded) return mutationState(table, records);
  return tableState(table.kind, visibleVibrationWorkingRows(records), {
    ...table, records, sourceKind: table.baseSourceKind, authorityDowngraded: false,
  });
}

export function vibrationIntegrityInputCellState(table, rowIndex, columnIndex) {
  assertCell(table, rowIndex, columnIndex);
  return vibrationWorkingCellState(table.records, rowIndex, columnIndex);
}

export function vibrationIntegrityInputRowState(table, rowIndex) {
  assertRow(table, rowIndex);
  return vibrationWorkingRowState(table.records, rowIndex, {
    ignoredColumns: ignoredDirtyColumns(table.kind, table.header),
  });
}

export function addVibrationIntegrityInputRow(table) {
  const config = configFor(table?.kind);
  const added = addVibrationWorkingRow(
    table.records, table.kind, config.header.length, table.nextLocalRowSequence,
  );
  return mutationState(table, added.records, { nextLocalRowSequence: added.nextSequence });
}

export function deleteVibrationIntegrityInputRow(table, rowIndex) {
  assertRow(table, rowIndex);
  return mutationState(table, deleteVibrationWorkingRow(table.records, rowIndex));
}
