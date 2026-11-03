import { serializeVibrationCsvRows } from '../tabular/csv.js';
import { VIBRATION_FACILITY_FIT_REGISTER_SCHEMA } from './fit-register.js';

export const VIBRATION_FACILITY_FIT_REGISTER_CSV_HEADER = Object.freeze([
  'Line',
  'Operating Case',
  'Canonical ID',
  'Status',
  'Completeness',
  'Standard LOF',
  'Refined LOF',
  'Governing Reference LOF',
  'Reference Band',
  'Assessment Status',
  'Qualification',
  'Benchmark Authority',
  'Engineering Authority',
  'Screening Authorized',
  'Phase Evidence',
  'Correlation Evidence',
  'Advanced Evidence',
  'Candidate For Engineering Review',
  'Candidate Status',
  'Continuation Required',
  'Missing',
  'Invalid',
  'Error Codes',
  'Assessment Point Source',
  'Operating Case Source',
]);

function registerExportError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'VibrationFacilityFitRegisterExportError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function listCell(values) {
  return Array.isArray(values) && values.length ? values.join('; ') : '';
}

function rowToCsv(row) {
  return [
    row.line,
    row.caseId,
    row.canonicalId,
    row.status,
    row.completenessStatus,
    row.standardLof,
    row.refinedLof,
    row.governingReferenceLof,
    row.referenceBand,
    row.assessmentStatus,
    row.qualificationState,
    row.benchmarkAuthority,
    row.engineeringAuthority,
    row.screeningAuthorized,
    row.phaseEvidenceStrength,
    row.correlationEvidenceStrength,
    row.advancedEvidenceStrength,
    row.candidateForEngineeringReview,
    row.screeningCandidateStatus,
    row.continuationRequired,
    listCell(row.missing),
    listCell(row.invalid),
    listCell(row.errorCodes),
    row.assessmentPointSource,
    row.operatingCaseSource,
  ];
}

export function serializeVibrationFacilityFitRegisterCsv(register = {}) {
  if (register?.schema !== VIBRATION_FACILITY_FIT_REGISTER_SCHEMA) {
    throw registerExportError(
      'FIT_FACILITY_REGISTER_SCHEMA_MISMATCH',
      `FIT register CSV export requires ${VIBRATION_FACILITY_FIT_REGISTER_SCHEMA}.`,
      { actual: register?.schema ?? null },
    );
  }
  if (!Array.isArray(register.rows)) {
    throw registerExportError(
      'FIT_FACILITY_REGISTER_INVALID',
      'FIT register rows must be an array.',
    );
  }
  return serializeVibrationCsvRows([
    [...VIBRATION_FACILITY_FIT_REGISTER_CSV_HEADER],
    ...register.rows.map(rowToCsv),
  ]);
}
