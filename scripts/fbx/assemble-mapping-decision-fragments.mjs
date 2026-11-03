#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeCanonicalJson } from './worklist-cli-support.mjs';
import { assembleFragments } from '../../tabs/model-converters/converters/fbx/mapping-fragment-assembler.js';
import { assembleBoundedFragments } from '../../tabs/model-converters/converters/fbx/review-execution/bounded-assembly.js';

function usage() {
  return 'Usage: node scripts/fbx/assemble-mapping-decision-fragments.mjs <worklist.json> <bundle.json> <fragment-1.json> [fragment-2.json ...] --output <decision-set.json> [--bounded-memory] [--sort-run-items <positive-integer>] [--input-chunk-bytes <positive-integer>]';
}

function positiveInteger(value, label) {
  if (!/^[1-9]\d*$/.test(String(value))) throw new Error(`${label} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

function removeOption(args, name, hasValue) {
  const copy = [...args];
  const index = copy.indexOf(name);
  if (index === -1) return { args: copy, value: null };
  if (copy.indexOf(name, index + 1) !== -1) throw new Error(`Duplicate option ${name}.`);
  if (hasValue && index === copy.length - 1) throw new Error(usage());
  const value = hasValue ? copy[index + 1] : true;
  copy.splice(index, hasValue ? 2 : 1);
  return { args: copy, value };
}

function parseArgs(rawArgs) {
  let parsed = removeOption(rawArgs, '--bounded-memory', false);
  const boundedMemory = Boolean(parsed.value);
  parsed = removeOption(parsed.args, '--sort-run-items', true);
  const sortRunItems = parsed.value === null ? 5000 : positiveInteger(parsed.value, '--sort-run-items');
  parsed = removeOption(parsed.args, '--input-chunk-bytes', true);
  const inputChunkBytes = parsed.value === null ? 64 * 1024 : positiveInteger(parsed.value, '--input-chunk-bytes');
  const args = parsed.args;
  const outIndex = args.indexOf('--output');
  const outputCount = args.filter((value) => value === '--output').length;
  if (outputCount !== 1 || outIndex !== args.length - 2 || outIndex < 3) throw new Error(usage());
  if (args.slice(0, outIndex).some((value) => value.startsWith('--'))) throw new Error(usage());
  return {
    worklistPath: resolve(args[0]), bundlePath: resolve(args[1]),
    fragmentPaths: args.slice(2, outIndex).map((path) => resolve(path)),
    outputPath: resolve(args[outIndex + 1]), boundedMemory, sortRunItems, inputChunkBytes,
  };
}

export async function assembleDecisionFragmentsFiles({
  worklistPath, bundlePath, fragmentPaths, outputPath,
  boundedMemory = false, sortRunItems = 5000, inputChunkBytes = 64 * 1024,
}) {
  if (boundedMemory) return assembleBoundedFragments({
    worklistPath, bundlePath, fragmentPaths, outputPath, sortRunItems, inputChunkBytes,
  });
  const [worklist, bundle, ...fragments] = await Promise.all([
    readJson(worklistPath), readJson(bundlePath), ...fragmentPaths.map((path) => readJson(path)),
  ]);
  const decisionSet = await assembleFragments(worklist, bundle, fragments);
  await writeCanonicalJson(outputPath, decisionSet);
  return decisionSet;
}

async function main(args) {
  await assembleDecisionFragmentsFiles(parseArgs(args));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
