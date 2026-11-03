import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VIBRATION_WORKSPACE_MODEL_SCHEMA,
  buildVibrationWorkspaceModel,
  vibrationWorkspaceRowKey,
} from '../converters/vibration/workspace/index.js';

function registerRows() {
  return [
    {
      canonicalId: 'CAN-2', line: 'L-200', caseId: 'CASE-2',
      status: 'NOT_ASSESSED_DATA_INCOMPLETE', completenessStatus: 'DATA_INCOMPLETE',
      standardLof: null, refinedLof: null, governingReferenceLof: null,
      referenceBand: null, qualificationState: null,
      phaseEvidenceStrength: null, correlationEvidenceStrength: null,
      candidateForEngineeringReview: false,
      missing: ['density'], invalid: [], errorCodes: [],
    },
    {
      canonicalId: 'CAN-1', line: 'L-100', caseId: 'NORMAL',
      status: 'CALCULATED_BENCHMARK', completenessStatus: 'CALCULATED',
      standardLof: 0.276, refinedLof: null, governingReferenceLof: 0.276,
      referenceBand: 'LOF_LT_0_3', assessmentStatus: 'REFERENCE_BELOW_THRESHOLD',
      qualificationState: 'BENCHMARK_ONLY', benchmarkAuthority: 'WORKBOOK_REFERENCE_ONLY',
      phaseEvidenceStrength: 'EI_PUBLISHED_EXAMPLE',
      correlationEvidenceStrength: 'EI_PUBLISHED_EXAMPLE',
      candidateForEngineeringReview: true,
      screeningCandidateStatus: 'CANDIDATE_STANDARD_SLICE',
      missing: [], invalid: [], errorCodes: [],
    },
    {
      canonicalId: 'CAN-3', line: 'L-100', caseId: 'DESIGN',
      status: 'CALCULATION_FAILED', completenessStatus: 'CALCULATION_FAILED',
      standardLof: null, refinedLof: null, governingReferenceLof: null,
      referenceBand: null, qualificationState: null,
      phaseEvidenceStrength: null, correlationEvidenceStrength: null,
      candidateForEngineeringReview: false,
      missing: [], invalid: [], errorCodes: ['INPUT_OUTSIDE_APPLICABILITY'],
    },
  ];
}

function workflow() {
  const rows = registerRows();
  return {
    schema: 'VibrationFacilityFitWorkflow.v1',
    authority: 'WORKFLOW_ORCHESTRATION_ONLY',
    engineeringAuthority: 'NONE',
    screeningAuthorized: false,
    qualificationMode: 'benchmark',
    dataset: {
      operatingCases: [
        { line: 'L-100', caseId: 'NORMAL', phase: 'GAS', source: 'HMB-1', density: { value: 18, unit: 'kg/m3' } },
        { line: 'L-100', caseId: 'DESIGN', phase: 'LIQUID', source: 'HMB-1' },
        { line: 'L-200', caseId: 'CASE-2', phase: 'GAS', source: 'HMB-2' },
      ],
      enrichment: [
        { canonicalId: 'CAN-1', property: 'FIT_ASSESSMENT_POINT', value: true, source: 'VIB-REVIEW' },
        { canonicalId: 'CAN-1', property: 'OUTSIDE_DIAMETER', value: 168.3, unit: 'mm', source: 'LINE-LIST' },
        { canonicalId: 'CAN-1', caseId: 'NORMAL', property: 'NATURAL_FREQUENCY', value: 2.2, unit: 'Hz', source: 'FIELD-MEAS' },
      ],
    },
    plan: {
      items: [
        {
          canonicalId: 'CAN-1', line: 'L-100', caseId: 'NORMAL', status: 'READY',
          request: {
            calculationId: 'VIB.FIV.FLOW_TURBULENCE',
            inputs: { phase: 'GAS', outsideDiameter: 168.3, density: 18 },
            inputUnits: { outsideDiameter: 'mm', density: 'kg/m3' },
            options: { qualificationMode: 'benchmark' },
          },
          sourceTrace: { operatingCase: { source: 'HMB-1' } },
        },
        { canonicalId: 'CAN-2', line: 'L-200', caseId: 'CASE-2', status: 'NOT_READY', request: null },
        { canonicalId: 'CAN-3', line: 'L-100', caseId: 'DESIGN', status: 'READY', request: {} },
      ],
    },
    result: {
      rows: [
        {
          canonicalId: 'CAN-1', line: 'L-100', caseId: 'NORMAL', status: 'CALCULATED_BENCHMARK',
          qualificationCoverage: { phasePath: { evidenceStrength: 'EI_PUBLISHED_EXAMPLE' } },
          screeningCandidate: { candidateForEngineeringReview: true, screeningAuthorized: false },
          sourceTrace: { operatingCase: { source: 'HMB-1' }, assessmentPoint: { source: 'VIB-REVIEW' } },
          centralResult: {
            qualification: { effective: 'BENCHMARK_ONLY', designAuthority: false },
            evidence: { equationIds: ['FIT-EQ-001'] },
          },
        },
        { canonicalId: 'CAN-2', line: 'L-200', caseId: 'CASE-2', status: 'NOT_ASSESSED_DATA_INCOMPLETE' },
        {
          canonicalId: 'CAN-3', line: 'L-100', caseId: 'DESIGN', status: 'CALCULATION_FAILED',
          errors: [{ code: 'INPUT_OUTSIDE_APPLICABILITY' }], centralResult: { ok: false },
        },
      ],
    },
    register: {
      schema: 'VibrationFacilityFitRegister.v1',
      rows,
      warnings: [{ code: 'REGISTER_VALUES_ARE_BENCHMARK_REFERENCE_ONLY', message: 'Benchmark only.' }],
    },
  };
}

