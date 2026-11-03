import { deepFreeze } from './canonical-json.js';

export const CAPABILITY_STATUS_VOCABULARY = Object.freeze([
  'supported', 'metadata-only', 'tessellation-required', 'blocked-missing-data',
  'blocked-unsupported', 'requires-governed-mapping', 'not-applicable', 'unknown',
]);

export const FEATURE_LIMITATIONS = Object.freeze([
  'ANIMATION_SAMPLES_NOT_RETAINED', 'AUDIO_PLAYBACK_ABSENT',
  'BLEND_SHAPE_DELTAS_NOT_RETAINED', 'CAMERA_PARAMETERS_NOT_RETAINED',
  'CONSTRAINT_EVALUATION_ABSENT', 'EXPLICIT_GOVERNED_MAPPING_REQUIRED',
  'FBX_CONNECTIONS_NOT_ENGINEERING_TOPOLOGY_AUTHORITY', 'GENERAL_MODEL_EXPORTER_ABSENT',
  'GENERAL_MODEL_RENDERER_ABSENT', 'LIGHT_PARAMETERS_NOT_RETAINED',
  'MATERIAL_PARAMETERS_NOT_RETAINED', 'MESH_TOPOLOGY_NOT_RETAINED',
  'NOT_ENGINEERING_CLASSIFICATION_AUTHORITY', 'NURBS_DEFINITION_NOT_RETAINED',
  'PROCEDURAL_GEOMETRY_PAYLOAD_NOT_RETAINED', 'RIG_EVALUATION_DATA_NOT_RETAINED',
  'SHADER_PARAMETERS_NOT_RETAINED', 'SKIN_WEIGHTS_NOT_RETAINED',
  'TESSELLATION_IMPLEMENTATION_ABSENT', 'TEXTURE_CONTENT_NOT_RETAINED',
  'TRANSFERABLE_GEOMETRY_ABSENT', 'UNKNOWN_ELEMENT_SEMANTICS',
  'VIDEO_CONTENT_NOT_RETAINED',
]);

const S = 'supported', M = 'metadata-only', T = 'tessellation-required';
const D = 'blocked-missing-data', B = 'blocked-unsupported', N = 'not-applicable', U = 'unknown';
const R = 'GENERAL_MODEL_RENDERER_ABSENT', X = 'GENERAL_MODEL_EXPORTER_ABSENT';
const G = 'EXPLICIT_GOVERNED_MAPPING_REQUIRED', Q = 'TRANSFERABLE_GEOMETRY_ABSENT';

function entry(featureId, evidenceStatus, renderStatus, exportStatus, engineeringMappingStatus, limitations = [], futureWorkPack = null) {
  return { featureId, evidenceStatus, renderStatus, exportStatus, engineeringMappingStatus, limitations, futureWorkPack };
}

const ENTRIES = [
  entry('animation', M, D, D, N, ['ANIMATION_SAMPLES_NOT_RETAINED']),
  entry('audio', M, B, B, N, ['AUDIO_PLAYBACK_ABSENT']),
  entry('blend-shapes', M, D, D, N, ['BLEND_SHAPE_DELTAS_NOT_RETAINED']),
  entry('cameras', M, D, D, N, ['CAMERA_PARAMETERS_NOT_RETAINED']),
  entry('connection-records', S, N, N, B, ['FBX_CONNECTIONS_NOT_ENGINEERING_TOPOLOGY_AUTHORITY']),
  entry('constraints', M, B, B, N, ['CONSTRAINT_EVALUATION_ABSENT']),
  entry('custom-properties', S, N, N, B, ['NOT_ENGINEERING_CLASSIFICATION_AUTHORITY']),
  entry('document-metadata', S, N, N, N),
  entry('lights', M, D, D, N, ['LIGHT_PARAMETERS_NOT_RETAINED']),
  entry('line-curves', M, D, D, N, [Q]),
  entry('materials', M, D, D, N, ['MATERIAL_PARAMETERS_NOT_RETAINED']),
  entry('mesh-points', S, D, D, S, [G, 'MESH_TOPOLOGY_NOT_RETAINED', Q], 'FBX-RUNTIME-003'),
  entry('mesh-topology', D, D, D, N, ['MESH_TOPOLOGY_NOT_RETAINED', Q], 'FBX-RUNTIME-003'),
  entry('metadata-objects', M, N, N, B, ['NOT_ENGINEERING_CLASSIFICATION_AUTHORITY']),
  entry('node-transforms', S, B, B, S, [G, X, R]),
  entry('nurbs-curve-control-points', S, D, D, S, [G, 'NURBS_DEFINITION_NOT_RETAINED', Q]),
  entry('nurbs-curve-definition', D, T, D, N, ['NURBS_DEFINITION_NOT_RETAINED', 'TESSELLATION_IMPLEMENTATION_ABSENT', Q]),
  entry('nurbs-surfaces', M, T, D, N, ['NURBS_DEFINITION_NOT_RETAINED', 'TESSELLATION_IMPLEMENTATION_ABSENT']),
  entry('procedural-geometry', M, D, D, N, ['PROCEDURAL_GEOMETRY_PAYLOAD_NOT_RETAINED']),
  entry('rigging', M, D, D, N, ['RIG_EVALUATION_DATA_NOT_RETAINED']),
  entry('scene-hierarchy', S, B, B, S, [G, X, R]),
  entry('scene-organization', M, B, B, N, [X, R]),
  entry('shaders', M, D, D, N, ['SHADER_PARAMETERS_NOT_RETAINED']),
  entry('skinning-and-cache-deformation', M, D, D, N, ['SKIN_WEIGHTS_NOT_RETAINED']),
  entry('textures', M, D, D, N, ['TEXTURE_CONTENT_NOT_RETAINED']),
  entry('unknown-elements', U, U, U, U, ['UNKNOWN_ELEMENT_SEMANTICS']),
  entry('video', M, D, D, N, ['VIDEO_CONTENT_NOT_RETAINED']),
];

