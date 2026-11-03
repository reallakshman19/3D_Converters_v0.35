import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseFbxBytesNode } from '../../tabs/model-converters/converters/fbx/parser-node.js';
import { convertFbxToStagedJson } from '../../tabs/model-converters/converters/fbx/conversion.js';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';

const inputPath = process.argv[2];
const outputPath = process.argv[3] || 'docs/fbx/project-proof.json';
if (!inputPath) throw new Error('Usage: node scripts/fbx/project-proof.mjs <project.fbx> [proof.json]');
const bytes = new Uint8Array(await readFile(inputPath));
const hash = createHash('sha256').update(bytes).digest('hex');
const graph = await parseFbxBytesNode(bytes);
const result = await convertFbxToStagedJson({
  bytes,
  inputName: 'project.fbx',
  mapping: null,
  parse: async () => graph,
});
const proof = {
  schema: 'FbxProjectProof.v1',
  exercised: true,
  fileSha256: hash,
  parseResult: 'PARSE_PASS',
  mappingResult: result.conversionStatus,
  sourceObjectCount: graph.sourceObjects.length,
  occurrenceCount: graph.occurrences.length,
  stagedJsonPublished: result.outputs.some((item) => item.name.endsWith('.staged.json')),
};
await writeFile(outputPath, canonicalJson(proof));
console.log(canonicalJson(proof));
