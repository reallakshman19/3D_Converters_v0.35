import assert from 'node:assert/strict';
import { buildReviewBundle, calculateBundleId } from '../../tabs/model-converters/converters/fbx/mapping-review-bundle.js';
import { assembleFragments } from '../../tabs/model-converters/converters/fbx/mapping-fragment-assembler.js';
import { worklistFixture } from './worklist-helpers.mjs';
import { calculateFragmentId } from '../../tabs/model-converters/converters/fbx/mapping-decision-fragment.js';
import { runAssemblerRegressions } from './mapping-fragment-assembler-regressions.mjs';

const family = await worklistFixture('family');
const { bundle, shards } = await buildReviewBundle(family.worklist, 2);
const workItemsById = new Map(family.worklist.workItems.map((w) => [w.workItemId, w]));

// Build a valid exclude-with-reason fragment for a given shard
async function createFragment(shard) {
  const fragment = {
    schema: 'FbxMappingDecisionFragment.v1',
    bundleId: shard.bundleId,
    worklistId: shard.worklistId,
    sourceGraphCanonicalSha256: shard.sourceGraphCanonicalSha256,
    shardId: shard.shardId,
    decisions: shard.workItems.map((item) => ({
      workItemId: item.workItemId,
      disposition: 'exclude-with-reason',
      reason: 'automated test',
    })),
    fragmentId: '0'.repeat(64),
  };
  fragment.fragmentId = await calculateFragmentId(fragment);
  return fragment;
}

// Clone bundle, mutate a field, then recalculate bundleId so the bundleId
// check passes and the shard reconstruction checks are tested in isolation.
async function mutateBundle(mutate) {
  const b = structuredClone(bundle);
  mutate(b);
  b.bundleId = await calculateBundleId(b);
  return b;
}

const fragments = await Promise.all(shards.map(createFragment));
const firstWorkItemId = fragments[0].decisions[0].workItemId;
const firstItem = workItemsById.get(firstWorkItemId);

// Test 1: Successful assembly
const decisionSet = await assembleFragments(family.worklist, bundle, fragments);
assert.equal(decisionSet.schema, 'FbxMappingDecisionSet.v1');
assert.equal(decisionSet.decisions.length, family.worklist.workItems.length);

// Test 2: Missing fragment
try {
  await assembleFragments(family.worklist, bundle, [fragments[0]]);
  assert.fail('Should block missing shards');
} catch (error) {
  assert.equal(error.status, 'BLOCKED_FRAGMENT_COVERAGE');
}

// Test 3: Duplicate fragment
try {
  await assembleFragments(family.worklist, bundle, [...fragments, fragments[0]]);
  assert.fail('Should block duplicate shards');
} catch (error) {
  assert.equal(error.status, 'BLOCKED_FRAGMENT_CONFLICT');
}

// Test 4: Missing decisions in fragment
const incompleteFragment = structuredClone(fragments[0]);
incompleteFragment.decisions.pop();
incompleteFragment.fragmentId = await calculateFragmentId(incompleteFragment);
try {
  await assembleFragments(family.worklist, bundle, [incompleteFragment, ...fragments.slice(1)]);
  assert.fail('Should block partial fragment coverage');
} catch (error) {
  assert.equal(error.status, 'BLOCKED_FRAGMENT_COVERAGE');
}

// Helper: create promote fragment for shard 0 with a custom mappingEntry on the first decision
async function promoteFragment(entry) {
  const f = structuredClone(fragments[0]);
  f.decisions[0] = { workItemId: firstWorkItemId, disposition: 'promote', mappingEntry: entry };
  f.fragmentId = await calculateFragmentId(f);
  return f;
}

