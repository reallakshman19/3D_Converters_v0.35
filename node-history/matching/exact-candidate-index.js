import { canonicalSemanticJson, deepFreeze } from '../../contracts/topo-enriched-xml/contract-core.js';
import {
  collectHistoricalIdentityEvidence,
  compareEvidence,
  evidenceToken,
  hasAutomaticAuthority,
  strongestEvidence,
} from './identity-normalizer.js';

const ACTIVE_STATES = new Set(['ACTIVE', 'REACTIVATED']);

export function buildExactCandidateIndex(previousRegistry, policy = {}) {
  const histories = flattenHistoricalNodes(previousRegistry)
    .map((row) => cloneHistoryRow(row, policy))
    .sort(compareHistoryRows);
  const duplicateHistoryIds = duplicateIds(histories);
  const byToken = new Map();
  for (const row of histories) {
    for (const evidence of row.evidence) {
      const key = evidenceToken(evidence);
      const bucket = byToken.get(key) || [];
      bucket.push(row);
      byToken.set(key, bucket);
    }
  }
  for (const bucket of byToken.values()) deepFreeze(bucket.sort(compareHistoryRows));
  deepFreeze(histories);
  const duplicateIds_ = Object.freeze([...duplicateHistoryIds].sort());
  return Object.freeze({
    histories,
    duplicateHistoryIds: duplicateIds_,
    lookupToken: (token) => byToken.get(token) || Object.freeze([]),
    hasDuplicateHistoryId: (historyNodeId) => duplicateHistoryIds.has(historyNodeId),
  });
}

export function generateExactCandidates(currentEvidence, index) {
  const byHistoryId = new Map();
  for (const current of currentEvidence) {
    const matches = index.lookupToken(evidenceToken(current));
    for (const historyRow of matches) {
      const id = historyRow.historyNodeId;
      const candidate = byHistoryId.get(id) || candidateRow(historyRow, index.hasDuplicateHistoryId(id));
      candidate.evidence.push(pairEvidence(current, matchingHistoryEvidence(current, historyRow.evidence)));
      byHistoryId.set(id, candidate);
    }
  }
  return [...byHistoryId.values()].map(finishCandidate).sort(compareCandidates);
}

export function resolveMatcherRoot(input) {
  const config = input.config || {}, inventory = input.sourceInventory || {}, registry = input.previousRegistry || {};
  return {
    projectId: required(first(config.projectId, inventory.projectId, registry.projectId, registry.zoneRegistry?.projectId), 'projectId'),
    zoneId: required(first(config.zoneId, inventory.zoneId, registry.zoneId, registry.zoneRegistry?.zoneId), 'zoneId'),
    mainLineKey: required(first(config.mainLineKey, uniqueNodeValue(input.currentLogicalNodes, 'mainLineKey')), 'mainLineKey'),
    coordinateFrameId: required(first(config.coordinateFrameId, inventory.coordinateFrameId), 'coordinateFrameId'),
    logicalTopologyHash: required(first(config.logicalTopologyHash, input.logicalTopologyHash), 'logicalTopologyHash'),
    baseRegistrySnapshotHash: required(first(config.baseRegistrySnapshotHash, registry.registrySnapshotHash,
      registry.snapshotManifest?.registrySnapshotHash), 'baseRegistrySnapshotHash'),
  };
}

