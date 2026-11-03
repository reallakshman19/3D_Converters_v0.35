import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VIBRATION_FACILITY_FIT_CALCULATION_ID,
  VIBRATION_FACILITY_FIT_PLAN_SCHEMA,
  VIBRATION_FACILITY_FIT_RESULT_SCHEMA,
  executeVibrationFacilityFitPlan,
} from '../converters/vibration/facility/index.js';

function readyItem(overrides = {}) {
  return {
    status: 'READY',
    calculationId: VIBRATION_FACILITY_FIT_CALCULATION_ID,
    canonicalId: overrides.canonicalId ?? 'CANON-001',
    line: overrides.line ?? 'L-100',
    caseId: overrides.caseId ?? 'NORMAL',
    missing: [],
    invalid: [],
    reasons: ['EXPLICIT_FIT_ASSESSMENT_POINT', 'REQUIRED_INPUT_EVIDENCE_AVAILABLE'],
    request: overrides.request ?? {
      calculationId: VIBRATION_FACILITY_FIT_CALCULATION_ID,
      inputs: {
        phase: 'GAS',
        outsideDiameter: 168.3,
        wallThickness: 7.11,
        insideDiameter: 154.1,
        maximumUnsupportedSpan: 6.4,
        massFlow: 14.856111111111112,
        density: 18,
        gasDynamicViscosity: 0.00002,
      },
      inputUnits: {
        outsideDiameter: 'mm',
        wallThickness: 'mm',
        insideDiameter: 'mm',
        maximumUnsupportedSpan: 'm',
        massFlow: 'kg/s',
        density: 'kg/m3',
        gasDynamicViscosity: 'Pa*s',
      },
      options: { qualificationMode: 'benchmark', includeEvidence: true },
    },
    sourceTrace: {
      assessmentPoint: { source: 'VIB-REVIEW' },
      operatingCase: { source: 'HMB-100' },
    },
  };
}

function notReadyItem() {
  return {
    status: 'NOT_READY',
    calculationId: VIBRATION_FACILITY_FIT_CALCULATION_ID,
    canonicalId: 'CANON-002',
    line: 'L-100',
    caseId: 'NORMAL',
    missing: ['maximumUnsupportedSpan'],
    invalid: [],
    reasons: ['FIT_REQUEST_INPUT_INCOMPLETE'],
    request: null,
    sourceTrace: { assessmentPoint: { source: 'VIB-REVIEW' } },
  };
}

function plan(items) {
  return {
    schema: VIBRATION_FACILITY_FIT_PLAN_SCHEMA,
    authority: 'REQUEST_PLANNING_ONLY',
    engineeringAuthority: 'NONE',
    screeningAuthorized: false,
    calculationId: VIBRATION_FACILITY_FIT_CALCULATION_ID,
    qualificationMode: 'benchmark',
    datasetSchema: 'VibrationIntegrityDataset.v1',
    datasetExchangeIntegrityStatus: 'DECLARED_NOT_REVERIFIED',
    items,
  };
}

test('READY rows execute through central batch while NOT_READY remains non-numerical', () => {
  const result = executeVibrationFacilityFitPlan(plan([readyItem(), notReadyItem()]));
  assert.equal(result.schema, VIBRATION_FACILITY_FIT_RESULT_SCHEMA);
  assert.equal(result.authority, 'ORCHESTRATION_ONLY');
  assert.equal(result.engineeringAuthority, 'NONE');
  assert.equal(result.screeningAuthorized, false);
  assert.equal(result.qualificationMode, 'benchmark');
  assert.deepEqual(result.counts, {
    total: 2,
    plannedReady: 1,
    calculated: 1,
    calculationFailed: 0,
    notAssessed: 1,
  });
  assert.equal(result.complete, false);
  assert.deepEqual(result.centralBatchSummary, { ok: true, total: 1, succeeded: 1, failed: 0 });

  const calculated = result.rows[0];
  assert.equal(calculated.status, 'CALCULATED_BENCHMARK');
  assert.equal(calculated.canonicalId, 'CANON-001');
  assert.equal(calculated.centralResult.ok, true, JSON.stringify(calculated.centralResult));
  assert.equal(calculated.centralResult.qualification.effective, 'BENCHMARK_ONLY');
  assert.equal(calculated.centralResult.qualification.designAuthority, false);
  assert.equal(calculated.qualificationCoverage.screeningQualified, false);
  assert.equal(calculated.screeningCandidate.screeningAuthorized, false);
  assert.equal(typeof calculated.standardLof, 'number');
  assert.equal(calculated.sourceTrace.operatingCase.source, 'HMB-100');

  const incomplete = result.rows[1];
  assert.equal(incomplete.status, 'NOT_ASSESSED_DATA_INCOMPLETE');
  assert.equal(incomplete.centralResult, null);
  assert.deepEqual(incomplete.missing, ['maximumUnsupportedSpan']);
  assert.equal(Object.hasOwn(incomplete, 'standardLof'), false);
  assert.equal(Object.hasOwn(incomplete, 'governingReferenceLof'), false);
  assert(result.warnings.some((warning) => warning.code === 'FACILITY_ROWS_NOT_ASSESSED'));
  assert(Object.isFrozen(result));
});

