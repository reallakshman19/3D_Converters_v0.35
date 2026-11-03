import {
  inspectMechanicalFacilityCandidate,
  mechanicalFacilityScope,
} from '../mechanical/facility.js';
import {
  createVibrationMechanismAssessmentItem,
  createVibrationMechanismAssessmentSet,
} from './contracts.js';

export const MECHANICAL_VIBRATION_MECHANISM_ID = 'mechanicalExcitation';
export const MECHANICAL_VIBRATION_MECHANISM_IMPLEMENTATION_STATE = 'IMPLEMENTED_CANDIDATE_MASTER';

function scopeFromRow(row = {}) {
  return {
    line: row.line,
    caseId: row.caseId ?? null,
    canonicalId: row.canonicalId,
  };
}

function normalizeKeys(sourceKeys) {
  return Array.isArray(sourceKeys)
    ? [...new Set(sourceKeys.map((value) => String(value ?? '').trim()).filter(Boolean))]
    : [];
}

function readiness(sourceKeys, inspected, notApplicable) {
  if (notApplicable) return { missing: [], invalid: [], reasons: [] };
  if (!sourceKeys.length) {
    return {
      missing: ['MECHANICAL_T23_EQUIPMENT_SOURCE_SELECTION'],
      invalid: [],
      reasons: ['MECHANICAL_T23_APPLICABILITY_UNKNOWN'],
    };
  }
  if (inspected.status === 'NOT_EVALUATED') {
    return {
      missing: ['MECHANICAL_T23_CANDIDATE_EVALUATION'],
      invalid: [],
      reasons: ['MECHANICAL_T23_EVALUATION_REQUIRED'],
    };
  }
  if (!inspected.ok) {
    return { missing: [], invalid: [inspected.status], reasons: [inspected.status] };
  }
  return { missing: [], invalid: [], reasons: [] };
}

function assessmentState(sourceKeys, inspected, notApplicable) {
  if (notApplicable) return 'NOT_APPLICABLE';
  if (!sourceKeys.length) return 'APPLICABILITY_UNKNOWN';
  if (!inspected.ok) return 'APPLICABLE_INCOMPLETE';
  return 'CALCULATED';
}

function resultState(inspected, requested, notApplicable) {
  if (notApplicable || !inspected.ok) return 'UNRUN';
  return requested === 'STALE_RESULT' ? 'STALE_RESULT' : 'CURRENT_RESULT';
}

function resultValue(inspected, notApplicable) {
  if (notApplicable) {
    return { calculated: false, governingLof: null, status: 'NOT_APPLICABLE', governingSourceKey: null };
  }
  if (!inspected.ok) {
    return { calculated: false, governingLof: null, status: inspected.status, governingSourceKey: null };
  }
  const candidate = inspected.candidate;
  return {
    calculated: true,
    governingLof: candidate.governingLof,
    status: candidate.status,
    governingSourceKey: candidate.governingSourceKey,
    sourceRows: candidate.rows,
  };
}

function traceValue(sourceKeys, inspected, notApplicable) {
  return {
    equationIds: [],
    ruleIds: ['EI-AVIFF-T2.3-MAX-BASELINE-LOF'],
    correlationIds: [],
    inputTrace: {
      status: sourceKeys.length || notApplicable ? 'SOURCE_AND_NORMALIZED_ONLY' : 'UNAVAILABLE',
      normalizedInputs: { sourceKeys, notApplicable },
      sourceTrace: inspected.ok ? inspected.candidate.rows : null,
    },
  };
}

function evidenceValue(inspected, notApplicable) {
  if (!inspected.ok || notApplicable) {
    return { facilityScope: inspected.scope, status: notApplicable ? 'NOT_APPLICABLE' : inspected.status };
  }
  return {
    facilityScope: inspected.scope,
    provenance: inspected.candidate.provenance,
    usagePolicy: inspected.candidate.usagePolicy,
    authority: inspected.candidate.authority,
  };
}

export function buildMechanicalVibrationMechanismAssessmentItem(options = {}) {
  const { row, cachedCandidate = null, resultState: requestedResultState = null } = options;
  const sourceKeys = normalizeKeys(options.sourceKeys);
  const notApplicable = options.notApplicable === true;
  const facilityScope = mechanicalFacilityScope(row);
  const inspected = inspectMechanicalFacilityCandidate(row, cachedCandidate);
  return createVibrationMechanismAssessmentItem({
    mechanismId: MECHANICAL_VIBRATION_MECHANISM_ID,
    scope: scopeFromRow(row), childKey: 't2.3-baseline', childOrdinal: 0,
    implementationState: MECHANICAL_VIBRATION_MECHANISM_IMPLEMENTATION_STATE,
    assessmentState: assessmentState(sourceKeys, inspected, notApplicable),
    resultState: resultState(inspected, requestedResultState, notApplicable),
    applicability: {
      status: notApplicable ? 'NOT_APPLICABLE_USER_CONFIRMED'
        : sourceKeys.length ? 'USER_SELECTED_EQUIPMENT_SOURCES' : 'UNKNOWN',
      facilityScopeId: facilityScope.scopeId, sourceKeys,
    },
    readiness: readiness(sourceKeys, inspected, notApplicable),
    request: {
      methodId: 'VIB.MECHANICAL.T2_3.BASELINE', facilityScopeId: facilityScope.scopeId,
      evidenceClass: 'EI_METHOD_MASTER_CANDIDATE_PLUS_PROJECT_APPLICABILITY',
    },
    execution: inspected.ok && !notApplicable
      ? { status: 'CALCULATED_MASTER_CANDIDATE', screeningAuthorized: false } : null,
    result: resultValue(inspected, notApplicable),
    trace: traceValue(sourceKeys, inspected, notApplicable),
    qualification: {
      effective: 'CANDIDATE_MASTER', engineeringAuthority: 'NONE',
      screeningAuthority: 'NOT_AUTHORIZED', designAuthority: false, masterDataAuthority: false,
    },
    evidence: evidenceValue(inspected, notApplicable),
  });
}

export function buildMechanicalVibrationMechanismAssessmentSet(options = {}) {
  const item = buildMechanicalVibrationMechanismAssessmentItem(options);
  return createVibrationMechanismAssessmentSet({
    mechanismId: MECHANICAL_VIBRATION_MECHANISM_ID,
    scope: item.scope,
    items: [item],
  });
}
