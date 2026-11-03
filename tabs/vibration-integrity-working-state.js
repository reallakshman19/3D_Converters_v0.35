function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function freezeRow(row) {
  return Object.freeze(row.map(text));
}

function freezeRecord(record) {
  return Object.freeze({
    rowId: record.rowId,
    originalRow: record.originalRow ? freezeRow(record.originalRow) : null,
    workingRow: freezeRow(record.workingRow),
    added: record.added === true,
    deleted: record.deleted === true,
  });
}

function sourceRowId(kind, index) {
  return `${kind}:source:${String(index + 1).padStart(4, '0')}`;
}

function localRowId(kind, sequence) {
  return `${kind}:local:${String(sequence).padStart(4, '0')}`;
}

function visibleRecords(records) {
  return records.filter((record) => !record.deleted);
}

function recordAtVisibleIndex(records, rowIndex) {
  const record = visibleRecords(records)[rowIndex];
  if (!record) throw new RangeError(`Editable input row ${rowIndex} is out of range.`);
  return record;
}

function replaceRecord(records, rowId, replacement) {
  return Object.freeze(records.map((record) => (
    record.rowId === rowId ? freezeRecord(replacement) : record
  )));
}

function sameRow(left, right, ignoredColumns) {
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (ignoredColumns.has(index)) continue;
    if (text(left[index]) !== text(right[index])) return false;
  }
  return true;
}

export function createVibrationWorkingRecords(kind, rows) {
  return Object.freeze(rows.map((row, index) => freezeRecord({
    rowId: sourceRowId(kind, index),
    originalRow: row,
    workingRow: row,
    added: false,
    deleted: false,
  })));
}

export function visibleVibrationWorkingRows(records) {
  return Object.freeze(visibleRecords(records).map((record) => record.workingRow));
}

export function visibleVibrationWorkingRowIds(records) {
  return Object.freeze(visibleRecords(records).map((record) => record.rowId));
}

export function updateVibrationWorkingCell(records, rowIndex, columnIndex, value) {
  const record = recordAtVisibleIndex(records, rowIndex);
  const workingRow = [...record.workingRow];
  workingRow[columnIndex] = text(value);
  return replaceRecord(records, record.rowId, { ...record, workingRow });
}

export function addVibrationWorkingRow(records, kind, width, sequence) {
  const next = freezeRecord({
    rowId: localRowId(kind, sequence),
    originalRow: null,
    workingRow: Array(width).fill(''),
    added: true,
    deleted: false,
  });
  return Object.freeze({
    records: Object.freeze([...records, next]),
    nextSequence: sequence + 1,
  });
}

export function deleteVibrationWorkingRow(records, rowIndex) {
  const record = recordAtVisibleIndex(records, rowIndex);
  return replaceRecord(records, record.rowId, { ...record, deleted: true });
}

export function revertVibrationWorkingCell(records, rowIndex, columnIndex) {
  const record = recordAtVisibleIndex(records, rowIndex);
  if (!record.originalRow) return records;
  const workingRow = [...record.workingRow];
  workingRow[columnIndex] = record.originalRow[columnIndex];
  return replaceRecord(records, record.rowId, { ...record, workingRow });
}

export function revertVibrationWorkingRow(records, rowIndex) {
  const record = recordAtVisibleIndex(records, rowIndex);
  if (record.added) return replaceRecord(records, record.rowId, { ...record, deleted: true });
  return replaceRecord(records, record.rowId, {
    ...record,
    workingRow: record.originalRow,
    deleted: false,
  });
}

export function revertVibrationWorkingTable(records) {
  return Object.freeze(records
    .filter((record) => !record.added)
    .map((record) => freezeRecord({
      ...record,
      workingRow: record.originalRow,
      deleted: false,
    })));
}

export function replaceVisibleVibrationWorkingRows(records, rows) {
  const visible = visibleRecords(records);
  if (rows.length !== visible.length) {
    throw new RangeError('Replacement working rows do not match visible row count.');
  }
  const replacements = new Map(visible.map((record, index) => [
    record.rowId,
    { ...record, workingRow: rows[index] },
  ]));
  return Object.freeze(records.map((record) => (
    replacements.has(record.rowId) ? freezeRecord(replacements.get(record.rowId)) : record
  )));
}

export function vibrationWorkingCellState(records, rowIndex, columnIndex) {
  const record = recordAtVisibleIndex(records, rowIndex);
  const originalValue = record.originalRow?.[columnIndex] ?? null;
  const workingValue = record.workingRow[columnIndex];
  return Object.freeze({
    rowId: record.rowId,
    added: record.added,
    originalValue,
    workingValue,
    edited: record.added || originalValue !== workingValue,
  });
}

export function vibrationWorkingRowState(records, rowIndex, options = {}) {
  const record = recordAtVisibleIndex(records, rowIndex);
  const ignoredColumns = new Set(options.ignoredColumns ?? []);
  return Object.freeze({
    rowId: record.rowId,
    added: record.added,
    originalRow: record.originalRow,
    workingRow: record.workingRow,
    edited: record.added || !sameRow(record.originalRow, record.workingRow, ignoredColumns),
  });
}

export function vibrationWorkingRecordsDirty(records, options = {}) {
  const ignoredColumns = new Set(options.ignoredColumns ?? []);
  return records.some((record) => {
    if (record.added) return !record.deleted;
    if (record.deleted) return true;
    return !sameRow(record.originalRow, record.workingRow, ignoredColumns);
  });
}

export function vibrationWorkingEditCount(records, options = {}) {
  const ignoredColumns = new Set(options.ignoredColumns ?? []);
  return records.reduce((count, record) => {
    if (record.added) return count + (record.deleted ? 0 : 1);
    if (record.deleted) return count + 1;
    return count + record.workingRow.reduce((cells, value, index) => (
      ignoredColumns.has(index) || value === record.originalRow[index] ? cells : cells + 1
    ), 0);
  }, 0);
}
