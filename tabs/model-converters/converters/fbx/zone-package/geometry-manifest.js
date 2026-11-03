import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import { encodeSelectedGeometryBuffers } from './geometry-buffers.js';
import {
  FBX_ZONE_PACKAGE_BUFFER_ROLES, FBX_ZONE_PACKAGE_LIMITS,
  FBX_ZONE_PACKAGE_ROLE_SPECS, FBX_ZONE_PACKAGE_SCHEMAS, fail,
} from './constants.js';

const HASH = /^[0-9a-f]{64}$/;
const DECIMAL_ID = /^(0|[1-9]\d{0,19})$/;
const MANIFEST_KEYS = Object.freeze([
  'schema', 'completeSourceGraphSha256', 'selectedZoneDigest', 'sourceIdentity',
  'byteOrder', 'geometries', 'manifestDigest',
]);
const GEOMETRY_KEYS = Object.freeze([
  'geometryId', 'sourceObjectId', 'occurrenceIds', 'controlPointCount',
  'polygonCount', 'packagePath', 'buffers',
]);
const BUFFER_KEYS = Object.freeze([
  'role', 'scalarType', 'componentCount', 'count', 'byteLength', 'sha256', 'packagePath',
]);

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) {
    fail('ZONE_PACKAGE_INVALID_MANIFEST', `${label} fields are invalid.`);
  }
}
function requireDecimalId(value, label) {
  if (typeof value !== 'string' || !DECIMAL_ID.test(value)) {
    fail('ZONE_PACKAGE_INVALID_IDENTITY', `${label} must be a decimal-string identity.`);
  }
  return value;
}
function requireHash(value, label) {
  if (typeof value !== 'string' || !HASH.test(value)) {
    fail('ZONE_PACKAGE_INVALID_IDENTITY', `${label} must be a lowercase SHA-256 hex digest.`);
  }
  return value;
}
function requireSourceIdentity(value) {
  exactKeys(value, ['sha256', 'byteLength', 'fbxVersion'], 'sourceIdentity');
  requireHash(value.sha256, 'sourceIdentity.sha256');
  if (!Number.isSafeInteger(value.byteLength) || value.byteLength < 1) {
    fail('ZONE_PACKAGE_INVALID_IDENTITY', 'sourceIdentity.byteLength must be a positive integer.');
  }
  if (!Number.isInteger(value.fbxVersion) || value.fbxVersion < 3000 || value.fbxVersion > 7700) {
    fail('ZONE_PACKAGE_INVALID_IDENTITY', 'sourceIdentity.fbxVersion is out of the admitted range.');
  }
  return { sha256: value.sha256, byteLength: value.byteLength, fbxVersion: value.fbxVersion };
}
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function compareDecimalId(left, right) {
  const a = BigInt(left), b = BigInt(right); return a < b ? -1 : a > b ? 1 : 0;
}
function occurrenceIdsFor(entry) {
  const raw = Array.isArray(entry.occurrenceIds) ? entry.occurrenceIds : [entry.occurrenceId];
  const ids = raw.map((item) => String(item || '').trim());
  if (!ids.length || ids.some((item) => !item) || new Set(ids).size !== ids.length) {
    fail('ZONE_PACKAGE_INVALID_IDENTITY', 'occurrenceIds must be non-empty and unique.');
  }
  return ids.sort(compareText);
}
function bufferPackagePath(geometryId, role) { return `geometries/${geometryId}/${role}.bin`; }
async function buildManifestGeometry(entry) {
  requireDecimalId(entry.geometryId, 'geometryId');
  requireDecimalId(entry.sourceObjectId, 'sourceObjectId');
  const occurrenceIds = occurrenceIdsFor(entry);
  const encoded = await encodeSelectedGeometryBuffers(entry);
  const buffers = FBX_ZONE_PACKAGE_BUFFER_ROLES.map((role) => {
    const buffer = encoded.buffers[role];
    return { role, scalarType: buffer.scalarType, componentCount: buffer.componentCount,
      count: buffer.count, byteLength: buffer.byteLength, sha256: buffer.sha256,
      packagePath: bufferPackagePath(entry.geometryId, role) };
  });
  return { manifestEntry: { geometryId: entry.geometryId, sourceObjectId: entry.sourceObjectId,
    occurrenceIds, controlPointCount: encoded.controlPointCount, polygonCount: encoded.polygonCount,
    packagePath: `geometries/${entry.geometryId}/geometry.json`, buffers }, rawBuffers: encoded.buffers };
}
async function calculateSelectedZoneDigest(completeSourceGraphSha256, geometries) {
  const selection = geometries.map((item) => ({ geometryId: item.geometryId,
    sourceObjectId: item.sourceObjectId, occurrenceIds: [...item.occurrenceIds] }));
  return sha256Hex(canonicalJson({ completeSourceGraphSha256, selection }));
}
function manifestDigestPayload(manifest) { const payload = structuredClone(manifest); delete payload.manifestDigest; return payload; }
export async function calculateSelectedZoneGeometryManifestDigest(manifest) {
  return sha256Hex(canonicalJson(manifestDigestPayload(manifest)));
}
function validateBuffer(geometryId, buffer, index) {
  exactKeys(buffer, BUFFER_KEYS, `geometries[${geometryId}].buffers[${index}]`);
  const role = FBX_ZONE_PACKAGE_BUFFER_ROLES[index], spec = FBX_ZONE_PACKAGE_ROLE_SPECS[role];
  if (buffer.role !== role || buffer.scalarType !== spec.scalarType || buffer.componentCount !== spec.componentCount) {
    fail('ZONE_PACKAGE_INVALID_MANIFEST', `geometry ${geometryId} buffer ${index} role or scalar contract is invalid.`);
  }
  if (!Number.isSafeInteger(buffer.count) || buffer.count < 0
      || !Number.isSafeInteger(buffer.byteLength) || buffer.byteLength < 0) {
    fail('ZONE_PACKAGE_INVALID_MANIFEST', `geometry ${geometryId} buffer counts are invalid.`);
  }
  const expectedBytes = buffer.count * spec.componentCount * spec.bytesPerValue;
  if (buffer.byteLength !== expectedBytes || buffer.byteLength > FBX_ZONE_PACKAGE_LIMITS.maxGeometryBufferBytes) {
    fail('ZONE_PACKAGE_INVALID_MANIFEST', `geometry ${geometryId} buffer byteLength is inconsistent.`);
  }
  requireHash(buffer.sha256, `geometry ${geometryId} buffer sha256`);
  if (buffer.packagePath !== bufferPackagePath(geometryId, role)) {
    fail('ZONE_PACKAGE_INVALID_MANIFEST', `geometry ${geometryId} buffer packagePath is invalid.`);
  }
}
function validateGeometry(entry, priorId) {
  exactKeys(entry, GEOMETRY_KEYS, `geometry ${entry?.geometryId || '?'}`);
  requireDecimalId(entry.geometryId, 'geometryId'); requireDecimalId(entry.sourceObjectId, 'sourceObjectId');
  if (priorId !== null && compareDecimalId(priorId, entry.geometryId) >= 0) {
    fail('ZONE_PACKAGE_INVALID_MANIFEST', 'geometries must be strictly sorted by geometryId.');
  }
  if (canonicalJson(occurrenceIdsFor(entry)) !== canonicalJson(entry.occurrenceIds)) {
    fail('ZONE_PACKAGE_INVALID_MANIFEST', `geometry ${entry.geometryId} occurrenceIds must be sorted.`);
  }
  if (!Number.isSafeInteger(entry.controlPointCount) || entry.controlPointCount < 0
      || !Number.isSafeInteger(entry.polygonCount) || entry.polygonCount < 0) {
    fail('ZONE_PACKAGE_INVALID_MANIFEST', `geometry ${entry.geometryId} counts are invalid.`);
  }
  if (entry.packagePath !== `geometries/${entry.geometryId}/geometry.json`) {
    fail('ZONE_PACKAGE_INVALID_MANIFEST', `geometry ${entry.geometryId} packagePath is invalid.`);
  }
  if (!Array.isArray(entry.buffers) || entry.buffers.length !== 3) {
    fail('ZONE_PACKAGE_INVALID_MANIFEST', `geometry ${entry.geometryId} must provide exactly three buffers.`);
  }
  entry.buffers.forEach((buffer, index) => validateBuffer(entry.geometryId, buffer, index));
  if (entry.buffers[0].count !== entry.controlPointCount || entry.buffers[1].count !== entry.polygonCount + 1) {
    fail('ZONE_PACKAGE_INVALID_MANIFEST', `geometry ${entry.geometryId} descriptor counts differ from its buffers.`);
  }
  return entry.geometryId;
}

