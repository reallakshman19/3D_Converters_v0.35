import {
  FIT_FACILITY_PROCESS_REFERENCE_BASES,
  FIT_FACILITY_SPAN_DETERMINATION_METHODS,
  FIT_FACILITY_SUPPORT_EVIDENCE_STATUSES,
  FIT_FACILITY_WALL_BASES,
} from '../facility/fit-plan-contract.js';
import {
  assertExactVibrationCsvHeader,
  nonBlankVibrationCsvRows,
  parseStrictVibrationCsvRows,
  serializeVibrationCsvRows,
  vibrationTabularInputError,
} from './csv.js';

export const VIBRATION_FIT_DATA_BLOCKER_CSV_SCHEMA = 'VibrationFitDataBlockerCsv.v1';
export const VIBRATION_FIT_DATA_BLOCKER_CSV_HEADER = Object.freeze([
  'Canonical ID', 'Line', 'Operating Case', 'Field', 'Value', 'Unit',
  'Source', 'Source Revision', 'Record ID', 'Status', 'Reviewer', 'Notes',
]);

const STATUSES = Object.freeze(['ACTIVE', 'HOLD', 'RESOLVED']);
const PHASES = Object.freeze(['LIQUID', 'GAS', 'MULTIPHASE']);
const MODES = Object.freeze(['AGGREGATE_EFFECTIVE', 'COMPONENT_DERIVED']);
const PROCESS_BASIS_FIELDS = Object.freeze([
  'DENSITY_BASIS', 'VELOCITY_BASIS', 'GAS_DENSITY_BASIS', 'LIQUID_DENSITY_BASIS',
]);

export const VIBRATION_FIT_DATA_BLOCKER_FIELDS = Object.freeze({
  ASSESSMENT_POINT: Object.freeze({ property: 'FIT_ASSESSMENT_POINT', type: 'BOOLEAN', scope: 'GLOBAL' }),
  OUTSIDE_DIAMETER: Object.freeze({ property: 'OUTSIDE_DIAMETER', type: 'NUMBER', scope: 'GLOBAL' }),
  WALL_THICKNESS: Object.freeze({ property: 'WALL_THICKNESS', type: 'NUMBER', scope: 'GLOBAL' }),
  INSIDE_DIAMETER: Object.freeze({ property: 'INSIDE_DIAMETER', type: 'NUMBER', scope: 'GLOBAL' }),
  MAX_UNSUPPORTED_SPAN: Object.freeze({ property: 'MAX_UNSUPPORTED_SPAN', type: 'NUMBER', scope: 'GLOBAL' }),
  MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS: Object.freeze({ property: 'MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS', type: 'NUMBER', scope: 'GLOBAL' }),
  WALL_BASIS: Object.freeze({ property: 'WALL_BASIS', type: 'STRING', scope: 'GLOBAL' }),
  SPAN_DETERMINATION_METHOD: Object.freeze({ property: 'SPAN_DETERMINATION_METHOD', type: 'STRING', scope: 'GLOBAL' }),
  SUPPORT_EVIDENCE_STATUS: Object.freeze({ property: 'SUPPORT_EVIDENCE_STATUS', type: 'STRING', scope: 'GLOBAL' }),
  NATURAL_FREQUENCY: Object.freeze({ property: 'NATURAL_FREQUENCY', type: 'NUMBER', scope: 'CASE_OR_GLOBAL' }),
  PHASE: Object.freeze({ property: 'FIT_PHASE', type: 'STRING', scope: 'CASE', operatingField: 'phase' }),
  MASS_FLOW: Object.freeze({ property: 'FIT_MASS_FLOW', type: 'NUMBER', scope: 'CASE', operatingField: 'massFlow' }),
  DENSITY: Object.freeze({ property: 'FIT_DENSITY', type: 'NUMBER', scope: 'CASE', operatingField: 'density' }),
  DENSITY_BASIS: Object.freeze({ property: 'FIT_DENSITY_BASIS', type: 'STRING', scope: 'CASE' }),
  DYNAMIC_VISCOSITY: Object.freeze({ property: 'FIT_DYNAMIC_VISCOSITY', type: 'NUMBER', scope: 'CASE', operatingField: 'dynamicViscosity' }),
  VELOCITY: Object.freeze({ property: 'FIT_VELOCITY', type: 'NUMBER', scope: 'CASE', operatingField: 'velocity' }),
  VELOCITY_BASIS: Object.freeze({ property: 'FIT_VELOCITY_BASIS', type: 'STRING', scope: 'CASE' }),
  MULTIPHASE_RESOLUTION_MODE: Object.freeze({ property: 'FIT_MULTIPHASE_RESOLUTION_MODE', type: 'STRING', scope: 'CASE' }),
  GAS_MASS_FLOW: Object.freeze({ property: 'FIT_GAS_MASS_FLOW', type: 'NUMBER', scope: 'CASE' }),
  GAS_DENSITY: Object.freeze({ property: 'FIT_GAS_DENSITY', type: 'NUMBER', scope: 'CASE' }),
  GAS_DENSITY_BASIS: Object.freeze({ property: 'FIT_GAS_DENSITY_BASIS', type: 'STRING', scope: 'CASE' }),
  LIQUID_MASS_FLOW: Object.freeze({ property: 'FIT_LIQUID_MASS_FLOW', type: 'NUMBER', scope: 'CASE' }),
  LIQUID_DENSITY: Object.freeze({ property: 'FIT_LIQUID_DENSITY', type: 'NUMBER', scope: 'CASE' }),
  LIQUID_DENSITY_BASIS: Object.freeze({ property: 'FIT_LIQUID_DENSITY_BASIS', type: 'STRING', scope: 'CASE' }),
  OPERATING_SCENARIO_COHERENT: Object.freeze({ property: 'FIT_OPERATING_SCENARIO_COHERENT', type: 'BOOLEAN', scope: 'CASE' }),
});

