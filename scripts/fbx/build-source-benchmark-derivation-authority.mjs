import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { parseFbxBytesNode } from '../../tabs/model-converters/converters/fbx/parser-node.js';
import { loadFbxParserIdentity } from '../../tabs/model-converters/converters/fbx/parser-wasm.js';
import { loadFbxBenchmark } from '../../tabs/model-converters/converters/fbx/benchmark/benchmark-loader.js';
import { buildFbxBenchmarkLineageAccounting } from '../../tabs/model-converters/converters/fbx/benchmark/lineage-accounting.js';
import { buildFbxBenchmarkDerivationAuthority } from '../../tabs/model-converters/converters/fbx/benchmark/derivation-authority.js';
import { verifyProducerFiles } from '../../tabs/model-converters/converters/fbx/benchmark/producer-authority.js';
import {
  verifyBoundBenchmarkBytes, verifyBoundFbxSourceBytes, verifyFbxBenchmarkSourceBinding,
} from '../../tabs/model-converters/converters/fbx/benchmark/source-binding.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Usage: node scripts/fbx/build-source-benchmark-derivation-authority.mjs <source.fbx> [output.json]');
const outputPath = resolve(process.argv[3] || '.qualification/fbx-benchmark/FbxBenchmarkDerivationAuthority.v1.json');
const bindingPath = resolve(root, 'Benchmarks/fbx BM/StaggedJsonBMforFBX.source-binding.json');
const producerPath = resolve(root, 'Benchmarks/fbx BM/StaggedJsonBMforFBX.producer-authority.json');
const binding = await verifyFbxBenchmarkSourceBinding(JSON.parse(await readFile(bindingPath, 'utf8')));
const producer = JSON.parse(await readFile(producerPath, 'utf8'));
const producerFiles = Object.fromEntries(await Promise.all(producer.producers.map(async (item) => [item.path, await readFile(resolve(root, item.path))])));
await verifyProducerFiles(producer, producerFiles);
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
const lineageAccounting = await buildFbxBenchmarkLineageAccounting({
  sourceGraph, loadedBenchmark, sourceBinding: binding, parserIdentity,
});
const artifact = await buildFbxBenchmarkDerivationAuthority({
  loadedBenchmark, sourceBinding: binding, lineageAccounting, producerAuthority: producer,
});
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, canonicalJson(artifact), 'utf8');
console.log(outputPath);
