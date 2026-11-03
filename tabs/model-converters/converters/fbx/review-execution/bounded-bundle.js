import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { canonicalJson } from '../canonical-json.js';
import { calculateBundleId, calculateShardId } from '../mapping-review-bundle.js';
import { failBundle, validateBundleShape, validateShardShape } from '../mapping-review-contract.js';
import { streamValidatedWorklist } from './worklist-stream.js';
import { reviewShardCsv } from './review-csv.js';
import { publishDirectory, withPrivateWorkspace, assertEmptyOrAbsentDirectory } from './atomic-publication.js';

function partitionPolicy(count, maxItemsPerShard) {
  return {
    id: 'WORK_ITEM_ID_CONTIGUOUS_V1',
    orderingAuthority: 'workItemId',
    maxItemsPerShard,
    shardCount: Math.ceil(count / maxItemsPerShard),
  };
}

function draftShard(header, ordinal, workItems) {
  return {
    schema: 'FbxMappingReviewShard.v1',
    bundleId: '0'.repeat(64),
    worklistId: header.worklistId,
    sourceGraphCanonicalSha256: header.sourceGraph.canonicalSha256,
    shardId: '0'.repeat(64),
    ordinal,
    workItems,
  };
}

async function flushShard({ header, ordinal, workItems, draftsDir, metadata }) {
  const shard = draftShard(header, ordinal, workItems);
  shard.shardId = await calculateShardId(shard);
  validateShardShape(shard);
  const fileName = `shard-${ordinal}.json`;
  await writeFile(join(draftsDir, fileName), canonicalJson(shard), { encoding: 'utf8', flag: 'wx' });
  metadata.push({
    shardId: shard.shardId,
    ordinal,
    firstWorkItemId: workItems[0].workItemId,
    lastWorkItemId: workItems[workItems.length - 1].workItemId,
    workItemCount: workItems.length,
    canonicalSha256: shard.shardId,
    fileName,
  });
}

async function createShardDrafts(worklist, maxItemsPerShard, draftsDir, checkCancellation) {
  const metadata = [];
  const lines = createInterface({ input: createReadStream(worklist.sortedItemsPath, { encoding: 'utf8' }), crlfDelay: Infinity });
  let items = [];
  for await (const line of lines) {
    checkCancellation();
    items.push(JSON.parse(line));
    if (items.length === maxItemsPerShard) {
      await flushShard({ header: worklist.header, ordinal: metadata.length, workItems: items, draftsDir, metadata });
      items = [];
    }
  }
  if (items.length > 0) await flushShard({ header: worklist.header, ordinal: metadata.length, workItems: items, draftsDir, metadata });
  return metadata;
}

async function finalizeShards(draftsDir, outputDir, metadata, bundleId, checkCancellation) {
  for (const meta of metadata) {
    checkCancellation();
    const shard = JSON.parse(await readFile(join(draftsDir, meta.fileName), 'utf8'));
    shard.bundleId = bundleId;
    validateShardShape(shard);
    await writeFile(join(outputDir, meta.fileName), canonicalJson(shard), { encoding: 'utf8', flag: 'wx' });
    await writeFile(join(outputDir, meta.fileName.replace(/\.json$/, '.csv')), reviewShardCsv(shard), { encoding: 'utf8', flag: 'wx' });
  }
}

function bundleDraft(worklist, maxItemsPerShard, shards) {
  return {
    schema: 'FbxMappingReviewBundle.v1',
    bundleId: '0'.repeat(64),
    worklistId: worklist.header.worklistId,
    sourceGraphCanonicalSha256: worklist.header.sourceGraph.canonicalSha256,
    partitionPolicy: partitionPolicy(worklist.workItemCount, maxItemsPerShard),
    shards,
  };
}

async function executeBoundedBundle(config, workspace, checkCancellation) {
  const worklist = await streamValidatedWorklist({
    worklistPath: config.worklistPath, workspace,
    sortRunItems: config.sortRunItems, inputChunkBytes: config.inputChunkBytes,
    checkCancellation,
  });
  if (worklist.workItemCount === 0) failBundle('BLOCKED_REVIEW_BUNDLE_CONTRACT', 'Cannot build review bundle for an empty worklist.');
  const draftsDir = join(workspace, 'draft-shards');
  const stagedDir = join(workspace, 'published-bundle');
  await mkdir(draftsDir);
  await mkdir(stagedDir);
  const shards = await createShardDrafts(worklist, config.maxItemsPerShard, draftsDir, checkCancellation);
  const bundle = bundleDraft(worklist, config.maxItemsPerShard, shards);
  bundle.bundleId = await calculateBundleId(bundle);
  validateBundleShape(bundle);
  await finalizeShards(draftsDir, stagedDir, shards, bundle.bundleId, checkCancellation);
  checkCancellation();
  await writeFile(join(stagedDir, 'manifest.json'), canonicalJson(bundle), { encoding: 'utf8', flag: 'wx' });
  checkCancellation();
  await publishDirectory(stagedDir, config.outputDir);
  return { bundle, metrics: {
    workItemCount: worklist.workItemCount, shardCount: shards.length,
    sortRunCount: worklist.sortRunCount, mergePassCount: worklist.mergePassCount,
  } };
}

export async function buildBoundedReviewBundle({
  worklistPath, outputDir, maxItemsPerShard, sortRunItems = 5000, inputChunkBytes = 64 * 1024,
}) {
  if (!Number.isInteger(maxItemsPerShard) || maxItemsPerShard < 1) {
    failBundle('BLOCKED_REVIEW_BUNDLE_CONTRACT', 'maxItemsPerShard must be a positive integer.');
  }
  await assertEmptyOrAbsentDirectory(outputDir);
  const config = { worklistPath, outputDir, maxItemsPerShard, sortRunItems, inputChunkBytes };
  return withPrivateWorkspace(outputDir, (workspace, checkCancellation) => (
    executeBoundedBundle(config, workspace, checkCancellation)
  ));
}
