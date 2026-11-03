import { deepFreeze } from './canonical-json.js';

export const FBX_RAW_VERTEX_ATTRIBUTE_SCHEMA = 'FbxRawVertexAttributes.v1';
export const FBX_VERTEX_ATTRIBUTE_BUNDLE_SCHEMA = 'FbxVertexAttributeBundle.v1';
export const FBX_RENDER_LIMITS_VERSION = 'FbxRenderLimits.v1';
export const FBX_RENDER_LIMITS = deepFreeze({
  geometries: 65536, uvSetsPerGeometry: 8, colorSetsPerGeometry: 4,
  attributeValuesPerSet: 67108864, individualBufferBytes: 268435456,
  totalAttributeBufferBytes: 536870912,
});
export const FBX_ATTRIBUTE_ERROR_CODES = deepFreeze({
  RAW_INVALID: 'FBX_VERTEX_ATTRIBUTES_INVALID',
  BUNDLE_INVALID: 'FBX_VERTEX_ATTRIBUTE_BUNDLE_INVALID',
  BUFFER_INVALID: 'FBX_VERTEX_ATTRIBUTE_BUFFER_INVALID',
  LIMIT_EXCEEDED: 'FBX_VERTEX_ATTRIBUTE_LIMIT_EXCEEDED',
  INTEGER_OVERFLOW: 'FBX_VERTEX_ATTRIBUTE_INTEGER_OVERFLOW',
  DIGEST_MISMATCH: 'FBX_VERTEX_ATTRIBUTE_DIGEST_MISMATCH',
});
export const FBX_VECTOR_ATTRIBUTES = deepFreeze([
  ['normal', 3], ['tangent', 3], ['bitangent', 3],
]);

const DECIMAL_ID = /^(0|[1-9]\d{0,19})$/;
const MAX_OBJECT_ID = 18446744073709551615n;
const TOP_KEYS = ['schema', 'geometries'];
const GEOMETRY_KEYS = [
  'geometryObjectId', 'normalOrigin', 'normal', 'tangent', 'bitangent',
  'uvSets', 'colorSets', 'faceMaterialSlots',
];
const ATTRIBUTE_KEYS = [
  'sourceDomain', 'referenceMode', 'valueCount', 'valueReals',
  'uniquePerVertex', 'bufferIndices',
];
const SET_KEYS = [...ATTRIBUTE_KEYS, 'setOrdinal', 'sourceSetIndex', 'name'];
const INDEX_KEYS = ['values', 'indices'];
const MATERIAL_KEYS = ['count', 'bufferIndex'];

export class FbxVertexAttributeContractError extends Error {
  constructor(code, message) {
    super(`${code} ${message}`); this.name = 'FbxVertexAttributeContractError'; this.code = code;
  }
}
export function failAttribute(code, message) {
  throw new FbxVertexAttributeContractError(code, message);
}
export function exactAttributeKeys(value, keys, label, code = FBX_ATTRIBUTE_ERROR_CODES.RAW_INVALID) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) failAttribute(code, `${label} must be an object.`);
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (actual.join('\0') !== expected.join('\0')) failAttribute(code, `${label} fields are invalid.`);
}
export function checkedAttributeProduct(values, label) {
  let result = 1;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || (value && result > Number.MAX_SAFE_INTEGER / value)) {
      failAttribute(FBX_ATTRIBUTE_ERROR_CODES.INTEGER_OVERFLOW, `${label} overflowed.`);
    }
    result *= value;
  }
  return result;
}
export function checkedAttributeSum(values, label) {
  let result = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || result > Number.MAX_SAFE_INTEGER - value) {
      failAttribute(FBX_ATTRIBUTE_ERROR_CODES.INTEGER_OVERFLOW, `${label} overflowed.`);
    }
    result += value;
  }
  return result;
}
export function ordinaryAttributeBytes(value, label) {
  const buffer = value instanceof ArrayBuffer ? value : ArrayBuffer.isView(value) ? value.buffer : null;
  if (!buffer || (typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer)) {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.BUFFER_INVALID, `${label} must use an ordinary ArrayBuffer.`);
  }
  const view = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return view.slice().buffer;
}
export function concatAttributeBytes(...values) {
  const arrays = values.map((value) => typeof value === 'string'
    ? new TextEncoder().encode(value)
    : value instanceof Uint8Array ? value : new Uint8Array(value));
  const output = new Uint8Array(arrays.reduce((sum, item) => sum + item.byteLength, 0));
  let offset = 0;
  for (const item of arrays) { output.set(item, offset); offset += item.byteLength; }
  return output;
}
export function attributeBufferId(geometryId, role) {
  return `attributes/${geometryId}/${role}`;
}
export function expectedAttributeDomain(uniquePerVertex) {
  return uniquePerVertex ? 'control-point' : 'polygon-vertex';
}

