/**
 * Functionality: maps StagedJSON RAW_TYPE / type strings to
 * PSI-116 XML ComponentType codes. Handles FBLI (Blind Flange),
 * INST (Instrument), BEND/ELBO unification, and ANCI/ATTA.
 * Parameters: explicit. Outputs: plain string. No side effects.
 */

/** Default mapping: StagedJSON RAW_TYPE → XML ComponentType */
export const DEFAULT_TYPE_OVERRIDES = Object.freeze({
  FBLI: 'FLAN',
  INST: 'VALV',
  BEND: 'ELBO',
  ANCI: 'ATTA',
});

/** Types that are treated as "PIPE" boundary nodes (expanded to start/end) */
export const PIPE_BOUNDARY_TYPES = Object.freeze(new Set([
  'PIPE', 'ELBO', 'BEND', 'TEE', 'OLET', 'REDU',
]));

/** Types that are "RIGID" weight items (Rigid=2 in XML) */
export const RIGID_TYPES = Object.freeze(new Set([
  'VALV', 'FLAN', 'GASK', 'INST',
]));

/** Support types — become ATTA + <Restraint> block */
export const SUPPORT_TYPES = Object.freeze(new Set([
  'ATTA', 'SUPPORT', 'ANCI',
]));

/**
 * @param {string} rawType — value of RAW_TYPE or type from StagedJSON
 * @param {Record<string,string>} overrides — user-configurable type overrides
 * @returns {string} PSI-116 ComponentType (PIPE, ELBO, FLAN, VALV, GASK, ATTA, etc.)
 */
export function mapComponentType(rawType, overrides = {}) {
  const upper = String(rawType ?? '').toUpperCase().trim();
  if (!upper) return 'PIPE';
  const merged = { ...DEFAULT_TYPE_OVERRIDES, ...overrides };
  return merged[upper] ?? upper;
}

/**
 * Returns true if this component type should be expanded into
 * start + end boundary nodes (i.e. it has length).
 * @param {string} componentType — mapped type
 * @returns {boolean}
 */
export function isBoundaryType(componentType) {
  return PIPE_BOUNDARY_TYPES.has(String(componentType).toUpperCase());
}

/**
 * Returns true if this component is a rigid (weight item) in XML.
 * @param {string} componentType
 * @returns {boolean}
 */
export function isRigidType(componentType) {
  return RIGID_TYPES.has(String(componentType).toUpperCase());
}

/**
 * Returns true if this component is a pipe support (ATTA).
 * @param {string} componentType
 * @returns {boolean}
 */
export function isSupportType(componentType) {
  return SUPPORT_TYPES.has(String(componentType).toUpperCase());
}

/**
 * Returns the Rigid field value for a given component type.
 * 0 = continuous (pipe), 1 = not rigid, 2 = rigid (valve/flange)
 * @param {string} componentType
 * @returns {number}
 */
export function rigidValue(componentType) {
  const upper = String(componentType).toUpperCase();
  if (upper === 'PIPE') return 0;
  if (RIGID_TYPES.has(upper)) return 2;
  return 0;
}

/**
 * Returns the ConnectionType value for ATTA nodes.
 * @param {string} supportKind — e.g. REST, GUIDE, ANCHOR
 * @returns {string}
 */
export function attaConnectionType(supportKind) {
  const u = String(supportKind ?? '').toUpperCase();
  if (/ANCH|FIXED|FIX/.test(u)) return 'ANCHOR';
  if (/GUIDE|GT01/.test(u)) return 'GUIDE';
  if (/SPRING|HANG/.test(u)) return 'SPRING';
  return 'SUPPORT';
}
