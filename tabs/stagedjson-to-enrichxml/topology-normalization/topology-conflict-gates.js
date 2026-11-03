import { canonicalSemanticJson } from '../../../contracts/topo-enriched-xml/contract-core.js';
import { ruleForCandidate } from './normalization-policy.js';
import { collectNodeReferences } from './topology-node-references.js';

export function evaluateCandidates(candidates, context) {
  return candidates.map((candidate) => evaluateCandidate(candidate, context))
    .sort((a, b) => a.candidateId.localeCompare(b.candidateId));
}

export function buildCandidateClusters(actions) {
  const relevant = actions.filter((row) => row.logicalNodeIds.length === 2), adjacency = new Map();
  for (const action of relevant) connect(adjacency, action.logicalNodeIds[0], action.logicalNodeIds[1]);
  const remaining = new Set([...adjacency.keys()].sort()), clusters = [];
  while (remaining.size) clusters.push(walkCluster([...remaining][0], remaining, adjacency, relevant));
  return clusters.sort((a, b) => a.clusterId.localeCompare(b.clusterId));
}

export function evaluateCluster(cluster, context) {
  const approved = cluster.actions.filter(isApproved);
  if (!approved.length) return { ...cluster, approvedActions: [], issues: [] };
  const issues = [], rejected = cluster.actions.filter((row) => !isApproved(row));
  if (rejected.length) issues.push(issue('MIXED_AUTHORITY_CLUSTER_BLOCKED', { candidateIds: rejected.map((row) => row.candidateId) }));
  const diameter = clusterDiameter(cluster.actions);
  if (diameter === null) issues.push(issue('CLUSTER_COORDINATE_EVIDENCE_MISSING', { clusterId: cluster.clusterId }));
  else if (diameter > context.policy.clusterDiameterLimitMm) issues.push(issue('TRANSITIVE_CLUSTER_DIAMETER_EXCEEDED', { diameterMm: diameter, limitMm: context.policy.clusterDiameterLimitMm }));
  const survivorLogicalNodeId = deterministicSurvivor(cluster.logicalNodeIds, context.historyByNode, context.policy.survivorRule);
  const exactNodes = cluster.logicalNodeIds.filter((id) => context.historyByNode.has(id));
  if (exactNodes.length === 1 && survivorLogicalNodeId !== exactNodes[0]) issues.push(issue('HISTORICAL_IDENTITY_COLLAPSE_CONFLICT', { reason: 'EXACT_HISTORY_SURVIVOR_CHANGE', exactLogicalNodeId: exactNodes[0], survivorLogicalNodeId }));
  issues.push(...validateGraphCollapse(cluster, survivorLogicalNodeId, context.logicalGraph));
  return { ...cluster, approvedActions: issues.length ? [] : approved, issues: dedupe(issues), diameterMm: diameter, survivorLogicalNodeId };
}

export function evaluateCandidateClusters(actions, context) {
  const clusters = buildCandidateClusters(actions).map((cluster) => evaluateCluster(cluster, context));
  const clusterByCandidate = new Map();
  for (const cluster of clusters) for (const action of cluster.actions) clusterByCandidate.set(action.candidateId, cluster);
  return {
    actions: actions.map((action) => finalizeClusterAction(action, clusterByCandidate.get(action.candidateId))),
    clusters, blockers: dedupe(clusters.flatMap((cluster) => cluster.issues)),
  };
}

function finalizeClusterAction(action, cluster) {
  if (!cluster) return action;
  const blocked = blockedAction(action, cluster);
  if (!isApproved(blocked) || cluster.issues.length) return blocked;
  return {
    ...blocked, survivorLogicalNodeId: cluster.survivorLogicalNodeId,
    consumedLogicalNodeIds: cluster.logicalNodeIds.filter((id) => id !== cluster.survivorLogicalNodeId),
    evidence: { ...blocked.evidence, clusterId: cluster.clusterId, clusterDiameterMm: cluster.diameterMm },
  };
}

export function blockedAction(action, cluster) {
  if (!isApproved(action) || !cluster.issues.length) return action;
  return {
    ...action, disposition: 'BLOCKED_CONFLICT', survivorLogicalNodeId: null,
    issues: dedupe([...action.issues, ...cluster.issues]),
    evidence: { ...action.evidence, clusterId: cluster.clusterId },
  };
}

