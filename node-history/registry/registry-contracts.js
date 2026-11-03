import { deepFreeze, isRecord, text } from '../../contracts/topo-enriched-xml/contract-core.js';

export const ZONE_REGISTRY_SCHEMA = 'PsiNodeZoneRegistry.v1';
export const LINE_HISTORY_SCHEMA = 'PsiNodeLineHistory.v1';
export const SNAPSHOT_MANIFEST_SCHEMA = 'RegistrySnapshotManifest.v1';
export const REGISTRY_PATCH_SCHEMA = 'TopoNodeRegistryPatch.v1';
export const REGISTRY_VERSION = '1.0.0';

export const LIFECYCLE_STATES = Object.freeze([
  'ACTIVE', 'RETIRED', 'REACTIVATED', 'SUPERSEDED', 'REVIEW_REQUIRED',
]);
export const COVERAGE_SCOPES = Object.freeze(['FULL_ZONE', 'FULL_LINE', 'PARTIAL_LINE']);
export const PATCH_OPERATION_TYPES = Object.freeze([
  'ADD_LEASE', 'UPDATE_LEASE', 'ADD_NODE', 'RETIRE_NODE', 'REACTIVATE_NODE',
  'SUPERSEDE_NODE', 'MARK_REVIEW_REQUIRED', 'ACTIVATE_NODE', 'UPDATE_ALIAS',
]);

const STATUS_VALUES = new Set(['PASS', 'REVIEW_REQUIRED', 'BLOCKED']);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const MAIN_LINE_PATTERN = /^\/[A-Z0-9][A-Z0-9._-]*(?:\/[A-Z0-9][A-Z0-9._-]*)*$/;

export function validateZoneRegistryShape(value) {
  const errors = requiredObject(value, ZONE_REGISTRY_SCHEMA);
  if (errors.length) return errors;
  requiredTextFields(value, [
    'schema', 'registryVersion', 'projectId', 'zoneId', 'policyVersion',
    'configVersion', 'zoneRegistryHash',
  ], ZONE_REGISTRY_SCHEMA, errors);
  exact(value.schema, ZONE_REGISTRY_SCHEMA, 'schema', errors);
  exact(value.registryVersion, REGISTRY_VERSION, 'registryVersion', errors);
  requireArray(value.leases, 'leases', errors);
  requireArray(value.lineHistoryRefs, 'lineHistoryRefs', errors);
  requireArray(value.coordinateRegistrationRefs, 'coordinateRegistrationRefs', errors, true);
  validateNamespace(value.namespace, errors);
  validateStatus(value.validation, errors);
  validateHash(value.zoneRegistryHash, 'zoneRegistryHash', errors);
  return errors;
}

export function validateLineHistoryShape(value) {
  const errors = requiredObject(value, LINE_HISTORY_SCHEMA);
  if (errors.length) return errors;
  requiredTextFields(value, [
    'schema', 'registryVersion', 'projectId', 'zoneId', 'mainLineKey', 'lineHistoryHash',
  ], LINE_HISTORY_SCHEMA, errors);
  exact(value.schema, LINE_HISTORY_SCHEMA, 'schema', errors);
  exact(value.registryVersion, REGISTRY_VERSION, 'registryVersion', errors);
  requireArray(value.historyNodes, 'historyNodes', errors);
  validateCanonicalMainLineKey(value.mainLineKey, 'mainLineKey', errors);
  validateStatus(value.validation, errors);
  validateHash(value.lineHistoryHash, 'lineHistoryHash', errors);
  return errors;
}

export function validateSnapshotManifestShape(value) {
  const errors = requiredObject(value, SNAPSHOT_MANIFEST_SCHEMA);
  if (errors.length) return errors;
  requiredTextFields(value, [
    'schema', 'projectId', 'zoneId', 'registrySnapshotHash',
  ], SNAPSHOT_MANIFEST_SCHEMA, errors);
  exact(value.schema, SNAPSHOT_MANIFEST_SCHEMA, 'schema', errors);
  requireRecord(value.schemaVersions, 'schemaVersions', errors);
  requireRecord(value.policy, 'policy', errors);
  requireRecord(value.pool, 'pool', errors);
  requireArray(value.lineHistories, 'lineHistories', errors);
  validateStatus(value.validation, errors);
  validateHash(value.registrySnapshotHash, 'registrySnapshotHash', errors);
  return errors;
}