function text(value) {
  return String(value ?? '').trim();
}

function blockerError(code, message, details = {}) {
  return vibrationTabularInputError(code, message, details);
}

function typedValue(raw, definition, rowNumber, status) {
  const rawText = text(raw);
  if (!rawText && status !== 'ACTIVE') return null;
  if (!rawText) throw blockerError(
    'FIT_DATA_BLOCKER_VALUE_REQUIRED', 'ACTIVE blocker input requires an explicit value.', { row: rowNumber },
  );
  if (definition.type === 'NUMBER') {
    const value = Number(rawText);
    if (!Number.isFinite(value)) throw blockerError(
      'FIT_DATA_BLOCKER_VALUE_INVALID', 'Numeric blocker input must be finite.', { row: rowNumber, value: raw },
    );
    return value;
  }
  if (definition.type === 'BOOLEAN') {
    const normalized = rawText.toLowerCase();
    if (!['true', 'false'].includes(normalized)) throw blockerError(
      'FIT_DATA_BLOCKER_VALUE_INVALID', 'Boolean blocker input must be true or false.', { row: rowNumber, value: raw },
    );
    return normalized === 'true';
  }
  return rawText;
}

function validateScope(row, definition, rowNumber) {
  if (definition.scope === 'GLOBAL' && row.caseId) throw blockerError(
    'FIT_DATA_BLOCKER_SCOPE_INVALID', `${row.field} is a global element input and must not specify Operating Case.`,
    { row: rowNumber, field: row.field, caseId: row.caseId },
  );
  if (definition.scope === 'CASE' && (!row.line || !row.caseId)) throw blockerError(
    'FIT_DATA_BLOCKER_SCOPE_INVALID', `${row.field} requires Line and Operating Case.`,
    { row: rowNumber, field: row.field },
  );
}

function assertEnum(field, value, allowed, rowNumber) {
  if (!allowed.includes(value)) throw blockerError(
    'FIT_DATA_BLOCKER_VALUE_INVALID', `${field} must be one of ${allowed.join(', ')}.`, { row: rowNumber },
  );
}

function validateEnum(row, rowNumber) {
  if (row.value === null) return;
  if (row.field === 'PHASE') assertEnum(row.field, row.value, PHASES, rowNumber);
  if (row.field === 'MULTIPHASE_RESOLUTION_MODE') assertEnum(row.field, row.value, MODES, rowNumber);
  if (row.field === 'WALL_BASIS') assertEnum(row.field, row.value, FIT_FACILITY_WALL_BASES, rowNumber);
  if (row.field === 'SPAN_DETERMINATION_METHOD') {
    assertEnum(row.field, row.value, FIT_FACILITY_SPAN_DETERMINATION_METHODS, rowNumber);
  }
  if (row.field === 'SUPPORT_EVIDENCE_STATUS') {
    assertEnum(row.field, row.value, FIT_FACILITY_SUPPORT_EVIDENCE_STATUSES, rowNumber);
  }
  if (PROCESS_BASIS_FIELDS.includes(row.field)) {
    assertEnum(row.field, row.value, FIT_FACILITY_PROCESS_REFERENCE_BASES, rowNumber);
  }
}

