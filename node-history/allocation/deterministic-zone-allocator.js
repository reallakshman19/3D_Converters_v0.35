import { canonicalSemanticJson, computeSemanticHash, text } from '../../contracts/topo-enriched-xml/contract-core.js';
import { TOPONODEHISTORYMATCHRESULT_V1 } from '../../contracts/topo-enriched-xml/contracts.js';
import { computeRegistrySnapshotHash } from '../registry/registry-hash.js';
import { validateRegistrySnapshot } from '../registry/registry-validator.js';
import { issue } from '../registry/registry-contracts.js';
import { bindRequestsToMatchResult, normalizeAllocationRequests } from './allocation-request-normalizer.js';
import { buildZoneLeaseIndex, leaseEvidence, locateOwnedNumber, lowestAvailableNumber } from './zone-lease-index.js';
import { buildAllocationResult } from './allocation-result.js';

export async function allocateZoneEngineeringNodes(input) {
  const before = canonicalSemanticJson(input, { excludedKeys: [] });
  const blockers = [], warnings = [];
  const root = resolveRoot(input.zoneRegistry);
  await validateRegistryAuthority(input, root, blockers);
  await validateMatchAuthority(input.historyMatchResult, root, input.manifest, blockers);
  validateCoverage(input.coverage, input.historyMatchResult, blockers);
  validateTimestamp(input.evaluatedAt, blockers);
  const normalized = normalizeAllocationRequests(input.allocationRequests);
  blockers.push(...normalized.blockers);
  const bound = bindRequestsToMatchResult(normalized.requests, input.historyMatchResult);
  blockers.push(...bound.blockers);
  const index = buildZoneLeaseIndex({ zoneRegistry: input.zoneRegistry, lineHistories: input.lineHistories, policy: input.policy });
  blockers.push(...index.blockers);
  validateRequestedLeaseAuthority(bound.bound, index, blockers);
  let leases = [], allocations = [], retirements = [], reactivations = [];
  if (!blockers.length) {
    const allocated = allocateBoundRequests(bound.bound, index);
    blockers.push(...allocated.blockers);
    if (!blockers.length) {
      allocations = allocated.allocations;
      reactivations = allocated.reactivations;
      retirements = buildRetirementIntents(input.historyMatchResult, input.coverage, index, blockers);
      leases = leaseEvidence(index, bound.bound.map((row) => row.mainLineKey));
      validateFinalOwnership(allocations, blockers);
    }
  }
  const actualMatchHash = await computeSemanticHash(input.historyMatchResult || {}, 'historyMatchResultHash');
  const result = await buildAllocationResult({
    projectId: root.projectId, zoneId: root.zoneId,
    baseRegistrySnapshotHash: text(input.manifest?.registrySnapshotHash), historyMatchResultHash: actualMatchHash,
    leases, allocations, retirements, reactivations, blockers, warnings,
    evaluatedAt: text(input.evaluatedAt), policy: input.policy || {},
  });
  if (canonicalSemanticJson(input, { excludedKeys: [] }) !== before) throw new Error('Zone allocator mutated its input.');
  return result;
}

async function validateRegistryAuthority(input, root, blockers) {
  const validation = await validateRegistrySnapshot({ zoneRegistry: input.zoneRegistry, lineHistories: input.lineHistories, manifest: input.manifest });
  if (validation.status !== 'PASS' || upstreamNotPass(input)) blockers.push(issue('REGISTRY_SNAPSHOT_NOT_PASS', {
    registryValidation: validation, zoneStatus: input.zoneRegistry?.validation?.status,
  }));
  const actual = await computeRegistrySnapshotHash(input.manifest || {});
  if (actual !== text(input.manifest?.registrySnapshotHash)) blockers.push(issue('REGISTRY_SNAPSHOT_HASH_MISMATCH', {
    expected: text(input.manifest?.registrySnapshotHash), actual,
  }));
  for (const field of ['projectId', 'zoneId']) if (text(input.manifest?.[field]) !== root[field]) blockers.push(issue('REGISTRY_SNAPSHOT_NOT_PASS', {
    field, expected: root[field], actual: text(input.manifest?.[field]),
  }));
}

