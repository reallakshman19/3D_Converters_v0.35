import { canonicalSemanticJson, text } from '../../contracts/topo-enriched-xml/contract-core.js';
import { issue } from '../registry/registry-contracts.js';

const OBSERVED_STATES = new Set(['ACTIVE', 'REACTIVATED']);

export function validateBootstrapLifecycle({
  seedLineHistories,
  acceptedMatches,
  historyMatchResult,
  allocationResult,
  revision,
  approval,
}) {
  const blockers = [];
  const histories = indexHistories(seedLineHistories, blockers);
  const currentHistoryIds = new Set([...acceptedMatches.values()]
    .filter((row) => row.kind !== 'NEW').map((row) => row.historyNodeId));
  const retirementCandidates = indexRows(historyMatchResult?.retirementCandidates, 'historyNodeId', 'RETIREMENT_CANDIDATE', blockers);
  const retirementRows = indexRows(allocationResult?.retirements, 'historyNodeId', 'RETIREMENT_INTENT', blockers);
  const reactivationMatches = indexReactivationMatches(acceptedMatches);
  const reactivationRows = indexRows(allocationResult?.reactivations, 'logicalNodeId', 'REACTIVATION_INTENT', blockers);
  const retirementEvidence = indexEvidence(revision?.retirements, 'RETIREMENT', revision, approval, blockers);
  const reactivationEvidence = indexEvidence(revision?.reactivations, 'REACTIVATION', revision, approval, blockers);
  requireSameKeys(retirementCandidates, retirementRows, 'RETIREMENT_CANDIDATE_ALLOCATION_DRIFT', blockers);
  requireSameKeys(retirementRows, retirementEvidence, 'RETIREMENT_EVIDENCE_DRIFT', blockers);
  requireSameKeys(reactivationMatches, reactivationRows, 'REACTIVATION_MATCH_ALLOCATION_DRIFT', blockers);
  requireSameHistoryKeys(reactivationMatches, reactivationEvidence, blockers);
  validateRetirements({ histories, currentHistoryIds, retirementCandidates, retirementRows, blockers });
  validateReactivations({ histories, reactivationMatches, reactivationRows, allocationResult, blockers });
  return { retirementRows, reactivationRows, retirementEvidence, reactivationEvidence, blockers: sortIssues(blockers) };
}

function indexHistories(histories, blockers) {
  const result = new Map();
  for (const history of Array.isArray(histories) ? histories : []) for (const node of history?.historyNodes || []) {
    const historyNodeId = text(node?.historyNodeId);
    if (!historyNodeId || result.has(historyNodeId)) blockers.push(issue('BOOTSTRAP_IDENTITY_CONFLICT', {
      historyNodeId, reason: 'DUPLICATE_OR_MISSING_SEED_HISTORY_IDENTITY',
    }));
    else result.set(historyNodeId, { node, mainLineKey: text(history?.mainLineKey) });
  }
  return result;
}

function indexRows(rows, keyField, kind, blockers) {
  const result = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = text(row?.[keyField]);
    if (!key || result.has(key)) blockers.push(issue('BOOTSTRAP_LIFECYCLE_CONFLICT', {
      kind, [keyField]: key, reason: 'DUPLICATE_OR_MISSING_LIFECYCLE_CLAIM',
    }));
    else result.set(key, structuredClone(row));
  }
  return result;
}

function indexReactivationMatches(acceptedMatches) {
  return new Map([...acceptedMatches].filter(([, row]) => row.kind === 'REACTIVATE'));
}

function indexEvidence(rows, kind, revision, approval, blockers) {
  const result = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const historyNodeId = text(row?.historyNodeId);
    const evidence = { authority: text(row?.authority), revisionId: text(row?.revisionId), reason: text(row?.reason) };
    if (!historyNodeId || result.has(historyNodeId) || !Object.values(evidence).every(Boolean)) blockers.push(issue(
      'BOOTSTRAP_LIFECYCLE_CONFLICT', { kind, historyNodeId, reason: 'LIFECYCLE_EVIDENCE_INVALID_OR_DUPLICATE' },
    ));
    else result.set(historyNodeId, evidence);
    if (evidence.revisionId !== text(revision?.revisionId) || evidence.authority !== text(approval?.authority)) blockers.push(issue(
      'BOOTSTRAP_APPROVAL_SCOPE_MISMATCH', {
        kind, historyNodeId, expectedRevision: text(revision?.revisionId), actualRevision: evidence.revisionId,
        expectedAuthority: text(approval?.authority), actualAuthority: evidence.authority,
      },
    ));
  }
  return result;
}

