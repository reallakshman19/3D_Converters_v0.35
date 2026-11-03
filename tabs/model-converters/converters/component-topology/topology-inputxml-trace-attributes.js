/**
 * Sole owner of topology trace metadata serialized into topology InputXML.
 * This module deliberately contains no route construction or engineering
 * inference. Namespace placement can be revised to match the IXSD contract
 * without changing canonical topology generation.
 */

import { cleanText, uniqueText } from './topology-values.js';

/** @param {unknown} value @returns {string} */
function list(value) {
  return uniqueText(Array.isArray(value) ? value : [value]).join(',');
}

/** @param {unknown} value @returns {string} */
function fixedTrace(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(6) : '';
}

/** @param {{x?:unknown,y?:unknown,z?:unknown}|null|undefined} point @param {string} prefix @returns {Array<[string,string]>} */
function pointAttributes(point, prefix) {
  if (!point || !['x', 'y', 'z'].every((axis) => Number.isFinite(Number(point[axis])))) return [];
  return [
    [`${prefix}_X`, fixedTrace(point.x)],
    [`${prefix}_Y`, fixedTrace(point.y)],
    [`${prefix}_Z`, fixedTrace(point.z)],
  ];
}

/** @param {Record<string, unknown>} edge @param {Record<string, unknown>} from @param {Record<string, unknown>} to @returns {Array<[string,string]>} */
export function topologyElementTraceAttributes(edge, from, to) {
  return [
    ['CANONICAL_EDGE_ID', cleanText(edge.id)],
    ['FROM_CANONICAL_NODE_ID', cleanText(from.id)],
    ['TO_CANONICAL_NODE_ID', cleanText(to.id)],
    ['SOURCE_ENTITY_IDS', list(edge.sourceEntityIds)],
    ['SOURCE_PORT_IDS', list(edge.sourcePortIds)],
    ['FROM_SOURCE_ENTITY_IDS', list(from.sourceEntityIds)],
    ['TO_SOURCE_ENTITY_IDS', list(to.sourceEntityIds)],
    ['FROM_SOURCE_PORT_IDS', list(from.sourcePortIds)],
    ['TO_SOURCE_PORT_IDS', list(to.sourcePortIds)],
    ['BRANCH_IDS', list(edge.branchIds ?? edge.sourceBranchEntityIds)],
    ['TOPOLOGY_OPERATION', cleanText(edge.topologyOperation ?? edge.segmentRole)],
    ['PROJECTION_CARDINALITY', cleanText(edge.projectionCardinality || 'ONE_TO_ONE')],
    ['MERGE_AUTHORITY', cleanText(edge.projectionMergeAuthority)],
  ];
}

/** @param {Record<string, unknown>} support @returns {Array<[string,string]>} */
export function topologyRestraintTraceAttributes(support) {
  return [
    ['SUPPORT_ID', cleanText(support.id)],
    ['CANONICAL_NODE_ID', cleanText(support.nodeId)],
    ['SOURCE_ENTITY_IDS', list(support.sourceEntityIds)],
    ['SOURCE_PATHS', list(support.sourcePaths)],
    ['BRANCH_IDS', list(support.branchIds ?? support.sourceBranchEntityIds)],
    ['ATTACHMENT_AUTHORITY', cleanText(support.attachmentAuthority)],
    ['ATTACHMENT_REFERENCES', list(support.attachmentReferences)],
    ['CONNECTION_RESIDUAL', fixedTrace(support.connectionResidual)],
    ...pointAttributes(support.sourcePosition, 'SOURCE'),
    ...pointAttributes(support.attachmentPosition ?? support.position, 'ATTACHMENT'),
  ];
}

/** @param {Record<string, unknown>} edge @param {Record<string, unknown>[]} rigids @returns {Array<[string,string]>} */
export function topologyRigidTraceAttributes(edge, rigids) {
  return [
    ['CANONICAL_EDGE_ID', cleanText(edge.id)],
    ['SOURCE_ENTITY_IDS', list(rigids.map((rigid) => rigid.sourceEntityId))],
    ['SOURCE_PATHS', list(rigids.map((rigid) => rigid.sourcePath))],
    ['BRANCH_IDS', list(rigids.flatMap((rigid) => rigid.branchIds ?? rigid.sourceBranchEntityIds ?? []))],
    ['ASSIGNMENT_AUTHORITY', list(rigids.map((rigid) => rigid.assignmentAuthority))],
    ['WEIGHT_AUTHORITY', list(rigids.map((rigid) => rigid.weightAuthority))],
    ['CONNECTION_RESIDUAL', fixedTrace(Math.max(0, ...rigids.map((rigid) => Number(rigid.connectionResidual) || 0)))],
  ];
}

export const TOPOLOGY_INPUTXML_TRACE_SCHEMA = 'TopologyInputXmlTraceAttributes.v1';
export const _test = Object.freeze({ list, fixedTrace, pointAttributes });
