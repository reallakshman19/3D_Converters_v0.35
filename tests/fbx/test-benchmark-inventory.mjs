import assert from 'node:assert/strict';
import { loadFbxBenchmark } from '../../tabs/model-converters/converters/fbx/benchmark/benchmark-loader.js';
import { buildFbxBenchmarkInventory } from '../../tabs/model-converters/converters/fbx/benchmark/inventory.js';
import { buildFbxBenchmarkIndexes } from '../../tabs/model-converters/converters/fbx/benchmark/semantic-indexes.js';

const fixture = [{ name: '/A/B1', type: 'BRANCH', attributes: { NAME: '/A/B1', OWNER: '/A', OWNER_SITE: '/SITE',
  HREF: '/BOUNDARY', HPOS: { x: 0, y: 1, z: 2 }, TPOS: { x: 3, y: 4, z: 5 } }, children: [
  { name: 'PIPE AUTO', type: 'PIPE', attributes: { APOS: { x: 0, y: 1, z: 2 }, LPOS: { x: 3, y: 4, z: 5 } } },
  { name: 'SUPPORT S1', type: 'SUPPORT', attributes: { TYPE: 'ATTA', RAW_TYPE: 'ATTA_RAW', SUPPORT_TAG: 'S1',
    SUPPORT_KIND: 'REST', SUPPORT_MAPPER_KIND: 'REST_MAPPER', SUPPORT_TYPE: 'PRIMARY', OWNER: '/A/B1' } },
  { name: 'SUPPORT S1', type: 'SUPPORT', attributes: { TYPE: 'ATTA', SUPPORT_TAG: 'S1',
    SUPPORT_MAPPER_KIND: 'GUIDE_MAPPER', OWNER: '/A/B1' } },
] }];
const bytes = new TextEncoder().encode(JSON.stringify(fixture));
const loaded = await loadFbxBenchmark({ bytes });
const inventory = buildFbxBenchmarkInventory(loaded);
const indexes = buildFbxBenchmarkIndexes(loaded);

assert.deepEqual(inventory.counts, { totalRecords: 4, branchRecords: 1, childRecords: 3,
  nonSupportChildRecords: 1, supportOuterTypeRecords: 2 });
assert.deepEqual(inventory.rawOuterTypes, [
  { outerType: 'BRANCH', count: 1 }, { outerType: 'PIPE', count: 1 }, { outerType: 'SUPPORT', count: 2 },
]);
assert.deepEqual(inventory.ownerSiteObservations, [{ ownerSite: '/SITE', count: 1 }]);
assert.deepEqual(inventory.supportAttributeObservations.SUPPORT_KIND,
  { present: 1, missing: 1, values: [{ value: 'REST', count: 1 }] });
assert.equal(Object.isFrozen(inventory.supportAttributeObservations.SUPPORT_KIND), true);
assert.equal(Object.isFrozen(inventory.supportAttributeObservations.SUPPORT_KIND.values), true);
assert.equal(Object.hasOwn(inventory, 'normalizedTypes'), false);
assert.equal(Object.hasOwn(inventory, 'supportClasses'), false);
assert.ok(inventory.duplicateIdentities.some((item) => item.indexName === 'supportByTag' && item.key === 'S1'));
assert.equal(indexes.byOuterType.SUPPORT.length, 2);
assert.equal(indexes.byAttributesType.ATTA.length, 2);
assert.equal(indexes.byAttributesRawType.ATTA_RAW.length, 1);
assert.equal(indexes.supportByKindObservation.REST.length, 1);
assert.equal(indexes.supportByMapperKindObservation.REST_MAPPER.length, 1);
assert.equal(indexes.supportByTypeObservation.PRIMARY.length, 1);
assert.equal(Object.hasOwn(indexes, 'byNormalizedType'), false);
assert.equal(loaded.occurrenceById['branch:0/child:1'].record.attributes.SUPPORT_TAG, 'S1');
assert.equal(loaded.occurrenceById['branch:0/child:1'].parentOccurrenceId, 'branch:0');
assert.equal(Object.isFrozen(loaded.occurrenceById), true);
assert.deepEqual(inventory.coordinateExtents,
  { minimum: { x: 0, y: 1, z: 2 }, maximum: { x: 3, y: 4, z: 5 } });

const emptyBranches = [0, 1].map((index) => ({
  name: `/EMPTY/B${index}`, type: 'BRANCH', attributes: {}, children: [],
}));
await assert.rejects(
  () => loadFbxBenchmark({
    bytes: new TextEncoder().encode(JSON.stringify(emptyBranches)),
    semanticLimits: { recordLimit: 1, branchLimit: 2 },
  }),
  /Benchmark exceeds the record limit/,
);

console.log('test-benchmark-inventory: PASS');
