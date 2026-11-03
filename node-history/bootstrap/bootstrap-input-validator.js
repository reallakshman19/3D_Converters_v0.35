import { canonicalSemanticJson, computeSemanticHash, text } from '../../contracts/topo-enriched-xml/contract-core.js';
import {
  TOPONODEALLOCATIONRESULT_V1,
  TOPONODEHISTORYMATCHRESULT_V1,
  TOPOSOURCEINVENTORY_V1,
} from '../../contracts/topo-enriched-xml/contracts.js';
import { computeRegistrySnapshotHash } from '../registry/registry-hash.js';
import { validateRegistrySnapshot } from '../registry/registry-validator.js';
import { issue } from '../registry/registry-contracts.js';
import { validateBootstrapLifecycle } from './bootstrap-lifecycle-reconciliation.js';

const COVERAGE_SCOPES = new Set(['PARTIAL_LINE', 'FULL_LINE', 'FULL_ZONE']);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ACCEPTED_BUCKETS = Object.freeze([
  { bucket: 'matches', kind: 'MATCH', outcomes: new Set(['EXACT_MATCHED', 'REGISTERED_GLOBAL_MATCHED']) },
  { bucket: 'newNodes', kind: 'NEW', outcomes: new Set(['NO_EXACT_MATCH', 'NO_REGISTERED_MATCH']) },
  { bucket: 'reactivated', kind: 'REACTIVATE', outcomes: new Set(['REACTIVATION_CANDIDATE']) },
]);
const ALLOCATION_KINDS = Object.freeze({ MATCH: 'HISTORICAL_PRESERVE', NEW: 'NEW', REACTIVATE: 'REACTIVATION' });

export async function validateBootstrapInput(input) {
  const blockers = [];
  const root = registryRoot(input?.seedZoneRegistry);
  const seedHash = await validateSeed(input, root, blockers);
  const matchHash = await validateMatch(input?.historyMatchResult, root, seedHash, blockers);
  const allocationHash = await validateAllocation(input?.allocationResult, root, seedHash, matchHash, blockers);
  const sourceInventoryHash = await validateSourceInventory(input?.sourceInventory, root, blockers);
  const current = indexCurrentNodes(input?.currentLogicalNodes, root, blockers);
  const matches = indexAcceptedMatches(input?.historyMatchResult, blockers);
  const allocations = indexAllocations(input?.allocationResult, blockers);
  validateReconciliation(current, matches, allocations, blockers);
  validateCoverage(input?.coverage, input?.seedZoneRegistry, input?.historyMatchResult, blockers);
  validateRevision(input?.revision, blockers);
  validateEvaluatedAt(input?.evaluatedAt, blockers);
  const lifecycle = validateBootstrapLifecycle({
    seedLineHistories: input?.seedLineHistories,
    acceptedMatches: matches,
    historyMatchResult: input?.historyMatchResult,
    allocationResult: input?.allocationResult,
    revision: input?.revision,
    approval: input?.approval,
  });
  blockers.push(...lifecycle.blockers);
  return {
    root, seedHash, matchHash, allocationHash, sourceInventoryHash,
    current, matches, allocations, lifecycle, blockers: sortIssues(blockers),
  };
}

async function validateSeed(input, root, blockers) {
  const validation = await validateRegistrySnapshot({
    zoneRegistry: input?.seedZoneRegistry,
    lineHistories: input?.seedLineHistories,
    manifest: input?.seedManifest,
  });
  if (validation.status !== 'PASS' || upstreamSeedNotPass(input)) blockers.push(issue('BOOTSTRAP_SEED_NOT_PASS', { validation }));
  const actual = await computeRegistrySnapshotHash(input?.seedManifest || {});
  if (actual !== text(input?.seedManifest?.registrySnapshotHash)) blockers.push(issue('BOOTSTRAP_SEED_HASH_MISMATCH', {
    expected: text(input?.seedManifest?.registrySnapshotHash), actual,
  }));
  validateRoot(input?.seedManifest, root, 'BOOTSTRAP_HASH_CHAIN_MISMATCH', blockers);
  return actual;
}

