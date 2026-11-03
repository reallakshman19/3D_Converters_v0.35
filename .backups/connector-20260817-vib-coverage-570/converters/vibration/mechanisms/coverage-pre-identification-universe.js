import {
  VIBRATION_MECHANISM_ASSESSMENT_SET_SCHEMA,
  vibrationMechanismAssessmentSetId,
} from './contracts.js';

export const VIBRATION_MECHANISM_IDENTIFICATION_SCHEMA = 'VibrationMechanismIdentification.v1';
export const VIBRATION_REQUIRED_ASSESSMENT_SET_SCHEMA = 'RequiredAssessmentSet.v1';
export const VIBRATION_MECHANISM_COVERAGE_SCHEMA = 'MechanismCoverage.v1';
export const VIBRATION_ASSESSMENT_COMPLETENESS_SCHEMA = 'AssessmentCompleteness.v1';

export const VIBRATION_IDENTIFICATION_DISPOSITIONS = Object.freeze([
  'REQUIRED',
  'NOT_APPLICABLE',
  'UNRESOLVED',
]);

export const VIBRATION_ASSESSMENT_UNIT_TYPES = Object.freeze([
  'MAIN_LINE_SECTION',
  'DEADLEG_BRANCH',
  'AIV_SOURCE_ASSESSMENT_PAIR',
  'SBC_CONNECTION',
  'TRANSIENT_EVENT_PATH',
  'INTRUSIVE_ELEMENT',
  'SPECIALIST_SYSTEM',
]);

export const VIBRATION_REQUIRED_QUALIFICATIONS = Object.freeze(['CURRENT_RESULT', 'SCREENING']);

export const VIBRATION_COMPLETENESS_STATES = Object.freeze([
  'COMPLETE',
  'INCOMPLETE',
  'NOT_APPLICABLE',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function enumValue(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new RangeError(`${field} must be one of ${allowed.join(', ')}.`);
  }
  return value;
}

function scopeValue(scope = {}) {
  return {
    line: requiredText(scope.line, 'scope.line'),
    caseId: scope.caseId == null ? null : requiredText(scope.caseId, 'scope.caseId'),
    canonicalId: requiredText(scope.canonicalId, 'scope.canonicalId'),
  };
}

function evidenceValue(evidence = {}) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new TypeError('evidence must be an object.');
  }
  return { ...evidence, sourceId: requiredText(evidence.sourceId, 'evidence.sourceId') };
}

function identificationIdentity(record) {
  return JSON.stringify([
    record.mechanismId,
    record.scope.line,
    record.scope.caseId,
    record.scope.canonicalId,
    record.assessmentUnitType,
  ]);
}

function identificationFingerprint(record) {
  return JSON.stringify([
    record.identificationId,
    record.disposition,
    record.requiredQualification,
    record.evidence.sourceId,
    record.reason,
  ]);
}

function knownMechanismSet(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError('knownMechanismIds must be a non-empty array when identification evidence exists.');
  }
  return new Set(values.map((value) => requiredText(value, 'knownMechanismIds[]')));
}

export function createVibrationMechanismIdentification(input = {}) {
  const disposition = enumValue(
    input.disposition,
    VIBRATION_IDENTIFICATION_DISPOSITIONS,
    'disposition',
  );
  const record = {
    schema: VIBRATION_MECHANISM_IDENTIFICATION_SCHEMA,
    mechanismId: requiredText(input.mechanismId, 'mechanismId'),
    scope: scopeValue(input.scope),
    assessmentUnitType: enumValue(
      input.assessmentUnitType,
      VIBRATION_ASSESSMENT_UNIT_TYPES,
      'assessmentUnitType',
    ),
    disposition,
    requiredQualification: disposition === 'REQUIRED'
      ? enumValue(input.requiredQualification ?? 'SCREENING', VIBRATION_REQUIRED_QUALIFICATIONS, 'requiredQualification')
      : null,
    evidence: evidenceValue(input.evidence),
    reason: input.reason == null ? null : requiredText(input.reason, 'reason'),
  };
  record.identificationId = identificationIdentity(record);
  record.fingerprint = identificationFingerprint(record);
  return deepFreeze(record);
}

function validateIdentificationRecords(records, known) {
  const byIdentity = new Map();
  for (const record of records) {
    if (!known.has(record.mechanismId)) {
      throw new Error(`UNKNOWN_VIBRATION_MECHANISM:${record.mechanismId}`);
    }
    const prior = byIdentity.get(record.identificationId);
    if (prior && prior.disposition !== record.disposition) {
      throw new Error(`CONTRADICTORY_MECHANISM_IDENTIFICATION:${record.identificationId}`);
    }
    if (prior) throw new Error(`DUPLICATE_MECHANISM_IDENTIFICATION:${record.identificationId}`);
    byIdentity.set(record.identificationId, record);
  }
}

