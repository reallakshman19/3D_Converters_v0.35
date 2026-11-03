import { canonicalJson, deepFreeze } from './canonical-json.js';
import { validateFbxGeometryBundle } from './geometry-bundle.js';
import { sha256Hex } from './sha256.js';
import {
  FBX_ATTRIBUTE_ERROR_CODES, FBX_RENDER_LIMITS, FBX_RENDER_LIMITS_VERSION,
  FBX_VECTOR_ATTRIBUTES, FBX_VERTEX_ATTRIBUTE_BUNDLE_SCHEMA,
  attributeBufferId, checkedAttributeProduct, checkedAttributeSum,
  concatAttributeBytes, exactAttributeKeys, expectedAttributeDomain,
  failAttribute, ordinaryAttributeBytes, validateFbxRawVertexAttributes,
} from './vertex-attribute-contract.js';

export {
  FBX_ATTRIBUTE_ERROR_CODES, FBX_RAW_VERTEX_ATTRIBUTE_SCHEMA,
  FBX_RENDER_LIMITS, FBX_RENDER_LIMITS_VERSION,
  FBX_VERTEX_ATTRIBUTE_BUNDLE_SCHEMA, FbxVertexAttributeContractError,
  validateFbxRawVertexAttributes,
} from './vertex-attribute-contract.js';

const HASH = /^[0-9a-f]{64}$/;
const DECIMAL_ID = /^(0|[1-9]\d{0,19})$/;
const MAX_OBJECT_ID = 18446744073709551615n;
const MANIFEST_KEYS = [
  'schema', 'geometryBundleDigest', 'sourceGraphSha256', 'byteOrder',
  'limitsVersion', 'geometries', 'buffers', 'bundleDigest',
];
const GEOMETRY_KEYS = [
  'geometryObjectId', 'polygonCount', 'polygonVertexCount', 'normalOrigin',
  'normal', 'tangent', 'bitangent', 'uvSets', 'colorSets', 'faceMaterialSlots',
];
const ATTRIBUTE_KEYS = [
  'sourceDomain', 'referenceMode', 'valueCount', 'componentCount',
  'uniquePerVertex', 'valueBufferId', 'indexBufferId',
];
const SET_KEYS = [...ATTRIBUTE_KEYS, 'setOrdinal', 'sourceSetIndex', 'name'];
const MATERIAL_KEYS = ['count', 'bufferId'];
const BUFFER_KEYS = [
  'bufferId', 'geometryObjectId', 'role', 'scalarType', 'componentCount',
  'count', 'alignment', 'byteLength', 'sha256',
];

