import { canonicalSemanticJson, text } from '../../contracts/topo-enriched-xml/contract-core.js';
import { issue } from '../registry/registry-contracts.js';

const OBSERVED_STATES = new Set(['ACTIVE', 'REACTIVATED']);

export function buildProposedLineHistories(input) {
  const context = prepareHistoryContext(input);
  materializeCurrentNodes(context, input);
  applyRetirements({
    retirementRows: context.retirementRows,
    historyById: context.historyById,
    retirementEvidence: context.retirementEvidence,
    revision: input.revision,
    coverage: input.coverage,
    operations: context.operations,
    blockers: context.blockers,
  });
  for (const history of context.proposed) finalizeHistory(history, input.evaluatedAt);
  return {
    proposedLineHistories: context.proposed.sort((a, b) => text(a.mainLineKey).localeCompare(text(b.mainLineKey))),
    operations: context.operations.sort(compareOperation),
    blockers: sortIssues(context.blockers),
  };
}

function prepareHistoryContext(input) {
  const blockers = [], operations = [];
  const proposed = structuredClone(Array.isArray(input.seedLineHistories) ? input.seedLineHistories : []);
  return {
    blockers, operations, proposed,
    lineByKey: new Map(proposed.map((row) => [text(row?.mainLineKey), row])),
    historyById: indexHistoryNodes(proposed, blockers),
    assignmentByLogical: new Map(input.identityAssignments.assignments.map((row) => [row.logicalNodeId, row])),
    reactivationEvidence: input.lifecycle?.reactivationEvidence || new Map(),
    retirementEvidence: input.lifecycle?.retirementEvidence || new Map(),
    allocatorReactivations: input.lifecycle?.reactivationRows || new Map(),
    retirementRows: input.lifecycle?.retirementRows || new Map(),
  };
}

function materializeCurrentNodes(context, input) {
  for (const logicalNodeId of [...input.current.keys()].sort()) {
    const node = input.current.get(logicalNodeId), match = input.acceptedMatches.get(logicalNodeId);
    const allocation = input.allocations.get(logicalNodeId);
    if (!node || !match || !allocation) continue;
    if (match.kind === 'NEW') addNewHistoryNode({
      node, allocation, assignment: context.assignmentByLogical.get(logicalNodeId),
      lineByKey: context.lineByKey, historyById: context.historyById,
      revision: input.revision, operations: context.operations, blockers: context.blockers,
    });
    else if (match.kind === 'REACTIVATE') reactivateHistoryNode({
      node, match, allocation, historyById: context.historyById,
      reactivationEvidence: context.reactivationEvidence,
      allocatorReactivations: context.allocatorReactivations,
      revision: input.revision, operations: context.operations, blockers: context.blockers,
    });
    else preserveHistoryNode({ node, match, allocation, historyById: context.historyById, revision: input.revision, blockers: context.blockers });
  }
}

function addNewHistoryNode(values) {
  const { node, allocation, assignment, lineByKey, historyById, revision, operations, blockers } = values;
  if (!assignment) return;
  if (assignment.mainLineKey !== node.mainLineKey || text(allocation.mainLineKey) !== node.mainLineKey) {
    blockers.push(issue('BOOTSTRAP_IDENTITY_CONFLICT', {
      logicalNodeId: node.logicalNodeId, assignmentMainLineKey: assignment.mainLineKey,
      allocationMainLineKey: text(allocation.mainLineKey), currentMainLineKey: node.mainLineKey,
    }));
    return;
  }
  const line = lineByKey.get(node.mainLineKey);
  if (!line) {
    blockers.push(issue('BOOTSTRAP_RECONCILIATION_INCOMPLETE', {
      logicalNodeId: node.logicalNodeId, mainLineKey: node.mainLineKey, reason: 'SEED_LINE_HISTORY_MISSING',
    }));
    return;
  }
  if (historyById.has(assignment.historyNodeId)) {
    blockers.push(issue('BOOTSTRAP_IDENTITY_CONFLICT', { historyNodeId: assignment.historyNodeId }));
    return;
  }
  const historyNode = newHistoryNode(assignment, allocation, revision);
  line.historyNodes.push(historyNode);
  historyById.set(historyNode.historyNodeId, { node: historyNode, mainLineKey: node.mainLineKey });
  operations.push({
    operationId: operationId('ADD_NODE', historyNode.historyNodeId), type: 'ADD_NODE',
    historyNodeId: historyNode.historyNodeId, mainLineKey: node.mainLineKey,
    logicalNodeId: node.logicalNodeId, engineeringNodeNumber: historyNode.engineeringNodeNumber,
    evidence: {
      authority: assignment.identityAuthority, revisionId: text(revision?.revisionId),
      reason: 'APPROVED_DURABLE_HISTORY_IDENTITY_ASSIGNMENT', approvalRecordId: assignment.approvalRecordId,
    },
  });
}