function requiredAssessment(record) {
  return deepFreeze({
    assessmentId: vibrationMechanismAssessmentSetId({
      mechanismId: record.mechanismId,
      scope: record.scope,
    }),
    identificationId: record.identificationId,
    mechanismId: record.mechanismId,
    scope: record.scope,
    assessmentUnitType: record.assessmentUnitType,
    requiredQualification: record.requiredQualification,
  });
}

export function createRequiredVibrationAssessmentSet(input = {}) {
  const inputs = input.identifications ?? [];
  if (!Array.isArray(inputs)) throw new TypeError('identifications must be an array.');
  if (inputs.length === 0) {
    const known = input.knownMechanismIds == null ? [] : [...knownMechanismSet(input.knownMechanismIds)].sort();
    return deepFreeze({
      schema: VIBRATION_REQUIRED_ASSESSMENT_SET_SCHEMA,
      setId: JSON.stringify(['IDENTIFICATION_EVIDENCE_MISSING']),
      identificationState: 'MISSING',
      knownMechanismIds: known,
      required: [],
      notApplicable: [],
      unresolved: [],
    });
  }

  const known = knownMechanismSet(input.knownMechanismIds);
  const records = inputs.map((item) => item?.schema === VIBRATION_MECHANISM_IDENTIFICATION_SCHEMA
    ? item : createVibrationMechanismIdentification(item));
  validateIdentificationRecords(records, known);
  records.sort((a, b) => a.identificationId.localeCompare(b.identificationId));
  const required = records.filter((item) => item.disposition === 'REQUIRED').map(requiredAssessment);
  const notApplicable = records.filter((item) => item.disposition === 'NOT_APPLICABLE');
  const unresolved = records.filter((item) => item.disposition === 'UNRESOLVED');
  return deepFreeze({
    schema: VIBRATION_REQUIRED_ASSESSMENT_SET_SCHEMA,
    setId: JSON.stringify(records.map((item) => item.fingerprint)),
    identificationState: unresolved.length ? 'UNRESOLVED' : 'RESOLVED',
    knownMechanismIds: [...known].sort(),
    required,
    notApplicable,
    unresolved,
  });
}

function assessmentSetMap(assessmentSets = [], knownMechanismIds = []) {
  if (!Array.isArray(assessmentSets)) throw new TypeError('assessmentSets must be an array.');
  const known = new Set(knownMechanismIds);
  const sets = new Map();
  for (const set of assessmentSets) {
    if (set?.schema !== VIBRATION_MECHANISM_ASSESSMENT_SET_SCHEMA) {
      throw new TypeError(`assessmentSets must use ${VIBRATION_MECHANISM_ASSESSMENT_SET_SCHEMA}.`);
    }
    if (!known.has(set.mechanismId)) throw new Error(`UNKNOWN_VIBRATION_MECHANISM:${set.mechanismId}`);
    if (sets.has(set.setId)) throw new Error(`DUPLICATE_MECHANISM_ASSESSMENT_SET:${set.setId}`);
    sets.set(set.setId, set);
  }
  return sets;
}

function screeningQualified(item) {
  return item.implementationState === 'IMPLEMENTED_SCREENING'
    && item.qualification?.effective === 'SCREENING';
}

function classifyAssessmentSet(set, requirement) {
  if (!set) return ['ASSESSMENT_INCOMPLETE', 'MISSING_ASSESSMENT_SET'];
  if (set.cardinality?.count === 0) return ['ASSESSMENT_INCOMPLETE', 'ZERO_CARDINALITY_NOT_APPLICABLE_NOT_PROVEN'];
  const items = set.items ?? [];
  if (items.some((item) => item.implementationState === 'NOT_IMPLEMENTED')) return ['ASSESSMENT_INCOMPLETE', 'NOT_IMPLEMENTED'];
  if (items.some((item) => item.assessmentState === 'NOT_APPLICABLE')) return ['ASSESSMENT_INCOMPLETE', 'REQUIRED_ASSESSMENT_REPORTED_NOT_APPLICABLE'];
  if (items.some((item) => ['FAILED', 'REVIEW_REQUIRED'].includes(item.assessmentState) || item.resultState === 'INVALID_INPUT')) {
    return ['ASSESSMENT_INCOMPLETE', 'FAILED_OR_REVIEW_REQUIRED'];
  }
  if (items.some((item) => item.resultState === 'STALE_RESULT')) return ['ASSESSMENT_INCOMPLETE', 'STALE_RESULT'];
  if (items.some((item) => item.assessmentState === 'APPLICABILITY_UNKNOWN')) return ['ASSESSMENT_INCOMPLETE', 'APPLICABILITY_UNKNOWN'];
  if (items.some((item) => item.assessmentState === 'APPLICABLE_INCOMPLETE')) return ['ASSESSMENT_INCOMPLETE', 'APPLICABLE_INCOMPLETE'];
  if (items.some((item) => item.assessmentState === 'NOT_EVALUATED')) return ['ASSESSMENT_INCOMPLETE', 'NOT_EVALUATED'];
  if (items.some((item) => item.assessmentState !== 'CALCULATED' || item.resultState !== 'CURRENT_RESULT')) {
    return ['ASSESSMENT_INCOMPLETE', 'READY_OR_NOT_EXECUTED'];
  }
  if (requirement.requiredQualification === 'SCREENING' && items.some((item) => !screeningQualified(item))) {
    return ['ASSESSMENT_INCOMPLETE', 'CANDIDATE_OR_UNQUALIFIED_RESULT'];
  }
  return ['ASSESSMENT_COMPLETE', 'CURRENT_REQUIRED_AUTHORITY_EVIDENCE'];
}