export function validateMatcherAuthority(input, root, nodes) {
  const issues = [], inventory = input.sourceInventory || {}, registry = input.previousRegistry || {};
  compareClaim(issues, 'SOURCE_INVENTORY_PROJECT_MISMATCH', inventory.projectId, root.projectId);
  compareClaim(issues, 'SOURCE_INVENTORY_ZONE_MISMATCH', inventory.zoneId, root.zoneId);
  compareClaim(issues, 'COORDINATE_FRAME_MISMATCH', inventory.coordinateFrameId, root.coordinateFrameId);
  compareClaim(issues, 'REGISTRY_PROJECT_MISMATCH', first(registry.projectId, registry.zoneRegistry?.projectId), root.projectId);
  compareClaim(issues, 'REGISTRY_ZONE_MISMATCH', first(registry.zoneId, registry.zoneRegistry?.zoneId), root.zoneId);
  compareClaim(issues, 'BASE_REGISTRY_SNAPSHOT_HASH_MISMATCH',
    first(registry.registrySnapshotHash, registry.snapshotManifest?.registrySnapshotHash), root.baseRegistrySnapshotHash);
  compareClaim(issues, 'LOGICAL_TOPOLOGY_HASH_MISMATCH', input.logicalTopologyHash, root.logicalTopologyHash);
  for (const parent of asArray(registry.lineHistories)) {
    compareClaim(issues, 'LINE_HISTORY_PROJECT_MISMATCH', parent.projectId, root.projectId, { mainLineKey: clean(parent.mainLineKey) });
    compareClaim(issues, 'LINE_HISTORY_ZONE_MISMATCH', parent.zoneId, root.zoneId, { mainLineKey: clean(parent.mainLineKey) });
  }
  for (const node of nodes) {
    compareClaim(issues, 'CURRENT_NODE_PROJECT_MISMATCH', node.projectId, root.projectId, { logicalNodeId: clean(node.logicalNodeId) });
    compareClaim(issues, 'CURRENT_NODE_ZONE_MISMATCH', node.zoneId, root.zoneId, { logicalNodeId: clean(node.logicalNodeId) });
  }
  if (!validCoverage(input.coverage)) issues.push({ code: 'COVERAGE_INVALID', evidence: {} });
  if (!validTimestamp(input.evaluatedAt)) issues.push({ code: 'EVALUATED_AT_INVALID', evidence: { evaluatedAt: clean(input.evaluatedAt) } });
  return issues.sort(issueSort);
}

export function buildExactRetirementCandidates(index, states, coverage, root) {
  if (!permitsRetirement(coverage)) return [];
  const observed = new Set(states.flatMap((state) => state.candidates
    .filter((row) => row.status !== 'REJECTED_HARD').map((row) => row.historyNodeId)));
  return index.histories.filter((row) => !observed.has(row.historyNodeId))
    .filter((row) => !index.duplicateHistoryIds.includes(row.historyNodeId))
    .filter((row) => ACTIVE_STATES.has(lifecycle(row.history)))
    .filter((row) => coveredHistory(row, coverage, root))
    .map((row) => ({
      historyNodeId: row.historyNodeId,
      mainLineKey: first(row.history.mainLineKey, row.parent.mainLineKey),
      disposition: 'RETIREMENT_CANDIDATE_ONLY',
      reason: 'NOT_OBSERVED_IN_COMPLETE_AUTHORITATIVE_COVERAGE',
    })).sort((a, b) => a.historyNodeId.localeCompare(b.historyNodeId));
}

export function compareCandidates(left, right) {
  return left.historyNodeId.localeCompare(right.historyNodeId);
}

function cloneHistoryRow(row, policy) {
  const history = structuredClone(row.history);
  const parent = parentAuthority(row.parent);
  return {
    ...row,
    history,
    parent,
    evidence: collectHistoricalIdentityEvidence(history, parent, policy),
  };
}

function parentAuthority(parent) {
  return {
    projectId: clean(parent?.projectId),
    zoneId: clean(parent?.zoneId),
    mainLineKey: clean(parent?.mainLineKey),
    registryVersion: clean(parent?.registryVersion),
    coordinateRegistrationRef: clean(parent?.coordinateRegistrationRef),
    sourceSystem: clean(parent?.sourceSystem),
    sourceIdentity: structuredClone(parent?.sourceIdentity || {}),
  };
}

function candidateRow(historyRow, duplicateHistoryId) {
  return {
    historyNodeId: historyRow.historyNodeId,
    history: historyRow.history,
    parent: historyRow.parent,
    duplicateHistoryId,
    historyEvidence: historyRow.evidence,
    evidence: [],
  };
}