export async function validateSelectedZoneGeometryManifest(manifest) {
  exactKeys(manifest, MANIFEST_KEYS, 'manifest');
  if (manifest.schema !== FBX_ZONE_PACKAGE_SCHEMAS.geometryManifest || manifest.byteOrder !== 'little-endian') {
    fail('ZONE_PACKAGE_INVALID_MANIFEST', 'manifest identity is invalid.');
  }
  requireHash(manifest.completeSourceGraphSha256, 'completeSourceGraphSha256');
  requireHash(manifest.selectedZoneDigest, 'selectedZoneDigest'); requireHash(manifest.manifestDigest, 'manifestDigest');
  requireSourceIdentity(manifest.sourceIdentity);
  if (!Array.isArray(manifest.geometries) || !manifest.geometries.length
      || manifest.geometries.length > FBX_ZONE_PACKAGE_LIMITS.maxSelectedGeometries) {
    fail('ZONE_PACKAGE_INVALID_MANIFEST', 'manifest geometries are outside admitted limits.');
  }
  let priorId = null; for (const entry of manifest.geometries) priorId = validateGeometry(entry, priorId);
  if (await calculateSelectedZoneDigest(manifest.completeSourceGraphSha256, manifest.geometries) !== manifest.selectedZoneDigest) {
    fail('ZONE_PACKAGE_INVALID_MANIFEST', 'selectedZoneDigest is invalid.');
  }
  if (await calculateSelectedZoneGeometryManifestDigest(manifest) !== manifest.manifestDigest) {
    fail('ZONE_PACKAGE_INVALID_MANIFEST', 'manifestDigest is invalid.');
  }
  return manifest;
}