function validateUnit(definition, status, value, unit, field, rowNumber) {
  if (definition.type !== 'NUMBER' && unit) throw blockerError(
    'FIT_DATA_BLOCKER_UNIT_INVALID', `${field} does not accept an engineering unit.`, { row: rowNumber, field, unit },
  );
  if (definition.type !== 'NUMBER') return;
  if (value !== null && !unit) throw blockerError(
    'FIT_DATA_BLOCKER_UNIT_REQUIRED', `${field} requires an explicit engineering unit.`, { row: rowNumber, field },
  );
  if (value === null && unit) throw blockerError(
    'FIT_DATA_BLOCKER_VALUE_REQUIRED', `${field} cannot declare a unit without a value.`, { row: rowNumber, field },
  );
  if (status === 'ACTIVE' && value === null) throw blockerError(
    'FIT_DATA_BLOCKER_VALUE_REQUIRED', `${field} ACTIVE row requires value and unit.`, { row: rowNumber, field },
  );
}

function parseRow(row, index) {
  const rowNumber = index + 2;
  if (row.length !== VIBRATION_FIT_DATA_BLOCKER_CSV_HEADER.length) throw blockerError(
    'FIT_DATA_BLOCKER_COLUMN_COUNT_MISMATCH', 'FIT data-blocker row does not match the v1 column count.',
    { row: rowNumber, expected: VIBRATION_FIT_DATA_BLOCKER_CSV_HEADER.length, actual: row.length },
  );
  const canonicalId = text(row[0]);
  const field = text(row[3]).toUpperCase();
  const source = text(row[6]);
  const status = text(row[9]).toUpperCase();
  if (!canonicalId || !field || !source || !status) throw blockerError(
    'FIT_DATA_BLOCKER_REQUIRED_VALUE', 'Canonical ID, Field, Source and Status are required.', { row: rowNumber },
  );
  if (!STATUSES.includes(status)) throw blockerError(
    'FIT_DATA_BLOCKER_STATUS_INVALID', `Status must be one of ${STATUSES.join(', ')}.`, { row: rowNumber, status },
  );
  const definition = VIBRATION_FIT_DATA_BLOCKER_FIELDS[field];
  if (!definition) throw blockerError(
    'FIT_DATA_BLOCKER_FIELD_UNSUPPORTED', `Unsupported FIT data-blocker field ${field}.`, { row: rowNumber, field },
  );
  const unit = text(row[5]);
  const value = typedValue(row[4], definition, rowNumber, status);
  validateUnit(definition, status, value, unit, field, rowNumber);
  const parsed = {
    canonicalId, line: text(row[1]) || null, caseId: text(row[2]) || null, field,
    value, unit: unit || null, source,
    sourceRevision: text(row[7]) || null, recordId: text(row[8]) || null,
    status, reviewer: text(row[10]) || null, notes: text(row[11]) || null,
  };
  validateScope(parsed, definition, rowNumber);
  validateEnum(parsed, rowNumber);
  return Object.freeze(parsed);
}

export function parseVibrationFitDataBlockerCsv(csvText) {
  const rows = parseStrictVibrationCsvRows(csvText);
  assertExactVibrationCsvHeader(rows, VIBRATION_FIT_DATA_BLOCKER_CSV_HEADER, VIBRATION_FIT_DATA_BLOCKER_CSV_SCHEMA);
  return Object.freeze(nonBlankVibrationCsvRows(rows.slice(1)).map(parseRow));
}

export function createVibrationFitDataBlockerCsvTemplate() {
  return serializeVibrationCsvRows([VIBRATION_FIT_DATA_BLOCKER_CSV_HEADER]);
}

function enrichmentKey(row) {
  return `${row.canonicalId}\u0000${row.caseId ?? ''}\u0000${row.property}`;
}

