/**
 * Validates immutable source-to-history coordinate registrations.
 * Transform matrices are row-major affine 4x4 values mapping source-frame
 * coordinates into target-frame units. Hashes cover the normalized registration,
 * including approved anchors, residual evidence and historical positions.
 */
import { computeSemanticHash, deepFreeze } from '../../contracts/topo-enriched-xml/contract-core.js';

const HASH_RE = /^sha256:[a-f0-9]{64}$/;
const LAST_ROW = [0, 0, 0, 1];

export async function validateCoordinateRegistrationAuthority(input) {
  const root = authorityRoot(input);
  const requiredRefs = registryReferences(input.previousRegistry);
  const rows = await Promise.all(asArray(input.coordinateRegistrations)
    .map((artifact) => inspectRegistration(artifact, root, requiredRefs, input.policy)));
  const duplicateRefs = duplicateValues(rows.map((row) => row.registrationId));
  const issues = rows.flatMap((row) => row.issues);
  for (const registrationId of duplicateRefs) issues.push(issue(
    'COORDINATE_REGISTRATION_ROOT_MISMATCH', { registrationId, reason: 'DUPLICATE_REGISTRATION_ID' },
  ));
  for (const registrationId of requiredRefs) {
    if (!rows.some((row) => row.registrationId === registrationId)) issues.push(issue(
      'COORDINATE_REGISTRATION_REFERENCE_MISSING', { registrationId },
    ));
  }
  const byRef = new Map();
  for (const row of rows) {
    if (!row.blocked && !duplicateRefs.has(row.registrationId)) byRef.set(row.registrationId, row);
  }
  return Object.freeze({
    root: deepFreeze(root),
    registrations: deepFreeze(rows.sort(compareRegistration)),
    issues: deepFreeze(sortIssues(issues)),
    lookup: (registrationId) => byRef.get(clean(registrationId)) || null,
  });
}

export function transformRegisteredPosition(registration, position, scale) {
  const source = vector(position);
  if (!source) return null;
  const matrix = registration.registration.transform.matrix;
  const values = [source.x, source.y, source.z, 1].map(Number);
  const transformed = [0, 1, 2].map((row) => matrix.slice(row * 4, row * 4 + 4)
    .reduce((sum, value, column) => sum + value * values[column], 0));
  if (!transformed.every(Number.isFinite)) return null;
  return Object.freeze({
    x: quantize(transformed[0], scale),
    y: quantize(transformed[1], scale),
    z: quantize(transformed[2], scale),
    coordinateScale: scale,
  });
}

export function historicalRegisteredPositions(registration) {
  return registration.registration.historyPositions;
}

async function inspectRegistration(artifact, root, requiredRefs, policy = {}) {
  const registration = normalizeRegistration(artifact);
  const registrationId = registration.registrationId;
  const issues = validateRegistration(registration, artifact, root, requiredRefs, policy);
  const actualHash = await computeSemanticHash({ registration }, 'coordinateRegistrationHash');
  const suppliedHash = clean(artifact?.coordinateRegistrationHash);
  if (!HASH_RE.test(suppliedHash) || suppliedHash !== actualHash) issues.push(issue(
    'COORDINATE_REGISTRATION_HASH_MISMATCH', { registrationId, expected: suppliedHash, actual: actualHash },
  ));
  const blockers = issues.filter((row) => row.severity === 'BLOCKER');
  return deepFreeze({
    registrationId,
    coordinateRegistrationHash: actualHash,
    suppliedCoordinateRegistrationHash: suppliedHash,
    registration,
    issues: sortIssues(issues),
    blocked: blockers.length > 0,
  });
}

function validateRegistration(registration, artifact, root, requiredRefs, policy) {
  const issues = [];
  required(registration.registrationId, 'COORDINATE_REGISTRATION_REFERENCE_MISSING', issues);
  compare(registration.projectId, root.projectId, 'COORDINATE_REGISTRATION_ROOT_MISMATCH', issues, 'projectId');
  compare(registration.zoneId, root.zoneId, 'COORDINATE_REGISTRATION_ROOT_MISMATCH', issues, 'zoneId');
  compare(registration.sourceCoordinateFrameId, root.coordinateFrameId, 'COORDINATE_FRAME_MISMATCH', issues, 'sourceCoordinateFrameId');
  compare(registration.baseRegistrySnapshotHash, root.baseRegistrySnapshotHash,
    'COORDINATE_REGISTRATION_ROOT_MISMATCH', issues, 'baseRegistrySnapshotHash');
  if (!registration.targetCoordinateFrameId) issues.push(issue('COORDINATE_FRAME_MISMATCH', {
    registrationId: registration.registrationId, field: 'targetCoordinateFrameId', actual: '',
  }));
  if (requiredRefs.size && !requiredRefs.has(registration.registrationId)) issues.push(review(
    'COORDINATE_REGISTRATION_ROOT_MISMATCH', { registrationId: registration.registrationId, reason: 'UNREFERENCED_REGISTRATION' },
  ));
  validateStatus(artifact?.validation, registration.registrationId, issues);
  validateTransform(registration.transform, registration.registrationId, policy, issues);
  validateAnchors(registration.anchors, registration.registrationId, policy, issues);
  validateResidual(registration.residual, registration.registrationId, policy, issues);
  validateVersions(registration, policy, issues);
  return issues;
}

