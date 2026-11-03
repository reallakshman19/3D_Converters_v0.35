import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { calculateWorklistId } from '../../tabs/model-converters/converters/fbx/mapping-worklist.js';
import { buildReviewBundle } from '../../tabs/model-converters/converters/fbx/mapping-review-bundle.js';
import { assembleFragments } from '../../tabs/model-converters/converters/fbx/mapping-fragment-assembler.js';
import { calculateFragmentId } from '../../tabs/model-converters/converters/fbx/mapping-decision-fragment.js';
import { buildBoundedReviewBundle } from '../../tabs/model-converters/converters/fbx/review-execution/bounded-bundle.js';
import { assembleBoundedFragments } from '../../tabs/model-converters/converters/fbx/review-execution/bounded-assembly.js';
import { reviewShardCsv } from '../../tabs/model-converters/converters/fbx/review-execution/review-csv.js';
import { createSyntheticWorklist } from './review-scale-helpers.mjs';

function permutedWorklist(source) {
  const worklist = structuredClone(source);
  const evidence = ['2', '10', 'namespace:name', 'namespace-name', 'é', 'é'];
  worklist.workItems.reverse();
  worklist.workItems.forEach((item, index) => {
    item.nameEvidence.displayName = evidence[index % evidence.length];
  });
  return worklist;
}

async function restampWorklist(worklist) {
  worklist.worklistId = '0'.repeat(64);
  worklist.worklistId = await calculateWorklistId(worklist);
  return worklist;
}

async function writeReferenceBundle(path, result) {
  await mkdir(path);
  await writeFile(join(path, 'manifest.json'), canonicalJson(result.bundle));
  for (const shard of result.shards) {
    const name = `shard-${shard.ordinal}.json`;
    await writeFile(join(path, name), canonicalJson(shard));
    await writeFile(join(path, name.replace(/\.json$/, '.csv')), reviewShardCsv(shard));
  }
}

async function assertDirectoriesEqual(left, right) {
  const leftNames = (await readdir(left)).sort();
  const rightNames = (await readdir(right)).sort();
  assert.deepEqual(leftNames, rightNames);
  for (const name of leftNames) {
    assert.equal(Buffer.compare(await readFile(join(left, name)), await readFile(join(right, name))), 0, `${name} differs`);
  }
}

async function createFragments(path, bundleResult) {
  const fragments = [];
  const paths = [];
  for (const shard of bundleResult.shards) {
    const fragment = {
      schema: 'FbxMappingDecisionFragment.v1',
      bundleId: bundleResult.bundle.bundleId,
      worklistId: shard.worklistId,
      sourceGraphCanonicalSha256: shard.sourceGraphCanonicalSha256,
      shardId: shard.shardId,
      fragmentId: '0'.repeat(64),
      decisions: shard.workItems.map((item) => ({
        workItemId: item.workItemId,
        disposition: 'exclude-with-reason',
        reason: 'bounded parity',
      })).reverse(),
    };
    fragment.fragmentId = await calculateFragmentId(fragment);
    const fragmentPath = join(path, `fragment-${shard.ordinal}.json`);
    await writeFile(fragmentPath, canonicalJson(fragment));
    fragments.unshift(fragment);
    paths.unshift(fragmentPath);
  }
  return { fragments, paths };
}

const root = await mkdtemp(join(tmpdir(), 'f2s007-parity-'));
try {
  const corpus = await createSyntheticWorklist(root, 23);
  const sourceWorklist = JSON.parse(await readFile(corpus.worklistPath, 'utf8'));
  const worklist = await restampWorklist(permutedWorklist(sourceWorklist));
  const worklistPath = join(root, 'worklist.json');
  await writeFile(worklistPath, canonicalJson(worklist));
  const reference = await buildReviewBundle(worklist, 2);
  const referenceDir = join(root, 'reference');
  const boundedDir = join(root, 'bounded');
  const boundedDir2 = join(root, 'bounded-alt');
  await writeReferenceBundle(referenceDir, reference);
  await buildBoundedReviewBundle({
    worklistPath, outputDir: boundedDir, maxItemsPerShard: 2,
    sortRunItems: 1, inputChunkBytes: 7,
  });
  await buildBoundedReviewBundle({
    worklistPath, outputDir: boundedDir2, maxItemsPerShard: 2,
    sortRunItems: 3, inputChunkBytes: 1,
  });
  await assertDirectoriesEqual(referenceDir, boundedDir);
  await assertDirectoriesEqual(referenceDir, boundedDir2);
  const { fragments, paths } = await createFragments(root, reference);
  const direct = await assembleFragments(worklist, reference.bundle, fragments);
  const boundedPath = join(root, 'bounded-decision-set.json');
  await assembleBoundedFragments({
    worklistPath, bundlePath: join(boundedDir, 'manifest.json'), fragmentPaths: paths,
    outputPath: boundedPath, sortRunItems: 1, inputChunkBytes: 5,
  });
  const boundedPath2 = join(root, 'bounded-decision-set-alt.json');
  await assembleBoundedFragments({
    worklistPath, bundlePath: join(boundedDir2, 'manifest.json'), fragmentPaths: [...paths].reverse(),
    outputPath: boundedPath2, sortRunItems: 4, inputChunkBytes: 1,
  });
  const expectedBytes = canonicalJson(direct);
  assert.equal(await readFile(boundedPath, 'utf8'), expectedBytes);
  assert.equal(await readFile(boundedPath2, 'utf8'), expectedBytes);
} finally {
  await rm(root, { recursive: true, force: true });
}
console.log('test-review-scale-parity: PASS');
