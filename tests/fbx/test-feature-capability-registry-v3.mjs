import assert from 'node:assert/strict';
import { getFbxFeatureCapabilityRegistry } from '../../tabs/model-converters/converters/fbx/feature-capability-registry.js';
import {
  FBX_FEATURE_CAPABILITY_REGISTRY_V3, FBX_FEATURE_REGISTRY_V3_SCHEMA,
  FBX_FEATURE_REGISTRY_V3_VERSION, getFbxFeatureCapabilityV3,
  validateFbxFeatureCapabilityRegistryV3,
} from '../../tabs/model-converters/converters/fbx/feature-capability-registry-v3.js';

const v2 = getFbxFeatureCapabilityRegistry();
const v3 = validateFbxFeatureCapabilityRegistryV3(FBX_FEATURE_CAPABILITY_REGISTRY_V3);
assert.equal(v3.schema, FBX_FEATURE_REGISTRY_V3_SCHEMA);
assert.equal(v3.registryVersion, FBX_FEATURE_REGISTRY_V3_VERSION);
assert.deepEqual(v3.statusVocabulary, v2.statusVocabulary);
assert.deepEqual(v3.entries.map((item) => item.featureId), v2.entries.map((item) => item.featureId));
for (let index = 0; index < v2.entries.length; index += 1) {
  const before = v2.entries[index], after = v3.entries[index];
  if (!['mesh-control-points', 'mesh-topology'].includes(before.featureId)) assert.deepEqual(after, before);
}
assert.deepEqual(getFbxFeatureCapabilityV3('mesh-control-points'), {
  featureId: 'mesh-control-points', evidenceStatus: 'supported',
  renderStatus: 'blocked-unsupported', exportStatus: 'blocked-unsupported',
  engineeringMappingStatus: 'supported', limitations: [
    'EXPLICIT_GOVERNED_MAPPING_REQUIRED', 'GENERAL_MODEL_EXPORTER_ABSENT',
    'GENERAL_MODEL_RENDERER_ABSENT', 'TOPOLOGY_NOT_ENGINEERING_CONNECTIVITY',
  ], futureWorkPack: null,
});
assert.deepEqual(getFbxFeatureCapabilityV3('mesh-topology'), {
  featureId: 'mesh-topology', evidenceStatus: 'supported',
  renderStatus: 'blocked-unsupported', exportStatus: 'blocked-unsupported',
  engineeringMappingStatus: 'not-applicable', limitations: [
    'GENERAL_MODEL_EXPORTER_ABSENT', 'GENERAL_MODEL_RENDERER_ABSENT',
    'TOPOLOGY_NOT_ENGINEERING_CONNECTIVITY',
  ], futureWorkPack: null,
});
const malformed = structuredClone(v3);
malformed.entries.find((item) => item.featureId === 'mesh-topology').engineeringMappingStatus = 'supported';
assert.throws(() => validateFbxFeatureCapabilityRegistryV3(malformed));
console.log('test-feature-capability-registry-v3: PASS');
