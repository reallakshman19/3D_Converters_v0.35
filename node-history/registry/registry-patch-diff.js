import { canonicalSemanticJson, text } from '../../contracts/topo-enriched-xml/contract-core.js';
import { issue } from './registry-contracts.js';
import { normalizeLineHistorySemantic, normalizeZoneRegistrySemantic } from './registry-hash.js';

const LEASE_TYPES = new Set(['ADD_LEASE', 'UPDATE_LEASE']);
const NODE_TYPES = new Set([
  'ADD_NODE', 'RETIRE_NODE', 'REACTIVATE_NODE', 'SUPERSEDE_NODE',
  'MARK_REVIEW_REQUIRED', 'ACTIVATE_NODE', 'UPDATE_ALIAS',
]);
const LIFECYCLE_TYPES = new Set([
  'RETIRE_NODE', 'REACTIVATE_NODE', 'SUPERSEDE_NODE',
  'MARK_REVIEW_REQUIRED', 'ACTIVATE_NODE',
]);

export function validatePatchDiffCoverage({
  baseZoneRegistry,
  proposedZoneRegistry,
  baseLineHistories,
  proposedLineHistories,
  operations,
  blockers,
}) {
  const operationIndex = indexOperations(operations, blockers);
  validateNamespaceChange(baseZoneRegistry, proposedZoneRegistry, blockers);
  const leaseDiff = validateLeaseChanges(baseZoneRegistry, proposedZoneRegistry, operationIndex, blockers);
  const historyDiff = validateHistoryChanges(baseLineHistories, proposedLineHistories, operationIndex, blockers);
  validatePhantomOperations(operationIndex, leaseDiff, historyDiff, blockers);
}

export function describePoolUpdates(base, proposed) {
  const before = normalizeZoneRegistrySemantic(base || {});
  const after = normalizeZoneRegistrySemantic(proposed || {});
  if (canonicalSemanticJson(before) === canonicalSemanticJson(after)) return [];
  return [{
    type: 'REPLACE_POOL_STATE',
    zoneId: text(base?.zoneId),
    baseZoneRegistryHash: text(base?.zoneRegistryHash),
    proposedZoneRegistryHash: text(proposed?.zoneRegistryHash),
  }];
}

export function changedPoolMainLines(base, proposed) {
  const before = poolLineSemantics(base);
  const after = poolLineSemantics(proposed);
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].filter((key) => before.get(key) !== after.get(key)).sort();
}

export function describeLineHistoryUpdates(baseHistories = [], proposedHistories = []) {
  const base = indexHistories(baseHistories);
  const proposed = indexHistories(proposedHistories);
  const keys = [...new Set([...base.keys(), ...proposed.keys()])].sort();
  const updates = [];
  for (const mainLineKey of keys) {
    const before = base.get(mainLineKey);
    const after = proposed.get(mainLineKey);
    if (semanticHistory(before) === semanticHistory(after)) continue;
    updates.push({
      mainLineKey,
      changeType: before && after ? 'UPDATE' : (after ? 'ADD' : 'DELETE'),
      baseLineHistoryHash: text(before?.lineHistoryHash) || null,
      proposedLineHistoryHash: text(after?.lineHistoryHash) || null,
    });
  }
  return updates;
}

function validateNamespaceChange(base, proposed, blockers) {
  if (canonicalSemanticJson(base?.namespace) !== canonicalSemanticJson(proposed?.namespace)) {
    blockers.push(issue('NAMESPACE_CHANGE_UNREPRESENTED'));
  }
}

function validateLeaseChanges(base, proposed, operationIndex, blockers) {
  const before = indexBy(base?.leases, (row) => text(row?.leaseId));
  const after = indexBy(proposed?.leases, (row) => text(row?.leaseId));
  const added = new Set(), updated = new Set(), deleted = new Set();
  for (const leaseId of new Set([...before.keys(), ...after.keys()])) {
    const left = before.get(leaseId), right = after.get(leaseId);
    if (!left && right) {
      added.add(leaseId);
      requireOperation(operationIndex, 'ADD_LEASE', leaseId, 'leaseId', blockers);
    } else if (left && !right) {
      deleted.add(leaseId);
      blockers.push(issue('RANGE_LEASE_DELETION_PROHIBITED', { leaseId }));
    } else if (canonicalSemanticJson(left) !== canonicalSemanticJson(right)) {
      updated.add(leaseId);
      requireOperation(operationIndex, 'UPDATE_LEASE', leaseId, 'leaseId', blockers);
    }
  }
  return { added, updated, deleted };
}

