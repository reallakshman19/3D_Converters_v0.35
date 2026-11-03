import { canonicalJson } from '../canonical-json.js';

export const REPORT_SCHEMA = 'FbxComponentBenchmarkReport.v1';
export const POLICY_SCHEMA = 'FbxComponentIdentityPolicy.v1';

export const COMPONENT_FAMILIES = Object.freeze([
  'PIPE', 'ELBOW', 'TEE', 'REDUCER', 'FLANGE', 'VALVE',
  'GASKET', 'BRANCH_FITTING', 'INSTRUMENT',
]);

export const PASSING_STATES = new Set(['EXACT_MATCH', 'APPROVED_EQUIVALENT']);
export const GEOMETRY_FIELDS = new Set([
  'position', 'startPoint', 'endPoint', 'length', 'angle', 'orientation',
]);

export const BUILTIN_NORMALIZERS = Object.freeze({
  trim: (value) => typeof value === 'string' ? value.trim() : value,
  uppercase: (value) => typeof value === 'string' ? value.toUpperCase() : value,
  'normalize-slashes': (value) => typeof value === 'string'
    ? value.replace(/\\/g, '/').replace(/\/{2,}/g, '/') : value,
});

export function fail(message) {
  throw new Error(`BLOCKED_COMPONENT_BENCHMARK ${message}`);
}

export function compareText(left, right) {
  const a = String(left ?? ''), b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function requireObject(value, label) {
  if (!isObject(value)) fail(`${label} must be an object.`);
  return value;
}

export function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} is required.`);
  return value;
}

export function requireBoolean(value, label) {
  if (typeof value !== 'boolean') fail(`${label} must be boolean.`);
  return value;
}

export function requireArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  return value;
}

export function exactKeys(record, allowed, label) {
  const keys = Object.keys(requireObject(record, label));
  for (const key of keys) if (!allowed.includes(key)) fail(`${label}.${key} is not allowed.`);
}

export function stringArray(value, label, { allowEmpty = true } = {}) {
  const result = requireArray(value, label)
    .map((item, index) => requireText(item, `${label}[${index}]`));
  if (!allowEmpty && !result.length) fail(`${label} must not be empty.`);
  if (new Set(result).size !== result.length) fail(`${label} contains duplicates.`);
  return result;
}

export function fnv1a64(text) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, '0');
}

export function cloneJson(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function point(value) {
  if (!isObject(value)) return null;
  const result = { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
  return Object.values(result).every(Number.isFinite) ? result : null;
}

export function parseScalar(value, unit) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const expression = unit === 'mm'
    ? /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:mm)?\s*$/i
    : /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:(?:degree|deg))?\s*$/i;
  const match = value.match(expression);
  return match ? Number(match[1]) : null;
}

export function pointDistance(reference, actual) {
  return Math.hypot(
    reference.x - actual.x,
    reference.y - actual.y,
    reference.z - actual.z,
  );
}

export function canonicalKey(value) {
  return canonicalJson(value).trimEnd();
}
