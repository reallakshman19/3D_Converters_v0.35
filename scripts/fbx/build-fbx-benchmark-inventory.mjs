import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFbxBenchmark } from '../../tabs/model-converters/converters/fbx/benchmark/benchmark-loader.js';
import { canonicalBenchmarkEvidenceJson } from '../../tabs/model-converters/converters/fbx/benchmark/evidence-json.js';
import { buildFbxBenchmarkInventory } from '../../tabs/model-converters/converters/fbx/benchmark/inventory.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const benchmarkPath = 'Benchmarks/fbx BM/StaggedJsonBMforFBX';
const outputPath = resolve(process.argv[2] || '.qualification/fbx-benchmark/FbxBenchmarkInventory.v1.json');
const bytes = new Uint8Array(await readFile(resolve(root, benchmarkPath)));
const loaded = await loadFbxBenchmark({ bytes, identity: { benchmarkId: 'StaggedJsonBMforFBX',
  repository: 'reallaksh19/3D_Converters', benchmarkCommit: 'ecd841cd41cc7a8df1764cec502e0873f578a5dc',
  benchmarkPath, benchmarkBlobSha: 'e4ce63f180d3bcc3cba0e85137ce9811cef477e9' } });
const inventory = buildFbxBenchmarkInventory(loaded);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, canonicalBenchmarkEvidenceJson(inventory), 'utf8');
console.log(outputPath);
