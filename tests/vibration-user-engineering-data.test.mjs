import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  VIBRATION_USER_ENGINEERING_DATA_AUTHORITY,
  createSbcT3UserEngineeringDataTemplate,
  resolveBlockedVibrationData,
  resolveVibrationUserEngineeringData,
} from '../converters/vibration/user-engineering-data.js';
import {
  addSbcT3UserEngineeringDataRows,
  createVibrationUserEngineeringDataTable,
  updateVibrationUserEngineeringDataCell,
  vibrationUserEngineeringDataResolverRows,
  vibrationUserEngineeringDataSummary,
} from '../tabs/vibration-integrity-user-data-model.js';
import { renderVibrationUserEngineeringData } from '../tabs/vibration-integrity-user-data-view.js';

const controllerSource = fs.readFileSync(new URL('../tabs/vibration-integrity-tab.js', import.meta.url), 'utf8');
const shellSource = fs.readFileSync(new URL('../tabs/vibration-integrity-user-data-shell.js', import.meta.url), 'utf8');

function sbcRow(overrides = {}) {
  return {
    mechanismId: 'smallBoreConnections',
    blockerId: 'EI_AVIFF.T3.SBC.FIGURE_T3_1',
    scopeId: 'LINE-100/NORMAL/SBC-01',
    recordKey: 'DIRECT_EVALUATED_VALUE',
    xValue: '1.5', xUnit: 'in',
    yValue: '2.4', yUnit: 'm',
    value: '0.6', unit: '1',
    sourceReference: 'Engineer reading from controlled EI T3-1',
    notes: '',
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    mechanismId: 'smallBoreConnections',
    blockerId: 'EI_AVIFF.T3.SBC.FIGURE_T3_1',
    scopeId: 'LINE-100/NORMAL/SBC-01',
    recordKey: 'DIRECT_EVALUATED_VALUE',
    xValue: '1.5', xUnit: 'in',
    yValue: '2.4', yUnit: 'm',
    ...overrides,
  };
}

test('governed master value always takes precedence over user engineering data', () => {
  const result = resolveBlockedVibrationData({
    governedValue: 0.42,
    governedUnit: '1',
    governedProvenance: { masterId: 'QUALIFIED-MASTER' },
    userRows: [sbcRow({ value: '0.6' })],
    request: request(),
  });
  assert.equal(result.status, 'RESOLVED_GOVERNED_MASTER');
  assert.equal(result.value, 0.42);
  assert.deepEqual(result.provenance, { masterId: 'QUALIFIED-MASTER' });
});

test('exact user row resolves as project input with no engineering authority', () => {
  const result = resolveVibrationUserEngineeringData([sbcRow()], request());
  assert.equal(result.status, 'RESOLVED_USER_INPUT');
  assert.equal(result.value, 0.6);
  assert.equal(result.unit, '1');
  assert.equal(result.authority.evidenceClass, 'USER_SUPPLIED_PROJECT_INPUT');
  assert.equal(result.authority.engineeringAuthority, 'NONE');
  assert.equal(result.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(result.authority.designAuthority, false);
  assert.deepEqual(result.authority, VIBRATION_USER_ENGINEERING_DATA_AUTHORITY);
});

test('resolver does not perform nearest-row lookup, interpolation, extrapolation or unit conversion', () => {
  const rows = [sbcRow()];
  assert.equal(resolveVibrationUserEngineeringData(rows, request({ xValue: '1.51' })).status, 'NOT_READY');
  assert.equal(resolveVibrationUserEngineeringData(rows, request({ yValue: '2.5' })).status, 'NOT_READY');
  assert.equal(resolveVibrationUserEngineeringData(rows, request({ xUnit: 'mm', xValue: '38.1' })).status, 'NOT_READY');
});

test('duplicate exact rows fail closed as ambiguous', () => {
  const result = resolveVibrationUserEngineeringData([sbcRow(), sbcRow({ notes: 'duplicate' })], request());
  assert.equal(result.status, 'AMBIGUOUS');
  assert.equal(result.matchCount, 2);
});

test('matching invalid numeric row fails closed rather than coercing or defaulting', () => {
  const result = resolveVibrationUserEngineeringData([sbcRow({ value: 'not-a-number' })], request());
  assert.equal(result.status, 'INVALID_USER_DATA');
  assert.ok(result.validation.errors.includes('NUMERIC_VALUE_REQUIRED'));
});

test('matching row requires a source or engineering basis reference', () => {
  const result = resolveVibrationUserEngineeringData([sbcRow({ sourceReference: '' })], request());
  assert.equal(result.status, 'INVALID_USER_DATA');
  assert.ok(result.validation.errors.includes('SOURCE_REFERENCE_REQUIRED'));
});

test('SBC template creates four explicit T3 figure rows and no numerical defaults', () => {
  const rows = createSbcT3UserEngineeringDataTemplate('SBC-CASE-1');
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.blockerId), [
    'EI_AVIFF.T3.SBC.FIGURE_T3_1',
    'EI_AVIFF.T3.SBC.FIGURE_T3_2',
    'EI_AVIFF.T3.SBC.FIGURE_T3_3',
    'EI_AVIFF.T3.SBC.FIGURE_T3_4',
  ]);
  assert.ok(rows.every((row) => row.value === '' && row.sourceReference === ''));
});

test('editable user engineering table remains explicit and resolver-ready', () => {
  let table = addSbcT3UserEngineeringDataRows(createVibrationUserEngineeringDataTable(), 'SBC-CASE-1');
  assert.equal(table.rows.length, 4);
  table = updateVibrationUserEngineeringDataCell(table, 0, 'value', '0.55');
  table = updateVibrationUserEngineeringDataCell(table, 0, 'sourceReference', 'Controlled source manual reading');
  const summary = vibrationUserEngineeringDataSummary(table);
  assert.equal(summary.rows, 4);
  assert.equal(summary.ready, 1);
  assert.equal(summary.incomplete, 3);
  assert.equal(vibrationUserEngineeringDataResolverRows(table)[0].value, '0.55');
});

test('User Engineering Data renders as a separate editable project-input surface', () => {
  const table = addSbcT3UserEngineeringDataRows(createVibrationUserEngineeringDataTable(), 'SBC-CASE-1');
  const html = renderVibrationUserEngineeringData({ userEngineeringData: table });
  assert.match(html, /User Engineering Data/u);
  assert.match(html, /USER_SUPPLIED_PROJECT_INPUT/u);
  assert.match(html, /NOT_AUTHORIZED/u);
  assert.match(html, /Add SBC T3-1…T3-4 rows/u);
  assert.match(html, /EI_AVIFF\.T3\.SBC\.FIGURE_T3_1/u);
  assert.match(html, /data-vi-user-data-cell=/u);
  assert.match(html, /no interpolation, extrapolation, nearest-row lookup or unit conversion/iu);
});

test('controller routes visible workspace through the user-data shell', () => {
  assert.match(controllerSource, /createVibrationUserDataUiState/u);
  assert.match(controllerSource, /renderVibrationIntegrityWithUserData/u);
  assert.match(controllerSource, /handleVibrationUserDataClick/u);
  assert.match(controllerSource, /handleVibrationUserDataChange/u);
  assert.match(shellSource, /data-vi-workspace-tab="user-data"/u);
  assert.match(shellSource, /NOT MASTER \/ SCREENING \/ DESIGN AUTHORITY/u);
});
