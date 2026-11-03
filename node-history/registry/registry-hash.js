import {
  canonicalSemanticJson,
  computeSemanticHash,
  isRecord,
  text,
} from '../../contracts/topo-enriched-xml/contract-core.js';
import {
  LINE_HISTORY_SCHEMA,
  REGISTRY_PATCH_SCHEMA,
  SNAPSHOT_MANIFEST_SCHEMA,
  ZONE_REGISTRY_SCHEMA,
  buildValidation,
  freezeArtifact,
  issue,
} from './registry-contracts.js';

export async function computeZoneRegistryHash(registry) {
  return sha256Canonical(normalizeZoneRegistrySemantic(registry));
}

export async function computeLineHistoryHash(history) {
  return sha256Canonical(normalizeLineHistorySemantic(history));
}

export async function computeRegistrySnapshotHash(manifest) {
  return computeSemanticHash(normalizeManifestForHash(manifest), 'baseRegistrySnapshotHash');
}

export async function computeProposedRegistryHash(patch) {
  return computeSemanticHash(patch, 'proposedRegistryHash');
}

export async function buildRegistrySnapshotManifest({
  zoneRegistry,
  lineHistories,
  pathsByMainLine = {},
}) {
  const blockers = [];
  const histories = Array.isArray(lineHistories) ? lineHistories : [];
  const zoneRegistryHash = await computeZoneRegistryHash(zoneRegistry || {});
  if (text(zoneRegistry?.zoneRegistryHash) !== zoneRegistryHash) {
    blockers.push(issue('ZONE_REGISTRY_HASH_MISMATCH', {
      expected: text(zoneRegistry?.zoneRegistryHash), actual: zoneRegistryHash,
    }));
  }
  const referencesByLine = groupBy(zoneRegistry?.lineHistoryRefs, (row) => text(row?.mainLineKey));
  const historiesByLine = groupBy(histories, (row) => text(row?.mainLineKey));
  validateManifestInputCoverage(referencesByLine, historiesByLine, blockers);
  const lineReferences = [];
  for (const history of histories) {
    const mainLineKey = text(history?.mainLineKey);
    const actual = await computeLineHistoryHash(history || {});
    if (text(history?.lineHistoryHash) !== actual) {
      blockers.push(issue('LINE_HISTORY_HASH_MISMATCH', {
        mainLineKey, expected: text(history?.lineHistoryHash), actual,
      }));
    }
    const registryReference = (referencesByLine.get(mainLineKey) || [])[0];
    const configuredPath = text(pathsByMainLine?.[mainLineKey]);
    const registryPath = text(registryReference?.path);
    if (configuredPath && registryPath && configuredPath !== registryPath) blockers.push(issue('SNAPSHOT_LINE_PATH_MISMATCH', {
      mainLineKey, expected: registryPath, actual: configuredPath,
    }));
    if (registryReference && text(registryReference.lineHistoryHash) !== actual) blockers.push(issue('LINE_HISTORY_REFERENCE_HASH_MISMATCH', {
      mainLineKey, expected: actual, actual: text(registryReference.lineHistoryHash),
    }));
    lineReferences.push({
      mainLineKey,
      path: registryPath || configuredPath || defaultHistoryPath(mainLineKey),
      lineHistoryHash: actual,
    });
  }
  const semantic = {
    schema: SNAPSHOT_MANIFEST_SCHEMA,
    projectId: text(zoneRegistry?.projectId),
    zoneId: text(zoneRegistry?.zoneId),
    schemaVersions: {
      zoneRegistry: ZONE_REGISTRY_SCHEMA,
      lineHistory: LINE_HISTORY_SCHEMA,
      registryPatch: REGISTRY_PATCH_SCHEMA,
      snapshotManifest: SNAPSHOT_MANIFEST_SCHEMA,
    },
    policy: {
      registryVersion: text(zoneRegistry?.registryVersion),
      allocationPolicyVersion: text(zoneRegistry?.policyVersion),
      registryConfigVersion: text(zoneRegistry?.configVersion),
    },
    pool: {
      ...normalizeZoneRegistrySemantic(zoneRegistry || {}),
      zoneRegistryHash,
    },
    lineHistories: sortRows(lineReferences, lineReferenceKey),
  };
  const candidate = {
    ...semantic,
    validation: buildValidation(blockers),
    registrySnapshotHash: await computeSemanticHash(semantic, 'baseRegistrySnapshotHash'),
  };
  return freezeArtifact(candidate);
}

export function normalizeZoneRegistrySemantic(registry) {
  return {
    schema: ZONE_REGISTRY_SCHEMA,
    registryVersion: text(registry?.registryVersion),
    projectId: text(registry?.projectId),
    zoneId: text(registry?.zoneId),
    policyVersion: text(registry?.policyVersion),
    configVersion: text(registry?.configVersion),
    namespace: normalizeRecord(registry?.namespace),
    leases: sortRows((registry?.leases || []).map(normalizeLease), leaseKey),
    lineHistoryRefs: sortRows((registry?.lineHistoryRefs || []).map(normalizeLineReference), lineReferenceKey),
    coordinateRegistrationRefs: [...(registry?.coordinateRegistrationRefs || [])].map(text).filter(Boolean).sort(),
  };
}

