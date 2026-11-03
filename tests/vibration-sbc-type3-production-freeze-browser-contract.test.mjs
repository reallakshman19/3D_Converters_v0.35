import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = (path) => readFileSync(`${root}/${path}`, 'utf8');
const harness = source('scripts/validate-vibration-sbc-type3-production-freeze-browser.mjs');
const fixture = source('scripts/vibration-sbc-type3-browser-fixture.mjs');

test('PF-006 browser harness is a dedicated two-facility SBC journey', () => {
  assert.match(harness, /SBC_TYPE3_TWO_FACILITY_USER_JOURNEY/u);
  assert.match(fixture, /EI-D2-FIT-RELIEF-UPSTREAM-4IN/u);
  assert.match(fixture, /EI-D2-FIT-RECYCLE-SUCTION-6IN/u);
  assert.match(harness, /Ready\\s\+2/u);
  assert.match(harness, /Not ready\\s\+0/u);
  assert.match(harness, /data-vi-file="topology"/u);
  assert.match(harness, /data-vi-action="run"/u);
});

test('PF-006 locks the D7 oracle and manual exact-curve evidence coordinates', () => {
  for (const fragment of [
    'c: 0.68', 'd: 0.20', 'e: 0.70', 'f: 0.60', 'g: 0.20',
    'firstLocationLof: 1.00', 'multiplier: 1.42', 'lof: 0.70',
    "branchLengthMm: '700'", "sbcMinDiameterIn: '1.5'",
    "firstSpanLengthM: '0.9'", "subsequentMassSpanM: '2.3'",
    "subsequentNoMassSpanM: '1.4'",
  ]) assert.ok(fixture.includes(fragment), `Missing D7 fragment ${fragment}`);
  assert.match(fixture, /closeEnough\(y, 0\.9 \/ 0\.7\)/u);
  assert.match(fixture, /closeEnough\(y, 2\.3\)/u);
  assert.match(fixture, /closeEnough\(y, 1\.4\)/u);
  assert.match(fixture, /sourceReference/u);
});

test('PF-006 proves wrong-scope, edit invalidation and stale async semantics in Chromium', () => {
  assert.match(harness, /INVALID_PRECOMPUTED_CANDIDATE/u);
  assert.match(harness, /FACILITY_SCOPE_MISMATCH/u);
  assert.match(harness, /STALE · RERUN REQUIRED/u);
  assert.match(harness, /FIGURE_T3_1/u);
  assert.match(harness, /sameTaskAsyncRace\(page, 702\)/u);
  assert.match(fixture, /data-vi-sbc-master-evaluate/u);
  assert.match(fixture, /dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/u);
});

test('PF-006 preserves authority and curve-quarantine visibility', () => {
  assert.match(harness, /FIT\\s\*·\\s\*\[0-9\.\]\+/u);
  assert.match(harness, /SBC\\s\*·\\s\*0\\\.7\\s\*·\\s\*CANDIDATE/u);
  assert.match(fixture, /BLOCKED SOURCE DATA/u);
  assert.match(fixture, /SBC CANDIDATE · NOT SCREENING AUTHORITY/u);
  assert.equal(fixture.includes('runtimeCurveActivation: true'), false);
  assert.equal(fixture.includes('masterPublicationAuthorized: true'), false);
});

test('PF-006 produces durable screenshots and JSON receipt', () => {
  for (const name of [
    '01-two-facility-screening.png',
    '02-facility-a-d7.png',
    '03-facility-b-d7.png',
    '04-two-facility-authority.png',
    '05-stale-race-isolation.png',
    '99-failure.png',
    'sbc-type3-production-freeze-receipt.json',
  ]) assert.ok(harness.includes(name), `Missing artifact ${name}`);
  assert.match(harness, /assert\.deepEqual\(errors, \[\]/u);
});