function validateTransform(transform, registrationId, policy, issues) {
  const matrix = transform.matrix;
  if (matrix.length !== 16 || !matrix.every(Number.isFinite)) {
    issues.push(issue('REGISTERED_POSITION_INVALID', { registrationId, reason: 'TRANSFORM_NOT_FINITE_4X4' }));
    return;
  }
  if (!LAST_ROW.every((value, index) => matrix[index + 12] === value)) issues.push(issue(
    'REGISTERED_POSITION_INVALID', { registrationId, reason: 'TRANSFORM_NOT_AFFINE' },
  ));
  if (!transform.sourceUnit || !transform.targetUnit) issues.push(issue(
    'COORDINATE_REGISTRATION_ROOT_MISMATCH', { registrationId, reason: 'TRANSFORM_UNITS_MISSING' },
  ));
  const allowed = new Set(asArray(policy?.registration?.allowedUnits).map(clean));
  if (allowed.size && (!allowed.has(transform.sourceUnit) || !allowed.has(transform.targetUnit))) issues.push(issue(
    'COORDINATE_REGISTRATION_ROOT_MISMATCH', { registrationId, reason: 'TRANSFORM_UNIT_NOT_APPROVED', sourceUnit: transform.sourceUnit, targetUnit: transform.targetUnit },
  ));
}

function validateAnchors(anchors, registrationId, policy, issues) {
  const approved = anchors.filter((row) => row.approved && row.anchorId && row.sourceIdentity
    && row.targetIdentity && row.authority);
  const minimum = positiveInteger(policy?.registration?.minimumAnchors, 1);
  if (approved.length < minimum) issues.push(issue(
    'COORDINATE_REGISTRATION_ROOT_MISMATCH', {
      registrationId, reason: 'ANCHOR_EVIDENCE_INSUFFICIENT', approved: approved.length, minimum,
    },
  ));
}

function validateResidual(residual, registrationId, policy, issues) {
  if (![residual.rms, residual.maximum].every(Number.isFinite)) {
    issues.push(issue('COORDINATE_REGISTRATION_ROOT_MISMATCH', { registrationId, reason: 'RESIDUAL_INVALID' }));
    return;
  }
  const limit = number(policy?.registration?.maximumResidual);
  if (Number.isFinite(limit) && residual.maximum > limit) issues.push(issue(
    'COORDINATE_REGISTRATION_ROOT_MISMATCH', {
      registrationId, reason: 'RESIDUAL_EXCEEDS_POLICY', maximum: residual.maximum, limit,
    },
  ));
}

function validateVersions(registration, policy, issues) {
  const expectedPolicy = clean(policy?.registration?.policyVersion);
  const expectedConfig = clean(policy?.registration?.configVersion);
  if (expectedPolicy && registration.policyVersion !== expectedPolicy) issues.push(issue(
    'COORDINATE_REGISTRATION_ROOT_MISMATCH', { registrationId: registration.registrationId, field: 'policyVersion' },
  ));
  if (expectedConfig && registration.configVersion !== expectedConfig) issues.push(issue(
    'COORDINATE_REGISTRATION_ROOT_MISMATCH', { registrationId: registration.registrationId, field: 'configVersion' },
  ));
}

function validateStatus(validation, registrationId, issues) {
  if (clean(validation?.status) === 'PASS' && !asArray(validation?.blockers).length
    && !asArray(validation?.reviewItems).length) return;
  issues.push(issue('COORDINATE_REGISTRATION_NOT_PASS', {
    registrationId, status: clean(validation?.status) || 'MISSING',
  }));
}

