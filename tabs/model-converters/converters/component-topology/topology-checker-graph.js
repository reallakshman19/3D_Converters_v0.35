/**
 * Engineering-aware graph and vector helpers for topology checking.
 * Canonical arrays are indexed without mutation. Route ownership uses the
 * first authoritative branch identifier so support ancestry cannot fragment a branch.
 */

import { cleanText } from './topology-values.js';

const INLINE_ROLES = /^(GASK|FLANGE|VALVE|INST|INSTRUMENT|REDUCER)$/;
const EXPECTED_SHORT_ROLES = /^(GASK)$/;

/** @param {Record<string,unknown>} point @returns {number[]} */
export function xyz(point) { return [Number(point.x), Number(point.y), Number(point.z)]; }
/** @param {number[]} left @param {number[]} right @returns {number[]} */
export function subtract(left, right) { return left.map((value, index) => value - right[index]); }
/** @param {number[]} left @param {number[]} right @returns {number} */
export function dot(left, right) { return left.reduce((sum, value, index) => sum + (value * right[index]), 0); }
/** @param {number[]} value @returns {number} */
export function vectorLength(value) { return Math.hypot(...value); }
/** @param {number[]} value @returns {number[]|null} */
export function unit(value) { const size = vectorLength(value); return size > 1e-12 ? value.map((part) => part / size) : null; }
/** @param {number} value @param {number} minimum @param {number} maximum @returns {number} */
export function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
/** @param {number[]} left @param {number[]} right @returns {number} */
export function pointDistance(left, right) { return vectorLength(subtract(left, right)); }

/** @param {number[]} first @param {number[]} second @returns {number} */
export function angleDegrees(first, second) {
  const left = unit(first), right = unit(second);
  return left && right ? Math.acos(clamp(dot(left, right), -1, 1)) * (180 / Math.PI) : Number.NaN;
}

/** @param {number[]} p1 @param {number[]} q1 @param {number[]} p2 @param {number[]} q2 @returns {number} */
export function segmentDistance(p1, q1, p2, q2) {
  const u = subtract(q1, p1), v = subtract(q2, p2), w = subtract(p1, p2);
  const a = dot(u, u), b = dot(u, v), c = dot(v, v), d = dot(u, w), e = dot(v, w), den = (a * c) - (b * b);
  let sn = den, sd = den, tn = den, td = den;
  if (den < 1e-12) { sn = 0; sd = 1; tn = e; td = c; }
  else {
    sn = (b * e) - (c * d); tn = (a * e) - (b * d);
    if (sn < 0) { sn = 0; tn = e; td = c; }
    else if (sn > sd) { sn = sd; tn = e + b; td = c; }
  }
  if (tn < 0) {
    tn = 0;
    if (-d < 0) sn = 0; else if (-d > a) sn = sd; else { sn = -d; sd = a; }
  } else if (tn > td) {
    tn = td;
    if ((-d + b) < 0) sn = 0; else if ((-d + b) > a) sn = sd; else { sn = -d + b; sd = a; }
  }
  const sc = Math.abs(sn) < 1e-12 ? 0 : sn / sd, tc = Math.abs(tn) < 1e-12 ? 0 : tn / td;
  return vectorLength(w.map((value, index) => value + (sc * u[index]) - (tc * v[index])));
}

/** @param {Record<string,unknown>} left @param {Record<string,unknown>} right @param {number} tolerance @returns {number} */
export function overlapLength(left, right, tolerance) {
  const axis = subtract(left.end, left.start), size = vectorLength(axis), direction = unit(axis);
  if (!direction || segmentDistance(left.start, left.end, right.start, right.end) > tolerance) return 0;
  const rightDirection = unit(subtract(right.end, right.start));
  if (!rightDirection || Math.abs(Math.abs(dot(direction, rightDirection)) - 1) > 1e-6) return 0;
  const first = dot(subtract(right.start, left.start), direction), second = dot(subtract(right.end, left.start), direction);
  return Math.max(0, Math.min(size, Math.max(first, second)) - Math.max(0, Math.min(first, second)));
}

