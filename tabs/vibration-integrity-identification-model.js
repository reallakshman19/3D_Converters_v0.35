import {
  VIBRATION_ASSESSMENT_UNIT_TYPES,
  VIBRATION_IDENTIFICATION_DISPOSITIONS,
  VIBRATION_REQUIRED_QUALIFICATIONS,
} from '../converters/vibration/mechanisms/coverage.js';
import { createVibrationMechanismIdentificationBundle } from '../converters/vibration/mechanisms/identification-producer.js';
import { VIBRATION_MECHANISM_IDS } from '../converters/vibration/mechanisms/registry.js';

export const VIBRATION_IDENTIFICATION_AUTHORING_TABLE_SCHEMA = 'VibrationMechanismIdentificationAuthoringTable.v1';
export const VIBRATION_IDENTIFICATION_AUTHORING_AUTHORITY = Object.freeze({
  evidenceClass: 'USER_AUTHORED_PROJECT_IDENTIFICATION',
  identificationAuthority: 'EXPLICIT_EVIDENCE_ONLY',
  controlledSourceAuthority: false,
  engineeringAuthority: 'NONE',
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
  codeCompliance: false,
});

export const VIBRATION_IDENTIFICATION_AUTHORING_FIELDS = Object.freeze([
  'mechanismId', 'line', 'caseId', 'canonicalId', 'assessmentUnitType',
  'disposition', 'requiredQualification', 'sourceId', 'reason',
]);

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function authoringFieldValues(row = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new TypeError('Identification authoring row must be an object.');
  }
  const unknown = Object.keys(row).filter((key) => !VIBRATION_IDENTIFICATION_AUTHORING_FIELDS.includes(key));
  if (unknown.length) throw new Error(`UNKNOWN_IDENTIFICATION_AUTHORING_FIELD:${unknown.sort().join(',')}`);
  return Object.fromEntries(VIBRATION_IDENTIFICATION_AUTHORING_FIELDS.map((field) => [field, text(row[field])]));
}

function withRowId(row, sequence) {
  return Object.freeze({
    rowId: `T1-ID-${String(sequence).padStart(4, '0')}`,
    ...authoringFieldValues(row),
  });
}

function nextTable(rows, nextSequence) {
  return Object.freeze({
    schema: VIBRATION_IDENTIFICATION_AUTHORING_TABLE_SCHEMA,
    authority: VIBRATION_IDENTIFICATION_AUTHORING_AUTHORITY,
    rows: Object.freeze(rows),
    nextSequence,
  });
}

export function createVibrationIdentificationAuthoringTable(rows = []) {
  if (!Array.isArray(rows)) throw new TypeError('Identification authoring rows must be an array.');
  const normalized = rows.map((row, index) => withRowId(row, index + 1));
  return nextTable(normalized, normalized.length + 1);
}

export function addVibrationIdentificationAuthoringRow(table, seed = {}) {
  return nextTable([...table.rows, withRowId(seed, table.nextSequence)], table.nextSequence + 1);
}

function assertRowIndex(table, rowIndex) {
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= table.rows.length) {
    throw new RangeError(`Identification authoring row ${rowIndex} is out of range.`);
  }
}

function assertField(field) {
  if (!VIBRATION_IDENTIFICATION_AUTHORING_FIELDS.includes(field)) {
    throw new RangeError(`Unknown identification authoring field ${field}.`);
  }
}

export function updateVibrationIdentificationAuthoringCell(table, rowIndex, field, value) {
  assertRowIndex(table, rowIndex);
  assertField(field);
  const rows = table.rows.map((row, index) => (
    index === rowIndex ? Object.freeze({ ...row, [field]: text(value) }) : row
  ));
  return nextTable(rows, table.nextSequence);
}

export function deleteVibrationIdentificationAuthoringRow(table, rowIndex) {
  assertRowIndex(table, rowIndex);
  return nextTable(table.rows.filter((_, index) => index !== rowIndex), table.nextSequence);
}

function rowIsEmpty(row) {
  return VIBRATION_IDENTIFICATION_AUTHORING_FIELDS.every((field) => !text(row?.[field]));
}

function missingErrors(row) {
  const errors = [];
  for (const field of ['mechanismId', 'line', 'canonicalId', 'assessmentUnitType', 'disposition', 'sourceId', 'reason']) {
    if (!text(row?.[field])) errors.push(`${field.toUpperCase()}_REQUIRED`);
  }
  if (text(row?.disposition) === 'REQUIRED' && !text(row?.requiredQualification)) {
    errors.push('REQUIRED_QUALIFICATION_REQUIRED');
  }
  return errors;
}

