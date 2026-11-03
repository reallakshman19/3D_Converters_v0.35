/** Flow islands, cycles, branch routes, junction degree, and orphan analysis. */

import {
  bucketsBy,
  compareText,
  relationshipSortKey,
  stableUnique,
} from './topology-benchmark-contract.js';

function flowRelationships(graph) {
  return graph.relationships.filter((row) => row.kind === 'FLOW_ADJACENCY' && row.targetEntityId)
    .sort((left, right) => compareText(relationshipSortKey(left), relationshipSortKey(right)));
}

function connectFlowRelationship(relationship, participants, parent, unite, cycleIds) {
  participants.add(relationship.sourceEntityId);
  participants.add(relationship.targetEntityId);
  if (!parent.has(relationship.sourceEntityId)) parent.set(relationship.sourceEntityId, relationship.sourceEntityId);
  if (!parent.has(relationship.targetEntityId)) parent.set(relationship.targetEntityId, relationship.targetEntityId);
  if (!unite(relationship.sourceEntityId, relationship.targetEntityId)) cycleIds.push(relationship.relationshipId);
}

export function flowState(graph) {
  const participants = new Set(graph.entities.filter((entity) => entity.flowParticipant).map((entity) => entity.entityId));
  const parent = new Map([...participants].map((id) => [id, id]));
  const find = (id) => {
    const current = parent.get(id);
    if (current == null) return null;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const unite = (left, right) => {
    const leftRoot = find(left), rightRoot = find(right);
    if (leftRoot == null || rightRoot == null || leftRoot === rightRoot) return false;
    const [first, second] = [leftRoot, rightRoot].sort(compareText);
    parent.set(second, first);
    return true;
  };
  const cycleClosingRelationshipIds = [];
  for (const relationship of flowRelationships(graph)) {
    connectFlowRelationship(relationship, participants, parent, unite, cycleClosingRelationshipIds);
  }
  const groups = new Map();
  for (const id of [...participants].sort(compareText)) {
    const root = find(id) ?? id;
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }
  const islands = [...groups.values()].map((ids) => ids.sort(compareText))
    .sort((left, right) => compareText(left.join('|'), right.join('|')));
  return Object.freeze({
    islands: Object.freeze(islands),
    cycleClosingRelationshipIds: Object.freeze(cycleClosingRelationshipIds.sort(compareText)),
  });
}

export function islandAnomalies(referenceFlow, actualFlow) {
  const expected = new Set(referenceFlow.islands.map((ids) => ids.join('|')));
  return actualFlow.islands.filter((ids) => !expected.has(ids.join('|'))).map((entityIds) => Object.freeze({
    code: 'UNEXPECTED_DISCONNECTED_ISLAND', islandId: entityIds.join('|'), entityIds, blocking: false,
  }));
}

export function cycleAnomalies(referenceFlow, actualFlow, policy) {
  const expected = new Set(referenceFlow.cycleClosingRelationshipIds);
  return actualFlow.cycleClosingRelationshipIds.filter((id) => {
    if (policy.cyclePolicy.mode === 'REFERENCE_AND_ALLOW_LIST' && expected.has(id)) return false;
    return !policy.cyclePolicy.allowedCycleClosingRelationshipIds.has(id);
  }).map((relationshipId) => Object.freeze({
    code: 'UNEXPECTED_CYCLE', relationshipId, blocking: false,
  }));
}

export function orphanBranchAnomalies(graph) {
  const ownership = bucketsBy(
    graph.relationships.filter((row) => row.kind === 'BRANCH_OWNERSHIP'),
    (row) => row.sourceEntityId,
  );
  return graph.entities.filter((entity) => entity.kind === 'BRANCH' && !(ownership.get(entity.entityId)?.length))
    .map((entity) => Object.freeze({
      code: 'ORPHAN_BRANCH', branchId: entity.entityId, sourcePath: entity.sourcePath, blocking: false,
    }));
}

function routeAdjacencyResults(ledger, routeEntityIds) {
  return ledger.filter((row) => {
    if (row.kind !== 'FLOW_ADJACENCY') return false;
    const relationship = row.actual ?? row.reference;
    return relationship?.targetEntityId != null
      && routeEntityIds.has(relationship.sourceEntityId)
      && routeEntityIds.has(relationship.targetEntityId);
  });
}

function branchReport(branchId, expected, observed, ledger, policy, actualFlow) {
  const matchState = expected && observed ? 'EXACT_MATCH' : expected ? 'MISSING_ACTUAL' : 'UNEXPECTED_ACTUAL';
  const sequenceMismatch = Boolean(expected && observed
    && policy.branchSequenceAuthority === 'AUTHORITATIVE'
    && expected.routeSequence.join('\0') !== observed.routeSequence.join('\0'));
  const relationshipResults = ledger.filter((row) => (
    row.reference?.sourceEntityId === branchId || row.actual?.sourceEntityId === branchId
    || row.reference?.targetEntityId === branchId || row.actual?.targetEntityId === branchId
  ));
  const routeIds = new Set(observed?.routeSequence ?? expected?.routeSequence ?? []);
  const adjacencyResults = routeAdjacencyResults(ledger, routeIds);
  const island = actualFlow.islands.find((ids) => observed?.routeSequence.some((id) => ids.includes(id))) ?? null;
  const cycleIds = actualFlow.cycleClosingRelationshipIds.filter((id) => (
    adjacencyResults.some((row) => row.relationshipId === id)
  ));
  const failed = matchState !== 'EXACT_MATCH' || sequenceMismatch
    || relationshipResults.some((row) => row.status === 'FAIL')
    || adjacencyResults.some((row) => row.status === 'FAIL');
  return Object.freeze({
    branchId, referenceBranchId: expected?.entityId ?? null, actualBranchId: observed?.entityId ?? null,
    zoneId: observed?.zoneId ?? expected?.zoneId ?? null, matchState,
    route: Object.freeze({
      sequenceAuthority: policy.branchSequenceAuthority,
      referenceSequence: expected?.routeSequence ?? [], actualSequence: observed?.routeSequence ?? [],
      sequenceMatch: !sequenceMismatch, adjacencyResultIds: adjacencyResults.map((row) => row.ledgerId),
      islandId: island?.join('|') ?? null, cycleIds, status: failed ? 'FAIL' : 'PASS',
    }),
    status: failed ? 'FAIL' : 'PASS',
  });
}

export function branchReports(reference, actual, ledger, policy, actualFlow) {
  const referenceBranches = new Map(reference.entities.filter((entity) => entity.kind === 'BRANCH')
    .map((entity) => [entity.entityId, entity]));
  const actualBranches = new Map(actual.entities.filter((entity) => entity.kind === 'BRANCH')
    .map((entity) => [entity.entityId, entity]));
  return stableUnique([...referenceBranches.keys(), ...actualBranches.keys()]).map((branchId) => branchReport(
    branchId, referenceBranches.get(branchId) ?? null, actualBranches.get(branchId) ?? null,
    ledger, policy, actualFlow,
  ));
}

export function junctionReports(reference, actual) {
  const expected = new Map(reference.entities.filter((entity) => entity.junctionKind)
    .map((entity) => [entity.entityId, entity]));
  const observed = new Map(actual.entities.filter((entity) => entity.junctionKind)
    .map((entity) => [entity.entityId, entity]));
  const actualDegree = new Map();
  for (const relationship of actual.relationships.filter((row) => row.kind === 'FLOW_ADJACENCY' && row.targetEntityId)) {
    actualDegree.set(relationship.sourceEntityId, (actualDegree.get(relationship.sourceEntityId) ?? 0) + 1);
    actualDegree.set(relationship.targetEntityId, (actualDegree.get(relationship.targetEntityId) ?? 0) + 1);
  }
  return stableUnique([...expected.keys(), ...observed.keys()]).map((entityId) => {
    const referenceEntity = expected.get(entityId) ?? null;
    const actualEntity = observed.get(entityId) ?? null;
    let matchState = referenceEntity && actualEntity ? 'EXACT_MATCH' : referenceEntity ? 'MISSING_ACTUAL' : 'UNEXPECTED_ACTUAL';
    const degree = actualEntity ? actualDegree.get(entityId) ?? 0 : null;
    if (matchState === 'EXACT_MATCH' && referenceEntity.expectedFlowDegree != null
        && degree !== referenceEntity.expectedFlowDegree) matchState = 'DEGREE_MISMATCH';
    return Object.freeze({
      ledgerId: `TJ-${String(entityId).replace(/[^A-Za-z0-9_.-]/g, '_')}`,
      referenceComponentId: referenceEntity?.entityId ?? null, actualComponentId: actualEntity?.entityId ?? null,
      junctionKind: actualEntity?.junctionKind ?? referenceEntity?.junctionKind,
      expectedFlowDegree: referenceEntity?.expectedFlowDegree ?? null, actualFlowDegree: degree,
      matchState, status: matchState === 'EXACT_MATCH' ? 'PASS' : 'FAIL',
    });
  });
}