function blockerPropertyKey(blocker, property) {
  return `${blocker.canonicalId}\u0000${blocker.caseId ?? ''}\u0000${property}`;
}

function operatingKey(row) {
  return `${row.line}\u0000${row.caseId}`;
}

function ensureCase(operatingCases, byKey, blocker) {
  if (!blocker.caseId) return;
  const key = `${blocker.line}\u0000${blocker.caseId}`;
  if (byKey.has(key)) return;
  const row = Object.freeze({
    line: blocker.line,
    caseId: blocker.caseId,
    source: 'FIT_DATA_BLOCKER_TABLE',
    sourceRevision: blocker.sourceRevision ?? undefined,
    recordId: blocker.recordId ?? `FIT-DATA-BLOCKER:${blocker.line}:${blocker.caseId}`,
  });
  operatingCases.push(row);
  byKey.set(key, row);
}

function sourceCollision(blocker, message) {
  throw blockerError('FIT_DATA_BLOCKER_SOURCE_COLLISION', message, {
    canonicalId: blocker.canonicalId, line: blocker.line, caseId: blocker.caseId, field: blocker.field,
  });
}

function assertAlternativeFlowFillOnly(blocker, operating, enrichmentKeys) {
  const alternate = blocker.field === 'MASS_FLOW'
    ? { operating: 'velocity', property: 'FIT_VELOCITY' }
    : blocker.field === 'VELOCITY'
      ? { operating: 'massFlow', property: 'FIT_MASS_FLOW' }
      : null;
  if (!alternate) return;
  if (operating?.[alternate.operating] !== undefined
      || enrichmentKeys.has(blockerPropertyKey(blocker, alternate.property))) {
    sourceCollision(blocker, 'Manual blocker input cannot introduce an alternate flow representation when source/manual flow evidence already exists.');
  }
}

function assertFillOnly(blocker, definition, operatingByKey, enrichmentKeys) {
  const eKey = blockerPropertyKey(blocker, definition.property);
  if (enrichmentKeys.has(eKey)) {
    sourceCollision(blocker, 'Manual blocker input cannot overwrite an existing enrichment value.');
  }
  const operating = blocker.caseId ? operatingByKey.get(`${blocker.line}\u0000${blocker.caseId}`) : null;
  assertAlternativeFlowFillOnly(blocker, operating, enrichmentKeys);
  if (definition.operatingField && operating?.[definition.operatingField] !== undefined) {
    sourceCollision(blocker, 'Manual blocker input cannot overwrite an existing operating-case value.');
  }
}

function enrichmentRow(blocker, definition) {
  return Object.freeze({
    canonicalId: blocker.canonicalId,
    ...(blocker.line ? { line: blocker.line } : {}),
    ...(blocker.caseId ? { caseId: blocker.caseId } : {}),
    property: definition.property,
    value: blocker.value,
    ...(blocker.unit ? { unit: blocker.unit } : {}),
    source: blocker.source,
    ...(blocker.sourceRevision ? { sourceRevision: blocker.sourceRevision } : {}),
    ...(blocker.recordId ? { recordId: blocker.recordId } : {}),
    status: 'MANUAL_DATA_BLOCKER_ACTIVE',
    ...(blocker.reviewer ? { reviewer: blocker.reviewer } : {}),
  });
}

export function applyVibrationFitDataBlockers(input = {}) {
  const operatingCases = [...(input.operatingCases ?? [])];
  const enrichment = [...(input.enrichment ?? [])];
  const blockers = (input.blockers ?? []).filter((row) => row.status === 'ACTIVE');
  const operatingByKey = new Map(operatingCases.map((row) => [operatingKey(row), row]));
  const enrichmentKeys = new Set(enrichment.map(enrichmentKey));
  for (const blocker of blockers) {
    const definition = VIBRATION_FIT_DATA_BLOCKER_FIELDS[blocker.field];
    assertFillOnly(blocker, definition, operatingByKey, enrichmentKeys);
    ensureCase(operatingCases, operatingByKey, blocker);
    const row = enrichmentRow(blocker, definition);
    enrichment.push(row);
    enrichmentKeys.add(enrichmentKey(row));
  }
  return Object.freeze({
    operatingCases: Object.freeze(operatingCases),
    enrichment: Object.freeze(enrichment),
    appliedCount: blockers.length,
  });
}