export function validateCanonicalMainLineKey(value, field, errors) {
  const key = text(value);
  if (!MAIN_LINE_PATTERN.test(key)) errors.push(`${field} must be a canonical uppercase absolute main-line key.`);
}

export function isCanonicalMainLineKey(value) {
  return MAIN_LINE_PATTERN.test(text(value));
}

export function validateHash(value, field, errors) {
  if (!HASH_PATTERN.test(text(value))) errors.push(`${field} must use sha256:<64 lowercase hexadecimal characters>.`);
}

export function validateStatus(validation, errors) {
  if (!isRecord(validation)) {
    errors.push('validation must be an object.');
    return;
  }
  const status = text(validation.status);
  const blockers = Array.isArray(validation.blockers) ? validation.blockers : [];
  const reviewItems = Array.isArray(validation.reviewItems) ? validation.reviewItems : [];
  if (!STATUS_VALUES.has(status)) errors.push('validation.status is invalid.');
  if (!Array.isArray(validation.blockers)) errors.push('validation.blockers must be an array.');
  if (!Array.isArray(validation.reviewItems)) errors.push('validation.reviewItems must be an array.');
  if (!Array.isArray(validation.warnings)) errors.push('validation.warnings must be an array.');
  if (status === 'PASS' && (blockers.length || reviewItems.length)) errors.push('PASS validation cannot contain blockers or reviewItems.');
  if (status === 'REVIEW_REQUIRED' && (blockers.length || !reviewItems.length)) errors.push('REVIEW_REQUIRED requires reviewItems and no blockers.');
  if (status === 'BLOCKED' && !blockers.length) errors.push('BLOCKED validation requires blockers.');
}

export function buildValidation(blockers = [], reviewItems = [], warnings = []) {
  const uniqueBlockers = deduplicateIssues(blockers);
  const uniqueReviews = deduplicateIssues(reviewItems);
  return deepFreeze({
    status: uniqueBlockers.length ? 'BLOCKED' : (uniqueReviews.length ? 'REVIEW_REQUIRED' : 'PASS'),
    blockers: uniqueBlockers,
    reviewItems: uniqueReviews,
    warnings: deduplicateIssues(warnings),
  });
}

export function issue(code, evidence = {}) {
  return { code, evidence };
}

export function deduplicateIssues(items) {
  const byKey = new Map();
  for (const item of items || []) {
    const normalized = isRecord(item) ? item : issue('UNSTRUCTURED_EVIDENCE', { value: item });
    const key = issueKey(normalized);
    if (!byKey.has(key)) byKey.set(key, normalized);
  }
  return [...byKey.values()].sort((a, b) => issueKey(a).localeCompare(issueKey(b)));
}

export function freezeArtifact(value) {
  return deepFreeze(structuredClone(value));
}

function validateNamespace(namespace, errors) {
  if (!isRecord(namespace)) {
    errors.push('namespace must be an object.');
    return;
  }
  for (const field of ['minimum', 'maximum', 'defaultStep']) {
    if (!Number.isInteger(namespace[field]) || namespace[field] < 0) errors.push(`namespace.${field} must be a non-negative integer.`);
  }
  if (Number.isInteger(namespace.minimum) && Number.isInteger(namespace.maximum)
    && namespace.minimum > namespace.maximum) errors.push('namespace.minimum must not exceed namespace.maximum.');
  if (namespace.defaultStep === 0) errors.push('namespace.defaultStep must be greater than zero.');
}

function requiredObject(value, owner) {
  return isRecord(value) ? [] : [`${owner} must be an object.`];
}

function requiredTextFields(value, fields, owner, errors) {
  for (const field of fields) if (!text(value[field])) errors.push(`${owner}.${field} is required.`);
}

function exact(actual, expected, field, errors) {
  if (actual !== expected) errors.push(`${field} must equal ${expected}.`);
}

function requireArray(value, field, errors, optional = false) {
  if (optional && value === undefined) return;
  if (!Array.isArray(value)) errors.push(`${field} must be an array.`);
}

function requireRecord(value, field, errors) {
  if (!isRecord(value)) errors.push(`${field} must be an object.`);
}

function issueKey(value) {
  return `${text(value.code)}|${stableEvidence(value.evidence)}`;
}

function stableEvidence(value) {
  if (Array.isArray(value)) return `[${value.map(stableEvidence).join(',')}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableEvidence(value[key])}`).join(',')}}`;
}
