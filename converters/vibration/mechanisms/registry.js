export const VIBRATION_MECHANISM_REGISTRY_SCHEMA = 'VibrationMechanismRegistry.v1';
export const VIBRATION_MECHANISM_REGISTRY_REVISION = 'VIB-FAMILY-MECHANISMS-2026-08-17';

const REGISTRY_ENTRIES = [
  { mechanismId: 'fit' },
  { mechanismId: 'mechanicalExcitation' },
  { mechanismId: 'reciprocatingPulsation' },
  { mechanismId: 'rotatingStall' },
  { mechanismId: 'deadlegPulsation' },
  { mechanismId: 'corrugationPulsation' },
  { mechanismId: 'slugFlow' },
  { mechanismId: 'aiv' },
  { mechanismId: 'valveTransients' },
  { mechanismId: 'cavitationFlashing' },
  { mechanismId: 'thermowells' },
  { mechanismId: 'smallBoreConnections' },
];

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizedMechanismIds(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new TypeError('registry entries must be a non-empty array.');
  }
  const ids = entries.map((entry) => requiredText(entry?.mechanismId, 'registry.entries[].mechanismId'));
  if (new Set(ids).size !== ids.length) throw new Error('DUPLICATE_VIBRATION_MECHANISM_REGISTRY_ID');
  return ids;
}

export function vibrationMechanismRegistryFingerprint(entries = REGISTRY_ENTRIES) {
  const ids = normalizedMechanismIds(entries);
  return JSON.stringify([
    VIBRATION_MECHANISM_REGISTRY_SCHEMA,
    VIBRATION_MECHANISM_REGISTRY_REVISION,
    ids,
  ]);
}

const entries = REGISTRY_ENTRIES.map((entry) => deepFreeze({ ...entry }));

export const VIBRATION_MECHANISM_IDS = Object.freeze(normalizedMechanismIds(entries));

export const VIBRATION_MECHANISM_REGISTRY = deepFreeze({
  schema: VIBRATION_MECHANISM_REGISTRY_SCHEMA,
  revision: VIBRATION_MECHANISM_REGISTRY_REVISION,
  fingerprint: vibrationMechanismRegistryFingerprint(entries),
  entries,
  authority: {
    registryAuthority: 'KNOWN_MECHANISM_UNIVERSE_ONLY',
    automaticApplicabilityRules: false,
    engineeringAuthority: 'NONE',
    screeningAuthority: 'NOT_AUTHORIZED',
    designAuthority: false,
  },
  adoptionBasis: [
    'PROGRAM:#429_VIBRATION_FAMILY_MECHANISM_MAP',
    'PRODUCT:CURRENT_VIBRATION_MECHANISM_IDS',
  ],
});