export async function buildSelectedZoneGeometryManifest({
  completeSourceGraphSha256, sourceIdentity, geometries,
} = {}) {
  requireHash(completeSourceGraphSha256, 'completeSourceGraphSha256');
  const identity = requireSourceIdentity(sourceIdentity);
  if (!Array.isArray(geometries) || !geometries.length) {
    fail('ZONE_PACKAGE_EMPTY_SELECTION', 'geometries must be a non-empty array.');
  }
  if (geometries.length > FBX_ZONE_PACKAGE_LIMITS.maxSelectedGeometries) {
    fail('ZONE_PACKAGE_LIMIT_EXCEEDED', `geometries exceeds ${FBX_ZONE_PACKAGE_LIMITS.maxSelectedGeometries}.`);
  }
  const seen = new Set();
  const built = await Promise.all(geometries.map(async (entry) => {
    if (seen.has(entry.geometryId)) fail('ZONE_PACKAGE_DUPLICATE_GEOMETRY', `duplicate geometryId ${entry.geometryId}.`);
    seen.add(entry.geometryId); return buildManifestGeometry(entry);
  }));
  built.sort((left, right) => compareDecimalId(left.manifestEntry.geometryId, right.manifestEntry.geometryId));
  const manifestGeometries = built.map((item) => item.manifestEntry);
  const payload = { schema: FBX_ZONE_PACKAGE_SCHEMAS.geometryManifest, completeSourceGraphSha256,
    selectedZoneDigest: await calculateSelectedZoneDigest(completeSourceGraphSha256, manifestGeometries),
    sourceIdentity: identity, byteOrder: 'little-endian', geometries: manifestGeometries };
  const manifest = deepFreeze({ ...payload, manifestDigest: await sha256Hex(canonicalJson(payload)) });
  await validateSelectedZoneGeometryManifest(manifest);
  return { manifest, buffersByGeometryId: new Map(built.map((item) => [item.manifestEntry.geometryId, item.rawBuffers])) };
}
