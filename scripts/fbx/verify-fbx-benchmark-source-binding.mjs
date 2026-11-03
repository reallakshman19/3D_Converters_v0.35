import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import {
  verifyBoundBenchmarkBytes,
  verifyBoundFbxSourceBytes,
  verifyFbxBenchmarkSourceBinding,
} from '../../tabs/model-converters/converters/fbx/benchmark/source-binding.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bindingPath = resolve(root, 'Benchmarks/fbx BM/StaggedJsonBMforFBX.source-binding.json');
const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Usage: node scripts/fbx/verify-fbx-benchmark-source-binding.mjs <source.fbx> [benchmark]');
const binding = await verifyFbxBenchmarkSourceBinding(JSON.parse(await readFile(bindingPath, 'utf8')));
const sourceBytes = new Uint8Array(await readFile(resolve(sourcePath)));
await verifyBoundFbxSourceBytes(binding, sourceBytes);
const benchmarkPath = resolve(process.argv[3] || resolve(root, binding.benchmark.path));
const benchmarkBytes = new Uint8Array(await readFile(benchmarkPath));
await verifyBoundBenchmarkBytes(binding, benchmarkBytes);
console.log(canonicalJson({
  schema: binding.schema,
  sourceSha256: binding.source.sha256,
  benchmarkGitBlobSha1: binding.benchmark.gitBlobSha1,
  derivationStatus: binding.lineage.derivationStatus,
  certificationStatus: binding.lineage.certificationStatus,
  status: 'SOURCE_AND_BENCHMARK_IDENTITIES_VERIFIED',
}));
