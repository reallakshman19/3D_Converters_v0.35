const EVIDENCE = Object.freeze({
  EI_WORKED_EXAMPLE_POINT: 'EI_WORKED_EXAMPLE_POINT',
  RETAINED_WORKBOOK_PARITY: 'RETAINED_WORKBOOK_PARITY',
  INDEPENDENT_HAND_BENCHMARK: 'INDEPENDENT_HAND_BENCHMARK',
  EQUIVALENCE_TEST: 'EQUIVALENCE_TEST',
  NO_INDEPENDENT_EXAMPLE: 'NO_INDEPENDENT_EXAMPLE',
});

export const FIT_QUALIFICATION_EVIDENCE_TYPES = EVIDENCE;

export const FIT_QUALIFICATION_EVIDENCE_STRENGTH = Object.freeze({
  EI_PUBLISHED_EXAMPLE: 'EI_PUBLISHED_EXAMPLE',
  INDEPENDENT_HAND_BENCHMARK: 'INDEPENDENT_HAND_BENCHMARK',
  RETAINED_PARITY_ONLY: 'RETAINED_PARITY_ONLY',
  NONE: 'NONE',
});

export const FIT_SCREENING_QUALIFICATION_BASIS = Object.freeze({
  schema: 'FitScreeningQualificationBasis.v1',
  scopeId: 'FIT-SCREENING-CANDIDATE-V1',
  policy: 'WORKED_EXAMPLE_BENCHMARK_SUFFICIENT',
  productPathBenchmarkId: 'EI-D4-FIT-PRODUCED-WATER-10IN',
  qualificationSource: Object.freeze({
    repository: 'reallaksh19/Common',
    commit: '7bfead910f6bca91b10748ead009e40f20c82219',
    path: 'Energy-Institute-AVIFF---Worked-Examples.doc.docx',
    gitBlob: 'ceee15ed5f7f320045d5f3979024e2e8664613f2',
  }),
  designAuthority: false,
});

const STANDARD_CORRELATION_EVIDENCE = Object.freeze({
  STIFF: Object.freeze({
    evidenceTypes: Object.freeze([EVIDENCE.EI_WORKED_EXAMPLE_POINT, EVIDENCE.RETAINED_WORKBOOK_PARITY]),
    evidenceIds: Object.freeze(['EI-D4-FIT-SEPARATOR-INLET-20IN', 'FIT-WORKBOOK-STANDARD-STIFF']),
  }),
  MEDIUM_STIFF: Object.freeze({
    evidenceTypes: Object.freeze([EVIDENCE.EI_WORKED_EXAMPLE_POINT, EVIDENCE.RETAINED_WORKBOOK_PARITY]),
    evidenceIds: Object.freeze([
      'EI-D2-FIT-RECYCLE-SUCTION-6IN',
      'EI-D2-FIT-RELIEF-UPSTREAM-4IN',
      'EI-D2-FIT-RELIEF-DOWNSTREAM-6IN',
      'FIT-WORKBOOK-STANDARD-MEDIUM-STIFF',
    ]),
  }),
  MEDIUM_SMALL: Object.freeze({
    evidenceTypes: Object.freeze([EVIDENCE.INDEPENDENT_HAND_BENCHMARK, EVIDENCE.RETAINED_WORKBOOK_PARITY]),
    evidenceIds: Object.freeze(['FIT-HAND-LIQ-MEDIUM-SMALL-008', 'FIT-WORKBOOK-STANDARD-MEDIUM-SMALL']),
  }),
  MEDIUM_LARGE: Object.freeze({
    evidenceTypes: Object.freeze([EVIDENCE.INDEPENDENT_HAND_BENCHMARK, EVIDENCE.RETAINED_WORKBOOK_PARITY]),
    evidenceIds: Object.freeze(['FIT-HAND-MULTIPHASE-MEDIUM-003', 'FIT-WORKBOOK-STANDARD-MEDIUM-LARGE']),
  }),
  FLEXIBLE_SMALL: Object.freeze({
    evidenceTypes: Object.freeze([EVIDENCE.INDEPENDENT_HAND_BENCHMARK, EVIDENCE.RETAINED_WORKBOOK_PARITY]),
    evidenceIds: Object.freeze(['FIT-HAND-FLEX-SMALL-LOF-105-FN2', 'FIT-WORKBOOK-STANDARD-FLEXIBLE-SMALL']),
  }),
  FLEXIBLE_LARGE: Object.freeze({
    evidenceTypes: Object.freeze([EVIDENCE.EI_WORKED_EXAMPLE_POINT, EVIDENCE.RETAINED_WORKBOOK_PARITY]),
    evidenceIds: Object.freeze(['EI-D4-FIT-PRODUCED-WATER-10IN', 'FIT-WORKBOOK-STANDARD-FLEXIBLE-LARGE']),
  }),
});

