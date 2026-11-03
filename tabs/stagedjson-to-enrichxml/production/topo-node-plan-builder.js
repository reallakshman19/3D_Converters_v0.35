import { computeSemanticHash, text } from '../../../contracts/topo-enriched-xml/contract-core.js';
import { TOPONODEPLAN_V1 } from '../../../contracts/topo-enriched-xml/contracts.js';
import {
  array, assertUnchanged, freeze, issue, makeValidation, snapshot,
} from './production-common.js';
import {
  append, compareEntry, groupBy, historyIndex, uniqueIndex, validateCurrentHistory,
} from './topo-node-plan-indexes.js';

export async function buildProductionTopoNodePlan(input) {
  const before = snapshot(input);
  const state = createState(input);
  indexDisposition(state);
  indexAllocations(state);
  indexApprovedNewIdentities(state);
  const logicalNodes = buildLogicalNodes(state);
  const occurrenceRows = buildOccurrenceRows(state);
  const componentProjection = buildComponentProjection(state, occurrenceRows);
  const rawPortMappings = buildRawPortMappings(state);
  validateNumberAuthority(state, logicalNodes, occurrenceRows);
  validateOccurrenceCoverage(state, occurrenceRows);
  let nodePlan = null;
  if (!state.blockers.length) {
    const candidate = {
      schema: 'TopoNodePlan.v1',
      projectId: state.projectId,
      zoneId: state.zoneId,
      sourceInventoryHash: state.hashes.sourceInventoryHash,
      logicalTopologyHash: state.hashes.selectedLogicalTopologyHash,
      sequencePlanHash: state.hashes.sequencePlanHash,
      baseRegistrySnapshotHash: state.hashes.currentRegistrySnapshotHash,
      configHash: state.hashes.configHash,
      logicalNodes,
      emittedOccurrences: occurrenceRows.filter((row) => row.disposition === 'EMITTED'),
      reservedOccurrences: occurrenceRows.filter((row) => row.disposition === 'RESERVED'),
      rawPortMappings,
      componentProjection,
      validation: makeValidation(),
    };
    candidate.nodePlanHash = await computeSemanticHash(candidate, 'nodePlanHash');
    const errors = TOPONODEPLAN_V1.validate(candidate);
    if (errors.length) state.blockers.push(issue('NODE_PLAN_CONTRACT_INVALID', { errors }));
    else nodePlan = TOPONODEPLAN_V1.freeze(candidate);
  }
  const result = freeze({
    schema: 'TopoNodePlanBuildResult.v1',
    nodePlan,
    validation: makeValidation(state.blockers, state.reviewItems, state.warnings),
  });
  assertUnchanged(input, before, 'TopoNodePlan builder');
  return result;
}

function createState(input) {
  return {
    input,
    projectId: text(input?.sourceInventory?.projectId),
    zoneId: text(input?.sourceInventory?.zoneId),
    hashes: input?.hashes || {},
    blockers: [], reviewItems: [], warnings: [],
    graphNodes: uniqueIndex(input?.selectedLogicalGraph?.nodes, 'logicalNodeId'),
    currentHistory: historyIndex(input?.currentRegistryEvidence?.lineHistories),
    dispositions: new Map(), allocations: new Map(), newIdentities: new Map(),
  };
}

function indexDisposition(state) {
  const result = state.input.historyMatchResult || {};
  for (const row of array(result.matches)) addDisposition(state, row, 'MATCHED');
  for (const row of array(result.reactivated)) addDisposition(state, row, 'REACTIVATED');
  for (const row of array(result.newNodes)) addDisposition(state, row, 'NEW');
  for (const row of array(state.input.occurrencePlan?.occurrences)) {
    const logicalNodeId = text(row?.logicalNodeId);
    if (!logicalNodeId) state.blockers.push(issue('OCCURRENCE_LOGICAL_NODE_MISSING', {
      occurrenceId: text(row?.occurrenceId),
    }));
    else if (!state.dispositions.has(logicalNodeId)) state.blockers.push(issue('NODE_MATCH_DISPOSITION_MISSING', {
      occurrenceId: text(row?.occurrenceId), logicalNodeId,
    }));
  }
}

function addDisposition(state, row, kind) {
  const logicalNodeId = text(row?.logicalNodeId);
  if (!logicalNodeId || state.dispositions.has(logicalNodeId)) {
    state.blockers.push(issue('NODE_MATCH_DISPOSITION_DUPLICATE', { logicalNodeId, kind }));
    return;
  }
  state.dispositions.set(logicalNodeId, {
    kind,
    historyNodeId: text(row?.historyNodeId),
  });
}

