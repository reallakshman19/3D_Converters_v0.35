import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { parseFbxBytesNode } from '../../tabs/model-converters/converters/fbx/parser-node.js';
import { loadFbxParserIdentity } from '../../tabs/model-converters/converters/fbx/parser-wasm.js';
import { loadFbxBenchmark } from '../../tabs/model-converters/converters/fbx/benchmark/benchmark-loader.js';
import { buildFbxBenchmarkLineageAccounting } from '../../tabs/model-converters/converters/fbx/benchmark/lineage-accounting.js';
import {
  verifyBoundBenchmarkBytes, verifyBoundFbxSourceBytes, verifyFbxBenchmarkSourceBinding,
} from '../../tabs/model-converters/converters/fbx/benchmark/source-binding.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Usage: node scripts/fbx/build-source-benchmark-lineage.mjs <source.fbx> [output.json]');
const outputPath = resolve(process.argv[3] || '.qualification/fbx-benchmark/FbxBenchmarkLineageAccounting.v1.json');
const bindingPath = resolve(root, 'Benchmarks/fbx BM/StaggedJsonBMforFBX.source-binding.json');
const binding = await verifyFbxBenchmarkSourceBinding(JSON.parse(await readFile(bindingPath, 'utf8')));
const benchmarkPath = resolve(root, binding.benchmark.path);
const [sourceBuffer, benchmarkBuffer] = await Promise.all([readFile(resolve(sourcePath)), readFile(benchmarkPath)]);
const sourceBytes = new Uint8Array(sourceBuffer), benchmarkBytes = new Uint8Array(benchmarkBuffer);
await Promise.all([verifyBoundFbxSourceBytes(binding, sourceBytes), verifyBoundBenchmarkBytes(binding, benchmarkBytes)]);
const [sourceGraph, parserIdentity, loadedBenchmark] = await Promise.all([
  parseFbxBytesNode(sourceBytes), loadFbxParserIdentity(),
  loadFbxBenchmark({ bytes: benchmarkBytes, identity: {
    benchmarkId: 'StaggedJsonBMforFBX', repository: binding.benchmark.repository,
    benchmarkCommit: binding.benchmark.commit, benchmarkPath: binding.benchmark.path,
    benchmarkBlobSha: binding.benchmark.gitBlobSha1,
  } }),
]);
const artifact = await buildFbxBenchmarkLineageAccounting({
  sourceGraph, loadedBenchmark, sourceBinding: binding, parserIdentity,
});
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, canonicalJson(artifact), 'utf8');
console.log(outputPath);
