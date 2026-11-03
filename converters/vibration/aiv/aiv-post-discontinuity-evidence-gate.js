import {
  AIV_ASSUMPTION_PROFILE_SCHEMA,
  AIV_DEFAULT_ASSUMPTION_PROFILE,
  validateAivAssumptionProfile,
} from './aiv-assumption-profile.js';

export const AIV_POST_DISCONTINUITY_EVIDENCE_GATE_SCHEMA = 'AivPostDiscontinuityEvidenceGate.v2';
export const AIV_POST_DISCONTINUITY_GATE_STATUS = Object.freeze({
  BLOCKED_INVALID_ASSUMPTION_PROFILE: 'BLOCKED_INVALID_ASSUMPTION_PROFILE',
  READY_FOR_POST_DISCONTINUITY_CANDIDATE_IMPLEMENTATION: 'READY_FOR_POST_DISCONTINUITY_CANDIDATE_IMPLEMENTATION',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildAivPostDiscontinuityEvidenceGate({
  assumptionProfile = AIV_DEFAULT_ASSUMPTION_PROFILE,
} = {}) {
  const validation = validateAivAssumptionProfile(assumptionProfile);
  const benchmark = assumptionProfile?.benchmark ?? {};
  const scopeConfigured = assumptionProfile?.schema === AIV_ASSUMPTION_PROFILE_SCHEMA
    && benchmark.lineAggregationMode === 'SEPARATE_RESULT_SCOPES'
    && benchmark.assessmentMode === 'BENCHMARK_COMPARE_ONLY'
    && numeric(benchmark.d23FirstDiscontinuityLof) !== null
    && numeric(benchmark.workedExampleReliefLineLof) !== null;
  const ready = validation.valid && scopeConfigured;

  return deepFreeze({
    schema: AIV_POST_DISCONTINUITY_EVIDENCE_GATE_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    stageIds: ['AGGREGATE_LINE_CASE_RESULT', 'ASSESS_RESULT'],
    status: ready
      ? AIV_POST_DISCONTINUITY_GATE_STATUS.READY_FOR_POST_DISCONTINUITY_CANDIDATE_IMPLEMENTATION
      : AIV_POST_DISCONTINUITY_GATE_STATUS.BLOCKED_INVALID_ASSUMPTION_PROFILE,
    readyForCandidateImplementation: ready,
    humanEvidenceRequired: false,
    assumptionProfileValidation: validation,
    scopeBoundary: {
      sourceResultScope: 'SOURCE',
      firstDiscontinuityScope: 'ASSESSMENT',
      derivedReportScope: 'LINE_CASE_SUMMARY',
      d23FirstDiscontinuityLof: numeric(benchmark.d23FirstDiscontinuityLof),
      workedExampleReliefLineLof: numeric(benchmark.workedExampleReliefLineLof),
      lineAggregationMode: benchmark.lineAggregationMode ?? null,
      assessmentMode: benchmark.assessmentMode ?? null,
      valuesAreNotInterchangeable: true,
      aggregationMustNotBeInferredFromSingleFirstDiscontinuity: true,
    },
    assessmentBoundary: {
      benchmarkComparisonOnly: true,
      assumptionsAreUserConfigurable: true,
      universalPassSafeClassificationForbidden: true,
      genericScreeningAuthorityClaimed: false,
    },
    authority: {
      authorityTransitionApplied: false,
      calculationState: 'BLOCKED',
      qualificationState: 'BLOCKED',
      engineeringAuthority: 'NONE',
      productionEquationAuthorized: false,
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
    },
    notes: [
      'Stages 9–10 are benchmark-assumption driven; no human review artifact is required.',
      'The D.2.3 first-discontinuity and worked-example line-level LOF references remain separate configurable result-scope benchmarks.',
      'BENCHMARK_COMPARE_ONLY does not create generic pass/safe or screening authority.',
    ],
  });
}
