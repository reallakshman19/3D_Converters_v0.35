export const AIV_INDEPENDENT_BENCHMARK_SCHEMA = 'AivIndependentBenchmarkEvidence.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const AIV_INDEPENDENT_BENCHMARKS = deepFreeze([
  {
    benchmarkId: 'AIV-HAND-SONIC-SFF6-001',
    benchmarkType: 'INDEPENDENT_ANALYTICAL_VECTOR',
    purpose: 'Exercise the explicit sonic SFF = 6 dB source-PWL branch independently of EI D.2.3.',
    requiredTraceIds: ['AIV-EQ-SOURCE-PWL-001', 'AIV-CONST-SFF-001'],
    inputs: {
      upstreamPressureAbsolute: { value: 5.0e6, unit: 'Pa abs' },
      downstreamPressureAbsolute: { value: 1.0e6, unit: 'Pa abs' },
      massFlow: { value: 10, unit: 'kg/s' },
      upstreamTemperature: { value: 300, unit: 'K' },
      molecularWeight: { value: 20, unit: 'g/mol' },
      sonicState: 'SONIC',
      sonicFlowFactorDb: 6,
    },
    expected: {
      nonSonicReferencePwlDb: 156.72433464037815,
      sonicPwlDb: 162.72433464037815,
      sonicDeltaDb: 6,
    },
    tolerance: {
      pwlDbAbs: 1e-9,
      sonicDeltaDbAbs: 1e-12,
      rationale: 'Analytical benchmark retains full double-precision expected values; production comparison tolerance must be separately qualified.',
    },
    reviewState: 'HUMAN_ACCEPTANCE_REQUIRED',
    productionAuthority: false,
  },
  {
    benchmarkId: 'AIV-HAND-MULTI-SOURCE-EQUAL-001',
    benchmarkType: 'INDEPENDENT_ANALYTICAL_VECTOR',
    purpose: 'Exercise logarithmic combination of two simultaneous equal point-level acoustic contributions.',
    requiredTraceIds: ['AIV-EQ-MULTI-SOURCE-001'],
    inputs: {
      contributionPwlDb: [160, 160],
      combinationPoint: 'SAME_ASSESSMENT_POINT_SAME_OPERATING_CASE',
    },
    expected: {
      combinedPwlDb: 163.0102999566398,
      increaseAboveSingleSourceDb: 3.010299956639812,
    },
    tolerance: {
      combinedPwlDbAbs: 1e-9,
      rationale: 'Analytical log-power benchmark; production comparison tolerance must be separately qualified.',
    },
    reviewState: 'HUMAN_ACCEPTANCE_REQUIRED',
    productionAuthority: false,
  },
  {
    benchmarkId: 'AIV-HAND-MULTI-SOURCE-ASYM-001',
    benchmarkType: 'INDEPENDENT_ANALYTICAL_VECTOR',
    purpose: 'Exercise logarithmic combination where one simultaneous point-level contribution is 10 dB below the other.',
    requiredTraceIds: ['AIV-EQ-MULTI-SOURCE-001'],
    inputs: {
      contributionPwlDb: [160, 150],
      combinationPoint: 'SAME_ASSESSMENT_POINT_SAME_OPERATING_CASE',
    },
    expected: {
      combinedPwlDb: 160.41392685158226,
      increaseAboveDominantSourceDb: 0.4139268515822578,
    },
    tolerance: {
      combinedPwlDbAbs: 1e-9,
      rationale: 'Analytical log-power benchmark; production comparison tolerance must be separately qualified.',
    },
    reviewState: 'HUMAN_ACCEPTANCE_REQUIRED',
    productionAuthority: false,
  },
]);

export const AIV_INDEPENDENT_BENCHMARK_EVIDENCE = deepFreeze({
  schema: AIV_INDEPENDENT_BENCHMARK_SCHEMA,
  methodId: 'VIB.AIV.ACOUSTIC',
  evidenceClass: 'INDEPENDENT_ANALYTICAL_BENCHMARK_PENDING_HUMAN_ACCEPTANCE',
  benchmarks: AIV_INDEPENDENT_BENCHMARKS,
  authority: {
    calculationState: 'BLOCKED',
    qualificationState: 'BLOCKED',
    productionEquationAuthorized: false,
    screeningAuthority: 'NOT_AUTHORIZED',
    designAuthority: false,
  },
});
