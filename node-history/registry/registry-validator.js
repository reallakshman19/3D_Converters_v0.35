import { canonicalSemanticJson, deepFreeze, isRecord, text } from '../../contracts/topo-enriched-xml/contract-core.js';
import {
  LIFECYCLE_STATES,
  REGISTRY_VERSION,
  buildValidation,
  issue,
  isCanonicalMainLineKey,
  validateLineHistoryShape,
  validateSnapshotManifestShape,
  validateZoneRegistryShape,
} from './registry-contracts.js';
import { computeLineHistoryHash, computeZoneRegistryHash } from './registry-hash.js';
import {
  validateLineReferenceConsistency,
  validateManifestConsistency,
} from './registry-consistency.js';
import {
  ACTIVE_LIFECYCLE_STATES,
  validLifecycleEvidence,
  validateLifecycleChanges,
} from './registry-lifecycle.js';

export { validateLifecycleChanges };

export async function validateRegistrySnapshot({ zoneRegistry, lineHistories, manifest = null }) {
  const blockers = [];
  addShapeErrors(blockers, validateZoneRegistryShape(zoneRegistry), 'ZONE_REGISTRY_INVALID');
  const histories = Array.isArray(lineHistories) ? lineHistories : [];
  if (!Array.isArray(lineHistories)) blockers.push(issue('LINE_HISTORIES_INVALID'));
  for (const history of histories) addShapeErrors(blockers, validateLineHistoryShape(history), 'LINE_HISTORY_INVALID', {
    mainLineKey: text(history?.mainLineKey),
  });
  validateRegistryRoots(zoneRegistry, histories, blockers);
  validateLeases(zoneRegistry, blockers);
  validateHistorySet(zoneRegistry, histories, blockers);
  validateLineReferenceConsistency(zoneRegistry, histories, blockers);
  await validateArtifactHashes(zoneRegistry, histories, blockers);
  if (manifest) {
    addShapeErrors(blockers, validateSnapshotManifestShape(manifest), 'REGISTRY_SNAPSHOT_MANIFEST_INVALID');
    await validateManifestConsistency(zoneRegistry, histories, manifest, blockers);
  }
  return deepFreeze(buildValidation(blockers));
}

function validateRegistryRoots(registry, histories, blockers) {
  const projectId = text(registry?.projectId);
  const zoneId = text(registry?.zoneId);
  if (!projectId || !zoneId) blockers.push(issue('REGISTRY_ROOT_AUTHORITY_MISSING', { projectId, zoneId }));
  if (text(registry?.registryVersion) !== REGISTRY_VERSION) blockers.push(issue('UNSUPPORTED_REGISTRY_VERSION', {
    registryVersion: text(registry?.registryVersion),
  }));
  for (const history of histories) {
    for (const field of ['projectId', 'zoneId', 'registryVersion']) {
      if (text(history?.[field]) !== text(registry?.[field])) blockers.push(issue('REGISTRY_ROOT_CHAIN_MISMATCH', {
        mainLineKey: text(history?.mainLineKey), field,
        expected: text(registry?.[field]), actual: text(history?.[field]),
      }));
    }
  }
}

function validateLeases(registry, blockers) {
  const leases = Array.isArray(registry?.leases) ? registry.leases : [];
  const leaseIds = new Set();
  const ranges = [];
  const namespace = registry?.namespace || {};
  for (const lease of leases) {
    const leaseId = text(lease?.leaseId);
    const mainLineKey = text(lease?.mainLineKey);
    if (!leaseId || leaseIds.has(leaseId)) blockers.push(issue('DUPLICATE_RANGE_LEASE_ID', { leaseId }));
    leaseIds.add(leaseId);
    if (!isCanonicalMainLineKey(mainLineKey)) blockers.push(issue('MAIN_LINE_KEY_NONCANONICAL', { mainLineKey }));
    if (!['ACTIVE', 'RETIRED'].includes(text(lease?.status))) blockers.push(issue('RANGE_LEASE_STATUS_INVALID', { leaseId, status: lease?.status }));
    if (!Array.isArray(lease?.ranges) || !lease.ranges.length) blockers.push(issue('RANGE_LEASE_EMPTY', { leaseId }));
    if (!validLeaseEvidence(lease?.evidence)) blockers.push(issue('RANGE_LEASE_EVIDENCE_INVALID', { leaseId }));
    if (!text(lease?.firstObservedRevision) || !text(lease?.lastObservedRevision)) blockers.push(issue('RANGE_LEASE_REVISION_EVIDENCE_MISSING', { leaseId }));
    for (const [rangeIndex, range] of (lease?.ranges || []).entries()) {
      if (!validRange(range, namespace)) blockers.push(issue('RANGE_LEASE_INVALID', { leaseId, rangeIndex, range }));
      else ranges.push({ leaseId, mainLineKey, start: range.start, end: range.end });
    }
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end || a.leaseId.localeCompare(b.leaseId));
  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1], current = ranges[index];
    if (current.start <= previous.end) blockers.push(issue('OVERLAPPING_RANGE_LEASE', { previous, current }));
  }
}