function indexAllocations(state) {
  for (const row of array(state.input.allocationResult?.allocations)) {
    const logicalNodeId = text(row?.logicalNodeId);
    if (!logicalNodeId || state.allocations.has(logicalNodeId)) {
      state.blockers.push(issue('NODE_ALLOCATION_DUPLICATE', { logicalNodeId }));
      continue;
    }
    if (!Number.isInteger(row?.engineeringNodeNumber) || row.engineeringNodeNumber < 0) {
      state.blockers.push(issue('ENGINEERING_NODE_NUMBER_INVALID', { logicalNodeId, value: row?.engineeringNodeNumber }));
    }
    state.allocations.set(logicalNodeId, row);
  }
  for (const logicalNodeId of state.dispositions.keys()) {
    if (!state.allocations.has(logicalNodeId)) state.blockers.push(issue('NODE_ALLOCATION_MISSING', { logicalNodeId }));
  }
}

function indexApprovedNewIdentities(state) {
  const patch = state.input.bootstrapResult?.registryPatch;
  for (const row of array(patch?.operations).filter((item) => text(item?.type) === 'ADD_NODE')) {
    const logicalNodeId = text(row?.logicalNodeId);
    const historyNodeId = text(row?.historyNodeId);
    if (!logicalNodeId || !historyNodeId || state.newIdentities.has(logicalNodeId)) {
      state.blockers.push(issue('APPROVED_NEW_IDENTITY_CONFLICT', { logicalNodeId, historyNodeId }));
    } else state.newIdentities.set(logicalNodeId, row);
  }
}

function buildLogicalNodes(state) {
  const rows = [];
  for (const [logicalNodeId, disposition] of [...state.dispositions].sort(compareEntry)) {
    const allocation = state.allocations.get(logicalNodeId);
    const historyNodeId = resolveHistoryIdentity(state, logicalNodeId, disposition, allocation);
    if (!state.graphNodes.has(logicalNodeId)) state.blockers.push(issue('LOGICAL_NODE_MAPPING_MISSING', { logicalNodeId }));
    if (!allocation || !historyNodeId) continue;
    validateCurrentHistory(state, logicalNodeId, historyNodeId, allocation);
    rows.push({
      logicalNodeId,
      historyNodeId,
      engineeringNodeNumber: allocation.engineeringNodeNumber,
      allocationKind: text(allocation.allocationKind),
      matchDisposition: disposition.kind,
    });
  }
  return rows;
}

function resolveHistoryIdentity(state, logicalNodeId, disposition, allocation) {
  if (disposition.kind === 'NEW') {
    const approved = state.newIdentities.get(logicalNodeId);
    if (!approved) {
      state.blockers.push(issue('APPROVED_NEW_IDENTITY_MISSING', { logicalNodeId }));
      return '';
    }
    if (approved.engineeringNodeNumber !== allocation?.engineeringNodeNumber) state.blockers.push(issue(
      'APPROVED_NEW_IDENTITY_NUMBER_MISMATCH', {
        logicalNodeId, approved: approved.engineeringNodeNumber, allocated: allocation?.engineeringNodeNumber,
      },
    ));
    return text(approved.historyNodeId);
  }
  const historyNodeId = disposition.historyNodeId;
  if (!historyNodeId) state.blockers.push(issue('HISTORICAL_IDENTITY_MISSING', { logicalNodeId }));
  if (text(allocation?.historyNodeId) !== historyNodeId) state.blockers.push(issue(
    'HISTORICAL_IDENTITY_ALLOCATION_MISMATCH', {
      logicalNodeId, expected: historyNodeId, actual: text(allocation?.historyNodeId),
    },
  ));
  return historyNodeId;
}

function buildOccurrenceRows(state) {
  const rows = [];
  const logical = new Map(buildLogicalNodesSnapshot(state).map((row) => [row.logicalNodeId, row]));
  for (const occurrence of array(state.input.occurrencePlan?.occurrences)) {
    const logicalNodeId = text(occurrence?.logicalNodeId);
    const owner = logical.get(logicalNodeId);
    if (!owner) continue;
    rows.push({
      occurrenceId: text(occurrence.occurrenceId),
      logicalNodeId,
      historyNodeId: owner.historyNodeId,
      componentProjectionId: text(occurrence.componentProjectionId),
      engineeringNodeNumber: owner.engineeringNodeNumber,
      disposition: text(occurrence.disposition),
      sourceEntityId: text(occurrence.sourceEntityId),
      sourceBranch: text(occurrence.sourceBranch),
      canonicalMainLine: text(occurrence.canonicalMainLine),
      projectionRole: occurrence.projectionRole,
      endpoint: occurrence.endpoint,
      psiComponentType: text(occurrence.psiComponentType),
    });
  }
  return rows;
}