export function normalizeLineHistorySemantic(history) {
  return {
    schema: LINE_HISTORY_SCHEMA,
    registryVersion: text(history?.registryVersion),
    projectId: text(history?.projectId),
    zoneId: text(history?.zoneId),
    mainLineKey: text(history?.mainLineKey),
    coordinateRegistrationRef: text(history?.coordinateRegistrationRef) || null,
    historyNodes: sortRows((history?.historyNodes || []).map(normalizeHistoryNode), historyNodeKey),
  };
}

export function normalizeManifestForHash(manifest) {
  return {
    schemaVersions: normalizeRecord(manifest?.schemaVersions),
    policy: normalizeRecord(manifest?.policy),
    pool: normalizePool(manifest?.pool),
    lineHistories: sortRows((manifest?.lineHistories || []).map(normalizeLineReference), lineReferenceKey),
  };
}

export function normalizePatchOperation(operation) {
  const result = normalizeRecord(operation);
  if (Array.isArray(result.sourceAliases)) result.sourceAliases = [...result.sourceAliases].map(text).sort();
  return result;
}

async function sha256Canonical(value) {
  const bytes = new TextEncoder().encode(canonicalSemanticJson(value));
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is required.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}

function validateManifestInputCoverage(references, histories, blockers) {
  for (const [mainLineKey, rows] of histories) {
    if (rows.length > 1) blockers.push(issue('DUPLICATE_LINE_HISTORY', { mainLineKey }));
    const refs = references.get(mainLineKey) || [];
    if (!refs.length) blockers.push(issue('LINE_HISTORY_REFERENCE_MISSING', { mainLineKey }));
    if (refs.length > 1) blockers.push(issue('DUPLICATE_LINE_HISTORY_REFERENCE', { mainLineKey }));
  }
  for (const [mainLineKey, refs] of references) {
    if (!histories.has(mainLineKey)) blockers.push(issue('LINE_HISTORY_REFERENCE_UNPLANNED', { mainLineKey }));
    if (refs.length > 1) blockers.push(issue('DUPLICATE_LINE_HISTORY_REFERENCE', { mainLineKey }));
  }
}

function normalizePool(pool) {
  if (!isRecord(pool)) return {};
  const normalized = normalizeZoneRegistrySemantic(pool);
  return { ...normalized, zoneRegistryHash: text(pool.zoneRegistryHash) };
}

function normalizeLease(lease) {
  return {
    leaseId: text(lease?.leaseId),
    mainLineKey: text(lease?.mainLineKey),
    status: text(lease?.status),
    ranges: sortRows((lease?.ranges || []).map(normalizeRange), rangeKey),
    firstObservedRevision: text(lease?.firstObservedRevision),
    lastObservedRevision: text(lease?.lastObservedRevision),
    evidence: normalizeRecord(lease?.evidence),
  };
}

function normalizeRange(range) {
  return { start: range?.start, end: range?.end, step: range?.step };
}

function normalizeLineReference(reference) {
  return {
    mainLineKey: text(reference?.mainLineKey),
    path: text(reference?.path),
    lineHistoryHash: text(reference?.lineHistoryHash),
  };
}

function normalizeHistoryNode(node) {
  return {
    historyNodeId: text(node?.historyNodeId),
    engineeringNodeNumber: node?.engineeringNodeNumber,
    lifecycleStatus: text(node?.lifecycleStatus),
    sourceAliases: [...(node?.sourceAliases || [])].map(text).filter(Boolean).sort(),
    identityEvidence: sortRows((node?.identityEvidence || []).map(normalizeRecord), canonicalRowKey),
    immutableFacts: normalizeRecord(node?.immutableFacts),
    firstObservedRevision: text(node?.firstObservedRevision),
    lastObservedRevision: text(node?.lastObservedRevision),
    retirementEvidence: normalizeOptionalRecord(node?.retirementEvidence),
    reactivationEvidence: normalizeOptionalRecord(node?.reactivationEvidence),
    supersessionEvidence: normalizeOptionalRecord(node?.supersessionEvidence),
    supersededByHistoryNodeId: text(node?.supersededByHistoryNodeId) || null,
  };
}

function normalizeRecord(value) {
  if (!isRecord(value)) return {};
  const output = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    output[key] = Array.isArray(child)
      ? child.map((item) => isRecord(item) ? normalizeRecord(item) : item)
      : (isRecord(child) ? normalizeRecord(child) : child);
  }
  return output;
}

function normalizeOptionalRecord(value) {
  return isRecord(value) ? normalizeRecord(value) : null;
}

function sortRows(rows, key) {
  return [...rows].sort((a, b) => key(a).localeCompare(key(b)));
}

function groupBy(rows, keyFn) {
  const result = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = keyFn(row);
    const group = result.get(key) || [];
    group.push(row);
    result.set(key, group);
  }
  return result;
}

function leaseKey(row) { return `${text(row.mainLineKey)}|${text(row.leaseId)}`; }
function lineReferenceKey(row) { return `${text(row.mainLineKey)}|${text(row.path)}`; }
function historyNodeKey(row) { return `${String(row.engineeringNodeNumber).padStart(16, '0')}|${text(row.historyNodeId)}`; }
function rangeKey(row) { return `${String(row.start).padStart(16, '0')}|${String(row.end).padStart(16, '0')}|${String(row.step).padStart(8, '0')}`; }
function canonicalRowKey(row) { return canonicalSemanticJson(row); }
function defaultHistoryPath(mainLineKey) {
  return `node-history/registry/lines/${text(mainLineKey).replace(/^\//, '').replace(/\//g, '__')}.json`;
}