function assessmentSetFingerprint(set) {
  if (!set) return null;
  return JSON.stringify((set.items ?? []).map((item) => [
    item.itemId,
    item.implementationState,
    item.assessmentState,
    item.resultState,
    item.qualification?.effective ?? null,
  ]));
}

export function evaluateVibrationMechanismCoverage(input = {}) {
  const requiredSet = input.requiredAssessmentSet;
  if (requiredSet?.schema !== VIBRATION_REQUIRED_ASSESSMENT_SET_SCHEMA) {
    throw new TypeError(`requiredAssessmentSet must use ${VIBRATION_REQUIRED_ASSESSMENT_SET_SCHEMA}.`);
  }
  const sets = assessmentSetMap(input.assessmentSets ?? [], requiredSet.knownMechanismIds);
  const requiredCoverage = requiredSet.required.map((requirement) => {
    const set = sets.get(requirement.assessmentId) ?? null;
    const [status, reason] = classifyAssessmentSet(set, requirement);
    return deepFreeze({ ...requirement, status, reason, assessmentSetFingerprint: assessmentSetFingerprint(set) });
  });
  return deepFreeze({
    schema: VIBRATION_MECHANISM_COVERAGE_SCHEMA,
    coverageId: JSON.stringify([requiredSet.setId, requiredCoverage.map((item) => [item.assessmentId, item.status, item.reason, item.assessmentSetFingerprint])]),
    identificationState: requiredSet.identificationState,
    required: requiredCoverage,
    notApplicable: requiredSet.notApplicable,
    unresolved: requiredSet.unresolved,
  });
}

export function evaluateVibrationAssessmentCompleteness(coverage) {
  if (coverage?.schema !== VIBRATION_MECHANISM_COVERAGE_SCHEMA) {
    throw new TypeError(`coverage must use ${VIBRATION_MECHANISM_COVERAGE_SCHEMA}.`);
  }
  const incomplete = coverage.required.filter((item) => item.status !== 'ASSESSMENT_COMPLETE');
  const reasons = [];
  let state = 'INCOMPLETE';
  if (coverage.identificationState === 'MISSING') reasons.push('IDENTIFICATION_EVIDENCE_MISSING');
  if (coverage.unresolved.length) reasons.push('UNRESOLVED_MECHANISM_IDENTIFICATION');
  reasons.push(...incomplete.map((item) => `${item.mechanismId}:${item.reason}`));
  if (!reasons.length && coverage.required.length === 0 && coverage.notApplicable.length > 0) state = 'NOT_APPLICABLE';
  if (!reasons.length && coverage.required.length > 0) state = 'COMPLETE';
  if (!reasons.length && coverage.required.length === 0 && coverage.notApplicable.length === 0) reasons.push('NO_REQUIRED_OR_NOT_APPLICABLE_IDENTIFICATION');
  return deepFreeze({
    schema: VIBRATION_ASSESSMENT_COMPLETENESS_SCHEMA,
    state: enumValue(state, VIBRATION_COMPLETENESS_STATES, 'state'),
    requiredCount: coverage.required.length,
    completeCount: coverage.required.length - incomplete.length,
    incompleteCount: incomplete.length,
    notApplicableCount: coverage.notApplicable.length,
    unresolvedIdentificationCount: coverage.unresolved.length,
    missingRequiredAssessmentIds: incomplete.map((item) => item.assessmentId),
    reasons,
    coverageId: coverage.coverageId,
  });
}

export function evaluateVibrationCoverageAndCompleteness(input = {}) {
  const requiredAssessmentSet = createRequiredVibrationAssessmentSet(input);
  const coverage = evaluateVibrationMechanismCoverage({
    requiredAssessmentSet,
    assessmentSets: input.assessmentSets ?? [],
  });
  const completeness = evaluateVibrationAssessmentCompleteness(coverage);
  return deepFreeze({ requiredAssessmentSet, coverage, completeness });
}
