#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { canonicalJson } from '../../../tabs/model-converters/converters/fbx/canonical-json.js';
import { buildReviewBundle } from '../../../tabs/model-converters/converters/fbx/mapping-review-bundle.js';
import { assembleFragments } from '../../../tabs/model-converters/converters/fbx/mapping-fragment-assembler.js';
import { buildBoundedReviewBundle } from '../../../tabs/model-converters/converters/fbx/review-execution/bounded-bundle.js';
import { assembleBoundedFragments } from '../../../tabs/model-converters/converters/fbx/review-execution/bounded-assembly.js';
import { reviewShardCsv } from '../../../tabs/model-converters/converters/fbx/review-execution/review-csv.js';
import { directoryBytes, startResourceSampler } from './resource-metrics.mjs';

function compareText(left, right) {
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function fragmentPaths(directory) {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith('.json'))
    .sort(compareText)
    .reverse();
  return names.map((name) => join(directory, name));
}

async function inputBytes(config, fragments) {
  let total = (await stat(config.worklistPath)).size;
  if (config.bundlePath) total += (await stat(config.bundlePath)).size;
  if (fragments) total += await directoryBytes(config.fragmentDir);
  return total;
}

async function runReferenceBundle(config) {
  const result = await buildReviewBundle(await readJson(config.worklistPath), config.maxItemsPerShard);
  await mkdir(config.outputPath);
  for (const shard of result.shards) {
    const fileName = result.bundle.shards[shard.ordinal].fileName;
    await writeFile(join(config.outputPath, fileName), canonicalJson(shard), { flag: 'wx' });
    await writeFile(join(config.outputPath, fileName.replace(/\.json$/, '.csv')), reviewShardCsv(shard), { flag: 'wx' });
  }
  await writeFile(join(config.outputPath, 'manifest.json'), canonicalJson(result.bundle), { flag: 'wx' });
  return result;
}

async function runBundle(config, bounded) {
  if (!bounded) return runReferenceBundle(config);
  return buildBoundedReviewBundle({
    worklistPath: config.worklistPath,
    outputDir: config.outputPath,
    maxItemsPerShard: config.maxItemsPerShard,
    sortRunItems: config.sortRunItems,
    inputChunkBytes: config.inputChunkBytes,
  });
}

async function runReferenceAssembly(config, fragments) {
  const [worklist, bundle, ...values] = await Promise.all([
    readJson(config.worklistPath), readJson(config.bundlePath), ...fragments.map(readJson),
  ]);
  const decisionSet = await assembleFragments(worklist, bundle, values);
  await writeFile(config.outputPath, canonicalJson(decisionSet), { flag: 'wx' });
  return decisionSet;
}

async function runAssembly(config, bounded, fragments) {
  if (!bounded) return runReferenceAssembly(config, fragments);
  return assembleBoundedFragments({
    worklistPath: config.worklistPath,
    bundlePath: config.bundlePath,
    fragmentPaths: fragments,
    outputPath: config.outputPath,
    sortRunItems: config.sortRunItems,
    inputChunkBytes: config.inputChunkBytes,
  });
}

function operationKind(operation) {
  const bounded = operation.startsWith('bounded-');
  const kind = operation.replace(/^(bounded|reference)-/, '');
  if (!['bundle', 'assembly'].includes(kind)) throw new Error(`Unsupported operation ${operation}.`);
  return { bounded, kind };
}

async function execute(config) {
  const { bounded, kind } = operationKind(config.operation);
  const fragments = kind === 'assembly' ? await fragmentPaths(config.fragmentDir) : null;
  const canonicalInputBytes = await inputBytes(config, fragments);
  const result = kind === 'bundle'
    ? await runBundle(config, bounded)
    : await runAssembly(config, bounded, fragments);
  return {
    canonicalInputBytes,
    canonicalOutputBytes: await directoryBytes(config.outputPath),
    fragmentCount: fragments?.length || 0,
    executionMetrics: result?.metrics || null,
  };
}

async function main(configPath) {
  const config = JSON.parse(await readFile(resolve(configPath), 'utf8'));
  const stop = await startResourceSampler(config.monitorRoot);
  try {
    const execution = await execute(config);
    const resources = await stop();
    process.stdout.write(`${JSON.stringify({ operation: config.operation, ...execution, resources })}\n`);
  } catch (error) {
    await stop();
    throw error;
  }
}

main(process.argv[2]).catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
