/**
 * Mutable replay-state helpers for the pure topology edit engine.
 * The caller supplies a structured clone of canonical topology. These helpers
 * update that isolated replay state and keep node-owned engineering records in
 * sync. Missing objects and exhausted CAESAR namespaces raise explicitly.
 */

import { editError, finiteNumber, textIds } from './topology-edit-contract.js';
import { pointSegmentDistance } from './topology-geometry-distance.js';

/** @param {Record<string, unknown>} canonical @returns {Record<string, unknown>} */
export function mutableCanonical(canonical) {
  const clone = structuredClone(canonical);
  delete clone.canonicalTopologyHash;
  delete clone.topologyEditDraftHash;
  delete clone.baseCanonicalTopologyHash;
  delete clone.editCommandCount;
  clone.bends = clone.bends ?? [];
  clone.junctions = clone.junctions ?? [];
  clone.boundaries = clone.boundaries ?? [];
  clone.supports = clone.supports ?? [];
  clone.rigids = clone.rigids ?? [];
  return clone;
}

/** @param {Record<string, unknown>} state @param {string} nodeId @returns {Record<string, unknown>} */
export function nodeById(state, nodeId) {
  const node = state.nodes.find((row) => row.id === nodeId);
  if (!node) throw editError('NODE_NOT_FOUND', `Canonical node ${nodeId} does not exist in the draft.`);
  return node;
}

/** @param {Record<string, unknown>} state @param {string} edgeId @returns {Record<string, unknown>} */
export function edgeById(state, edgeId) {
  const edge = state.edges.find((row) => row.id === edgeId);
  if (!edge) throw editError('EDGE_NOT_FOUND', `Canonical edge ${edgeId} does not exist in the draft.`);
  return edge;
}

/** @param {Record<string, unknown>} state @param {string} nodeId @returns {Record<string, unknown>[]} */
export function incidentEdges(state, nodeId) {
  return state.edges.filter((edge) => edge.fromNodeId === nodeId || edge.toNodeId === nodeId);
}

/** @param {Record<string, unknown>} state @param {string} nodeId @param {{x:number,y:number,z:number}} position @returns {void} */
export function synchronizeNodeDependents(state, nodeId, position) {
  for (const collectionName of ['junctions', 'boundaries', 'supports']) {
    for (const row of state[collectionName]) {
      if (row.nodeId !== nodeId) continue;
      row.position = { ...position };
      if (collectionName === 'supports') row.inputXmlNodeId = nodeById(state, nodeId).inputXmlNodeIds[0];
    }
  }
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} contextEdge @returns {string} */
export function nextInputXmlNodeId(state, contextEdge) {
  const contextNode = nodeById(state, contextEdge.fromNodeId);
  const contextNumber = finiteNumber(contextNode.inputXmlNodeIds[0], `InputXML node for ${contextNode.id}`);
  const namespace = Math.floor(contextNumber / 10000) * 10000;
  const used = new Set(state.nodes.flatMap((node) => node.inputXmlNodeIds ?? []).map((value) => Number(value)));
  const namespaceValues = [...used].filter((value) => value >= namespace && value < namespace + 10000);
  let candidate = Math.max(namespace, ...namespaceValues) + 10;
  candidate = Math.ceil(candidate / 10) * 10;
  while (used.has(candidate)) candidate += 10;
  if (candidate >= namespace + 10000) throw editError('NODE_NAMESPACE_EXHAUSTED', `CAESAR node namespace ${namespace} has no unused node number.`);
  return String(candidate);
}

/** @param {Record<string, unknown>} context @param {string} id @param {string} inputId @param {string} fromNodeId @param {string} toNodeId @param {string} operation @param {string} commandId @returns {Record<string, unknown>} */
export function inheritedEdge(context, id, inputId, fromNodeId, toNodeId, operation, commandId) {
  return {
    ...structuredClone(context),
    id,
    inputXmlElementIds: [inputId],
    fromNodeId,
    toNodeId,
    segmentRole: operation,
    topologyOperation: operation,
    projectionCardinality: 'EDIT_ONE_TO_ONE',
    projectionMergeAuthority: '',
    mergeSourceEntityIds: [],
    connectionAuthority: `TOPOLOGY_EDIT:${commandId}/CONTEXT:${context.id}`,
    connectionResidual: 0,
    engineeringAuthorityEdgeId: context.engineeringAuthorityEdgeId ?? context.id,
    editAncestry: textIds([...(context.editAncestry ?? []), context.id, commandId]),
  };
}