async function validateMatch(result, root, seedHash, blockers) {
  const errors = TOPONODEHISTORYMATCHRESULT_V1.validate(result);
  if (errors.length || result?.validation?.status !== 'PASS' || (result?.ambiguous || []).length || (result?.conflicts || []).length) {
    blockers.push(issue('BOOTSTRAP_MATCH_RESULT_NOT_PASS', {
      errors, status: text(result?.validation?.status),
      ambiguousCount: result?.ambiguous?.length || 0, conflictCount: result?.conflicts?.length || 0,
    }));
  }
  const actual = await computeSemanticHash(result || {}, 'historyMatchResultHash');
  if (actual !== text(result?.historyMatchResultHash)) blockers.push(issue('BOOTSTRAP_MATCH_RESULT_HASH_MISMATCH', {
    expected: text(result?.historyMatchResultHash), actual,
  }));
  validateRoot(result, root, 'BOOTSTRAP_HASH_CHAIN_MISMATCH', blockers);
  if (text(result?.baseRegistrySnapshotHash) !== seedHash) blockers.push(issue('BOOTSTRAP_HASH_CHAIN_MISMATCH', {
    field: 'historyMatchResult.baseRegistrySnapshotHash', expected: seedHash, actual: text(result?.baseRegistrySnapshotHash),
  }));
  return actual;
}

async function validateAllocation(result, root, seedHash, matchHash, blockers) {
  const errors = TOPONODEALLOCATIONRESULT_V1.validate(result);
  if (errors.length || result?.validation?.status !== 'PASS') blockers.push(issue('BOOTSTRAP_ALLOCATION_RESULT_NOT_PASS', {
    errors, status: text(result?.validation?.status),
  }));
  const actual = await computeSemanticHash(result || {}, 'allocationResultHash');
  if (actual !== text(result?.allocationResultHash)) blockers.push(issue('BOOTSTRAP_ALLOCATION_RESULT_HASH_MISMATCH', {
    expected: text(result?.allocationResultHash), actual,
  }));
  validateRoot(result, root, 'BOOTSTRAP_HASH_CHAIN_MISMATCH', blockers);
  for (const [field, expected] of [
    ['baseRegistrySnapshotHash', seedHash], ['historyMatchResultHash', matchHash],
  ]) if (text(result?.[field]) !== expected) blockers.push(issue('BOOTSTRAP_HASH_CHAIN_MISMATCH', {
    field: `allocationResult.${field}`, expected, actual: text(result?.[field]),
  }));
  return actual;
}

async function validateSourceInventory(inventory, root, blockers) {
  const errors = TOPOSOURCEINVENTORY_V1.validate(inventory);
  const sourceHash = text(inventory?.sourceIdentity?.sourceHash);
  if (errors.length || inventory?.validation?.status !== 'PASS' || !HASH_PATTERN.test(sourceHash)) {
    blockers.push(issue('BOOTSTRAP_RECONCILIATION_INCOMPLETE', {
      sourceInventoryErrors: errors, status: text(inventory?.validation?.status), sourceHash,
    }));
  }
  validateRoot(inventory, root, 'BOOTSTRAP_HASH_CHAIN_MISMATCH', blockers);
  return computeSemanticHash(inventory || {}, 'sourceInventoryHash');
}

function indexCurrentNodes(rows, root, blockers) {
  const result = new Map();
  if (!Array.isArray(rows)) blockers.push(issue('BOOTSTRAP_RECONCILIATION_INCOMPLETE', { reason: 'CURRENT_LOGICAL_NODES_INVALID' }));
  for (const node of Array.isArray(rows) ? rows : []) {
    const logicalNodeId = text(node?.logicalNodeId);
    const mainLineKey = text(node?.mainLineKey || node?.canonicalMainLine);
    if (!logicalNodeId || !mainLineKey) blockers.push(issue('BOOTSTRAP_RECONCILIATION_INCOMPLETE', { logicalNodeId, mainLineKey }));
    if (result.has(logicalNodeId)) blockers.push(issue('BOOTSTRAP_RECONCILIATION_INCOMPLETE', { reason: 'DUPLICATE_CURRENT_LOGICAL_NODE', logicalNodeId }));
    validateRoot(node, root, 'BOOTSTRAP_HASH_CHAIN_MISMATCH', blockers, { logicalNodeId });
    result.set(logicalNodeId, structuredClone({ ...node, logicalNodeId, mainLineKey }));
  }
  return result;
}

