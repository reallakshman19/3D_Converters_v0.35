#!/usr/bin/env node
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { readJson, writeCanonicalJson } from './worklist-cli-support.mjs';
import { buildReviewBundle } from '../../tabs/model-converters/converters/fbx/mapping-review-bundle.js';
import { buildBoundedReviewBundle } from '../../tabs/model-converters/converters/fbx/review-execution/bounded-bundle.js';
import { reviewShardCsv } from '../../tabs/model-converters/converters/fbx/review-execution/review-csv.js';

function usage() {
  return 'Usage: node scripts/fbx/build-mapping-review-bundle.mjs <worklist.json> <output-directory> --max-items <positive-integer> [--bounded-memory] [--sort-run-items <positive-integer>] [--input-chunk-bytes <positive-integer>]';
}

function positiveInteger(value, label) {
  if (!/^[1-9]\d*$/.test(String(value))) throw new Error(`${label} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return positiveInteger(args[index + 1], name);
}

function validateOptions(args) {
  const valued = new Set(['--max-items', '--sort-run-items', '--input-chunk-bytes']);
  const seen = new Set();
  for (let index = 2; index < args.length; index += 1) {
    const token = args[index];
    if (token !== '--bounded-memory' && !valued.has(token)) throw new Error(usage());
    if (seen.has(token)) throw new Error(`Duplicate option ${token}.`);
    seen.add(token);
    if (valued.has(token)) {
      if (index === args.length - 1) throw new Error(usage());
      index += 1;
    }
  }
  if (!seen.has('--max-items')) throw new Error(usage());
}

function parseArgs(args) {
  if (args.length < 4) throw new Error(usage());
  validateOptions(args);
  return {
    worklistPath: resolve(args[0]), outputDir: resolve(args[1]),
    maxItems: optionValue(args, '--max-items', null),
    boundedMemory: args.includes('--bounded-memory'),
    sortRunItems: optionValue(args, '--sort-run-items', 5000),
    inputChunkBytes: optionValue(args, '--input-chunk-bytes', 64 * 1024),
  };
}

async function prepareReferenceOutput(outputDir) {
  try {
    if ((await readdir(outputDir)).length > 0) throw new Error(`Output directory ${outputDir} must be empty.`);
  } catch (error) {
    if (error.code === 'ENOENT') await mkdir(outputDir, { recursive: true });
    else throw error;
  }
}

export async function buildReviewBundleFiles({
  worklistPath, outputDir, maxItems, boundedMemory = false, sortRunItems = 5000, inputChunkBytes = 64 * 1024,
}) {
  if (boundedMemory) return buildBoundedReviewBundle({
    worklistPath, outputDir, maxItemsPerShard: maxItems, sortRunItems, inputChunkBytes,
  });
  const worklist = await readJson(worklistPath);
  await prepareReferenceOutput(outputDir);
  const { bundle, shards } = await buildReviewBundle(worklist, maxItems);
  try {
    for (const shard of shards) {
      const shardName = bundle.shards.find((entry) => entry.shardId === shard.shardId).fileName;
      await writeCanonicalJson(join(outputDir, shardName), shard);
      await writeFile(join(outputDir, shardName.replace(/\.json$/, '.csv')), reviewShardCsv(shard), 'utf8');
    }
    await writeCanonicalJson(join(outputDir, 'manifest.json'), bundle);
  } catch (error) {
    await rm(outputDir, { recursive: true, force: true });
    throw new Error(`Failed to write bundle files: ${error.message}`);
  }
  return { bundle, shards };
}

async function main(args) {
  await buildReviewBundleFiles(parseArgs(args));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
