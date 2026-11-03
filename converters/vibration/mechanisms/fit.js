import {
  createVibrationMechanismAssessmentItem,
  createVibrationMechanismAssessmentSet,
} from './contracts.js';

export const FIT_VIBRATION_MECHANISM_ID = 'fit';
export const FIT_VIBRATION_MECHANISM_IMPLEMENTATION_STATE = 'IMPLEMENTED_SCREENING';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function scopeFromRow(row = {}) {
  return {
    line: row.line,
    caseId: row.caseId ?? null,
    canonicalId: row.canonicalId,
  };
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fitAssessmentState(row, fitDetail) {
  if (row?.status === 'CALCULATION_FAILED') return 'FAILED';
  if (fitDetail || finiteNumber(row?.governingReferenceLof) !== null || finiteNumber(row?.standardLof) !== null) {
    return 'CALCULATED';
  }
  if (row?.status === 'NOT_ASSESSED_DATA_INCOMPLETE' || row?.completenessStatus === 'DATA_INCOMPLETE') {
    return 'APPLICABLE_INCOMPLETE';
  }
  if (row?.status === 'READY') return 'READY';
  return 'APPLICABILITY_UNKNOWN';
}

function resultStateFor(row, fitDetail, requested) {
  if (requested) return requested;
  return fitDetail || finiteNumber(row?.governingReferenceLof) !== null || finiteNumber(row?.standardLof) !== null
    ? 'CURRENT_RESULT'
    : 'UNRUN';
}

function fitResult(row, fitDetail) {
  const outputs = fitDetail?.outputs ?? null;
  const governing = finiteNumber(outputs?.governingReferenceLof ?? row?.governingReferenceLof);
  const standard = finiteNumber(outputs?.standardLof ?? row?.standardLof);
  const refined = finiteNumber(outputs?.refinedLof ?? row?.refinedLof);
  return {
    calculated: governing !== null || standard !== null,
    governingLof: governing ?? standard,
    standardLof: standard,
    refinedLof: refined,
    referenceBand: outputs?.referenceBand ?? row?.referenceBand ?? null,
    assessmentStatus: fitDetail?.assessment?.status ?? row?.assessmentStatus ?? null,
    outputs,
  };
}

function readinessFromRow(row = {}) {
  return {
    missing: row.missing ?? [],
    invalid: row.invalid ?? [],
    reasons: row.reasons ?? row.errorCodes ?? [],
  };
}

function workingTraceComplete(normalizedInputs, workingCells) {
  const keys = Object.keys(normalizedInputs ?? {});
  if (!keys.length) return false;
  return keys.every((key) => Boolean(workingCells?.[key]?.valueRef));
}

function inputTrace(fitDetail, workingCells = null) {
  if (!fitDetail) return { status: 'UNAVAILABLE' };
  const normalizedInputs = fitDetail.resolvedInputs ?? {};
  const cells = workingCells ?? {};
  return {
    status: workingTraceComplete(normalizedInputs, cells)
      ? 'COMPLETE_WORKING_TRACE'
      : 'SOURCE_AND_NORMALIZED_ONLY',
    normalizedInputs,
    workingCells: cells,
    sourceTrace: fitDetail.sourceTrace ?? null,
  };
}

function requestEnvelope(fitDetail) {
  if (!fitDetail) return null;
  return {
    calculationId: fitDetail.calculationId ?? null,
    methodRevision: fitDetail.methodRevision ?? null,
    normalizedInputs: fitDetail.resolvedInputs ?? {},
  };
}

export function buildFitMechanismBenchmarkComparison({
  benchmark,
  actual,
  resultState,
} = {}) {
  if (!benchmark) return deepFreeze({ status: 'NOT_CONFIGURED' });
  const targetLof = finiteNumber(benchmark.published?.standardLof);
  const actualLof = finiteNumber(actual?.standardLof);
  const tolerance = finiteNumber(benchmark.published?.standardLofTolerance);
  const targetBand = benchmark.published?.referenceBand ?? null;
  const actualBand = actual?.referenceBand ?? null;

  if (benchmark.modified) {
    return deepFreeze({
      status: 'NOT_APPLICABLE_MODIFIED_INPUTS',
      benchmarkId: benchmark.id ?? null,
      targetLof,
      targetBand,
      actualLof,
      actualBand,
      absoluteDelta: null,
      relativeDelta: null,
      tolerance,
      toleranceUnit: 'ABSOLUTE_LOF',
    });
  }
  if (resultState === 'STALE_RESULT') {
    return deepFreeze({
      status: 'STALE_RESULT', benchmarkId: benchmark.id ?? null,
      targetLof, targetBand, actualLof, actualBand,
      absoluteDelta: null, relativeDelta: null, tolerance, toleranceUnit: 'ABSOLUTE_LOF',
    });
  }
  if (resultState !== 'CURRENT_RESULT' || targetLof === null || actualLof === null || tolerance === null) {
    return deepFreeze({
      status: 'NOT_RUN', benchmarkId: benchmark.id ?? null,
      targetLof, targetBand, actualLof, actualBand,
      absoluteDelta: null, relativeDelta: null, tolerance, toleranceUnit: 'ABSOLUTE_LOF',
    });
  }

  const absoluteDelta = Math.abs(actualLof - targetLof);
  const relativeDelta = absoluteDelta / Math.max(Math.abs(targetLof), Number.EPSILON);
  const pass = absoluteDelta <= tolerance && actualBand === targetBand;
  return deepFreeze({
    status: pass ? 'PASS' : 'FAIL',
    benchmarkId: benchmark.id ?? null,
    targetLof,
    targetBand,
    actualLof,
    actualBand,
    absoluteDelta,
    relativeDelta,
    tolerance,
    toleranceUnit: 'ABSOLUTE_LOF',
  });
}

export function buildFitVibrationMechanismAssessmentItem({
  row,
  fitDetail = null,
  resultState = null,
  benchmark = null,
  workingCells = null,
} = {}) {
  const scope = scopeFromRow(row);
  const result = fitResult(row, fitDetail);
  return createVibrationMechanismAssessmentItem({
    mechanismId: FIT_VIBRATION_MECHANISM_ID,
    scope,
    childKey: 'mainline',
    childOrdinal: 0,
    implementationState: FIT_VIBRATION_MECHANISM_IMPLEMENTATION_STATE,
    assessmentState: fitAssessmentState(row, fitDetail),
    resultState: resultStateFor(row, fitDetail, resultState),
    applicability: fitDetail?.applicability ?? null,
    readiness: readinessFromRow(row),
    request: requestEnvelope(fitDetail),
    execution: fitDetail?.execution ?? null,
    result,
    benchmark,
    trace: {
      equationIds: fitDetail?.equationIds ?? [],
      correlationIds: fitDetail?.correlationIds ?? [],
      ruleIds: [],
      inputTrace: inputTrace(fitDetail, workingCells),
    },
    qualification: fitDetail?.qualification ?? (row?.qualificationState ? { effective: row.qualificationState } : null),
    evidence: fitDetail ? {
      provenance: fitDetail.provenance ?? {},
      warnings: fitDetail.warnings ?? [],
    } : null,
  });
}

export function buildFitVibrationMechanismAssessmentSet(options = {}) {
  const item = buildFitVibrationMechanismAssessmentItem(options);
  return createVibrationMechanismAssessmentSet({
    mechanismId: FIT_VIBRATION_MECHANISM_ID,
    scope: item.scope,
    items: [item],
  });
}
