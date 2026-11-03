import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { parseFbxBytesNode } from '../../tabs/model-converters/converters/fbx/parser-node.js';
import { observeParserEvidence } from '../../tabs/model-converters/converters/fbx/parser-provenance.js';

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function loadRepositoryParserEvidence(root) {
  const base = resolve(root, 'third_party/ufbx');
  return observeParserEvidence({
    provenance: await readJson(resolve(base, 'provenance.json')),
    wasmBytes: new Uint8Array(await readFile(resolve(base, 'fbx_parser.wasm'))),
  });
}

export async function loadSourceContext(sourcePath, root) {
  const bytes = new Uint8Array(await readFile(sourcePath));
  const [graph, parserEvidence] = await Promise.all([
    parseFbxBytesNode(bytes),
    loadRepositoryParserEvidence(root),
  ]);
  return { bytes, graph, parserEvidence };
}

export async function writeCanonicalJson(path, value) {
  await writeFile(path, canonicalJson(value), 'utf8');
}
