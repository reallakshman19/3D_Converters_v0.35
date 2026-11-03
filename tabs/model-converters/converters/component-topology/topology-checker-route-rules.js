/**
 * Connectivity and geometric route checks for TopologyCheckReport.v1.
 * Rules operate on graph-open endpoints and authoritative owning branches, so
 * inline components already present in a connected route are never snap gaps.
 */

import { cleanText } from './topology-values.js';
import {
  candidatePairs, edgeComponents, isExpectedShortEdge, ownerBranch, overlapLength,
  pointDistance, segmentDistance, vectorLength, xyz,
} from './topology-checker-graph.js';
import { topologyIssue } from './topology-checker-values.js';

/** @param {Record<string,unknown>} edge @returns {number} */
function edgeRadius(edge) {
  const diameter = Number(edge.diameterMm ?? edge.diameter ?? 0), insulation = Number(edge.insulationMm ?? edge.insulThicknessMm ?? 0);
  return diameter > 0 ? (diameter / 2) + Math.max(0, insulation) : 0;
}

/** @param {Record<string,unknown>} left @param {Record<string,unknown>} right @returns {boolean} */
function sameFeature(left, right) {
  const excluded = new Set([...(left.branchIds ?? []), ...(right.branchIds ?? [])].map(cleanText));
  const rightIds = new Set((right.sourceEntityIds ?? []).map(cleanText).filter((id) => !excluded.has(id)));
  return (left.sourceEntityIds ?? []).map(cleanText).some((id) => !excluded.has(id) && rightIds.has(id));
}

/** @param {Record<string,unknown>} graph @param {Record<string,unknown>} edge @returns {Record<string,unknown>|null} */
function edgeGeometry(graph, edge) {
  const from = graph.nodes.get(cleanText(edge.fromNodeId)), to = graph.nodes.get(cleanText(edge.toNodeId));
  if (!from || !to) return null;
  const start = xyz(from.position), end = xyz(to.position), radius = edgeRadius(edge);
  return { edge, start, end, radius, min: start.map((value, axis) => Math.min(value, end[axis]) - radius), max: start.map((value, axis) => Math.max(value, end[axis]) + radius) };
}

/** @param {Record<string,unknown>} canonical @param {Record<string,unknown>} graph @param {Record<string,number>} options @returns {Record<string,unknown>[]} */
export function basicRouteIssues(canonical, graph, options) {
  const issues = [];
  for (const edge of canonical.edges) {
    const from = graph.nodes.get(cleanText(edge.fromNodeId)), to = graph.nodes.get(cleanText(edge.toNodeId));
    if (!from || !to) {
      issues.push(topologyIssue({ code: 'ORPHAN_EDGE_ENDPOINT', severity: 'BLOCKER', blocking: true, confidence: 'HIGH', message: `Element ${edge.id} references a missing endpoint.`, objectIds: [edge.id] }));
      continue;
    }
    const lengthMm = pointDistance(xyz(from.position), xyz(to.position));
    if (lengthMm <= options.toleranceMm || lengthMm >= options.shortElementMm) continue;
    const expected = isExpectedShortEdge(edge);
    issues.push(topologyIssue({
      code: expected ? 'EXPECTED_SHORT_INLINE_COMPONENT' : 'SHORT_ELEMENT', severity: expected ? 'INFO' : 'WARNING',
      confidence: 'HIGH', fixability: expected ? 'MANUAL_ENGINEERING' : 'NEEDS_CONFIRMATION',
      message: expected ? `${edge.segmentRole} ${edge.id} is an expected ${lengthMm.toFixed(3)} mm inline component.` : `Route element ${edge.id} is ${lengthMm.toFixed(3)} mm; threshold is ${options.shortElementMm} mm.`,
      objectIds: [edge.id], details: { lengthMm, thresholdMm: options.shortElementMm, expectedInline: expected }, location: from.position,
    }));
  }
  for (const node of canonical.nodes) {
    const id = cleanText(node.id), degree = graph.degree.get(id) ?? 0;
    if (!degree) issues.push(topologyIssue({ code: 'ORPHAN_NODE', severity: 'BLOCKER', blocking: true, confidence: 'HIGH', message: `Node ${id} has no incident element.`, objectIds: [id], location: node.position }));
    const authority = cleanText(node.positionAuthority).toUpperCase();
    if (vectorLength(xyz(node.position)) <= options.originToleranceMm && (!(node.sourcePortIds ?? []).length || /DEFAULT|UNKNOWN|MISSING/.test(authority))) {
      issues.push(topologyIssue({ code: 'ORIGIN_DEFAULTED', severity: 'WARNING', confidence: 'HIGH', message: `Node ${id} is at 0,0,0 without authoritative source-port geometry.`, objectIds: [id], details: { positionAuthority: node.positionAuthority }, location: node.position }));
    }
  }
  return issues;
}

/** @param {Record<string,unknown>} canonical @param {Record<string,unknown>} graph @returns {Record<string,unknown>[]} */
export function branchConnectivityIssues(canonical, graph) {
  const issues = [], byBranch = new Map();
  for (const edge of canonical.edges) {
    const branch = ownerBranch(edge);
    if (branch) byBranch.set(branch, [...(byBranch.get(branch) ?? []), edge]);
  }
  for (const [branchId, edges] of byBranch) {
    const components = edgeComponents(edges);
    if (components.length > 1) for (const rows of components.slice(1)) issues.push(topologyIssue({
      code: 'BRANCH_DISCONNECTED', severity: 'ERROR', confidence: 'HIGH', message: `Branch ${branchId} contains ${components.length} disconnected route components.`,
      objectIds: rows.map((row) => row.id), details: { branchId, componentCount: components.length },
    }));
    for (const edge of edges) if (edges.length > 1 && (graph.degree.get(edge.fromNodeId) ?? 0) === 1 && (graph.degree.get(edge.toNodeId) ?? 0) === 1) issues.push(topologyIssue({
      code: 'ISOLATED_ELEMENT', severity: 'ERROR', confidence: 'HIGH', message: `Element ${edge.id} is isolated from branch ${branchId}.`, objectIds: [edge.id], details: { branchId },
    }));
  }
  return issues;
}

