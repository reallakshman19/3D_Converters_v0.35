import { parseStrictVibrationCsvRows } from '../tabular/csv.js';
import { AIV_MASTER_DB_REFERENCE, AIV_MASTER_TABLE_SPECS } from './aiv-master-db-reference.js';

export const AIV_MASTER_DB_SCHEMA = 'AivMasterDatabase.v1';
export const AIV_MASTER_RESOLUTION_SCHEMA = 'AivMasterResolution.v1';

function text(value) { return String(value ?? '').trim(); }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
function error(code, message, details = {}) {
  const value = new Error(message);
  value.name = 'AivMasterDbError';
  value.code = code;
  value.details = Object.freeze({ ...details });
  return value;
}
function equalHeader(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}
function objectRows(header, rows) {
  return rows.filter((row) => row.some((value) => text(value))).map((row) => {
    if (row.length !== header.length) throw error('AIV_MASTER_COLUMN_COUNT_INVALID', 'AIV master row width does not match its controlled header.');
    return Object.freeze(Object.fromEntries(header.map((column, index) => [column, text(row[index])])));
  });
}
function parseTable(filename, csvText) {
  const spec = AIV_MASTER_TABLE_SPECS[filename];
  if (!spec) throw error('AIV_MASTER_FILE_UNSUPPORTED', `Unsupported AIV master file ${filename}.`);
  const parsed = parseStrictVibrationCsvRows(csvText);
  if (!parsed.length || !equalHeader(parsed[0], spec.columns)) {
    throw error('AIV_MASTER_HEADER_INVALID', `${filename} does not match the pinned master schema.`, { filename });
  }
  const rows = objectRows(parsed[0], parsed.slice(1));
  const keys = rows.map((row) => row[spec.pk]);
  if (keys.some((key) => !key) || new Set(keys).size !== keys.length) {
    throw error('AIV_MASTER_PRIMARY_KEY_INVALID', `${filename} contains blank or duplicate ${spec.pk}.`, { filename, pk: spec.pk });
  }
  return Object.freeze(rows);
}
function assertForeignKeys(db) {
  const documents = new Set(db.documents.map((row) => row.SourceDocumentId));
  const materials = new Set(db.materials.map((row) => row.MaterialId));
  for (const [name, rows] of Object.entries({
    M_MATERIAL: db.materials,
    M_COMPONENT_TYPE: db.components,
    M_SOURCE_DEVICE_TYPE: db.sourceDevices,
    M_PIPE_DIMENSION: db.pipeDimensions,
    M_PIPING_CLASS: db.pipingClasses,
  })) {
    for (const row of rows) {
      if (!documents.has(row.SourceDocumentId)) throw error('AIV_MASTER_DOCUMENT_FK_INVALID', `${name} references unknown SourceDocumentId ${row.SourceDocumentId}.`);
    }
  }
  for (const row of db.pipingClasses) {
    if (!materials.has(row.MaterialId)) throw error('AIV_MASTER_MATERIAL_FK_INVALID', `M_PIPING_CLASS references unknown MaterialId ${row.MaterialId}.`);
  }
}
function assertDomains(db) {
  const assessmentTypes = new Set(['WELDOLET','WELDED_TEE','WELDED_SUPPORT','OTHER_WELDED_DISCONTINUITY','NONE']);
  const sourceTypes = new Set(['CONTROL_VALVE','RELIEF_VALVE','RESTRICTION_ORIFICE','PRESSURE_REDUCING_BRANCH_CONNECTION','NONE']);
  for (const row of db.components) if (!assessmentTypes.has(row.AivAssessmentType)) throw error('AIV_MASTER_ASSESSMENT_TYPE_INVALID', `Invalid AivAssessmentType ${row.AivAssessmentType}.`);
  for (const row of db.sourceDevices) if (!sourceTypes.has(row.AivSourceDeviceType)) throw error('AIV_MASTER_SOURCE_TYPE_INVALID', `Invalid AivSourceDeviceType ${row.AivSourceDeviceType}.`);
  for (const row of db.materials) if (!['YES','NO'].includes(row.IsDuplex)) throw error('AIV_MASTER_DUPLEX_FLAG_INVALID', `Invalid IsDuplex ${row.IsDuplex}.`);
}
function assertVerification(verification) {
  for (const [filename, expectedBlob] of Object.entries(AIV_MASTER_DB_REFERENCE.files)) {
    const record = verification?.[filename];
    if (!record || record.expectedBlob !== expectedBlob || record.actualBlob !== expectedBlob
      || !['MATCH', 'MATCH_EOL_NORMALIZED'].includes(record.status)) {
      throw error('AIV_MASTER_VERIFICATION_REQUIRED', `${filename} is not verified against the approved pinned Git blob.`, { filename });
    }
  }
}

export function parseAivMasterDatabase(textByFilename = {}, verification = {}) {
  assertVerification(verification);
  const db = { schema: AIV_MASTER_DB_SCHEMA, reference: AIV_MASTER_DB_REFERENCE, verification, rowCounts: {} };
  for (const [filename, spec] of Object.entries(AIV_MASTER_TABLE_SPECS)) {
    if (!(filename in textByFilename)) throw error('AIV_MASTER_FILE_REQUIRED', `AIV master package requires ${filename}.`, { filename });
    db[spec.key] = parseTable(filename, textByFilename[filename]);
    db.rowCounts[spec.key] = db[spec.key].length;
  }
  assertForeignKeys(db);
  assertDomains(db);
  db.status = 'PIN_VERIFIED_STRUCTURALLY_VALID';
  db.authority = {
    dataOrigin: 'PINNED_DB_CREATOR_MASTER',
    engineeringQualification: 'NOT_ESTABLISHED_BY_ADAPTER',
    screeningAuthorityConferred: false,
    designAuthority: false,
  };
  return deepFreeze(db);
}
