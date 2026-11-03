import {
  SBC_TYPE3_RECORD_KEY,
  createSbcType3UserInputTemplate,
  validateSbcType3UserEngineeringDataRow,
} from '../converters/vibration/sbc/type3-user-data.js';
import {
  createSbcT3UserEngineeringDataTemplate,
  validateVibrationUserEngineeringDataRow,
} from '../converters/vibration/user-engineering-data.js';

export const VIBRATION_USER_DATA_COLUMNS = Object.freeze([
  Object.freeze({ key: 'mechanismId', label: 'Mechanism' }),
  Object.freeze({ key: 'blockerId', label: 'Data blocker' }),
  Object.freeze({ key: 'scopeId', label: 'Scope / assessment' }),
  Object.freeze({ key: 'recordKey', label: 'Record key' }),
  Object.freeze({ key: 'xValue', label: 'X' }),
  Object.freeze({ key: 'xUnit', label: 'X unit' }),
  Object.freeze({ key: 'yValue', label: 'Y' }),
  Object.freeze({ key: 'yUnit', label: 'Y unit' }),
  Object.freeze({ key: 'value', label: 'Value' }),
  Object.freeze({ key: 'unit', label: 'Unit' }),
  Object.freeze({ key: 'sourceReference', label: 'Source / basis' }),
  Object.freeze({ key: 'notes', label: 'Notes' }),
]);

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function emptyRow() {
  return Object.fromEntries(VIBRATION_USER_DATA_COLUMNS.map((column) => [column.key, '']));
}

function withRowId(row, sequence) {
  return Object.freeze({ rowId: `USER-DATA-${String(sequence).padStart(4, '0')}`, ...emptyRow(), ...row });
}

function nextTable(rows, nextSequence) {
  return Object.freeze({ rows: Object.freeze(rows), nextSequence, schema: 'VibrationUserEngineeringDataTable.v1' });
}

export function createVibrationUserEngineeringDataTable(rows = []) {
  const normalized = rows.map((row, index) => withRowId(row, index + 1));
  return nextTable(normalized, normalized.length + 1);
}

export function addVibrationUserEngineeringDataRow(table, seed = {}) {
  const row = withRowId(seed, table.nextSequence);
  return nextTable([...table.rows, row], table.nextSequence + 1);
}

function addSeedRows(table, seeds) {
  return seeds.reduce((next, seed) => addVibrationUserEngineeringDataRow(next, seed), table);
}

export function addSbcT3UserEngineeringDataRows(table, scopeId = '') {
  return addSeedRows(table, createSbcT3UserEngineeringDataTemplate(scopeId));
}

export function addSbcType3UserEngineeringDataRows(table, scopeId, firstSpanHasUnsupportedMass) {
  return addSeedRows(table, createSbcType3UserInputTemplate(scopeId, firstSpanHasUnsupportedMass));
}

function assertRowIndex(table, rowIndex) {
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= table.rows.length) {
    throw new RangeError(`User engineering data row ${rowIndex} is out of range.`);
  }
}

function assertColumnKey(columnKey) {
  if (!VIBRATION_USER_DATA_COLUMNS.some((column) => column.key === columnKey)) {
    throw new RangeError(`Unknown user engineering data column ${columnKey}.`);
  }
}

export function updateVibrationUserEngineeringDataCell(table, rowIndex, columnKey, value) {
  assertRowIndex(table, rowIndex);
  assertColumnKey(columnKey);
  const rows = table.rows.map((row, index) => (
    index === rowIndex ? Object.freeze({ ...row, [columnKey]: text(value) }) : row
  ));
  return nextTable(rows, table.nextSequence);
}

export function deleteVibrationUserEngineeringDataRow(table, rowIndex) {
  assertRowIndex(table, rowIndex);
  return nextTable(table.rows.filter((_, index) => index !== rowIndex), table.nextSequence);
}

export function vibrationUserEngineeringDataRowState(row) {
  const hasAnyValue = VIBRATION_USER_DATA_COLUMNS.some((column) => text(row[column.key]).trim() !== '');
  if (!hasAnyValue) return Object.freeze({ status: 'EMPTY', errors: Object.freeze([]) });
  const validation = row.recordKey === SBC_TYPE3_RECORD_KEY
    ? validateSbcType3UserEngineeringDataRow(row)
    : validateVibrationUserEngineeringDataRow(row);
  return Object.freeze({ status: validation.ok ? 'READY' : 'INCOMPLETE', errors: validation.errors });
}

export function vibrationUserEngineeringDataSummary(table) {
  const states = table.rows.map(vibrationUserEngineeringDataRowState);
  return Object.freeze({
    rows: table.rows.length,
    ready: states.filter((state) => state.status === 'READY').length,
    incomplete: states.filter((state) => state.status === 'INCOMPLETE').length,
    empty: states.filter((state) => state.status === 'EMPTY').length,
  });
}

export function vibrationUserEngineeringDataResolverRows(table) {
  return Object.freeze(table.rows.map(({ rowId, ...row }) => Object.freeze({ ...row })));
}
