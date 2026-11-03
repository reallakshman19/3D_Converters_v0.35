import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addVibrationIntegrityInputRow,
  createTopologyInputTableFromExchange,
  createVibrationIntegrityInputTable,
  deleteVibrationIntegrityInputRow,
  parseVibrationIntegrityInputCsv,
  revertVibrationIntegrityInputCell,
  revertVibrationIntegrityInputRow,
  revertVibrationIntegrityInputTable,
  serializeVibrationIntegrityInputTable,
  updateVibrationIntegrityInputCell,
  vibrationIntegrityInputCellState,
  vibrationIntegrityInputRowState,
  VIBRATION_LOCAL_TOPOLOGY_SOURCE_STATUS,
} from '../tabs/vibration-integrity-input-model.js';

const OPERATING_HEADER = [
  'Line','Operating Case','Label','Phase','Mass Flow','Mass Flow Unit','Density','Density Unit',
  'Pressure','Pressure Unit','Pressure Reference','Temperature','Temperature Unit',
  'Dynamic Viscosity','Dynamic Viscosity Unit','Velocity','Velocity Unit','Source','Source Revision','Record ID',
];

function blockerRow(field, value, unit) {
  return ['CID-1','L-1','CASE-1',field,value,unit,'USER-INPUT','','B-1','ACTIVE','eng-a',''];
}

test('editable operating CSV loads into original/working rows and round-trips quoted values', () => {
  const csv = `${OPERATING_HEADER.join(',')}\r\nL-100,CASE-1,"Normal, wet",GAS,12,kg/s,8,kg/m3,,,,,,0.00002,Pa*s,,,"HMB, issued",R3,REC-1\r\n`;
  const table = parseVibrationIntegrityInputCsv('operating', csv, { sourceName: 'cases.csv' });
  assert.equal(table.rows.length, 1);
  assert.equal(table.rowIds[0], 'operating:source:0001');
  assert.equal(table.rows[0][2], 'Normal, wet');
  assert.equal(table.dirty, false);
  assert.equal(vibrationIntegrityInputCellState(table, 0, 2).originalValue, 'Normal, wet');
  assert.match(serializeVibrationIntegrityInputTable(table), /"Normal, wet"/u);
});

test('cell and row edits are immutable and exact revert restores source values', () => {
  const original = createVibrationIntegrityInputTable('enrichment', [[
    'CID-1','L-1','','FIT_ASSESSMENT_POINT','true','BOOLEAN','','ENG','','REC-1','','',
  ]]);
  const edited = updateVibrationIntegrityInputCell(original, 0, 4, 'false');
  assert.equal(original.rows[0][4], 'true');
  assert.equal(edited.rows[0][4], 'false');
  assert.equal(edited.dirty, true);
  assert.equal(vibrationIntegrityInputRowState(edited, 0).edited, true);
  const cellReverted = revertVibrationIntegrityInputCell(edited, 0, 4);
  assert.equal(cellReverted.rows[0][4], 'true');
  assert.equal(cellReverted.dirty, false);

  const rowEdited = updateVibrationIntegrityInputCell(original, 0, 4, 'false');
  const rowReverted = revertVibrationIntegrityInputRow(rowEdited, 0);
  assert.equal(rowReverted.rows[0][4], 'true');
  assert.equal(rowReverted.dirty, false);
  assert.equal(vibrationIntegrityInputRowState(rowReverted, 0).edited, false);
});

test('unit-only edit converts the paired operating value through central engineering units', () => {
  const row = ['L-1','CASE-1','','GAS','1','kg/s','8','kg/m3','','','','','','','','','','SRC','','REC'];
  const table = createVibrationIntegrityInputTable('operating', [row]);
  const converted = updateVibrationIntegrityInputCell(table, 0, 5, 'kg/h');
  assert.equal(converted.rows[0][4], '3600');
  assert.equal(converted.rows[0][5], 'kg/h');
  const reverted = revertVibrationIntegrityInputCell(converted, 0, 5);
  assert.equal(reverted.rows[0][4], '1');
  assert.equal(reverted.rows[0][5], 'kg/s');
  assert.equal(reverted.dirty, false);
});

test('data-blocker unit-only edit converts the paired manual value and exact revert restores both', () => {
  const table = createVibrationIntegrityInputTable('dataBlockers', [blockerRow('MASS_FLOW', '1', 'kg/s')]);
  const converted = updateVibrationIntegrityInputCell(table, 0, 5, 'lb/hr');
  assert(Math.abs(Number(converted.rows[0][4]) - 7936.64143865559) < 1e-10);
  assert.equal(converted.rows[0][5], 'lb/hr');
  const reverted = revertVibrationIntegrityInputCell(converted, 0, 5);
  assert.equal(reverted.rows[0][4], '1');
  assert.equal(reverted.rows[0][5], 'kg/s');
  assert.equal(reverted.dirty, false);
});

