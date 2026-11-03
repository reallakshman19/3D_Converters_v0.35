/**
 * Deterministic topology-fix suggestion planner.
 * Suggestions contain explicit edit commands, preconditions, risk, preview
 * geometry, and approval state. Ambiguous geometry never receives executable commands.
 */

import { deterministicHash } from './topology-deterministic-hash.js';
import { appendTopologyEditTransaction } from './topology-edit-contract.js';
import { buildTopologyCheckGraph, ownerBranch, pointDistance, xyz } from './topology-checker-graph.js';

/** @param {Record<string,unknown>} canonical @param {string} id @returns {Record<string,unknown>|null} */
function edgeById(canonical, id) { return canonical.edges.find((edge) => edge.id === id) ?? null; }
/** @param {Record<string,unknown>} canonical @param {string} id @returns {Record<string,unknown>|null} */
function nodeById(canonical, id) { return canonical.nodes.find((node) => node.id === id) ?? null; }

/** @param {Record<string,unknown>} edge @returns {number} */
function edgeDiameter(edge) { return Number(edge?.diameterMm ?? edge?.diameter ?? 0); }

/** @param {Record<string,unknown>} issue @param {Record<string,unknown>} input @returns {Readonly<Record<string,unknown>>} */
function suggestion(issue, input) {
  const operations = Object.freeze([...(input.operations ?? [])]);
  const hash = deterministicHash({ issueId: issue.id, operations, title: input.title });
  return Object.freeze({
    schema: 'TopologyFixSuggestion.v1', id: `TS-${hash.split(':')[1]}`, issueId: issue.id,
    title: input.title, rationale: input.rationale, confidence: input.confidence ?? issue.confidence,
    risk: input.risk ?? 'MEDIUM', fixability: input.fixability ?? (operations.length ? 'NEEDS_CONFIRMATION' : 'MANUAL_ENGINEERING'),
    approvedByDefault: input.approvedByDefault === true && operations.length > 0,
    operations, preconditions: Object.freeze([...(input.preconditions ?? [])]),
    affectedObjectIds: Object.freeze([...(issue.objectIds ?? [])]), preview: Object.freeze({ ...(input.preview ?? {}) }),
  });
}

/** @param {Record<string,unknown>} canonical @param {Record<string,unknown>} issue @returns {Readonly<Record<string,unknown>>} */
function snapSuggestion(canonical, issue) {
  const [sourceNodeId, targetNodeId] = [...(issue.details.endpointIds ?? [])].sort().reverse();
  const executable = issue.fixability === 'AUTO_APPROVED' && sourceNodeId && targetNodeId;
  return suggestion(issue, {
    title: 'Merge verified open endpoints', rationale: 'The endpoints are a unique, graph-disconnected candidate within the approved snap tolerance.',
    confidence: executable ? 'HIGH' : 'MEDIUM', risk: 'LOW', fixability: executable ? 'AUTO_APPROVED' : 'NEEDS_CONFIRMATION', approvedByDefault: executable,
    operations: executable ? [{ type: 'MERGE_NODES', payload: { sourceNodeId, targetNodeId } }] : [],
    preconditions: ['OPEN_ENDPOINTS', 'NO_EXISTING_GRAPH_PATH', 'UNIQUE_NEAREST_CANDIDATE', 'SAME_OWNER_BRANCH'],
    preview: { kind: 'MERGE_NODES', from: nodeById(canonical, sourceNodeId)?.position, to: nodeById(canonical, targetNodeId)?.position },
  });
}

