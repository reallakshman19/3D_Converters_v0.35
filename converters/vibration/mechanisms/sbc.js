import { evaluateSbcFacilityType3 } from '../sbc/facility.js?v=20260815-sbc-pf05-cache-1';
import {
  createVibrationMechanismAssessmentItem,
  createVibrationMechanismAssessmentSet,
} from './contracts.js';

export const SBC_VIBRATION_MECHANISM_ID = 'smallBoreConnections';
export const SBC_VIBRATION_MECHANISM_IMPLEMENTATION_STATE = 'IMPLEMENTED_CANDIDATE_USER_INPUT';

function scopeFromRow(row = {}) {
  return { line: row.line, caseId: row.caseId ?? null, canonicalId: row.canonicalId };
}

function readinessFromEvaluation(evaluation) {
  if (evaluation.status === 'INPUT_REQUIRED') {
    return {
      missing: ['SBC_TYPE3_USER_INPUT_TEMPLATE'], invalid: [],
      reasons: ['SBC_APPLICABILITY_AND_TYPE3_INPUT_REQUIRED'],
    };
  }
  if (evaluation.result?.ok === false) {
    const problems = evaluation.result.problems ?? [];
    return {
      missing: problems.filter((item) => ['NOT_READY', 'INPUT_REQUIRED'].includes(item.status))
        .map((item) => item.term),
      invalid: problems.filter((item) => !['NOT_READY', 'INPUT_REQUIRED'].includes(item.status))
        .map((item) => item.term),
      reasons: problems.map((item) => `${item.term}:${item.status}${item.reason ? `:${item.reason}` : ''}`),
    };
  }
  return { missing: [], invalid: [], reasons: [] };
}

function assessmentState(evaluation) {
  if (evaluation.status === 'INPUT_REQUIRED') return 'APPLICABILITY_UNKNOWN';
  if (!evaluation.ok) return 'APPLICABLE_INCOMPLETE';
  return 'CALCULATED';
}

function resultState(evaluation, requested) {
  if (!evaluation.ok) return 'UNRUN';
  if (requested === 'STALE_RESULT') return 'STALE_RESULT';
  return 'CURRENT_RESULT';
}

function resultValue(evaluation) {
  if (!evaluation.ok) {
    return {
      calculated: false, governingLof: null,
      methodId: evaluation.result?.methodId ?? null, status: evaluation.status,
    };
  }
  return {
    calculated: true,
    governingLof: evaluation.result.lof,
    methodId: evaluation.result.methodId,
    status: evaluation.result.status,
    overallModifier: evaluation.result.overallModifier,
    mainlineAdjustedLof: evaluation.result.mainline.adjustedLof,
    firstSpan: evaluation.result.firstSpan,
    subsequentSpans: evaluation.result.subsequentSpans,
  };
}

function evidenceClass(evaluation) {
  return evaluation.result?.status === 'CALCULATED_MASTER_ASSISTED_CANDIDATE'
    ? 'MASTER_ASSISTED_WITH_PROJECT_CURVE_EVIDENCE'
    : 'USER_SUPPLIED_PROJECT_INPUT';
}

export function buildSbcVibrationMechanismAssessmentItem({
  row,
  userRows = [],
  governed = {},
  precomputedCandidate = null,
  resultState: requestedResultState = null,
} = {}) {
  const evaluation = evaluateSbcFacilityType3(row, { userRows, governed, precomputedCandidate });
  const result = resultValue(evaluation);
  return createVibrationMechanismAssessmentItem({
    mechanismId: SBC_VIBRATION_MECHANISM_ID,
    scope: scopeFromRow(row),
    childKey: 'type3',
    childOrdinal: 0,
    implementationState: SBC_VIBRATION_MECHANISM_IMPLEMENTATION_STATE,
    assessmentState: assessmentState(evaluation),
    resultState: resultState(evaluation, requestedResultState),
    applicability: {
      status: evaluation.status === 'INPUT_REQUIRED' ? 'UNKNOWN' : 'USER_SELECTED_TYPE3',
      facilityScopeId: evaluation.scope.scopeId,
    },
    readiness: readinessFromEvaluation(evaluation),
    request: {
      methodId: evaluation.result?.methodId ?? 'VIB.SBC.T3.TYPE3.USER_INPUT_CANDIDATE',
      facilityScopeId: evaluation.scope.scopeId,
      evidenceClass: evidenceClass(evaluation),
    },
    execution: evaluation.ok ? {
      status: evaluation.result.status,
      screeningAuthorized: false,
    } : null,
    result,
    trace: {
      equationIds: [],
      ruleIds: ['SBC-T3-FIRST-MAX-MIN', 'SBC-T3-SUBSEQUENT-MAX-MIN', 'SBC-T3-MAINLINE-CAP'],
      correlationIds: [],
      inputTrace: {
        status: evaluation.userRows.length ? 'SOURCE_AND_NORMALIZED_ONLY' : 'UNAVAILABLE',
        normalizedInputs: evaluation.result?.evidence ?? {},
        sourceTrace: evaluation.userRows,
      },
    },
    qualification: {
      effective: 'CANDIDATE_USER_INPUT',
      engineeringAuthority: 'NONE',
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
    },
    evidence: {
      facilityScope: evaluation.scope,
      userRows: evaluation.userRows,
      authority: evaluation.authority,
      masterAssisted: evaluation.result?.status === 'CALCULATED_MASTER_ASSISTED_CANDIDATE',
    },
  });
}

export function buildSbcVibrationMechanismAssessmentSet(options = {}) {
  const item = buildSbcVibrationMechanismAssessmentItem(options);
  return createVibrationMechanismAssessmentSet({
    mechanismId: SBC_VIBRATION_MECHANISM_ID,
    scope: item.scope,
    items: [item],
  });
}
