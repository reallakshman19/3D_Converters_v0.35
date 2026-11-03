import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const CSV_PATH = new URL(
  '../docs/Masters/Vibration/ei-aviff-t29-valve-recovery-factors.candidate.csv',
  import.meta.url,
);
const RECEIPT_PATH = new URL(
  '../ValidationRecords/VibrationMasters/ei-aviff-t29-valve-recovery-candidate-v1.json',
  import.meta.url,
);

function readRows() {
  const lines = readFileSync(CSV_PATH, 'utf8').trim().split('\n');
  const headers = lines.shift().split(',');
  return lines.map((line) => Object.fromEntries(
    line.split(',').map((value, index) => [headers[index], value]),
  ));
}

function readReceipt() {
  return JSON.parse(readFileSync(RECEIPT_PATH, 'utf8'));
}

function resolveFl(rows, valveType) {
  const key = valveType?.trim().toLowerCase();
  const row = rows.find((candidate) => candidate.valveType.toLowerCase() === key);
  return row ? { status: 'READY', FL: Number(row.FL) } : { status: 'NOT_READY' };
}

test('T2.9 candidate contains exactly the four EI FL rows', () => {
  const rows = readRows();
  assert.deepEqual(
    rows.map(({ valveType, FL }) => [valveType, Number(FL)]),
    [['Ball', 0.6], ['Butterfly', 0.62], ['Globe', 0.9], ['Gate', 0.6]],
  );
});

test('unknown valve type fails closed instead of using a generic recovery factor', () => {
  const rows = readRows();
  assert.deepEqual(resolveFl(rows, 'Rotary plug'), { status: 'NOT_READY' });
  assert.deepEqual(resolveFl(rows, ''), { status: 'NOT_READY' });
});

test('published valve delta equation reproduces the independent Globe example', () => {
  const { FL } = resolveFl(readRows(), 'Globe');
  const delta = FL ** 2 * (13789500 - 0.96 * 152926);
  assert.equal(delta, 11050579.7424);
});

test('candidate provenance records negative workbook findings without inventing cells', () => {
  const receipt = readReceipt();
  assert.equal(receipt.requestedWorkbookAudit.status, 'TARGET_TABLE_NOT_FOUND');
  assert.equal(receipt.requestedWorkbookAudit.fivWorkbook.sheet5Title,
    'APP C - Liquid or Multiphase Valve Opening');
  assert.deepEqual(receipt.siblingWorkbookAudit.workbookSheets, ['Coversheet', 'Checklist']);
  assert.equal(receipt.independentEiCorroboration.status, 'PASS');
  assert.equal(receipt.reconciliation.status, 'CONTROLLED_SOURCE_RECONCILIATION_REQUIRED');
});

test('candidate remains non-published and carries no engineering authority', () => {
  const rows = readRows();
  const receipt = readReceipt();
  assert.ok(rows.every((row) => row.publicationState === 'CANDIDATE'));
  assert.ok(rows.every((row) => row.engineeringAuthority === 'NONE'));
  assert.ok(rows.every((row) => row.screeningAuthority === 'NOT_AUTHORIZED'));
  assert.equal(receipt.qualificationStatus, 'NOT_QUALIFIED');
  assert.equal(receipt.masterValuesPublished, false);
  assert.deepEqual(receipt.authority, {
    engineeringAuthority: 'NONE',
    screeningAuthority: 'NOT_AUTHORIZED',
    designAuthority: false,
  });
});
