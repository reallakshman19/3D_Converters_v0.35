import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  gitBlobSha1,
  sealFbxBenchmarkSourceBinding,
  verifyBoundBenchmarkBytes,
  verifyBoundFbxSourceBytes,
  verifyFbxBenchmarkSourceBinding,
} from '../../tabs/model-converters/converters/fbx/benchmark/source-binding.js';

const bindingUrl = new URL('../../Benchmarks/fbx BM/StaggedJsonBMforFBX.source-binding.json', import.meta.url);
const binding = await verifyFbxBenchmarkSourceBinding(JSON.parse(await readFile(bindingUrl, 'utf8')));
assert.equal(Object.isFrozen(binding), true);
assert.equal(binding.source.sha256, '0c2c0600a1232541a497aea05832b728569fefcf62ea86e71dea520247fe9ca8');
assert.equal(binding.benchmark.gitBlobSha1, 'e4ce63f180d3bcc3cba0e85137ce9811cef477e9');
assert.equal(binding.lineage.derivationStatus, 'UNPROVEN');
assert.equal(binding.lineage.certificationStatus, 'BLOCKED');
const benchmarkUrl = new URL(`../../${binding.benchmark.path}`, import.meta.url);
await verifyBoundBenchmarkBytes(binding, new Uint8Array(await readFile(benchmarkUrl)));
assert.equal(binding.benchmark.inventory.branchRecords + binding.benchmark.inventory.childRecords,
  binding.benchmark.inventory.totalRecords);
assert.equal(binding.lineage.benchmarkChildCount - binding.lineage.sourceDirectBranchChildCount,
  binding.lineage.netAdditionalBenchmarkRecords);

const synthetic = new Uint8Array(27);
synthetic.set(new TextEncoder().encode('Kaydara FBX Binary  \u0000\u001a\u0000'));
new DataView(synthetic.buffer).setUint32(23, 7500, true);
const syntheticBinding = await sealFbxBenchmarkSourceBinding({
  ...structuredClone(binding),
  source: { ...structuredClone(binding.source), byteLength: synthetic.byteLength,
    sha256: '0'.repeat(64) },
  benchmark: { ...structuredClone(binding.benchmark), gitBlobSha1: await gitBlobSha1(synthetic) },
});
const resealed = await sealFbxBenchmarkSourceBinding({
  ...structuredClone(syntheticBinding),
  source: { ...structuredClone(syntheticBinding.source),
    sha256: await (await import('../../tabs/model-converters/converters/fbx/sha256.js')).sha256Hex(synthetic) },
});
await verifyBoundFbxSourceBytes(resealed, synthetic);
await verifyBoundBenchmarkBytes(resealed, synthetic);
await assert.rejects(() => verifyBoundFbxSourceBytes(resealed, synthetic.slice(0, 26)), /byte length mismatch/);
const tampered = structuredClone(binding);
tampered.lineage.derivationStatus = 'PROVEN';
await assert.rejects(() => verifyFbxBenchmarkSourceBinding(tampered), /not an admitted value/);
const forged = structuredClone(binding);
forged.source.fileName = 'other.fbx';
await assert.rejects(() => verifyFbxBenchmarkSourceBinding(forged), /hash mismatch/);
console.log('test-benchmark-source-binding: PASS');