function validateRetirements(values) {
  const { histories, currentHistoryIds, retirementCandidates, retirementRows, blockers } = values;
  for (const [historyNodeId, row] of retirementRows) {
    const candidate = retirementCandidates.get(historyNodeId), record = histories.get(historyNodeId);
    if (!candidate || !record) continue;
    if (currentHistoryIds.has(historyNodeId)) blockers.push(issue('BOOTSTRAP_LIFECYCLE_CONFLICT', {
      historyNodeId, reason: 'CURRENT_HISTORY_CANNOT_BE_RETIRED',
    }));
    if (!OBSERVED_STATES.has(text(record.node?.lifecycleStatus))) blockers.push(issue('BOOTSTRAP_LIFECYCLE_CONFLICT', {
      historyNodeId, lifecycleStatus: text(record.node?.lifecycleStatus), reason: 'RETIREMENT_SOURCE_STATE_INVALID',
    }));
    compareField(historyNodeId, 'mainLineKey', record.mainLineKey, text(candidate?.mainLineKey), blockers);
    compareField(historyNodeId, 'mainLineKey', record.mainLineKey, text(row?.mainLineKey), blockers);
    compareField(historyNodeId, 'engineeringNodeNumber', record.node?.engineeringNodeNumber, row?.engineeringNodeNumber, blockers);
    if (text(candidate?.reason) !== text(row?.reason)) blockers.push(issue('BOOTSTRAP_LIFECYCLE_CONFLICT', {
      historyNodeId, reason: 'RETIREMENT_REASON_MISMATCH', candidateReason: text(candidate?.reason), allocationReason: text(row?.reason),
    }));
  }
}

function validateReactivations(values) {
  const { histories, reactivationMatches, reactivationRows, allocationResult, blockers } = values;
  const allocations = new Map((allocationResult?.allocations || []).map((row) => [text(row?.logicalNodeId), row]));
  const historyOwners = new Map();
  for (const [logicalNodeId, row] of reactivationRows) {
    const match = reactivationMatches.get(logicalNodeId), allocation = allocations.get(logicalNodeId);
    const historyNodeId = text(row?.historyNodeId), record = histories.get(historyNodeId);
    if (historyOwners.has(historyNodeId)) blockers.push(issue('BOOTSTRAP_LIFECYCLE_CONFLICT', {
      historyNodeId, reason: 'DUPLICATE_REACTIVATION_HISTORY_OWNER', logicalNodeIds: [historyOwners.get(historyNodeId), logicalNodeId].sort(),
    }));
    else historyOwners.set(historyNodeId, logicalNodeId);
    if (!match || !allocation || !record) continue;
    compareField(logicalNodeId, 'historyNodeId', match.historyNodeId, historyNodeId, blockers);
    compareField(logicalNodeId, 'historyNodeId', match.historyNodeId, text(allocation?.historyNodeId), blockers);
    compareField(logicalNodeId, 'mainLineKey', record.mainLineKey, text(row?.mainLineKey), blockers);
    compareField(logicalNodeId, 'mainLineKey', record.mainLineKey, text(allocation?.mainLineKey), blockers);
    compareField(logicalNodeId, 'engineeringNodeNumber', record.node?.engineeringNodeNumber, row?.engineeringNodeNumber, blockers);
    compareField(logicalNodeId, 'engineeringNodeNumber', record.node?.engineeringNodeNumber, allocation?.engineeringNodeNumber, blockers);
    if (text(record.node?.lifecycleStatus) !== 'RETIRED') blockers.push(issue('BOOTSTRAP_LIFECYCLE_CONFLICT', {
      logicalNodeId, historyNodeId, lifecycleStatus: text(record.node?.lifecycleStatus), reason: 'REACTIVATION_SOURCE_STATE_INVALID',
    }));
  }
}

function requireSameKeys(left, right, reason, blockers) {
  const leftKeys = new Set(left.keys()), rightKeys = new Set(right.keys());
  if (!sameSet(leftKeys, rightKeys)) blockers.push(issue('BOOTSTRAP_LIFECYCLE_CONFLICT', {
    reason, expected: [...leftKeys].sort(), actual: [...rightKeys].sort(),
  }));
}

function requireSameHistoryKeys(matches, evidence, blockers) {
  const expected = new Set([...matches.values()].map((row) => row.historyNodeId));
  const actual = new Set(evidence.keys());
  if (!sameSet(expected, actual)) blockers.push(issue('BOOTSTRAP_LIFECYCLE_CONFLICT', {
    reason: 'REACTIVATION_EVIDENCE_DRIFT', expected: [...expected].sort(), actual: [...actual].sort(),
  }));
}

function compareField(ownerId, field, expected, actual, blockers) {
  if (expected !== actual) blockers.push(issue('BOOTSTRAP_LIFECYCLE_CONFLICT', { ownerId, field, expected, actual }));
}
function sameSet(left, right) { return left.size === right.size && [...left].every((value) => right.has(value)); }
function issueKey(row) { return `${text(row?.code)}|${canonicalSemanticJson(row?.evidence || {})}`; }
function sortIssues(rows) { return [...rows].sort((a, b) => issueKey(a).localeCompare(issueKey(b))); }
