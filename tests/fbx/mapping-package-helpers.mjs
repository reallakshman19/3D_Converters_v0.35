import { readFile } from 'node:fs/promises';
import { calculatePackageId, buildMappingPackage } from '../../tabs/model-converters/converters/fbx/mapping-package.js';
import { parseFbxBytesNode } from '../../tabs/model-converters/converters/fbx/parser-node.js';
import { observeParserEvidence } from '../../tabs/model-converters/converters/fbx/parser-provenance.js';
import { FAMILY_FIXTURE_URL, FAMILY_MAPPING_URL } from './family-helpers.mjs';
import { FIXTURE_URL, MAPPING_URL, ROOT } from './helpers.mjs';

async function jsonAt(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

export async function repositoryParserEvidence() {
  const base = new URL('third_party/ufbx/', ROOT);
  return observeParserEvidence({
    provenance: await jsonAt(new URL('provenance.json', base)),
    wasmBytes: new Uint8Array(await readFile(new URL('fbx_parser.wasm', base))),
  });
}

export async function packageFor(bytes, mapping) {
  return buildMappingPackage({
    bytes,
    graph: await parseFbxBytesNode(bytes),
    mapping,
    parserEvidence: await repositoryParserEvidence(),
  });
}

export async function twoPipePackage() {
  const bytes = new Uint8Array(await readFile(FIXTURE_URL));
  const mapping = await jsonAt(MAPPING_URL);
  return { bytes, mapping, graph: await parseFbxBytesNode(bytes), packageValue: await packageFor(bytes, mapping) };
}

export async function familyPackage() {
  const bytes = new Uint8Array(await readFile(FAMILY_FIXTURE_URL));
  const mapping = await jsonAt(FAMILY_MAPPING_URL);
  return { bytes, mapping, graph: await parseFbxBytesNode(bytes), packageValue: await packageFor(bytes, mapping) };
}

export async function withPackageId(packageValue, mutate) {
  const result = structuredClone(packageValue);
  mutate(result);
  result.packageId = '0'.repeat(64);
  result.packageId = await calculatePackageId(result);
  return result;
}
