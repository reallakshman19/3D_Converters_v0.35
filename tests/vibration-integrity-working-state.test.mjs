import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addVibrationWorkingRow,
  createVibrationWorkingRecords,
  deleteVibrationWorkingRow,
  revertVibrationWorkingCell,
  revertVibrationWorkingRow,
  revertVibrationWorkingTable,
  updateVibrationWorkingCell,
  vibrationWorkingCellState,
  vibrationWorkingRecordsDirty,
  vibrationWorkingRowState,
  visibleVibrationWorkingRowIds,
  visibleVibrationWorkingRows,
} from '../tabs/vibration-integrity-working-state.js';

test('source rows receive stable IDs and retain original/working cell state', () => {
  const records = createVibrationWorkingRecords('operating', [['A', 'B'], ['C', 'D']]);
  assert.deepEqual(visibleVibrationWorkingRowIds(records), [
    'operating:source:0001', 'operating:source:0002',
  ]);
  const edited = updateVibrationWorkingCell(records, 0, 1, 'B2');
  assert.equal(vibrationWorkingCellState(edited, 0, 1).originalValue, 'B');
  assert.equal(vibrationWorkingCellState(edited, 0, 1).workingValue, 'B2');
  assert.equal(vibrationWorkingRecordsDirty(edited), true);
  assert.equal(vibrationWorkingRecordsDirty(records), false);
});

test('cell, row and table revert restore exact source values', () => {
  let records = createVibrationWorkingRecords('enrichment', [['CID', 'VALUE'], ['CID-2', 'VALUE-2']]);
  records = updateVibrationWorkingCell(records, 0, 1, 'EDITED');
  records = revertVibrationWorkingCell(records, 0, 1);
  assert.deepEqual(visibleVibrationWorkingRows(records)[0], ['CID', 'VALUE']);

  records = updateVibrationWorkingCell(records, 0, 1, 'ROW-EDITED');
  assert.equal(vibrationWorkingRowState(records, 0).edited, true);
  records = revertVibrationWorkingRow(records, 0);
  assert.deepEqual(visibleVibrationWorkingRows(records)[0], ['CID', 'VALUE']);
  assert.equal(vibrationWorkingRowState(records, 0).edited, false);

  records = updateVibrationWorkingCell(records, 1, 1, 'EDITED');
  records = deleteVibrationWorkingRow(records, 0);
  records = revertVibrationWorkingTable(records);
  assert.deepEqual(visibleVibrationWorkingRows(records), [['CID', 'VALUE'], ['CID-2', 'VALUE-2']]);
  assert.equal(vibrationWorkingRecordsDirty(records), false);
});

test('row state can ignore non-engineering source-status columns', () => {
  const original = createVibrationWorkingRecords('topology', [['P-1', 'CERTIFIED']]);
  const edited = updateVibrationWorkingCell(original, 0, 1, 'LOCAL_EDITED_UNVERIFIED');
  assert.equal(vibrationWorkingRowState(edited, 0).edited, true);
  assert.equal(vibrationWorkingRowState(edited, 0, { ignoredColumns: [1] }).edited, false);
});

test('added rows keep stable local IDs and row/table revert remove them', () => {
  const original = createVibrationWorkingRecords('topology', [['P-1', 'PIPE']]);
  const first = addVibrationWorkingRow(original, 'topology', 2, 1);
  assert.deepEqual(visibleVibrationWorkingRowIds(first.records), [
    'topology:source:0001', 'topology:local:0001',
  ]);
  const rowReverted = revertVibrationWorkingRow(first.records, 1);
  assert.deepEqual(visibleVibrationWorkingRowIds(rowReverted), ['topology:source:0001']);

  const second = addVibrationWorkingRow(original, 'topology', 2, 1);
  const tableReverted = revertVibrationWorkingTable(second.records);
  assert.deepEqual(visibleVibrationWorkingRowIds(tableReverted), ['topology:source:0001']);
  assert.equal(vibrationWorkingRecordsDirty(tableReverted), false);
});
