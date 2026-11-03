import { VIBRATION_FACILITY_FIT_RESULT_SCHEMA } from './fit-execute.js';

export const VIBRATION_FACILITY_FIT_REGISTER_SCHEMA = 'VibrationFacilityFitRegister.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function registerError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'VibrationFacilityFitRegisterError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function assertFacilityResult(result) {
  if (result?.schema !== VIBRATION_FACILITY_FIT_RESULT_SCHEMA) {
    throw registerError(
      'FIT_FACILITY_RESULT_SCHEMA_MISMATCH',
      `FIT register requires ${VIBRATION_FACILITY_FIT_RESULT_SCHEMA}.`,
      { actual: result?.schema ?? null },
    );
  }
  if (!Array.isArray(result.rows)) {
    throw registerError(
      'FIT_FACILITY_RESULT_INVALID',
      'FIT facility result rows must be an array.',
    );
  }
  return result;
}

function calculatedStatus(status) {
  return status === 'CALCULATED_BENCHMARK' || status === 'CALCULATED_SCREENING';
}

function completenessStatus(status) {
  if (calculatedStatus(status)) return 'CALCULATED';
  if (status === 'NOT_ASSESSED_DATA_INCOMPLETE') return 'DATA_INCOMPLETE';
  if (status === 'CALCULATION_FAILED') return 'CALCULATION_FAILED';
  return 'UNKNOWN';
}

function calculatedProjection(row) {
  const coverage = row.qualificationCoverage ?? null;
  const candidate = row.screeningCandidate ?? null;
  return {
    standardLof: row.standardLof,
    refinedLof: row.refinedLof,
    governingReferenceLof: row.governingReferenceLof,
    referenceBand: row.referenceBand,
    assessmentStatus: row.assessmentStatus,
    qualificationState: row.qualification?.effective ?? row.qualification?.method ?? null,
    benchmarkAuthority: row.centralResult?.provenance?.engineeringAuthority ?? null,
    phaseEvidenceStrength: coverage?.phasePath?.evidenceStrength ?? null,
    correlationEvidenceStrength: coverage?.standardCorrelation?.evidenceStrength ?? null,
    advancedEvidenceStrength: coverage?.advancedCorrelation?.used
      ? coverage.advancedCorrelation.evidenceStrength ?? null
      : null,
    candidateForEngineeringReview: candidate?.candidateForEngineeringReview ?? false,
    screeningCandidateStatus: candidate?.status ?? null,
    continuationRequired: candidate?.continuationRequired ?? null,
  };
}

function nonCalculatedProjection() {
  return {
    standardLof: null,
    refinedLof: null,
    governingReferenceLof: null,
    referenceBand: null,
    assessmentStatus: null,
    qualificationState: null,
    benchmarkAuthority: null,
    phaseEvidenceStrength: null,
    correlationEvidenceStrength: null,
    advancedEvidenceStrength: null,
    candidateForEngineeringReview: false,
    screeningCandidateStatus: null,
    continuationRequired: null,
  };
}

function projectRow(row, index, facilityResult) {
  const calculated = calculatedStatus(row.status);
  const projection = calculated ? calculatedProjection(row) : nonCalculatedProjection();
  return {
    sourceRowIndex: index,
    canonicalId: row.canonicalId,
    line: row.line,
    caseId: row.caseId,
    status: row.status,
    completenessStatus: completenessStatus(row.status),
    ...projection,
    engineeringAuthority: facilityResult.engineeringAuthority ?? 'NONE',
    screeningAuthorized: Boolean(facilityResult.screeningAuthorized),
    missing: Object.freeze([...(row.missing ?? [])]),
    invalid: Object.freeze([...(row.invalid ?? [])]),
    errorCodes: Object.freeze((row.errors ?? []).map((error) => error.code ?? 'UNKNOWN_ERROR')),
    assessmentPointSource: row.sourceTrace?.assessmentPoint?.source ?? null,
    operatingCaseSource: row.sourceTrace?.operatingCase?.source ?? null,
  };
}

function countReferenceBands(rows) {
  const counts = {};
  for (const row of rows) {
    if (!row.referenceBand) continue;
    counts[row.referenceBand] = (counts[row.referenceBand] ?? 0) + 1;
  }
  return counts;
}

function authorityWarning(result, calculatedRows) {
  if (!calculatedRows) return [];
  if (result.qualificationMode === 'screening') {
    return [{
      code: 'REGISTER_VALUES_ARE_SCREENING_ONLY',
      message: 'Calculated FIT values are qualified for bounded screening only; design authority remains false.',
    }];
  }
  return [{
    code: 'REGISTER_VALUES_ARE_BENCHMARK_REFERENCE_ONLY',
    message: 'Calculated FIT values in this register are benchmark/reference results, not authorized screening/design results.',
  }];
}

export function buildVibrationFacilityFitRegister(resultInput = {}) {
  const result = assertFacilityResult(resultInput);
  const rows = result.rows.map((row, index) => projectRow(row, index, result));
  const calculatedRows = rows.filter((row) => calculatedStatus(row.status)).length;
  const notAssessedRows = rows.filter((row) => row.status === 'NOT_ASSESSED_DATA_INCOMPLETE').length;
  const failedRows = rows.filter((row) => row.status === 'CALCULATION_FAILED').length;

  return deepFreeze({
    schema: VIBRATION_FACILITY_FIT_REGISTER_SCHEMA,
    authority: 'READ_PROJECTION_ONLY',
    engineeringAuthority: result.engineeringAuthority ?? 'NONE',
    screeningAuthorized: Boolean(result.screeningAuthorized),
    calculationId: result.calculationId,
    qualificationMode: result.qualificationMode,
    sourceResultSchema: result.schema,
    rows,
    summary: {
      totalRows: rows.length,
      calculatedRows,
      notAssessedRows,
      failedRows,
      referenceBandCounts: countReferenceBands(rows),
      candidateForEngineeringReviewCount: rows.filter((row) => row.candidateForEngineeringReview).length,
      benchmarkOnlyCount: rows.filter((row) => row.qualificationState === 'BENCHMARK_ONLY').length,
      screeningCount: rows.filter((row) => row.qualificationState === 'SCREENING').length,
    },
    warnings: Object.freeze([
      ...(notAssessedRows ? [{
        code: 'REGISTER_HAS_INCOMPLETE_DATA_ROWS',
        message: 'Facility register contains rows that were not assessed because required data were incomplete.',
        details: { count: notAssessedRows },
      }] : []),
      ...(failedRows ? [{
        code: 'REGISTER_HAS_CALCULATION_FAILURES',
        message: 'Facility register contains rows whose central FIT calculation failed.',
        details: { count: failedRows },
      }] : []),
      ...authorityWarning(result, calculatedRows),
    ]),
  });
}
