import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AIV_KERNEL_CANDIDATE_PARITY_SCHEMA,
  buildAivKernelCandidateParity,
} from '../scripts/build-aiv-kernel-candidate-parity.mjs';

test('candidate stages 1 through 7 match the isolated qualification solve', () => {
  const manifest = buildAivKernelCandidateParity();
  assert.equal(manifest.schema, AIV_KERNEL_CANDIDATE_PARITY_SCHEMA);
  assert.equal(manifest.status, 'CANDIDATE_PARITY_PASS');
  assert.deepEqual(manifest.counts, { total: 8, passed: 8, failed: 0 });
  assert.equal(manifest.checks.every((check) => check.status === 'PASS'), true);
  assert.equal(manifest.candidateStatus.implementedStages.length, 7);
  assert.equal(manifest.blockedStages.length, 3);
  assert.equal(manifest.authority.productionEquationAuthorized, false);
  assert.equal(manifest.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(manifest.authority.designAuthority, false);
});

test('candidate parity manifest retains controlled worked-example source identities', () => {
  const manifest = buildAivKernelCandidateParity();
  assert.equal(manifest.sourceIdentity.readableWorkedExample.commit, '8f243592d73ccf4790d9e308a311003ce7d8f5bb');
  assert.equal(manifest.sourceIdentity.readableWorkedExample.gitBlob, '9f22d92eba8bdf3b67adc25a4c77a7f7d7211da8');
  assert.equal(manifest.sourceIdentity.corroboratingPdf.gitBlob, '1ddef94f81bd30570d1b1f86b1d3e2acdcc17dec');
});