function validateHistorySet(registry, histories, blockers) {
  const historyIds = new Map();
  const numberClaims = new Map();
  const lineKeys = new Set();
  const leasesByLine = leaseIndex(registry?.leases);
  for (const history of histories) {
    const mainLineKey = text(history?.mainLineKey);
    if (lineKeys.has(mainLineKey)) blockers.push(issue('DUPLICATE_LINE_HISTORY', { mainLineKey }));
    lineKeys.add(mainLineKey);
    if (!isCanonicalMainLineKey(mainLineKey)) blockers.push(issue('MAIN_LINE_KEY_NONCANONICAL', { mainLineKey }));
    for (const node of history?.historyNodes || []) {
      validateHistoryNode(node, mainLineKey, blockers);
      const historyNodeId = text(node?.historyNodeId);
      const number = node?.engineeringNodeNumber;
      if (historyIds.has(historyNodeId)) blockers.push(issue('DUPLICATE_HISTORY_IDENTITY', {
        historyNodeId, firstMainLineKey: historyIds.get(historyNodeId), mainLineKey,
      }));
      else historyIds.set(historyNodeId, mainLineKey);
      addNumberClaim(numberClaims, node, mainLineKey);
      if (ACTIVE_LIFECYCLE_STATES.has(text(node?.lifecycleStatus)) && !numberInLease(number, leasesByLine.get(mainLineKey))) {
        blockers.push(issue('ACTIVE_NODE_OUTSIDE_OWNER_LEASE', { historyNodeId, mainLineKey, engineeringNodeNumber: number }));
      }
    }
  }
  validateNumberClaims(numberClaims, blockers);
}

function validateHistoryNode(node, mainLineKey, blockers) {
  const historyNodeId = text(node?.historyNodeId);
  const status = text(node?.lifecycleStatus);
  if (!historyNodeId) blockers.push(issue('HISTORY_IDENTITY_MISSING', { mainLineKey }));
  if (!Number.isInteger(node?.engineeringNodeNumber) || node.engineeringNodeNumber < 0) {
    blockers.push(issue('ENGINEERING_NODE_NUMBER_INVALID', { historyNodeId, value: node?.engineeringNodeNumber }));
  }
  if (!LIFECYCLE_STATES.includes(status)) blockers.push(issue('LIFECYCLE_STATUS_INVALID', { historyNodeId, status }));
  if (!text(node?.firstObservedRevision) || !text(node?.lastObservedRevision)) blockers.push(issue('REVISION_EVIDENCE_MISSING', { historyNodeId }));
  validateAliasesAndIdentity(node, historyNodeId, blockers);
  validateImmutableFactShape(node, mainLineKey, blockers);
  if (status === 'RETIRED' && !validLifecycleEvidence(node?.retirementEvidence)) blockers.push(issue('RETIREMENT_EVIDENCE_MISSING', { historyNodeId }));
  if (status === 'REACTIVATED' && !validLifecycleEvidence(node?.reactivationEvidence)) blockers.push(issue('REACTIVATION_EVIDENCE_MISSING', { historyNodeId }));
  if (status === 'SUPERSEDED' && (!validLifecycleEvidence(node?.supersessionEvidence) || !text(node?.supersededByHistoryNodeId))) {
    blockers.push(issue('SUPERSESSION_EVIDENCE_MISSING', { historyNodeId }));
  }
}

