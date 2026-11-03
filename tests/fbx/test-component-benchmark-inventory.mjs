import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadFbxBenchmark } from '../../tabs/model-converters/converters/fbx/benchmark/benchmark-loader.js';
import { discoverComponentCatalog } from '../../tabs/model-converters/converters/fbx/benchmark/component-qualification.js';

const benchmarkUrl = new URL('../../Benchmarks/fbx%20BM/StaggedJsonBMforFBX', import.meta.url);
const benchmarkBytes = await readFile(benchmarkUrl);
const loaded = await loadFbxBenchmark({ bytes: benchmarkBytes });
const inventory = discoverComponentCatalog(loaded);

assert.deepEqual(inventory, {
  schema: 'FbxComponentCatalog.v1',
  branchCount: 37,
  componentCount: 354,
  supportCount: 145,
  countsByOuterType: {
    ELBO: 29,
    FLAN: 77,
    GASK: 88,
    INST: 17,
    OLET: 13,
    PIPE: 88,
    REDU: 8,
    TEE: 7,
    VALV: 27,
  },
  countsByRawType: {
    BEND: 7,
    ELBO: 22,
    FBLI: 8,
    FLAN: 69,
    GASK: 88,
    INST: 17,
    OLET: 13,
    PIPE: 88,
    REDU: 8,
    TEE: 7,
    VALV: 27,
  },
});
assert.equal(
  inventory.branchCount + inventory.componentCount + inventory.supportCount,
  536,
  'benchmark typed-record reconciliation failed',
);
assert.equal(loaded.occurrences.length, 536);

console.log('test-component-benchmark-inventory: PASS');
