import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';

const SOURCE_KEYS = ['byteLength', 'fbx', 'fileName', 'sha256', 'storage'];
const STORAGE_KEYS = ['fileId', 'provider', 'revisionId'];
const FBX_KEYS = ['creationTime', 'creator', 'encoding', 'fileId', 'globalSettings', 'version'];
const SETTINGS_KEYS = [
  'coordAxis', 'coordAxisSign', 'frontAxis', 'frontAxisSign',
  'originalUnitScaleFactor', 'unitScaleFactor', 'upAxis', 'upAxisSign',
];
const BENCHMARK_KEYS = ['commit', 'gitBlobSha1', 'inventory', 'path', 'repository'];
const INVENTORY_KEYS = ['branchRecords', 'childRecords', 'supportRecords', 'totalRecords'];
const LINEAGE_KEYS = [
  'benchmarkBranchCount', 'benchmarkChildCount', 'certificationStatus',
  'commonModelStatus', 'derivationStatus', 'netAdditionalBenchmarkRecords',
  'sourceBranchRootCount', 'sourceDirectBranchChildCount',
];
const ROOT_KEYS = ['benchmark', 'bindingSha256', 'lineage', 'schema', 'source'];
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const FBX_MAGIC = new TextEncoder().encode('Kaydara FBX Binary  \u0000\u001a\u0000');

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
}
function assertExactKeys(value, expected, label) {
  assertObject(value, label);
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new Error(`${label} has an invalid shape.`);
}
function assertText(value, label) {
  if (typeof value !== 'string' || !value) throw new Error(`${label} must be non-empty text.`);
}
function assertInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${label} must be an integer >= ${minimum}.`);
}
function assertNumber(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}
function assertHex(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`${label} has an invalid digest.`);
}
function assertEnum(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label} is not an admitted value.`);
}
function validateSource(source) {
  assertExactKeys(source, SOURCE_KEYS, 'source');
  assertText(source.fileName, 'source.fileName');
  assertInteger(source.byteLength, 'source.byteLength', 1);
  assertHex(source.sha256, HEX64, 'source.sha256');
  assertExactKeys(source.storage, STORAGE_KEYS, 'source.storage');
  assertEnum(source.storage.provider, ['GOOGLE_DRIVE'], 'source.storage.provider');
  assertText(source.storage.fileId, 'source.storage.fileId');
  assertText(source.storage.revisionId, 'source.storage.revisionId');
  validateFbx(source.fbx);
}
function validateFbx(fbx) {
  assertExactKeys(fbx, FBX_KEYS, 'source.fbx');
  assertEnum(fbx.encoding, ['BINARY'], 'source.fbx.encoding');
  assertInteger(fbx.version, 'source.fbx.version', 3000);
  if (fbx.version > 7700) throw new Error('source.fbx.version exceeds the admitted range.');
  assertHex(fbx.fileId, /^[0-9a-f]{32}$/, 'source.fbx.fileId');
  assertText(fbx.creator, 'source.fbx.creator');
  assertText(fbx.creationTime, 'source.fbx.creationTime');
  assertExactKeys(fbx.globalSettings, SETTINGS_KEYS, 'source.fbx.globalSettings');
  for (const key of SETTINGS_KEYS) assertNumber(fbx.globalSettings[key], `source.fbx.globalSettings.${key}`);
}
function validateBenchmark(benchmark) {
  assertExactKeys(benchmark, BENCHMARK_KEYS, 'benchmark');
  assertText(benchmark.repository, 'benchmark.repository');
  assertHex(benchmark.commit, HEX40, 'benchmark.commit');
  assertText(benchmark.path, 'benchmark.path');
  assertHex(benchmark.gitBlobSha1, HEX40, 'benchmark.gitBlobSha1');
  assertExactKeys(benchmark.inventory, INVENTORY_KEYS, 'benchmark.inventory');
  for (const key of INVENTORY_KEYS) assertInteger(benchmark.inventory[key], `benchmark.inventory.${key}`);
  if (benchmark.inventory.branchRecords + benchmark.inventory.childRecords !== benchmark.inventory.totalRecords) {
    throw new Error('benchmark.inventory does not conserve total records.');
  }
}
function validateLineage(lineage) {
  assertExactKeys(lineage, LINEAGE_KEYS, 'lineage');
  for (const key of LINEAGE_KEYS.filter((key) => key.endsWith('Count') || key.endsWith('Records'))) {
    assertInteger(lineage[key], `lineage.${key}`);
  }
  assertEnum(lineage.commonModelStatus, ['STRONGLY_SUPPORTED'], 'lineage.commonModelStatus');
  assertEnum(lineage.derivationStatus, ['UNPROVEN'], 'lineage.derivationStatus');
  assertEnum(lineage.certificationStatus, ['BLOCKED'], 'lineage.certificationStatus');
  const difference = lineage.benchmarkChildCount - lineage.sourceDirectBranchChildCount;
  if (difference !== lineage.netAdditionalBenchmarkRecords) throw new Error('lineage net record difference is inconsistent.');
}
export function validateFbxBenchmarkSourceBindingShape(binding) {
  assertExactKeys(binding, ROOT_KEYS, 'binding');
  assertEnum(binding.schema, ['FbxBenchmarkSourceBinding.v1'], 'binding.schema');
  validateSource(binding.source);
  validateBenchmark(binding.benchmark);
  validateLineage(binding.lineage);
  assertHex(binding.bindingSha256, HEX64, 'binding.bindingSha256');
  return binding;
}
function hashPayload(binding) { return { ...binding, bindingSha256: null }; }
export async function computeFbxBenchmarkSourceBindingSha256(binding) {
  return sha256Hex(canonicalJson(hashPayload(binding)));
}
export async function sealFbxBenchmarkSourceBinding(binding) {
  const draft = structuredClone(binding);
  draft.bindingSha256 = '0'.repeat(64);
  validateFbxBenchmarkSourceBindingShape(draft);
  draft.bindingSha256 = await computeFbxBenchmarkSourceBindingSha256(draft);
  return deepFreeze(draft);
}
export async function verifyFbxBenchmarkSourceBinding(binding) {
  validateFbxBenchmarkSourceBindingShape(binding);
  const actual = await computeFbxBenchmarkSourceBindingSha256(binding);
  if (actual !== binding.bindingSha256) throw new Error('FBX benchmark source binding hash mismatch.');
  return deepFreeze(structuredClone(binding));
}
function byteView(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(value);
}
function binaryFbxVersion(bytes) {
  if (bytes.byteLength < 27) throw new Error('FBX source is shorter than the binary header.');
  for (let index = 0; index < FBX_MAGIC.length; index += 1) {
    if (bytes[index] !== FBX_MAGIC[index]) throw new Error('FBX source is not an admitted binary FBX file.');
  }
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(23, true);
}
export async function verifyBoundFbxSourceBytes(binding, value) {
  const verified = await verifyFbxBenchmarkSourceBinding(binding);
  const bytes = byteView(value);
  if (bytes.byteLength !== verified.source.byteLength) throw new Error('FBX source byte length mismatch.');
  if (binaryFbxVersion(bytes) !== verified.source.fbx.version) throw new Error('FBX source version mismatch.');
  if (await sha256Hex(bytes) !== verified.source.sha256) throw new Error('FBX source SHA-256 mismatch.');
  return verified.source;
}
async function sha1Hex(value) {
  const bytes = byteView(value);
  const { webcrypto } = await import('node:crypto');
  const digest = await webcrypto.subtle.digest('SHA-1', bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('');
}
export async function gitBlobSha1(value) {
  const bytes = byteView(value), prefix = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const payload = new Uint8Array(prefix.byteLength + bytes.byteLength);
  payload.set(prefix); payload.set(bytes, prefix.byteLength);
  return sha1Hex(payload);
}
export async function verifyBoundBenchmarkBytes(binding, value) {
  const verified = await verifyFbxBenchmarkSourceBinding(binding);
  if (await gitBlobSha1(value) !== verified.benchmark.gitBlobSha1) throw new Error('Benchmark Git blob identity mismatch.');
  return verified.benchmark;
}
