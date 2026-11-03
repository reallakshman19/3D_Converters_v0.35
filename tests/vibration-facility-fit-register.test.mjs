import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VIBRATION_FACILITY_FIT_REGISTER_SCHEMA,
  VIBRATION_FACILITY_FIT_RESULT_SCHEMA,
  buildVibrationFacilityFitRegister,
} from '../converters/vibration/facility/index.js';

function calculatedRow(overrides = {}) {
  return {
    status: 'CALCULATED_BENCHMARK',
    calculationId: 'VIB.FIV.FLOW_TURBULENCE',
    canonicalId: overrides.canonicalId ?? 'CANON-001',
    line: overrides.line ?? 'L-100',
    caseId: overrides.caseId ?? 'NORMAL',
    standardLof: overrides.standardLof ?? 0.276,
    refinedLof: overrides.refinedLof ?? null,
    governingReferenceLof: overrides.governingReferenceLof ?? 0.276,
    referenceBand: overrides.referenceBand ?? 'LOF_LT_0_3',
    assessmentStatus: overrides.assessmentStatus ?? 'REFERENCE_BELOW_THRESHOLD',
    qualification: { effective: 'BENCHMARK_ONLY', designAuthority: false },
    qualificationCoverage: {
      phasePath: { evidenceStrength: 'EI_PUBLISHED_EXAMPLE' },
      standardCorrelation: { evidenceStrength: overrides.correlationEvidenceStrength ?? 'EI_PUBLISHED_EXAMPLE' },
      advancedCorrelation: { used: false, evidenceStrength: 'NONE' },
    },
    screeningCandidate: {
      candidateForEngineeringReview: overrides.candidateForEngineeringReview ?? true,
      status: overrides.screeningCandidateStatus ?? 'CANDIDATE_STANDARD_SLICE',
      continuationRequired: overrides.continuationRequired ?? false,
      screeningAuthorized: false,
    },
    sourceTrace: {
      assessmentPoint: { source: 'VIB-REVIEW' },
      operatingCase: { source: 'HMB-100' },
    },
    centralResult: {
      ok: true,
      provenance: { engineeringAuthority: 'WORKBOOK_REFERENCE_ONLY' },
    },
  };
}

function notAssessedRow() {
  return {
    status: 'NOT_ASSESSED_DATA_INCOMPLETE',
    calculationId: 'VIB.FIV.FLOW_TURBULENCE',
    canonicalId: 'CANON-002',
    line: 'L-100',
    caseId: 'DESIGN',
    missing: ['maximumUnsupportedSpan'],
    invalid: [],
    reasons: ['FIT_REQUEST_INPUT_INCOMPLETE'],
    sourceTrace: {
      assessmentPoint: { source: 'VIB-REVIEW' },
      operatingCase: { source: 'HMB-100' },
    },
    centralResult: null,
  };
}

function failedRow() {
  return {
    status: 'CALCULATION_FAILED',
    calculationId: 'VIB.FIV.FLOW_TURBULENCE',
    canonicalId: 'CANON-003',
    line: 'L-200',
    caseId: 'NORMAL',
    errors: [{ code: 'INPUT_OUTSIDE_APPLICABILITY', message: 'Outside method domain.' }],
    sourceTrace: {
      assessmentPoint: { source: 'VIB-REVIEW-2' },
      operatingCase: { source: 'HMB-200' },
    },
    centralResult: { ok: false, errors: [{ code: 'INPUT_OUTSIDE_APPLICABILITY' }] },
  };
}

function result(rows) {
  return {
    schema: VIBRATION_FACILITY_FIT_RESULT_SCHEMA,
    authority: 'ORCHESTRATION_ONLY',
    engineeringAuthority: 'NONE',
    screeningAuthorized: false,
    calculationId: 'VIB.FIV.FLOW_TURBULENCE',
    qualificationMode: 'benchmark',
    rows,
  };
}

test('register projects calculated benchmark evidence without upgrading authority', () => {
  const register = buildVibrationFacilityFitRegister(result([calculatedRow()]));
  assert.equal(register.schema, VIBRATION_FACILITY_FIT_REGISTER_SCHEMA);
  assert.equal(register.authority, 'READ_PROJECTION_ONLY');
  assert.equal(register.engineeringAuthority, 'NONE');
  assert.equal(register.screeningAuthorized, false);
  const row = register.rows[0];
  assert.equal(row.status, 'CALCULATED_BENCHMARK');
  assert.equal(row.completenessStatus, 'CALCULATED');
  assert.equal(row.standardLof, 0.276);
  assert.equal(row.referenceBand, 'LOF_LT_0_3');
  assert.equal(row.qualificationState, 'BENCHMARK_ONLY');
  assert.equal(row.benchmarkAuthority, 'WORKBOOK_REFERENCE_ONLY');
  assert.equal(row.phaseEvidenceStrength, 'EI_PUBLISHED_EXAMPLE');
  assert.equal(row.correlationEvidenceStrength, 'EI_PUBLISHED_EXAMPLE');
  assert.equal(row.candidateForEngineeringReview, true);
  assert.equal(row.screeningAuthorized, false);
  assert.equal(row.assessmentPointSource, 'VIB-REVIEW');
  assert.equal(row.operatingCaseSource, 'HMB-100');
  assert(Object.isFrozen(register));
});

