import assert from 'node:assert/strict';
import {
  computeAdversarialManifestSha256,
  validateAdversarialMutationManifest,
} from '../../tabs/model-converters/converters/fbx/benchmark-audit/adversarial-manifest.js';

const sha256 = 'f'.repeat(64);
function mutation(mutationId, targetPopulation = 'SUPPORT', expectedLedgerState = 'TYPE_MISMATCH') {
  return { mutationId, targetPopulation, targetOccurrenceIdentity: 'support:1', dimension: 'support class',
    operator: 'replace', parameters: { value: 'GUIDE' }, expectedDetector: 'support comparator',
    expectedLedgerState, expectedGate: 'B4', expectedSummaryStatus: 'FAIL', mustPreserveOtherDimensions: true };
}
function unsignedManifest() {
  return { schema: 'FbxAdversarialMutationManifest.v2', manifestId: 'agent-q-core',
    baseBenchmarkIdentitySha256: sha256, baseActualIdentitySha256: sha256,
    baseEvidenceSha256: sha256, mutationGenerationPolicy: 'immutable-copy-on-write',
    mutations: [mutation('M-002'), mutation('M-001')] };
}
function manifest() {
  const value = unsignedManifest();
  const normalizedForHash = { ...value, mutations: [...value.mutations].sort((a, b) => a.mutationId.localeCompare(b.mutationId)) };
  return { ...value, canonicalSha256: computeAdversarialManifestSha256(normalizedForHash) };
}

const normalized = validateAdversarialMutationManifest(manifest());
assert.deepEqual(normalized.mutations.map((item) => item.mutationId), ['M-001', 'M-002']);
assert.ok(Object.isFrozen(normalized));
const wrongHash = manifest();
wrongHash.canonicalSha256 = '0'.repeat(64);
assert.throws(() => validateAdversarialMutationManifest(wrongHash), /BLOCKED_AUDIT_IDENTITY/);
const changedContent = manifest();
changedContent.mutations[0].dimension = 'tampered';
assert.throws(() => validateAdversarialMutationManifest(changedContent), /BLOCKED_AUDIT_IDENTITY/);

const duplicate = manifest();
duplicate.mutations = [mutation('M-001'), mutation('M-001')];
assert.throws(() => validateAdversarialMutationManifest(duplicate), /BLOCKED_AUDIT_IDENTITY/);
const unknownPopulation = manifest();
unknownPopulation.mutations = [mutation('M-001', 'ZONE_MEMBERSHIP', 'CONFLICT')];
assert.throws(() => validateAdversarialMutationManifest(unknownPopulation), /BLOCKED_AUDIT_VOCABULARY/);
const unknownState = manifest();
unknownState.mutations = [mutation('M-001', 'SUPPORT', 'DIAGNOSTIC_MATCH')];
assert.throws(() => validateAdversarialMutationManifest(unknownState), /BLOCKED_AUDIT_VOCABULARY/);
const invalidSummary = manifest();
invalidSummary.mutations[0].expectedSummaryStatus = 'SUCCESS';
assert.throws(() => validateAdversarialMutationManifest(invalidSummary), /BLOCKED_AUDIT_VOCABULARY/);
console.log('test-benchmark-adversarial-manifest: PASS');