function validateAliasesAndIdentity(node, historyNodeId, blockers) {
  const aliases = Array.isArray(node?.sourceAliases) ? node.sourceAliases : [];
  if (!Array.isArray(node?.sourceAliases) || aliases.some((alias) => !text(alias)) || new Set(aliases).size !== aliases.length) {
    blockers.push(issue('SOURCE_ALIAS_EVIDENCE_INVALID', { historyNodeId }));
  }
  const identity = Array.isArray(node?.identityEvidence) ? node.identityEvidence : [];
  if (!identity.length || identity.some((row) => !text(row?.kind) || !text(row?.value) || !text(row?.authority))) {
    blockers.push(issue('IDENTITY_EVIDENCE_INVALID', { historyNodeId }));
  }
  if (new Set(identity.map((row) => canonicalSemanticJson(row))).size !== identity.length) blockers.push(issue('DUPLICATE_IDENTITY_EVIDENCE', { historyNodeId }));
}

function validateImmutableFactShape(node, mainLineKey, blockers) {
  const historyNodeId = text(node?.historyNodeId);
  const facts = node?.immutableFacts;
  if (!isRecord(facts)
    || text(facts.historyNodeId) !== historyNodeId
    || facts.engineeringNodeNumber !== node?.engineeringNodeNumber
    || text(facts.mainLineKey) !== mainLineKey
    || text(facts.firstObservedRevision) !== text(node?.firstObservedRevision)) {
    blockers.push(issue('IMMUTABLE_HISTORICAL_FACTS_INVALID', { historyNodeId }));
  }
}

async function validateArtifactHashes(registry, histories, blockers) {
  const actualRegistryHash = await computeZoneRegistryHash(registry || {});
  if (text(registry?.zoneRegistryHash) !== actualRegistryHash) blockers.push(issue('ZONE_REGISTRY_HASH_MISMATCH', {
    expected: text(registry?.zoneRegistryHash), actual: actualRegistryHash,
  }));
  for (const history of histories) {
    const actual = await computeLineHistoryHash(history);
    if (text(history?.lineHistoryHash) !== actual) blockers.push(issue('LINE_HISTORY_HASH_MISMATCH', {
      mainLineKey: text(history?.mainLineKey), expected: text(history?.lineHistoryHash), actual,
    }));
  }
}

function addNumberClaim(claims, node, mainLineKey) {
  const number = node?.engineeringNodeNumber;
  const rows = claims.get(number) || [];
  rows.push({ historyNodeId: text(node?.historyNodeId), mainLineKey, status: text(node?.lifecycleStatus) });
  claims.set(number, rows);
}

function validateNumberClaims(claims, blockers) {
  for (const [engineeringNodeNumber, rows] of claims) {
    const identities = new Set(rows.map((row) => row.historyNodeId));
    if (identities.size <= 1) continue;
    const active = rows.filter((row) => ACTIVE_LIFECYCLE_STATES.has(row.status));
    blockers.push(issue(active.length > 1 ? 'DUPLICATE_ACTIVE_ZONE_NODE_NUMBER' : 'HISTORICAL_NUMBER_IDENTITY_CONFLICT', {
      engineeringNodeNumber, claims: rows,
    }));
  }
}

function leaseIndex(leases) {
  const result = new Map();
  for (const lease of leases || []) {
    if (text(lease?.status) !== 'ACTIVE') continue;
    const key = text(lease?.mainLineKey), rows = result.get(key) || [];
    rows.push(...(lease?.ranges || []));
    result.set(key, rows);
  }
  return result;
}

function numberInLease(number, ranges = []) {
  return ranges.some((range) => Number.isInteger(number) && number >= range.start && number <= range.end && (number - range.start) % range.step === 0);
}

function validRange(range, namespace) {
  return Number.isInteger(range?.start) && Number.isInteger(range?.end) && Number.isInteger(range?.step)
    && range.start >= namespace.minimum && range.end <= namespace.maximum && range.start <= range.end && range.step > 0
    && (range.end - range.start) % range.step === 0;
}

function validLeaseEvidence(value) {
  return isRecord(value) && text(value.authority) && text(value.revisionId);
}

function addShapeErrors(blockers, errors, code, evidence = {}) {
  if (errors.length) blockers.push(issue(code, { ...evidence, errors }));
}
