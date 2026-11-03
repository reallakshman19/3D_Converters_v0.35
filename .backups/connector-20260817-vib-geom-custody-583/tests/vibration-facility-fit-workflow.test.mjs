import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIT_FACILITY_ENRICHMENT_PROPERTIES,
  VIBRATION_FACILITY_FIT_WORKFLOW_SCHEMA,
  buildVibrationFacilityFitPlan,
  buildVibrationFacilityFitRegister,
  executeVibrationFacilityFitPlan,
  runVibrationFacilityFitBenchmark,
} from '../converters/vibration/facility/index.js';
import { assembleVibrationIntegrityDataset } from '../converters/vibration/dataset/index.js';
import {
  VIBRATION_TABLE_EXCHANGE_INTEGRITY,
  VIBRATION_TABLE_EXCHANGE_SCHEMA,
} from '../converters/vibration/exchange/schema.js';

const P = FIT_FACILITY_ENRICHMENT_PROPERTIES;

function exchange({ completeExchange = true } = {}) {
  return Object.freeze({
    schema: VIBRATION_TABLE_EXCHANGE_SCHEMA,
    completeExchange,
    integrityStatus: completeExchange
      ? VIBRATION_TABLE_EXCHANGE_INTEGRITY.DECLARED_NOT_REVERIFIED
      : VIBRATION_TABLE_EXCHANGE_INTEGRITY.LIMITED_ELEMENTS_ONLY,
    authority: Object.freeze(completeExchange ? {
      canonicalHash: 'sha256:canonical',
      projectionHash: 'sha256:projection',
      datasetId: 'plant-a',
    } : {}),
    sourceFileName: completeExchange ? 'plant-a-3d-edit.xlsx' : 'plant-a-3d-edit.csv',
    elements: Object.freeze([
      Object.freeze({ canonicalId: 'CANON-001', line: 'L-100', tag: 'P-100', type: 'PIPE' }),
    ]),
  });
}

function operatingCases() {
  return [{
    line: 'L-100',
    caseId: 'NORMAL',
    phase: 'GAS',
    source: 'HMB-100',
    sourceRevision: 'C',
    massFlow: { value: 14.856111111111112, unit: 'kg/s' },
    density: { value: 18, unit: 'kg/m3' },
    dynamicViscosity: { value: 0.00002, unit: 'Pa*s' },
  }];
}

function basisRows() {
  return [
    { canonicalId: 'CANON-001', property: P.WALL_BASIS, value: 'NOMINAL', source: 'M5' },
    { canonicalId: 'CANON-001', property: P.SPAN_DETERMINATION_METHOD, value: 'LINE_WALK_EFFECTIVE_SUPPORTS', source: 'M5' },
    { canonicalId: 'CANON-001', property: P.SUPPORT_EVIDENCE_STATUS, value: 'EFFECTIVE_SUPPORTS_CONFIRMED', source: 'M5' },
    { canonicalId: 'CANON-001', caseId: 'NORMAL', property: P.DENSITY_BASIS, value: 'ACTUAL', source: 'M5' },
    { canonicalId: 'CANON-001', caseId: 'NORMAL', property: P.OPERATING_SCENARIO_COHERENT, value: true, source: 'M5' },
  ];
}

function enrichment({ includeSpan = true, includeAssessmentPoint = true } = {}) {
  return [
    ...(includeAssessmentPoint ? [{
      canonicalId: 'CANON-001', property: P.ASSESSMENT_POINT,
      value: true, source: 'VIB-REVIEW', status: 'VERIFIED',
    }] : []),
    { canonicalId: 'CANON-001', property: P.OUTSIDE_DIAMETER, value: 168.3, unit: 'mm', source: 'PIPE-DATA' },
    { canonicalId: 'CANON-001', property: P.WALL_THICKNESS, value: 7.11, unit: 'mm', source: 'PIPE-DATA' },
    { canonicalId: 'CANON-001', property: P.INSIDE_DIAMETER, value: 154.1, unit: 'mm', source: 'PIPE-DATA' },
    { canonicalId: 'CANON-001', property: P.MAX_UNSUPPORTED_SPAN, value: 6.4, unit: 'm', source: 'LEGACY-SPAN' },
    ...(includeSpan ? [{
      canonicalId: 'CANON-001', property: P.MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS,
      value: 6.4, unit: 'm', source: 'FIELD-VERIFY', status: 'VERIFIED',
    }] : []),
    ...basisRows(),
  ];
}

function input(options = {}) {
  return {
    exchange: exchange(options),
    operatingCases: operatingCases(),
    enrichment: enrichment(options),
  };
}

