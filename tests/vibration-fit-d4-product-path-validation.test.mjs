import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIT_D4_PRODUCT_PATH_BENCHMARK_ID,
  FIT_D4_PRODUCT_PATH_RECEIPT_SCHEMA,
  runFitD4ProductPathValidation,
} from '../scripts/run-fit-d4-product-path-validation.mjs';

test('EI D4 produced-water example qualifies the bounded FIT app screening path end to end', () => {
  const receipt = runFitD4ProductPathValidation();
  assert.equal(receipt.schema, FIT_D4_PRODUCT_PATH_RECEIPT_SCHEMA);
  assert.equal(receipt.benchmarkId, FIT_D4_PRODUCT_PATH_BENCHMARK_ID);
  assert.equal(receipt.releaseTarget, 'SCREENING');
  assert.equal(receipt.status, 'PASS', JSON.stringify(receipt, null, 2));
  assert.equal(receipt.counts.checks, 24);
  assert.equal(receipt.counts.failed, 0);
  assert.equal(receipt.authority.engineeringAuthority, 'SCREENING');
  assert.equal(receipt.authority.screeningAuthorized, true);
  assert.equal(receipt.authority.designAuthority, false);
  assert.equal(receipt.resultSnapshot.supportCategory, 'FLEXIBLE_LARGE');
  assert.equal(receipt.resultSnapshot.referenceBand, 'LOF_GE_1');
  assert.equal(receipt.resultSnapshot.continuationRequired, true);
  assert.equal(
    receipt.resultSnapshot.screeningCandidateStatus,
    'QUALIFIED_BOUNDED_SCREENING_FURTHER_ASSESSMENT_REQUIRED',
  );
});
