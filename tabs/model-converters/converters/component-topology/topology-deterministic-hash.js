/**
 * Deterministic topology artifact hashing.
 * Object keys are sorted by ECMAScript UTF-16 code-unit order, array order is
 * preserved, negative zero is normalized to zero, and finite numbers use the
 * exact ECMAScript JSON.stringify lexical form. Selected self-hash keys are
 * omitted. Null-prototype records preserve keys such as __proto__ as ordinary
 * data. Unpaired UTF-16 surrogates are rejected before UTF-8 hashing.
 */

const DEFAULT_OMIT_KEYS = Object.freeze([
  'canonicalTopologyHash',
  'topologyTraceLedgerHash',
  'svgSceneHash',
  'parsedInputXmlTopologyHash',
  'topologyParityReportHash',
]);

function assertNoUnpairedSurrogates(value, label = 'topology hash string') {
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError(`${label} contains an unpaired high surrogate at code-unit ${index}.`);
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError(`${label} contains an unpaired low surrogate at code-unit ${index}.`);
    }
  }
  return text;
}

function defineOwn(record, key, value) {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

/** @param {unknown} value @param {Set<string>} omitKeys @returns {unknown} */
function canonicalValue(value, omitKeys) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return assertNoUnpairedSurrogates(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Cannot hash non-finite number: ${value}.`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item, omitKeys));
  if (value && typeof value === 'object') {
    const record = /** @type {Record<string, unknown>} */ (value);
    const result = Object.create(null);
    for (const rawKey of Object.keys(record).sort()) {
      const key = assertNoUnpairedSurrogates(rawKey, 'topology hash object key');
      if (omitKeys.has(key) || record[key] === undefined) continue;
      defineOwn(result, key, canonicalValue(record[key], omitKeys));
    }
    return result;
  }
  throw new TypeError(`Unsupported value in deterministic topology hash: ${typeof value}.`);
}

/** @param {unknown} value @param {{omitKeys?:string[]}} [options] @returns {string} */
export function canonicalJson(value, options = {}) {
  const omitKeys = new Set(options.omitKeys ?? DEFAULT_OMIT_KEYS);
  return JSON.stringify(canonicalValue(value, omitKeys));
}

/** @param {string} text @returns {string} */
export function hashText(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

/** @param {unknown} value @param {{omitKeys?:string[]}} [options] @returns {string} */
export function deterministicHash(value, options = {}) {
  return hashText(canonicalJson(value, options));
}

/** @param {Record<string, unknown>} artifact @param {string} fieldName @returns {Readonly<Record<string, unknown>>} */
export function stampArtifactHash(artifact, fieldName) {
  if (!fieldName) throw new TypeError('A topology artifact hash field name is required.');
  const hash = deterministicHash(artifact, { omitKeys: [...DEFAULT_OMIT_KEYS, fieldName] });
  return Object.freeze({ ...artifact, [fieldName]: hash });
}

export const TOPOLOGY_HASH_ALGORITHM = 'fnv1a64-canonical-json-v1';
export const _test = Object.freeze({
  assertNoUnpairedSurrogates,
  canonicalValue,
  defineOwn,
  DEFAULT_OMIT_KEYS,
});