const TOP_KEYS = ['schema', 'registryVersion', 'statusVocabulary', 'entries'];
const ENTRY_KEYS = ['featureId', 'evidenceStatus', 'renderStatus', 'exportStatus', 'engineeringMappingStatus', 'limitations', 'futureWorkPack'];
const POLICY_FIELDS = ['evidenceStatus', 'renderStatus', 'exportStatus', 'engineeringMappingStatus'];
const STATUS_SET = new Set(CAPABILITY_STATUS_VOCABULARY);
const LIMITATION_SET = new Set(FEATURE_LIMITATIONS);
const FEATURE_IDS = Object.freeze(ENTRIES.map(({ featureId }) => featureId));

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (actual.join('\0') !== expected.join('\0')) throw new TypeError(`${label} fields are invalid.`);
}

function sortedUnique(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) throw new TypeError(`${label} must be strings.`);
  if (new Set(values).size !== values.length || values.some((value, index) => index && values[index - 1] >= value)) {
    throw new TypeError(`${label} must be unique and ASCII-sorted.`);
  }
}

function validateEntry(value, index) {
  exactKeys(value, ENTRY_KEYS, `registry.entries[${index}]`);
  if (value.featureId !== FEATURE_IDS[index]) throw new TypeError('Registry feature IDs are missing, unknown, or out of order.');
  for (const field of POLICY_FIELDS) {
    if (!STATUS_SET.has(value[field]) || value[field] === 'requires-governed-mapping') throw new TypeError(`${field} is invalid.`);
    if (value[field] === U && value.featureId !== 'unknown-elements') throw new TypeError('unknown is reserved for unknown-elements.');
  }
  sortedUnique(value.limitations, `${value.featureId}.limitations`);
  if (value.limitations.some((item) => !LIMITATION_SET.has(item))) throw new TypeError(`${value.featureId} has an unknown limitation.`);
  if (value.futureWorkPack !== null && !/^FBX-RUNTIME-[0-9]{3}$/.test(value.futureWorkPack)) throw new TypeError('futureWorkPack is invalid.');
  const expected = ENTRIES[index];
  if (POLICY_FIELDS.some((field) => value[field] !== expected[field])
    || JSON.stringify(value.limitations) !== JSON.stringify(expected.limitations)
    || value.futureWorkPack !== expected.futureWorkPack) throw new TypeError(`${value.featureId} policy differs from the frozen v1 registry.`);
}

export function validateFeatureCapabilityRegistry(value) {
  exactKeys(value, TOP_KEYS, 'registry');
  if (value.schema !== 'FbxFeatureCapabilityRegistry.v1' || value.registryVersion !== '1.0.0') throw new TypeError('Registry schema or version is invalid.');
  if (JSON.stringify(value.statusVocabulary) !== JSON.stringify(CAPABILITY_STATUS_VOCABULARY)) throw new TypeError('Registry status vocabulary is invalid.');
  if (!Array.isArray(value.entries) || value.entries.length !== FEATURE_IDS.length) throw new TypeError('Registry entries are incomplete.');
  value.entries.forEach(validateEntry);
  return value;
}