/** @param {Record<string, unknown>} edge @returns {string[]} */
function edgeSourcePaths(edge) {
  return textIds([edge.sourcePath, ...(edge.sourcePaths ?? [])]);
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} support @param {Map<string,Record<string,unknown>>} nodeIndex @returns {Record<string, unknown>|null} */
function supportCarrierProjection(state, support, nodeIndex) {
  const sourcePosition = support.sourcePosition;
  if (!sourcePosition || !['x', 'y', 'z'].every((axis) => Number.isFinite(Number(sourcePosition[axis])))) return null;
  const authoritativePath = String(support.attachmentEdgeSourcePath ?? '').trim();
  const attachedIds = new Set((support.attachedComponentEntityIds ?? []).map(String));
  const ranked = state.edges.flatMap((edge) => {
    const from = nodeIndex.get(edge.fromNodeId), to = nodeIndex.get(edge.toNodeId);
    if (!from || !to) return [];
    const pathMatch = authoritativePath && edgeSourcePaths(edge).includes(authoritativePath);
    const referenceMatch = (edge.sourceEntityIds ?? []).some((id) => attachedIds.has(String(id)));
    const incident = edge.fromNodeId === support.nodeId || edge.toNodeId === support.nodeId;
    if (!pathMatch && !referenceMatch && !incident) return [];
    const projection = pointSegmentDistance(sourcePosition, from.position, to.position);
    return [{ edge, projection, rank: pathMatch ? 0 : referenceMatch ? 1 : 2 }];
  }).sort((left, right) => left.rank - right.rank
    || left.projection.distanceMm - right.projection.distanceMm
    || String(left.edge.id).localeCompare(String(right.edge.id)));
  const selected = ranked[0];
  if (authoritativePath && selected?.rank !== 0) {
    throw editError('SUPPORT_CARRIER_NOT_FOUND', `Support ${support.id} cannot resolve authoritative carrier ${authoritativePath} after topology editing.`);
  }
  return selected ?? null;
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} support @param {Map<string,Record<string,unknown>>} nodeIndex @returns {void} */
function refreshSupport(state, support, nodeIndex) {
  const node = nodeIndex.get(support.nodeId);
  if (!node) return;
  support.position = { ...node.position };
  support.inputXmlNodeId = node.inputXmlNodeIds[0];
  const selected = supportCarrierProjection(state, support, nodeIndex);
  if (!selected) {
    support.attachmentPosition = { ...node.position };
    support.connectionResidual = 0;
    return;
  }
  support.attachmentPosition = { ...selected.projection.projected };
  support.connectionResidual = selected.projection.distanceMm;
  if (!String(support.attachmentEdgeSourcePath ?? '').trim()) {
    support.attachmentEdgeSourcePath = edgeSourcePaths(selected.edge)[0] ?? '';
  }
}

/** @param {Record<string, unknown>} state @returns {void} */
export function refreshDerivedTopology(state) {
  const nodeIndex = new Map(state.nodes.map((node) => [node.id, node]));
  const degree = new Map();
  for (const edge of state.edges) {
    degree.set(edge.fromNodeId, (degree.get(edge.fromNodeId) ?? 0) + 1);
    degree.set(edge.toNodeId, (degree.get(edge.toNodeId) ?? 0) + 1);
  }
  for (const junction of state.junctions) {
    const node = nodeIndex.get(junction.nodeId);
    if (node) junction.position = { ...node.position };
    junction.expectedDegree = degree.get(junction.nodeId) ?? 0;
    junction.participatingEdgeIds = incidentEdges(state, junction.nodeId).map((edge) => edge.id);
  }
  for (const boundary of state.boundaries) {
    const node = nodeIndex.get(boundary.nodeId);
    if (node) boundary.position = { ...node.position };
    boundary.participatingEdgeIds = incidentEdges(state, boundary.nodeId).map((edge) => edge.id);
  }
  for (const support of state.supports) refreshSupport(state, support, nodeIndex);
  for (const bend of state.bends ?? []) {
    const node = nodeIndex.get(bend.nodeId);
    if (node) bend.position = { ...node.position };
    bend.edgeIds = incidentEdges(state, bend.nodeId).map((edge) => edge.id);
  }
}

export const _test = Object.freeze({ edgeSourcePaths, supportCarrierProjection, refreshSupport });
