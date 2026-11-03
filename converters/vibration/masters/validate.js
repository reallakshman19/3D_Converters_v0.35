import {
  deepFreezeVibrationMaster,
  hashVibrationMasterContent,
  stableVibrationMasterJson,
} from './canonical.js';

export const VIBRATION_MASTER_PUBLICATION_STATES = Object.freeze(['CANDIDATE', 'ACTIVE', 'RETIRED']);
export const VIBRATION_MASTER_AUTHORITY_CLASSES = Object.freeze([
  'EI_METHOD_MASTER', 'EI_REFERENCE_LOOKUP', 'EI_DEFAULT_PROPERTY', 'PROJECT_INPUT',
]);

const SHA1 = /^(?:sha1:)?[0-9a-f]{40}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SOURCE_TYPES = new Set(['TABLE', 'RULE', 'CURVE', 'EQUATION', 'PROJECT_EVIDENCE']);
const MASTER_FIELDS = new Set([
  'schema', 'masterId', 'methodId', 'edition', 'revision', 'authorityClass', 'source',
  'dataSchema', 'data', 'applicability', 'publicationState', 'contentHash',
]);
const SOURCE_FIELDS = new Set(['repository', 'commit', 'path', 'gitBlobSha1', 'sizeBytes', 'locator']);
const LOCATOR_FIELDS = new Set(['sourceType', 'identifier', 'section', 'printedPage', 'pdfPage']);

function assertKnownFields(value, allowed, code) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new TypeError(`${code}: ${key}`);
}

function requireText(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(code);
  return value.trim();
}

function normalizeBlobSha(value) {
  const text = requireText(value, 'VIBRATION_MASTER_SOURCE_BLOB_REQUIRED');
  if (!SHA1.test(text)) throw new TypeError('VIBRATION_MASTER_SOURCE_BLOB_INVALID');
  return text.startsWith('sha1:') ? text : `sha1:${text}`;
}

function normalizePage(value, code) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1) throw new TypeError(code);
  return value;
}

function normalizeLocator(locator) {
  if (!locator || typeof locator !== 'object' || Array.isArray(locator)) {
    throw new TypeError('VIBRATION_MASTER_SOURCE_LOCATOR_REQUIRED');
  }
  assertKnownFields(locator, LOCATOR_FIELDS, 'VIBRATION_MASTER_SOURCE_LOCATOR_FIELD_UNKNOWN');
  const sourceType = requireText(locator.sourceType, 'VIBRATION_MASTER_SOURCE_TYPE_REQUIRED');
  if (!SOURCE_TYPES.has(sourceType)) throw new TypeError('VIBRATION_MASTER_SOURCE_TYPE_INVALID');
  return {
    sourceType,
    identifier: requireText(locator.identifier, 'VIBRATION_MASTER_SOURCE_IDENTIFIER_REQUIRED'),
    ...(locator.section ? { section: String(locator.section).trim() } : {}),
    ...(locator.printedPage !== undefined
      ? { printedPage: normalizePage(locator.printedPage, 'VIBRATION_MASTER_SOURCE_PRINTED_PAGE_INVALID') } : {}),
    ...(locator.pdfPage !== undefined
      ? { pdfPage: normalizePage(locator.pdfPage, 'VIBRATION_MASTER_SOURCE_PDF_PAGE_INVALID') } : {}),
  };
}

function normalizeSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('VIBRATION_MASTER_SOURCE_REQUIRED');
  }
  assertKnownFields(source, SOURCE_FIELDS, 'VIBRATION_MASTER_SOURCE_FIELD_UNKNOWN');
  const commit = requireText(source.commit, 'VIBRATION_MASTER_SOURCE_COMMIT_REQUIRED');
  if (!/^[0-9a-f]{40}$/u.test(commit)) throw new TypeError('VIBRATION_MASTER_SOURCE_COMMIT_INVALID');
  if (!Number.isInteger(source.sizeBytes) || source.sizeBytes < 1) {
    throw new TypeError('VIBRATION_MASTER_SOURCE_SIZE_INVALID');
  }
  return {
    repository: requireText(source.repository, 'VIBRATION_MASTER_SOURCE_REPOSITORY_REQUIRED'),
    commit,
    path: requireText(source.path, 'VIBRATION_MASTER_SOURCE_PATH_REQUIRED'),
    gitBlobSha1: normalizeBlobSha(source.gitBlobSha1),
    sizeBytes: source.sizeBytes,
    locator: normalizeLocator(source.locator),
  };
}

function normalizeMaster(master) {
  if (!master || typeof master !== 'object' || Array.isArray(master)) {
    throw new TypeError('VIBRATION_MASTER_OBJECT_REQUIRED');
  }
  assertKnownFields(master, MASTER_FIELDS, 'VIBRATION_MASTER_FIELD_UNKNOWN');
  if (master.schema !== 'VibrationMaster.v1') throw new TypeError('VIBRATION_MASTER_SCHEMA_INVALID');
  if (!VIBRATION_MASTER_PUBLICATION_STATES.includes(master.publicationState)) {
    throw new TypeError('VIBRATION_MASTER_PUBLICATION_STATE_INVALID');
  }
  if (!VIBRATION_MASTER_AUTHORITY_CLASSES.includes(master.authorityClass)) {
    throw new TypeError('VIBRATION_MASTER_AUTHORITY_CLASS_INVALID');
  }
  const normalized = {
    schema: master.schema,
    masterId: requireText(master.masterId, 'VIBRATION_MASTER_ID_REQUIRED'),
    methodId: requireText(master.methodId, 'VIBRATION_MASTER_METHOD_ID_REQUIRED'),
    edition: requireText(master.edition, 'VIBRATION_MASTER_EDITION_REQUIRED'),
    revision: requireText(master.revision, 'VIBRATION_MASTER_REVISION_REQUIRED'),
    authorityClass: master.authorityClass,
    source: normalizeSource(master.source),
    dataSchema: requireText(master.dataSchema, 'VIBRATION_MASTER_DATA_SCHEMA_REQUIRED'),
    data: master.data,
    publicationState: master.publicationState,
  };
  if (master.applicability !== undefined) normalized.applicability = master.applicability;
  stableVibrationMasterJson(normalized.data);
  if (normalized.applicability !== undefined) stableVibrationMasterJson(normalized.applicability);
  return normalized;
}

export async function sealVibrationMaster(master) {
  const normalized = normalizeMaster(master);
  const contentHash = await hashVibrationMasterContent(normalized);
  if (master.contentHash !== undefined) {
    if (!SHA256.test(String(master.contentHash))) throw new TypeError('VIBRATION_MASTER_CONTENT_HASH_INVALID');
    if (master.contentHash !== contentHash) throw new Error('VIBRATION_MASTER_CONTENT_HASH_MISMATCH');
  }
  return deepFreezeVibrationMaster({ ...normalized, contentHash });
}

export async function validateVibrationMaster(master) {
  return sealVibrationMaster(master);
}