/**
 * Component-topology value helpers.
 * Inputs are managed-stage scalar/coordinate values. Outputs are normalized
 * immutable-friendly values. Missing or invalid coordinates return null; no
 * axis is fabricated and no coordinate is rounded for identity.
 */

export const TOPOLOGY_TOLERANCE_MM = 0.5;
export const SOURCE_CONNECTION_TOLERANCE_MM = 1;
export const REFERENCE_CONNECTION_TOLERANCE_MM = 75;
export const CREF_CONNECTION_SPAN_LIMIT_MM = 10000;
export const SUPPORT_PROJECTION_TOLERANCE_MM = 50;

export const ROUTE_TYPES = Object.freeze([
  'PIPE', 'VALV', 'FLAN', 'GASK', 'INST', 'REDU', 'ELBO', 'BEND', 'TEE', 'OLET',
]);

export const DEFERRED_ENGINEERING = Object.freeze([
  'OD', 'WALL', 'MATERIAL', 'TEMPERATURE', 'PRESSURE', 'INSULATION',
]);

/** @param {unknown} value @returns {string} */
export function cleanText(value) {
  return value == null ? '' : String(value).trim();
}

/** @param {unknown} value @returns {{x:number,y:number,z:number}|null} */
export function strictPoint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  const keys = ['x', 'y', 'z'].every((key) => Object.hasOwn(record, key))
    ? ['x', 'y', 'z'] : ['X', 'Y', 'Z'];
  if (!keys.every((key) => Object.hasOwn(record, key))) return null;
  const numbers = keys.map((key) => Number(record[key]));
  if (!numbers.every(Number.isFinite)) return null;
  return { x: numbers[0], y: numbers[1], z: numbers[2] };
}

/** @param {{x:number,y:number,z:number}|null} start @param {{x:number,y:number,z:number}|null} end @returns {number} */
export function pointDistance(start, end) {
  if (!start || !end) return Number.POSITIVE_INFINITY;
  return Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
}

/** @param {string} type @returns {string} */
export function componentCategory(type) {
  const value = cleanText(type).toUpperCase();
  if (value === 'VALV' || value === 'VALVE') return 'VALVE';
  if (value === 'FLAN' || value === 'FLANGE') return 'FLANGE';
  if (value === 'GASK' || value === 'GASKET') return 'GASK';
  if (value === 'REDU' || value === 'REDUCER') return 'REDUCER';
  if (value === 'ELBO' || value === 'BEND' || value === 'ELBOW') return 'ELBO/BEND';
  if (value === 'SUPPORT' || value === 'ATTA') return 'SUPPORT';
  return value;
}

/** @param {string} type @param {Record<string, {x:number,y:number,z:number}|null>} positions @param {number} toleranceMm @returns {string} */
export function geometryClass(type, positions, toleranceMm) {
  const category = componentCategory(type);
  if (category === 'SUPPORT') return 'DEFERRED';
  if (category === 'TEE' || category === 'OLET') return 'JUNCTION';
  if (positions.APOS && positions.LPOS) {
    return pointDistance(positions.APOS, positions.LPOS) > toleranceMm ? 'FINITE' : 'POINT';
  }
  return positions.POS ? 'POINT' : 'UNKNOWN';
}

/** @param {unknown[]} values @returns {string[]} */
export function uniqueText(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

/** @param {number} value @returns {string} */
export function formatNumber(value) {
  const normalized = Math.abs(value) < 1e-9 ? 0 : value;
  return normalized.toFixed(6).replace(/\.?0+$/, '');
}

/** @param {unknown} value @returns {string} */
export function xmlAttribute(value) {
  return cleanText(value)
    .replaceAll('&', '&amp;').replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** @param {number} value @returns {string} */
export function sequenceId(value) {
  return String(value).padStart(6, '0');
}