function evidenceStrength(evidenceTypes) {
  if (evidenceTypes.includes(EVIDENCE.EI_WORKED_EXAMPLE_POINT)) return FIT_QUALIFICATION_EVIDENCE_STRENGTH.EI_PUBLISHED_EXAMPLE;
  if (evidenceTypes.includes(EVIDENCE.INDEPENDENT_HAND_BENCHMARK)) return FIT_QUALIFICATION_EVIDENCE_STRENGTH.INDEPENDENT_HAND_BENCHMARK;
  if (evidenceTypes.includes(EVIDENCE.RETAINED_WORKBOOK_PARITY)) return FIT_QUALIFICATION_EVIDENCE_STRENGTH.RETAINED_PARITY_ONLY;
  return FIT_QUALIFICATION_EVIDENCE_STRENGTH.NONE;
}

function frozenEvidence({ evidenceTypes = [], evidenceIds = [], ...details }) {
  const types = Object.freeze([...evidenceTypes]);
  return Object.freeze({
    ...details,
    evidenceTypes: types,
    evidenceIds: Object.freeze([...evidenceIds]),
    evidenceStrength: evidenceStrength(types),
    eiPublishedExampleCoverage: types.includes(EVIDENCE.EI_WORKED_EXAMPLE_POINT),
    independentHandBenchmarkCoverage: types.includes(EVIDENCE.INDEPENDENT_HAND_BENCHMARK),
    retainedWorkbookParityCoverage: types.includes(EVIDENCE.RETAINED_WORKBOOK_PARITY),
    equivalenceCoverage: types.includes(EVIDENCE.EQUIVALENCE_TEST),
    noIndependentExample: types.includes(EVIDENCE.NO_INDEPENDENT_EXAMPLE),
  });
}

function phasePathEvidence(calculation) {
  const phase = calculation.input?.phase;
  if (phase === 'GAS') return frozenEvidence({
    phase, path: 'SINGLE_PHASE_GAS',
    evidenceTypes: [EVIDENCE.EI_WORKED_EXAMPLE_POINT, EVIDENCE.RETAINED_WORKBOOK_PARITY],
    evidenceIds: ['EI-D2-FIT-RECYCLE-SUCTION-6IN','EI-D2-FIT-RELIEF-UPSTREAM-4IN','EI-D2-FIT-RELIEF-DOWNSTREAM-6IN','WB-REF-001'],
  });
  if (phase === 'LIQUID') return frozenEvidence({
    phase, path: 'SINGLE_PHASE_LIQUID',
    evidenceTypes: [EVIDENCE.EI_WORKED_EXAMPLE_POINT, EVIDENCE.INDEPENDENT_HAND_BENCHMARK],
    evidenceIds: ['EI-D4-FIT-PRODUCED-WATER-10IN', 'FIT-HAND-LIQ-STIFF-001'],
  });
  if (phase === 'MULTIPHASE' && calculation.hydraulics?.resolutionMode === 'AGGREGATE_EFFECTIVE') return frozenEvidence({
    phase, path: 'MULTIPHASE_AGGREGATE_EFFECTIVE',
    evidenceTypes: [EVIDENCE.EI_WORKED_EXAMPLE_POINT, EVIDENCE.EQUIVALENCE_TEST],
    evidenceIds: ['EI-D4-FIT-SEPARATOR-INLET-20IN', 'FIT-D4-AGGREGATE-COMPONENT-EQUIVALENCE'],
  });
  if (phase === 'MULTIPHASE' && calculation.hydraulics?.resolutionMode === 'COMPONENT_DERIVED') return frozenEvidence({
    phase, path: 'MULTIPHASE_COMPONENT_DERIVED',
    evidenceTypes: [EVIDENCE.RETAINED_WORKBOOK_PARITY, EVIDENCE.INDEPENDENT_HAND_BENCHMARK, EVIDENCE.EQUIVALENCE_TEST],
    evidenceIds: ['WB-REF-003', 'FIT-HAND-MULTIPHASE-MEDIUM-003', 'FIT-D4-AGGREGATE-COMPONENT-EQUIVALENCE'],
  });
  return frozenEvidence({ phase: phase ?? null, path: 'UNCLASSIFIED', evidenceTypes: [EVIDENCE.NO_INDEPENDENT_EXAMPLE], evidenceIds: [] });
}

function standardCorrelationEvidence(calculation) {
  const supportCategory = calculation.standard?.correlation?.category ?? calculation.support?.category ?? null;
  const entry = STANDARD_CORRELATION_EVIDENCE[supportCategory];
  if (!entry) return frozenEvidence({ supportCategory, evidenceTypes: [EVIDENCE.NO_INDEPENDENT_EXAMPLE], evidenceIds: [] });
  return frozenEvidence({ supportCategory, ...entry });
}

