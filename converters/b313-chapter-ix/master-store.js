export const CHAPTER_IX_MASTER_STORE_VERSION = 'b313-ch9-master-store/v1';

export const CHAPTER_IX_MASTER_RECORD_STATES = Object.freeze([
  'SCHEMA_ONLY', 'SYNTHETIC_TEST', 'DRAFT', 'SOURCE_PENDING', 'TRANSCRIBED',
  'INDEPENDENTLY_CHECKED', 'QUALIFIED', 'RETIRED',
]);

export const CHAPTER_IX_MASTER_USE_AUTHORITIES = Object.freeze([
  'NONE', 'TEST_ONLY', 'ENGINEERING_SANDBOX', 'DESIGN_AUTHORITY',
]);

const COLLECTIONS = Object.freeze([
  'sources', 'materialAllowable', 'pipeProduct', 'pipeDimension', 'manufacturingTolerance',
]);

function text(value) {
  return String(value ?? '').trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function failure(code, message, details = {}) {
  return { ok: false, code, message, details, canUseForDesignAuthority: false };
}

function emptyCollections() {
  return Object.fromEntries(COLLECTIONS.map((name) => [name, []]));
}

function recordError(record, collection) {
  if (!text(record?.recordId)) return `${collection} recordId is required.`;
  if (!CHAPTER_IX_MASTER_RECORD_STATES.includes(record.recordState)) {
    return `${collection} ${record.recordId} has unsupported recordState.`;
  }
  if (!CHAPTER_IX_MASTER_USE_AUTHORITIES.includes(record.useAuthority)) {
    return `${collection} ${record.recordId} has unsupported useAuthority.`;
  }
  if (record.useAuthority === 'DESIGN_AUTHORITY') {
    return `${collection} ${record.recordId} exceeds the R1 authority ceiling.`;
  }
  return null;
}

function validateCollection(rows, collection) {
  if (!Array.isArray(rows)) return [`collections.${collection} must be an array.`];
  const errors = [];
  const ids = new Set();
  for (const record of rows) {
    const error = recordError(record, collection);
    if (error) errors.push(error);
    const id = text(record?.recordId);
    if (id && ids.has(id)) errors.push(`${collection} duplicate recordId: ${id}.`);
    if (id) ids.add(id);
  }
  return errors;
}

function validateQuarantine(rows) {
  if (!Array.isArray(rows)) return ['quarantine must be an array.'];
  const errors = [];
  for (const entry of rows) {
    if (!text(entry?.quarantineId)) errors.push('quarantineId is required.');
    if (!text(entry?.collection)) errors.push(`${entry?.quarantineId ?? 'quarantine'} collection is required.`);
    if (!Array.isArray(entry?.reasons) || !entry.reasons.length) {
      errors.push(`${entry?.quarantineId ?? 'quarantine'} requires reasons.`);
    }
    if (entry?.canUseForDesignAuthority !== false) {
      errors.push(`${entry?.quarantineId ?? 'quarantine'} must set canUseForDesignAuthority=false.`);
    }
  }
  return errors;
}

export function createChapterIxMasterStore({ metadata = {}, collections = {}, quarantine = [] } = {}) {
  return {
    schemaVersion: CHAPTER_IX_MASTER_STORE_VERSION,
    authorityCeiling: 'ENGINEERING_SANDBOX',
    canUseForDesignAuthority: false,
    metadata: clone(metadata),
    collections: {
      ...emptyCollections(),
      ...Object.fromEntries(COLLECTIONS.map((name) => [name, clone(collections[name] ?? [])])),
    },
    quarantine: clone(quarantine),
  };
}

export function validateChapterIxMasterStore(store = {}) {
  const errors = [];
  if (store.schemaVersion !== CHAPTER_IX_MASTER_STORE_VERSION) {
    errors.push('Unsupported or missing Chapter IX master-store schemaVersion.');
  }
  if (store.authorityCeiling !== 'ENGINEERING_SANDBOX') {
    errors.push('R1 master-store authorityCeiling must be ENGINEERING_SANDBOX.');
  }
  if (store.canUseForDesignAuthority !== false) {
    errors.push('R1 master store must set canUseForDesignAuthority=false.');
  }
  for (const collection of COLLECTIONS) {
    errors.push(...validateCollection(store.collections?.[collection], collection));
  }
  errors.push(...validateQuarantine(store.quarantine));
  return { ok: errors.length === 0, errors };
}

function projectedRecord(record) {
  const { recordId, recordState, useAuthority, migrationIssues, ...payload } = record;
  return { ...clone(payload), qualificationState: recordState };
}

export function projectChapterIxResolverMasters(store = {}) {
  const validation = validateChapterIxMasterStore(store);
  if (!validation.ok) {
    return failure('MASTER_STORE_INVALID', validation.errors[0], { errors: validation.errors });
  }
  const projected = {};
  for (const collection of COLLECTIONS) {
    projected[collection] = store.collections[collection]
      .filter((record) => record.recordState !== 'RETIRED')
      .map(projectedRecord);
  }
  return {
    ok: true,
    masters: {
      sources: projected.sources,
      materialAllowable: projected.materialAllowable,
      pipeProduct: projected.pipeProduct,
      pipeDimension: projected.pipeDimension,
      manufacturingTolerance: projected.manufacturingTolerance,
    },
    quarantineCount: store.quarantine.length,
    canUseForDesignAuthority: false,
  };
}

export function summarizeChapterIxMasterStore(store = {}) {
  const validation = validateChapterIxMasterStore(store);
  if (!validation.ok) return failure('MASTER_STORE_INVALID', validation.errors[0]);
  return {
    ok: true,
    collections: Object.fromEntries(COLLECTIONS.map((name) => [name, store.collections[name].length])),
    quarantineCount: store.quarantine.length,
    canUseForDesignAuthority: false,
  };
}
