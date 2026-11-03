import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const FILES = {
  geometry: 'docs/Masters/Vibration/ei-aviff-t3-sbc-geometry-scores.candidate.csv',
  location: 'docs/Masters/Vibration/ei-aviff-t3-sbc-location-scores.candidate.csv',
  factors: 'docs/Masters/Vibration/ei-aviff-t3-sbc-fitting-span-factors.candidate.csv',
  first: 'docs/Masters/Vibration/ei-aviff-t3-sbc-first-span-limits.candidate.csv',
  between: 'docs/Masters/Vibration/ei-aviff-t3-sbc-between-main-lines-limits.candidate.csv',
  receipt: 'ValidationRecords/VibrationMasters/ei-aviff-t3-sbc-non-curve-candidate-v1.json',
};

function readCsv(path) {
  const lines = readFileSync(new URL(path, ROOT), 'utf8').trim().split('\n');
  const headers = lines.shift().split(',');
  return lines.map((line) => Object.fromEntries(
    line.split(',').map((value, index) => [headers[index], value]),
  ));
}

function readReceipt() {
  return JSON.parse(readFileSync(new URL(FILES.receipt, ROOT), 'utf8'));
}

function byKey(rows, dimension, key) {
  return rows.find((row) => row.dimension === dimension && row.key === key);
}

function score(rows, dimension, key) {
  const row = byKey(rows, dimension, key);
  assert.ok(row, `missing ${dimension}/${key}`);
  return Number(row.score);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function factor(rows, key) {
  const row = rows.find((candidate) => candidate.fittingKey === key);
  assert.ok(row, `missing fitting factor ${key}`);
  return Number(row.fittingSpanFactor);
}

function spanLimit(rows, size, field) {
  const row = rows.find((candidate) => Number(candidate.sbcSize_in) === size);
  assert.ok(row, `missing span size ${size}`);
  return Number(row[field]);
}

test('Flowchart T3-3 geometry candidate contains the exact 35 source rows', () => {
  const rows = readCsv(FILES.geometry);
  assert.equal(rows.length, 35);
  assert.equal(score(rows, 'FITTING_TYPE', 'SHORT_CONTOURED_BODY'), 0.4);
  assert.equal(score(rows, 'FITTING_TYPE', 'SET_THRU'), 1.3);
  assert.equal(score(rows, 'BRANCH_LENGTH_MM', 'GT_400_LE_600_MM'), 0.7);
  assert.equal(score(rows, 'VALVE_FLANGE_BELOW_ANSI_900', 'ONE_VALVE_OR_INTEGRAL_DBB'), 0.5);
  assert.equal(score(rows, 'VALVE_FLANGE_ANSI_900_OR_GREATER', 'ONE_OR_MORE_VALVES'), 0.9);
  assert.equal(score(rows, 'PARENT_PIPE_SCHEDULE', '80'), 0.5);
  assert.equal(score(rows, 'SBC_MIN_DIAMETER_IN', '1'), 0.7);
});

test('D.5 independently reproduces LOFGEOM 0.66 using the lower schedule rule', () => {
  const rows = readCsv(FILES.geometry);
  const lofGeom = mean([
    score(rows, 'FITTING_TYPE', 'WELDOLET'),
    score(rows, 'BRANCH_LENGTH_MM', 'GT_400_LE_600_MM'),
    score(rows, 'VALVE_FLANGE_BELOW_ANSI_900', 'ONE_VALVE_OR_INTEGRAL_DBB'),
    score(rows, 'PARENT_PIPE_SCHEDULE', '80'),
    score(rows, 'SBC_MIN_DIAMETER_IN', '1'),
  ]);
  assert.ok(Math.abs(lofGeom - 0.66) < 1e-12);
});

test('Flowchart T3-9 location candidate retains exact location scores and D.6 mean', () => {
  const rows = readCsv(FILES.location);
  assert.equal(rows.length, 13);
  assert.equal(score(rows, 'LOCATION', 'BEND'), 0.9);
  assert.equal(score(rows, 'LOCATION', 'FIXED_SUPPORT'), 0.1);
  assert.equal(score(rows, 'LOCATION', 'MID_SPAN'), 0.7);
  assert.equal(byKey(rows, 'LOCATION', 'FIXED_SUPPORT').closeWithinMainPipeDiameters, '2');
  const lofLoc = mean([
    score(rows, 'LOCATION', 'BEND'),
    score(rows, 'PARENT_PIPE_SCHEDULE', '40'),
  ]);
  assert.equal(lofLoc, 0.8);
});

test('Table T3-1 fitting span factors are copied exactly', () => {
  const rows = readCsv(FILES.factors);
  assert.equal(rows.length, 15);
  assert.equal(factor(rows, 'SHORT_CONTOURED_BODY'), 1);
  assert.equal(factor(rows, 'WELDOLET'), 0.7);
  assert.equal(factor(rows, 'SOCKOLET'), 0.65);
  assert.equal(factor(rows, 'SET_ON'), 0.55);
});

test('Tables T3-2 and T3-3 span-limit rows are copied exactly', () => {
  const first = readCsv(FILES.first);
  const between = readCsv(FILES.between);
  assert.equal(first.length, 8);
  assert.equal(between.length, 8);
  assert.equal(spanLimit(first, 0.25, 'minimumAllowableFirstSpan_m'), 0.7);
  assert.equal(spanLimit(first, 2, 'minimumAllowableFirstSpan_m'), 1.4);
  assert.equal(spanLimit(between, 0.25, 'minimumSpanBetweenMainLines_m'), 1);
  assert.equal(spanLimit(between, 2, 'minimumSpanBetweenMainLines_m'), 2);
});

test('D.7 and D.8 retain the modified minimum-span dispositions', () => {
  const factors = readCsv(FILES.factors);
  const first = readCsv(FILES.first);
  const between = readCsv(FILES.between);
  const fittingFactor = factor(factors, 'WELDOLET');
  const d7Modified = 0.9 * fittingFactor;
  const d8Modified = 3.0 * fittingFactor;
  assert.ok(Math.abs(d7Modified - 0.63) < 1e-12);
  assert.ok(d7Modified < spanLimit(first, 1.5, 'minimumAllowableFirstSpan_m'));
  assert.ok(Math.abs(d8Modified - 2.1) < 1e-12);
  assert.ok(d8Modified >= spanLimit(between, 2, 'minimumSpanBetweenMainLines_m'));
  assert.deepEqual({ d7: 0.7, d8: 0.2 }, { d7: 0.7, d8: 0.2 });
});

test('curves stay excluded and candidate authority remains fail-closed', () => {
  const receipt = readReceipt();
  assert.deepEqual(receipt.spanRules.curveFiguresExcluded, ['T3-1', 'T3-2', 'T3-3', 'T3-4']);
  assert.equal(receipt.spanRules.curveDataIncluded, false);
  assert.equal(receipt.projectWorkbookAudit.status, 'NOT_USED_AS_EI_SOURCE');
  assert.equal(receipt.geometryRules.unknownGeometry, 'NOT_READY');
  assert.equal(receipt.locationRules.unknownLocation, 'NOT_READY');
  assert.equal(receipt.reconciliation.status, 'CONTROLLED_SOURCE_RECONCILIATION_REQUIRED');
  assert.equal(receipt.publicationState, 'CANDIDATE');
  assert.equal(receipt.qualificationStatus, 'NOT_QUALIFIED');
  assert.equal(receipt.masterValuesPublished, false);
  assert.deepEqual(receipt.authority, {
    engineeringAuthority: 'NONE',
    screeningAuthority: 'NOT_AUTHORIZED',
    designAuthority: false,
  });
});
