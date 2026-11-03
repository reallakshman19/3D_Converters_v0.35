/**
 * Fitting-semantic and engineering-attachment topology checks.
 * Bend evidence is grouped by shared source entity, not merely nearby role
 * names, preventing false bend-at-junction findings without a real bend instance.
 */

import { RESTRAINT_CODE_MAP } from '../../../stagedjson-to-enrichxml/sj-restraint-resolver.js';
import { cleanText } from './topology-values.js';
import { angleDegrees, isInlineEdge, outwardVector } from './topology-checker-graph.js';
import { topologyIssue } from './topology-checker-values.js';

/** @param {Record<string,unknown>} edge @returns {boolean} */
function runIn(edge) { return /ELBO\/BEND_RUN_IN/i.test(cleanText(edge.segmentRole)); }
/** @param {Record<string,unknown>} edge @returns {boolean} */
function runOut(edge) { return /ELBO\/BEND_RUN_OUT/i.test(cleanText(edge.segmentRole)); }

/** @param {Record<string,unknown>} edge @returns {string[]} */
function componentEntityIds(edge) {
  const excluded = new Set((edge.branchIds ?? []).map(cleanText));
  return (edge.sourceEntityIds ?? []).map(cleanText).filter((id) => id && !excluded.has(id));
}

/** @param {Record<string,unknown>} left @param {Record<string,unknown>} right @returns {string} */
function sharedNode(left, right) {
  return [left.fromNodeId, left.toNodeId].find((id) => id === right.fromNodeId || id === right.toNodeId) ?? '';
}