function validateHistoryChanges(baseHistories, proposedHistories, operationIndex, blockers) {
  const baseLines = indexHistories(baseHistories);
  const proposedLines = indexHistories(proposedHistories);
  for (const mainLineKey of baseLines.keys()) {
    if (!proposedLines.has(mainLineKey)) blockers.push(issue('LINE_HISTORY_DELETION_PROHIBITED', { mainLineKey }));
  }
  const before = indexNodes(baseHistories), after = indexNodes(proposedHistories);
  const added = new Set(), aliasUpdated = new Set(), lifecycleUpdated = new Set();
  for (const historyNodeId of new Set([...before.keys(), ...after.keys()])) {
    const left = before.get(historyNodeId), right = after.get(historyNodeId);
    if (!left && right) {
      added.add(historyNodeId);
      requireOperation(operationIndex, 'ADD_NODE', historyNodeId, 'historyNodeId', blockers);
      continue;
    }
    if (!left || !right) continue;
    if (canonicalSemanticJson(sortedAliases(left.sourceAliases)) !== canonicalSemanticJson(sortedAliases(right.sourceAliases))) {
      aliasUpdated.add(historyNodeId);
      const operation = requireOperation(operationIndex, 'UPDATE_ALIAS', historyNodeId, 'historyNodeId', blockers);
      if (operation && canonicalSemanticJson(sortedAliases(operation.sourceAliases)) !== canonicalSemanticJson(sortedAliases(right.sourceAliases))) {
        blockers.push(issue('ALIAS_OPERATION_EVIDENCE_MISMATCH', { historyNodeId }));
      }
    }
    if (text(left.lifecycleStatus) !== text(right.lifecycleStatus)) lifecycleUpdated.add(historyNodeId);
  }
  return { added, aliasUpdated, lifecycleUpdated };
}

function validatePhantomOperations(index, leaseDiff, historyDiff, blockers) {
  for (const operation of index.all) {
    const type = text(operation?.type);
    const leaseId = text(operation?.leaseId);
    const historyNodeId = text(operation?.historyNodeId);
    if (type === 'ADD_LEASE' && !leaseDiff.added.has(leaseId)) phantom(operation, blockers);
    if (type === 'UPDATE_LEASE' && !leaseDiff.updated.has(leaseId)) phantom(operation, blockers);
    if (type === 'ADD_NODE' && !historyDiff.added.has(historyNodeId)) phantom(operation, blockers);
    if (type === 'UPDATE_ALIAS' && !historyDiff.aliasUpdated.has(historyNodeId)) phantom(operation, blockers);
    if (LIFECYCLE_TYPES.has(type) && !historyDiff.lifecycleUpdated.has(historyNodeId)) phantom(operation, blockers);
  }
}

function poolLineSemantics(registry) {
  const grouped = new Map();
  for (const lease of registry?.leases || []) addPoolRow(grouped, text(lease?.mainLineKey), 'lease', lease);
  for (const reference of registry?.lineHistoryRefs || []) addPoolRow(grouped, text(reference?.mainLineKey), 'historyRef', reference);
  const result = new Map();
  for (const [key, rows] of grouped) result.set(key, canonicalSemanticJson(rows.sort(canonicalSort)));
  return result;
}

function addPoolRow(grouped, mainLineKey, kind, value) {
  if (!mainLineKey) return;
  const rows = grouped.get(mainLineKey) || [];
  rows.push({ kind, value });
  grouped.set(mainLineKey, rows);
}

function indexOperations(operations, blockers) {
  const byTarget = new Map(), all = Array.isArray(operations) ? operations : [];
  for (const operation of all) {
    const type = text(operation?.type);
    const target = LEASE_TYPES.has(type) ? text(operation?.leaseId) : (NODE_TYPES.has(type) ? text(operation?.historyNodeId) : '');
    const key = `${type}|${target}`;
    const rows = byTarget.get(key) || [];
    rows.push(operation);
    byTarget.set(key, rows);
    if (target && rows.length > 1) blockers.push(issue('DUPLICATE_REGISTRY_TARGET_OPERATION', { type, target }));
  }
  return { all, byTarget };
}

function requireOperation(index, type, target, field, blockers) {
  const rows = index.byTarget.get(`${type}|${target}`) || [];
  if (rows.length !== 1) {
    blockers.push(issue('REGISTRY_CHANGE_OPERATION_MISSING', { type, [field]: target }));
    return null;
  }
  return rows[0];
}

function phantom(operation, blockers) {
  blockers.push(issue('REGISTRY_OPERATION_WITHOUT_CHANGE', {
    operationId: text(operation?.operationId), type: text(operation?.type),
  }));
}

function indexHistories(histories) {
  return indexBy(histories, (row) => text(row?.mainLineKey));
}

function indexNodes(histories) {
  const rows = [];
  for (const history of Array.isArray(histories) ? histories : []) rows.push(...(history?.historyNodes || []));
  return indexBy(rows, (row) => text(row?.historyNodeId));
}

function indexBy(rows, keyFn) {
  const result = new Map();
  for (const row of Array.isArray(rows) ? rows : []) result.set(keyFn(row), row);
  return result;
}

function semanticHistory(history) {
  return history ? canonicalSemanticJson(normalizeLineHistorySemantic(history)) : '';
}

function sortedAliases(values) {
  return (Array.isArray(values) ? values : []).map(text).sort();
}

function canonicalSort(a, b) { return canonicalSemanticJson(a).localeCompare(canonicalSemanticJson(b)); }
