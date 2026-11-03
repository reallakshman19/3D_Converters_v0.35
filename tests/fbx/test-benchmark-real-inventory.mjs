import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadFbxBenchmark } from '../../tabs/model-converters/converters/fbx/benchmark/benchmark-loader.js';
import { buildFbxBenchmarkInventory } from '../../tabs/model-converters/converters/fbx/benchmark/inventory.js';

const benchmarkPath = 'Benchmarks/fbx BM/StaggedJsonBMforFBX';
const bytes = new Uint8Array(await readFile(new URL(`../../${benchmarkPath}`, import.meta.url)));
const loaded = await loadFbxBenchmark({ bytes, identity: { benchmarkId: 'StaggedJsonBMforFBX',
  repository: 'reallaksh19/3D_Converters', benchmarkCommit: 'ecd841cd41cc7a8df1764cec502e0873f578a5dc',
  benchmarkPath, benchmarkBlobSha: 'e4ce63f180d3bcc3cba0e85137ce9811cef477e9' } });
const inventory = buildFbxBenchmarkInventory(loaded);

assert.deepEqual(inventory.counts, { totalRecords: 536, branchRecords: 37, childRecords: 499,
  nonSupportChildRecords: 354, supportOuterTypeRecords: 145 });
assert.deepEqual(inventory.rawOuterTypes, [
  { outerType: 'BRANCH', count: 37 }, { outerType: 'ELBO', count: 29 }, { outerType: 'FLAN', count: 77 },
  { outerType: 'GASK', count: 88 }, { outerType: 'INST', count: 17 }, { outerType: 'OLET', count: 13 },
  { outerType: 'PIPE', count: 88 }, { outerType: 'REDU', count: 8 }, { outerType: 'SUPPORT', count: 145 },
  { outerType: 'TEE', count: 7 }, { outerType: 'VALV', count: 27 },
]);
assert.equal(Object.hasOwn(inventory, 'normalizedTypes'), false);
assert.equal(Object.hasOwn(inventory, 'supportClasses'), false);
assert.deepEqual(inventory.supportAttributeObservations.SUPPORT_KIND, {
  present: 134, missing: 11,
  values: [{ value: 'GUIDE', count: 27 }, { value: 'LINESTOP', count: 3 }, { value: 'REST', count: 104 }],
});
for (const observation of Object.values(inventory.supportAttributeObservations)) {
  assert.equal(observation.present + observation.missing, inventory.counts.supportOuterTypeRecords);
}
assert.deepEqual(inventory.ownerSiteObservations, [
  { ownerSite: '/TWGA-1000-CU-PI', count: 34 }, { ownerSite: '/TWGA-1000-CU-PL', count: 3 },
]);
assert.deepEqual(inventory.referenceCounts, { HREF: 33, TREF: 19 });
assert.match(inventory.benchmarkIdentity.contentSha256, /^[0-9a-f]{64}$/);
assert.equal(inventory.parseResult.duplicateJsonKeyCount, 0);
assert.equal(inventory.parseResult.skippedRecordCount, 0);
assert.equal(Object.keys(loaded.occurrenceById).length, 536);
console.log('test-benchmark-real-inventory: PASS');