export const FBX_FEATURE_CAPABILITY_REGISTRY = deepFreeze(validateFeatureCapabilityRegistry({
  schema: 'FbxFeatureCapabilityRegistry.v1', registryVersion: '1.0.0',
  statusVocabulary: [...CAPABILITY_STATUS_VOCABULARY], entries: ENTRIES,
}));

const ENTRY_INDEX = new Map(FBX_FEATURE_CAPABILITY_REGISTRY.entries.map((value) => [value.featureId, value]));
export function getFeatureCapability(featureId, registry = FBX_FEATURE_CAPABILITY_REGISTRY) {
  validateFeatureCapabilityRegistry(registry);
  const value = registry === FBX_FEATURE_CAPABILITY_REGISTRY ? ENTRY_INDEX.get(featureId) : registry.entries.find((item) => item.featureId === featureId);
  if (!value) throw new RangeError(`Unknown FBX feature ${featureId}.`);
  return value;
}

export const FBX_FEATURE_REGISTRY_SCHEMA = 'FbxFeatureCapabilityRegistry.v2';
export const FBX_FEATURE_REGISTRY_VERSION = '2.0.0';
export const FBX_FEATURE_V2_LIMITATIONS = Object.freeze([
  'ANIMATION_SAMPLES_NOT_RETAINED', 'ANIMATION_TARGET_BINDING_NOT_RETAINED',
  'BLEND_SHAPE_DELTAS_NOT_RETAINED', 'CAMERA_PARAMETERS_NOT_RETAINED',
  'CONSTRAINT_EVALUATION_ABSENT', 'EMBEDDED_MEDIA_BYTES_NOT_RETAINED',
  'EXPLICIT_GOVERNED_MAPPING_REQUIRED', 'GENERAL_MODEL_EXPORTER_ABSENT',
  'GENERAL_MODEL_RENDERER_ABSENT', 'GEOMETRY_CACHE_PAYLOAD_NOT_RETAINED',
  'JOINT_BINDING_NOT_RETAINED', 'LIGHT_PARAMETERS_NOT_RETAINED',
  'MATERIAL_PARAMETERS_NOT_RETAINED', 'MESH_TOPOLOGY_NOT_RETAINED',
  'NORMALS_NOT_RETAINED', 'NURBS_DEFINITION_NOT_RETAINED',
  'SKIN_WEIGHTS_NOT_RETAINED', 'TESSELLATION_IMPLEMENTATION_ABSENT',
  'TEXTURE_CONTENT_NOT_RETAINED', 'TRANSFERABLE_GEOMETRY_ABSENT',
  'UNKNOWN_ELEMENT_SEMANTICS', 'UV_COORDINATES_NOT_RETAINED',
  'VERTEX_COLORS_NOT_RETAINED',
]);

const V2_ENTRIES = [
  entry('animation-curves', M, D, D, N, ['ANIMATION_SAMPLES_NOT_RETAINED', 'ANIMATION_TARGET_BINDING_NOT_RETAINED']),
  entry('animation-stacks', M, D, D, N, ['ANIMATION_SAMPLES_NOT_RETAINED', 'ANIMATION_TARGET_BINDING_NOT_RETAINED']),
  entry('blend-shapes', M, D, D, N, ['BLEND_SHAPE_DELTAS_NOT_RETAINED']),
  entry('cameras', M, D, D, N, ['CAMERA_PARAMETERS_NOT_RETAINED']),
  entry('constraints', M, B, B, N, ['CONSTRAINT_EVALUATION_ABSENT']),
  entry('embedded-media', M, D, D, N, ['EMBEDDED_MEDIA_BYTES_NOT_RETAINED']),
  entry('geometry-caches', M, D, D, N, ['GEOMETRY_CACHE_PAYLOAD_NOT_RETAINED']),
  entry('hierarchy', S, B, B, S, [G, X, R]),
  entry('lights', M, D, D, N, ['LIGHT_PARAMETERS_NOT_RETAINED']),
  entry('materials', M, D, D, N, ['MATERIAL_PARAMETERS_NOT_RETAINED']),
  entry('mesh-control-points', S, D, D, S, [G, 'MESH_TOPOLOGY_NOT_RETAINED', Q], 'FBX-RUNTIME-003'),
  entry('mesh-topology', D, D, D, N, ['MESH_TOPOLOGY_NOT_RETAINED', Q], 'FBX-RUNTIME-003'),
  entry('normals', D, D, D, N, ['NORMALS_NOT_RETAINED']),
  entry('nurbs-curves', M, T, D, S, [G, 'NURBS_DEFINITION_NOT_RETAINED', 'TESSELLATION_IMPLEMENTATION_ABSENT', Q]),
  entry('nurbs-surfaces', M, T, D, N, ['NURBS_DEFINITION_NOT_RETAINED', 'TESSELLATION_IMPLEMENTATION_ABSENT']),
  entry('skinning', M, D, D, N, ['JOINT_BINDING_NOT_RETAINED', 'SKIN_WEIGHTS_NOT_RETAINED']),
  entry('textures', M, D, D, N, ['TEXTURE_CONTENT_NOT_RETAINED']),
  entry('transforms', S, B, B, S, [G, X, R]),
  entry('unknown-element-types', U, U, U, U, ['UNKNOWN_ELEMENT_SEMANTICS']),
  entry('uv-coordinates', D, D, D, N, ['UV_COORDINATES_NOT_RETAINED']),
  entry('vertex-colors', D, D, D, N, ['VERTEX_COLORS_NOT_RETAINED']),
];