function indexAcceptedMatches(result, blockers) {
  const index = new Map();
  for (const spec of ACCEPTED_BUCKETS) for (const row of result?.[spec.bucket] || []) {
    const logicalNodeId = text(row?.logicalNodeId);
    const historyNodeId = text(row?.historyNodeId);
    const outcome = text(row?.outcome);
    if (!logicalNodeId || (spec.kind !== 'NEW' && !historyNodeId) || !spec.outcomes.has(outcome)) {
      blockers.push(issue('BOOTSTRAP_RECONCILIATION_INCOMPLETE', {
        bucket: spec.bucket, logicalNodeId, historyNodeId, outcome,
      }));
    }
    if (index.has(logicalNodeId)) blockers.push(issue('BOOTSTRAP_RECONCILIATION_INCOMPLETE', {
      reason: 'DUPLICATE_MATCH_DISPOSITION', logicalNodeId,
    }));
    index.set(logicalNodeId, { kind: spec.kind, logicalNodeId, historyNodeId, row: structuredClone(row) });
  }
  return index;
}

function indexAllocations(result, blockers) {
  const index = new Map();
  for (const row of result?.allocations || []) {
    const logicalNodeId = text(row?.logicalNodeId);
    if (!logicalNodeId || index.has(logicalNodeId)) blockers.push(issue('BOOTSTRAP_RECONCILIATION_INCOMPLETE', {
      reason: 'DUPLICATE_OR_MISSING_ALLOCATION', logicalNodeId,
    }));
    index.set(logicalNodeId, structuredClone(row));
  }
  return index;
}

function validateReconciliation(current, matches, allocations, blockers) {
  const sets = [new Set(current.keys()), new Set(matches.keys()), new Set(allocations.keys())];
  if (!sameSet(sets[0], sets[1]) || !sameSet(sets[0], sets[2])) blockers.push(issue('BOOTSTRAP_RECONCILIATION_INCOMPLETE', {
    current: [...sets[0]].sort(), matches: [...sets[1]].sort(), allocations: [...sets[2]].sort(),
  }));
  for (const logicalNodeId of sets[0]) validateReconciledRow(logicalNodeId, current, matches, allocations, blockers);
}

function validateReconciledRow(logicalNodeId, current, matches, allocations, blockers) {
  const node = current.get(logicalNodeId), match = matches.get(logicalNodeId), allocation = allocations.get(logicalNodeId);
  if (!node || !match || !allocation) return;
  if (text(allocation.mainLineKey) !== node.mainLineKey) blockers.push(issue('BOOTSTRAP_RECONCILIATION_INCOMPLETE', {
    logicalNodeId, field: 'mainLineKey', current: node.mainLineKey, allocation: text(allocation.mainLineKey),
  }));
  if (text(allocation.allocationKind) !== ALLOCATION_KINDS[match.kind]) blockers.push(issue('BOOTSTRAP_HASH_CHAIN_MISMATCH', {
    logicalNodeId, field: 'allocationKind', expected: ALLOCATION_KINDS[match.kind], actual: text(allocation.allocationKind),
  }));
  if (match.kind === 'NEW' && text(allocation.historyNodeId)) blockers.push(issue('BOOTSTRAP_IDENTITY_CONFLICT', {
    logicalNodeId, reason: 'NEW_ALLOCATION_ALREADY_HAS_HISTORY_ID', historyNodeId: text(allocation.historyNodeId),
  }));
  if (match.kind !== 'NEW' && text(allocation.historyNodeId) !== match.historyNodeId) blockers.push(issue('BOOTSTRAP_HASH_CHAIN_MISMATCH', {
    logicalNodeId, expectedHistoryNodeId: match.historyNodeId, allocationHistoryNodeId: text(allocation.historyNodeId),
  }));
}