/** @param {Record<string,unknown>} edge @returns {string} */
export function edgeRole(edge) { return cleanText(edge.segmentRole).toUpperCase().replace(/_SUPPORT_SPLIT$/, ''); }
/** @param {Record<string,unknown>} edge @returns {boolean} */
export function isInlineEdge(edge) { return INLINE_ROLES.test(edgeRole(edge)); }
/** @param {Record<string,unknown>} edge @returns {boolean} */
export function isExpectedShortEdge(edge) { return EXPECTED_SHORT_ROLES.test(edgeRole(edge)); }
/** @param {Record<string,unknown>} edge @returns {boolean} */
export function isRouteEdge(edge) { return !isInlineEdge(edge); }
/** @param {Record<string,unknown>} edge @returns {string} */
export function ownerBranch(edge) { return cleanText(edge.ownerBranchId ?? edge.sourceBranchEntityId ?? edge.branchIds?.[0]); }

/** @param {Record<string,unknown>[]} edges @returns {Record<string,unknown>[][]} */
export function edgeComponents(edges) {
  const byNode = new Map();
  for (const edge of edges) for (const id of [edge.fromNodeId, edge.toNodeId]) byNode.set(id, [...(byNode.get(id) ?? []), edge]);
  const remaining = new Set(edges), components = [];
  while (remaining.size) {
    const first = remaining.values().next().value, stack = [first], rows = []; remaining.delete(first);
    while (stack.length) {
      const edge = stack.pop(); rows.push(edge);
      for (const id of [edge.fromNodeId, edge.toNodeId]) for (const next of byNode.get(id) ?? []) if (remaining.delete(next)) stack.push(next);
    }
    components.push(rows);
  }
  return components;
}

/** @param {Record<string,unknown>[]} geometry @param {number} tolerance @returns {Record<string,unknown>[][]} */
export function candidatePairs(geometry, tolerance) {
  if (geometry.length < 2) return [];
  const ranges = [0, 1, 2].map((axis) => Math.max(...geometry.map((row) => row.max[axis])) - Math.min(...geometry.map((row) => row.min[axis])));
  const sweep = ranges.indexOf(Math.max(...ranges)), sorted = [...geometry].sort((left, right) => left.min[sweep] - right.min[sweep]), pairs = [];
  for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex += 1) {
    const left = sorted[leftIndex], right = sorted[rightIndex];
    if (right.min[sweep] > left.max[sweep] + tolerance) break;
    if ([0, 1, 2].every((axis) => right.min[axis] <= left.max[axis] + tolerance && right.max[axis] >= left.min[axis] - tolerance)) pairs.push([left, right]);
  }
  return pairs;
}

/** @param {Record<string,unknown>} canonical @returns {Readonly<Record<string,unknown>>} */
export function buildTopologyCheckGraph(canonical) {
  const nodes = new Map(canonical.nodes.map((node) => [cleanText(node.id), node]));
  const incident = new Map(), degree = new Map(), geometry = [];
  for (const edge of canonical.edges) {
    const from = nodes.get(cleanText(edge.fromNodeId)), to = nodes.get(cleanText(edge.toNodeId));
    if (!from || !to) continue;
    for (const id of [edge.fromNodeId, edge.toNodeId]) { incident.set(id, [...(incident.get(id) ?? []), edge]); degree.set(id, (degree.get(id) ?? 0) + 1); }
    const start = xyz(from.position), end = xyz(to.position);
    geometry.push({ edge, start, end, min: start.map((value, axis) => Math.min(value, end[axis])), max: start.map((value, axis) => Math.max(value, end[axis])) });
  }
  const components = edgeComponents(canonical.edges.filter((edge) => nodes.has(edge.fromNodeId) && nodes.has(edge.toNodeId)));
  const componentByEdge = new Map(components.flatMap((rows, index) => rows.map((edge) => [edge.id, index])));
  return Object.freeze({ nodes, incident, degree, geometry: Object.freeze(geometry), components: Object.freeze(components), componentByEdge });
}

/** @param {Record<string,unknown>} graph @param {Record<string,unknown>} edge @param {string} nodeId @returns {number[]} */
export function outwardVector(graph, edge, nodeId) {
  const node = graph.nodes.get(nodeId), otherId = edge.fromNodeId === nodeId ? edge.toNodeId : edge.fromNodeId, other = graph.nodes.get(otherId);
  return node && other ? subtract(xyz(other.position), xyz(node.position)) : [0, 0, 0];
}

