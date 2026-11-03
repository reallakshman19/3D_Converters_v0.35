#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { validateConnectivity, validateConnectivityV2 } from '../../tabs/model-converters/converters/fbx/connectivity.js';
import { buildMappingPackage } from '../../tabs/model-converters/converters/fbx/mapping-package.js';
import { validateMappingManifest } from '../../tabs/model-converters/converters/fbx/mapping-validator.js';
import { parseFbxBytesNode } from '../../tabs/model-converters/converters/fbx/parser-node.js';
import { observeParserEvidence } from '../../tabs/model-converters/converters/fbx/parser-provenance.js';
import { resolveEntryPorts, resolveEntryPortsV2 } from '../../tabs/model-converters/converters/fbx/port-resolver.js';
import { projectSourceGraphV1 } from '../../tabs/model-converters/converters/fbx/source-graph-v1-compat.js';

function usage() {
  return 'Usage: node scripts/fbx/build-mapping-package.mjs <source.fbx> <mapping.json> <output.fbxmap.json>';
}

async function parserEvidence(root) {
  const base = resolve(root, 'third_party/ufbx');
  const provenance = JSON.parse(await readFile(resolve(base, 'provenance.json'), 'utf8'));
  const wasmBytes = new Uint8Array(
    await readFile(resolve(base, 'fbx_parser.wasm')),
  );
  return observeParserEvidence({ provenance, wasmBytes });
}

function validateMapping(mapping, graph) {
  const v2 = mapping.schema === 'FbxStagedMapping.v2';
  const authority = v2 ? graph : projectSourceGraphV1(graph);
  const accepted = validateMappingManifest(mapping, authority);
  const resolvePorts = v2 ? resolveEntryPortsV2 : resolveEntryPorts;
  const resolved = new Map(accepted.entries.map((entry) => [
    entry.mappingEntryId, resolvePorts(entry, authority),
  ]));
  const validateLinks = v2 ? validateConnectivityV2 : validateConnectivity;
  validateLinks(accepted.entries, resolved);
}

export async function buildPackageFile({ sourcePath, mappingPath, outputPath, root }) {
  const bytes = new Uint8Array(await readFile(sourcePath));
  const mapping = JSON.parse(await readFile(mappingPath, 'utf8'));
  const graph = await parseFbxBytesNode(bytes);
  validateMapping(mapping, graph);
  const packageValue = await buildMappingPackage({
    bytes, graph, mapping, parserEvidence: await parserEvidence(root),
  });
  await writeFile(outputPath, canonicalJson(packageValue), 'utf8');
  return packageValue;
}

async function main(args) {
  if (args.length !== 3) throw new Error(usage());
  const root = fileURLToPath(new URL('../../', import.meta.url));
  await buildPackageFile({
    sourcePath: resolve(args[0]), mappingPath: resolve(args[1]),
    outputPath: resolve(args[2]), root,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