function validateCoverage(coverage, registry, result, blockers) {
  const scope = text(coverage?.scope);
  if (!COVERAGE_SCOPES.has(scope) || typeof coverage?.authoritativeForRetirement !== 'boolean') {
    blockers.push(issue('PARTIAL_COVERAGE_RETIREMENT_PROHIBITED', { reason: 'COVERAGE_INVALID', scope }));
    return;
  }
  const covered = normalizedCoveredLines(coverage);
  const known = new Set((registry?.lineHistoryRefs || []).map((row) => text(row?.mainLineKey)));
  for (const line of covered) if (!known.has(line)) blockers.push(issue('BOOTSTRAP_RECONCILIATION_INCOMPLETE', {
    reason: 'COVERED_LINE_MISSING_FROM_SEED', mainLineKey: line,
  }));
  if ((result?.retirementCandidates || []).length && !permitsRetirement(coverage)) blockers.push(issue('PARTIAL_COVERAGE_RETIREMENT_PROHIBITED', {
    scope, authoritativeForRetirement: coverage?.authoritativeForRetirement,
  }));
}

function validateRevision(revision, blockers) {
  if (!text(revision?.revisionId) || !text(revision?.authority)) blockers.push(issue('BOOTSTRAP_LIFECYCLE_CONFLICT', {
    reason: 'REVISION_AUTHORITY_MISSING',
  }));
  for (const field of ['reactivations', 'retirements']) if (revision?.[field] !== undefined && !Array.isArray(revision[field])) {
    blockers.push(issue('BOOTSTRAP_LIFECYCLE_CONFLICT', { reason: `${field.toUpperCase()}_INVALID` }));
  }
}

export function normalizedCoveredLines(coverage = {}) {
  const rows = coverage.mainLineKeys || coverage.coveredMainLines || [];
  return [...new Set((Array.isArray(rows) ? rows : []).map(text).filter(Boolean))].sort();
}

export function normalizeBootstrapCoverage(coverage = {}) {
  const mainLineKeys = normalizedCoveredLines(coverage);
  return {
    scope: text(coverage.scope),
    authoritativeForRetirement: coverage.authoritativeForRetirement === true,
    ...(text(coverage.scope) === 'FULL_LINE' ? { mainLineKeys } : {}),
  };
}

function validateRoot(value, root, code, blockers, evidence = {}) {
  for (const field of ['projectId', 'zoneId']) if (text(value?.[field]) !== root[field]) blockers.push(issue(code, {
    ...evidence, field, expected: root[field], actual: text(value?.[field]),
  }));
}

function registryRoot(registry) { return { projectId: text(registry?.projectId), zoneId: text(registry?.zoneId) }; }
function upstreamSeedNotPass(input) {
  return input?.seedZoneRegistry?.validation?.status !== 'PASS'
    || input?.seedManifest?.validation?.status !== 'PASS'
    || (input?.seedLineHistories || []).some((row) => row?.validation?.status !== 'PASS');
}
function sameSet(left, right) { return left.size === right.size && [...left].every((value) => right.has(value)); }
function permitsRetirement(coverage) { return coverage?.authoritativeForRetirement === true && ['FULL_LINE', 'FULL_ZONE'].includes(text(coverage?.scope)); }
function validateEvaluatedAt(value, blockers) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text(value)) || Number.isNaN(Date.parse(text(value)))) {
    blockers.push(issue('EVALUATED_AT_INVALID', { evaluatedAt: text(value) }));
  }
}
function issueKey(row) { return `${text(row?.code)}|${canonicalSemanticJson(row?.evidence || {})}`; }
function sortIssues(rows) { return [...rows].sort((a, b) => issueKey(a).localeCompare(issueKey(b))); }
