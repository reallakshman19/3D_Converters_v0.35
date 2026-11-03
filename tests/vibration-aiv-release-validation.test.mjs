import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AIV_RELEASE_VALIDATION_RECEIPT_SCHEMA,
  createAivReleaseValidationTemplate,
  verifyAivReleaseValidationRecord,
} from '../converters/vibration/aiv/aiv-release-validation.js';

const HEAD = '1'.repeat(40);
const SHA = `sha256:${'b'.repeat(64)}`;

function completedRecord(target = 'BENCHMARK_ONLY', source = 'LOCAL_CONTROLLED_CHECKOUT') {
  const template = structuredClone(createAivReleaseValidationTemplate({
    releaseTarget: target,
    exactHeadSha: HEAD,
  }));
  template.execution = {
    source,
    actualExecution: true,
    runnerId: source === 'CI_RUNNER' ? 123 : null,
    runnerName: source === 'CI_RUNNER' ? 'github-hosted-runner' : null,
    environment: 'node-22 / chromium / exact checkout',
    startedAt: '2026-08-12T16:00:00Z',
    completedAt: '2026-08-12T16:05:00Z',
  };
  template.checks = template.checks.map((check) => ({
    ...check,
    status: 'PASS',
    command: `verify ${check.groupId}`,
    exitCode: 0,
    outputSha256: SHA,
    notes: 'synthetic contract fixture',
  }));
  return template;
}

test('BENCHMARK_ONLY validation requires four actually executed validation groups', () => {
  const receipt = verifyAivReleaseValidationRecord(completedRecord(), { expectedHeadSha: HEAD });
  assert.equal(receipt.schema, AIV_RELEASE_VALIDATION_RECEIPT_SCHEMA);
  assert.equal(receipt.releaseTarget, 'BENCHMARK_ONLY');
  assert.equal(receipt.status, 'PASS');
  assert.equal(receipt.exactHeadValidated, true);
  assert.equal(receipt.validationGroupCount, 4);
  assert.equal(receipt.authorityTransitionApplied, false);
  assert.equal(receipt.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(receipt.designAuthority, false);
});

test('runner_id=0 and empty runner name cannot satisfy CI release validation', () => {
  const record = completedRecord('BENCHMARK_ONLY', 'CI_RUNNER');
  record.execution.runnerId = 0;
  record.execution.runnerName = '';
  assert.throws(
    () => verifyAivReleaseValidationRecord(record),
    (error) => error.code === 'AIV_RELEASE_VALIDATION_CI_RUNNER_REQUIRED',
  );
});

test('NOT_RUN evidence cannot satisfy release validation', () => {
  const record = completedRecord();
  record.execution.actualExecution = false;
  assert.throws(
    () => verifyAivReleaseValidationRecord(record),
    (error) => error.code === 'AIV_RELEASE_VALIDATION_NOT_RUN',
  );
});

test('exact-head mismatch fails closed', () => {
  assert.throws(
    () => verifyAivReleaseValidationRecord(completedRecord(), { expectedHeadSha: '2'.repeat(40) }),
    (error) => error.code === 'AIV_RELEASE_VALIDATION_HEAD_MISMATCH',
  );
});

test('missing or failed validation group cannot produce a receipt', () => {
  const record = completedRecord();
  record.checks[1].status = 'FAIL';
  record.checks[1].exitCode = 1;
  assert.throws(
    () => verifyAivReleaseValidationRecord(record),
    (error) => error.code === 'AIV_RELEASE_VALIDATION_CHECK_NOT_PASS',
  );
});

test('SCREENING validation requires the expanded eight-group release set', () => {
  const receipt = verifyAivReleaseValidationRecord(completedRecord('SCREENING'));
  assert.equal(receipt.validationGroupCount, 8);
  assert.equal(receipt.releaseTarget, 'SCREENING');
  assert.equal(receipt.designAuthority, false);
});
