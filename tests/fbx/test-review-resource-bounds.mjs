import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { withPrivateWorkspace } from '../../tabs/model-converters/converters/fbx/review-execution/atomic-publication.js';
import {
  SCALE_COUNTS, assertDirectoriesEqual, assertFilesEqual, assertNoMissionWorkspaces,
  createExclusionFragments, createSyntheticWorklist, runMeasuredOperation, runStatistics,
} from './review-scale-helpers.mjs';

const RSS_LIMIT = 1.5 * 1024 * 1024 * 1024;

function positiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Invalid positive integer ${value}.`);
  return parsed;
}

function selectedLevels() {
  const values = (process.env.F2S007_SCALE_LEVELS || 'L1').split(',').map((value) => value.trim());
  for (const value of values) if (!Object.hasOwn(SCALE_COUNTS, value)) throw new Error(`Unknown scale level ${value}.`);
  return values;
}

function runCount(levels) {
  const formal = levels.some((level) => level === 'L2' || level === 'L3');
  const count = positiveInteger(process.env.F2S007_SCALE_RUNS, formal ? 3 : 1);
  if (formal && count < 3) throw new Error('L2/L3 qualification requires at least three bounded runs.');
  return count;
}

async function measuredBundle(levelRoot, label, operation, worklistPath, outputPath, options) {
  return runMeasuredOperation(levelRoot, label, {
    operation, worklistPath, outputPath,
    maxItemsPerShard: options.maxItemsPerShard,
    sortRunItems: options.sortRunItems,
    inputChunkBytes: options.inputChunkBytes,
    nodeOptions: operation.startsWith('bounded-') ? '--max-old-space-size=1024' : '',
  });
}

async function measuredAssembly(levelRoot, label, operation, paths, options) {
  return runMeasuredOperation(levelRoot, label, {
    operation, ...paths,
    sortRunItems: options.sortRunItems,
    inputChunkBytes: options.inputChunkBytes,
    nodeOptions: operation.startsWith('bounded-') ? '--max-old-space-size=1024' : '',
  });
}

async function boundedBundleRuns(levelRoot, worklistPath, options, count) {
  const runs = [];
  let retainedOutput = null;
  for (let index = 0; index < count; index++) {
    const outputPath = join(levelRoot, `bounded-bundle-${index}`);
    runs.push(await measuredBundle(levelRoot, `bounded-bundle-${index}`, 'bounded-bundle', worklistPath, outputPath, options));
    if (index === 0) retainedOutput = outputPath;
    else await rm(outputPath, { recursive: true, force: true });
    await assertNoMissionWorkspaces(levelRoot);
  }
  return { runs, retainedOutput };
}

async function boundedAssemblyRuns(levelRoot, paths, options, count) {
  const runs = [];
  let retainedOutput = null;
  for (let index = 0; index < count; index++) {
    const outputPath = join(levelRoot, `bounded-decision-set-${index}.json`);
    runs.push(await measuredAssembly(levelRoot, `bounded-assembly-${index}`, 'bounded-assembly', { ...paths, outputPath }, options));
    if (index === 0) retainedOutput = outputPath;
    else await rm(outputPath, { force: true });
    await assertNoMissionWorkspaces(levelRoot);
  }
  return { runs, retainedOutput };
}

async function referenceParity(levelRoot, worklistPath, boundedBundleDir, boundedDecisionPath, fragmentDir, options) {
  const referenceBundleDir = join(levelRoot, 'reference-bundle');
  const bundleMetrics = await measuredBundle(levelRoot, 'reference-bundle', 'reference-bundle', worklistPath, referenceBundleDir, options);
  await assertDirectoriesEqual(referenceBundleDir, boundedBundleDir);
  const referenceDecisionPath = join(levelRoot, 'reference-decision-set.json');
  const assemblyMetrics = await measuredAssembly(levelRoot, 'reference-assembly', 'reference-assembly', {
    worklistPath, bundlePath: join(referenceBundleDir, 'manifest.json'), fragmentDir,
    outputPath: referenceDecisionPath,
  }, options);
  await assertFilesEqual(referenceDecisionPath, boundedDecisionPath);
  await rm(referenceBundleDir, { recursive: true, force: true });
  await rm(referenceDecisionPath, { force: true });
  return { bundle: bundleMetrics, assembly: assemblyMetrics, byteDrift: 0 };
}

async function qualifyLevel(root, level, options, count) {
  const levelRoot = join(root, level.toLowerCase());
  await mkdir(levelRoot);
  const corpus = await createSyntheticWorklist(levelRoot, SCALE_COUNTS[level]);
  const bundle = await boundedBundleRuns(levelRoot, corpus.worklistPath, options, count);
  const fragmentDir = join(levelRoot, 'fragments');
  const fragments = await createExclusionFragments(bundle.retainedOutput, fragmentDir);
  const assembly = await boundedAssemblyRuns(levelRoot, {
    worklistPath: corpus.worklistPath,
    bundlePath: join(bundle.retainedOutput, 'manifest.json'), fragmentDir,
  }, options, count);
  const reference = level === 'L3' ? null : await referenceParity(
    levelRoot, corpus.worklistPath, bundle.retainedOutput,
    assembly.retainedOutput, fragmentDir, options,
  );
  const result = {
    level, workItemCount: corpus.workItemCount, inputCanonicalBytes: corpus.canonicalBytes,
    shardCount: fragments.bundle.shards.length, fragmentCount: fragments.fragmentCount,
    boundedBundle: runStatistics(bundle.runs), boundedAssembly: runStatistics(assembly.runs),
    reference,
  };
  await assertNoMissionWorkspaces(levelRoot);
  return result;
}

function assertResourceBounds(results) {
  const l3 = results.find((entry) => entry.level === 'L3');
  if (l3) {
    const peak = Math.max(l3.boundedBundle.peakRssBytes, l3.boundedAssembly.peakRssBytes);
    assert.ok(peak <= RSS_LIMIT, `L3 peak RSS ${peak} exceeds ${RSS_LIMIT}.`);
  }
  const l2 = results.find((entry) => entry.level === 'L2');
  if (l2 && l3) {
    const l2Peak = Math.max(l2.boundedBundle.peakRssBytes, l2.boundedAssembly.peakRssBytes);
    const l3Peak = Math.max(l3.boundedBundle.peakRssBytes, l3.boundedAssembly.peakRssBytes);
    assert.ok(l3Peak <= l2Peak * 2.5, `L2 to L3 RSS growth exceeds 2.5x: ${l2Peak} -> ${l3Peak}.`);
  }
}

async function measureInjectedFailureCleanup(root) {
  const target = join(root, 'injected-failure-output');
  const injectedBytes = 16 * 1024 * 1024;
  let failureStarted = null;
  await assert.rejects(withPrivateWorkspace(target, async (workspace) => {
    await writeFile(join(workspace, 'partial.bin'), Buffer.alloc(injectedBytes));
    failureStarted = process.hrtime.bigint();
    throw new Error('F2S007_INJECTED_FAILURE');
  }), /F2S007_INJECTED_FAILURE/);
  const cleanupDurationMs = Number(process.hrtime.bigint() - failureStarted) / 1e6;
  await assert.rejects(access(target), (error) => error.code === 'ENOENT');
  await assertNoMissionWorkspaces(root);
  return { injectedBytes, cleanupDurationMs, finalArtifactCount: 0, orphanWorkspaceCount: 0 };
}

const levels = selectedLevels();
const options = {
  maxItemsPerShard: positiveInteger(process.env.F2S007_MAX_ITEMS_PER_SHARD, 1000),
  sortRunItems: positiveInteger(process.env.F2S007_SORT_RUN_ITEMS, 5000),
  inputChunkBytes: positiveInteger(process.env.F2S007_INPUT_CHUNK_BYTES, 64 * 1024),
};
const root = await mkdtemp(join(tmpdir(), 'f2s007-resource-'));
try {
  const results = [];
  for (const level of levels) results.push(await qualifyLevel(root, level, options, runCount(levels)));
  assertResourceBounds(results);
  const failureCleanup = await measureInjectedFailureCleanup(root);
  const report = { schema: 'F2S007ReviewResourceReport.v1', options, failureCleanup, results };
  if (process.env.F2S007_REPORT_PATH) await writeFile(resolve(process.env.F2S007_REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log('test-review-resource-bounds: PASS');
} finally {
  if (process.env.F2S007_KEEP_SCALE_OUTPUT !== '1') await rm(root, { recursive: true, force: true });
}
