import assert from 'node:assert/strict';
import { createDecisionSet } from '../../tabs/model-converters/converters/fbx/mapping-decision-compiler.js';
import { calculateFragmentId } from '../../tabs/model-converters/converters/fbx/mapping-decision-fragment.js';
import { assembleFragments } from '../../tabs/model-converters/converters/fbx/mapping-fragment-assembler.js';
import { calculateBundleId } from '../../tabs/model-converters/converters/fbx/mapping-review-bundle.js';

// Exercises fail-closed binding and decision validation through assembleFragments().
// Input is a valid worklist family, bundle, shards, and fragments; output is test
// assertions only. Failures are surfaced directly without fallback behavior.

async function assertStatus(expectedStatus, operation, message) {
  try {
    await operation();
    assert.fail(message);
  } catch (error) {
    assert.equal(error.status, expectedStatus, message);
  }
}

async function mutateBundle(bundle, mutate) {
  const changed = structuredClone(bundle);
  mutate(changed);
  changed.bundleId = await calculateBundleId(changed);
  return changed;
}

async function mutateFragment(fragment, mutate) {
  const changed = structuredClone(fragment);
  mutate(changed);
  changed.fragmentId = await calculateFragmentId(changed);
  return changed;
}

async function assertBundleBindingTamper(context, mutate, message) {
  const changed = await mutateBundle(context.bundle, mutate);
  await assertStatus(
    'BLOCKED_ASSEMBLER_BINDING',
    () => assembleFragments(context.family.worklist, changed, context.fragments),
    message,
  );
}

async function testStaleBundleId(context) {
  const changed = structuredClone(context.bundle);
  changed.bundleId = '0'.repeat(64);
  await assertStatus(
    'BLOCKED_ASSEMBLER_BINDING',
    () => assembleFragments(context.family.worklist, changed, context.fragments),
    'Should block stale bundleId',
  );
}

async function testPartitionPolicyAuthority(context) {
  const invalidId = await mutateBundle(context.bundle, (changed) => {
    changed.partitionPolicy.id = 'UNAUTHORIZED_POLICY';
  });
  await assertStatus(
    'BLOCKED_REVIEW_BUNDLE_CONTRACT',
    () => assembleFragments(context.family.worklist, invalidId, context.fragments),
    'Should block invalid partitionPolicy.id',
  );

  const invalidOrder = await mutateBundle(context.bundle, (changed) => {
    changed.partitionPolicy.orderingAuthority = 'ordinal';
  });
  await assertStatus(
    'BLOCKED_REVIEW_BUNDLE_CONTRACT',
    () => assembleFragments(context.family.worklist, invalidOrder, context.fragments),
    'Should block invalid orderingAuthority',
  );
}

async function testShardCountAuthority(context) {
  await assertBundleBindingTamper(context, (changed) => {
    changed.partitionPolicy.shardCount -= 1;
  }, 'Should block reduced shardCount');
  await assertBundleBindingTamper(context, (changed) => {
    changed.partitionPolicy.shardCount += 1;
  }, 'Should block excess shardCount');
}

async function testShardMetadataAuthority(context) {
  await assertBundleBindingTamper(context, (changed) => {
    changed.shards[0].lastWorkItemId = changed.shards[0].firstWorkItemId;
  }, 'Should block tampered lastWorkItemId');
  await assertBundleBindingTamper(context, (changed) => {
    changed.shards[0].workItemCount += 1;
  }, 'Should block tampered workItemCount');
  await assertBundleBindingTamper(context, (changed) => {
    changed.shards[0].fileName = 'shard-999.json';
  }, 'Should block tampered fileName');
}

async function testFragmentBinding(context) {
  const crossBundle = await mutateFragment(context.fragments[0], (changed) => {
    changed.bundleId = '1'.repeat(64);
  });
  await assertStatus(
    'BLOCKED_FRAGMENT_BINDING',
    () => assembleFragments(
      context.family.worklist,
      context.bundle,
      [crossBundle, ...context.fragments.slice(1)],
    ),
    'Should block cross-bundle fragment',
  );

  const unknownShard = await mutateFragment(context.fragments[0], (changed) => {
    changed.shardId = '1'.repeat(64);
  });
  await assertStatus(
    'BLOCKED_FRAGMENT_BINDING',
    () => assembleFragments(
      context.family.worklist,
      context.bundle,
      [unknownShard, ...context.fragments.slice(1)],
    ),
    'Should block unknown shard',
  );
}

async function testDecisionGuards(context) {
  const placeholder = await mutateFragment(context.fragments[0], (changed) => {
    changed.decisions[0].reason = 'TODO';
  });
  await assertStatus(
    'BLOCKED_DECISION_BINDING',
    () => assembleFragments(
      context.family.worklist,
      context.bundle,
      [placeholder, ...context.fragments.slice(1)],
    ),
    'Should block placeholder exclusion reason',
  );

  const unexpectedField = await mutateFragment(context.fragments[0], (changed) => {
    changed.decisions[0].unexpected = 'field';
  });
  await assertStatus(
    'BLOCKED_DECISION_BINDING',
    () => assembleFragments(
      context.family.worklist,
      context.bundle,
      [unexpectedField, ...context.fragments.slice(1)],
    ),
    'Should block unexpected nested fragment fields',
  );
}

async function testAssemblyEquivalence(context) {
  const assembled = await assembleFragments(
    context.family.worklist,
    context.bundle,
    context.fragments,
  );
  const permuted = await assembleFragments(
    context.family.worklist,
    context.bundle,
    [...context.fragments].reverse(),
  );
  assert.deepEqual(permuted, assembled, 'Fragment-file order must not affect output');

  const direct = await createDecisionSet({
    worklist: context.family.worklist,
    decisions: context.fragments.flatMap((fragment) => fragment.decisions),
  });
  assert.deepEqual(assembled, direct, 'Assembled output must equal direct createDecisionSet()');
}

export async function runAssemblerRegressions(context) {
  assert.equal(
    context.bundle.partitionPolicy.shardCount > 1,
    true,
    'Regression fixture must contain multiple shards',
  );
  assert.equal(context.shards.length, context.bundle.partitionPolicy.shardCount);
  await testStaleBundleId(context);
  await testPartitionPolicyAuthority(context);
  await testShardCountAuthority(context);
  await testShardMetadataAuthority(context);
  await testFragmentBinding(context);
  await testDecisionGuards(context);
  await testAssemblyEquivalence(context);
}
