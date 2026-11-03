import { deepFreeze } from './canonical-json.js';

export const FBX_PREDECESSOR_CERTIFICATION_SCHEMA = 'FbxPredecessorCertification.v1';
export const FBX_PREDECESSOR_CERTIFICATION_STATUSES = deepFreeze([
  'COMPLETE', 'BLOCKED', 'OWNER-WAIVED',
]);
export const FBX_PREDECESSOR_EVIDENCE_STATUSES = deepFreeze([
  'passed', 'failed', 'missing',
]);
export const FBX_PREDECESSOR_EVIDENCE_KEYS = deepFreeze([
  'governedWasmBuild', 'provenanceReconciliation', 'reproducibility', 'parserParity',
]);
export const FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES = deepFreeze({
  INVALID: 'FBX_PREDECESSOR_CERTIFICATION_INVALID',
  CONTINUATION_BLOCKED: 'FBX_PREDECESSOR_CONTINUATION_BLOCKED',
  RELEASE_BLOCKED: 'FBX_PREDECESSOR_RELEASE_BLOCKED',
});

const TOP_KEYS = ['schema', 'status', 'evidence', 'ownerWaiver', 'admission'];
const WAIVER_KEYS = ['authorized', 'rationale'];
const ADMISSION_KEYS = ['evidencePassing', 'continuationAuthorized', 'releaseEligible'];
const EVIDENCE_STATUS_SET = new Set(FBX_PREDECESSOR_EVIDENCE_STATUSES);
const STATUS_SET = new Set(FBX_PREDECESSOR_CERTIFICATION_STATUSES);

export class FbxPredecessorCertificationError extends Error {
  constructor(code, message) {
    super(`${code} ${message}`);
    this.name = 'FbxPredecessorCertificationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new FbxPredecessorCertificationError(code, message);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.INVALID, `${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.join('\0') !== expected.join('\0')) {
    fail(FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.INVALID, `${label} fields are invalid.`);
  }
}

function validateEvidence(evidence) {
  exactKeys(evidence, FBX_PREDECESSOR_EVIDENCE_KEYS, 'evidence');
  for (const key of FBX_PREDECESSOR_EVIDENCE_KEYS) {
    if (!EVIDENCE_STATUS_SET.has(evidence[key])) {
      fail(FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.INVALID, `${key} evidence status is invalid.`);
    }
  }
}

function validateWaiver(ownerWaiver) {
  exactKeys(ownerWaiver, WAIVER_KEYS, 'ownerWaiver');
  if (typeof ownerWaiver.authorized !== 'boolean') {
    fail(FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.INVALID, 'ownerWaiver.authorized is invalid.');
  }
  if (ownerWaiver.authorized) {
    if (typeof ownerWaiver.rationale !== 'string' || !ownerWaiver.rationale.trim()) {
      fail(FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.INVALID, 'An owner waiver requires a rationale.');
    }
  } else if (ownerWaiver.rationale !== null) {
    fail(FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.INVALID, 'A non-authorized waiver must have a null rationale.');
  }
}

function evidencePassing(evidence) {
  return FBX_PREDECESSOR_EVIDENCE_KEYS.every((key) => evidence[key] === 'passed');
}

function expectedState(evidence, ownerWaiver) {
  const passing = evidencePassing(evidence);
  if (passing && ownerWaiver.authorized) {
    fail(FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.INVALID, 'A waiver cannot replace or decorate complete evidence.');
  }
  return {
    status: passing ? 'COMPLETE' : ownerWaiver.authorized ? 'OWNER-WAIVED' : 'BLOCKED',
    admission: {
      evidencePassing: passing,
      continuationAuthorized: passing || ownerWaiver.authorized,
      releaseEligible: passing,
    },
  };
}

export function validateFbxPredecessorCertification(value) {
  exactKeys(value, TOP_KEYS, 'certification');
  if (value.schema !== FBX_PREDECESSOR_CERTIFICATION_SCHEMA || !STATUS_SET.has(value.status)) {
    fail(FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.INVALID, 'Certification schema or status is invalid.');
  }
  validateEvidence(value.evidence);
  validateWaiver(value.ownerWaiver);
  exactKeys(value.admission, ADMISSION_KEYS, 'admission');
  for (const key of ADMISSION_KEYS) {
    if (typeof value.admission[key] !== 'boolean') {
      fail(FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.INVALID, `${key} must be boolean.`);
    }
  }
  const expected = expectedState(value.evidence, value.ownerWaiver);
  if (value.status !== expected.status
    || JSON.stringify(value.admission) !== JSON.stringify(expected.admission)) {
    fail(
      FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.INVALID,
      'Certification status cannot reclassify missing predecessor evidence as passing.',
    );
  }
  return value;
}

export function buildFbxPredecessorCertification({ evidence, ownerWaiver = {
  authorized: false, rationale: null,
} }) {
  validateEvidence(evidence);
  validateWaiver(ownerWaiver);
  const expected = expectedState(evidence, ownerWaiver);
  const value = {
    schema: FBX_PREDECESSOR_CERTIFICATION_SCHEMA,
    status: expected.status,
    evidence: structuredClone(evidence),
    ownerWaiver: structuredClone(ownerWaiver),
    admission: expected.admission,
  };
  validateFbxPredecessorCertification(value);
  return deepFreeze(value);
}

export function isFbxPredecessorEvidencePassing(value) {
  return validateFbxPredecessorCertification(value).admission.evidencePassing;
}

export function isFbxPredecessorContinuationAuthorized(value) {
  return validateFbxPredecessorCertification(value).admission.continuationAuthorized;
}

export function isFbxPredecessorReleaseEligible(value) {
  return validateFbxPredecessorCertification(value).admission.releaseEligible;
}

export function assertFbxPredecessorContinuationAuthorized(value) {
  if (!isFbxPredecessorContinuationAuthorized(value)) {
    fail(
      FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.CONTINUATION_BLOCKED,
      'Predecessor evidence is incomplete and no owner waiver authorizes continuation.',
    );
  }
  return value;
}

export function assertFbxPredecessorReleaseEligible(value) {
  if (!isFbxPredecessorReleaseEligible(value)) {
    fail(
      FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.RELEASE_BLOCKED,
      'Owner waiver authorizes continuation only; missing predecessor evidence is not passing.',
    );
  }
  return value;
}