// Test 5: Identity tampering — sourceModelObjectId
try {
  const f = await promoteFragment({ sourceModelObjectId: 'tampered-id', sourceOccurrenceId: firstItem.sourceOccurrenceId, sourceGeometryObjectIds: firstItem.sourceGeometryObjectIds.slice() });
  await assembleFragments(family.worklist, bundle, [f, ...fragments.slice(1)]);
  assert.fail('Should block tampered sourceModelObjectId');
} catch (error) {
  assert.equal(error.status, 'BLOCKED_ASSEMBLER_IDENTITY_TAMPERING');
}

// Test 6: Identity tampering — sourceOccurrenceId
try {
  const f = await promoteFragment({ sourceModelObjectId: firstItem.sourceModelObjectId, sourceOccurrenceId: 'occ:99999', sourceGeometryObjectIds: firstItem.sourceGeometryObjectIds.slice() });
  await assembleFragments(family.worklist, bundle, [f, ...fragments.slice(1)]);
  assert.fail('Should block tampered sourceOccurrenceId');
} catch (error) {
  assert.equal(error.status, 'BLOCKED_ASSEMBLER_IDENTITY_TAMPERING');
}

// Test 7: Identity tampering — sourceGeometryObjectIds
try {
  const f = await promoteFragment({ sourceModelObjectId: firstItem.sourceModelObjectId, sourceOccurrenceId: firstItem.sourceOccurrenceId, sourceGeometryObjectIds: ['99999'] });
  await assembleFragments(family.worklist, bundle, [f, ...fragments.slice(1)]);
  assert.fail('Should block tampered sourceGeometryObjectIds');
} catch (error) {
  assert.equal(error.status, 'BLOCKED_ASSEMBLER_IDENTITY_TAMPERING');
}

// Test 8: Duplicate shardIds in bundle manifest
try {
  const b = await mutateBundle((b) => { b.shards[1].shardId = b.shards[0].shardId; });
  await assembleFragments(family.worklist, b, fragments);
  assert.fail('Should block duplicate shardId in manifest');
} catch (error) {
  assert.equal(error.status, 'BLOCKED_ASSEMBLER_BINDING');
}

// Test 9: Wrong source-graph digest in bundle
try {
  const b = await mutateBundle((b) => { b.sourceGraphCanonicalSha256 = '0'.repeat(64); });
  await assembleFragments(family.worklist, b, fragments);
  assert.fail('Should block wrong source-graph digest');
} catch (error) {
  assert.equal(error.status, 'BLOCKED_ASSEMBLER_BINDING');
}

// Test 10: Shard ordinal tampered in manifest
try {
  const b = await mutateBundle((b) => { b.shards[0].ordinal = 999; });
  await assembleFragments(family.worklist, b, fragments);
  assert.fail('Should block tampered shard ordinal');
} catch (error) {
  assert.equal(error.status, 'BLOCKED_ASSEMBLER_BINDING');
}

// Test 11: Shard firstWorkItemId tampered
try {
  const b = await mutateBundle((b) => { b.shards[0].firstWorkItemId = 'work-' + '0'.repeat(64); });
  await assembleFragments(family.worklist, b, fragments);
  assert.fail('Should block tampered shard boundary');
} catch (error) {
  assert.equal(error.status, 'BLOCKED_ASSEMBLER_BINDING');
}

// Test 12: Shard canonicalSha256 tampered
try {
  const b = await mutateBundle((b) => { b.shards[0].canonicalSha256 = '0'.repeat(64); });
  await assembleFragments(family.worklist, b, fragments);
  assert.fail('Should block tampered shard canonicalSha256');
} catch (error) {
  assert.equal(error.status, 'BLOCKED_ASSEMBLER_BINDING');
}

// Test 13: Permutation equivalence — reversed decision order produces the same fragmentId
const reversed = structuredClone(fragments[0]);
reversed.decisions = [...reversed.decisions].reverse();
const reversedId = await calculateFragmentId(reversed);
assert.equal(fragments[0].fragmentId, reversedId, 'Fragment hash must be order-invariant');

await runAssemblerRegressions({ family, bundle, shards, fragments });

console.log('test-mapping-fragment-assembler: PASS');
