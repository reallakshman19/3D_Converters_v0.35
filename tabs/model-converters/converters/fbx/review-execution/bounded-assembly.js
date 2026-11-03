import { createReadStream, createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { calculateBundleId, calculateShardId } from '../mapping-review-bundle.js';
import { createDecisionSet } from '../mapping-decision-compiler.js';
import { parseDecisionFragment } from '../mapping-decision-fragment.js';
import { failAssembler, validateBundleShape } from '../mapping-review-contract.js';
import { appendCanonicalArrayItem, closeWritable, digestDecisionSetPayload, writeDecisionSetFile } from './canonical-spool.js';
import { assertAbsentFile, publishFile, withPrivateWorkspace } from './atomic-publication.js';
import { streamValidatedWorklist } from './worklist-stream.js';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeRawDecision(stream, decision) {
  if (!stream.write(`${JSON.stringify(decision)}\n`, 'utf8')) await once(stream, 'drain');
}

function verifyShardMeta(meta, ordinal, shardId, items) {
  if (!meta) failAssembler('BLOCKED_ASSEMBLER_BINDING', `Missing shard metadata at ordinal ${ordinal}.`);
  const expected = {
    shardId, ordinal, firstWorkItemId: items[0].workItemId,
    lastWorkItemId: items[items.length - 1].workItemId,
    workItemCount: items.length, canonicalSha256: shardId, fileName: `shard-${ordinal}.json`,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (meta[key] !== value) failAssembler('BLOCKED_ASSEMBLER_BINDING', `Shard ${ordinal} ${key} tampered.`);
  }
}

async function eachWorkItemChunk(path, maxItems, callback, checkCancellation) {
  const lines = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  let items = [];
  let ordinal = 0;
  for await (const line of lines) {
    checkCancellation();
    items.push(JSON.parse(line));
    if (items.length === maxItems) {
      await callback(items, ordinal++);
      items = [];
    }
  }
  if (items.length > 0) await callback(items, ordinal++);
  return ordinal;
}

async function expectedShardId(header, ordinal, items) {
  return calculateShardId({
    schema: 'FbxMappingReviewShard.v1', bundleId: '0'.repeat(64),
    worklistId: header.worklistId, sourceGraphCanonicalSha256: header.sourceGraph.canonicalSha256,
    shardId: '0'.repeat(64), ordinal, workItems: items,
  });
}

async function reconstructExpected(worklist, bundle, checkCancellation) {
  const expected = [];
  const seen = new Set();
  for (const meta of bundle.shards) {
    checkCancellation();
    if (seen.has(meta.shardId)) failAssembler('BLOCKED_ASSEMBLER_BINDING', `Duplicate shardId in bundle manifest: ${meta.shardId}.`);
    seen.add(meta.shardId);
  }
  const count = await eachWorkItemChunk(
    worklist.sortedItemsPath, bundle.partitionPolicy.maxItemsPerShard,
    async (items, ordinal) => {
      const shardId = await expectedShardId(worklist.header, ordinal, items);
      verifyShardMeta(bundle.shards[ordinal], ordinal, shardId, items);
      expected.push({ shardId, ordinal });
    }, checkCancellation,
  );
  if (count !== bundle.partitionPolicy.shardCount || count !== bundle.shards.length) {
    failAssembler('BLOCKED_ASSEMBLER_BINDING', 'partitionPolicy does not cover the worklist exactly.');
  }
  return expected;
}

function validateFragmentBinding(fragment, bundle, expectedIds, indexed) {
  if (fragment.bundleId !== bundle.bundleId) failAssembler('BLOCKED_FRAGMENT_BINDING', 'Fragment bundleId mismatch.');
  if (fragment.worklistId !== bundle.worklistId) failAssembler('BLOCKED_FRAGMENT_BINDING', 'Fragment worklistId mismatch.');
  if (fragment.sourceGraphCanonicalSha256 !== bundle.sourceGraphCanonicalSha256) {
    failAssembler('BLOCKED_FRAGMENT_BINDING', 'Fragment sourceGraph hash mismatch.');
  }
  if (!expectedIds.has(fragment.shardId)) failAssembler('BLOCKED_FRAGMENT_BINDING', `Fragment references unknown shardId ${fragment.shardId}.`);
  if (indexed.has(fragment.shardId)) failAssembler('BLOCKED_FRAGMENT_CONFLICT', `Multiple fragments provided for shard ${fragment.shardId}.`);
}

async function indexFragments(paths, bundle, expected, checkCancellation) {
  const expectedIds = new Set(expected.map((entry) => entry.shardId));
  const indexed = new Map();
  for (const path of paths) {
    checkCancellation();
    const fragment = await parseDecisionFragment(await readJson(path));
    validateFragmentBinding(fragment, bundle, expectedIds, indexed);
    indexed.set(fragment.shardId, path);
  }
  if (indexed.size !== expected.length) failAssembler('BLOCKED_FRAGMENT_COVERAGE', 'Not all shards have a corresponding decision fragment.');
  return indexed;
}

function sameIds(left, right) {
  return [...left].map(String).sort().join('\0') === [...right].map(String).sort().join('\0');
}

function assertPromotionIdentity(item, decision) {
  if (decision.disposition !== 'promote') return;
  const entry = decision.mappingEntry;
  if (entry.sourceModelObjectId !== item.sourceModelObjectId) failAssembler('BLOCKED_ASSEMBLER_IDENTITY_TAMPERING', 'sourceModelObjectId tampered.');
  if (entry.sourceOccurrenceId !== item.sourceOccurrenceId) failAssembler('BLOCKED_ASSEMBLER_IDENTITY_TAMPERING', 'sourceOccurrenceId tampered.');
  if (!sameIds(entry.sourceGeometryObjectIds, item.sourceGeometryObjectIds)) {
    failAssembler('BLOCKED_ASSEMBLER_IDENTITY_TAMPERING', 'sourceGeometryObjectIds tampered.');
  }
}

function indexShardDecisions(items, fragment, shardId) {
  if (fragment.decisions.length !== items.length) {
    failAssembler('BLOCKED_FRAGMENT_COVERAGE', `Fragment ${shardId} missing decisions.`);
  }
  const itemsById = new Map(items.map((item) => [item.workItemId, item]));
  const decisions = new Map();
  for (const decision of fragment.decisions) {
    const item = itemsById.get(decision.workItemId);
    if (!item) failAssembler('BLOCKED_FRAGMENT_COVERAGE', `Fragment ${shardId} has unexpected item ${decision.workItemId}.`);
    assertPromotionIdentity(item, decision);
    decisions.set(decision.workItemId, decision);
  }
  return decisions;
}

async function spoolRawDecisions(worklist, expected, fragments, path, checkCancellation) {
  const stream = createWriteStream(path, { encoding: 'utf8', flags: 'wx' });
  let decisionIndex = 0;
  try {
    await eachWorkItemChunk(worklist.sortedItemsPath, expected.maxItemsPerShard, async (items, ordinal) => {
      checkCancellation();
      const meta = expected.shards[ordinal];
      const fragment = await parseDecisionFragment(await readJson(fragments.get(meta.shardId)));
      const decisions = indexShardDecisions(items, fragment, meta.shardId);
      for (const item of items) {
        const decision = decisions.get(item.workItemId);
        if (!decision) failAssembler('BLOCKED_FRAGMENT_COVERAGE', `Missing decision ${item.workItemId}.`);
        await writeRawDecision(stream, decision);
        decisionIndex += 1;
      }
    }, checkCancellation);
  } finally {
    await closeWritable(stream);
  }
  return decisionIndex;
}

async function writeNormalized(stream, decisions, header, offset) {
  const set = await createDecisionSet({ worklist: header, decisions });
  let index = offset;
  for (const decision of set.decisions) await appendCanonicalArrayItem(stream, decision, index++);
  return index;
}

async function normalizeDecisions(rawPath, outputPath, header, maxItems, checkCancellation) {
  const lines = createInterface({ input: createReadStream(rawPath, { encoding: 'utf8' }), crlfDelay: Infinity });
  const stream = createWriteStream(outputPath, { encoding: 'utf8', flags: 'wx' });
  let decisions = [];
  let index = 0;
  try {
    for await (const line of lines) {
      checkCancellation();
      decisions.push(JSON.parse(line));
      if (decisions.length === maxItems) {
        index = await writeNormalized(stream, decisions, header, index);
        decisions = [];
      }
    }
    if (decisions.length > 0) index = await writeNormalized(stream, decisions, header, index);
  } finally {
    await closeWritable(stream);
  }
  return index;
}

async function spoolDecisions(worklist, expected, fragments, path, checkCancellation) {
  const rawPath = `${path}.raw`;
  const rawCount = await spoolRawDecisions(worklist, expected, fragments, rawPath, checkCancellation);
  const count = await normalizeDecisions(
    rawPath, path, worklist.header, expected.maxItemsPerShard, checkCancellation,
  );
  await rm(rawPath, { force: true });
  if (count !== rawCount) failAssembler('BLOCKED_FRAGMENT_COVERAGE', 'Decision normalization changed coverage.');
  return count;
}

export async function assembleBoundedFragments({
  worklistPath, bundlePath, fragmentPaths, outputPath, sortRunItems = 5000, inputChunkBytes = 64 * 1024,
}) {
  await assertAbsentFile(outputPath);
  return withPrivateWorkspace(outputPath, async (workspace, checkCancellation) => {
    const worklist = await streamValidatedWorklist({
      worklistPath, workspace, sortRunItems, inputChunkBytes,
      failureKind: 'assembler', checkCancellation,
    });
    const bundle = validateBundleShape(await readJson(bundlePath));
    if (bundle.worklistId !== worklist.header.worklistId) failAssembler('BLOCKED_ASSEMBLER_BINDING', 'Bundle worklistId mismatch.');
    if (bundle.sourceGraphCanonicalSha256 !== worklist.header.sourceGraph.canonicalSha256) failAssembler('BLOCKED_ASSEMBLER_BINDING', 'Bundle source graph mismatch.');
    if (await calculateBundleId(bundle) !== bundle.bundleId) failAssembler('BLOCKED_ASSEMBLER_BINDING', 'Bundle ID is stale or tampered.');
    const expectedShards = await reconstructExpected(worklist, bundle, checkCancellation);
    const fragments = await indexFragments(fragmentPaths, bundle, expectedShards, checkCancellation);
    const decisionsPath = join(workspace, 'decisions.canonical');
    const decisionCount = await spoolDecisions(worklist, {
      shards: expectedShards, maxItemsPerShard: bundle.partitionPolicy.maxItemsPerShard,
    }, fragments, decisionsPath, checkCancellation);
    if (decisionCount !== worklist.workItemCount) failAssembler('BLOCKED_FRAGMENT_COVERAGE', 'Decision coverage does not equal worklist coverage.');
    const header = {
      worklistId: worklist.header.worklistId,
      sourceGraphCanonicalSha256: worklist.header.sourceGraph.canonicalSha256,
    };
    checkCancellation();
    const decisionSetId = await digestDecisionSetPayload(header, decisionsPath);
    const stagedPath = join(workspace, 'decision-set.json');
    await writeDecisionSetFile(stagedPath, header, decisionsPath, decisionSetId);
    checkCancellation();
    await publishFile(stagedPath, outputPath);
    return { decisionSetId, decisionCount, metrics: {
      fragmentCount: fragmentPaths.length,
      sortRunCount: worklist.sortRunCount,
      mergePassCount: worklist.mergePassCount,
    } };
  });
}