function evaluateCandidate(candidate, context) {
  const rule = ruleForCandidate(context.policy, candidate), issues = [];
  if (!rule) return noRuleAction(candidate, context);
  validateMapping(candidate, issues);
  validateExplicitAuthority(candidate, issues);
  validateScope(candidate, rule, issues);
  validateRoles(candidate, rule, issues);
  validateMeasurement(candidate, rule, context.policy, issues);
  validateTopologyAuthority(candidate, rule, context, issues);
  validateSemanticExclusions(candidate, context, issues);
  validateHistory(candidate, context.historyByNode, issues);
  return actionRecord(candidate, rule, issues.length ? 'BLOCKED_CONFLICT' : rule.action, issues, context);
}

function noRuleAction(candidate, context) {
  const prohibited = context.policy.prohibitedComponentCategories.includes(candidate.rawComponentType)
    || context.policy.prohibitedComponentCategories.includes(candidate.normalizedComponentType);
  if (!candidate.requested || prohibited) return actionRecord(candidate, null, 'PRESERVE', [], context, 'DISTANCE_ONLY_COLLAPSE_PROHIBITED');
  const code = candidate.kind === 'MICRO_GAP' ? 'MICRO_GAP_AUTHORITY_MISSING' : 'MICRO_COMPONENT_AUTHORITY_MISSING';
  return actionRecord(candidate, null, 'BLOCKED_CONFLICT', [issue(code, { sourceEntityId: candidate.sourceEntityId })], context);
}

function validateExplicitAuthority(candidate, issues) {
  if (candidate.authorityRecordId && candidate.occurrenceIds.length) return;
  const code = candidate.kind === 'MICRO_GAP' ? 'MICRO_GAP_AUTHORITY_MISSING' : 'MICRO_COMPONENT_AUTHORITY_MISSING';
  issues.push(issue(code, { reason: candidate.authorityRecordId ? 'OCCURRENCE_IDENTITY_MISSING' : 'CANDIDATE_AUTHORITY_RECORD_MISSING', sourceEntityId: candidate.sourceEntityId }));
}
function validateMapping(candidate, issues) {
  if (candidate.sourcePortIds.length !== 2 || candidate.logicalNodeIds.length !== 2) issues.push(issue('RAW_PORT_MAPPING_INCOMPLETE', { candidateId: candidate.candidateId }));
  if (candidate.logicalNodeIds.length === 1) issues.push(issue('NORMALIZATION_SELF_LOOP_CREATED', { candidateId: candidate.candidateId }));
}
function validateScope(candidate, rule, issues) {
  if (rule.sameSourceBranch && !candidate.sourceBranch) issues.push(issue('BRANCH_OR_JUNCTION_COLLAPSE_PROHIBITED', { reason: 'SOURCE_BRANCH_CONFLICT' }));
  if (rule.sameCanonicalMainLine && !candidate.canonicalMainLine) issues.push(issue('BRANCH_OR_JUNCTION_COLLAPSE_PROHIBITED', { reason: 'CANONICAL_LINE_CONFLICT' }));
}
function validateRoles(candidate, rule, issues) {
  if (canonical(candidate.portRoles) !== canonical(rule.requiredPortRoles)) issues.push(issue('SOURCE_PORT_OWNERSHIP_CONFLICT', { expectedRoles: rule.requiredPortRoles, actualRoles: candidate.portRoles }));
}
function validateMeasurement(candidate, rule, policy, issues) {
  const limit = candidate.kind === 'MICRO_GAP' ? rule.maxGapMm : rule.maxLengthMm;
  if (!Number.isFinite(candidate.measurementMm)) issues.push(issue('DISTANCE_ONLY_COLLAPSE_PROHIBITED', { reason: 'MEASUREMENT_MISSING' }));
  else if (candidate.measurementMm > limit + policy.coordinateToleranceMm) issues.push(issue('DISTANCE_ONLY_COLLAPSE_PROHIBITED', { measurementMm: candidate.measurementMm, limitMm: limit }));
  if (candidate.portCoordinates.length !== 2) issues.push(issue('CLUSTER_COORDINATE_EVIDENCE_MISSING', { candidateId: candidate.candidateId }));
}
function validateTopologyAuthority(candidate, rule, context, issues) {
  const degrees = candidate.logicalNodeIds.map((id) => degree(context.logicalGraph, id)).sort((a, b) => a - b);
  if (!rule.allowedDegreePatterns.some((row) => canonical(row) === canonical(degrees))) issues.push(issue('TOPOLOGY_DEGREE_CONFLICT', { degrees, allowed: rule.allowedDegreePatterns }));
  if (candidate.kind === 'MICRO_COMPONENT') {
    const connecting = context.logicalGraph.edges.filter((edge) => candidate.edgeIds.includes(text(edge.logicalEdgeId)) && sameEndpoints(edge, candidate.logicalNodeIds));
    if (connecting.length !== 1) issues.push(issue('DISTANCE_ONLY_COLLAPSE_PROHIBITED', { reason: 'EXPLICIT_COMPONENT_EDGE_REQUIRED', edgeIds: candidate.edgeIds }));
  }
}

