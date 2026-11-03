import { evaluateFitQualificationCoverage } from './qualification-coverage.js';

export const FIT_SCREENING_CANDIDATE_SCOPE_ID = 'FIT-SCREENING-CANDIDATE-V1';

function freezeResult(value) {
  return Object.freeze({
    scopeId: FIT_SCREENING_CANDIDATE_SCOPE_ID,
    screeningAuthorized: false,
    engineeringAuthority: 'NONE',
    domainCoverageEstablished: false,
    pointCoverageOnly: false,
    candidateForEngineeringReview: false,
    ...value,
    reasons: Object.freeze([...(value.reasons ?? [])]),
  });
}

function evidenceReady(evidence) {
  return evidence && evidence.noIndependentExample !== true
    && evidence.evidenceStrength !== 'NONE'
    && evidence.evidenceStrength !== 'RETAINED_PARITY_ONLY';
}

export function evaluateFitScreeningCandidateScope(calculation = {}) {
  if (!calculation?.ok) {
    return freezeResult({
      status: 'CALCULATION_UNAVAILABLE',
      coverageId: null,
      continuationRequired: null,
      reasons: ['SUCCESSFUL_REFERENCE_CALCULATION_REQUIRED'],
    });
  }

  const coverage = calculation.qualificationCoverage ?? evaluateFitQualificationCoverage(calculation);
  if (coverage.screeningQualified !== true || coverage.engineeringAuthority !== 'SCREENING') {
    return freezeResult({
      status: 'SCREENING_QUALIFICATION_NOT_ESTABLISHED',
      coverageId: coverage.coverageId ?? null,
      continuationRequired: null,
      reasons: ['QUALIFIED_SCREENING_COVERAGE_REQUIRED'],
    });
  }

  if (!evidenceReady(coverage.phasePath)) {
    return freezeResult({
      status: 'PHASE_PATH_NOT_QUALIFIED',
      coverageId: coverage.coverageId,
      continuationRequired: null,
      reasons: [`PHASE_PATH_${coverage.phasePath?.path ?? 'UNKNOWN'}_NOT_QUALIFIED`],
    });
  }

  if (!evidenceReady(coverage.standardCorrelation)) {
    return freezeResult({
      status: 'STANDARD_CORRELATION_NOT_QUALIFIED',
      coverageId: coverage.coverageId,
      continuationRequired: null,
      reasons: [`STANDARD_CORRELATION_${coverage.standardCorrelation?.supportCategory ?? 'UNKNOWN'}_NOT_QUALIFIED`],
    });
  }

  if (calculation.advanced && !coverage.advancedCorrelation?.independentHandBenchmarkCoverage) {
    return freezeResult({
      status: 'ADVANCED_CORRELATION_NOT_QUALIFIED',
      coverageId: coverage.coverageId,
      continuationRequired: null,
      reasons: ['ADVANCED_CORRELATION_REQUIRES_INDEPENDENT_HAND_BENCHMARK_COVERAGE'],
    });
  }

  const continuationRequired = !calculation.advanced && calculation.standard.lof >= 1;
  return freezeResult({
    screeningAuthorized: true,
    engineeringAuthority: 'SCREENING',
    domainCoverageEstablished: true,
    status: continuationRequired
      ? 'QUALIFIED_BOUNDED_SCREENING_FURTHER_ASSESSMENT_REQUIRED'
      : 'QUALIFIED_BOUNDED_SCREENING',
    coverageId: coverage.coverageId,
    continuationRequired,
    phasePath: coverage.phasePath.path,
    supportCategory: coverage.standardCorrelation.supportCategory,
    standardReferenceLof: calculation.standard.lof,
    governingReferenceLof: calculation.governingReferenceLof,
    coverageBasis: 'CONTROLLED_WORKED_EXAMPLE_PLUS_BRANCH_QUALIFICATION_EVIDENCE',
    reasons: [
      'OWNER_WORKED_EXAMPLE_BENCHMARK_POLICY_APPLIED',
      'PHASE_PATH_QUALIFIED',
      'STANDARD_CORRELATION_QUALIFIED',
      ...(calculation.advanced ? ['ADVANCED_CORRELATION_INDEPENDENTLY_QUALIFIED'] : []),
      ...(continuationRequired ? ['STANDARD_LOF_AT_OR_ABOVE_REFERENCE_THRESHOLD'] : []),
      'SCREENING_ONLY_DESIGN_AUTHORITY_FALSE',
    ],
  });
}