function advancedCorrelationEvidence(calculation) {
  const supportCategory = calculation.advanced?.correlation?.category ?? calculation.support?.category ?? null;
  if (!calculation.advanced) return frozenEvidence({ used: false, supportCategory, evidenceTypes: [], evidenceIds: [] });
  if (supportCategory === 'FLEXIBLE_SMALL') return frozenEvidence({
    used: true, supportCategory,
    evidenceTypes: [EVIDENCE.INDEPENDENT_HAND_BENCHMARK, EVIDENCE.RETAINED_WORKBOOK_PARITY],
    evidenceIds: ['FIT-HAND-FLEX-SMALL-LOF-105-FN2','FIT-HAND-FLEX-SMALL-LOF-105-FN3','FIT-WORKBOOK-ADVANCED-FLEXIBLE-SMALL'],
  });
  if (supportCategory === 'FLEXIBLE_LARGE') return frozenEvidence({
    used: true, supportCategory,
    evidenceTypes: [EVIDENCE.INDEPENDENT_HAND_BENCHMARK, EVIDENCE.RETAINED_WORKBOOK_PARITY],
    evidenceIds: ['FIT-HAND-FLEX-LARGE-LOF-120-FN2-009','FIT-WORKBOOK-ADVANCED-FLEXIBLE-LARGE'],
  });
  return frozenEvidence({ used: true, supportCategory, evidenceTypes: [EVIDENCE.NO_INDEPENDENT_EXAMPLE], evidenceIds: [] });
}

function advancedReferenceBandEvidence(calculation) {
  const supportCategory = calculation.advanced?.correlation?.category ?? calculation.support?.category ?? null;
  if (supportCategory === 'FLEXIBLE_LARGE') return frozenEvidence({
    evaluatedPath: 'ADVANCED_REFINED_LOF', supportCategory,
    evidenceTypes: [EVIDENCE.INDEPENDENT_HAND_BENCHMARK], evidenceIds: ['FIT-HAND-FLEX-LARGE-LOF-120-FN2-009'],
  });
  return frozenEvidence({
    evaluatedPath: 'ADVANCED_REFINED_LOF', supportCategory,
    evidenceTypes: [EVIDENCE.INDEPENDENT_HAND_BENCHMARK], evidenceIds: ['FIT-HAND-FLEX-SMALL-LOF-105-FN2', 'FIT-HAND-FLEX-SMALL-LOF-105-FN3'],
  });
}

function referenceBandEvidence(calculation) {
  if (calculation.advanced) return advancedReferenceBandEvidence(calculation);
  return frozenEvidence({
    evaluatedPath: 'STANDARD_LOF',
    evidenceTypes: [EVIDENCE.EI_WORKED_EXAMPLE_POINT, EVIDENCE.INDEPENDENT_HAND_BENCHMARK],
    evidenceIds: ['EI-D2-FIT-RECYCLE-SUCTION-6IN','EI-D2-FIT-RELIEF-UPSTREAM-4IN','EI-D2-FIT-RELIEF-DOWNSTREAM-6IN','EI-D4-FIT-SEPARATOR-INLET-20IN','EI-D4-FIT-PRODUCED-WATER-10IN','FIT-HAND-FLEX-SMALL-LOF-095','FIT-HAND-FLEX-SMALL-LOF-100-FN1'],
  });
}

export function evaluateFitQualificationCoverage(calculation = {}) {
  return Object.freeze({
    coverageId: 'FIT-REFERENCE-COVERAGE-V1',
    screeningQualified: true,
    engineeringAuthority: 'SCREENING',
    qualificationBasis: FIT_SCREENING_QUALIFICATION_BASIS,
    phasePath: phasePathEvidence(calculation),
    standardCorrelation: standardCorrelationEvidence(calculation),
    advancedCorrelation: advancedCorrelationEvidence(calculation),
    referenceBand: referenceBandEvidence(calculation),
    limitations: Object.freeze([
      'SCREENING_AUTHORITY_ONLY_DESIGN_AUTHORITY_FALSE',
      'MANUAL_DIAMETER_GAP_219_1_TO_273_MM_REMAINS_FAIL_CLOSED',
      'ADVANCED_CORRELATIONS_QUALIFIED_BY_INDEPENDENT_HAND_BENCHMARKS_NOT_EI_APPENDIX_D_POINTS',
      'PROJECT_APPLICATION_OUTSIDE_THE_DECLARED_BOUNDED_SCOPE_REMAINS_USER_REVIEW_RESPONSIBILITY',
    ]),
  });
}