/** @param {Record<string,unknown>} canonical @param {Record<string,unknown>} issue @returns {Readonly<Record<string,unknown>>} */
function bendSuggestion(canonical, issue) {
  const edges = (issue.details.edgeIds ?? []).map((id) => edgeById(canonical, id)).filter(Boolean);
  const catalogRadius = Math.max(0, ...edges.map((edge) => Number(edge.bendRadiusMm ?? edge.radiusMm ?? 0)));
  const diameter = Math.max(0, ...edges.map(edgeDiameter)), radiusMm = catalogRadius || (diameter > 0 ? diameter * 1.5 : 0);
  const executable = edges.length === 2 && radiusMm > 0;
  return suggestion(issue, {
    title: 'Add bend definition', rationale: catalogRadius ? 'Uses authoritative bend radius from the inherited edge context.' : 'No catalog radius exists; uses the approved 1.5D long-radius fallback.',
    confidence: executable ? 'HIGH' : 'LOW', risk: catalogRadius ? 'LOW' : 'MEDIUM', fixability: executable ? 'AUTO_APPROVED' : 'NEEDS_CONFIRMATION', approvedByDefault: executable,
    operations: executable ? [{ type: 'ADD_BEND_DEFINITION', payload: { nodeId: issue.details.nodeId, edgeIds: edges.map((edge) => edge.id), radiusMm, angleDeg: issue.details.angleDeg, radiusAuthority: catalogRadius ? 'CATALOG' : 'APPROVED_1_5D_FALLBACK' } }] : [],
    preconditions: ['DEGREE_TWO_ROUTE_NODE', 'NO_EXISTING_BEND', 'POSITIVE_RADIUS_AUTHORITY'],
    preview: { kind: 'ADD_BEND_DEFINITION', nodeId: issue.details.nodeId, radiusMm, fallback: !catalogRadius },
  });
}

/** @param {Record<string,unknown>[]} edges @returns {string} */
function inferredJunctionKind(edges) {
  const diameters = edges.map(edgeDiameter).filter((value) => value > 0);
  return diameters.length === edges.length && Math.min(...diameters) < Math.max(...diameters) ? 'OLET' : 'TEE';
}

/** @param {Record<string,unknown>} canonical @param {Record<string,unknown>} issue @returns {Readonly<Record<string,unknown>>} */
function junctionSuggestion(canonical, issue) {
  const edges = (issue.details.edgeIds ?? []).map((id) => edgeById(canonical, id)).filter(Boolean), executable = edges.length === 3;
  const kind = inferredJunctionKind(edges), completeDiameter = edges.every((edge) => edgeDiameter(edge) > 0);
  return suggestion(issue, {
    title: `Add ${kind} junction definition`, rationale: kind === 'OLET' ? 'Authoritative branch diameter is smaller than the run diameter.' : 'Equal or unavailable diameters default to Tee; missing diameter authority remains visible for review.',
    confidence: completeDiameter ? 'HIGH' : 'MEDIUM', risk: completeDiameter ? 'LOW' : 'MEDIUM', fixability: executable ? 'AUTO_APPROVED' : 'NEEDS_CONFIRMATION', approvedByDefault: executable,
    operations: executable ? [{ type: 'ADD_JUNCTION_DEFINITION', payload: { nodeId: issue.details.nodeId, edgeIds: edges.map((edge) => edge.id), kind, inferenceAuthority: completeDiameter ? 'AUTHORITATIVE_DIAMETER' : 'TEE_MISSING_DIAMETER_FALLBACK' } }] : [],
    preconditions: ['DEGREE_THREE_NODE', 'NO_EXISTING_JUNCTION'], preview: { kind: 'ADD_JUNCTION_DEFINITION', nodeId: issue.details.nodeId, junctionKind: kind },
  });
}

/** @param {number[]} point @param {number[]} start @param {number[]} end @returns {{distance:number,parameter:number,projection:number[]}} */
function projectPoint(point, start, end) {
  const vector = end.map((value, index) => value - start[index]), offset = point.map((value, index) => value - start[index]);
  const denominator = vector.reduce((sum, value) => sum + (value * value), 0), parameter = denominator ? offset.reduce((sum, value, index) => sum + (value * vector[index]), 0) / denominator : 0;
  const projection = start.map((value, index) => value + (vector[index] * parameter));
  return { distance: pointDistance(point, projection), parameter, projection };
}

/** @param {Record<string,unknown>} canonical @param {Record<string,unknown>} issue @param {Record<string,unknown>} graph @returns {Record<string,unknown>|null} */
function provenTrim(canonical, issue, graph) {
  const edges = issue.objectIds.map((id) => edgeById(canonical, id)).filter(Boolean);
  if (edges.length !== 2 || !ownerBranch(edges[0]) || ownerBranch(edges[0]) !== ownerBranch(edges[1])) return null;
  const candidates = [];
  for (const edge of edges) for (const endpoint of ['FROM', 'TO']) {
    const nodeId = endpoint === 'FROM' ? edge.fromNodeId : edge.toNodeId;
    if ((graph.degree.get(nodeId) ?? 0) !== 1) continue;
    const other = edges.find((row) => row.id !== edge.id), node = nodeById(canonical, nodeId);
    const from = nodeById(canonical, other.fromNodeId), to = nodeById(canonical, other.toNodeId);
    const projected = projectPoint(xyz(node.position), xyz(from.position), xyz(to.position));
    if (projected.distance > Number(canonical.toleranceMm ?? 0.1) || projected.parameter <= 0 || projected.parameter >= 1) continue;
    const targets = [from.position, to.position].sort((left, right) => pointDistance(xyz(node.position), xyz(left)) - pointDistance(xyz(node.position), xyz(right)));
    candidates.push({ edgeId: edge.id, endpoint, nodeId, position: targets[0] });
  }
  return candidates.length === 1 ? candidates[0] : null;
}

