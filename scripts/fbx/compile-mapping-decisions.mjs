#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileMappingDecisions } from '../../tabs/model-converters/converters/fbx/mapping-decision-compiler.js';
import { loadSourceContext, readJson, writeCanonicalJson } from './worklist-cli-support.mjs';

function usage() {
  return 'Usage: node scripts/fbx/compile-mapping-decisions.mjs <source.fbx> <worklist.json> <decisions.json> <output.fbxmap.json>';
}

export async function compileDecisionFile({
  sourcePath, worklistPath, decisionPath, outputPath, root,
}) {
  const [context, worklist, decisionSet] = await Promise.all([
    loadSourceContext(sourcePath, root),
    readJson(worklistPath),
    readJson(decisionPath),
  ]);
  const mapping = await compileMappingDecisions({ ...context, worklist, decisionSet });
  await writeCanonicalJson(outputPath, mapping);
  return mapping;
}

async function main(args) {
  if (args.length !== 4) throw new Error(usage());
  const root = fileURLToPath(new URL('../../', import.meta.url));
  await compileDecisionFile({
    sourcePath: resolve(args[0]), worklistPath: resolve(args[1]),
    decisionPath: resolve(args[2]), outputPath: resolve(args[3]), root,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