function buildLogicalNodesSnapshot(state) {
  const rows = [];
  for (const [logicalNodeId, disposition] of state.dispositions) {
    const allocation = state.allocations.get(logicalNodeId);
    if (!allocation) continue;
    const historyNodeId = disposition.kind === 'NEW'
      ? text(state.newIdentities.get(logicalNodeId)?.historyNodeId)
      : disposition.historyNodeId;
    if (historyNodeId) rows.push({ logicalNodeId, historyNodeId, engineeringNodeNumber: allocation.engineeringNodeNumber });
  }
  return rows;
}

function buildComponentProjection(state, occurrences) {
  const byId = groupBy(occurrences, 'componentProjectionId');
  return array(state.input.occurrencePlan?.componentProjection).map((projection) => {
    const id = text(projection?.componentProjectionId);
    const rows = byId.get(id) || [];
    return {
      componentProjectionId: id,
      sourceEntityId: text(projection?.sourceEntityId),
      emittedOccurrenceIds: rows.filter((row) => row.disposition === 'EMITTED').map((row) => row.occurrenceId),
      reservedOccurrenceIds: rows.filter((row) => row.disposition === 'RESERVED').map((row) => row.occurrenceId),
    };
  });
}

function buildRawPortMappings(state) {
  const supplied = array(state.input.rawPortMappings);
  const rows = supplied.length ? supplied : derivePortMappings(state);
  const byPort = groupBy(rows, 'sourcePortId');
  const graphNodes = state.graphNodes;
  const result = [];
  for (const port of array(state.input.sourceInventory?.ports)) {
    const sourcePortId = text(port?.sourcePortId);
    const claims = byPort.get(sourcePortId) || [];
    if (claims.length !== 1) {
      state.blockers.push(issue('RAW_PORT_MAPPING_INCOMPLETE', { sourcePortId, claimCount: claims.length }));
      continue;
    }
    const logicalNodeId = text(claims[0].logicalNodeId);
    if (!graphNodes.has(logicalNodeId)) state.blockers.push(issue('RAW_PORT_MAPPING_UNKNOWN_NODE', {
      sourcePortId, logicalNodeId,
    }));
    result.push({ sourcePortId, logicalNodeId });
  }
  if (rows.length !== result.length) state.blockers.push(issue('RAW_PORT_MAPPING_EXTRA', {
    expected: result.length, actual: rows.length,
  }));
  return result.sort((a, b) => a.sourcePortId.localeCompare(b.sourcePortId));
}

function derivePortMappings(state) {
  const claims = new Map();
  for (const node of array(state.input.selectedLogicalGraph?.nodes)) {
    for (const sourcePortId of array(node?.sourcePortIds).map(text)) append(claims, sourcePortId, text(node.logicalNodeId));
  }
  for (const port of array(state.input.sourceInventory?.ports)) {
    if (text(port?.logicalNodeId)) append(claims, text(port.sourcePortId), text(port.logicalNodeId));
  }
  return [...claims].flatMap(([sourcePortId, values]) => [...new Set(values)].map((logicalNodeId) => ({ sourcePortId, logicalNodeId })));
}

function validateNumberAuthority(state, logicalNodes, occurrences) {
  const byNumber = new Map();
  for (const row of logicalNodes) append(byNumber, row.engineeringNodeNumber, row.logicalNodeId);
  for (const [number, owners] of byNumber) if (new Set(owners).size !== 1) state.blockers.push(issue(
    'ENGINEERING_NODE_NUMBER_CONFLICT', { engineeringNodeNumber: number, logicalNodeIds: owners },
  ));
  for (const row of occurrences) {
    const owner = logicalNodes.find((node) => node.logicalNodeId === row.logicalNodeId);
    if (owner?.engineeringNodeNumber !== row.engineeringNodeNumber) state.blockers.push(issue(
      'OCCURRENCE_NODE_NUMBER_MISMATCH', { occurrenceId: row.occurrenceId },
    ));
  }
}

function validateOccurrenceCoverage(state, rows) {
  const expected = array(state.input.occurrencePlan?.occurrences).map((row) => text(row.occurrenceId)).sort();
  const actual = rows.map((row) => row.occurrenceId).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) state.blockers.push(issue('OCCURRENCE_PLAN_COVERAGE_MISMATCH', {
    expected, actual,
  }));
}