function preserveHistoryNode({ node, match, allocation, historyById, revision, blockers }) {
  const record = historyById.get(match.historyNodeId);
  if (!record) return blockers.push(issue('BOOTSTRAP_RECONCILIATION_INCOMPLETE', {
    logicalNodeId: node.logicalNodeId, historyNodeId: match.historyNodeId, reason: 'MATCH_HISTORY_MISSING',
  }));
  if (record.mainLineKey !== node.mainLineKey || text(allocation.mainLineKey) !== record.mainLineKey) return blockers.push(issue(
    'BOOTSTRAP_IDENTITY_CONFLICT', { logicalNodeId: node.logicalNodeId, historyNodeId: match.historyNodeId, reason: 'MAIN_LINE_MISMATCH' },
  ));
  if (record.node.engineeringNodeNumber !== allocation.engineeringNodeNumber) return blockers.push(issue(
    'BOOTSTRAP_LIFECYCLE_CONFLICT', { logicalNodeId: node.logicalNodeId, historyNodeId: match.historyNodeId, reason: 'ACTIVE_HISTORY_RENUMBERING' },
  ));
  if (!OBSERVED_STATES.has(text(record.node.lifecycleStatus))) return blockers.push(issue(
    'BOOTSTRAP_LIFECYCLE_CONFLICT', { historyNodeId: match.historyNodeId, lifecycleStatus: record.node.lifecycleStatus },
  ));
  record.node.lastObservedRevision = text(revision?.revisionId);
}

function reactivateHistoryNode(values) {
  const { node, match, allocation, historyById, reactivationEvidence, allocatorReactivations, revision, operations, blockers } = values;
  const record = historyById.get(match.historyNodeId);
  const evidence = reactivationEvidence.get(match.historyNodeId);
  const allocatorRow = allocatorReactivations.get(node.logicalNodeId);
  if (!record || text(record.node.lifecycleStatus) !== 'RETIRED') return blockers.push(issue('BOOTSTRAP_LIFECYCLE_CONFLICT', {
    logicalNodeId: node.logicalNodeId, historyNodeId: match.historyNodeId, reason: 'REACTIVATION_REQUIRES_RETIRED_SAME_IDENTITY',
  }));
  if (!evidence || !allocatorRow || text(allocatorRow.historyNodeId) !== match.historyNodeId) return blockers.push(issue(
    'BOOTSTRAP_LIFECYCLE_CONFLICT', { logicalNodeId: node.logicalNodeId, historyNodeId: match.historyNodeId, reason: 'REACTIVATION_EVIDENCE_MISSING' },
  ));
  if (!sameReactivationOwner(record, node, allocation, allocatorRow)) return blockers.push(issue(
    'BOOTSTRAP_LIFECYCLE_CONFLICT', { logicalNodeId: node.logicalNodeId, historyNodeId: match.historyNodeId, reason: 'REACTIVATION_OWNER_MISMATCH' },
  ));
  record.node.lifecycleStatus = 'REACTIVATED';
  record.node.lastObservedRevision = text(revision?.revisionId);
  record.node.reactivationEvidence = evidence;
  operations.push({
    operationId: operationId('REACTIVATE_NODE', match.historyNodeId), type: 'REACTIVATE_NODE',
    historyNodeId: match.historyNodeId, mainLineKey: record.mainLineKey, evidence,
  });
}

function sameReactivationOwner(record, node, allocation, allocatorRow) {
  return record.mainLineKey === node.mainLineKey
    && text(allocation.mainLineKey) === record.mainLineKey
    && text(allocatorRow.mainLineKey) === record.mainLineKey
    && record.node.engineeringNodeNumber === allocation.engineeringNodeNumber
    && record.node.engineeringNodeNumber === allocatorRow.engineeringNodeNumber;
}

function applyRetirements(values) {
  const { retirementRows, historyById, retirementEvidence, revision, coverage, operations, blockers } = values;
  const rows = [...retirementRows.values()];
  if (rows.length && !permitsRetirement(coverage)) {
    blockers.push(issue('PARTIAL_COVERAGE_RETIREMENT_PROHIBITED', { count: rows.length, scope: coverage?.scope }));
    return;
  }
  const covered = new Set(coveredLines(coverage));
  for (const row of rows) applyRetirementRow({ row, historyById, retirementEvidence, revision, coverage, covered, operations, blockers });
}

