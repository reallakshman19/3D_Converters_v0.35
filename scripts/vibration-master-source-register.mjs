import { createHash } from 'node:crypto';

export const VIBRATION_MASTER_SOURCE_REGISTER_SCHEMA = 'VibrationMasterSourceRegister.v1';

export const VIBRATION_MASTER_SOURCE_STATES = Object.freeze([
  'SOURCE_NOT_LOCATED',
  'SOURCE_PINNED',
  'EXTRACTED',
  'RECONCILIATION_REQUIRED',
  'RECONCILED',
  'APPROVED_BENCHMARK',
  'APPROVED_SCREENING',
  'BLOCKED_SOURCE',
  'RETIRED',
]);

export const VIBRATION_MASTER_SOURCE_DATA_TYPES = Object.freeze([
  'TABLE', 'RULE', 'CURVE', 'EQUATION', 'PROJECT_EVIDENCE', 'UNRESOLVED',
]);

const SHA1 = /^(?:sha1:)?[0-9a-f]{40}$/u;
const SOURCE_FIELDS = new Set([
  'sourceId', 'repository', 'commit', 'path', 'gitBlobSha1', 'sizeBytes', 'edition',
]);
const ENTRY_FIELDS = new Set([
  'masterId', 'mechanismId', 'dataType', 'sourceState', 'sourceRef', 'locator',
  'extractionReceipt', 'notes',
]);
const LOCATOR_FIELDS = new Set([
  'identifier', 'section', 'printedPage', 'pdfPages', 'locatorStatus',
]);
const REGISTER_FIELDS = new Set([
  'schema', 'registerRevision', 'controlledSources', 'entries', 'authority',
]);
const AUTHORITY_FIELDS = new Set([
  'engineeringAuthority', 'screeningAuthority', 'designAuthority', 'statement',
]);
const LOCATOR_STATUSES = new Set(['NAVIGATION_ONLY', 'EXTRACTED_HASH_BOUND', 'RECONCILED']);
const DATA_TYPES = new Set(VIBRATION_MASTER_SOURCE_DATA_TYPES);
const STATES = new Set(VIBRATION_MASTER_SOURCE_STATES);

function assertPlainObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(code);
  return value;
}

function assertKnownFields(value, allowed, code) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new TypeError(`${code}: ${key}`);
}

function requireText(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(code);
  return value.trim();
}

function optionalText(value, code) {
  if (value === undefined || value === null) return null;
  return requireText(value, code);
}

function normalizeBlob(value) {
  const text = requireText(value, 'VIBRATION_SOURCE_REGISTER_BLOB_REQUIRED').toLowerCase();
  if (!SHA1.test(text)) throw new TypeError('VIBRATION_SOURCE_REGISTER_BLOB_INVALID');
  return text.startsWith('sha1:') ? text : `sha1:${text}`;
}

function normalizeCommit(value) {
  const text = requireText(value, 'VIBRATION_SOURCE_REGISTER_COMMIT_REQUIRED').toLowerCase();
  if (!/^[0-9a-f]{40}$/u.test(text)) throw new TypeError('VIBRATION_SOURCE_REGISTER_COMMIT_INVALID');
  return text;
}

function normalizeSource(source) {
  assertPlainObject(source, 'VIBRATION_SOURCE_REGISTER_SOURCE_INVALID');
  assertKnownFields(source, SOURCE_FIELDS, 'VIBRATION_SOURCE_REGISTER_SOURCE_FIELD_UNKNOWN');
  if (!Number.isInteger(source.sizeBytes) || source.sizeBytes <= 0) {
    throw new TypeError('VIBRATION_SOURCE_REGISTER_SIZE_INVALID');
  }
  return {
    sourceId: requireText(source.sourceId, 'VIBRATION_SOURCE_REGISTER_SOURCE_ID_REQUIRED'),
    repository: requireText(source.repository, 'VIBRATION_SOURCE_REGISTER_REPOSITORY_REQUIRED'),
    commit: normalizeCommit(source.commit),
    path: requireText(source.path, 'VIBRATION_SOURCE_REGISTER_PATH_REQUIRED'),
    gitBlobSha1: normalizeBlob(source.gitBlobSha1),
    sizeBytes: source.sizeBytes,
    edition: requireText(source.edition, 'VIBRATION_SOURCE_REGISTER_EDITION_REQUIRED'),
  };
}

