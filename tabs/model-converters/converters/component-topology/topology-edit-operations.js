/**
 * Reversible geometry operations for editable canonical topology.
 * Each function mutates only the isolated replay state supplied by the engine
 * and returns provenance for TopologyEditLedger.v1. Engineering lineage is
 * inherited only from an explicitly selected context edge.
 */

import { pointDistance } from './topology-values.js';
import { editError, finiteNumber, point, requiredText, safeIdPart, textIds } from './topology-edit-contract.js';
import {
  addBendDefinition, addJunctionDefinition, trimEdge,
} from './topology-edit-engineering-operations.js';
import {
  edgeById, incidentEdges, inheritedEdge, nextInputXmlNodeId, nodeById, synchronizeNodeDependents,
} from './topology-edit-state.js';

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} payload @returns {Record<string, unknown>} */
function moveNode(state, payload) {
  const nodeId = requiredText(payload.nodeId, 'MOVE_NODE nodeId');
  const node = nodeById(state, nodeId), before = { ...node.position };
  node.position = point(payload.position, 'MOVE_NODE position');
  node.positionAuthority = `TOPOLOGY_EDIT:${nodeId}`;
  synchronizeNodeDependents(state, nodeId, node.position);
  return { targets: [nodeId], changed: [nodeId], created: [], removed: [], before, after: { ...node.position } };
}

/** @param {Record<string, unknown>} target @param {Record<string, unknown>} source @returns {void} */
function mergeNodeIdentity(target, source) {
  for (const field of ['sourcePortIds', 'sourceEntityIds', 'sourcePaths', 'branchIds', 'connectionAuthority']) {
    target[field] = textIds([...(target[field] ?? []), ...(source[field] ?? [])]);
  }
  target.connectionResidual = Math.max(Number(target.connectionResidual ?? 0), Number(source.connectionResidual ?? 0));
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} payload @returns {Record<string, unknown>} */
function mergeNodes(state, payload) {
  const sourceId = requiredText(payload.sourceNodeId, 'MERGE_NODES sourceNodeId');
  const targetId = requiredText(payload.targetNodeId, 'MERGE_NODES targetNodeId');
  if (sourceId === targetId) throw editError('IDENTICAL_NODES', 'MERGE_NODES requires two different nodes.');
  const source = nodeById(state, sourceId), target = nodeById(state, targetId);
  if (state.edges.some((edge) => (
    (edge.fromNodeId === sourceId && edge.toNodeId === targetId)
    || (edge.fromNodeId === targetId && edge.toNodeId === sourceId)
  ))) throw editError('MERGE_WOULD_COLLAPSE_EDGE', `Merging ${sourceId} into ${targetId} would collapse an existing element.`);
  const rewired = [];
  for (const edge of state.edges) {
    if (edge.fromNodeId === sourceId) { edge.fromNodeId = targetId; rewired.push(edge.id); }
    if (edge.toNodeId === sourceId) { edge.toNodeId = targetId; rewired.push(edge.id); }
  }
  for (const collectionName of ['junctions', 'boundaries', 'supports']) {
    for (const row of state[collectionName]) if (row.nodeId === sourceId) row.nodeId = targetId;
  }
  mergeNodeIdentity(target, source);
  state.nodes = state.nodes.filter((node) => node.id !== sourceId);
  synchronizeNodeDependents(state, targetId, target.position);
  return {
    targets: [sourceId, targetId], changed: textIds([targetId, ...rewired]), created: [], removed: [sourceId],
    before: { sourcePosition: source.position, targetPosition: target.position }, after: { retainedNodeId: targetId },
  };
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} command @param {string} fromNodeId @param {string} toNodeId @param {Record<string, unknown>} context @returns {Record<string, unknown>} */
function createContextEdge(state, command, fromNodeId, toNodeId, context) {
  nodeById(state, fromNodeId); nodeById(state, toNodeId);
  if (fromNodeId === toNodeId) throw editError('SELF_EDGE', `${command.type} cannot connect a node to itself.`);
  const duplicate = state.edges.find((edge) => (
    (edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId)
    || (edge.fromNodeId === toNodeId && edge.toNodeId === fromNodeId)
  ));
  if (duplicate) throw editError('DUPLICATE_EDGE', `${command.type} duplicates canonical edge ${duplicate.id}.`);
  const idPart = safeIdPart(command.id), edgeId = `EDIT-CE-${idPart}`;
  const operation = command.type === 'BRIDGE_GAP' ? 'EDIT_BRIDGE_GAP' : 'EDIT_ADD_STRAIGHT_ELEMENT';
  const edge = inheritedEdge(context, edgeId, `EDIT-PE-${idPart}`, fromNodeId, toNodeId, operation, command.id);
  state.edges.push(edge);
  return {
    targets: textIds([fromNodeId, toNodeId, context.id]), changed: [], created: [edgeId], removed: [],
    before: null, after: { edgeId, fromNodeId, toNodeId, engineeringAuthorityEdgeId: edge.engineeringAuthorityEdgeId },
  };
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} command @returns {Record<string, unknown>} */
function bridgeGap(state, command) {
  const payload = /** @type {Record<string, unknown>} */ (command.payload);
  const context = edgeById(state, requiredText(payload.contextEdgeId, 'BRIDGE_GAP contextEdgeId'));
  return createContextEdge(
    state, command, requiredText(payload.fromNodeId, 'BRIDGE_GAP fromNodeId'),
    requiredText(payload.toNodeId, 'BRIDGE_GAP toNodeId'), context,
  );
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} command @returns {Record<string, unknown>} */
function addStraightElement(state, command) {
  const payload = /** @type {Record<string, unknown>} */ (command.payload);
  const fromNodeId = requiredText(payload.fromNodeId, 'ADD_STRAIGHT_ELEMENT fromNodeId');
  const from = nodeById(state, fromNodeId);
  const context = edgeById(state, requiredText(payload.contextEdgeId, 'ADD_STRAIGHT_ELEMENT contextEdgeId'));
  let toNodeId = String(payload.toNodeId ?? '').trim(), newNodeId = '';
  if (!toNodeId) {
    const idPart = safeIdPart(command.id);
    const newNode = {
      ...structuredClone(from), id: `EDIT-CN-${idPart}`,
      position: point(payload.toPosition, 'ADD_STRAIGHT_ELEMENT toPosition'),
      inputXmlNodeIds: [nextInputXmlNodeId(state, context)], sourcePortIds: [`EDIT-PORT:${command.id}`],
      positionAuthority: `TOPOLOGY_EDIT:${command.id}`, connectionAuthority: [`TOPOLOGY_EDIT:${command.id}`],
      connectionResidual: 0, editAncestry: [command.id, context.id],
    };
    if (state.nodes.some((node) => node.id === newNode.id)) throw editError('DUPLICATE_EDIT_ID', `Edit node ${newNode.id} already exists.`);
    state.nodes.push(newNode); toNodeId = newNode.id; newNodeId = newNode.id;
  }
  const result = createContextEdge(state, command, fromNodeId, toNodeId, context);
  return { ...result, created: textIds([newNodeId, ...result.created]) };
}