function applyRetirementRow(values) {
  const { row, historyById, retirementEvidence, revision, coverage, covered, operations, blockers } = values;
  const historyNodeId = text(row?.historyNodeId), record = historyById.get(historyNodeId);
  const evidence = retirementEvidence.get(historyNodeId);
  if (!record || !evidence || !OBSERVED_STATES.has(text(record.node.lifecycleStatus))) {
    blockers.push(issue('BOOTSTRAP_LIFECYCLE_CONFLICT', { historyNodeId, reason: 'RETIREMENT_AUTHORITY_INVALID' }));
    return;
  }
  if (coverage.scope === 'FULL_LINE' && !covered.has(record.mainLineKey)) {
    blockers.push(issue('PARTIAL_COVERAGE_RETIREMENT_PROHIBITED', { historyNodeId, mainLineKey: record.mainLineKey }));
    return;
  }
  if (record.node.engineeringNodeNumber !== row.engineeringNodeNumber || record.mainLineKey !== text(row.mainLineKey)) {
    blockers.push(issue('BOOTSTRAP_LIFECYCLE_CONFLICT', { historyNodeId, reason: 'RETIREMENT_OWNER_MISMATCH' }));
    return;
  }
  record.node.lifecycleStatus = 'RETIRED';
  record.node.lastObservedRevision = text(revision?.revisionId);
  record.node.retirementEvidence = evidence;
  operations.push({
    operationId: operationId('RETIRE_NODE', historyNodeId), type: 'RETIRE_NODE',
    historyNodeId, mainLineKey: record.mainLineKey, evidence,
  });
}

function newHistoryNode(assignment, allocation, revision) {
  const revisionId = text(revision?.revisionId);
  return {
    historyNodeId: assignment.historyNodeId,
    engineeringNodeNumber: allocation.engineeringNodeNumber,
    lifecycleStatus: 'ACTIVE',
    sourceAliases: structuredClone(assignment.sourceAliases),
    identityEvidence: structuredClone(assignment.identityEvidence),
    immutableFacts: {
      historyNodeId: assignment.historyNodeId,
      engineeringNodeNumber: allocation.engineeringNodeNumber,
      mainLineKey: assignment.mainLineKey,
      firstObservedRevision: revisionId,
    },
    firstObservedRevision: revisionId,
    lastObservedRevision: revisionId,
    retirementEvidence: null,
    reactivationEvidence: null,
    supersessionEvidence: null,
    supersededByHistoryNodeId: null,
  };
}

function indexHistoryNodes(histories, blockers) {
  const result = new Map();
  for (const history of histories) for (const node of history?.historyNodes || []) {
    const historyNodeId = text(node?.historyNodeId);
    if (!historyNodeId || result.has(historyNodeId)) blockers.push(issue('BOOTSTRAP_IDENTITY_CONFLICT', {
      historyNodeId, reason: 'DUPLICATE_SEED_HISTORY_IDENTITY',
    }));
    else result.set(historyNodeId, { node, mainLineKey: text(history.mainLineKey) });
  }
  return result;
}

function finalizeHistory(history, evaluatedAt) {
  history.historyNodes = [...(history.historyNodes || [])].map(sortHistoryEvidence).sort(compareHistoryNode);
  history.validation = { status: 'PASS', blockers: [], reviewItems: [], warnings: [] };
  history.audit = { evaluatedAt: text(evaluatedAt) };
  history.lineHistoryHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
}
function sortHistoryEvidence(node) {
  const result = structuredClone(node);
  result.sourceAliases = [...(result.sourceAliases || [])].map(text).sort();
  result.identityEvidence = [...(result.identityEvidence || [])].sort((a, b) => canonicalSemanticJson(a).localeCompare(canonicalSemanticJson(b)));
  return result;
}
function compareHistoryNode(a, b) { return a.engineeringNodeNumber - b.engineeringNodeNumber || text(a.historyNodeId).localeCompare(text(b.historyNodeId)); }
function compareOperation(a, b) { return text(a.operationId).localeCompare(text(b.operationId)); }
function operationId(type, historyNodeId) { return `BOOTSTRAP:${type}:${historyNodeId}`; }
function permitsRetirement(coverage) { return coverage?.authoritativeForRetirement === true && ['FULL_LINE', 'FULL_ZONE'].includes(text(coverage?.scope)); }
function coveredLines(coverage) { return [...new Set((coverage?.mainLineKeys || coverage?.coveredMainLines || []).map(text))].sort(); }
function issueKey(row) { return `${text(row?.code)}|${canonicalSemanticJson(row?.evidence || {})}`; }
function sortIssues(rows) { return [...rows].sort((a, b) => issueKey(a).localeCompare(issueKey(b))); }
