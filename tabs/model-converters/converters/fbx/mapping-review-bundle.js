import { canonicalDigest } from './mapping-package.js';
import { validateMappingWorklistShape } from './mapping-worklist-contract.js';
import { calculateWorklistId } from './mapping-worklist.js';
import { failBundle, validateBundleShape, validateShardShape } from './mapping-review-contract.js';
import { deepFreeze } from './canonical-json.js';

function compareText(left, right) {
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}

function bundlePayload(bundle) {
  return {
    schema: bundle.schema,
    worklistId: bundle.worklistId,
    sourceGraphCanonicalSha256: bundle.sourceGraphCanonicalSha256,
    partitionPolicy: bundle.partitionPolicy,
    shards: bundle.shards,
  };
}

export async function calculateBundleId(bundle) {
  return canonicalDigest(bundlePayload(bundle));
}

function shardPayload(shard) {
  return {
    schema: shard.schema,
    worklistId: shard.worklistId,
    sourceGraphCanonicalSha256: shard.sourceGraphCanonicalSha256,
    ordinal: shard.ordinal,
    workItems: shard.workItems,
  };
}

export async function calculateShardId(shard) {
  const payload = shardPayload(shard);
  delete payload.shardId;
  return canonicalDigest(payload);
}

function createPartitionPolicy(items, maxItemsPerShard) {
  return {
    id: 'WORK_ITEM_ID_CONTIGUOUS_V1',
    orderingAuthority: 'workItemId',
    maxItemsPerShard,
    shardCount: Math.ceil(items.length / maxItemsPerShard),
  };
}

async function generateShards(worklist, items, policy) {
  const shards = [];
  const bundleShards = [];
  const draftBundleId = '0'.repeat(64);

  for (let i = 0; i < policy.shardCount; i++) {
    const chunk = items.slice(i * policy.maxItemsPerShard, (i + 1) * policy.maxItemsPerShard);
    const draftShard = {
      schema: 'FbxMappingReviewShard.v1',
      bundleId: draftBundleId,
      worklistId: worklist.worklistId,
      sourceGraphCanonicalSha256: worklist.sourceGraph.canonicalSha256,
      shardId: '0'.repeat(64),
      ordinal: i,
      workItems: chunk,
    };
    const shardId = await calculateShardId(draftShard);
    draftShard.shardId = shardId;
    shards.push(deepFreeze(validateShardShape(draftShard)));
    bundleShards.push({
      shardId,
      ordinal: i,
      firstWorkItemId: chunk[0].workItemId,
      lastWorkItemId: chunk[chunk.length - 1].workItemId,
      workItemCount: chunk.length,
      canonicalSha256: shardId,
      fileName: `shard-${i}.json`,
    });
  }
  return { shards, bundleShards };
}

export async function buildReviewBundle(worklist, maxItemsPerShard) {
  if (!maxItemsPerShard || !Number.isInteger(maxItemsPerShard) || maxItemsPerShard < 1) {
    failBundle('BLOCKED_REVIEW_BUNDLE_CONTRACT', 'maxItemsPerShard must be a positive integer.');
  }
  const safeWorklist = validateMappingWorklistShape(worklist);
  if (safeWorklist.workItems.length === 0) {
    failBundle('BLOCKED_REVIEW_BUNDLE_CONTRACT', 'Cannot build review bundle for an empty worklist.');
  }

  const observedWorklistId = await calculateWorklistId(safeWorklist);
  if (observedWorklistId !== safeWorklist.worklistId) {
    failBundle('BLOCKED_REVIEW_BUNDLE_CONTRACT', 'worklistId is stale or tampered.');
  }

  const items = [...safeWorklist.workItems].sort((a, b) => compareText(a.workItemId, b.workItemId));
  const policy = createPartitionPolicy(items, maxItemsPerShard);
  const { shards, bundleShards } = await generateShards(safeWorklist, items, policy);

  const draftBundle = {
    schema: 'FbxMappingReviewBundle.v1',
    bundleId: '0'.repeat(64),
    worklistId: safeWorklist.worklistId,
    sourceGraphCanonicalSha256: safeWorklist.sourceGraph.canonicalSha256,
    partitionPolicy: policy,
    shards: bundleShards,
  };

  const bundleId = await calculateBundleId(draftBundle);
  draftBundle.bundleId = bundleId;
  const safeBundle = validateBundleShape(draftBundle);

  const finalShards = shards.map((shard) => deepFreeze(validateShardShape({ ...shard, bundleId })));
  return { bundle: deepFreeze(safeBundle), shards: finalShards };
}
