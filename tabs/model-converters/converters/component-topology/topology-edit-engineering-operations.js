/**
 * Explicit bend, junction, and deterministic trim operations.
 * Inputs are isolated mutable canonical replay state plus validated command
 * payloads. Outputs are edit-ledger deltas; unresolved authority raises.
 */

import { pointDistance } from './topology-values.js';
import { editError, finiteNumber, point, requiredText, safeIdPart, textIds } from './topology-edit-contract.js';
import { edgeById, incidentEdges, nodeById, synchronizeNodeDependents } from './topology-edit-state.js';

/** @param {Record<string,unknown>} state @param {string} nodeId @returns {void} */
function assertNoBend(state, nodeId) {
  if ((state.bends ?? []).some((bend) => bend.nodeId === nodeId)) {
    throw editError('BEND_ALREADY_DEFINED', `Node ${nodeId} already has an explicit bend definition.`);
  }
}

/** @param {Record<string,unknown>} state @param {Record<string,unknown>} command @returns {Record<string,unknown>} */
export function addBendDefinition(state, command) {
  const payload = command.payload, nodeId = requiredText(payload.nodeId, 'ADD_BEND_DEFINITION nodeId');
  const node = nodeById(state, nodeId), edgeIds = textIds(payload.edgeIds ?? []);
  if (edgeIds.length !== 2 || incidentEdges(state, nodeId).length !== 2) {
    throw editError('INVALID_BEND_ARMS', `Bend node ${nodeId} must have exactly two incident route arms.`);
  }
  for (const edgeId of edgeIds) if (!incidentEdges(state, nodeId).some((edge) => edge.id === edgeId)) {
    throw editError('INVALID_BEND_ARM', `Edge ${edgeId} is not incident to bend node ${nodeId}.`);
  }
  assertNoBend(state, nodeId);
  const radiusMm = finiteNumber(payload.radiusMm, 'ADD_BEND_DEFINITION radiusMm');
  if (radiusMm <= 0) throw editError('INVALID_BEND_RADIUS', 'Bend radius must be greater than zero.');
  const id = `EDIT-BEND-${safeIdPart(command.id)}`;
  state.bends.push({
    id, nodeId, edgeIds, position: { ...node.position }, radiusMm,
    angleDeg: finiteNumber(payload.angleDeg, 'ADD_BEND_DEFINITION angleDeg'),
    radiusAuthority: requiredText(payload.radiusAuthority, 'ADD_BEND_DEFINITION radiusAuthority'),
    sourceEntityIds: textIds(edgeIds.flatMap((edgeId) => edgeById(state, edgeId).sourceEntityIds ?? [])),
    inputXmlElementId: edgeById(state, edgeIds[0]).inputXmlElementIds[0], editAncestry: [command.id],
  });
  return { targets: [nodeId, ...edgeIds], changed: [], created: [id], removed: [], before: null, after: { id, radiusMm } };
}

/** @param {Record<string,unknown>} state @param {Record<string,unknown>} command @returns {Record<string,unknown>} */
export function addJunctionDefinition(state, command) {
  const payload = command.payload, nodeId = requiredText(payload.nodeId, 'ADD_JUNCTION_DEFINITION nodeId');
  const node = nodeById(state, nodeId), edges = incidentEdges(state, nodeId), edgeIds = textIds(payload.edgeIds ?? []);
  if (edges.length !== 3 || edgeIds.length !== 3 || edgeIds.some((id) => !edges.some((edge) => edge.id === id))) {
    throw editError('INVALID_JUNCTION_ARMS', `Junction node ${nodeId} must name its three incident edges.`);
  }
  if (state.junctions.some((junction) => junction.nodeId === nodeId)) {
    throw editError('JUNCTION_ALREADY_DEFINED', `Node ${nodeId} already has a junction definition.`);
  }
  const kind = requiredText(payload.kind, 'ADD_JUNCTION_DEFINITION kind').toUpperCase();
  if (!['TEE', 'OLET'].includes(kind)) throw editError('INVALID_JUNCTION_KIND', `Unsupported junction kind ${kind}.`);
  const id = `EDIT-CJ-${safeIdPart(command.id)}`;
  state.junctions.push({
    id, kind, nodeId, position: { ...node.position }, expectedDegree: 3, participatingEdgeIds: edgeIds,
    sourceEntityIds: textIds(edges.flatMap((edge) => edge.sourceEntityIds ?? [])), sourceTypes: ['TOPOLOGY_EDIT'],
    sourceRelationship: `TOPOLOGY_EDIT:${command.id}`,
    inferenceAuthority: requiredText(payload.inferenceAuthority, 'ADD_JUNCTION_DEFINITION inferenceAuthority'),
    editAncestry: [command.id],
  });
  return { targets: [nodeId, ...edgeIds], changed: [], created: [id], removed: [], before: null, after: { id, kind } };
}

/** @param {Record<string,unknown>} state @param {string} edgeId @param {string} nodeId @returns {void} */
function assertTrimDependencies(state, edgeId, nodeId) {
  const nodeDependents = [...state.supports, ...state.junctions, ...state.boundaries, ...(state.bends ?? [])]
    .filter((row) => row.nodeId === nodeId);
  const edgeDependents = state.rigids.filter((rigid) => rigid.edgeId === edgeId);
  if (nodeDependents.length || edgeDependents.length) {
    throw editError('TRIM_HAS_DEPENDENCIES', `Cannot trim ${edgeId} at ${nodeId}; attached engineering or fitting evidence must be reassigned first.`);
  }
}

/** @param {Record<string,unknown>} state @param {Record<string,unknown>} command @returns {Record<string,unknown>} */
export function trimEdge(state, command) {
  const payload = command.payload, edgeId = requiredText(payload.edgeId, 'TRIM_EDGE edgeId');
  const endpoint = requiredText(payload.endpoint, 'TRIM_EDGE endpoint').toUpperCase();
  if (!['FROM', 'TO'].includes(endpoint)) throw editError('INVALID_ENDPOINT', 'TRIM_EDGE endpoint must be FROM or TO.');
  const edge = edgeById(state, edgeId), nodeId = endpoint === 'FROM' ? edge.fromNodeId : edge.toNodeId;
  const node = nodeById(state, nodeId), otherId = endpoint === 'FROM' ? edge.toNodeId : edge.fromNodeId;
  if (incidentEdges(state, nodeId).length !== 1) throw editError('TRIM_ENDPOINT_NOT_FREE', `Trim endpoint ${nodeId} is not graph-open.`);
  assertTrimDependencies(state, edgeId, nodeId);
  const before = { ...node.position }, position = point(payload.position, 'TRIM_EDGE position');
  if (pointDistance(position, nodeById(state, otherId).position) <= Number(state.toleranceMm ?? 0.1)) {
    throw editError('TRIM_WOULD_COLLAPSE_EDGE', `Trim would collapse edge ${edgeId}.`);
  }
  node.position = position; node.positionAuthority = `TOPOLOGY_EDIT:${command.id}/TRIM:${edgeId}`;
  edge.topologyOperation = 'EDIT_TRIM_EDGE';
  edge.editAncestry = textIds([...(edge.editAncestry ?? []), edge.id, command.id]);
  synchronizeNodeDependents(state, nodeId, position);
  return { targets: [edgeId, nodeId], changed: [edgeId, nodeId], created: [], removed: [], before, after: { ...position } };
}

export const _test = Object.freeze({ assertNoBend, assertTrimDependencies });
