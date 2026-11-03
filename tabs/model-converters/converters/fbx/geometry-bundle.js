import { canonicalJson, deepFreeze } from './canonical-json.js';
import { sha256Hex } from './sha256.js';
import {
  FBX_GEOMETRY_ERROR_CODES, FBX_GEOMETRY_LIMITS, FBX_GEOMETRY_LIMITS_VERSION,
  FbxGeometryContractError, validateFbxRawMeshTopology,
} from './mesh-topology.js';

export const FBX_GEOMETRY_BUNDLE_SCHEMA = 'FbxGeometryBundle.v1';
export const FBX_GEOMETRY_BUFFER_ROLES = deepFreeze([
  'control-points-mm', 'polygon-offsets', 'polygon-vertex-indices',
]);

const HASH = /^[0-9a-f]{64}$/;
const DECIMAL_ID = /^(0|[1-9]\d{0,19})$/;
const MAX_OBJECT_ID = 18446744073709551615n;
const REVISION = /^[0-9a-f]{40}$/;
const MANIFEST_KEYS = [
  'schema', 'sourceGraphSchema', 'sourceGraphSha256', 'sourceIdentity',
  'parserIdentity', 'coordinateUnit', 'byteOrder', 'triangleDerivation',
  'limitsVersion', 'geometries', 'buffers', 'bundleDigest',
];
const GEOMETRY_KEYS = [
  'geometryObjectId', 'sourceObjectId', 'controlPointCount', 'polygonCount',
  'polygonVertexCount', 'emptyPolygonCount', 'pointPolygonCount',
  'linePolygonCount', 'reversedWinding', 'bufferIds',
];
const BUFFER_KEYS = [
  'bufferId', 'geometryObjectId', 'role', 'scalarType', 'componentCount',
  'count', 'alignment', 'byteLength', 'sha256',
];
const SOURCE_KEYS = ['sha256', 'byteLength', 'fbxVersion'];
const PARSER_KEYS = ['provenanceSchema', 'upstreamRevision', 'sourceSha256', 'wasmSha256'];
const TRIANGLE_KEYS = ['status', 'rule'];
const BUFFER_ID_KEYS = ['controlPointsMm', 'polygonOffsets', 'polygonVertexIndices'];
const ROLE_SPECS = deepFreeze({
  'control-points-mm': { scalarType: 'Float64', componentCount: 3, alignment: 8 },
  'polygon-offsets': { scalarType: 'Uint32', componentCount: 1, alignment: 4 },
  'polygon-vertex-indices': { scalarType: 'Uint32', componentCount: 1, alignment: 4 },
});

