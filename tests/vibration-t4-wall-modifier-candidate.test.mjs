import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const CSV_PATH = new URL(
  '../docs/Masters/Vibration/ei-aviff-t4-wall-modifier.candidate.csv',
  import.meta.url,
);
const RECEIPT_PATH = new URL(
  '../ValidationRecords/VibrationMasters/ei-aviff-t4-wall-modifier-candidate-v1.json',
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

function resolveFm(rows, scheduleBand, has4WayGussets) {
  const row = rows.find((candidate) => candidate.scheduleBand === scheduleBand);
  if (!row) return { status: 'NOT_READY' };
  const key = has4WayGussets ? 'FMWith4WayWeldedGussets' : 'FM';
  return { status: 'READY', FM: Number(row[key]) };
}

test('T4 candidate contains exactly the four Table T4-1 schedule bands', () => {
  const rows = readRows();
  assert.deepEqual(
    rows.map(({ scheduleBand, FM, FMWith4WayWeldedGussets }) => [
      scheduleBand, Number(FM), Number(FMWith4WayWeldedGussets),
    ]),
    [
      ['SCHEDULE_160_OR_GREATER', 0.96, 0.98],
      ['SCHEDULE_80_TO_LT_160', 0.93, 0.96],
      ['SCHEDULE_40_TO_LT_80', 0.85, 0.93],
      ['LESS_THAN_SCHEDULE_40', 0.42, 0.85],
    ],
  );
});

test('four-way welded gusset values are selected explicitly, never by interpolation', () => {
  const rows = readRows();
  assert.deepEqual(resolveFm(rows, 'SCHEDULE_80_TO_LT_160', false),
    { status: 'READY', FM: 0.93 });
  assert.deepEqual(resolveFm(rows, 'SCHEDULE_80_TO_LT_160', true),
    { status: 'READY', FM: 0.96 });
});

test('unknown schedule band fails closed', () => {
  const rows = readRows();
  assert.deepEqual(resolveFm(rows, 'SCHEDULE_STD', false), { status: 'NOT_READY' });
  assert.deepEqual(resolveFm(rows, '', true), { status: 'NOT_READY' });
});

test('worked thermowell example independently selects less-than-Schedule-40 FM 0.42', () => {
  const receipt = readReceipt();
  const example = receipt.independentEiCorroboration.workedExample;
  assert.ok(example.actualWallThickness_mm < example.schedule40WallThickness_mm);
  assert.equal(example.scheduleBand, 'LESS_THAN_SCHEDULE_40');
  assert.deepEqual(resolveFm(readRows(), example.scheduleBand, false),
    { status: 'READY', FM: 0.42 });
});

test('candidate remains non-published and carries no engineering authority', () => {
  const rows = readRows();
  const receipt = readReceipt();
  assert.ok(rows.every((row) => row.publicationState === 'CANDIDATE'));
  assert.equal(receipt.lookupBehavior.interpolationForbidden, true);
  assert.equal(receipt.lookupBehavior.nearestBandFallbackForbidden, true);
  assert.equal(receipt.reconciliation.status, 'CONTROLLED_SOURCE_RECONCILIATION_REQUIRED');
  assert.equal(receipt.qualificationStatus, 'NOT_QUALIFIED');
  assert.equal(receipt.masterValuesPublished, false);
  assert.deepEqual(receipt.authority, {
    engineeringAuthority: 'NONE',
    screeningAuthority: 'NOT_AUTHORIZED',
    designAuthority: false,
  });
});