function descriptor(role, geometryId, scalarType, components, count, bytes, sha256) {
  return { bufferId: attributeBufferId(geometryId, role), geometryObjectId: geometryId,
    role, scalarType, componentCount: components, count,
    alignment: scalarType === 'Float64' ? 8 : 4,
    byteLength: bytes.byteLength, sha256 };
}
async function appendBuffer(output, descriptors, geometryId, role, scalarType, components, count, bytes) {
  const id = attributeBufferId(geometryId, role), copy = bytes.slice(0);
  descriptors.push(descriptor(role, geometryId, scalarType, components, count, copy, await sha256Hex(copy)));
  output.push({ bufferId: id, bytes: copy }); return id;
}
async function emitAttribute(value, name, geometry, output, descriptors) {
  if (!value) return null;
  const valueBufferId = await appendBuffer(output, descriptors, geometry.geometryObjectId,
    `${name}-values`, 'Float64', value.metadata.valueReals, value.metadata.valueCount, value.values);
  const indexBufferId = await appendBuffer(output, descriptors, geometry.geometryObjectId,
    `${name}-indices`, 'Uint32', 1, geometry.polygonVertexCount, value.indices);
  return { sourceDomain: value.metadata.sourceDomain, referenceMode: value.metadata.referenceMode,
    valueCount: value.metadata.valueCount, componentCount: value.metadata.valueReals,
    uniquePerVertex: value.metadata.uniquePerVertex, valueBufferId, indexBufferId };
}
async function emitSet(value, kind, geometry, output, descriptors) {
  const role = `${kind}/${value.setOrdinal}/${value.sourceSetIndex}`;
  const common = await emitAttribute(value, role, geometry, output, descriptors);
  return { ...common, setOrdinal: value.setOrdinal,
    sourceSetIndex: value.sourceSetIndex, name: value.name };
}
async function emitGeometry(value, output, descriptors) {
  const result = { geometryObjectId: value.geometryObjectId,
    polygonCount: value.polygonCount, polygonVertexCount: value.polygonVertexCount,
    normalOrigin: value.normalOrigin };
  for (const [name] of FBX_VECTOR_ATTRIBUTES) {
    result[name] = await emitAttribute(value[name], name, value, output, descriptors);
  }
  result.uvSets = [];
  for (const item of value.uvSets) result.uvSets.push(await emitSet(item, 'uv', value, output, descriptors));
  result.colorSets = [];
  for (const item of value.colorSets) result.colorSets.push(await emitSet(item, 'color', value, output, descriptors));
  if (value.faceMaterialSlots) {
    const id = await appendBuffer(output, descriptors, value.geometryObjectId,
      'face-material-slots', 'Uint32', 1, value.polygonCount, value.faceMaterialSlots.bytes);
    result.faceMaterialSlots = { count: value.polygonCount, bufferId: id };
  } else result.faceMaterialSlots = null;
  return result;
}
async function digestManifest(manifest) {
  const clone = structuredClone(manifest); delete clone.bundleDigest;
  return sha256Hex(concatAttributeBytes(`${FBX_VERTEX_ATTRIBUTE_BUNDLE_SCHEMA}\0`, canonicalJson(clone)));
}
function freezeBundle(value) {
  deepFreeze(value.manifest); value.buffers.forEach((item) => Object.freeze(item));
  Object.freeze(value.buffers); return Object.freeze(value);
}
export async function buildFbxVertexAttributeBundle({ geometryBundle, rawAttributes, buffers }) {
  await validateFbxGeometryBundle(geometryBundle);
  const raw = validateFbxRawVertexAttributes({
    rawAttributes, buffers, geometryManifest: geometryBundle.manifest,
  });
  const output = [], descriptors = [], geometries = [];
  for (const geometry of raw.geometries) geometries.push(await emitGeometry(geometry, output, descriptors));
  const manifest = { schema: FBX_VERTEX_ATTRIBUTE_BUNDLE_SCHEMA,
    geometryBundleDigest: geometryBundle.manifest.bundleDigest,
    sourceGraphSha256: geometryBundle.manifest.sourceGraphSha256,
    byteOrder: 'little-endian', limitsVersion: FBX_RENDER_LIMITS_VERSION,
    geometries, buffers: descriptors, bundleDigest: '' };
  manifest.bundleDigest = await digestManifest(manifest);
  await validateFbxVertexAttributeBundle({ manifest, buffers: output });
  return freezeBundle({ manifest, buffers: output });
}
function validateAttribute(value, components, polygonVertices, label) {
  if (value === null) return;
  exactAttributeKeys(value, ATTRIBUTE_KEYS, label, FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID);
  if (typeof value.uniquePerVertex !== 'boolean'
    || value.sourceDomain !== expectedAttributeDomain(value.uniquePerVertex)
    || value.referenceMode !== 'indexed-value-table' || value.componentCount !== components
    || !Number.isSafeInteger(value.valueCount) || value.valueCount < 0
    || value.valueCount > FBX_RENDER_LIMITS.attributeValuesPerSet
    || typeof value.valueBufferId !== 'string' || typeof value.indexBufferId !== 'string') {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID, `${label} is invalid.`);
  }
  if (polygonVertices > 0 && value.valueCount === 0) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID, `${label} has no values.`);
}
function validateSet(value, components, polygonVertices, label, ordinal, seen) {
  exactAttributeKeys(value, SET_KEYS, label, FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID);
  if (value.setOrdinal !== ordinal || !Number.isSafeInteger(value.sourceSetIndex)
    || value.sourceSetIndex < 0 || value.sourceSetIndex > 0xffffffff
    || typeof value.name !== 'string' || seen.has(value.sourceSetIndex)) {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID, `${label} identity is invalid.`);
  }
  seen.add(value.sourceSetIndex);
  const common = Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, value[key]]));
  validateAttribute(common, components, polygonVertices, label);
}
function validateOrigin(origin, normal) {
  if (!['source', 'ufbx-generated', 'absent'].includes(origin)
    || ((origin === 'absent') !== (normal === null))) {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID, 'normalOrigin is invalid.');
  }
}
function validGeometryId(value) {
  return typeof value === 'string' && DECIMAL_ID.test(value) && BigInt(value) <= MAX_OBJECT_ID;
}
function validateGeometry(value, index, array) {
  exactAttributeKeys(value, GEOMETRY_KEYS, `geometries[${index}]`, FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID);
  const previous = array[index - 1];
  if (!validGeometryId(value.geometryObjectId)
    || (previous && BigInt(previous.geometryObjectId) >= BigInt(value.geometryObjectId))
    || !Number.isSafeInteger(value.polygonCount)
    || value.polygonCount < 0 || !Number.isSafeInteger(value.polygonVertexCount)
    || value.polygonVertexCount < 0) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID, 'Bundle geometry identity or counts are invalid.');
  for (const [name, components] of FBX_VECTOR_ATTRIBUTES) validateAttribute(value[name], components, value.polygonVertexCount, name);
  validateOrigin(value.normalOrigin, value.normal);
  if (!Array.isArray(value.uvSets) || value.uvSets.length > FBX_RENDER_LIMITS.uvSetsPerGeometry
    || !Array.isArray(value.colorSets) || value.colorSets.length > FBX_RENDER_LIMITS.colorSetsPerGeometry) {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID, 'Bundle set counts are invalid.');
  }
  const uvSeen = new Set(), colorSeen = new Set();
  value.uvSets.forEach((item, ordinal) => validateSet(item, 2, value.polygonVertexCount, `uvSets[${ordinal}]`, ordinal, uvSeen));
  value.colorSets.forEach((item, ordinal) => validateSet(item, 4, value.polygonVertexCount, `colorSets[${ordinal}]`, ordinal, colorSeen));
  if (value.faceMaterialSlots !== null) {
    exactAttributeKeys(value.faceMaterialSlots, MATERIAL_KEYS, 'faceMaterialSlots', FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID);
    if (value.faceMaterialSlots.count !== value.polygonCount
      || typeof value.faceMaterialSlots.bufferId !== 'string') {
      failAttribute(FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID, 'faceMaterialSlots is invalid.');
    }
  }
}
function validateDescriptor(value, index) {
  exactAttributeKeys(value, BUFFER_KEYS, `buffers[${index}]`, FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID);
  const size = value.scalarType === 'Float64' ? 8 : value.scalarType === 'Uint32' ? 4 : 0;
  if (typeof value.bufferId !== 'string' || !value.bufferId
    || !validGeometryId(value.geometryObjectId) || typeof value.role !== 'string'
    || value.bufferId !== attributeBufferId(value.geometryObjectId, value.role)
    || ![1, 2, 3, 4].includes(value.componentCount) || !Number.isSafeInteger(value.count)
    || value.count < 0 || !size || value.alignment !== size
    || value.byteLength !== checkedAttributeProduct([value.count, value.componentCount, size], 'descriptor byte length')
    || value.byteLength > FBX_RENDER_LIMITS.individualBufferBytes || !HASH.test(value.sha256)) {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID, 'Buffer descriptor is invalid.');
  }
}
function referencedBufferIds(manifest) {
  const ids = [];
  for (const geometry of manifest.geometries) {
    for (const [name] of FBX_VECTOR_ATTRIBUTES) if (geometry[name]) ids.push(geometry[name].valueBufferId, geometry[name].indexBufferId);
    for (const set of [...geometry.uvSets, ...geometry.colorSets]) ids.push(set.valueBufferId, set.indexBufferId);
    if (geometry.faceMaterialSlots) ids.push(geometry.faceMaterialSlots.bufferId);
  }
  return ids;
}
async function validateBuffers(manifest, buffers) {
  if (!Array.isArray(buffers) || buffers.length !== manifest.buffers.length) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.BUFFER_INVALID, 'Bundle buffers are incomplete.');
  const ids = referencedBufferIds(manifest), expected = manifest.buffers.map((item) => item.bufferId);
  if (ids.join('\0') !== expected.join('\0') || new Set(ids).size !== ids.length) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID, 'Bundle buffer references are invalid.');
  let total = 0;
  for (let index = 0; index < buffers.length; index += 1) {
    const item = buffers[index], descriptorValue = manifest.buffers[index];
    exactAttributeKeys(item, ['bufferId', 'bytes'], `bundle buffer ${index}`, FBX_ATTRIBUTE_ERROR_CODES.BUFFER_INVALID);
    const bytes = ordinaryAttributeBytes(item.bytes, `bundle buffer ${index}`);
    if (item.bufferId !== descriptorValue.bufferId || bytes.byteLength !== descriptorValue.byteLength) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.BUFFER_INVALID, 'Bundle buffer identity or length is invalid.');
    if (await sha256Hex(bytes) !== descriptorValue.sha256) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.DIGEST_MISMATCH, 'Bundle buffer digest differs from the manifest.');
    total = checkedAttributeSum([total, bytes.byteLength], 'total attribute bytes');
  }
  if (total > FBX_RENDER_LIMITS.totalAttributeBufferBytes) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.LIMIT_EXCEEDED, 'Total attribute bytes exceed the programme limit.');
}
export async function validateFbxVertexAttributeBundle({ manifest, buffers }) {
  exactAttributeKeys(manifest, MANIFEST_KEYS, 'manifest', FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID);
  if (manifest.schema !== FBX_VERTEX_ATTRIBUTE_BUNDLE_SCHEMA
    || !HASH.test(manifest.geometryBundleDigest) || !HASH.test(manifest.sourceGraphSha256)
    || manifest.byteOrder !== 'little-endian' || manifest.limitsVersion !== FBX_RENDER_LIMITS_VERSION
    || !Array.isArray(manifest.geometries) || !Array.isArray(manifest.buffers)
    || manifest.geometries.length > FBX_RENDER_LIMITS.geometries || !HASH.test(manifest.bundleDigest)) {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID, 'Manifest identity is invalid.');
  }
  manifest.geometries.forEach(validateGeometry); manifest.buffers.forEach(validateDescriptor);
  await validateBuffers(manifest, buffers);
  if (await digestManifest(manifest) !== manifest.bundleDigest) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.DIGEST_MISMATCH, 'Bundle digest differs from canonical content.');
  return true;
}