const V2_FEATURE_IDS = Object.freeze(V2_ENTRIES.map(({ featureId }) => featureId));
const V2_LIMITATION_SET = new Set(FBX_FEATURE_V2_LIMITATIONS);

function validateV2Entry(value, index) {
  exactKeys(value, ENTRY_KEYS, `registry.entries[${index}]`);
  const expected = V2_ENTRIES[index];
  if (!expected || value.featureId !== V2_FEATURE_IDS[index]) throw new TypeError('Registry v2 feature IDs are missing, unknown, duplicate, or out of order.');
  for (const field of POLICY_FIELDS) {
    if (!STATUS_SET.has(value[field]) || value[field] === 'requires-governed-mapping') throw new TypeError(`${field} is invalid.`);
    if (value[field] === U && value.featureId !== 'unknown-element-types') throw new TypeError('unknown is reserved for unknown-element-types.');
  }
  sortedUnique(value.limitations, `${value.featureId}.limitations`);
  if (value.limitations.some((item) => !item || !V2_LIMITATION_SET.has(item))) throw new TypeError(`${value.featureId} has an invalid limitation.`);
  if (value.futureWorkPack !== null && !/^FBX-RUNTIME-[0-9]{3}$/.test(value.futureWorkPack)) throw new TypeError('futureWorkPack is invalid.');
  if (POLICY_FIELDS.some((field) => value[field] !== expected[field])
    || JSON.stringify(value.limitations) !== JSON.stringify(expected.limitations)
    || value.futureWorkPack !== expected.futureWorkPack) throw new TypeError(`${value.featureId} policy differs from the frozen v2 registry.`);
}

export function validateFbxFeatureCapabilityRegistry(value) {
  exactKeys(value, TOP_KEYS, 'registry');
  if (value.schema !== FBX_FEATURE_REGISTRY_SCHEMA || value.registryVersion !== FBX_FEATURE_REGISTRY_VERSION) throw new TypeError('Registry v2 schema or version is invalid.');
  if (JSON.stringify(value.statusVocabulary) !== JSON.stringify(CAPABILITY_STATUS_VOCABULARY)) throw new TypeError('Registry v2 status vocabulary is invalid.');
  if (!Array.isArray(value.entries) || value.entries.length !== V2_FEATURE_IDS.length) throw new TypeError('Registry v2 entries are incomplete.');
  value.entries.forEach(validateV2Entry);
  return value;
}

const FBX_FEATURE_CAPABILITY_REGISTRY_V2 = deepFreeze(validateFbxFeatureCapabilityRegistry({
  schema: FBX_FEATURE_REGISTRY_SCHEMA, registryVersion: FBX_FEATURE_REGISTRY_VERSION,
  statusVocabulary: [...CAPABILITY_STATUS_VOCABULARY], entries: V2_ENTRIES,
}));
const V2_ENTRY_INDEX = new Map(FBX_FEATURE_CAPABILITY_REGISTRY_V2.entries.map((value) => [value.featureId, value]));

export function getFbxFeatureCapabilityRegistry() {
  return FBX_FEATURE_CAPABILITY_REGISTRY_V2;
}

export function getFbxFeatureCapability(featureId, registry = FBX_FEATURE_CAPABILITY_REGISTRY_V2) {
  validateFbxFeatureCapabilityRegistry(registry);
  const value = registry === FBX_FEATURE_CAPABILITY_REGISTRY_V2
    ? V2_ENTRY_INDEX.get(featureId) : registry.entries.find((item) => item.featureId === featureId);
  if (!value) throw new RangeError(`Unknown FBX feature ${featureId}.`);
  return value;
}
