import { deepFreeze } from './canonical-json.js';
import {
  CAPABILITY_STATUS_VOCABULARY, FBX_FEATURE_V2_LIMITATIONS,
  getFbxFeatureCapabilityRegistry,
} from './feature-capability-registry.js';

export const FBX_FEATURE_REGISTRY_V3_SCHEMA = 'FbxFeatureCapabilityRegistry.v3';
export const FBX_FEATURE_REGISTRY_V3_VERSION = '3.0.0';
export const FBX_FEATURE_V3_LIMITATIONS = Object.freeze(
  [...new Set([...FBX_FEATURE_V2_LIMITATIONS, 'TOPOLOGY_NOT_ENGINEERING_CONNECTIVITY'])].sort(),
);
const TOP_KEYS = ['schema', 'registryVersion', 'statusVocabulary', 'entries'];
const ENTRY_KEYS = ['featureId', 'evidenceStatus', 'renderStatus', 'exportStatus',
  'engineeringMappingStatus', 'limitations', 'futureWorkPack'];
const POLICY_FIELDS = ['evidenceStatus', 'renderStatus', 'exportStatus', 'engineeringMappingStatus'];
const STATUS_SET = new Set(CAPABILITY_STATUS_VOCABULARY);
const LIMITATION_SET = new Set(FBX_FEATURE_V3_LIMITATIONS);
const TARGET_POLICIES = Object.freeze({
  'mesh-control-points': Object.freeze({
    evidenceStatus: 'supported', renderStatus: 'blocked-unsupported',
    exportStatus: 'blocked-unsupported', engineeringMappingStatus: 'supported',
    limitations: Object.freeze([
      'EXPLICIT_GOVERNED_MAPPING_REQUIRED', 'GENERAL_MODEL_EXPORTER_ABSENT',
      'GENERAL_MODEL_RENDERER_ABSENT', 'TOPOLOGY_NOT_ENGINEERING_CONNECTIVITY',
    ]), futureWorkPack: null,
  }),
  'mesh-topology': Object.freeze({
    evidenceStatus: 'supported', renderStatus: 'blocked-unsupported',
    exportStatus: 'blocked-unsupported', engineeringMappingStatus: 'not-applicable',
    limitations: Object.freeze([
      'GENERAL_MODEL_EXPORTER_ABSENT', 'GENERAL_MODEL_RENDERER_ABSENT',
      'TOPOLOGY_NOT_ENGINEERING_CONNECTIVITY',
    ]), futureWorkPack: null,
  }),
});
function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (actual.join('\0') !== expected.join('\0')) throw new TypeError(`${label} fields are invalid.`);
}
function v3Entry(value) {
  const target = TARGET_POLICIES[value.featureId];
  return target ? { featureId: value.featureId, ...structuredClone(target) } : structuredClone(value);
}
const V2 = getFbxFeatureCapabilityRegistry();
const V3_ENTRIES = V2.entries.map(v3Entry);
const V3_IDS = Object.freeze(V3_ENTRIES.map((item) => item.featureId));
function validateEntry(value, index) {
  exactKeys(value, ENTRY_KEYS, `registry.entries[${index}]`);
  const v2 = V2.entries[index], expected = V3_ENTRIES[index];
  if (!v2 || value.featureId !== V3_IDS[index]) throw new TypeError('Registry v3 feature IDs are invalid.');
  for (const field of POLICY_FIELDS) {
    if (!STATUS_SET.has(value[field]) || value[field] === 'requires-governed-mapping') throw new TypeError(`${field} is invalid.`);
  }
  if (!Array.isArray(value.limitations) || new Set(value.limitations).size !== value.limitations.length
    || value.limitations.some((item, itemIndex) => typeof item !== 'string'
      || !LIMITATION_SET.has(item)
      || (itemIndex > 0 && value.limitations[itemIndex - 1] >= item))) throw new TypeError('Registry v3 limitations are invalid.');
  if (JSON.stringify(value) !== JSON.stringify(expected)) throw new TypeError(`${value.featureId} differs from the frozen v3 policy.`);
  if (!TARGET_POLICIES[value.featureId] && JSON.stringify(value) !== JSON.stringify(v2)) {
    throw new TypeError(`${value.featureId} must remain byte-equivalent to registry v2.`);
  }
}
export function validateFbxFeatureCapabilityRegistryV3(value) {
  exactKeys(value, TOP_KEYS, 'registry');
  if (value.schema !== FBX_FEATURE_REGISTRY_V3_SCHEMA
    || value.registryVersion !== FBX_FEATURE_REGISTRY_V3_VERSION) throw new TypeError('Registry v3 schema is invalid.');
  if (JSON.stringify(value.statusVocabulary) !== JSON.stringify(CAPABILITY_STATUS_VOCABULARY)) {
    throw new TypeError('Registry v3 status vocabulary is invalid.');
  }
  if (!Array.isArray(value.entries) || value.entries.length !== V3_IDS.length) throw new TypeError('Registry v3 entries are incomplete.');
  value.entries.forEach(validateEntry);
  return value;
}
export const FBX_FEATURE_CAPABILITY_REGISTRY_V3 = deepFreeze(validateFbxFeatureCapabilityRegistryV3({
  schema: FBX_FEATURE_REGISTRY_V3_SCHEMA,
  registryVersion: FBX_FEATURE_REGISTRY_V3_VERSION,
  statusVocabulary: [...CAPABILITY_STATUS_VOCABULARY],
  entries: V3_ENTRIES,
}));
const INDEX = new Map(FBX_FEATURE_CAPABILITY_REGISTRY_V3.entries.map((item) => [item.featureId, item]));
export function getFbxFeatureCapabilityRegistryV3() { return FBX_FEATURE_CAPABILITY_REGISTRY_V3; }
export function getFbxFeatureCapabilityV3(featureId, registry = FBX_FEATURE_CAPABILITY_REGISTRY_V3) {
  validateFbxFeatureCapabilityRegistryV3(registry);
  const value = registry === FBX_FEATURE_CAPABILITY_REGISTRY_V3
    ? INDEX.get(featureId) : registry.entries.find((item) => item.featureId === featureId);
  if (!value) throw new RangeError(`Unknown FBX feature ${featureId}.`);
  return value;
}