function validateSemanticExclusions(candidate, context, issues) {
  const ids = new Set(candidate.logicalNodeIds);
  checkCollection(context.logicalGraph.junctions, ids, 'BRANCH_OR_JUNCTION_COLLAPSE_PROHIBITED', issues);
  checkCollection(context.logicalGraph.boundaries, ids, 'BOUNDARY_COLLAPSE_PROHIBITED', issues);
  checkCollection(context.logicalGraph.supports, ids, 'SUPPORT_OR_ANCHOR_COLLAPSE_PROHIBITED', issues);
  for (const node of context.logicalGraph.nodes.filter((row) => ids.has(text(row.logicalNodeId)))) {
    if (node.isAnchor === true || array(node.restraints).length || /ANCHOR|SUPPORT|BOUNDARY|JUNCTION|BRANCH/.test(text(node.logicalRole).toUpperCase())) issues.push(issue('SUPPORT_OR_ANCHOR_COLLAPSE_PROHIBITED', { logicalNodeId: node.logicalNodeId }));
  }
}
function checkCollection(rows, ids, code, issues) {
  for (const [index, row] of array(rows).entries()) {
    const matched = collectNodeReferences(row).filter((id) => ids.has(id));
    if (matched.length) issues.push(issue(code, { index, logicalNodeIds: matched }));
  }
}
function validateHistory(candidate, historyByNode, issues) {
  const histories = unique(candidate.logicalNodeIds.map((id) => historyByNode.get(id)).filter(Boolean));
  if (histories.length > 1) issues.push(issue('HISTORICAL_IDENTITY_COLLAPSE_CONFLICT', { logicalNodeIds: candidate.logicalNodeIds, historyNodeIds: histories.sort() }));
}

function actionRecord(candidate, rule, disposition, issues, context, reasonCode = null) {
  return {
    actionId: `NA-${candidate.candidateId}`, candidateId: candidate.candidateId, candidateKind: candidate.kind,
    sourceEntityId: candidate.sourceEntityId, sourcePortIds: candidate.sourcePortIds,
    logicalNodeIds: candidate.logicalNodeIds, occurrenceIds: candidate.occurrenceIds,
    disposition, ...(rule?.authority ? { authority: rule.authority } : {}), ruleId: rule?.ruleId || null,
    survivorLogicalNodeId: null, consumedLogicalNodeIds: [],
    evidence: { measurementMm: candidate.measurementMm, sourcePath: candidate.sourcePath, sourceBranch: candidate.sourceBranch, canonicalMainLine: candidate.canonicalMainLine, edgeIds: candidate.edgeIds, policyHash: context.policyHash, reasonCode },
    evidencePoints: candidate.portCoordinates, issues: dedupe(issues),
  };
}

