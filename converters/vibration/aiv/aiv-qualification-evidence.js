import { AIV_EI_EXAMPLES_PDF_SOURCE } from './aiv-d23-pdf-revalidation.js';

export const AIV_QUALIFICATION_EVIDENCE_SCHEMA = 'AivQualificationEvidence.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const AIV_EI_MAIN_GUIDANCE_SOURCE = deepFreeze({
  sourceId: 'AIV-SRC-EI-AVIFF2-T2-7',
  repository: 'reallaksh19/Common',
  commit: 'aef163a5def3bfe04ca0ba860da05728a27daf42',
  path: 'EI - AVIFF Guidelines 2nd Edition.pdf',
  gitBlob: '9d3eccc56429411e17c07a579bdebbd13cb0bdc5',
  edition: '2nd',
  published: 'January 2008',
  locator: 'T2.7 High Frequency Acoustic Excitation, pages 59-62',
  officialErrata: {
    pages: [61, 68],
    aivRelevantPage: 61,
    officialStatement: 'Energy Institute states the errata changes are incorporated into the main PDF.',
  },
  controlledContentExtractionState: 'PINNED_BLOB_CONTENT_RECONCILIATION_REQUIRED',
  productionAuthority: false,
});

export const AIV_EI_D23_SOURCE = deepFreeze({
  sourceId: 'AIV-SRC-EI-D2-3',
  repository: 'reallaksh19/Common',
  commit: 'fb549185b9b27edc2379734240320a85c5bef9f6',
  path: 'Energy-Institute-AVIFF---Worked-Examples.doc.docx',
  gitBlob: 'ceee15ed5f7f320045d5f3979024e2e8664613f2',
  locator: 'Appendix D / D.2.3 High Frequency Acoustic Excitation (T2.7)',
  evidenceClass: 'EI_WORKED_EXAMPLE',
  productionAuthority: false,
});

