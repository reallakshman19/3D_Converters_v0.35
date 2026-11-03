import { createHash } from 'node:crypto';

const SHA1_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function fail(code, message) {
  throw new TypeError(`${code} ${message}`);
}

export function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('BLOCKED_AUDIT_CONTRACT', `${label} must be an object.`);
  }
  return value;
}

export function requireClosedObject(value, label, keys) {
  const object = requireObject(value, label);
  const actual = Object.keys(object).sort(stableCompare);
  const expected = [...keys].sort(stableCompare);
  if (actual.join('\0') !== expected.join('\0')) {
    fail('BLOCKED_AUDIT_CONTRACT', `${label} has missing or unexpected fields.`);
  }
  return object;
}

export function requireArray(value, label) {
  if (!Array.isArray(value)) fail('BLOCKED_AUDIT_CONTRACT', `${label} must be an array.`);
  return value;
}

export function requireText(value, label) {
  if (typeof value !== 'string' || !value) {
    fail('BLOCKED_AUDIT_CONTRACT', `${label} must be non-empty text.`);
  }
  return value;
}

export function requireEnum(value, allowed, label) {
  const text = requireText(value, label);
  if (!allowed.has(text)) fail('BLOCKED_AUDIT_VOCABULARY', `${label} has unknown value ${text}.`);
  return text;
}

export function requireBoolean(value, label) {
  if (typeof value !== 'boolean') fail('BLOCKED_AUDIT_CONTRACT', `${label} must be boolean.`);
  return value;
}

export function requireNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('BLOCKED_AUDIT_CONTRACT', `${label} must be a non-negative safe integer.`);
  }
  return value;
}

export function requirePositiveInteger(value, label) {
  const integer = requireNonNegativeInteger(value, label);
  if (integer < 1) fail('BLOCKED_AUDIT_CONTRACT', `${label} must be positive.`);
  return integer;
}

export function requireSha1(value, label) {
  const text = requireText(value, label);
  if (!SHA1_PATTERN.test(text)) fail('BLOCKED_AUDIT_CONTRACT', `${label} must be lowercase SHA-1.`);
  return text;
}

export function requireSha256(value, label) {
  const text = requireText(value, label);
  if (!SHA256_PATTERN.test(text)) fail('BLOCKED_AUDIT_CONTRACT', `${label} must be lowercase SHA-256.`);
  return text;
}

export function stableCompare(left, right) {
  const a = String(left), b = String(right);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function sortedUniqueText(values, label) {
  const result = requireArray(values, label).map((value, index) => requireText(value, `${label}[${index}]`));
  if (new Set(result).size !== result.length) fail('BLOCKED_AUDIT_IDENTITY', `${label} contains duplicates.`);
  return [...result].sort(stableCompare);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort(stableCompare)
    .map((key) => [key, canonicalValue(value[key])]));
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function canonicalSha256(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