test('NOT_ASSESSED and CALCULATION_FAILED project null numerical fields with explicit completeness', () => {
  const register = buildVibrationFacilityFitRegister(result([
    notAssessedRow(),
    failedRow(),
  ]));
  const incomplete = register.rows[0];
  assert.equal(incomplete.completenessStatus, 'DATA_INCOMPLETE');
  assert.equal(incomplete.standardLof, null);
  assert.equal(incomplete.governingReferenceLof, null);
  assert.deepEqual(incomplete.missing, ['maximumUnsupportedSpan']);
  assert.equal(incomplete.qualificationState, null);

  const failed = register.rows[1];
  assert.equal(failed.completenessStatus, 'CALCULATION_FAILED');
  assert.equal(failed.standardLof, null);
  assert.deepEqual(failed.errorCodes, ['INPUT_OUTSIDE_APPLICABILITY']);
  assert.equal(failed.candidateForEngineeringReview, false);
});

test('facility summary counts bands, candidates and benchmark rows without safety score', () => {
  const register = buildVibrationFacilityFitRegister(result([
    calculatedRow(),
    calculatedRow({
      canonicalId: 'CANON-004',
      line: 'L-300',
      caseId: 'NORMAL',
      standardLof: 0.62,
      governingReferenceLof: 0.62,
      referenceBand: 'LOF_GE_0_5_LT_1',
      candidateForEngineeringReview: false,
      screeningCandidateStatus: 'STANDARD_CORRELATION_NOT_EI_EXAMPLE_COVERED',
      correlationEvidenceStrength: 'INDEPENDENT_HAND_BENCHMARK',
    }),
    notAssessedRow(),
    failedRow(),
  ]));
  assert.deepEqual(register.summary, {
    totalRows: 4,
    calculatedRows: 2,
    notAssessedRows: 1,
    failedRows: 1,
    referenceBandCounts: {
      LOF_LT_0_3: 1,
      LOF_GE_0_5_LT_1: 1,
    },
    candidateForEngineeringReviewCount: 1,
    benchmarkOnlyCount: 2,
  });
  assert.equal(Object.hasOwn(register.summary, 'safeCount'), false);
  assert.equal(Object.hasOwn(register.summary, 'passCount'), false);
  assert.equal(Object.hasOwn(register.summary, 'riskScore'), false);
});

test('register preserves facility result row ordering rather than re-ranking by LOF', () => {
  const register = buildVibrationFacilityFitRegister(result([
    failedRow(),
    calculatedRow({ canonicalId: 'CANON-010', standardLof: 0.02, governingReferenceLof: 0.02 }),
    notAssessedRow(),
  ]));
  assert.deepEqual(register.rows.map((row) => row.canonicalId), ['CANON-003', 'CANON-010', 'CANON-002']);
  assert.deepEqual(register.rows.map((row) => row.sourceRowIndex), [0, 1, 2]);
});

test('register warnings keep incomplete, failed and benchmark-only state visible', () => {
  const register = buildVibrationFacilityFitRegister(result([
    calculatedRow(), notAssessedRow(), failedRow(),
  ]));
  const codes = register.warnings.map((warning) => warning.code);
  assert(codes.includes('REGISTER_HAS_INCOMPLETE_DATA_ROWS'));
  assert(codes.includes('REGISTER_HAS_CALCULATION_FAILURES'));
  assert(codes.includes('REGISTER_VALUES_ARE_BENCHMARK_REFERENCE_ONLY'));
});

test('register has no pass/fail or universal score field on rows', () => {
  const row = buildVibrationFacilityFitRegister(result([calculatedRow()])).rows[0];
  for (const forbidden of ['pass', 'safe', 'riskScore', 'vibrationScore', 'facilityScore']) {
    assert.equal(Object.hasOwn(row, forbidden), false, forbidden);
  }
});

test('wrong source result schema fails closed', () => {
  assert.throws(
    () => buildVibrationFacilityFitRegister({ schema: 'Other.v1', rows: [] }),
    (error) => error.code === 'FIT_FACILITY_RESULT_SCHEMA_MISMATCH',
  );
});