function validateGraphCollapse(cluster, survivor, graph) {
  const issues = [], members = new Set(cluster.logicalNodeIds), removed = consumedEdgeIds(cluster.actions), projected = [];
  for (const edge of graph.edges) {
    if (removed.has(text(edge.logicalEdgeId))) continue;
    const from = members.has(text(edge.fromLogicalNodeId)) ? survivor : text(edge.fromLogicalNodeId);
    const to = members.has(text(edge.toLogicalNodeId)) ? survivor : text(edge.toLogicalNodeId);
    if (from === to) issues.push(issue('NORMALIZATION_SELF_LOOP_CREATED', { logicalEdgeId: edge.logicalEdgeId }));
    projected.push({ id: text(edge.logicalEdgeId), from, to });
  }
  const duplicate = duplicateEdge(projected);
  if (duplicate) issues.push(issue('NORMALIZATION_DUPLICATE_EDGE_CREATED', duplicate));
  if (componentCount(graph.nodes.map((row) => text(row.logicalNodeId)), graph.edges) < componentCount(projectedNodes(graph, members, survivor), projected)) issues.push(issue('NORMALIZATION_DISCONNECT_CREATED'));
  return issues;
}

function walkCluster(seed, remaining, adjacency, actions) {
  const nodes = new Set(), queue = [seed];
  while (queue.length) { const node = queue.shift(); if (nodes.has(node)) continue; nodes.add(node); remaining.delete(node); for (const next of adjacency.get(node) || []) queue.push(next); }
  const logicalNodeIds = [...nodes].sort();
  return { clusterId: `CL-${logicalNodeIds.join('--')}`, logicalNodeIds, actions: actions.filter((row) => row.logicalNodeIds.some((id) => nodes.has(id))).sort((a, b) => a.candidateId.localeCompare(b.candidateId)) };
}
function deterministicSurvivor(ids, historyByNode, rule) { const exact = ids.filter((id) => historyByNode.has(id)).sort(); return rule === 'EXACT_HISTORY_THEN_LEXICAL' && exact.length === 1 ? exact[0] : [...ids].sort()[0]; }
function clusterDiameter(actions) { const points = actions.flatMap((row) => row.evidencePoints || []); if (points.length < 2) return null; let max = 0; for (let i = 0; i < points.length; i += 1) for (let j = i + 1; j < points.length; j += 1) max = Math.max(max, Math.hypot(points[i].x-points[j].x, points[i].y-points[j].y, points[i].z-points[j].z)); return max; }
function consumedEdgeIds(actions) { return new Set(actions.filter((row) => row.disposition === 'CONSUME_MICRO_COMPONENT').flatMap((row) => row.evidence.edgeIds || [])); }
function projectedNodes(graph, members, survivor) { return graph.nodes.map((row) => members.has(text(row.logicalNodeId)) ? survivor : text(row.logicalNodeId)).filter((id, i, rows) => rows.indexOf(id) === i); }
function duplicateEdge(rows) { const seen = new Map(); for (const row of rows) { const key = [row.from,row.to].sort().join('\u0000'); if (seen.has(key)) return { edgeIds: [seen.get(key), row.id] }; seen.set(key,row.id); } return null; }
function componentCount(nodes, edges) { const map = new Map(nodes.map((id)=>[id,new Set()])); for (const edge of edges) { const a=text(edge.from??edge.fromLogicalNodeId),b=text(edge.to??edge.toLogicalNodeId); if(map.has(a)&&map.has(b)){map.get(a).add(b);map.get(b).add(a);} } let count=0; const seen=new Set(); for(const id of nodes){if(seen.has(id))continue;count+=1;const q=[id];while(q.length){const n=q.pop();if(seen.has(n))continue;seen.add(n);for(const x of map.get(n)||[])q.push(x);}}return count; }
function degree(graph, id) { return graph.edges.filter((edge) => [text(edge.fromLogicalNodeId), text(edge.toLogicalNodeId)].includes(id)).length; }
function sameEndpoints(edge, ids) { return canonical([text(edge.fromLogicalNodeId), text(edge.toLogicalNodeId)].sort()) === canonical([...ids].sort()); }
function connect(map, a, b) { if (!map.has(a)) map.set(a, new Set()); if (!map.has(b)) map.set(b, new Set()); map.get(a).add(b); map.get(b).add(a); }
function isApproved(row) { return ['CONSUME_MICRO_COMPONENT','SNAP_MICRO_GAP'].includes(row.disposition); }
function issue(code, evidence = {}) { return { code, evidence }; }
function dedupe(rows) { const seen=new Set(); return rows.filter((row)=>{const key=canonicalSemanticJson(row);if(seen.has(key))return false;seen.add(key);return true;}); }
function canonical(value) { return canonicalSemanticJson(value); }
function array(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
function unique(values) { return [...new Set(values)]; }