async function validateMatchAuthority(result, root, manifest, blockers) {
  const errors = TOPONODEHISTORYMATCHRESULT_V1.validate(result);
  if (errors.length || result?.validation?.status !== 'PASS' || (result?.ambiguous || []).length || (result?.conflicts || []).length) blockers.push(issue('HISTORY_MATCH_RESULT_NOT_PASS', {
    errors, status: result?.validation?.status, ambiguousCount: result?.ambiguous?.length || 0, conflictCount: result?.conflicts?.length || 0,
  }));
  const actual = await computeSemanticHash(result || {}, 'historyMatchResultHash');
  if (actual !== text(result?.historyMatchResultHash)) blockers.push(issue('HISTORY_MATCH_RESULT_HASH_MISMATCH', {
    expected: text(result?.historyMatchResultHash), actual,
  }));
  for (const field of ['projectId', 'zoneId']) if (text(result?.[field]) !== root[field]) blockers.push(issue('HISTORY_MATCH_RESULT_NOT_PASS', {
    field, expected: root[field], actual: text(result?.[field]),
  }));
  if (text(result?.baseRegistrySnapshotHash) !== text(manifest?.registrySnapshotHash)) blockers.push(issue('REGISTRY_SNAPSHOT_HASH_MISMATCH', {
    expected: text(manifest?.registrySnapshotHash), actual: text(result?.baseRegistrySnapshotHash),
  }));
}

function validateRequestedLeaseAuthority(rows, index, blockers) {
  const mainLineKeys = [...new Set(rows.map((row) => row.mainLineKey))].sort();
  for (const mainLineKey of mainLineKeys) {
    if (!index.allByLine.has(mainLineKey)) blockers.push(issue('LEASE_MISSING', { mainLineKey }));
    else if (!(index.activeByLine.get(mainLineKey) || []).length) blockers.push(issue('LEASE_INACTIVE', { mainLineKey }));
  }
}

function allocateBoundRequests(rows, index) {
  const blockers = [], allocations = [], reactivations = [], claimed = new Set();
  for (const row of rows.filter((item) => item.kind !== 'NEW')) {
    const result = allocateHistorical(row, index);
    if (result.blocker) blockers.push(result.blocker);
    else {
      allocations.push(result.allocation);
      claimed.add(result.allocation.engineeringNodeNumber);
      if (result.reactivation) reactivations.push(result.reactivation);
    }
  }
  for (const row of rows.filter((item) => item.kind === 'NEW')) {
    const choice = lowestAvailableNumber(index, row.mainLineKey, claimed);
    if (choice.blocker) blockers.push(choice.blocker);
    else {
      claimed.add(choice.number);
      allocations.push(allocationRow(row, choice.number, choice.lease, 'NEW'));
    }
  }
  return { blockers, allocations, reactivations };
}

function allocateHistorical(row, index) {
  const history = index.historyById.get(row.approvedHistoryNodeId);
  if (!history) return { blocker: issue('HISTORY_NODE_NUMBER_CONFLICT', { logicalNodeId: row.logicalNodeId, historyNodeId: row.approvedHistoryNodeId }) };
  if (history.mainLineKey !== row.mainLineKey) return { blocker: issue('ALLOCATION_MAIN_LINE_MISMATCH', {
    logicalNodeId: row.logicalNodeId, requestMainLineKey: row.mainLineKey, historyMainLineKey: history.mainLineKey,
  }) };
  if (row.kind === 'REACTIVATE' && text(history.lifecycleStatus) !== 'RETIRED') return { blocker: issue('REACTIVATION_OWNER_MISMATCH', {
    historyNodeId: history.historyNodeId, lifecycleStatus: history.lifecycleStatus,
  }) };
  if (row.kind === 'PRESERVE' && !['ACTIVE', 'REACTIVATED'].includes(text(history.lifecycleStatus))) return { blocker: issue('RETIRED_NUMBER_REUSE_PROHIBITED', {
    logicalNodeId: row.logicalNodeId, historyNodeId: history.historyNodeId, lifecycleStatus: history.lifecycleStatus,
  }) };
  const located = locateOwnedNumber(index, row.mainLineKey, history.engineeringNodeNumber);
  if (located.blocker) return located;
  const allocation = allocationRow(row, history.engineeringNodeNumber, located.lease, row.kind === 'REACTIVATE' ? 'REACTIVATION' : 'HISTORICAL_PRESERVE');
  const reactivation = row.kind === 'REACTIVATE' ? {
    logicalNodeId: row.logicalNodeId, historyNodeId: history.historyNodeId, mainLineKey: row.mainLineKey,
    engineeringNodeNumber: history.engineeringNodeNumber, disposition: 'REACTIVATE_SAME_HISTORY_OWNER',
  } : null;
  return { allocation, reactivation };
}

