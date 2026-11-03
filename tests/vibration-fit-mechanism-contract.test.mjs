import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFitMechanismBenchmarkComparison,
  buildFitVibrationMechanismAssessmentItem,
} from '../converters/vibration/mechanisms/index.js';

function row() {
  return {
    line: 'L-100', caseId: 'NORMAL', canonicalId: 'CAN-1', status: 'CALCULATED_BENCHMARK',
    standardLof: 0.276, governingReferenceLof: 0.276, referenceBand: 'LOF_LT_0_3',
    qualificationState: 'BENCHMARK_ONLY', missing: [], invalid: [], errorCodes: [],
  };
}

function fitDetail() {
  return {
    calculationId: 'VIB.FIV.FLOW_TURBULENCE', methodRevision: 'ei-aviff2-fit-reference-v2',
    execution: { executionId: 'ENG-1' }, applicability: { applicable: true },
    resolvedInputs: {
      outsideDiameter: { canonicalValue: 0.1683, canonicalUnit: 'm' },
      density: { canonicalValue: 18, canonicalUnit: 'kg/m3' },
    },
    outputs: { standardLof: 0.276, governingReferenceLof: 0.276, referenceBand: 'LOF_LT_0_3' },
    assessment: { status: 'REFERENCE_BELOW_THRESHOLD' },
    qualification: { effective: 'BENCHMARK_ONLY' },
    provenance: { engineeringAuthority: 'WORKBOOK_REFERENCE_ONLY' },
    equationIds: ['FIT-EQ-001'], correlationIds: ['FIT.STD.MEDIUM_STIFF.v1'],
    warnings: [{ code: 'BENCHMARK_REFERENCE_ONLY' }],
    sourceTrace: { operatingCase: { source: 'EI-D2' } },
  };
}

function benchmark(modified = false) {
  return {
    id: 'EI-D2-FIT-RECYCLE-SUCTION-6IN', modified,
    published: {
      standardLof: 0.276,
      standardLofTolerance: 0.0012,
      referenceBand: 'LOF_LT_0_3',
    },
    source: { tolerancePolicyId: 'FIT-EI-PUBLISHED-RECONCILIATION-V1' },
  };
}

test('FIT benchmark comparison has explicit current, stale and modified-input states', () => {
  const pass = buildFitMechanismBenchmarkComparison({ benchmark: benchmark(), actual: row(), resultState: 'CURRENT_RESULT' });
  assert.equal(pass.status, 'PASS');
  assert.equal(pass.absoluteDelta, 0);
  assert.equal(pass.relativeDelta, 0);
  assert.equal(pass.tolerance, 0.0012);
  assert.equal(pass.toleranceUnit, 'ABSOLUTE_LOF');
  assert.equal(buildFitMechanismBenchmarkComparison({ benchmark: benchmark(), actual: row(), resultState: 'STALE_RESULT' }).status, 'STALE_RESULT');
  assert.equal(buildFitMechanismBenchmarkComparison({ benchmark: benchmark(true), actual: row(), resultState: 'CURRENT_RESULT' }).status, 'NOT_APPLICABLE_MODIFIED_INPUTS');
});

test('FIT benchmark comparison fails parity on value or reference-band mismatch', () => {
  const actual = { ...row(), standardLof: 0.31, referenceBand: 'LOF_0_3_TO_LT_0_5' };
  const result = buildFitMechanismBenchmarkComparison({ benchmark: benchmark(), actual, resultState: 'CURRENT_RESULT' });
  assert.equal(result.status, 'FAIL');
  assert(result.absoluteDelta > result.tolerance);
});

test('FIT generic item carries request, execution, benchmark, trace and qualification without UI math', () => {
  const workingCells = {
    outsideDiameter: { valueRef: { kind: 'enrichment', rowId: 'E-1', header: 'Value' } },
    density: { valueRef: { kind: 'operating', rowId: 'O-1', header: 'Density' } },
  };
  const comparison = buildFitMechanismBenchmarkComparison({ benchmark: benchmark(), actual: row(), resultState: 'CURRENT_RESULT' });
  const item = buildFitVibrationMechanismAssessmentItem({
    row: row(), fitDetail: fitDetail(), resultState: 'CURRENT_RESULT', benchmark: comparison, workingCells,
  });
  assert.equal(item.mechanismId, 'fit');
  assert.equal(item.child.key, 'mainline');
  assert.equal(item.assessmentState, 'CALCULATED');
  assert.equal(item.resultState, 'CURRENT_RESULT');
  assert.equal(item.request.calculationId, 'VIB.FIV.FLOW_TURBULENCE');
  assert.equal(item.execution.executionId, 'ENG-1');
  assert.equal(item.benchmark.status, 'PASS');
  assert.deepEqual(item.trace.equationIds, ['FIT-EQ-001']);
  assert.deepEqual(item.trace.correlationIds, ['FIT.STD.MEDIUM_STIFF.v1']);
  assert.equal(item.trace.inputTrace.status, 'COMPLETE_WORKING_TRACE');
  assert.equal(item.qualification.effective, 'BENCHMARK_ONLY');
});

test('FIT source/normalized trace stays explicitly partial when working pointers are unavailable', () => {
  const item = buildFitVibrationMechanismAssessmentItem({ row: row(), fitDetail: fitDetail(), resultState: 'STALE_RESULT' });
  assert.equal(item.resultState, 'STALE_RESULT');
  assert.equal(item.trace.inputTrace.status, 'SOURCE_AND_NORMALIZED_ONLY');
  assert.deepEqual(item.trace.inputTrace.workingCells, {});
  assert.equal(item.trace.inputTrace.sourceTrace.operatingCase.source, 'EI-D2');
});