function useBuffer(index, buffers, used, label) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= buffers.length || used.has(index)) {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.BUFFER_INVALID, `${label} buffer index is invalid.`);
  }
  used.add(index); return ordinaryAttributeBytes(buffers[index], label);
}
function canonicalValues(bytes, count, components, label) {
  const input = new DataView(bytes), output = new ArrayBuffer(bytes.byteLength), result = new DataView(output);
  for (let index = 0; index < count * components; index += 1) {
    const value = input.getFloat64(index * 8, true);
    if (!Number.isFinite(value)) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.RAW_INVALID, `${label} contains a non-finite value.`);
    result.setFloat64(index * 8, value === 0 ? 0 : value, true);
  }
  return output;
}
function canonicalIndices(bytes, count, valueCount, label) {
  const input = new DataView(bytes), output = new ArrayBuffer(bytes.byteLength), result = new DataView(output);
  for (let index = 0; index < count; index += 1) {
    const value = input.getUint32(index * 4, true);
    if (value >= valueCount) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.RAW_INVALID, `${label} index is out of range.`);
    result.setUint32(index * 4, value, true);
  }
  return output;
}
function validateAttribute(value, components, polygonVertices, buffers, used, label) {
  if (value === null) return null;
  exactAttributeKeys(value, ATTRIBUTE_KEYS, label);
  exactAttributeKeys(value.bufferIndices, INDEX_KEYS, `${label}.bufferIndices`);
  if (typeof value.uniquePerVertex !== 'boolean'
    || value.sourceDomain !== expectedAttributeDomain(value.uniquePerVertex)
    || value.referenceMode !== 'indexed-value-table' || value.valueReals !== components
    || !Number.isSafeInteger(value.valueCount) || value.valueCount < 0) {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.RAW_INVALID, `${label} metadata is invalid.`);
  }
  if (value.valueCount > FBX_RENDER_LIMITS.attributeValuesPerSet) {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.LIMIT_EXCEEDED, `${label} exceeds the value limit.`);
  }
  if (polygonVertices > 0 && value.valueCount === 0) {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.RAW_INVALID, `${label} has no values.`);
  }
  const values = useBuffer(value.bufferIndices.values, buffers, used, `${label}.values`);
  const indices = useBuffer(value.bufferIndices.indices, buffers, used, `${label}.indices`);
  const valueBytes = checkedAttributeProduct([value.valueCount, components, 8], `${label} value bytes`);
  const indexBytes = checkedAttributeProduct([polygonVertices, 4], `${label} index bytes`);
  if (values.byteLength !== valueBytes || indices.byteLength !== indexBytes) {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.BUFFER_INVALID, `${label} buffer length is invalid.`);
  }
  if (Math.max(valueBytes, indexBytes) > FBX_RENDER_LIMITS.individualBufferBytes) {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.LIMIT_EXCEEDED, `${label} buffer exceeds the byte limit.`);
  }
  return { metadata: structuredClone(value), values: canonicalValues(values, value.valueCount, components, label),
    indices: canonicalIndices(indices, polygonVertices, value.valueCount, label) };
}
function validateSet(value, components, polygonVertices, buffers, used, label, ordinal, seen) {
  exactAttributeKeys(value, SET_KEYS, label);
  if (value.setOrdinal !== ordinal || !Number.isSafeInteger(value.sourceSetIndex)
    || value.sourceSetIndex < 0 || value.sourceSetIndex > 0xffffffff
    || typeof value.name !== 'string' || seen.has(value.sourceSetIndex)) {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.RAW_INVALID, `${label} identity is invalid.`);
  }
  seen.add(value.sourceSetIndex);
  const common = Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, value[key]]));
  const result = validateAttribute(common, components, polygonVertices, buffers, used, label);
  return { ...result, setOrdinal: value.setOrdinal, sourceSetIndex: value.sourceSetIndex, name: value.name };
}
function validateMaterial(value, polygonCount, buffers, used, label) {
  if (value === null) return null;
  exactAttributeKeys(value, MATERIAL_KEYS, label);
  if (value.count !== polygonCount) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.RAW_INVALID, `${label} count is invalid.`);
  const bytes = useBuffer(value.bufferIndex, buffers, used, label);
  const expected = checkedAttributeProduct([polygonCount, 4], `${label} bytes`);
  if (bytes.byteLength !== expected) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.BUFFER_INVALID, `${label} byte length is invalid.`);
  if (expected > FBX_RENDER_LIMITS.individualBufferBytes) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.LIMIT_EXCEEDED, `${label} exceeds the byte limit.`);
  return { count: polygonCount, bytes };
}
function validateOrigin(origin, normal) {
  if (!['source', 'ufbx-generated', 'absent'].includes(origin)
    || ((origin === 'absent') !== (normal === null))) {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.RAW_INVALID, 'normalOrigin is invalid.');
  }
}
function validGeometryId(value) {
  return typeof value === 'string' && DECIMAL_ID.test(value) && BigInt(value) <= MAX_OBJECT_ID;
}
function compareGeometry(left, right) {
  const a = BigInt(left.geometryObjectId), b = BigInt(right.geometryObjectId);
  return a === b ? 0 : a < b ? -1 : 1;
}
function validateGeometry(value, geometry, buffers, used) {
  exactAttributeKeys(value, GEOMETRY_KEYS, `geometry ${geometry.geometryObjectId}`);
  if (value.geometryObjectId !== geometry.geometryObjectId) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.RAW_INVALID, 'Attribute geometry identity differs from geometry evidence.');
  const result = { geometryObjectId: value.geometryObjectId, polygonCount: geometry.polygonCount,
    polygonVertexCount: geometry.polygonVertexCount, normalOrigin: value.normalOrigin };
  for (const [name, components] of FBX_VECTOR_ATTRIBUTES) {
    result[name] = validateAttribute(value[name], components, geometry.polygonVertexCount, buffers, used, `${name}[${value.geometryObjectId}]`);
  }
  validateOrigin(value.normalOrigin, result.normal);
  if (!Array.isArray(value.uvSets) || value.uvSets.length > FBX_RENDER_LIMITS.uvSetsPerGeometry) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.LIMIT_EXCEEDED, 'UV set count exceeds the programme limit.');
  if (!Array.isArray(value.colorSets) || value.colorSets.length > FBX_RENDER_LIMITS.colorSetsPerGeometry) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.LIMIT_EXCEEDED, 'Color set count exceeds the programme limit.');
  const uvSeen = new Set(), colorSeen = new Set();
  result.uvSets = value.uvSets.map((item, index) => validateSet(item, 2, geometry.polygonVertexCount, buffers, used, `uvSets[${index}]`, index, uvSeen));
  result.colorSets = value.colorSets.map((item, index) => validateSet(item, 4, geometry.polygonVertexCount, buffers, used, `colorSets[${index}]`, index, colorSeen));
  result.faceMaterialSlots = validateMaterial(value.faceMaterialSlots, geometry.polygonCount, buffers, used, `faceMaterialSlots[${value.geometryObjectId}]`);
  return result;
}
export function validateFbxRawVertexAttributes({ rawAttributes, buffers, geometryManifest }) {
  exactAttributeKeys(rawAttributes, TOP_KEYS, 'rawAttributes');
  if (rawAttributes.schema !== FBX_RAW_VERTEX_ATTRIBUTE_SCHEMA
    || !Array.isArray(rawAttributes.geometries) || !Array.isArray(buffers)) {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.RAW_INVALID, 'Raw attribute envelope is invalid.');
  }
  const geometries = geometryManifest.geometries;
  if (rawAttributes.geometries.length !== geometries.length || geometries.length > FBX_RENDER_LIMITS.geometries) {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.RAW_INVALID, 'Raw attribute geometry coverage is invalid.');
  }
  if (rawAttributes.geometries.some((item) => !validGeometryId(item?.geometryObjectId))) {
    failAttribute(FBX_ATTRIBUTE_ERROR_CODES.RAW_INVALID, 'Raw attribute geometry identity is invalid.');
  }
  const ordered = [...rawAttributes.geometries].sort(compareGeometry), used = new Set(), result = [];
  for (let index = 0; index < geometries.length; index += 1) {
    result.push(validateGeometry(ordered[index], geometries[index], buffers, used));
  }
  if (used.size !== buffers.length) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.BUFFER_INVALID, 'Raw attributes contain missing or unexpected buffers.');
  const byteValues = [];
  for (const geometry of result) {
    for (const [name] of FBX_VECTOR_ATTRIBUTES) if (geometry[name]) byteValues.push(geometry[name].values.byteLength, geometry[name].indices.byteLength);
    for (const set of [...geometry.uvSets, ...geometry.colorSets]) byteValues.push(set.values.byteLength, set.indices.byteLength);
    if (geometry.faceMaterialSlots) byteValues.push(geometry.faceMaterialSlots.bytes.byteLength);
  }
  const totalBytes = checkedAttributeSum(byteValues, 'total attribute bytes');
  if (totalBytes > FBX_RENDER_LIMITS.totalAttributeBufferBytes) failAttribute(FBX_ATTRIBUTE_ERROR_CODES.LIMIT_EXCEEDED, 'Total attribute bytes exceed the programme limit.');
  return { geometries: result, totalBytes };
}
