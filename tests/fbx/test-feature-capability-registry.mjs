import assert from 'node:assert/strict';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import {
  CAPABILITY_STATUS_VOCABULARY, FBX_FEATURE_CAPABILITY_REGISTRY,
  FBX_FEATURE_REGISTRY_SCHEMA, FBX_FEATURE_REGISTRY_VERSION,
  FBX_FEATURE_V2_LIMITATIONS, FEATURE_LIMITATIONS, getFbxFeatureCapability,
  getFbxFeatureCapabilityRegistry, getFeatureCapability,
  validateFbxFeatureCapabilityRegistry, validateFeatureCapabilityRegistry,
} from '../../tabs/model-converters/converters/fbx/feature-capability-registry.js';

const registry = FBX_FEATURE_CAPABILITY_REGISTRY;
assert.equal(registry.schema, 'FbxFeatureCapabilityRegistry.v1');
assert.equal(registry.registryVersion, '1.0.0');
assert.deepEqual(registry.statusVocabulary, CAPABILITY_STATUS_VOCABULARY);
assert.equal(registry.entries.length, 27);
assert.deepEqual(registry.entries.map((item) => item.featureId), [...registry.entries.map((item) => item.featureId)].sort());
assert.equal(Object.isFrozen(registry), true);
assert.equal(Object.isFrozen(registry.entries), true);
assert.equal(Object.isFrozen(registry.entries[0]), true);
assert.match(canonicalJson(registry), /FbxFeatureCapabilityRegistry\.v1/);

assert.deepEqual(getFeatureCapability('mesh-points'), {
  featureId: 'mesh-points', evidenceStatus: 'supported', renderStatus: 'blocked-missing-data',
  exportStatus: 'blocked-missing-data', engineeringMappingStatus: 'supported',
  limitations: ['EXPLICIT_GOVERNED_MAPPING_REQUIRED', 'MESH_TOPOLOGY_NOT_RETAINED', 'TRANSFERABLE_GEOMETRY_ABSENT'],
  futureWorkPack: 'FBX-RUNTIME-003',
});
assert.equal(getFeatureCapability('unknown-elements').evidenceStatus, 'unknown');
assert.ok(FEATURE_LIMITATIONS.includes('GENERAL_MODEL_EXPORTER_ABSENT'));
assert.throws(() => getFeatureCapability('missing'), /Unknown FBX feature/);

function mutableV1() { return structuredClone(registry); }
for (const mutate of [
  (value) => { value.extra = true; },
  (value) => { value.registryVersion = 'v1'; },
  (value) => { value.statusVocabulary.reverse(); },
  (value) => { value.entries[0].extra = true; },
  (value) => { value.entries[0].featureId = 'wrong'; },
  (value) => { value.entries[0].evidenceStatus = 'requires-governed-mapping'; },
  (value) => { value.entries[0].renderStatus = 'unknown'; },
  (value) => { value.entries[0].renderStatus = 'blocked-unsupported'; },
  (value) => { value.entries[0].limitations = ['UNKNOWN_LIMITATION']; },
  (value) => { value.entries[0].futureWorkPack = 'FUTURE'; },
  (value) => { value.entries.pop(); },
]) {
  const value = mutableV1(); mutate(value); assert.throws(() => validateFeatureCapabilityRegistry(value));
}

const REQUIRED_V2_IDS = [
  'animation-curves', 'animation-stacks', 'blend-shapes', 'cameras', 'constraints',
  'embedded-media', 'geometry-caches', 'hierarchy', 'lights', 'materials',
  'mesh-control-points', 'mesh-topology', 'normals', 'nurbs-curves', 'nurbs-surfaces',
  'skinning', 'textures', 'transforms', 'unknown-element-types', 'uv-coordinates', 'vertex-colors',
];
const v2 = getFbxFeatureCapabilityRegistry();
assert.equal(v2.schema, FBX_FEATURE_REGISTRY_SCHEMA);
assert.equal(v2.registryVersion, FBX_FEATURE_REGISTRY_VERSION);
assert.deepEqual(v2.statusVocabulary, CAPABILITY_STATUS_VOCABULARY);
assert.deepEqual(v2.entries.map((item) => item.featureId), REQUIRED_V2_IDS);
assert.deepEqual(REQUIRED_V2_IDS, [...REQUIRED_V2_IDS].sort());
assert.equal(Object.isFrozen(v2), true);
assert.equal(Object.isFrozen(v2.entries), true);
assert.equal(Object.isFrozen(v2.entries[0]), true);
assert.equal(canonicalJson(v2), canonicalJson(getFbxFeatureCapabilityRegistry()));
assert.equal(canonicalJson(v2), canonicalJson(structuredClone(v2)));
assert.ok(FBX_FEATURE_V2_LIMITATIONS.includes('UV_COORDINATES_NOT_RETAINED'));

assert.deepEqual(getFbxFeatureCapability('mesh-control-points'), {
  featureId: 'mesh-control-points', evidenceStatus: 'supported', renderStatus: 'blocked-missing-data',
  exportStatus: 'blocked-missing-data', engineeringMappingStatus: 'supported',
  limitations: ['EXPLICIT_GOVERNED_MAPPING_REQUIRED', 'MESH_TOPOLOGY_NOT_RETAINED', 'TRANSFERABLE_GEOMETRY_ABSENT'],
  futureWorkPack: 'FBX-RUNTIME-003',
});
assert.equal(getFbxFeatureCapability('materials').renderStatus, 'blocked-missing-data');
assert.equal(getFbxFeatureCapability('nurbs-surfaces').renderStatus, 'tessellation-required');
assert.equal(getFbxFeatureCapability('unknown-element-types').evidenceStatus, 'unknown');
assert.throws(() => getFbxFeatureCapability('missing'), /Unknown FBX feature/);

function mutableV2() { return structuredClone(v2); }
for (const mutate of [
  (value) => { value.extra = true; },
  (value) => { value.schema = 'FbxFeatureCapabilityRegistry.v1'; },
  (value) => { value.registryVersion = '2'; },
  (value) => { value.statusVocabulary.reverse(); },
  (value) => { value.entries[0].extra = true; },
  (value) => { value.entries[0].featureId = ''; },
  (value) => { value.entries[1].featureId = value.entries[0].featureId; },
  (value) => { value.entries.pop(); },
  (value) => { value.entries.reverse(); },
  (value) => { value.entries[0].evidenceStatus = 'invented'; },
  (value) => { value.entries[0].renderStatus = 'requires-governed-mapping'; },
  (value) => { value.entries[0].limitations = ['']; },
  (value) => { value.entries[0].limitations = ['UNKNOWN_LIMITATION']; },
  (value) => { value.entries[0].limitations = ['ANIMATION_SAMPLES_NOT_RETAINED', 'ANIMATION_SAMPLES_NOT_RETAINED']; },
  (value) => { value.entries[0].limitations.reverse(); },
  (value) => { value.entries[0].futureWorkPack = 'RUNTIME-3'; },
]) {
  const value = mutableV2(); mutate(value); assert.throws(() => validateFbxFeatureCapabilityRegistry(value));
}

assert.equal(canonicalJson(registry), canonicalJson(FBX_FEATURE_CAPABILITY_REGISTRY));
console.log('test-feature-capability-registry: PASS');