/** @param {Record<string,unknown>} canonical @returns {Readonly<Record<string,unknown>>[]} */
export function deriveBendInstances(canonical) {
  const byEntity = new Map();
  for (const edge of canonical.edges.filter((row) => runIn(row) || runOut(row))) for (const entityId of componentEntityIds(edge)) {
    byEntity.set(entityId, [...(byEntity.get(entityId) ?? []), edge]);
  }
  const derived = [];
  for (const [entityId, edges] of byEntity) {
    const first = edges.find(runIn), second = edges.find(runOut), nodeId = first && second ? sharedNode(first, second) : '';
    if (!first || !second || !nodeId) continue;
    derived.push(Object.freeze({ id: `BEND:${entityId}`, nodeId, edgeIds: Object.freeze([first.id, second.id]), sourceEntityId: entityId, explicit: true }));
  }
  for (const bend of canonical.bends ?? []) derived.push(Object.freeze({ ...bend, explicit: true }));
  const seen = new Set();
  return Object.freeze(derived.filter((bend) => {
    const key = `${bend.nodeId}:${[...(bend.edgeIds ?? [])].sort().join('|')}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }));
}

/** @param {Record<string,unknown>} canonical @param {Record<string,unknown>} graph @param {Record<string,number>} options @returns {Record<string,unknown>[]} */
export function fittingIssues(canonical, graph, options) {
  const issues = [], bends = deriveBendInstances(canonical), bendByNode = new Map(bends.map((bend) => [bend.nodeId, bend]));
  const junctionByNode = new Map((canonical.junctions ?? []).map((junction) => [junction.nodeId, junction]));
  for (const node of canonical.nodes) {
    const nodeId = cleanText(node.id), rows = graph.incident.get(nodeId) ?? [], junction = junctionByNode.get(nodeId), bend = bendByNode.get(nodeId);
    if (rows.length === 2) {
      const angleDeg = angleDegrees(outwardVector(graph, rows[0], nodeId), outwardVector(graph, rows[1], nodeId));
      const common = { objectIds: [nodeId, ...rows.map((row) => row.id)], details: { angleDeg, nodeId, edgeIds: rows.map((row) => row.id) }, location: node.position };
      const routeSpine = rows.every((edge) => !isInlineEdge(edge));
      if (angleDeg <= options.angleToleranceDeg) issues.push(topologyIssue({ code: 'PIPE_BACKTRACK', severity: 'ERROR', confidence: 'HIGH', fixability: 'NEEDS_CONFIRMATION', message: `The route reverses onto the same ray at ${nodeId} (${angleDeg.toFixed(2)}°).`, ...common }));
      else if (routeSpine && bend && Math.abs(180 - angleDeg) <= options.angleToleranceDeg) issues.push(topologyIssue({ code: 'BEND_WITHOUT_DIRECTION_CHANGE', severity: 'ERROR', confidence: 'HIGH', message: `Bend ${bend.id} at ${nodeId} has no direction change.`, ...common, objectIds: [...common.objectIds, bend.id] }));
      else if (routeSpine && !bend && Math.abs(90 - angleDeg) <= options.angleToleranceDeg) issues.push(topologyIssue({ code: 'RIGHT_ANGLE_WITHOUT_BEND', severity: 'ERROR', confidence: 'HIGH', fixability: 'AUTO_APPROVED', message: `A ${angleDeg.toFixed(2)}° direction change at ${nodeId} has no bend definition.`, ...common }));
      else if (routeSpine && !bend && Math.abs(180 - angleDeg) > options.angleToleranceDeg) issues.push(topologyIssue({ code: 'UNDEFINED_KINK', severity: 'WARNING', confidence: 'HIGH', message: `Undefined ${angleDeg.toFixed(2)}° route kink at ${nodeId} has no bend definition.`, ...common }));
    }
    if (rows.length >= 3 && !junction) issues.push(topologyIssue({
      code: 'MULTIWAY_WITHOUT_JUNCTION', severity: 'ERROR', confidence: 'HIGH', fixability: rows.length === 3 ? 'AUTO_APPROVED' : 'NEEDS_CONFIRMATION',
      message: `${nodeId} has degree ${rows.length} but no Tee/Olet junction definition.`, objectIds: [nodeId, ...rows.map((row) => row.id)], details: { degree: rows.length, nodeId, edgeIds: rows.map((row) => row.id) }, location: node.position,
    }));
    if (junction && rows.length < 3) issues.push(topologyIssue({ code: 'JUNCTION_WITHOUT_MULTIWAY', severity: 'ERROR', confidence: 'HIGH', message: `${junction.kind} ${junction.id} is defined at degree-${rows.length} node ${nodeId}.`, objectIds: [junction.id, nodeId], details: { degree: rows.length, nodeId }, location: node.position }));
    if (junction && bend) issues.push(topologyIssue({
      code: 'BEND_AT_JUNCTION', severity: 'ERROR', confidence: 'HIGH', message: `Explicit bend ${bend.id} and ${junction.kind} ${junction.id} share node ${nodeId}.`,
      objectIds: [bend.id, junction.id, nodeId, ...(bend.edgeIds ?? [])], details: { nodeId, bendId: bend.id, junctionId: junction.id }, location: node.position,
    }));
  }
  return issues;
}

/** @param {Record<string,unknown>} restraint @returns {string} */
function restraintToken(restraint) { return cleanText(restraint.type || restraint.kind).toUpperCase(); }
/** @param {Record<string,unknown>} restraint @returns {boolean} */
function knownRestraint(restraint) { return Number.isFinite(RESTRAINT_CODE_MAP[restraintToken(restraint)]); }
/** @param {Record<string,unknown>} restraint @returns {boolean} */
function knownDirection(restraint) {
  const token = cleanText(restraint.direction || restraint.type).toUpperCase();
  return /^(A|ANC|GUI|GUIDE|LIM|LIMIT|[+-]?[XYZ]|[+-]?R[XYZ]|[XYZ](SNB|SPR|ROD))$/.test(token);
}

/** @param {Record<string,unknown>} canonical @param {Record<string,unknown>} graph @returns {Record<string,unknown>[]} */
export function attachmentIssues(canonical, graph) {
  const issues = [], edgeIds = new Set(canonical.edges.map((edge) => edge.id));
  for (const support of canonical.supports ?? []) {
    const node = graph.nodes.get(cleanText(support.nodeId));
    if (!node) {
      issues.push(topologyIssue({ code: 'ORPHAN_SUPPORT', severity: 'BLOCKER', blocking: true, confidence: 'HIGH', message: `Support ${support.id} references missing node ${support.nodeId}.`, objectIds: [support.id, support.nodeId] }));
      continue;
    }
    for (const [index, restraint] of (support.restraints ?? []).entries()) {
      const id = `RESTRAINT:${support.id}:${index + 1}`;
      if (!knownRestraint(restraint)) issues.push(topologyIssue({ code: 'UNKNOWN_RESTRAINT_FAMILY', severity: 'ERROR', confidence: 'HIGH', message: `Restraint ${id} has unsupported family ${restraintToken(restraint) || '(blank)'}.`, objectIds: [support.id, id], location: node.position }));
      else if (!knownDirection(restraint)) issues.push(topologyIssue({ code: 'UNRESOLVED_RESTRAINT_DIRECTION', severity: 'WARNING', confidence: 'HIGH', message: `Restraint ${id} has unresolved direction ${cleanText(restraint.direction) || '(blank)'}.`, objectIds: [support.id, id], location: node.position }));
    }
  }
  for (const rigid of canonical.rigids ?? []) if (!edgeIds.has(cleanText(rigid.edgeId))) issues.push(topologyIssue({
    code: 'ORPHAN_RIGID', severity: 'BLOCKER', blocking: true, confidence: 'HIGH', message: `Rigid ${rigid.sourceEntityId} references missing edge ${rigid.edgeId}.`, objectIds: [rigid.sourceEntityId, rigid.edgeId],
  }));
  return issues;
}

export const _test = Object.freeze({ runIn, runOut, componentEntityIds, sharedNode, restraintToken, knownRestraint, knownDirection });
