/**
 * Functionality: canonical StagedJson contract — defines the schema registry,
 * normalization, and validation for all known StagedJson envelope variants.
 * Parameters: raw parsed JSON value (array, envelope object, or string).
 * Outputs: { branches, envelope } where branches is the canonical array and
 * envelope is the preserved metadata object or null. Fallback: unknown objects
 * throw TypeError with a diagnostic message.
 */

/** Version constant for any re-serialized canonical output. */
export const STAGEDJSON_CANONICAL_SCHEMA = 'stagedjson-canonical/v1';

/**
 * Registry of known envelope schemas and their array accessor path.
 * Add new entries here as new producers are introduced — consumers need
 * no changes.
 */
const ENVELOPE_REGISTRY = Object.freeze([
  { schema: 'inputxml-managed-stage/v1', path: 'hierarchy' },
  { schema: 'inputxml-managed-stage/v1', path: 'objects' },   // legacy UI wrapper (patched out, kept for back-compat)
]);

/**
 * Normalizes any known StagedJson variant into a canonical result.
 *
 * @param {*} value - Raw parsed JSON: bare array, envelope object, single
 *   branch object, or a JSON string of any of the above.
 * @returns {{ branches: Array, envelope: Object|null }}
 *   - branches: the flat array of branch/component nodes (the "master" shape)
 *   - envelope: preserved metadata from the envelope, or null if bare array
 * @throws {TypeError} when the input cannot be recognized as any StagedJson form
 */
export function normalizeStagedJson(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object') {
    throw new TypeError('StagedJson input must be a JSON object or array.');
  }

  // Case 1: Bare array — AVEVA master format (most common)
  if (Array.isArray(parsed)) {
    return { branches: parsed, envelope: null };
  }

  // Case 2: Known envelope — find first matching accessor
  for (const entry of ENVELOPE_REGISTRY) {
    const candidate = parsed[entry.path];
    if (Array.isArray(candidate)) {
      // Extract metadata without the payload array
      const envelope = excludeKey(parsed, entry.path);
      return { branches: candidate, envelope };
    }
  }

  // Case 3: Single branch object (type + children present)
  if (parsed.type && Array.isArray(parsed.children)) {
    return { branches: [parsed], envelope: null };
  }

  throw new TypeError(
    `StagedJson input is an object but does not match any known envelope schema ` +
    `(schema: "${parsed.schema || 'missing'}"). ` +
    `Expected a bare array, an object with "hierarchy" or "objects", or a single branch node.`
  );
}

/**
 * Returns true when the value is a recognized envelope object (has a known
 * array accessor). Useful for early detection before normalization.
 *
 * @param {*} value
 * @returns {boolean}
 */
export function isStagedJsonEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return ENVELOPE_REGISTRY.some((entry) => Array.isArray(value[entry.path]));
}

/**
 * Returns a copy of obj with the given key omitted.
 * Pure — does not mutate the source object.
 *
 * @param {Object} obj
 * @param {string} key
 * @returns {Object}
 */
function excludeKey(obj, key) {
  const result = {};
  for (const k of Object.keys(obj)) {
    if (k !== key) result[k] = obj[k];
  }
  return result;
}
