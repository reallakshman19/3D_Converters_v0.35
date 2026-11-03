import { deepFreeze } from './canonical-json.js';
import { enforceSourceGraphPolicy } from './source-graph.js';

export const FBX_RAW_MESH_TOPOLOGY_SCHEMA = 'FbxRawMeshTopology.v1';
export const FBX_GEOMETRY_LIMITS_VERSION = 'FbxGeometryLimits.v1';
export const FBX_GEOMETRY_LIMITS = deepFreeze({
  geometries: 65536,
  controlPointsPerGeometry: 8388608,
  polygonsPerGeometry: 16777215,
  polygonVerticesPerGeometry: 67108864,
  individualBufferBytes: 268435456,
  totalBufferBytes: 536870912,
});
export const FBX_GEOMETRY_ERROR_CODES = deepFreeze({
  TOPOLOGY_INVALID: 'FBX_TOPOLOGY_INVALID',
  LIMIT_EXCEEDED: 'FBX_GEOMETRY_LIMIT_EXCEEDED',
  INTEGER_OVERFLOW: 'FBX_GEOMETRY_INTEGER_OVERFLOW',
  BUFFER_INVALID: 'FBX_GEOMETRY_BUFFER_INVALID',
  BUNDLE_INVALID: 'FBX_GEOMETRY_BUNDLE_INVALID',
  DIGEST_MISMATCH: 'FBX_GEOMETRY_DIGEST_MISMATCH',
});

const TOP_KEYS = ['schema', 'sourceGraph', 'geometries'];
const GEOMETRY_KEYS = [
  'geometryObjectId', 'sourceObjectId', 'controlPointCount', 'polygonCount',
  'polygonVertexCount', 'emptyPolygonCount', 'pointPolygonCount',
  'linePolygonCount', 'reversedWinding', 'bufferIndices',
];
const INDEX_KEYS = ['controlPointsMm', 'polygonOffsets', 'polygonVertexIndices'];
const DECIMAL_ID = /^(0|[1-9]\d{0,19})$/;
const MAX_OBJECT_ID = 18446744073709551615n;