test('unknown numeric enrichment and blocker unit semantics fail closed instead of guessing conversion', () => {
  const enrichment = createVibrationIntegrityInputTable('enrichment', [[
    'CID-1','L-1','','FUTURE_UNKNOWN_QUANTITY','10','NUMBER','m','ENG','','REC-1','','',
  ]]);
  assert.throws(
    () => updateVibrationIntegrityInputCell(enrichment, 0, 6, 'mm'),
    (error) => error?.code === 'VIBRATION_INPUT_UNIT_CONTEXT_UNRESOLVED',
  );
  const blocker = createVibrationIntegrityInputTable('dataBlockers', [blockerRow('FUTURE_UNKNOWN_QUANTITY', '10', 'm')]);
  assert.throws(
    () => updateVibrationIntegrityInputCell(blocker, 0, 5, 'mm'),
    (error) => error?.code === 'VIBRATION_INPUT_UNIT_CONTEXT_UNRESOLVED',
  );
});

test('add/delete and row revert preserve exact width and local row identity', () => {
  const original = createVibrationIntegrityInputTable('operating', []);
  const added = addVibrationIntegrityInputRow(original);
  assert.equal(added.rows.length, 1);
  assert.equal(added.rows[0].length, OPERATING_HEADER.length);
  assert.equal(added.rowIds[0], 'operating:local:0001');
  assert.equal(vibrationIntegrityInputRowState(added, 0).added, true);
  const reverted = revertVibrationIntegrityInputRow(added, 0);
  assert.equal(reverted.rows.length, 0);
  assert.equal(reverted.dirty, false);

  const addedAgain = addVibrationIntegrityInputRow(original);
  const removed = deleteVibrationIntegrityInputRow(addedAgain, 0);
  assert.equal(removed.rows.length, 0);
  assert.equal(removed.dirty, false);
});

function completeExchange() {
  return Object.freeze({
    completeExchange: true,
    sourceFormat: 'XLSX',
    sourceFileName: 'certified.xlsx',
    elements: Object.freeze([Object.freeze({
      tag: 'P-1', type: 'PIPE', line: 'L-1', connectFrom: null, connectTo: null,
      dnInMm: 273, dnOutMm: 273, lengthMm: 1000, schedule: '40', material: 'CS',
      pipingClass: 'PC-1', pressureClass: '300', catalogueAuthority: 'CAT',
      sourceStatus: 'CERTIFIED', canonicalId: 'CID-1',
    })]),
  });
}

test('topology edit latches local authority even after exact row or table revert', () => {
  const table = createTopologyInputTableFromExchange(completeExchange());
  const edited = updateVibrationIntegrityInputCell(table, 0, 2, 'L-1-EDITED');
  assert.equal(edited.dirty, true);
  assert.equal(edited.authorityDowngraded, true);
  assert.equal(edited.rows[0][13], VIBRATION_LOCAL_TOPOLOGY_SOURCE_STATUS);

  const rowReverted = revertVibrationIntegrityInputRow(edited, 0);
  assert.equal(rowReverted.rows[0][2], 'L-1');
  assert.equal(rowReverted.dirty, false);
  assert.equal(rowReverted.authorityDowngraded, true);
  assert.equal(vibrationIntegrityInputRowState(rowReverted, 0).edited, false);

  const editedAgain = updateVibrationIntegrityInputCell(rowReverted, 0, 2, 'L-1-EDITED');
  const tableReverted = revertVibrationIntegrityInputTable(editedAgain);
  assert.equal(tableReverted.rows[0][2], 'L-1');
  assert.equal(tableReverted.dirty, false);
  assert.equal(tableReverted.authorityDowngraded, true);
  assert.equal(tableReverted.sourceKind, 'LOCAL_ELEMENTS_OVERRIDE');
  assert.equal(tableReverted.rows[0][13], VIBRATION_LOCAL_TOPOLOGY_SOURCE_STATUS);
});

test('adding a blank topology row does not create a fake provenance-only element', () => {
  const original = createVibrationIntegrityInputTable('topology', [[
    'P-1','PIPE','L-1','','','','','','','','','','','CERTIFIED','CID-1',
  ]]);
  const added = addVibrationIntegrityInputRow(original);
  assert.equal(added.rows[0][13], VIBRATION_LOCAL_TOPOLOGY_SOURCE_STATUS);
  assert.equal(added.rows[1][13], '');
  assert(added.rows[1].every((value) => value === ''));
});

test('table constructor fails closed on wrong column count', () => {
  assert.throws(
    () => createVibrationIntegrityInputTable('topology', [['too-short']]),
    (error) => error?.code === 'VIBRATION_INPUT_TABLE_COLUMN_COUNT_MISMATCH',
  );
});