function buildRetirementIntents(result, coverage, index, blockers) {
  const candidates = Array.isArray(result?.retirementCandidates) ? result.retirementCandidates : [];
  if (candidates.length && !permitsRetirement(coverage)) {
    blockers.push(issue('PARTIAL_COVERAGE_RETIREMENT_PROHIBITED', { scope: coverage?.scope, candidateCount: candidates.length }));
    return [];
  }
  const covered = new Set((coverage?.coveredMainLines || []).map(text));
  const rows = [];
  for (const candidate of candidates) {
    const history = index.historyById.get(text(candidate?.historyNodeId));
    if (!history) {
      blockers.push(issue('HISTORY_NODE_NUMBER_CONFLICT', { historyNodeId: text(candidate?.historyNodeId), reason: 'RETIREMENT_HISTORY_MISSING' }));
      continue;
    }
    if (coverage.scope === 'FULL_LINE' && !covered.has(history.mainLineKey)) blockers.push(issue('PARTIAL_COVERAGE_RETIREMENT_PROHIBITED', {
      historyNodeId: history.historyNodeId, mainLineKey: history.mainLineKey,
    }));
    else rows.push({ historyNodeId: history.historyNodeId, mainLineKey: history.mainLineKey, engineeringNodeNumber: history.engineeringNodeNumber, disposition: 'RETIREMENT_INTENT_ONLY', reason: candidate.reason });
  }
  return rows;
}

function validateCoverage(coverage, result, blockers) {
  if (!coverage || !['PARTIAL_LINE', 'FULL_LINE', 'FULL_ZONE'].includes(text(coverage.scope)) || typeof coverage.authoritativeForRetirement !== 'boolean') blockers.push(issue('PARTIAL_COVERAGE_RETIREMENT_PROHIBITED', { reason: 'COVERAGE_INVALID' }));
  if (coverage?.scope === 'FULL_LINE' && !(coverage.coveredMainLines || []).map(text).includes(text(result?.mainLineKey))) blockers.push(issue('ALLOCATION_MAIN_LINE_MISMATCH', { mainLineKey: text(result?.mainLineKey), coveredMainLines: coverage?.coveredMainLines || [] }));
  if ((result?.retirementCandidates || []).length && !permitsRetirement(coverage)) blockers.push(issue('PARTIAL_COVERAGE_RETIREMENT_PROHIBITED', { scope: coverage?.scope }));
}
function validateTimestamp(value, blockers) { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text(value)) || Number.isNaN(Date.parse(text(value)))) blockers.push(issue('EVALUATED_AT_INVALID', { evaluatedAt: text(value) })); }
function validateFinalOwnership(rows, blockers) {
  const numbers = new Map(), logical = new Map(), history = new Map();
  for (const row of rows) {
    const owner = row.historyNodeId || row.logicalNodeId;
    if (numbers.has(row.engineeringNodeNumber) && numbers.get(row.engineeringNodeNumber) !== owner) {
      blockers.push(issue('ENGINEERING_NODE_NUMBER_CONFLICT', { engineeringNodeNumber: row.engineeringNodeNumber }));
    }
    if (logical.has(row.logicalNodeId)) blockers.push(issue('LOGICAL_NODE_NUMBER_CONFLICT', { logicalNodeId: row.logicalNodeId }));
    if (row.historyNodeId && history.has(row.historyNodeId)) blockers.push(issue('HISTORY_NODE_NUMBER_CONFLICT', { historyNodeId: row.historyNodeId }));
    numbers.set(row.engineeringNodeNumber, owner);
    logical.set(row.logicalNodeId, row.engineeringNodeNumber);
    if (row.historyNodeId) history.set(row.historyNodeId, row.engineeringNodeNumber);
  }
}
function allocationRow(row, number, lease, allocationKind) { return { logicalNodeId: row.logicalNodeId, ...(row.approvedHistoryNodeId ? { historyNodeId: row.approvedHistoryNodeId } : {}), engineeringNodeNumber: number, mainLineKey: row.mainLineKey, leaseId: lease.leaseId, leaseRange: { start: lease.start, end: lease.end, step: lease.step }, allocationKind }; }
function upstreamNotPass(input) { return input.zoneRegistry?.validation?.status !== 'PASS' || input.manifest?.validation?.status !== 'PASS' || (input.lineHistories || []).some((row) => row?.validation?.status !== 'PASS'); }
function permitsRetirement(coverage) { return coverage?.authoritativeForRetirement === true && ['FULL_LINE', 'FULL_ZONE'].includes(text(coverage.scope)); }
function resolveRoot(registry) { return { projectId: text(registry?.projectId) || 'UNKNOWN_PROJECT', zoneId: text(registry?.zoneId) || 'UNKNOWN_ZONE' }; }