export const AIV_D23_BENCHMARK_CASES = deepFreeze([
  {
    benchmarkId: 'AIV-EI-D2-3-RELIEF-SOURCE',
    sourceId: AIV_EI_D23_SOURCE.sourceId,
    caseLabel: 'Relief valve lifts',
    evidenceState: 'PUBLISHED_VALUES_CAPTURED_PARTIAL_CHAIN',
    publishedInputs: {
      sourceDeviceType: 'RELIEF_VALVE',
      upstreamPressure: { value: 98, unit: 'barg' },
      downstreamPressure: { value: 0, unit: 'barg' },
      publishedUpstreamPressureAbsolute: { value: 9.9, unit: 'MPa abs' },
      publishedDownstreamPressureAbsolute: { value: 0.1, unit: 'MPa abs' },
      massFlow: { value: 53482, unit: 'kg/h' },
      publishedMassFlowNormalized: { value: 14.86, unit: 'kg/s' },
      upstreamTemperature: { value: 137, unit: 'degC' },
      publishedTemperatureAbsolute: { value: 410, unit: 'K' },
      molecularWeight: { value: 21.75, unit: 'g/mol' },
      sonicState: 'NON_SONIC',
      sonicFlowFactorDb: 0,
    },
    publishedOutputs: { sourcePwlDb: 164.7 },
    tolerance: {
      sourcePwlDb: 0.05,
      rationale: 'Published source PWL is reported to one decimal place; tolerance is half the displayed increment.',
    },
    traceIds: [
      'AIV-SRC-EI-D2-3-PRESSURE', 'AIV-SRC-EI-D2-3-NONSONIC',
      'AIV-SRC-EI-D2-3-SOURCE-PWL', 'AIV-SRC-EI-D2-3-155DB',
    ],
  },
  {
    benchmarkId: 'AIV-EI-D2-3-RECYCLE-SOURCE',
    sourceId: AIV_EI_D23_SOURCE.sourceId,
    caseLabel: 'Recycle valve opens',
    evidenceState: 'PUBLISHED_VALUES_CAPTURED_PARTIAL_CHAIN',
    publishedInputs: {
      sourceDeviceType: 'CONTROL_VALVE',
      upstreamPressure: { value: 87, unit: 'barg' },
      downstreamPressure: { value: 25, unit: 'barg' },
      publishedUpstreamPressureAbsolute: { value: 8.8, unit: 'MPa abs' },
      publishedDownstreamPressureAbsolute: { value: 2.6, unit: 'MPa abs' },
      massFlow: { value: 53482, unit: 'kg/h' },
      upstreamTemperature: { value: 136.7, unit: 'degC' },
      publishedTemperatureAbsolute: { value: 410, unit: 'K' },
      molecularWeight: { value: 21.75, unit: 'g/mol' },
      sonicState: 'NON_SONIC',
      sonicFlowFactorDb: 0,
      lowNoiseTrim: {
        state: 'MANUFACTURER_REDUCTION',
        reduction: { value: 30, unit: 'dB', qualifier: 'approximately' },
      },
    },
    publishedOutputs: { sourcePwlDb: 159.4 },
    tolerance: {
      sourcePwlDb: 0.05,
      rationale: 'Published source PWL is reported to one decimal place; tolerance is half the displayed increment.',
    },
    traceIds: [
      'AIV-SRC-EI-D2-3-PRESSURE', 'AIV-SRC-EI-D2-3-NONSONIC',
      'AIV-SRC-EI-D2-3-TRIM', 'AIV-SRC-EI-D2-3-SOURCE-PWL', 'AIV-SRC-EI-D2-3-155DB',
    ],
  },
  {
    benchmarkId: 'AIV-EI-D2-3-RELIEF-DISCONTINUITY',
    sourceId: AIV_EI_D23_SOURCE.sourceId,
    caseLabel: 'Relief source to first evaluated bypass weldolet',
    evidenceState: 'PUBLISHED_VALUES_CAPTURED_FULL_CHAIN_ARITHMETIC_RECONCILIATION_OPEN',
    publishedInputs: {
      assessmentDescription: '2-inch bypass weldolet',
      sourceToAssessmentDistance: { value: 0.8, unit: 'm' },
      mainPipeInsideDiameter: { value: 154, unit: 'mm' },
      mainPipeOutsideDiameter: { value: 168.3, unit: 'mm' },
      mainPipeWallThickness: { value: 7.11, unit: 'mm' },
      branchOutsideDiameter: { value: 60.3, unit: 'mm' },
      sourcePwlDb: 164.7,
    },
    publishedIntermediates: {
      attenuationDb: 0.312,
      assessmentPwlDb: 164.4,
      A: 0.93989,
      S: 68.229,
      B: 152.207,
      log10N: 9.9026,
      N: 7.99e9,
      diameterRatioDextOverDextBranch: 2.791,
      FLM1: 1.2133,
      NAfterFLM1: 9.70e9,
      FLM2: 0.2009,
      NAfterFLM2: 1.95e9,
      materialDuplex: false,
      Lf: 0.31,
    },
    publishedFinal: {
      LOF: 0.29,
      rule: 'Lf < 0.5 therefore LOF = 0.29',
    },
    arithmeticReconciliation: {
      state: 'OPEN',
      item: 'FLM1',
      equationRecalculatedFromDisplayedInputs: 1.2109758194311824,
      publishedValue: 1.2133,
      consequence: 'FINAL_LOF_UNCHANGED_AT_0_29',
    },
    traceIds: ['AIV-SRC-EI-D2-3-ATTENUATION', 'AIV-SRC-EI-D2-3-T2-6'],
  },
]);

const MAIN_LOCATION_STATE = 'SOURCE_LOCATION_IDENTIFIED_CONTROLLED_EXTRACTION_REQUIRED';

