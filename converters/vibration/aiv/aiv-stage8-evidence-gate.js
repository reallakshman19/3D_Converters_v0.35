import {
  AIV_ASSUMPTION_PROFILE_SCHEMA,
  AIV_DEFAULT_ASSUMPTION_PROFILE,
  validateAivAssumptionProfile,
} from './aiv-assumption-profile.js';

export const AIV_STAGE8_EVIDENCE_GATE_SCHEMA = 'AivDiscontinuityStage8EvidenceGate.v2';
export const AIV_STAGE8_GATE_STATUS = Object.freeze({
  BLOCKED_INVALID_ASSUMPTION_PROFILE: 'BLOCKED_INVALID_ASSUMPTION_PROFILE',
  READY_FOR_CANDIDATE_IMPLEMENTATION: 'READY_FOR_CANDIDATE_IMPLEMENTATION',
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

export function buildAivDiscontinuityStage8EvidenceGate({
  assumptionProfile = AIV_DEFAULT_ASSUMPTION_PROFILE,
} = {}) {
  const validation = validateAivAssumptionProfile(assumptionProfile);
  const benchmark = assumptionProfile?.benchmark ?? {};
  const flm1Mode = benchmark.flm1Mode;
  const selectedFlm1 = flm1Mode === 'RECALCULATED'
    ? numeric(benchmark.flm1Recalculated)
    : numeric(benchmark.flm1Published);
  const stage8ConfigValid = assumptionProfile?.schema === AIV_ASSUMPTION_PROFILE_SCHEMA
    && benchmark.stage8Model === 'CONFIGURED_D23_INTERMEDIATES'
    && ['PUBLISHED', 'RECALCULATED'].includes(flm1Mode)
    && selectedFlm1 !== null
    && numeric(benchmark.publishedA) !== null
    && numeric(benchmark.publishedS) !== null
    && numeric(benchmark.publishedB) !== null
    && numeric(benchmark.flm2) !== null
    && numeric(benchmark.lossFactor) !== null;
  const ready = validation.valid && stage8ConfigValid;

  return deepFreeze({
    schema: AIV_STAGE8_EVIDENCE_GATE_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    stageId: 'CALCULATE_DISCONTINUITY_RESULT',
    status: ready
      ? AIV_STAGE8_GATE_STATUS.READY_FOR_CANDIDATE_IMPLEMENTATION
      : AIV_STAGE8_GATE_STATUS.BLOCKED_INVALID_ASSUMPTION_PROFILE,
    readyForCandidateImplementation: ready,
    humanEvidenceRequired: false,
    assumptionProfileValidation: validation,
    configuredBenchmarkModel: {
      mode: benchmark.stage8Model ?? null,
      A: numeric(benchmark.publishedA),
      S: numeric(benchmark.publishedS),
      B: numeric(benchmark.publishedB),
      flm1Mode,
      flm1: selectedFlm1,
      flm1ToleranceAbs: numeric(benchmark.flm1ToleranceAbs),
      flm2: numeric(benchmark.flm2),
      lossFactor: numeric(benchmark.lossFactor),
      benchmarkExpectedLof: numeric(benchmark.d23FirstDiscontinuityLof),
    },
    implementationBoundary: {
      benchmarkOnlyParameterization: true,
      assumptionsAreUserConfigurable: true,
      hiddenDefaultsForbidden: true,
      genericScreeningEquationAuthorityClaimed: false,
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
      'Stage 8 is benchmark-assumption driven; no human review artifact is required.',
      'The D.2.3 A/S/B and FLM parameters are explicit user-configurable benchmark parameters, never hidden defaults.',
      'This gate supports BENCHMARK_ONLY candidate implementation and does not claim generic SCREENING applicability.',
    ],
  });
}