function normalizePdfPages(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new TypeError('VIBRATION_SOURCE_REGISTER_PDF_PAGES_INVALID');
  let previous = 0;
  return value.map((page) => {
    if (!Number.isInteger(page) || page < 1 || page <= previous) {
      throw new TypeError('VIBRATION_SOURCE_REGISTER_PDF_PAGES_INVALID');
    }
    previous = page;
    return page;
  });
}

function normalizeLocator(locator) {
  if (locator === undefined || locator === null) return null;
  assertPlainObject(locator, 'VIBRATION_SOURCE_REGISTER_LOCATOR_INVALID');
  assertKnownFields(locator, LOCATOR_FIELDS, 'VIBRATION_SOURCE_REGISTER_LOCATOR_FIELD_UNKNOWN');
  const locatorStatus = requireText(locator.locatorStatus, 'VIBRATION_SOURCE_REGISTER_LOCATOR_STATUS_REQUIRED');
  if (!LOCATOR_STATUSES.has(locatorStatus)) throw new TypeError('VIBRATION_SOURCE_REGISTER_LOCATOR_STATUS_INVALID');
  return {
    identifier: requireText(locator.identifier, 'VIBRATION_SOURCE_REGISTER_IDENTIFIER_REQUIRED'),
    section: optionalText(locator.section, 'VIBRATION_SOURCE_REGISTER_SECTION_INVALID'),
    printedPage: optionalText(locator.printedPage, 'VIBRATION_SOURCE_REGISTER_PRINTED_PAGE_INVALID'),
    pdfPages: normalizePdfPages(locator.pdfPages),
    locatorStatus,
  };
}

function assertStateConsistency(entry) {
  const blocked = ['SOURCE_NOT_LOCATED', 'BLOCKED_SOURCE'].includes(entry.sourceState);
  if (blocked && (entry.sourceRef !== null || entry.locator !== null || entry.extractionReceipt !== null)) {
    throw new Error('VIBRATION_SOURCE_REGISTER_BLOCKED_ENTRY_HAS_SOURCE');
  }
  if (!blocked && entry.sourceRef === null) throw new Error('VIBRATION_SOURCE_REGISTER_SOURCE_REF_REQUIRED');
  if (['SOURCE_PINNED', 'RECONCILIATION_REQUIRED'].includes(entry.sourceState)
    && entry.locator?.locatorStatus && entry.locator.locatorStatus !== 'NAVIGATION_ONLY') {
    throw new Error('VIBRATION_SOURCE_REGISTER_PRE_EXTRACTION_LOCATOR_INVALID');
  }
  if (entry.sourceState === 'EXTRACTED') {
    if (entry.locator?.locatorStatus !== 'EXTRACTED_HASH_BOUND' || !entry.locator.pdfPages.length || !entry.extractionReceipt) {
      throw new Error('VIBRATION_SOURCE_REGISTER_EXTRACTED_EVIDENCE_REQUIRED');
    }
  }
  if (['RECONCILED', 'APPROVED_BENCHMARK', 'APPROVED_SCREENING'].includes(entry.sourceState)) {
    if (entry.locator?.locatorStatus !== 'RECONCILED' || !entry.locator.pdfPages.length || !entry.extractionReceipt) {
      throw new Error('VIBRATION_SOURCE_REGISTER_RECONCILED_EVIDENCE_REQUIRED');
    }
  }
}