/** @param {Record<string,unknown>} canonical @param {Record<string,unknown>} issue @param {Record<string,unknown>} graph @returns {Readonly<Record<string,unknown>>} */
function trimSuggestion(canonical, issue, graph) {
  const trim = provenTrim(canonical, issue, graph), executable = Boolean(trim);
  return suggestion(issue, {
    title: 'Trim proven redundant tail', rationale: executable ? 'Branch ownership, a unique free endpoint, and collinear overlap prove one redundant tail.' : 'No unique dependency-free redundant tail can be proven; open a manual preview.',
    confidence: executable ? 'HIGH' : 'LOW', risk: executable ? 'LOW' : 'HIGH', fixability: executable ? 'AUTO_APPROVED' : 'NEEDS_CONFIRMATION', approvedByDefault: executable,
    operations: executable ? [{ type: 'TRIM_EDGE', payload: trim }] : [], preconditions: ['SAME_OWNER_BRANCH', 'UNIQUE_FREE_ENDPOINT', 'NO_ATTACHED_DEPENDENCIES', 'COLLINEAR_REDUNDANT_TAIL'],
    preview: executable ? { kind: 'TRIM_EDGE', ...trim } : { kind: 'MANUAL_TRIM' },
  });
}

/** @param {Record<string,unknown>} canonical @param {Record<string,unknown>} report @param {Record<string,unknown>} options @returns {Readonly<Record<string,unknown>[]>} */
export function buildTopologyFixSuggestions(canonical, report, options) {
  if (report?.schema !== 'TopologyCheckReport.v1') throw new TypeError('Fix suggestions require TopologyCheckReport.v1.');
  const graph = buildTopologyCheckGraph(canonical), suggestions = [];
  for (const issue of report.issues) {
    if (issue.code === 'SNAP_GAP') suggestions.push(snapSuggestion(canonical, issue));
    else if (issue.code === 'RIGHT_ANGLE_WITHOUT_BEND') suggestions.push(bendSuggestion(canonical, issue));
    else if (issue.code === 'MULTIWAY_WITHOUT_JUNCTION') suggestions.push(junctionSuggestion(canonical, issue));
    else if (['OVERLAPPING_ELEMENTS', 'PIPE_BACKTRACK'].includes(issue.code)) suggestions.push(trimSuggestion(canonical, issue, graph));
  }
  return Object.freeze(suggestions);
}

/** @param {Record<string,unknown>} draft @param {Record<string,unknown>} suggestionRecord @returns {Readonly<Record<string,unknown>>} */
export function applyTopologyFixSuggestion(draft, suggestionRecord) {
  if (suggestionRecord?.schema !== 'TopologyFixSuggestion.v1') throw new TypeError('Expected TopologyFixSuggestion.v1.');
  if (!suggestionRecord.operations?.length) throw new Error(`Suggestion ${suggestionRecord.id} has no executable operations.`);
  return appendTopologyEditTransaction(draft, suggestionRecord.operations, { suggestionIds: [suggestionRecord.id], issueIds: [suggestionRecord.issueId] });
}

/** @param {Record<string,unknown>} draft @param {Record<string,unknown>[]} suggestions @returns {Readonly<Record<string,unknown>>} */
export function applyApprovedTopologyFixes(draft, suggestions) {
  const approved = suggestions.filter((row) => row.approvedByDefault && row.operations?.length);
  if (!approved.length) return draft;
  return appendTopologyEditTransaction(draft, approved.flatMap((row) => row.operations), { suggestionIds: approved.map((row) => row.id), issueIds: approved.map((row) => row.issueId) });
}

export const _test = Object.freeze({ edgeDiameter, inferredJunctionKind, projectPoint, provenTrim });

