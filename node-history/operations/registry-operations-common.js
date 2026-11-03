import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  canonicalSemanticJson,
  deepFreeze,
  text,
} from '../../contracts/topo-enriched-xml/contract-core.js';
import { buildValidation, issue } from '../registry/registry-contracts.js';

export const PUBLICATION_RESULT_SCHEMA = 'TopoRegistryPublicationResult.v1';
export const PUBLICATION_PACKAGE_SCHEMA = 'TopoRegistryPublicationPackage.v1';
export const RECOVERY_MANIFEST_SCHEMA = 'TopoRegistryRecoveryManifest.v1';
export const TARGET_MANIFEST_SCHEMA = 'TopoRegistryPublicationTargetManifest.v1';

const FILE_ROLES = new Set(['ZONE_REGISTRY', 'LINE_HISTORY', 'REGISTRY_MANIFEST']);
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;

export function canonicalBytes(value) {
  return Buffer.from(`${canonicalSemanticJson(value, { excludedKeys: [] })}\n`, 'utf8');
}

export function hashBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function hashCanonical(value) {
  return hashBytes(Buffer.from(canonicalSemanticJson(value), 'utf8'));
}

export function normalizeTargetManifest(raw) {
  const blockers = [];
  const registryRootPath = safeRelativePath(raw?.registryRootPath, 'registryRootPath', blockers);
  const temporaryRoot = absolutePath(raw?.temporaryRoot, 'temporaryRoot', blockers);
  const rollbackProofRoot = absolutePath(raw?.rollbackProofRoot, 'rollbackProofRoot', blockers);
  const files = normalizeTargetFiles(raw?.files, registryRootPath, blockers);
  validateTargetRoles(files, blockers);
  validateTemporaryRoots(temporaryRoot, rollbackProofRoot, blockers);
  const semantic = { schema: TARGET_MANIFEST_SCHEMA, registryRootPath, files };
  const targetManifestHash = hashCanonical(semantic);
  return deepFreeze({ ...semantic, temporaryRoot, rollbackProofRoot, targetManifestHash, blockers: sortIssues(blockers) });
}

export function validateCommit(value, field, blockers) {
  const commit = text(value);
  if (!COMMIT_PATTERN.test(commit)) blockers.push(issue('REGISTRY_PUBLICATION_COMMIT_INVALID', { field, value: commit }));
  return commit;
}

export function validateEvaluatedAt(value, blockers) {
  const raw = text(value);
  const valid = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)
    && !Number.isNaN(Date.parse(raw));
  if (!valid) blockers.push(issue('REGISTRY_PUBLICATION_EVALUATED_AT_INVALID', { evaluatedAt: raw }));
  return raw;
}

export function immutableResult(value) {
  return deepFreeze(structuredClone(value));
}

export function validationFrom(blockers) {
  return buildValidation(sortIssues(blockers));
}

export function compareCanonical(left, right) {
  return canonicalSemanticJson(left, { excludedKeys: [] }) === canonicalSemanticJson(right, { excludedKeys: [] });
}

export function assertArtifactsUnchanged(before, after) {
  if (!compareCanonical(before, after)) throw new Error('Registry publication mutated an input artifact.');
}

export function issueSortKey(row) {
  return `${text(row?.code)}|${canonicalSemanticJson(row?.evidence || {})}`;
}

export function sortIssues(rows) {
  return [...rows].sort((a, b) => issueSortKey(a).localeCompare(issueSortKey(b)));
}

export function pathsOverlap(left, right) {
  const first = path.resolve(left), second = path.resolve(right);
  return second === first || second.startsWith(`${first}${path.sep}`) || first.startsWith(`${second}${path.sep}`);
}

function normalizeTargetFiles(rows, registryRootPath, blockers) {
  if (!Array.isArray(rows)) {
    blockers.push(issue('TARGET_MANIFEST_FILES_INVALID'));
    return [];
  }
  const result = rows.map((row, index) => normalizeTargetFile(row, index, registryRootPath, blockers));
  validatePathClaims(result, blockers);
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

function normalizeTargetFile(row, index, registryRootPath, blockers) {
  const role = text(row?.role);
  const filePath = safeRelativePath(row?.path, `files[${index}].path`, blockers);
  if (!FILE_ROLES.has(role)) blockers.push(issue('TARGET_MANIFEST_ROLE_INVALID', { index, role }));
  if (registryRootPath && filePath && !withinRoot(filePath, registryRootPath)) {
    blockers.push(issue('TARGET_PATH_OUTSIDE_REGISTRY_ROOT', { path: filePath, registryRootPath }));
  }
  const mainLineKey = role === 'LINE_HISTORY' ? text(row?.mainLineKey) : '';
  if (role === 'LINE_HISTORY' && !mainLineKey) blockers.push(issue('TARGET_LINE_IDENTITY_MISSING', { path: filePath }));
  return { role, path: filePath, ...(mainLineKey ? { mainLineKey } : {}) };
}

function validatePathClaims(files, blockers) {
  const exact = new Set(), folded = new Map();
  for (const row of files) {
    if (exact.has(row.path)) blockers.push(issue('DUPLICATE_TARGET_PATH', { path: row.path }));
    exact.add(row.path);
    const key = row.path.toLocaleLowerCase('en-US');
    if (folded.has(key) && folded.get(key) !== row.path) blockers.push(issue('TARGET_PATH_CASE_COLLISION', {
      first: folded.get(key), second: row.path,
    }));
    folded.set(key, row.path);
  }
}

function validateTargetRoles(files, blockers) {
  requireRoleCount(files, 'ZONE_REGISTRY', 1, blockers);
  requireRoleCount(files, 'REGISTRY_MANIFEST', 1, blockers);
  const lines = files.filter((row) => row.role === 'LINE_HISTORY');
  const identities = new Set();
  for (const row of lines) {
    if (identities.has(row.mainLineKey)) blockers.push(issue('DUPLICATE_TARGET_LINE_IDENTITY', { mainLineKey: row.mainLineKey }));
    identities.add(row.mainLineKey);
  }
}

function requireRoleCount(files, role, expected, blockers) {
  const count = files.filter((row) => row.role === role).length;
  if (count !== expected) blockers.push(issue('TARGET_MANIFEST_ROLE_CARDINALITY', { role, expected, actual: count }));
}

function safeRelativePath(value, field, blockers) {
  const raw = text(value);
  const invalid = !raw || raw.includes('\\') || raw.includes('\0') || path.posix.isAbsolute(raw)
    || path.win32.isAbsolute(raw) || path.posix.normalize(raw) !== raw
    || raw.split('/').some((segment) => !segment || segment === '.' || segment === '..');
  if (invalid) blockers.push(issue('TARGET_PATH_UNSAFE', { field, value: raw }));
  return invalid ? '' : raw;
}

function absolutePath(value, field, blockers) {
  const raw = text(value);
  if (!raw || !path.isAbsolute(raw)) blockers.push(issue('TEMPORARY_ROOT_INVALID', { field, value: raw }));
  return raw;
}

function validateTemporaryRoots(temporaryRoot, rollbackProofRoot, blockers) {
  if (temporaryRoot && rollbackProofRoot && pathsOverlap(temporaryRoot, rollbackProofRoot)) {
    blockers.push(issue('TEMPORARY_ROOT_COLLISION', { temporaryRoot, rollbackProofRoot }));
  }
}

function withinRoot(filePath, registryRootPath) {
  return filePath === registryRootPath || filePath.startsWith(`${registryRootPath}/`);
}
