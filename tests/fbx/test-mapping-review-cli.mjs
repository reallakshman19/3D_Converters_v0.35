import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { worklistFixture } from './worklist-helpers.mjs';
import { calculateFragmentId } from '../../tabs/model-converters/converters/fbx/mapping-decision-fragment.js';

const family = await worklistFixture('family');
const testDir = await mkdtemp(join(tmpdir(), 'fbx-review-cli-'));

async function assertPathAbsent(path, message) {
  try {
    await access(path);
    assert.fail(message);
  } catch (error) {
    assert.equal(error.code, 'ENOENT', message);
  }
}

try {
  const worklistPath = join(testDir, 'worklist.json');
  await writeFile(worklistPath, JSON.stringify(family.worklist));

  const bundleDir = join(testDir, 'bundle');
  const buildCmd = spawnSync('node', [
    'scripts/fbx/build-mapping-review-bundle.mjs',
    worklistPath,
    bundleDir,
    '--max-items',
    '2',
  ], { encoding: 'utf8' });
  if (buildCmd.status !== 0) throw new Error(`build CLI failed: ${buildCmd.stderr}`);

  const manifest = JSON.parse(await readFile(join(bundleDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.schema, 'FbxMappingReviewBundle.v1');

  const bundleDir2 = join(testDir, 'bundle2');
  const buildCmd2 = spawnSync('node', [
    'scripts/fbx/build-mapping-review-bundle.mjs',
    worklistPath,
    bundleDir2,
    '--max-items',
    '2',
  ], { encoding: 'utf8' });
  if (buildCmd2.status !== 0) throw new Error(`build CLI failed: ${buildCmd2.stderr}`);

  for (const shardMeta of manifest.shards) {
    const csv1 = await readFile(join(bundleDir, shardMeta.fileName.replace('.json', '.csv')));
    const csv2 = await readFile(join(bundleDir2, shardMeta.fileName.replace('.json', '.csv')));
    assert.equal(Buffer.compare(csv1, csv2), 0, 'CSV output is not byte-deterministic');
    assert.ok(csv1.toString('utf8').startsWith('NON_AUTHORITATIVE_REVIEW_VIEW,'));
  }

  const fragmentPaths = [];
  for (const shardMeta of manifest.shards) {
    const shard = JSON.parse(await readFile(join(bundleDir, shardMeta.fileName), 'utf8'));
    const fragment = {
      schema: 'FbxMappingDecisionFragment.v1',
      bundleId: shard.bundleId,
      worklistId: shard.worklistId,
      sourceGraphCanonicalSha256: shard.sourceGraphCanonicalSha256,
      shardId: shard.shardId,
      decisions: shard.workItems.map((item) => ({
        workItemId: item.workItemId,
        disposition: 'exclude-with-reason',
        reason: 'cli test',
      })),
      fragmentId: '0'.repeat(64),
    };
    fragment.fragmentId = await calculateFragmentId(fragment);
    const fragmentPath = join(testDir, `fragment-${shard.ordinal}.json`);
    await writeFile(fragmentPath, JSON.stringify(fragment));
    fragmentPaths.push(fragmentPath);
  }

  const decisionSetPath = join(testDir, 'decision-set.json');
  const assembleCmd = spawnSync('node', [
    'scripts/fbx/assemble-mapping-decision-fragments.mjs',
    worklistPath,
    join(bundleDir, 'manifest.json'),
    ...fragmentPaths,
    '--output',
    decisionSetPath,
  ], { encoding: 'utf8' });
  if (assembleCmd.status !== 0) throw new Error(`assemble CLI failed: ${assembleCmd.stderr}`);

  const decisionSet = JSON.parse(await readFile(decisionSetPath, 'utf8'));
  assert.equal(decisionSet.schema, 'FbxMappingDecisionSet.v1');
  assert.equal(decisionSet.decisions.length, family.worklist.workItems.length);

  const failOutputPath = join(testDir, 'should-not-exist.json');
  const failCmd = spawnSync('node', [
    'scripts/fbx/assemble-mapping-decision-fragments.mjs',
    worklistPath,
    join(bundleDir, 'manifest.json'),
    fragmentPaths[0],
    '--output',
    failOutputPath,
  ], { encoding: 'utf8' });
  assert.notEqual(failCmd.status, 0, 'Incomplete assembly must exit non-zero');
  await assertPathAbsent(failOutputPath, 'Output file must not exist after failed assembly');

  const duplicateBundleDir = join(testDir, 'duplicate-option-bundle');
  const duplicateBuild = spawnSync('node', [
    'scripts/fbx/build-mapping-review-bundle.mjs',
    worklistPath,
    duplicateBundleDir,
    '--max-items', '2',
    '--bounded-memory',
    '--bounded-memory',
  ], { encoding: 'utf8' });
  assert.notEqual(duplicateBuild.status, 0, 'Duplicate build option must fail');
  assert.match(duplicateBuild.stderr, /Duplicate option --bounded-memory/);
  await assertPathAbsent(duplicateBundleDir, 'Duplicate build options must publish nothing');

  const duplicateAssemblyPath = join(testDir, 'duplicate-option-decision-set.json');
  const duplicateAssembly = spawnSync('node', [
    'scripts/fbx/assemble-mapping-decision-fragments.mjs',
    worklistPath,
    join(bundleDir, 'manifest.json'),
    ...fragmentPaths,
    '--output', duplicateAssemblyPath,
    '--sort-run-items', '2',
    '--sort-run-items', '3',
  ], { encoding: 'utf8' });
  assert.notEqual(duplicateAssembly.status, 0, 'Duplicate assembly option must fail');
  assert.match(duplicateAssembly.stderr, /Duplicate option --sort-run-items/);
  await assertPathAbsent(duplicateAssemblyPath, 'Duplicate assembly options must publish nothing');
} finally {
  await rm(testDir, { recursive: true, force: true });
}

console.log('test-mapping-review-cli: PASS');