/** @param {{x:number,y:number,z:number}} from @param {{x:number,y:number,z:number}} to @param {number} fraction @returns {{x:number,y:number,z:number}} */
export function interpolate(from, to, fraction) {
  return { x: from.x + ((to.x - from.x) * fraction), y: from.y + ((to.y - from.y) * fraction), z: from.z + ((to.z - from.z) * fraction) };
}

/** @param {Record<string, unknown>} payload @param {Record<string, unknown>} from @param {Record<string, unknown>} to @returns {number} */
export function splitFraction(payload, from, to) {
  const length = pointDistance(from.position, to.position);
  if (length <= 0) throw editError('ZERO_LENGTH_EDGE', 'Cannot split a zero-length edge.');
  if (payload.fraction !== undefined) return finiteNumber(payload.fraction, 'SPLIT_EDGE fraction');
  if (payload.distanceMm !== undefined) return finiteNumber(payload.distanceMm, 'SPLIT_EDGE distanceMm') / length;
  if (payload.position === undefined) throw editError('MISSING_SPLIT_LOCATION', 'SPLIT_EDGE requires fraction, distanceMm, or position.');
  const requested = point(payload.position, 'SPLIT_EDGE position');
  const vector = { x: to.position.x - from.position.x, y: to.position.y - from.position.y, z: to.position.z - from.position.z };
  const offset = { x: requested.x - from.position.x, y: requested.y - from.position.y, z: requested.z - from.position.z };
  const denominator = (vector.x ** 2) + (vector.y ** 2) + (vector.z ** 2);
  const fraction = ((offset.x * vector.x) + (offset.y * vector.y) + (offset.z * vector.z)) / denominator;
  if (pointDistance(requested, interpolate(from.position, to.position, fraction)) > Number(payload.toleranceMm ?? 0.1)) {
    throw editError('SPLIT_POSITION_OFF_EDGE', 'SPLIT_EDGE position is not on the selected edge within tolerance.');
  }
  return fraction;
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} command @returns {Record<string, unknown>} */
function splitEdge(state, command) {
  const payload = /** @type {Record<string, unknown>} */ (command.payload);
  const edgeId = requiredText(payload.edgeId, 'SPLIT_EDGE edgeId'), edge = edgeById(state, edgeId);
  const from = nodeById(state, edge.fromNodeId), to = nodeById(state, edge.toNodeId);
  const fraction = splitFraction(payload, from, to);
  if (!(fraction > 0 && fraction < 1)) throw editError('INVALID_SPLIT_FRACTION', 'SPLIT_EDGE location must be strictly inside the selected edge.');
  const idPart = safeIdPart(command.id), nodeId = `EDIT-CN-${idPart}`, secondEdgeId = `EDIT-CE-${idPart}`;
  const splitNode = {
    ...structuredClone(from), id: nodeId, position: interpolate(from.position, to.position, fraction),
    inputXmlNodeIds: [nextInputXmlNodeId(state, edge)], sourcePortIds: [`EDIT-PORT:${command.id}`],
    positionAuthority: `TOPOLOGY_EDIT:${command.id}/SPLIT:${edge.id}`, connectionAuthority: [`TOPOLOGY_EDIT:${command.id}`],
    connectionResidual: 0, editAncestry: textIds([...(edge.editAncestry ?? []), edge.id, command.id]),
  };
  const originalToNodeId = edge.toNodeId;
  edge.toNodeId = nodeId; edge.topologyOperation = 'EDIT_SPLIT_EDGE_FIRST';
  edge.connectionAuthority = `TOPOLOGY_EDIT:${command.id}/SPLIT_FIRST:${edge.id}`;
  edge.engineeringAuthorityEdgeId = edge.engineeringAuthorityEdgeId ?? edge.id;
  edge.editAncestry = textIds([...(edge.editAncestry ?? []), edge.id, command.id]);
  const second = inheritedEdge(edge, secondEdgeId, `EDIT-PE-${idPart}`, nodeId, originalToNodeId, 'EDIT_SPLIT_EDGE_SECOND', command.id);
  state.nodes.push(splitNode); state.edges.push(second);
  for (const rigid of state.rigids) if (rigid.edgeId === edgeId && String(rigid.inputXmlNodeId ?? '') !== String(from.inputXmlNodeIds[0])) {
    rigid.edgeId = secondEdgeId; rigid.inputXmlElementId = second.inputXmlElementIds[0];
  }
  return { targets: [edgeId], changed: [edgeId], created: [nodeId, secondEdgeId], removed: [], before: { fromNodeId: from.id, toNodeId: originalToNodeId }, after: { splitNodeId: nodeId, secondEdgeId, fraction } };
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} command @returns {Record<string, unknown>} */
function disconnectEndpoint(state, command) {
  const payload = /** @type {Record<string, unknown>} */ (command.payload);
  const edgeId = requiredText(payload.edgeId, 'DISCONNECT_ENDPOINT edgeId');
  const endpoint = requiredText(payload.endpoint, 'DISCONNECT_ENDPOINT endpoint').toUpperCase();
  if (!['FROM', 'TO'].includes(endpoint)) throw editError('INVALID_ENDPOINT', 'DISCONNECT_ENDPOINT endpoint must be FROM or TO.');
  const edge = edgeById(state, edgeId), field = endpoint === 'FROM' ? 'fromNodeId' : 'toNodeId';
  const originalNode = nodeById(state, edge[field]);
  if (incidentEdges(state, originalNode.id).length < 2) throw editError('ENDPOINT_NOT_SHARED', `Node ${originalNode.id} is not shared by multiple edges.`);
  const clone = {
    ...structuredClone(originalNode), id: `EDIT-CN-${safeIdPart(command.id)}`,
    inputXmlNodeIds: [nextInputXmlNodeId(state, edge)], sourcePortIds: [`EDIT-PORT:${command.id}`],
    positionAuthority: `TOPOLOGY_EDIT:${command.id}/DISCONNECT:${originalNode.id}`,
    connectionAuthority: [`TOPOLOGY_EDIT:${command.id}`], connectionResidual: 0,
    editAncestry: textIds([...(originalNode.editAncestry ?? []), originalNode.id, command.id]),
  };
  state.nodes.push(clone); edge[field] = clone.id; edge.topologyOperation = 'EDIT_DISCONNECT_ENDPOINT';
  edge.connectionAuthority = `TOPOLOGY_EDIT:${command.id}/DISCONNECT:${originalNode.id}`;
  edge.editAncestry = textIds([...(edge.editAncestry ?? []), edge.id, command.id]);
  return { targets: [edgeId, originalNode.id], changed: [edgeId], created: [clone.id], removed: [], before: { endpoint, nodeId: originalNode.id }, after: { endpoint, nodeId: clone.id } };
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} payload @returns {Record<string, unknown>} */
function deleteEdge(state, payload) {
  const edgeId = requiredText(payload.edgeId, 'DELETE_EDGE edgeId'), edge = edgeById(state, edgeId);
  const rigids = state.rigids.filter((rigid) => rigid.edgeId === edgeId);
  if (rigids.length) throw editError('EDGE_HAS_RIGIDS', `Cannot delete ${edgeId}; ${rigids.length} rigid bodies are attached. Reassign them first.`);
  const dependentNodeIds = new Set([...state.supports, ...state.junctions, ...state.boundaries].map((row) => row.nodeId));
  for (const nodeId of [edge.fromNodeId, edge.toNodeId]) if (incidentEdges(state, nodeId).length <= 1) {
    const dependency = dependentNodeIds.has(nodeId) ? ' with attached engineering or junction evidence' : '';
    throw editError('DELETE_WOULD_ORPHAN_NODE', `Cannot delete ${edgeId}; endpoint ${nodeId}${dependency} would become an orphan. Bridge or merge it in the same topology transaction first.`);
  }
  state.edges = state.edges.filter((row) => row.id !== edgeId);
  return { targets: [edgeId], changed: [], created: [], removed: [edgeId], removedSourceEntityIds: textIds(edge.sourceEntityIds ?? []), before: structuredClone(edge), after: null };
}

