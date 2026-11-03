import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';

const ROOT_KEYS = ['authoritySha256', 'benchmarkCommit', 'invocation', 'producers', 'schema', 'status'];
const PRODUCER_KEYS = ['blobSha1', 'entrypoints', 'path', 'producerId', 'ruleIds'];
const INVOCATION_KEYS = [
  'candidateInputKind', 'generationCommandStatus', 'inputIdentityStatus',
  'routingOptionsStatus', 'supportMapperConfigStatus',
];
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
}
function assertKeys(value, expected, label) {
  assertObject(value, label);
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new Error(`${label} has an invalid shape.`);
}
function assertStrings(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !value)) {
    throw new Error(`${label} must contain non-empty strings.`);
  }
}
function validateProducer(producer) {
  assertKeys(producer, PRODUCER_KEYS, 'producer');
  for (const key of ['producerId', 'path']) if (typeof producer[key] !== 'string' || !producer[key]) throw new Error(`producer.${key} is required.`);
  if (!HEX40.test(producer.blobSha1)) throw new Error('producer.blobSha1 is invalid.');
  assertStrings(producer.entrypoints, 'producer.entrypoints');
  assertStrings(producer.ruleIds, 'producer.ruleIds');
}
function validateInvocation(invocation) {
  assertKeys(invocation, INVOCATION_KEYS, 'invocation');
  if (invocation.candidateInputKind !== 'RMSS_ATTRIBUTE_TEXT') throw new Error('candidateInputKind is not admitted.');
  for (const key of INVOCATION_KEYS.filter((item) => item !== 'candidateInputKind')) {
    if (invocation[key] !== 'UNBOUND') throw new Error(`${key} must remain UNBOUND.`);
  }
}
export function validateProducerAuthorityShape(authority) {
  assertKeys(authority, ROOT_KEYS, 'authority');
  if (authority.schema !== 'FbxBenchmarkProducerAuthority.v1') throw new Error('Invalid producer authority schema.');
  if (!HEX64.test(authority.authoritySha256)) throw new Error('Invalid authority SHA-256.');
  if (!HEX40.test(authority.benchmarkCommit)) throw new Error('Invalid benchmark commit.');
  if (!Array.isArray(authority.producers) || !authority.producers.length) throw new Error('At least one producer is required.');
  authority.producers.forEach(validateProducer);
  validateInvocation(authority.invocation);
  if (authority.status !== 'BLOCKED') throw new Error('Producer authority must remain BLOCKED.');
  return authority;
}
function hashPayload(authority) { return { ...authority, authoritySha256: null }; }
export async function computeProducerAuthoritySha256(authority) {
  return sha256Hex(canonicalJson(hashPayload(authority)));
}
export async function sealProducerAuthority(authority) {
  const draft = structuredClone(authority);
  draft.authoritySha256 = '0'.repeat(64);
  validateProducerAuthorityShape(draft);
  draft.authoritySha256 = await computeProducerAuthoritySha256(draft);
  return deepFreeze(draft);
}
export async function verifyProducerAuthority(authority) {
  validateProducerAuthorityShape(authority);
  const actual = await computeProducerAuthoritySha256(authority);
  if (actual !== authority.authoritySha256) throw new Error('Producer authority hash mismatch.');
  return deepFreeze(structuredClone(authority));
}
function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new TextEncoder().encode(String(value));
}
export async function gitBlobSha1(value) {
  const bytes = bytesOf(value), prefix = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const payload = new Uint8Array(prefix.byteLength + bytes.byteLength);
  payload.set(prefix); payload.set(bytes, prefix.byteLength);
  const { webcrypto } = await import('node:crypto');
  const digest = await webcrypto.subtle.digest('SHA-1', payload);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('');
}
export async function verifyProducerFiles(authority, filesByPath) {
  const verified = await verifyProducerAuthority(authority);
  for (const producer of verified.producers) {
    if (!Object.hasOwn(filesByPath, producer.path)) throw new Error(`Missing producer file: ${producer.path}`);
    if (await gitBlobSha1(filesByPath[producer.path]) !== producer.blobSha1) throw new Error(`Producer blob mismatch: ${producer.path}`);
  }
  return verified;
}