function normalizeEntry(entry) {
  assertPlainObject(entry, 'VIBRATION_SOURCE_REGISTER_ENTRY_INVALID');
  assertKnownFields(entry, ENTRY_FIELDS, 'VIBRATION_SOURCE_REGISTER_ENTRY_FIELD_UNKNOWN');
  const dataType = requireText(entry.dataType, 'VIBRATION_SOURCE_REGISTER_DATA_TYPE_REQUIRED');
  const sourceState = requireText(entry.sourceState, 'VIBRATION_SOURCE_REGISTER_STATE_REQUIRED');
  if (!DATA_TYPES.has(dataType)) throw new TypeError('VIBRATION_SOURCE_REGISTER_DATA_TYPE_INVALID');
  if (!STATES.has(sourceState)) throw new TypeError('VIBRATION_SOURCE_REGISTER_STATE_INVALID');
  const normalized = {
    masterId: requireText(entry.masterId, 'VIBRATION_SOURCE_REGISTER_MASTER_ID_REQUIRED'),
    mechanismId: requireText(entry.mechanismId, 'VIBRATION_SOURCE_REGISTER_MECHANISM_ID_REQUIRED'),
    dataType,
    sourceState,
    sourceRef: optionalText(entry.sourceRef, 'VIBRATION_SOURCE_REGISTER_SOURCE_REF_INVALID'),
    locator: normalizeLocator(entry.locator),
    extractionReceipt: optionalText(entry.extractionReceipt, 'VIBRATION_SOURCE_REGISTER_RECEIPT_INVALID'),
    notes: optionalText(entry.notes, 'VIBRATION_SOURCE_REGISTER_NOTES_INVALID'),
  };
  assertStateConsistency(normalized);
  return normalized;
}

function normalizeAuthority(authority) {
  assertPlainObject(authority, 'VIBRATION_SOURCE_REGISTER_AUTHORITY_INVALID');
  assertKnownFields(authority, AUTHORITY_FIELDS, 'VIBRATION_SOURCE_REGISTER_AUTHORITY_FIELD_UNKNOWN');
  if (authority.engineeringAuthority !== 'NONE'
    || authority.screeningAuthority !== 'NOT_AUTHORIZED'
    || authority.designAuthority !== false
    || authority.statement !== 'SOURCE_REGISTER_ONLY') {
    throw new Error('VIBRATION_SOURCE_REGISTER_AUTHORITY_PROMOTION_FORBIDDEN');
  }
  return { ...authority };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function validateVibrationMasterSourceRegister(raw) {
  assertPlainObject(raw, 'VIBRATION_SOURCE_REGISTER_INVALID');
  assertKnownFields(raw, REGISTER_FIELDS, 'VIBRATION_SOURCE_REGISTER_FIELD_UNKNOWN');
  if (raw.schema !== VIBRATION_MASTER_SOURCE_REGISTER_SCHEMA) throw new TypeError('VIBRATION_SOURCE_REGISTER_SCHEMA_INVALID');
  const controlledSources = (raw.controlledSources ?? []).map(normalizeSource);
  const sourceIds = controlledSources.map(({ sourceId }) => sourceId);
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error('VIBRATION_SOURCE_REGISTER_SOURCE_ID_DUPLICATE');
  if (!Array.isArray(raw.entries) || raw.entries.length === 0) throw new TypeError('VIBRATION_SOURCE_REGISTER_ENTRIES_REQUIRED');
  const entries = raw.entries.map(normalizeEntry);
  const masterIds = entries.map(({ masterId }) => masterId);
  if (new Set(masterIds).size !== masterIds.length) throw new Error('VIBRATION_SOURCE_REGISTER_MASTER_ID_DUPLICATE');
  const sourceSet = new Set(sourceIds);
  for (const entry of entries) {
    if (entry.sourceRef !== null && !sourceSet.has(entry.sourceRef)) throw new Error('VIBRATION_SOURCE_REGISTER_SOURCE_REF_UNKNOWN');
  }
  return {
    schema: raw.schema,
    registerRevision: requireText(raw.registerRevision, 'VIBRATION_SOURCE_REGISTER_REVISION_REQUIRED'),
    controlledSources,
    entries,
    authority: normalizeAuthority(raw.authority),
  };
}

export function hashVibrationMasterSourceRegister(raw) {
  const normalized = validateVibrationMasterSourceRegister(raw);
  return `sha256:${createHash('sha256').update(stableJson(normalized)).digest('hex')}`;
}

export function findVibrationMasterSourceEntry(register, masterId) {
  const normalized = validateVibrationMasterSourceRegister(register);
  const entry = normalized.entries.find((item) => item.masterId === String(masterId ?? '').trim());
  if (!entry) throw new Error(`VIBRATION_SOURCE_REGISTER_MASTER_UNKNOWN: ${masterId}`);
  const source = entry.sourceRef === null
    ? null
    : normalized.controlledSources.find((item) => item.sourceId === entry.sourceRef);
  return { register: normalized, entry, source };
}