/** @param {Record<string,unknown>} canonical @param {Record<string,unknown>} graph @param {Record<string,number>} options @returns {Record<string,unknown>[]} */
export function snapGapIssues(canonical, graph, options) {
  const endpoints = canonical.edges.flatMap((edge) => [edge.fromNodeId, edge.toNodeId]
    .filter((nodeId) => (graph.degree.get(nodeId) ?? 0) === 1)
    .map((nodeId) => ({ edge, nodeId, point: xyz(graph.nodes.get(nodeId).position) })));
  const candidates = [];
  for (let leftIndex = 0; leftIndex < endpoints.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < endpoints.length; rightIndex += 1) {
    const left = endpoints[leftIndex], right = endpoints[rightIndex];
    if (graph.componentByEdge.get(left.edge.id) === graph.componentByEdge.get(right.edge.id)) continue;
    const gapMm = pointDistance(left.point, right.point);
    if (gapMm > options.toleranceMm && gapMm <= options.snapToleranceMm) candidates.push({ left, right, gapMm });
  }
  const frequency = new Map();
  for (const row of candidates) for (const endpoint of [row.left, row.right]) frequency.set(endpoint.nodeId, (frequency.get(endpoint.nodeId) ?? 0) + 1);
  return candidates.map((row) => {
    const sameBranch = ownerBranch(row.left.edge) && ownerBranch(row.left.edge) === ownerBranch(row.right.edge);
    const unique = frequency.get(row.left.nodeId) === 1 && frequency.get(row.right.nodeId) === 1;
    return topologyIssue({
      code: 'SNAP_GAP', severity: 'ERROR', confidence: sameBranch && unique ? 'HIGH' : 'MEDIUM', fixability: sameBranch && unique ? 'AUTO_APPROVED' : 'NEEDS_CONFIRMATION',
      message: `Open endpoints ${row.left.nodeId} and ${row.right.nodeId} are ${row.gapMm.toFixed(3)} mm apart.`,
      objectIds: [row.left.edge.id, row.right.edge.id, row.left.nodeId, row.right.nodeId],
      details: { gapMm: row.gapMm, endpointIds: [row.left.nodeId, row.right.nodeId], edgeIds: [row.left.edge.id, row.right.edge.id], sameBranch, uniqueCandidate: unique },
      location: graph.nodes.get(row.left.nodeId).position,
    });
  });
}

/** @param {Record<string,unknown>} canonical @param {Record<string,unknown>} graph @param {Record<string,number>} options @returns {Record<string,unknown>[]} */
export function pairGeometryIssues(canonical, graph, options) {
  const geometry = canonical.edges.map((edge) => edgeGeometry(graph, edge)).filter(Boolean), issues = [];
  for (const [left, right] of candidatePairs(geometry, options.toleranceMm + options.clearanceMm)) {
    const leftNodes = [left.edge.fromNodeId, left.edge.toNodeId];
    if (leftNodes.includes(right.edge.fromNodeId) || leftNodes.includes(right.edge.toNodeId) || sameFeature(left.edge, right.edge)) continue;
    const overlapMm = overlapLength(left, right, options.toleranceMm);
    if (overlapMm > options.toleranceMm) {
      issues.push(topologyIssue({ code: 'OVERLAPPING_ELEMENTS', severity: 'ERROR', confidence: 'HIGH', fixability: 'NEEDS_CONFIRMATION', message: `Elements ${left.edge.id} and ${right.edge.id} overlap by ${overlapMm.toFixed(3)} mm.`, objectIds: [left.edge.id, right.edge.id], details: { overlapMm }, location: graph.nodes.get(left.edge.fromNodeId).position }));
      continue;
    }
    const clearance = segmentDistance(left.start, left.end, right.start, right.end), required = left.radius + right.radius + options.clearanceMm;
    if (required > 0 && clearance < required - options.toleranceMm) issues.push(topologyIssue({
      code: 'PHYSICAL_CLEARANCE_CLASH', severity: 'ERROR', confidence: 'HIGH', message: `Elements ${left.edge.id} and ${right.edge.id} have ${clearance.toFixed(3)} mm clearance; ${required.toFixed(3)} mm is required.`, objectIds: [left.edge.id, right.edge.id], details: { clearanceMm: clearance, requiredMm: required, clearanceAuthority: 'OD_INSULATION' }, location: graph.nodes.get(left.edge.fromNodeId).position,
    }));
    else if (clearance <= options.toleranceMm) issues.push(topologyIssue({
      code: 'CENTERLINE_CLASH', severity: 'WARNING', confidence: 'LOW', message: `Elements ${left.edge.id} and ${right.edge.id} intersect without a shared canonical node.`, objectIds: [left.edge.id, right.edge.id], details: { clearanceMm: clearance, clearanceAuthority: 'CENTERLINE_ONLY' }, location: graph.nodes.get(left.edge.fromNodeId).position,
    }));
  }
  return issues;
}