function normalizeRegistration(artifact) {
  const source = artifact?.registration || artifact || {};
  return {
    registrationId: clean(first(source.registrationId, source.coordinateRegistrationId, artifact?.registrationId)),
    projectId: clean(source.projectId), zoneId: clean(source.zoneId),
    sourceCoordinateFrameId: clean(first(source.sourceCoordinateFrameId, source.sourceFrameId)),
    targetCoordinateFrameId: clean(first(source.targetCoordinateFrameId, source.targetFrameId)),
    transform: normalizeTransform(source),
    anchors: sortRows(asArray(source.anchors).map(normalizeAnchor), anchorKey),
    residual: normalizeResidual(source.residual),
    policyVersion: clean(source.policyVersion), configVersion: clean(source.configVersion),
    baseRegistrySnapshotHash: clean(first(source.baseRegistrySnapshotHash, source.registrySnapshotHash)),
    historyPositions: sortRows(asArray(source.historyPositions).map(normalizeHistoryPosition), historyPositionKey),
  };
}

function normalizeTransform(source) {
  const transform = source.transform || {};
  return {
    matrix: asArray(transform.matrix).map(Number),
    sourceUnit: clean(first(transform.sourceUnit, source.sourceUnit, source.units?.source)),
    targetUnit: clean(first(transform.targetUnit, source.targetUnit, source.units?.target)),
  };
}

function normalizeAnchor(row) {
  return {
    anchorId: clean(first(row?.anchorId, row?.evidenceId)),
    sourceIdentity: clean(row?.sourceIdentity), targetIdentity: clean(row?.targetIdentity),
    authority: clean(row?.authority), approved: row?.approved === true,
  };
}

function normalizeHistoryPosition(row) {
  return {
    historyNodeId: clean(row?.historyNodeId),
    position: plainVector(first(row?.position, row?.coordinates)),
    coordinateFrameId: clean(row?.coordinateFrameId),
    corroboration: normalizeRecord(row?.corroboration),
  };
}

function normalizeResidual(value) {
  return { rms: number(value?.rms), maximum: number(first(value?.maximum, value?.max)) };
}

function authorityRoot(input) {
  const exact = input.exactMatchResult || {}, inventory = input.sourceInventory || {};
  return {
    projectId: clean(exact.projectId), zoneId: clean(exact.zoneId),
    coordinateFrameId: clean(first(exact.coordinateFrameId, inventory.coordinateFrameId)),
    baseRegistrySnapshotHash: clean(exact.baseRegistrySnapshotHash),
  };
}

function registryReferences(registry) {
  const refs = new Set(asArray(registry?.zoneRegistry?.coordinateRegistrationRefs).map(clean).filter(Boolean));
  for (const line of asArray(registry?.lineHistories)) {
    const ref = clean(line?.coordinateRegistrationRef);
    if (ref) refs.add(ref);
  }
  return refs;
}

function vector(value) {
  if (!value || typeof value !== 'object') return null;
  const result = { x: number(value.x), y: number(value.y), z: number(value.z) };
  return Object.values(result).every(Number.isFinite) ? result : null;
}
function plainVector(value) { return vector(value) || { x: null, y: null, z: null }; }
function normalizeRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
}
function compare(actual, expected, code, issues, field) {
  if (!actual || actual !== expected) issues.push(issue(code, { field, expected, actual }));
}
function required(value, code, issues) { if (!clean(value)) issues.push(issue(code, {})); }
function issue(code, evidence) { return { code, severity: 'BLOCKER', evidence }; }
function review(code, evidence) { return { code, severity: 'REVIEW_REQUIRED', evidence }; }
function sortIssues(rows) { return [...rows].sort((a, b) => issueKey(a).localeCompare(issueKey(b))); }
function issueKey(row) { return `${row.severity}|${row.code}|${JSON.stringify(row.evidence)}`; }
function compareRegistration(a, b) { return a.registrationId.localeCompare(b.registrationId); }
function anchorKey(row) { return `${row.anchorId}|${row.sourceIdentity}|${row.targetIdentity}`; }
function historyPositionKey(row) { return row.historyNodeId; }
function sortRows(rows, key) { return [...rows].sort((a, b) => key(a).localeCompare(key(b))); }
function duplicateValues(values) { const seen = new Set(), duplicates = new Set(); for (const value of values.filter(Boolean)) { if (seen.has(value)) duplicates.add(value); seen.add(value); } return duplicates; }
function quantize(value, scale) { return Math.round(value * scale); }
function positiveInteger(value, fallback) { return Number.isInteger(value) && value > 0 ? value : fallback; }
function number(value) { const result = Number(value); return Number.isFinite(result) ? result : Number.NaN; }
function first(...values) { return values.find((value) => value !== undefined && value !== null && value !== ''); }
function clean(value) { return String(value ?? '').trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