export class FbxGeometryContractError extends Error {
  constructor(code, message) { super(`${code} ${message}`); this.name = 'FbxGeometryContractError'; this.code = code; }
}
function fail(code, message) { throw new FbxGeometryContractError(code, message); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, `${label} must be an object.`);
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (actual.join('\0') !== expected.join('\0')) fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, `${label} fields are invalid.`);
}
function checkedProduct(values, label) {
  let value = 1;
  for (const factor of values) {
    if (!Number.isSafeInteger(factor) || factor < 0 || (factor && value > Number.MAX_SAFE_INTEGER / factor)) fail(FBX_GEOMETRY_ERROR_CODES.INTEGER_OVERFLOW, `${label} overflowed.`);
    value *= factor;
  }
  return value;
}
function checkedSum(values, label) {
  let value = 0;
  for (const item of values) {
    if (!Number.isSafeInteger(item) || item < 0 || value > Number.MAX_SAFE_INTEGER - item) fail(FBX_GEOMETRY_ERROR_CODES.INTEGER_OVERFLOW, `${label} overflowed.`);
    value += item;
  }
  return value;
}
function ordinaryBytes(value, label) {
  const buffer = value instanceof ArrayBuffer ? value : ArrayBuffer.isView(value) ? value.buffer : null;
  if (!buffer || (typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer)) fail(FBX_GEOMETRY_ERROR_CODES.BUFFER_INVALID, `${label} must use an ordinary ArrayBuffer.`);
  const view = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return view.slice().buffer;
}
function validId(value) { return typeof value === 'string' && DECIMAL_ID.test(value) && BigInt(value) <= MAX_OBJECT_ID; }
function compareId(left, right) {
  const a = BigInt(left.geometryObjectId), b = BigInt(right.geometryObjectId);
  if (a !== b) return a < b ? -1 : 1;
  const c = BigInt(left.sourceObjectId), d = BigInt(right.sourceObjectId);
  return c === d ? 0 : c < d ? -1 : 1;
}
function countValue(value, limit, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, `${label} is invalid.`);
  if (value > limit) fail(FBX_GEOMETRY_ERROR_CODES.LIMIT_EXCEEDED, `${label} exceeds the programme limit.`);
}
function validateDescriptor(value, index) {
  exactKeys(value, GEOMETRY_KEYS, `geometries[${index}]`); exactKeys(value.bufferIndices, INDEX_KEYS, `geometries[${index}].bufferIndices`);
  if (!validId(value.geometryObjectId) || !validId(value.sourceObjectId)) fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, 'Geometry identity is invalid.');
  countValue(value.controlPointCount, FBX_GEOMETRY_LIMITS.controlPointsPerGeometry, 'controlPointCount');
  countValue(value.polygonCount, FBX_GEOMETRY_LIMITS.polygonsPerGeometry, 'polygonCount');
  countValue(value.polygonVertexCount, FBX_GEOMETRY_LIMITS.polygonVerticesPerGeometry, 'polygonVertexCount');
  for (const key of ['emptyPolygonCount', 'pointPolygonCount', 'linePolygonCount']) countValue(value[key], value.polygonCount, key);
  if (typeof value.reversedWinding !== 'boolean') fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, 'reversedWinding is invalid.');
  for (const key of INDEX_KEYS) if (!Number.isSafeInteger(value.bufferIndices[key]) || value.bufferIndices[key] < 0) fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, `${key} buffer index is invalid.`);
}
function graphMeshMap(graph) {
  const map = new Map();
  for (const item of graph.geometries) {
    if (item.kind !== 'MESH') continue;
    if (!validId(item.geometryObjectId) || !validId(item.sourceObjectId) || map.has(item.geometryObjectId)) fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, 'Source graph mesh identity is invalid.');
    if (!Array.isArray(item.verticesMm)) fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, 'Source graph mesh control points are invalid.');
    map.set(item.geometryObjectId, item);
  }
  return map;
}
function expectedLengths(item) {
  const points = checkedProduct([item.controlPointCount, 3, 8], 'control point byte length');
  const offsets = checkedProduct([checkedSum([item.polygonCount, 1], 'offset count'), 4], 'offset byte length');
  const indices = checkedProduct([item.polygonVertexCount, 4], 'index byte length');
  for (const length of [points, offsets, indices]) if (length > FBX_GEOMETRY_LIMITS.individualBufferBytes) fail(FBX_GEOMETRY_ERROR_CODES.LIMIT_EXCEEDED, 'An individual geometry buffer exceeds the programme limit.');
  return [points, offsets, indices];
}
function canonicalPoints(bytes, item, graphMesh) {
  const input = new DataView(bytes), output = new ArrayBuffer(bytes.byteLength), result = new DataView(output);
  if (graphMesh.verticesMm.length !== item.controlPointCount) fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, 'Control point count differs from the source graph.');
  for (let index = 0; index < item.controlPointCount; index += 1) {
    const expected = graphMesh.verticesMm[index];
    if (!Array.isArray(expected) || expected.length !== 3) fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, 'Source graph control point is invalid.');
    for (let component = 0; component < 3; component += 1) {
      const value = input.getFloat64((index * 3 + component) * 8, true), normalized = value === 0 ? 0 : value;
      if (!Number.isFinite(value) || !Number.isFinite(expected[component]) || normalized !== (expected[component] === 0 ? 0 : expected[component])) fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, 'Control point bytes differ from the source graph.');
      result.setFloat64((index * 3 + component) * 8, normalized, true);
    }
  }
  return output;
}
function canonicalOffsets(bytes, item) {
  const input = new DataView(bytes), output = new ArrayBuffer(bytes.byteLength), result = new DataView(output);
  let previous = 0, empty = 0, point = 0, line = 0;
  for (let index = 0; index <= item.polygonCount; index += 1) {
    const value = input.getUint32(index * 4, true);
    if ((index === 0 && value !== 0) || value < previous || value > item.polygonVertexCount) fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, 'Polygon offsets are invalid.');
    if (index > 0) { const size = value - previous; empty += size === 0; point += size === 1; line += size === 2; }
    result.setUint32(index * 4, value, true); previous = value;
  }
  if (previous !== item.polygonVertexCount || empty !== item.emptyPolygonCount || point !== item.pointPolygonCount || line !== item.linePolygonCount) fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, 'Polygon offset counts are inconsistent.');
  return output;
}
function canonicalIndices(bytes, item) {
  const input = new DataView(bytes), output = new ArrayBuffer(bytes.byteLength), result = new DataView(output);
  for (let index = 0; index < item.polygonVertexCount; index += 1) {
    const value = input.getUint32(index * 4, true);
    if (value >= item.controlPointCount) fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, 'Polygon vertex index is out of range.');
    result.setUint32(index * 4, value, true);
  }
  return output;
}
function canonicalGeometry(item, graphMesh, buffers, used, outputIndex) {
  if (graphMesh.sourceObjectId !== item.sourceObjectId) fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, 'Geometry source identity differs from the source graph.');
  const original = INDEX_KEYS.map((key) => item.bufferIndices[key]);
  if (new Set(original).size !== 3 || original.some((index) => index >= buffers.length || used.has(index))) fail(FBX_GEOMETRY_ERROR_CODES.BUFFER_INVALID, 'Geometry buffer indices are duplicate or unresolved.');
  original.forEach((index) => used.add(index));
  const copies = original.map((index, role) => { const bytes = ordinaryBytes(buffers[index], `buffers[${index}]`); if (bytes.byteLength !== expectedLengths(item)[role]) fail(FBX_GEOMETRY_ERROR_CODES.BUFFER_INVALID, 'Geometry buffer byte length is invalid.'); return bytes; });
  const canonical = [canonicalPoints(copies[0], item, graphMesh), canonicalOffsets(copies[1], item), canonicalIndices(copies[2], item)];
  const descriptor = structuredClone(item); descriptor.bufferIndices = { controlPointsMm: outputIndex, polygonOffsets: outputIndex + 1, polygonVertexIndices: outputIndex + 2 };
  return { descriptor, buffers: canonical };
}
export function validateFbxRawMeshTopology({ rawTopology, buffers }) {
  exactKeys(rawTopology, TOP_KEYS, 'rawTopology');
  if (rawTopology.schema !== FBX_RAW_MESH_TOPOLOGY_SCHEMA || !Array.isArray(rawTopology.geometries) || !Array.isArray(buffers)) fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, 'Raw topology envelope is invalid.');
  if (rawTopology.geometries.length > FBX_GEOMETRY_LIMITS.geometries) fail(FBX_GEOMETRY_ERROR_CODES.LIMIT_EXCEEDED, 'Geometry count exceeds the programme limit.');
  const graph = enforceSourceGraphPolicy(rawTopology.sourceGraph), graphMeshes = graphMeshMap(graph);
  rawTopology.geometries.forEach(validateDescriptor); const ordered = [...rawTopology.geometries].sort(compareId);
  if (new Set(ordered.map((item) => item.geometryObjectId)).size !== ordered.length || ordered.length !== graphMeshes.size) fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, 'Raw topology mesh identities are incomplete or duplicate.');
  const used = new Set(), canonicalBuffers = [], geometries = [];
  for (const item of ordered) {
    const graphMesh = graphMeshes.get(item.geometryObjectId);
    if (!graphMesh) fail(FBX_GEOMETRY_ERROR_CODES.TOPOLOGY_INVALID, 'Raw topology references an unknown mesh.');
    const result = canonicalGeometry(item, graphMesh, buffers, used, canonicalBuffers.length);
    geometries.push(result.descriptor); canonicalBuffers.push(...result.buffers);
  }
  if (used.size !== buffers.length || canonicalBuffers.length !== ordered.length * 3) fail(FBX_GEOMETRY_ERROR_CODES.BUFFER_INVALID, 'Raw topology contains missing or unexpected buffers.');
  const totalBytes = checkedSum(canonicalBuffers.map((item) => item.byteLength), 'total geometry bytes');
  if (totalBytes > FBX_GEOMETRY_LIMITS.totalBufferBytes) fail(FBX_GEOMETRY_ERROR_CODES.LIMIT_EXCEEDED, 'Total geometry bytes exceed the programme limit.');
  return { rawTopology: deepFreeze({ schema: FBX_RAW_MESH_TOPOLOGY_SCHEMA, sourceGraph: graph, geometries }), buffers: canonicalBuffers };
}