test('one-call workflow equals the direct lower-level composition', () => {
  const source = input();
  const dataset = assembleVibrationIntegrityDataset(source);
  const plan = buildVibrationFacilityFitPlan(dataset);
  const result = executeVibrationFacilityFitPlan(plan);
  const register = buildVibrationFacilityFitRegister(result);

  const workflow = runVibrationFacilityFitBenchmark(source);
  assert.equal(workflow.schema, VIBRATION_FACILITY_FIT_WORKFLOW_SCHEMA);
  assert.equal(workflow.authority, 'WORKFLOW_ORCHESTRATION_ONLY');
  assert.equal(workflow.engineeringAuthority, 'NONE');
  assert.equal(workflow.screeningAuthorized, false);
  assert.equal(workflow.qualificationMode, 'benchmark');
  assert.deepEqual(workflow.dataset, dataset);
  assert.deepEqual(workflow.plan, plan);
  assert.deepEqual(workflow.result, result);
  assert.deepEqual(workflow.register, register);
  assert.deepEqual(workflow.summary, register.summary);
  assert.equal(workflow.register.rows[0].status, 'CALCULATED_BENCHMARK');
  assert.equal(workflow.register.rows[0].qualificationState, 'BENCHMARK_ONLY');
  assert.equal(workflow.register.rows[0].screeningAuthorized, false);
  assert(Object.isFrozen(workflow));
});

test('missing effective-support span remains NOT_ASSESSED with no numerical substitution', () => {
  const workflow = runVibrationFacilityFitBenchmark(input({ includeSpan: false }));
  assert.equal(workflow.plan.items[0].status, 'NOT_READY');
  assert.equal(workflow.plan.items[0].request, null);
  assert(workflow.plan.items[0].missing.includes('maximumSpanBetweenEffectiveSupports'));
  assert.equal(workflow.result.rows[0].status, 'NOT_ASSESSED_DATA_INCOMPLETE');
  assert.equal(workflow.result.rows[0].centralResult, null);
  assert.equal(workflow.result.centralBatchSummary.total, 0);
  assert.equal(workflow.register.rows[0].standardLof, null);
  assert.equal(workflow.register.rows[0].completenessStatus, 'DATA_INCOMPLETE');
  assert.equal(Object.hasOwn(workflow.result.rows[0], 'standardLof'), false);
});

test('limited Elements-only exchange is rejected by default and accepted only explicitly', () => {
  const source = input({ completeExchange: false });
  assert.throws(
    () => runVibrationFacilityFitBenchmark(source),
    (error) => error.code === 'VIBRATION_TABLE_EXCHANGE_INCOMPLETE',
  );
  const workflow = runVibrationFacilityFitBenchmark(source, { allowLimitedExchange: true });
  assert.equal(workflow.dataset.exchangeIntegrityStatus, VIBRATION_TABLE_EXCHANGE_INTEGRITY.LIMITED_ELEMENTS_ONLY);
  assert(workflow.warnings.dataset.some((warning) => warning.code === 'LIMITED_EXCHANGE_ACCEPTED'));
  assert(workflow.warnings.plan.some((warning) => warning.code === 'LIMITED_EXCHANGE_INPUT'));
  assert.equal(workflow.screeningAuthorized, false);
});

test('workflow rejects qualificationMode or other authority-related option injection', () => {
  assert.throws(
    () => runVibrationFacilityFitBenchmark(input(), { qualificationMode: 'screening' }),
    (error) => error.code === 'FIT_FACILITY_WORKFLOW_OPTION_UNSUPPORTED',
  );
  assert.throws(
    () => runVibrationFacilityFitBenchmark(input(), { designAuthority: true }),
    (error) => error.code === 'FIT_FACILITY_WORKFLOW_OPTION_UNSUPPORTED',
  );
});

test('no explicit assessment points produces a valid zero-row workflow with stage warning', () => {
  const workflow = runVibrationFacilityFitBenchmark(input({ includeAssessmentPoint: false }));
  assert.equal(workflow.plan.counts.assessmentPoints, 0);
  assert.equal(workflow.result.rows.length, 0);
  assert.equal(workflow.register.rows.length, 0);
  assert.equal(workflow.summary.totalRows, 0);
  assert(workflow.warnings.plan.some((warning) => warning.code === 'NO_FIT_ASSESSMENT_POINTS'));
});

test('workflow warning groups retain stage boundaries instead of flattening semantics', () => {
  const workflow = runVibrationFacilityFitBenchmark(input({ includeSpan: false }));
  assert.deepEqual(Object.keys(workflow.warnings), ['dataset', 'plan', 'result', 'register']);
  assert(workflow.warnings.result.some((warning) => warning.code === 'FACILITY_ROWS_NOT_ASSESSED'));
  assert(workflow.warnings.register.some((warning) => warning.code === 'REGISTER_HAS_INCOMPLETE_DATA_ROWS'));
});
