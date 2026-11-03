import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SBC_T3_P0_SOURCE,
  assertSbcT3P0MasterPublicationQualified,
  combineSbcLof,
  qualifySbcT3P0SuppliedCandidate,
} from '../converters/vibration/sbc/t3-p0-source-gate.js';

function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const keys = header.split(',');
  return lines.map((line) => Object.fromEntries(
    line.split(',').map((value, index) => [keys[index], value]),
  ));
}

async function csv(path) {
  return parseCsv(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
}

const EXPECTED_FITTING_FACTORS = Object.freeze({
  SHORT_CONTOURED_BODY: 1.0,
  CONTOURED_BODY: 0.85,
  FORGED_REDUCING_TEE: 0.85,
  WELDED_TEE: 0.85,
  WELDOLET: 0.70,
  THREADOLET_FULLY_BACK_WELDED: 0.70,
  SCREWED_FULLY_BACK_WELDED: 0.70,
  THREADOLET: 0.65,
  SCREWED: 0.65,
  SOCKOLET: 0.65,
  THREADOLET_PARTIALLY_BACK_WELDED: 0.60,
  SCREWED_PARTIALLY_BACK_WELDED: 0.60,
  SET_ON: 0.55,
  SET_IN: 0.55,
  SET_THRU: 0.55,
});

const EXPECTED_FIRST_SPAN = Object.freeze([
  [0.25, 0.7], [0.375, 0.8], [0.5, 0.8], [0.75, 0.9],
  [1, 1.1], [1.25, 1.2], [1.5, 1.3], [2, 1.4],
]);

const EXPECTED_BETWEEN_MAIN = Object.freeze([
  [0.25, 1.0], [0.375, 1.1], [0.5, 1.1], [0.75, 1.3],
  [1, 1.6], [1.25, 1.7], [1.5, 1.8], [2, 2.0],
]);

function numericPairs(rows, xKey, yKey) {
  return rows.map((row) => [Number(row[xKey]), Number(row[yKey])]);
}

test('pins the exact user-supplied Advanced_Analysis P0 source objects', () => {
  assert.equal(SBC_T3_P0_SOURCE.commit, '6111ddbc0f27dd95b50a80c569a2c4daba3b3921');
  assert.equal(SBC_T3_P0_SOURCE.p0BlobSha1, '5312c9e2cf86af9e940ba722fcbee64702aeccd3');
  assert.equal(SBC_T3_P0_SOURCE.examplesBlobSha1, 'c050cd90802c27241c510c6f0ac43bfaf7a89e9d');
});

test('current T3-1 fitting-factor candidate matches all supplied P0 table rows', async () => {
  const rows = await csv('docs/Masters/Vibration/ei-aviff-t3-sbc-fitting-span-factors.candidate.csv');
  assert.equal(rows.length, 15);
  assert.deepEqual(
    Object.fromEntries(rows.map((row) => [row.fittingKey, Number(row.fittingSpanFactor)])),
    EXPECTED_FITTING_FACTORS,
  );
});

test('current T3-2 and T3-3 span candidates match the supplied P0 tables', async () => {
  const first = await csv('docs/Masters/Vibration/ei-aviff-t3-sbc-first-span-limits.candidate.csv');
  const between = await csv('docs/Masters/Vibration/ei-aviff-t3-sbc-between-main-lines-limits.candidate.csv');
  assert.deepEqual(numericPairs(first, 'sbcSize_in', 'minimumAllowableFirstSpan_m'), EXPECTED_FIRST_SPAN);
  assert.deepEqual(numericPairs(between, 'sbcSize_in', 'minimumSpanBetweenMainLines_m'), EXPECTED_BETWEEN_MAIN);
});

test('worked examples prove min(main-line x 1.42, SBC modifier), not product', () => {
  assert.equal(combineSbcLof(1.0, 1.42, 0.66), 0.66); // D5
  assert.ok(Math.abs(combineSbcLof(0.49, 1.42, 0.7) - 0.6958) < 1e-12); // D6 ~= 0.696
  assert.equal(combineSbcLof(1.0, 1.42, 0.7), 0.7); // D7
});

test('supplied T3 curve pack fails independent D7 curve-reading oracles', () => {
  const qualification = qualifySbcT3P0SuppliedCandidate();
  assert.equal(qualification.curveQualification, 'FAIL');
  assert.equal(qualification.masterPublicationAuthorized, false);
  assert.equal(qualification.publicationState, 'BLOCKED_SOURCE_DATA_CONFLICT');
  assert.deepEqual(
    qualification.curveChecks.map(({ id, expectedLof, actualLof, status }) => (
      { id, expectedLof, actualLof, status }
    )),
    [
      { id: 'D7-T3-1', expectedLof: 0.2, actualLof: 0.4, status: 'FAIL' },
      { id: 'D7-T3-3', expectedLof: 0.6, actualLof: 0.7, status: 'FAIL' },
      { id: 'D7-T3-4', expectedLof: 0.2, actualLof: 0.3, status: 'FAIL' },
    ],
  );
});

test('fail-closed publication assertion exposes the qualification receipt', () => {
  assert.throws(
    () => assertSbcT3P0MasterPublicationQualified(),
    (error) => error?.code === 'SBC_T3_P0_MASTER_NOT_QUALIFIED'
      && error?.qualification?.masterPublicationAuthorized === false,
  );
});
