import { canonicalSemanticJson, deepFreeze, isRecord, text } from '../../contracts/topo-enriched-xml/contract-core.js';
import { buildValidation, issue } from './registry-contracts.js';

export const ACTIVE_LIFECYCLE_STATES = Object.freeze(new Set([
  'ACTIVE', 'REACTIVATED', 'REVIEW_REQUIRED',
]));

const LIFECYCLE_OPERATION_TYPES = new Set([
  'ADD_NODE', 'RETIRE_NODE', 'REACTIVATE_NODE', 'SUPERSEDE_NODE',
  'MARK_REVIEW_REQUIRED', 'ACTIVATE_NODE',
]);
const ALLOWED_TRANSITIONS = Object.freeze({
  ACTIVE: new Set(['RETIRED', 'SUPERSEDED', 'REVIEW_REQUIRED']),
  RETIRED: new Set(['REACTIVATED', 'REVIEW_REQUIRED']),
  REACTIVATED: new Set(['ACTIVE', 'RETIRED', 'SUPERSEDED', 'REVIEW_REQUIRED']),
  SUPERSEDED: new Set(['REVIEW_REQUIRED']),
  REVIEW_REQUIRED: new Set(['ACTIVE', 'RETIRED', 'REACTIVATED', 'SUPERSEDED']),
});

export function validateLifecycleChanges({ baseLineHistories, proposedLineHistories, operations = [] }) {
  const blockers = [];
  const base = indexNodes(baseLineHistories, blockers, 'BASE');
  const proposed = indexNodes(proposedLineHistories, blockers, 'PROPOSED');
  const operationByNode = indexLifecycleOperations(operations, blockers);
  for (const [historyNodeId, before] of base.entries()) {
    const after = proposed.get(historyNodeId);
    if (!after) {
      blockers.push(issue('HISTORY_NODE_DELETION_PROHIBITED', { historyNodeId }));
      continue;
    }
    validateImmutableFacts(before, after, blockers);
    validateTransition(before, after, operationByNode.get(historyNodeId), blockers);
  }
  for (const [historyNodeId, after] of proposed.entries()) {
    if (base.has(historyNodeId)) continue;
    const operation = operationByNode.get(historyNodeId);
    if (text(operation?.type) !== 'ADD_NODE') blockers.push(issue('NEW_HISTORY_NODE_OPERATION_MISSING', { historyNodeId }));
    if (!ACTIVE_LIFECYCLE_STATES.has(text(after.lifecycleStatus))) blockers.push(issue('NEW_HISTORY_NODE_STATE_INVALID', {
      historyNodeId, lifecycleStatus: after.lifecycleStatus,
    }));
  }
  validateRetiredNumberOwnership(base, proposed, blockers);
  return deepFreeze(buildValidation(blockers));
}

export function validLifecycleEvidence(value) {
  return isRecord(value) && text(value.authority) && text(value.revisionId) && text(value.reason);
}

function validateTransition(before, after, operation, blockers) {
  if (before.lifecycleStatus === after.lifecycleStatus) {
    if (operation && text(operation.type) !== 'ADD_NODE') blockers.push(issue('LIFECYCLE_OPERATION_NO_STATE_CHANGE', { historyNodeId: before.historyNodeId }));
    return;
  }
  const allowed = ALLOWED_TRANSITIONS[text(before.lifecycleStatus)];
  if (!allowed?.has(text(after.lifecycleStatus))) blockers.push(issue('INVALID_LIFECYCLE_TRANSITION', {
    historyNodeId: before.historyNodeId, from: before.lifecycleStatus, to: after.lifecycleStatus,
  }));
  const expectedType = operationTypeForStatus(after.lifecycleStatus);
  if (text(operation?.type) !== expectedType || !validLifecycleEvidence(operation?.evidence)) blockers.push(issue('LIFECYCLE_TRANSITION_EVIDENCE_MISSING', {
    historyNodeId: before.historyNodeId, expectedType,
  }));
  const storedEvidence = lifecycleEvidenceForStatus(after);
  if (storedEvidence && operation && canonicalSemanticJson(operation.evidence) !== canonicalSemanticJson(storedEvidence)) {
    blockers.push(issue('LIFECYCLE_OPERATION_EVIDENCE_MISMATCH', { historyNodeId: before.historyNodeId, expectedType }));
  }
}

function validateImmutableFacts(before, after, blockers) {
  for (const field of ['historyNodeId', 'engineeringNodeNumber', 'firstObservedRevision']) {
    if (before[field] !== after[field]) blockers.push(issue('IMMUTABLE_HISTORICAL_FACT_CHANGED', { historyNodeId: before.historyNodeId, field }));
  }
  if (canonicalSemanticJson(before.immutableFacts) !== canonicalSemanticJson(after.immutableFacts)) {
    blockers.push(issue('IMMUTABLE_HISTORICAL_FACT_CHANGED', { historyNodeId: before.historyNodeId, field: 'immutableFacts' }));
  }
}

function validateRetiredNumberOwnership(base, proposed, blockers) {
  const retired = new Map();
  for (const node of base.values()) if (['RETIRED', 'SUPERSEDED'].includes(text(node.lifecycleStatus))) retired.set(node.engineeringNodeNumber, node.historyNodeId);
  for (const node of proposed.values()) {
    const owner = retired.get(node.engineeringNodeNumber);
    if (owner && owner !== node.historyNodeId) blockers.push(issue('RETIRED_NUMBER_REASSIGNED', {
      engineeringNodeNumber: node.engineeringNodeNumber, retiredHistoryNodeId: owner, proposedHistoryNodeId: node.historyNodeId,
    }));
  }
}

function indexNodes(histories, blockers, owner) {
  const result = new Map();
  for (const history of histories || []) for (const node of history?.historyNodes || []) {
    const historyNodeId = text(node?.historyNodeId);
    if (result.has(historyNodeId)) blockers.push(issue('DUPLICATE_HISTORY_IDENTITY', { historyNodeId, owner }));
    else result.set(historyNodeId, node);
  }
  return result;
}

function indexLifecycleOperations(operations, blockers) {
  const result = new Map();
  for (const operation of operations || []) {
    if (!LIFECYCLE_OPERATION_TYPES.has(text(operation?.type))) continue;
    const historyNodeId = text(operation?.historyNodeId);
    if (!historyNodeId) continue;
    if (result.has(historyNodeId)) blockers.push(issue('DUPLICATE_LIFECYCLE_OPERATION', { historyNodeId }));
    else result.set(historyNodeId, operation);
  }
  return result;
}

function lifecycleEvidenceForStatus(node) {
  return ({
    RETIRED: node?.retirementEvidence,
    REACTIVATED: node?.reactivationEvidence,
    SUPERSEDED: node?.supersessionEvidence,
  })[text(node?.lifecycleStatus)] || null;
}

function operationTypeForStatus(status) {
  return ({ ACTIVE: 'ACTIVATE_NODE', RETIRED: 'RETIRE_NODE', REACTIVATED: 'REACTIVATE_NODE', SUPERSEDED: 'SUPERSEDE_NODE', REVIEW_REQUIRED: 'MARK_REVIEW_REQUIRED' })[status];
}