function finishCandidate(candidate) {
  const evidence = candidate.evidence.sort(comparePairedEvidence);
  const primary = strongestEvidence(evidence.map((row) => row.current));
  return deepFreeze({ ...candidate, evidence, primaryEvidence: primary });
}

function pairEvidence(current, historical) {
  return Object.freeze({
    current,
    historical,
    automaticAuthority: hasAutomaticAuthority(current) && hasAutomaticAuthority(historical),
  });
}

function matchingHistoryEvidence(current, historicalEvidence) {
  const token = evidenceToken(current);
  return historicalEvidence.filter((row) => evidenceToken(row) === token).sort(compareEvidence)[0];
}

function comparePairedEvidence(left, right) {
  return compareEvidence(left.current, right.current)
    || compareEvidence(left.historical, right.historical);
}

function flattenHistoricalNodes(previousRegistry) {
  const rows = [];
  const lineHistories = Array.isArray(previousRegistry?.lineHistories)
    ? previousRegistry.lineHistories : [];
  for (const parent of lineHistories) {
    for (const history of asArray(parent?.historyNodes)) rows.push(historyRow(history, parent));
  }
  for (const history of asArray(previousRegistry?.historyNodes)) rows.push(historyRow(history, previousRegistry));
  return rows;
}

function historyRow(history, parent) {
  const historyNodeId = clean(history?.historyNodeId);
  if (!historyNodeId) throw new TypeError('Historical node requires historyNodeId.');
  const mainLineKey = clean(history?.mainLineKey || parent?.mainLineKey);
  return {
    historyNodeId,
    history,
    parent,
    recordKey: `${historyNodeId}\u0000${mainLineKey}\u0000${canonicalSemanticJson(history)}`,
  };
}

function duplicateIds(histories) {
  const counts = new Map();
  for (const row of histories) counts.set(row.historyNodeId, (counts.get(row.historyNodeId) || 0) + 1);
  return new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id));
}

function compareHistoryRows(left, right) {
  return left.historyNodeId.localeCompare(right.historyNodeId)
    || left.recordKey.localeCompare(right.recordKey);
}

function compareClaim(issues, code, actual, expected, evidence = {}) {
  const left = clean(actual);
  if (left && left !== clean(expected)) issues.push({ code, evidence: { ...evidence, expected: clean(expected), actual: left } });
}
function permitsRetirement(coverage) {
  return coverage?.authoritativeForRetirement === true && ['FULL_LINE', 'FULL_ZONE'].includes(clean(coverage.scope));
}
function coveredHistory(row, coverage, root) {
  if (first(row.parent.projectId, row.history.projectId) !== root.projectId) return false;
  if (first(row.parent.zoneId, row.history.zoneId) !== root.zoneId) return false;
  if (coverage.scope === 'FULL_ZONE') return true;
  const line = first(row.history.mainLineKey, row.parent.mainLineKey);
  return line === root.mainLineKey || asArray(coverage.coveredMainLines).map(clean).includes(line);
}
function validCoverage(coverage) {
  return Boolean(coverage) && ['PARTIAL_LINE', 'FULL_LINE', 'FULL_ZONE'].includes(clean(coverage.scope))
    && typeof coverage.authoritativeForRetirement === 'boolean';
}
function validTimestamp(raw) {
  const value = clean(raw);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}
function uniqueNodeValue(nodes, field) {
  const values = [...new Set(asArray(nodes).map((row) => clean(row?.[field])).filter(Boolean))];
  return values.length === 1 ? values[0] : '';
}
function lifecycle(history) { return first(history.lifecycleStatus, history.status).toUpperCase(); }
function issueSort(a, b) { return `${a.code}|${JSON.stringify(a.evidence)}`.localeCompare(`${b.code}|${JSON.stringify(b.evidence)}`); }
function required(value, field) { const result = clean(value); if (!result) throw new TypeError(`${field} is required.`); return result; }
function first(...values) { return clean(values.find((item) => item !== undefined && item !== null && clean(item))); }
function clean(value) { return String(value ?? '').trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
