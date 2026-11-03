#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMappingWorklist } from '../../tabs/model-converters/converters/fbx/mapping-worklist.js';
import { loadSourceContext, writeCanonicalJson } from './worklist-cli-support.mjs';

function usage() {
  return 'Usage: node scripts/fbx/build-mapping-worklist.mjs <source.fbx> <output.worklist.json>';
}

export async function buildWorklistFile({ sourcePath, outputPath, root }) {
  const context = await loadSourceContext(sourcePath, root);
  const worklist = await buildMappingWorklist(context);
  await writeCanonicalJson(outputPath, worklist);
  return worklist;
}

async function main(args) {
  if (args.length !== 2) throw new Error(usage());
  const root = fileURLToPath(new URL('../../', import.meta.url));
  await buildWorklistFile({
    sourcePath: resolve(args[0]),
    outputPath: resolve(args[1]),
    root,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
