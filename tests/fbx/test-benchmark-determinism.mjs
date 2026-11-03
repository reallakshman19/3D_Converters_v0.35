import assert from 'node:assert/strict';
import { canonicalBenchmarkEvidenceJson } from '../../tabs/model-converters/converters/fbx/benchmark/evidence-json.js';

const inventory = {
  schema: 'FbxBenchmarkInventory.v1',
  ownerSiteObservations: [{ ownerSite: 'B', count: 1 }, { ownerSite: 'A', count: 2 }],
  rawOuterTypes: [{ outerType: 'SUPPORT', count: 2 }, { outerType: 'BRANCH', count: 1 }],
  rawAttributeTypes: [{ attributeType: 'ATTA', count: 2 }], rawAttributeRawTypes: [],
  supportAttributeObservations: {
    SUPPORT_KIND: { present: 2, missing: 0, values: [{ value: 'REST', count: 1 }, { value: 'GUIDE', count: 1 }] },
  },
  duplicateIdentities: [{ indexName: 'z', key: 'b' }, { indexName: 'a', key: 'z' }],
};
const reversed = structuredClone(inventory);
for (const key of ['ownerSiteObservations', 'rawOuterTypes', 'duplicateIdentities']) reversed[key].reverse();
reversed.supportAttributeObservations.SUPPORT_KIND.values.reverse();
assert.equal(canonicalBenchmarkEvidenceJson(inventory), canonicalBenchmarkEvidenceJson(reversed));
assert.match(canonicalBenchmarkEvidenceJson(inventory), /\n$/);
console.log('test-benchmark-determinism: PASS');