test('READY request that fails central applicability remains CALCULATION_FAILED without synthetic LOF', () => {
  const invalidRequest = readyItem({
    request: {
      calculationId: VIBRATION_FACILITY_FIT_CALCULATION_ID,
      inputs: {
        phase: 'LIQUID',
        outsideDiameter: 250,
        wallThickness: 10,
        maximumUnsupportedSpan: 20,
        density: 900,
        massFlow: 10,
      },
      inputUnits: {
        outsideDiameter: 'mm',
        wallThickness: 'mm',
        maximumUnsupportedSpan: 'm',
        density: 'kg/m3',
        massFlow: 'kg/s',
      },
      options: { qualificationMode: 'benchmark', includeEvidence: true },
    },
  });
  const result = executeVibrationFacilityFitPlan(plan([invalidRequest]));
  assert.equal(result.counts.calculated, 0);
  assert.equal(result.counts.calculationFailed, 1);
  assert.equal(result.complete, false);
  const row = result.rows[0];
  assert.equal(row.status, 'CALCULATION_FAILED');
  assert.equal(row.centralResult.ok, false);
  assert(row.errors.length > 0);
  assert.equal(Object.hasOwn(row, 'standardLof'), false);
  assert(result.warnings.some((warning) => warning.code === 'FACILITY_CALCULATION_FAILURES'));
});

test('multiple READY rows preserve plan order while central batch uses the same kernel', () => {
  const second = readyItem({
    canonicalId: 'CANON-003',
    line: 'L-200',
    caseId: 'NORMAL',
    request: {
      calculationId: VIBRATION_FACILITY_FIT_CALCULATION_ID,
      inputs: {
        phase: 'LIQUID',
        outsideDiameter: 273,
        wallThickness: 9.271,
        maximumUnsupportedSpan: 18,
        density: 988,
        fluidVelocity: 2.9,
      },
      inputUnits: {
        outsideDiameter: 'mm',
        wallThickness: 'mm',
        maximumUnsupportedSpan: 'm',
        density: 'kg/m3',
        fluidVelocity: 'm/s',
      },
      options: { qualificationMode: 'benchmark', includeEvidence: true },
    },
  });
  const result = executeVibrationFacilityFitPlan(plan([readyItem(), second]));
  assert.deepEqual(result.rows.map((row) => row.canonicalId), ['CANON-001', 'CANON-003']);
  assert.equal(result.centralBatchSummary.total, 2);
  assert.equal(result.counts.calculated, 2);
  assert.equal(result.rows[1].referenceBand, 'LOF_GE_1');
  assert.equal(result.rows[1].screeningCandidate.candidateForEngineeringReview, true);
  assert.equal(result.rows[1].screeningCandidate.screeningAuthorized, false);
});

test('empty READY set returns zero central-batch summary and preserves NOT_READY rows', () => {
  const result = executeVibrationFacilityFitPlan(plan([notReadyItem()]));
  assert.deepEqual(result.centralBatchSummary, { ok: true, total: 0, succeeded: 0, failed: 0 });
  assert.equal(result.counts.plannedReady, 0);
  assert.equal(result.counts.notAssessed, 1);
  assert.equal(result.rows[0].status, 'NOT_ASSESSED_DATA_INCOMPLETE');
});

test('executor rejects plan-level or request-level screening mode mutation', () => {
  assert.throws(
    () => executeVibrationFacilityFitPlan({ ...plan([readyItem()]), qualificationMode: 'screening' }),
    (error) => error.code === 'FIT_FACILITY_PLAN_AUTHORITY_VIOLATION',
  );

  const mutated = readyItem();
  mutated.request = {
    ...mutated.request,
    options: { ...mutated.request.options, qualificationMode: 'screening' },
  };
  assert.throws(
    () => executeVibrationFacilityFitPlan(plan([mutated])),
    (error) => error.code === 'FIT_FACILITY_PLAN_AUTHORITY_VIOLATION',
  );
});

test('non-READY item carrying an executable request is rejected', () => {
  assert.throws(
    () => executeVibrationFacilityFitPlan(plan([{ ...notReadyItem(), request: readyItem().request }])),
    (error) => error.code === 'FIT_FACILITY_PLAN_INVALID',
  );
});