export const AIV_METHOD_TRACE_FOUNDATION = deepFreeze([
  {
    traceId: 'AIV-APP-T2-7-EXTENT-001', namespace: 'AIV-APP', sourceId: AIV_EI_MAIN_GUIDANCE_SOURCE.sourceId,
    locator: 'T2.7.1, page 59',
    subject: 'Excitation extent, downstream boundary, welded discontinuities and pressure-reducing source classes',
    qualificationState: MAIN_LOCATION_STATE, benchmarkIds: [],
  },
  {
    traceId: 'AIV-UNIT-T2-7-INPUTS-001', namespace: 'AIV-UNIT', sourceId: AIV_EI_MAIN_GUIDANCE_SOURCE.sourceId,
    locator: 'T2.7.2, page 59',
    subject: 'T2.7 native input symbols and units including P1/P2 absolute pressure, Te, Mw, W, Dext/dext/Dint/T/t/Ldis',
    qualificationState: MAIN_LOCATION_STATE, benchmarkIds: [],
  },
  {
    traceId: 'AIV-EQ-SOURCE-PWL-001', namespace: 'AIV-EQ', sourceId: AIV_EI_MAIN_GUIDANCE_SOURCE.sourceId,
    locator: 'T2.7.3 / Flowchart T2-5, page 60', subject: 'Source sound-power-level equation',
    qualificationState: MAIN_LOCATION_STATE,
    benchmarkIds: ['AIV-EI-D2-3-RELIEF-SOURCE', 'AIV-EI-D2-3-RECYCLE-SOURCE'],
  },
  {
    traceId: 'AIV-CONST-SFF-001', namespace: 'AIV-CONST', sourceId: AIV_EI_MAIN_GUIDANCE_SOURCE.sourceId,
    locator: 'T2.7.3, page 60', subject: 'Sonic-flow correction factor branch',
    qualificationState: MAIN_LOCATION_STATE, benchmarkIds: ['AIV-EI-D2-3-RELIEF-SOURCE', 'AIV-EI-D2-3-RECYCLE-SOURCE'],
  },
  {
    traceId: 'AIV-ASS-155DB-001', namespace: 'AIV-ASS', sourceId: AIV_EI_MAIN_GUIDANCE_SOURCE.sourceId,
    locator: 'Flowchart T2-5, page 60', subject: '155 dB source/discontinuity branch behavior and 0.29 reference branch',
    qualificationState: MAIN_LOCATION_STATE, benchmarkIds: ['AIV-EI-D2-3-RELIEF-SOURCE', 'AIV-EI-D2-3-RECYCLE-SOURCE'],
  },
  {
    traceId: 'AIV-EQ-ATTENUATION-001', namespace: 'AIV-EQ', sourceId: AIV_EI_MAIN_GUIDANCE_SOURCE.sourceId,
    locator: 'Flowchart T2-5, page 60', subject: 'Source-to-discontinuity acoustic attenuation equation',
    qualificationState: MAIN_LOCATION_STATE, benchmarkIds: ['AIV-EI-D2-3-RELIEF-DISCONTINUITY'],
  },
  {
    traceId: 'AIV-EQ-MULTI-SOURCE-001', namespace: 'AIV-EQ', sourceId: AIV_EI_MAIN_GUIDANCE_SOURCE.sourceId,
    locator: 'Flowchart T2-5, page 60', subject: 'Multiple-source PWL combination equation',
    qualificationState: MAIN_LOCATION_STATE, benchmarkIds: [],
  },
  {
    traceId: 'AIV-ASS-LOW-NOISE-TRIM-001', namespace: 'AIV-ASS', sourceId: AIV_EI_MAIN_GUIDANCE_SOURCE.sourceId,
    locator: 'Note 1 / T2.7.3, page 61', subject: 'Low-noise-trim manufacturer reduction rule and prohibition on substituting vendor source PWL',
    qualificationState: MAIN_LOCATION_STATE, benchmarkIds: ['AIV-EI-D2-3-RECYCLE-SOURCE'],
  },
  {
    traceId: 'AIV-EQ-T2-6-001', namespace: 'AIV-EQ', sourceId: AIV_EI_MAIN_GUIDANCE_SOURCE.sourceId,
    locator: 'Flowchart T2-6, page 61', subject: 'Individual welded-discontinuity fatigue/LOF chain',
    qualificationState: 'ERRATA_PAGE_61_CONTROLLED_CONTENT_RECONCILIATION_REQUIRED',
    benchmarkIds: ['AIV-EI-D2-3-RELIEF-DISCONTINUITY'],
    gaps: ['OFFICIAL_ERRATA_PAGE_61_APPLIES'],
  },
  {
    traceId: 'AIV-SRC-EI-D2-3-PRESSURE', namespace: 'AIV-SRC', sourceId: AIV_EI_D23_SOURCE.sourceId,
    locator: AIV_EI_D23_SOURCE.locator, subject: 'Worked-example P1/P2 pressure basis and gauge-to-absolute treatment',
    qualificationState: 'WORKED_EXAMPLE_EVIDENCE_CAPTURED',
    benchmarkIds: ['AIV-EI-D2-3-RELIEF-SOURCE', 'AIV-EI-D2-3-RECYCLE-SOURCE'],
  },
  {
    traceId: 'AIV-SRC-EI-D2-3-NONSONIC', namespace: 'AIV-SRC', sourceId: AIV_EI_D23_SOURCE.sourceId,
    locator: AIV_EI_D23_SOURCE.locator, subject: 'Published D.2.3 cases use non-sonic branch with SFF = 0',
    qualificationState: 'WORKED_EXAMPLE_EVIDENCE_CAPTURED',
    benchmarkIds: ['AIV-EI-D2-3-RELIEF-SOURCE', 'AIV-EI-D2-3-RECYCLE-SOURCE'],
  },
  {
    traceId: 'AIV-SRC-EI-D2-3-TRIM', namespace: 'AIV-SRC', sourceId: AIV_EI_D23_SOURCE.sourceId,
    locator: AIV_EI_D23_SOURCE.locator, subject: 'Manufacturer low-noise-trim reduction in recycle-valve example',
    qualificationState: 'WORKED_EXAMPLE_EVIDENCE_CAPTURED', benchmarkIds: ['AIV-EI-D2-3-RECYCLE-SOURCE'],
  },
  {
    traceId: 'AIV-SRC-EI-D2-3-SOURCE-PWL', namespace: 'AIV-SRC', sourceId: AIV_EI_D23_SOURCE.sourceId,
    locator: AIV_EI_D23_SOURCE.locator, subject: 'Published source-PWL benchmark outputs',
    qualificationState: 'WORKED_EXAMPLE_OUTPUT_CAPTURED',
    benchmarkIds: ['AIV-EI-D2-3-RELIEF-SOURCE', 'AIV-EI-D2-3-RECYCLE-SOURCE'],
  },
  {
    traceId: 'AIV-SRC-EI-D2-3-155DB', namespace: 'AIV-SRC', sourceId: AIV_EI_D23_SOURCE.sourceId,
    locator: AIV_EI_D23_SOURCE.locator, subject: 'Worked-example behavior around the 155 dB source-level branch',
    qualificationState: 'WORKED_EXAMPLE_BRANCH_EVIDENCE_ONLY',
    benchmarkIds: ['AIV-EI-D2-3-RELIEF-SOURCE', 'AIV-EI-D2-3-RECYCLE-SOURCE'],
    gaps: ['PRODUCTION_THRESHOLD_RULE_REQUIRES_MAIN_GUIDANCE_TRACE'],
  },
  {
    traceId: 'AIV-SRC-EI-D2-3-ATTENUATION', namespace: 'AIV-SRC', sourceId: AIV_EI_D23_SOURCE.sourceId,
    locator: AIV_EI_D23_SOURCE.locator, subject: 'Published relief-source downstream attenuation example',
    qualificationState: 'WORKED_EXAMPLE_EVIDENCE_CAPTURED', benchmarkIds: ['AIV-EI-D2-3-RELIEF-DISCONTINUITY'],
  },
  {
    traceId: 'AIV-SRC-EI-D2-3-T2-6', namespace: 'AIV-SRC', sourceId: AIV_EI_D23_SOURCE.sourceId,
    locator: AIV_EI_D23_SOURCE.locator, subject: 'Published T2-6 weldolet full chain through final LOF',
    qualificationState: 'WORKED_EXAMPLE_FULL_CHAIN_CAPTURED_ARITHMETIC_RECONCILIATION_OPEN',
    benchmarkIds: ['AIV-EI-D2-3-RELIEF-DISCONTINUITY'],
    gaps: ['PUBLISHED_FLM1_ARITHMETIC_RECONCILIATION_REQUIRED'],
  },
  {
    traceId: 'AIV-SRC-GAP-SONIC-SFF6', namespace: 'AIV-SRC', sourceId: AIV_EI_D23_SOURCE.sourceId,
    locator: AIV_EI_D23_SOURCE.locator, subject: 'Sonic SFF = 6 branch',
    qualificationState: 'INDEPENDENT_BENCHMARK_REQUIRED', benchmarkIds: [],
  },
  {
    traceId: 'AIV-SRC-GAP-MULTI-SOURCE', namespace: 'AIV-SRC', sourceId: AIV_EI_D23_SOURCE.sourceId,
    locator: AIV_EI_D23_SOURCE.locator, subject: 'Multiple simultaneous acoustic sources',
    qualificationState: 'INDEPENDENT_BENCHMARK_REQUIRED', benchmarkIds: [],
  },
]);

export const AIV_QUALIFICATION_EVIDENCE = deepFreeze({
  schema: AIV_QUALIFICATION_EVIDENCE_SCHEMA,
  methodId: 'VIB.AIV.ACOUSTIC',
  authority: {
    calculationState: 'BLOCKED', qualificationState: 'BLOCKED',
    screeningAuthority: 'NOT_AUTHORIZED', designAuthority: false,
  },
  sources: [AIV_EI_MAIN_GUIDANCE_SOURCE, AIV_EI_D23_SOURCE, AIV_EI_EXAMPLES_PDF_SOURCE],
  traceItems: AIV_METHOD_TRACE_FOUNDATION,
  benchmarks: AIV_D23_BENCHMARK_CASES,
  productionEquationAuthorized: false,
});
