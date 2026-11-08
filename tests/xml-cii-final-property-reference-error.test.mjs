import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  finalRigidWeightErrorPercent, classifyFinalRigidWeightError,
  formatFinalRigidErrorPercent,
} from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-weight-error.js';

test('edited final RIGID weight errors use signed difference and reference', () => {
  assert.equal(finalRigidWeightErrorPercent(430, 400), 7.5);
  assert.equal(finalRigidWeightErrorPercent(350, 400), -12.5);
  assert.equal(formatFinalRigidErrorPercent(finalRigidWeightErrorPercent(350, 400)), '-12.5%');
  assert.equal(formatFinalRigidErrorPercent(finalRigidWeightErrorPercent(430, 400)), '+7.5%');
  for (const missing of [null, undefined, '', 'abc', 0, -1, NaN]) {
    assert.equal(finalRigidWeightErrorPercent(350, missing), null);
  }
  assert.equal(formatFinalRigidErrorPercent(null), '—');
  // Change the reference without altering the actual edited weight.
  const edited = 350;
  assert.equal(finalRigidWeightErrorPercent(edited, 500), -30);
  assert.equal(edited, 350);
});

test('threshold boundaries ±50% and ±60% are review-only, never correction', () => {
  assert.deepEqual(classifyFinalRigidWeightError(600, 400, 50), { errorPct: 50, outside: false });
  assert.deepEqual(classifyFinalRigidWeightError(200, 400, 50), { errorPct: -50, outside: false });
  assert.equal(classifyFinalRigidWeightError(600.4, 400, 50).outside, true);
  assert.equal(classifyFinalRigidWeightError(199.6, 400, 50).outside, true);
  assert.deepEqual(classifyFinalRigidWeightError(640, 400, 60), { errorPct: 60, outside: false });
  assert.deepEqual(classifyFinalRigidWeightError(160, 400, 60), { errorPct: -60, outside: false });
  assert.equal(classifyFinalRigidWeightError(640.4, 400, 60).outside, true);
  assert.equal(classifyFinalRigidWeightError(159.6, 400, 60).outside, true);
});