function validId(value) { return typeof value === 'string' && DECIMAL_ID.test(value) && BigInt(value) <= MAX_OBJECT_ID; }
function fail(code, message) { throw new FbxGeometryContractError(code, message); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(FBX_GEOMETRY_ERROR_CODES.BUNDLE_INVALID, `${label} must be an object.`);
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (actual.join('\0') !== expected.join('\0')) fail(FBX_GEOMETRY_ERROR_CODES.BUNDLE_INVALID, `${label} fields are invalid.`);
}
function checkedProduct(values, label) {
  let value = 1;
  for (const item of values) {
    if (!Number.isSafeInteger(item) || item < 0 || (item && value > Number.MAX_SAFE_INTEGER / item)) fail(FBX_GEOMETRY_ERROR_CODES.INTEGER_OVERFLOW, `${label} overflowed.`);
    value *= item;
  }
  return value;
}
function validateSourceIdentity(value, version = null) {
  exactKeys(value, SOURCE_KEYS, 'sourceIdentity');
  if (!HASH.test(value.sha256) || !Number.isSafeInteger(value.byteLength) || value.byteLength < 1 || !Number.isInteger(value.fbxVersion) || value.fbxVersion < 3000 || value.fbxVersion > 7700) fail(FBX_GEOMETRY_ERROR_CODES.BUNDLE_INVALID, 'sourceIdentity is invalid.');
  if (version !== null && value.fbxVersion !== version) fail(FBX_GEOMETRY_ERROR_CODES.BUNDLE_INVALID, 'sourceIdentity version differs from the source graph.');
}
function validateParserIdentity(value) {
  exactKeys(value, PARSER_KEYS, 'parserIdentity');
  if (typeof value.provenanceSchema !== 'string' || !value.provenanceSchema || !REVISION.test(value.upstreamRevision) || !HASH.test(value.sourceSha256) || !HASH.test(value.wasmSha256)) fail(FBX_GEOMETRY_ERROR_CODES.BUNDLE_INVALID, 'parserIdentity is invalid.');
}
function concatBytes(...values) {
  const arrays = values.map((value) => typeof value === 'string' ? new TextEncoder().encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value));
  const size = arrays.reduce((sum, item) => sum + item.byteLength, 0), result = new Uint8Array(size);
  let offset = 0; for (const item of arrays) { result.set(item, offset); offset += item.byteLength; }
  return result;
}
function roleCount(geometry, role) {
  if (role === 'control-points-mm') return geometry.controlPointCount;
  if (role === 'polygon-offsets') return geometry.polygonCount + 1;
  return geometry.polygonVertexCount;
}
function bufferId(geometryId, role) { return `geometry/${geometryId}/${role}`; }
function descriptorFor(geometry, role, bytes, sha256) {
  const spec = ROLE_SPECS[role], count = roleCount(geometry, role);
  return { bufferId: bufferId(geometry.geometryObjectId, role), geometryObjectId: geometry.geometryObjectId, role,
    scalarType: spec.scalarType, componentCount: spec.componentCount, count, alignment: spec.alignment,
    byteLength: bytes.byteLength, sha256 };
}
function geometryFor(raw) {
  const ids = Object.fromEntries(FBX_GEOMETRY_BUFFER_ROLES.map((role) => [role === 'control-points-mm' ? 'controlPointsMm' : role === 'polygon-offsets' ? 'polygonOffsets' : 'polygonVertexIndices', bufferId(raw.geometryObjectId, role)]));
  return { geometryObjectId: raw.geometryObjectId, sourceObjectId: raw.sourceObjectId,
    controlPointCount: raw.controlPointCount, polygonCount: raw.polygonCount,
    polygonVertexCount: raw.polygonVertexCount, emptyPolygonCount: raw.emptyPolygonCount,
    pointPolygonCount: raw.pointPolygonCount, linePolygonCount: raw.linePolygonCount,
    reversedWinding: raw.reversedWinding, bufferIds: ids };
}
async function bundleDigest(value) {
  const clone = structuredClone(value); delete clone.bundleDigest;
  return sha256Hex(concatBytes('FbxGeometryBundle.v1\0', canonicalJson(clone)));
}
function freezeBundle(value) {
  deepFreeze(value.manifest);
  value.buffers.forEach((item) => Object.freeze(item));
  Object.freeze(value.buffers);
  return Object.freeze(value);
}
export async function buildFbxGeometryBundle({ rawTopology, buffers, sourceIdentity, parserIdentity }) {
  const validated = validateFbxRawMeshTopology({ rawTopology, buffers }), graph = validated.rawTopology.sourceGraph;
  validateSourceIdentity(sourceIdentity, graph.file?.version); validateParserIdentity(parserIdentity);
  const geometries = validated.rawTopology.geometries.map(geometryFor), outputBuffers = [], descriptors = [];
  for (let index = 0; index < geometries.length; index += 1) {
    for (let roleIndex = 0; roleIndex < FBX_GEOMETRY_BUFFER_ROLES.length; roleIndex += 1) {
      const role = FBX_GEOMETRY_BUFFER_ROLES[roleIndex], bytes = validated.buffers[index * 3 + roleIndex];
      const id = bufferId(geometries[index].geometryObjectId, role), copy = bytes.slice(0);
      descriptors.push(descriptorFor(geometries[index], role, copy, await sha256Hex(copy)));
      outputBuffers.push({ bufferId: id, bytes: copy });
    }
  }
  const manifest = { schema: FBX_GEOMETRY_BUNDLE_SCHEMA, sourceGraphSchema: 'FbxSourceGraph.v2',
    sourceGraphSha256: await sha256Hex(canonicalJson(graph)), sourceIdentity: structuredClone(sourceIdentity),
    parserIdentity: structuredClone(parserIdentity), coordinateUnit: 'millimetre', byteOrder: 'little-endian',
    triangleDerivation: { status: 'not-derived', rule: null }, limitsVersion: FBX_GEOMETRY_LIMITS_VERSION,
    geometries, buffers: descriptors, bundleDigest: '' };
  manifest.bundleDigest = await bundleDigest(manifest);
  await validateFbxGeometryBundle({ manifest, buffers: outputBuffers });
  return freezeBundle({ manifest, buffers: outputBuffers });
}
function validateGeometry(value, index, previous) {
  exactKeys(value, GEOMETRY_KEYS, `geometries[${index}]`); exactKeys(value.bufferIds, BUFFER_ID_KEYS, `geometries[${index}].bufferIds`);
  for (const key of ['geometryObjectId', 'sourceObjectId']) if (!validId(value[key])) fail(FBX_GEOMETRY_ERROR_CODES.BUNDLE_INVALID, `${key} is invalid.`);
  for (const key of ['controlPointCount', 'polygonCount', 'polygonVertexCount', 'emptyPolygonCount', 'pointPolygonCount', 'linePolygonCount']) if (!Number.isSafeInteger(value[key]) || value[key] < 0) fail(FBX_GEOMETRY_ERROR_CODES.BUNDLE_INVALID, `${key} is invalid.`);
  if (value.controlPointCount > FBX_GEOMETRY_LIMITS.controlPointsPerGeometry || value.polygonCount > FBX_GEOMETRY_LIMITS.polygonsPerGeometry || value.polygonVertexCount > FBX_GEOMETRY_LIMITS.polygonVerticesPerGeometry) fail(FBX_GEOMETRY_ERROR_CODES.LIMIT_EXCEEDED, 'Geometry counts exceed the programme limit.');
  if (typeof value.reversedWinding !== 'boolean' || value.emptyPolygonCount > value.polygonCount || value.pointPolygonCount > value.polygonCount || value.linePolygonCount > value.polygonCount) fail(FBX_GEOMETRY_ERROR_CODES.BUNDLE_INVALID, 'Geometry counts or winding are invalid.');
  if (previous && (BigInt(previous.geometryObjectId) > BigInt(value.geometryObjectId) || previous.geometryObjectId === value.geometryObjectId)) fail(FBX_GEOMETRY_ERROR_CODES.BUNDLE_INVALID, 'Geometry order or identity is invalid.');
  const expected = { controlPointsMm: bufferId(value.geometryObjectId, 'control-points-mm'), polygonOffsets: bufferId(value.geometryObjectId, 'polygon-offsets'), polygonVertexIndices: bufferId(value.geometryObjectId, 'polygon-vertex-indices') };
  if (JSON.stringify(value.bufferIds) !== JSON.stringify(expected)) fail(FBX_GEOMETRY_ERROR_CODES.BUNDLE_INVALID, 'Geometry buffer IDs are invalid.');
}
function validateDescriptor(value, index, geometry, role) {
  exactKeys(value, BUFFER_KEYS, `buffers[${index}]`); const spec = ROLE_SPECS[role], count = roleCount(geometry, role);
  const byteLength = checkedProduct([count, spec.componentCount, spec.scalarType === 'Float64' ? 8 : 4], 'buffer byte length');
  if (value.bufferId !== bufferId(geometry.geometryObjectId, role) || value.geometryObjectId !== geometry.geometryObjectId || value.role !== role || value.scalarType !== spec.scalarType || value.componentCount !== spec.componentCount || value.count !== count || value.alignment !== spec.alignment || value.byteLength !== byteLength || !HASH.test(value.sha256)) fail(FBX_GEOMETRY_ERROR_CODES.BUNDLE_INVALID, 'Buffer descriptor is invalid.');
  if (byteLength > FBX_GEOMETRY_LIMITS.individualBufferBytes) fail(FBX_GEOMETRY_ERROR_CODES.LIMIT_EXCEEDED, 'Buffer descriptor exceeds the programme limit.');
}
function validateTopologyBytes(geometry, byId) {
  const points = byId.get(geometry.bufferIds.controlPointsMm), offsets = byId.get(geometry.bufferIds.polygonOffsets), indices = byId.get(geometry.bufferIds.polygonVertexIndices);
  const pointView = new DataView(points), offsetView = new DataView(offsets), indexView = new DataView(indices);
  for (let index = 0; index < geometry.controlPointCount * 3; index += 1) { const value = pointView.getFloat64(index * 8, true); if (!Number.isFinite(value) || Object.is(value, -0)) fail(FBX_GEOMETRY_ERROR_CODES.BUNDLE_INVALID, 'Control point buffer is non-canonical.'); }
  let previous = 0, empty = 0, point = 0, line = 0;
  for (let index = 0; index <= geometry.polygonCount; index += 1) { const value = offsetView.getUint32(index * 4, true); if ((index === 0 && value !== 0) || value < previous || value > geometry.polygonVertexCount) fail(FBX_GEOMETRY_ERROR_CODES.BUNDLE_INVALID, 'Polygon offsets are invalid.'); if (index) { const size = value - previous; empty += size === 0; point += size === 1; line += size === 2; } previous = value; }
  if (previous !== geometry.polygonVertexCount || empty !== geometry.emptyPolygonCount || point !== geometry.pointPolygonCount || line !== geometry.linePolygonCount) fail(FBX_GEOMETRY_ERROR_CODES.BUNDLE_INVALID, 'Polygon offset counts are invalid.');
  for (let index = 0; index < geometry.polygonVertexCount; index += 1) if (indexView.getUint32(index * 4, true) >= geometry.controlPointCount) fail(FBX_GEOMETRY_ERROR_CODES.BUNDLE_INVALID, 'Polygon vertex index is out of range.');
}
async function validateBuffers(manifest, buffers) {
  if (!Array.isArray(buffers) || buffers.length !== manifest.buffers.length) fail(FBX_GEOMETRY_ERROR_CODES.BUFFER_INVALID, 'Bundle buffers are incomplete.');
  const byId = new Map(), identities = new Set();
  for (let index = 0; index < buffers.length; index += 1) {
    const item = buffers[index];
    exactKeys(item, ['bufferId', 'bytes'], 'bundle buffer');
    if (item.bufferId !== manifest.buffers[index].bufferId) fail(FBX_GEOMETRY_ERROR_CODES.BUFFER_INVALID, 'Bundle buffer order is invalid.');
    if (typeof item.bufferId !== 'string' || !(item.bytes instanceof ArrayBuffer) || (typeof SharedArrayBuffer !== 'undefined' && item.bytes instanceof SharedArrayBuffer) || byId.has(item.bufferId) || identities.has(item.bytes)) fail(FBX_GEOMETRY_ERROR_CODES.BUFFER_INVALID, 'Bundle buffer identity is invalid.');
    byId.set(item.bufferId, item.bytes); identities.add(item.bytes);
  }
  for (const descriptor of manifest.buffers) { const bytes = byId.get(descriptor.bufferId); if (!bytes || bytes.byteLength !== descriptor.byteLength) fail(FBX_GEOMETRY_ERROR_CODES.BUFFER_INVALID, 'Bundle buffer length is invalid.'); if (await sha256Hex(bytes) !== descriptor.sha256) fail(FBX_GEOMETRY_ERROR_CODES.DIGEST_MISMATCH, 'Bundle buffer digest differs from the manifest.'); }
  manifest.geometries.forEach((geometry) => validateTopologyBytes(geometry, byId));
}
export async function validateFbxGeometryBundle({ manifest, buffers }) {
  exactKeys(manifest, MANIFEST_KEYS, 'manifest');
  if (manifest.schema !== FBX_GEOMETRY_BUNDLE_SCHEMA || manifest.sourceGraphSchema !== 'FbxSourceGraph.v2' || !HASH.test(manifest.sourceGraphSha256) || manifest.coordinateUnit !== 'millimetre' || manifest.byteOrder !== 'little-endian' || manifest.limitsVersion !== FBX_GEOMETRY_LIMITS_VERSION || !HASH.test(manifest.bundleDigest)) fail(FBX_GEOMETRY_ERROR_CODES.BUNDLE_INVALID, 'Manifest identity is invalid.');
  validateSourceIdentity(manifest.sourceIdentity); validateParserIdentity(manifest.parserIdentity); exactKeys(manifest.triangleDerivation, TRIANGLE_KEYS, 'triangleDerivation');
  if (manifest.triangleDerivation.status !== 'not-derived' || manifest.triangleDerivation.rule !== null || !Array.isArray(manifest.geometries) || !Array.isArray(manifest.buffers) || manifest.geometries.length > FBX_GEOMETRY_LIMITS.geometries || manifest.buffers.length !== manifest.geometries.length * 3) fail(FBX_GEOMETRY_ERROR_CODES.BUNDLE_INVALID, 'Manifest topology is invalid.');
  manifest.geometries.forEach((item, index) => validateGeometry(item, index, manifest.geometries[index - 1]));
  for (let index = 0; index < manifest.geometries.length; index += 1) for (let roleIndex = 0; roleIndex < 3; roleIndex += 1) validateDescriptor(manifest.buffers[index * 3 + roleIndex], index * 3 + roleIndex, manifest.geometries[index], FBX_GEOMETRY_BUFFER_ROLES[roleIndex]);
  const totalBytes = manifest.buffers.reduce((sum, item) => sum + item.byteLength, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > FBX_GEOMETRY_LIMITS.totalBufferBytes) fail(FBX_GEOMETRY_ERROR_CODES.LIMIT_EXCEEDED, 'Total bundle bytes exceed the programme limit.');
  await validateBuffers(manifest, buffers);
  if (await bundleDigest(manifest) !== manifest.bundleDigest) fail(FBX_GEOMETRY_ERROR_CODES.DIGEST_MISMATCH, 'Bundle digest is invalid.');
  return { manifest, buffers };
}
