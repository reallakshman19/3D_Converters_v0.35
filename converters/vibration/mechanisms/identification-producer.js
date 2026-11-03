import {
  createRequiredVibrationAssessmentSet,
  createVibrationMechanismIdentification,
} from './coverage.js';
import {
  VIBRATION_MECHANISM_IDS,
  VIBRATION_MECHANISM_REGISTRY,
} from './registry.js';

export const VIBRATION_MECHANISM_IDENTIFICATION_BUNDLE_SCHEMA = 'VibrationMechanismIdentificationBundle.v1';

const PRODUCER_AUTHORITY = Object.freeze({
  identificationAuthority: 'EXPLICIT_EVIDENCE_ONLY',
  automaticApplicabilityRules: false,
  engineeringAuthority: 'NONE',
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
  codeCompliance: false,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function rejectUniverseOverride(input) {
  for (const key of ['expectedMechanismIds', 'knownMechanismIds', 'registry', 'registryRevision', 'registryFingerprint']) {
    if (hasOwn(input, key)) throw new Error(`CALLER_MECHANISM_UNIVERSE_OVERRIDE_FORBIDDEN:${key}`);
  }
}

function rejectUserEngineeringDataRow(row) {
  const looksLikeBlockerRow = row && typeof row === 'object'
    && (hasOwn(row, 'blockerId') || hasOwn(row, 'sourceReference') || hasOwn(row, 'scopeId'))
    && !hasOwn(row, 'disposition');
  if (looksLikeBlockerRow) throw new Error('USER_ENGINEERING_DATA_NOT_IDENTIFICATION_EVIDENCE');
}

function normalizeIdentifications(values) {
  if (!Array.isArray(values)) throw new TypeError('identifications must be an array.');
  const known = new Set(VIBRATION_MECHANISM_IDS);
  const records = values.map((value) => {
    rejectUserEngineeringDataRow(value);
    const record = createVibrationMechanismIdentification(value);
    if (!known.has(record.mechanismId)) {
      throw new Error(`UNKNOWN_VIBRATION_MECHANISM:${record.mechanismId}`);
    }
    return record;
  });
  return records.sort((a, b) => a.identificationId.localeCompare(b.identificationId));
}

export function createVibrationMechanismIdentificationBundle(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('identification producer input must be an object.');
  }
  rejectUniverseOverride(input);
  const identifications = normalizeIdentifications(input.identifications ?? []);
  const requiredSet = createRequiredVibrationAssessmentSet({
    identifications,
    knownMechanismIds: VIBRATION_MECHANISM_IDS,
  });
  return deepFreeze({
    schema: VIBRATION_MECHANISM_IDENTIFICATION_BUNDLE_SCHEMA,
    registryRevision: VIBRATION_MECHANISM_REGISTRY.revision,
    registryFingerprint: VIBRATION_MECHANISM_REGISTRY.fingerprint,
    expectedMechanismIds: VIBRATION_MECHANISM_IDS,
    identifications,
    identificationState: requiredSet.identificationState,
    missingIdentificationMechanismIds: requiredSet.missingIdentificationMechanismIds,
    bundleId: JSON.stringify([
      VIBRATION_MECHANISM_REGISTRY.fingerprint,
      requiredSet.setId,
    ]),
    authority: PRODUCER_AUTHORITY,
  });
}