/** @param {Record<string,unknown>} state @param {Record<string,unknown>} command @returns {Record<string,unknown>} */
function applyTransaction(state, command) {
  const operations = command.payload?.operations;
  if (!Array.isArray(operations) || !operations.length) throw editError('EMPTY_TRANSACTION', 'TRANSACTION requires operations.');
  const results = operations.map((operation, index) => {
    if (operation.type === 'TRANSACTION') throw editError('NESTED_TRANSACTION', 'Nested topology transactions are not supported.');
    return applyTopologyEditCommand(state, {
      schema: 'TopologyEditCommand.v1', id: `${command.id}-${String(index + 1).padStart(3, '0')}`,
      type: operation.type, payload: operation.payload,
    });
  });
  return {
    targets: textIds(results.flatMap((row) => row.targets ?? [])),
    created: textIds(results.flatMap((row) => row.created ?? [])),
    changed: textIds(results.flatMap((row) => row.changed ?? [])),
    removed: textIds(results.flatMap((row) => row.removed ?? [])),
    removedSourceEntityIds: textIds(results.flatMap((row) => row.removedSourceEntityIds ?? [])),
    before: results.map((row) => row.before), after: results.map((row) => row.after),
  };
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} command @returns {Record<string, unknown>} */
export function applyTopologyEditCommand(state, command) {
  if (command?.schema !== 'TopologyEditCommand.v1') throw editError('INVALID_COMMAND_SCHEMA', 'Expected TopologyEditCommand.v1.');
  const payload = /** @type {Record<string, unknown>} */ (command.payload);
  if (command.type === 'MOVE_NODE') return moveNode(state, payload);
  if (command.type === 'MERGE_NODES') return mergeNodes(state, payload);
  if (command.type === 'BRIDGE_GAP') return bridgeGap(state, command);
  if (command.type === 'ADD_STRAIGHT_ELEMENT') return addStraightElement(state, command);
  if (command.type === 'SPLIT_EDGE') return splitEdge(state, command);
  if (command.type === 'DISCONNECT_ENDPOINT') return disconnectEndpoint(state, command);
  if (command.type === 'DELETE_EDGE') return deleteEdge(state, payload);
  if (command.type === 'ADD_BEND_DEFINITION') return addBendDefinition(state, command);
  if (command.type === 'ADD_JUNCTION_DEFINITION') return addJunctionDefinition(state, command);
  if (command.type === 'TRIM_EDGE') return trimEdge(state, command);
  if (command.type === 'TRANSACTION') return applyTransaction(state, command);
  throw editError('UNSUPPORTED_COMMAND', `Unsupported topology edit command ${command.type}.`);
}
