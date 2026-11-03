import assert from 'node:assert/strict';
import { evaluateExactHeadEvidence, FBX_EXACT_HEAD_IDENTITY_FIELDS } from '../../tabs/model-converters/converters/fbx/benchmark-audit/exact-head-evidence.js';

const sha1 = 'a'.repeat(40);
const sha256 = 'b'.repeat(64);
function identity() {
  return Object.fromEntries(FBX_EXACT_HEAD_IDENTITY_FIELDS.map((field) => {
    if (['repositoryCommit', 'repositoryTree', 'benchmarkCommit', 'benchmarkBlobSha'].includes(field)) return [field, sha1];
    if (field === 'checkoutState') return [field, 'CLEAN'];
    if (field === 'benchmarkPath') return [field, 'Benchmarks/fbx BM/StaggedJsonBMforFBX'];
    if (field === 'benchmarkByteLength') return [field, 123];
    return [field, sha256];
  }));
}
function evidence() {
  const authority = identity();
  const observed = identity();
  return { schema: 'FbxExactHeadEvidence.v3', authority, observed, regressionStatus: 'PASS', determinismStatus: 'PASS' };
}

assert.equal(evaluateExactHeadEvidence(evidence()).status, 'PASS');
for (const field of FBX_EXACT_HEAD_IDENTITY_FIELDS) {
  if (field === 'checkoutState' || field === 'benchmarkPath' || field === 'benchmarkByteLength') continue;
  const candidate = evidence();
  candidate.observed[field] = field.endsWith('Sha256') ? 'c'.repeat(64) : 'c'.repeat(40);
  const result = evaluateExactHeadEvidence(candidate);
  assert.equal(result.status, 'FAIL', `${field} mismatch must fail`);
  assert.ok(result.failedCheckIds.includes(field), `${field} mismatch must be independently reported`);
}

const wrongHead = evidence();
wrongHead.observed.repositoryCommit = 'd'.repeat(40);
assert.ok(evaluateExactHeadEvidence(wrongHead).failedCheckIds.includes('repositoryCommit'));
const dirty = evidence();
dirty.observed.checkoutState = 'DIRTY';
assert.ok(evaluateExactHeadEvidence(dirty).failedCheckIds.includes('checkoutState:CLEAN'));
const repeatMismatch = evidence();
repeatMismatch.observed.run2EvidenceIndexSha256 = 'e'.repeat(64);
assert.ok(evaluateExactHeadEvidence(repeatMismatch).failedCheckIds.includes('repeatEvidenceIndexSha256'));

console.log('test-benchmark-exact-head-integrated-identities: PASS');