function vocabularyErrors(row) {
  const errors = [];
  if (text(row.mechanismId) && !VIBRATION_MECHANISM_IDS.includes(text(row.mechanismId))) errors.push('UNKNOWN_MECHANISM_ID');
  if (text(row.assessmentUnitType) && !VIBRATION_ASSESSMENT_UNIT_TYPES.includes(text(row.assessmentUnitType))) errors.push('UNKNOWN_ASSESSMENT_UNIT_TYPE');
  if (text(row.disposition) && !VIBRATION_IDENTIFICATION_DISPOSITIONS.includes(text(row.disposition))) errors.push('UNKNOWN_DISPOSITION');
  if (text(row.requiredQualification) && !VIBRATION_REQUIRED_QUALIFICATIONS.includes(text(row.requiredQualification))) errors.push('UNKNOWN_REQUIRED_QUALIFICATION');
  if (text(row.disposition) && text(row.disposition) !== 'REQUIRED' && text(row.requiredQualification)) {
    errors.push('QUALIFICATION_FORBIDDEN_FOR_NON_REQUIRED');
  }
  return errors;
}

export function vibrationIdentificationAuthoringRowState(row) {
  if (rowIsEmpty(row)) return Object.freeze({ status: 'EMPTY', errors: Object.freeze([]) });
  const invalid = vocabularyErrors(row);
  const missing = missingErrors(row);
  if (invalid.length) return Object.freeze({ status: 'INVALID', errors: Object.freeze([...invalid, ...missing]) });
  if (missing.length) return Object.freeze({ status: 'INCOMPLETE', errors: Object.freeze(missing) });
  return Object.freeze({ status: 'READY', errors: Object.freeze([]) });
}

function normalizedCaseId(value) {
  return text(value) || null;
}

function normalizedScope(scope = {}) {
  return Object.freeze({
    line: text(scope.line),
    caseId: normalizedCaseId(scope.caseId),
    canonicalId: text(scope.canonicalId),
  });
}

function rowHasScopeIdentity(row) {
  return Boolean(text(row.line) && text(row.canonicalId));
}

function rowMatchesScope(row, scope) {
  return text(row.line) === scope.line
    && normalizedCaseId(row.caseId) === scope.caseId
    && text(row.canonicalId) === scope.canonicalId;
}

function identificationInput(row) {
  return {
    mechanismId: text(row.mechanismId),
    scope: normalizedScope(row),
    assessmentUnitType: text(row.assessmentUnitType),
    disposition: text(row.disposition),
    ...(text(row.disposition) === 'REQUIRED'
      ? { requiredQualification: text(row.requiredQualification) }
      : {}),
    evidence: { sourceId: text(row.sourceId) },
    reason: text(row.reason),
  };
}

function rowErrors(rows) {
  return rows.flatMap((row) => {
    const state = vibrationIdentificationAuthoringRowState(row);
    return state.errors.map((error) => `${row.rowId}:${error}`);
  });
}

function resolution(status, records = [], errors = [], rows = []) {
  return Object.freeze({
    status,
    records: Object.freeze(records),
    errors: Object.freeze(errors),
    matchingRowIds: Object.freeze(rows.map((row) => row.rowId)),
    authority: VIBRATION_IDENTIFICATION_AUTHORING_AUTHORITY,
  });
}

function unresolvedUnscopedRows(rows) {
  const unscoped = rows.filter((row) => !rowIsEmpty(row) && !rowHasScopeIdentity(row));
  if (!unscoped.length) return null;
  const states = unscoped.map(vibrationIdentificationAuthoringRowState);
  const status = states.some((state) => state.status === 'INVALID') ? 'INVALID' : 'INCOMPLETE';
  return resolution(status, [], rowErrors(unscoped), unscoped);
}

export function resolveVibrationIdentificationEvidenceForScope(table, scopeInput) {
  const scope = normalizedScope(scopeInput);
  if (!scope.line || !scope.canonicalId) throw new TypeError('Identification scope requires line and canonicalId.');
  const rows = table?.rows ?? [];
  const unscoped = unresolvedUnscopedRows(rows);
  if (unscoped) return unscoped;
  const matching = rows.filter((row) => !rowIsEmpty(row) && rowMatchesScope(row, scope));
  if (!matching.length) return resolution('MISSING');
  const states = matching.map(vibrationIdentificationAuthoringRowState);
  const errors = rowErrors(matching);
  if (states.some((state) => state.status === 'INVALID')) return resolution('INVALID', [], errors, matching);
  if (states.some((state) => state.status !== 'READY')) return resolution('INCOMPLETE', [], errors, matching);
  try {
    const bundle = createVibrationMechanismIdentificationBundle({ identifications: matching.map(identificationInput) });
    return resolution('READY', bundle.identifications, [], matching);
  } catch (error) {
    return resolution('INVALID', [], [String(error?.message || error)], matching);
  }
}

export function vibrationIdentificationAuthoringSummary(table) {
  const states = (table?.rows ?? []).map(vibrationIdentificationAuthoringRowState);
  return Object.freeze({
    rows: states.length,
    ready: states.filter((state) => state.status === 'READY').length,
    incomplete: states.filter((state) => state.status === 'INCOMPLETE').length,
    invalid: states.filter((state) => state.status === 'INVALID').length,
    empty: states.filter((state) => state.status === 'EMPTY').length,
  });
}