test('workspace model is table-only, deterministic and preserves explicit completeness state', () => {
  const model = buildVibrationWorkspaceModel(workflow());
  assert.equal(model.schema, VIBRATION_WORKSPACE_MODEL_SCHEMA);
  assert.equal(model.authority, 'READ_MODEL_ONLY');
  assert.equal(model.engineeringAuthority, 'NONE');
  assert.equal(model.screeningAuthorized, false);
  assert.equal(model.qualificationMode, 'benchmark');
  assert.deepEqual(model.rows.map((row) => row.canonicalId), ['CAN-3', 'CAN-1', 'CAN-2']);
  assert.equal(model.summary.totalRows, 3);
  assert.equal(model.summary.visibleRows, 3);
  assert.equal(model.summary.calculatedRows, 1);
  assert.equal(model.summary.incompleteRows, 1);
  assert.equal(model.summary.calculationFailedRows, 1);
  assert.equal(model.rows.find((row) => row.canonicalId === 'CAN-2').governingReferenceLof, null);
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.rows), true);
});

test('workspace filters change visibility only and keep evidence/authority fields intact', () => {
  const model = buildVibrationWorkspaceModel(workflow(), {
    filters: {
      lines: ['L-100'],
      qualificationStates: ['BENCHMARK_ONLY'],
      phaseEvidenceStrengths: ['EI_PUBLISHED_EXAMPLE'],
      candidateForEngineeringReview: true,
    },
  });
  assert.equal(model.summary.totalRows, 3);
  assert.equal(model.summary.visibleRows, 1);
  assert.equal(model.rows[0].canonicalId, 'CAN-1');
  assert.equal(model.rows[0].qualificationState, 'BENCHMARK_ONLY');
  assert.equal(model.rows[0].phaseEvidenceStrength, 'EI_PUBLISHED_EXAMPLE');
  assert.equal(model.rows[0].candidateForEngineeringReview, true);
  assert.equal(model.screeningAuthorized, false);
});

test('selected-row detail joins exact dataset, plan and result identity without inference', () => {
  const key = vibrationWorkspaceRowKey({ line: 'L-100', caseId: 'NORMAL', canonicalId: 'CAN-1' });
  const model = buildVibrationWorkspaceModel(workflow(), { selectedRowKey: key });
  assert.equal(model.selectedRowKey, key);
  assert.equal(model.detail.summary.canonicalId, 'CAN-1');
  assert.equal(model.detail.inputs.values.phase, 'GAS');
  assert.equal(model.detail.inputs.units.outsideDiameter, 'mm');
  assert.equal(model.detail.inputs.qualificationMode, 'benchmark');
  assert.equal(model.detail.operatingCase.source, 'HMB-1');
  assert.equal(model.detail.enrichment.length, 3);
  assert.equal(model.detail.evidenceQualification.qualification.effective, 'BENCHMARK_ONLY');
  assert.deepEqual(model.detail.evidenceQualification.evidence.equationIds, ['FIT-EQ-001']);
  assert.equal(model.detail.sourceTrace.assessmentPoint.source, 'VIB-REVIEW');
});

test('missing selection remains explicit and never falls back to another row', () => {
  const model = buildVibrationWorkspaceModel(workflow(), { selectedRowKey: '["NO","SUCH","ROW"]' });
  assert.equal(model.selectedRowKey, null);
  assert.equal(model.detail, null);
  assert(model.warnings.some((warning) => warning.code === 'WORKSPACE_SELECTION_NOT_FOUND'));
});

test('workspace rejects authority mutation, score-like filters and LOF ranking sort', () => {
  const mutated = { ...workflow(), screeningAuthorized: true };
  assert.throws(
    () => buildVibrationWorkspaceModel(mutated),
    (error) => error.code === 'VIBRATION_WORKSPACE_AUTHORITY_VIOLATION',
  );
  assert.throws(
    () => buildVibrationWorkspaceModel(workflow(), { filters: { riskScoreMin: 1 } }),
    (error) => error.code === 'VIBRATION_WORKSPACE_FILTER_UNSUPPORTED',
  );
  assert.throws(
    () => buildVibrationWorkspaceModel(workflow(), { sort: { field: 'governingReferenceLof' } }),
    (error) => error.code === 'VIBRATION_WORKSPACE_SORT_INVALID',
  );
});

test('workspace supports deterministic presentation sorting without changing source row data', () => {
  const model = buildVibrationWorkspaceModel(workflow(), {
    sort: { field: 'canonicalId', direction: 'desc' },
  });
  assert.deepEqual(model.rows.map((row) => row.canonicalId), ['CAN-3', 'CAN-2', 'CAN-1']);
  assert.equal(model.summary.byCompleteness.CALCULATED, 1);
  assert.equal(model.summary.byCompleteness.DATA_INCOMPLETE, 1);
  assert.equal(model.summary.byCompleteness.CALCULATION_FAILED, 1);
});
