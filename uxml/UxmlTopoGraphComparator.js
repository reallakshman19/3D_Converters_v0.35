/**
 * UxmlTopoGraphComparator.js
 *
 * Agent 07: UniversalTopoGraph vs RayTopoGraph comparator.
 *
 * Purpose:
 * - Compare deterministic UniversalTopoGraph evidence with RayTopoGraph evidence.
 * - Classify agreement, universal-only, ray-only, safe ray promotions,
 *   rejected/manual ray evidence, face proximity evidence, and unresolved
 *   universal disconnects.
 *
 * Out of scope:
 * - Applying fixes.
 * - Mutating UXML / graph / face model state.
 * - Emitting PCF/GLB/InputXML/CII.
 * - Master resolution.
 */

import {
  DIAGNOSTIC_SEVERITIES,
  RAY_DECISIONS,
} from './UxmlConstants.js';

import {
  createUxmlDiagnostic,
} from './UxmlTypes.js';

import {
  buildUxmlUniversalTopoGraph,
} from './UxmlUniversalTopoGraphBuilder.js';

import {
  buildUxmlRayTopoGraph,
} from './UxmlRayTopoGraphBuilder.js';

const TOPO_GRAPH_COMPARATOR_SCHEMA = 'uxml-topo-graph-comparator/v1';

const DEFAULT_CONFIG = Object.freeze({
  includeUniversalOnlyEdges: true,
  includeFaceSnapCandidates: true,
  treatUnsafeRayAsManualReview: true,
  allowBlockedGraphs: false,
});

function clean(value) {
  return String(value ?? '').trim();
}

function normalizeConfig(options = {}) {
  return {
    includeUniversalOnlyEdges: options.includeUniversalOnlyEdges !== false,
    includeFaceSnapCandidates: options.includeFaceSnapCandidates !== false,
    treatUnsafeRayAsManualReview: options.treatUnsafeRayAsManualReview !== false,
    allowBlockedGraphs: options.allowBlockedGraphs === true,
  };
}

function makeDiagnosticFactory(out) {
  return function addDiagnostic({
    severity = DIAGNOSTIC_SEVERITIES.INFO,
    code,
    message,
    componentId = '',
    portId = '',
    details = {},
  }) {
    const diagnostic = createUxmlDiagnostic({
      id: `TC-D-${String(out.diagnostics.length + 1).padStart(5, '0')}`,
      severity,
      code,
      message,
      componentId,
      portId,
      details,
    });

    out.diagnostics.push(diagnostic);
    return diagnostic;
  };
}

function sortedPair(a, b) {
  return [clean(a), clean(b)].sort();
}

function componentPairKey(a, b) {
  const pair = sortedPair(a, b);
  return `${pair[0]}|${pair[1]}`;
}

function portPairKey(a, b) {
  const pair = sortedPair(a, b);
  return `${pair[0]}|${pair[1]}`;
}

function stripUniversalPortPrefix(portId) {
  const id = clean(portId);
  return id.startsWith('UTG-P-') ? id.slice('UTG-P-'.length) : id;
}

function universalEdgePairKey(edge) {
  return componentPairKey(edge.sourceComponentId, edge.targetComponentId);
}

function universalEdgePortKey(edge) {
  return portPairKey(edge.sourcePortId, edge.targetPortId);
}

function rayCandidatePairKey(candidate) {
  return componentPairKey(candidate.sourceComponentId, candidate.targetComponentId);
}

function rayCandidateFacePairKey(candidate) {
  return portPairKey(candidate.sourceFaceId, candidate.targetFaceId);
}

function buildUniversalEdgeIndexes(universalGraph) {
  const byComponentPair = new Map();
  const byPortPair = new Map();

  for (const edge of universalGraph?.edges || []) {
    const componentKey = universalEdgePairKey(edge);
    const portKey = universalEdgePortKey(edge);

    if (!byComponentPair.has(componentKey)) byComponentPair.set(componentKey, []);
    if (!byPortPair.has(portKey)) byPortPair.set(portKey, []);

    byComponentPair.get(componentKey).push(edge);
    byPortPair.get(portKey).push(edge);
  }

  return { byComponentPair, byPortPair };
}

function buildUniversalDisconnectedIndex(universalGraph) {
  const byFaceId = new Map();
  const byComponentRole = new Map();

  for (const item of universalGraph?.disconnected || []) {
    const faceId = stripUniversalPortPrefix(item.portId);

    if (faceId) {
      byFaceId.set(faceId, item);
    }

    const componentRoleKey = `${clean(item.componentId)}|${clean(item.role)}`;
    byComponentRole.set(componentRoleKey, item);
  }

  return { byFaceId, byComponentRole };
}

function findUniversalEdgeForRay(candidate, edgeIndexes) {
  const facePairKey = rayCandidateFacePairKey(candidate);
  const componentPair = rayCandidatePairKey(candidate);

  const portMatches = edgeIndexes.byPortPair.get(facePairKey) || [];
  if (portMatches.length) return portMatches[0];

  const componentMatches = edgeIndexes.byComponentPair.get(componentPair) || [];
  if (componentMatches.length) return componentMatches[0];

  return null;
}

function rayCandidateDecision(candidate) {
  if (candidate.safe === true) return RAY_DECISIONS.PROMOTE_RAY_SAFE;
  if ((candidate.blockers || []).length) return RAY_DECISIONS.MANUAL_REVIEW;
  return candidate.decision || RAY_DECISIONS.MANUAL_REVIEW;
}

function candidateIdentity(candidate) {
  return {
    id: candidate.id,
    pass: candidate.pass || '',
    sourceComponentId: candidate.sourceComponentId || '',
    sourceFaceId: candidate.sourceFaceId || '',
    sourceRole: candidate.sourceRole || '',
    targetComponentId: candidate.targetComponentId || '',
    targetFaceId: candidate.targetFaceId || '',
    targetRole: candidate.targetRole || '',
    pipelineRef: candidate.pipelineRef || '',
    distanceAlongRayMm: candidate.distanceAlongRayMm ?? null,
    perpendicularMissMm: candidate.perpendicularMissMm ?? null,
    safe: candidate.safe === true,
    blockers: [...(candidate.blockers || [])],
    recommendedAction: candidate.recommendedAction || '',
    decision: rayCandidateDecision(candidate),
  };
}

function edgeIdentity(edge) {
  return {
    id: edge.id,
    nodeId: edge.nodeId || '',
    sourcePortId: edge.sourcePortId || '',
    targetPortId: edge.targetPortId || '',
    sourceComponentId: edge.sourceComponentId || '',
    targetComponentId: edge.targetComponentId || '',
    edgeClass: edge.edgeClass || '',
    distanceMm: edge.distanceMm ?? null,
    pipelineRef: edge.pipelineRef || '',
  };
}

function disconnectedIdentity(item) {
  return {
    id: item.id || '',
    code: item.code || '',
    componentId: item.componentId || '',
    portId: item.portId || '',
    faceId: stripUniversalPortPrefix(item.portId),
    role: item.role || '',
    faceKind: item.faceKind || '',
    pipelineRef: item.pipelineRef || '',
    point: item.point || null,
  };
}

function classifyRayCandidate(out, candidate, edgeIndexes, add) {
  const universalEdge = findUniversalEdgeForRay(candidate, edgeIndexes);
  const candidateInfo = candidateIdentity(candidate);

  if (universalEdge) {
    out.agreements.push({
      id: `TC-AGREE-${String(out.agreements.length + 1).padStart(5, '0')}`,
      decision: RAY_DECISIONS.AGREE,
      universalEdge: edgeIdentity(universalEdge),
      rayCandidate: candidateInfo,
      reason: 'Ray evidence matches a UniversalTopoGraph edge by face pair or component pair.',
    });
    return;
  }

  if (candidate.safe === true) {
    const promotion = {
      id: `TC-PROMOTE-${String(out.promotionCandidates.length + 1).padStart(5, '0')}`,
      decision: RAY_DECISIONS.PROMOTE_RAY_SAFE,
      rayCandidate: candidateInfo,
      reason: 'Safe RayTopoGraph candidate is not present in UniversalTopoGraph.',
      action: 'PROMOTE_RAY_CONNECTION_CANDIDATE_NO_MUTATION',
    };

    out.promotionCandidates.push(promotion);

    out.rayOnly.push({
      id: `TC-RAYONLY-${String(out.rayOnly.length + 1).padStart(5, '0')}`,
      decision: RAY_DECISIONS.RAY_ONLY,
      rayCandidate: candidateInfo,
      promoteCandidateId: promotion.id,
    });

    return;
  }

  const rejected = {
    id: `TC-REJECT-${String(out.rejectedRay.length + 1).padStart(5, '0')}`,
    decision: RAY_DECISIONS.REJECT_RAY,
    rayCandidate: candidateInfo,
    reason: (candidate.blockers || []).length
      ? `Ray candidate has blocker(s): ${(candidate.blockers || []).join(', ')}`
      : 'Ray candidate is not marked safe.',
  };

  out.rejectedRay.push(rejected);

  if (out.config.treatUnsafeRayAsManualReview) {
    out.manualReview.push({
      id: `TC-MANUAL-${String(out.manualReview.length + 1).padStart(5, '0')}`,
      decision: RAY_DECISIONS.MANUAL_REVIEW,
      rayCandidate: candidateInfo,
      reason: rejected.reason,
      recommendedAction: candidate.recommendedAction || 'MANUAL_REVIEW',
    });

    add({
      severity: DIAGNOSTIC_SEVERITIES.WARNING,
      code: 'UXML-COMPARE-RAY-MANUAL-REVIEW',
      message: `${candidate.sourceComponentId} ${candidate.sourceRole} ray candidate requires manual review.`,
      componentId: candidate.sourceComponentId || '',
      details: candidateInfo,
    });
  }
}

function classifyFaceSnapCandidate(out, candidate, edgeIndexes) {
  const universalEdge = findUniversalEdgeForRay(candidate, edgeIndexes);
  const candidateInfo = candidateIdentity(candidate);

  out.faceProximityCandidates.push({
    id: `TC-P0-${String(out.faceProximityCandidates.length + 1).padStart(5, '0')}`,
    decision: universalEdge
      ? RAY_DECISIONS.AGREE
      : RAY_DECISIONS.PROMOTE_RAY_CANDIDATE,
    universalEdge: universalEdge ? edgeIdentity(universalEdge) : null,
    rayCandidate: candidateInfo,
    reason: universalEdge
      ? 'P0 face-proximity candidate already matches UniversalTopoGraph edge.'
      : 'P0 face-proximity candidate proposes a snap/close-gap action. No mutation is applied.',
  });
}

function classifyUniversalOnlyEdges(out, edgeIndexes) {
  if (!out.config.includeUniversalOnlyEdges) return;

  const agreementEdgeIds = new Set(out.agreements.map(item => item.universalEdge.id));

  for (const edges of edgeIndexes.byComponentPair.values()) {
    for (const edge of edges) {
      if (agreementEdgeIds.has(edge.id)) continue;

      out.universalOnly.push({
        id: `TC-UNIVONLY-${String(out.universalOnly.length + 1).padStart(5, '0')}`,
        decision: RAY_DECISIONS.UNIVERSAL_ONLY,
        universalEdge: edgeIdentity(edge),
        reason: 'UniversalTopoGraph contains this edge without matching RayTopoGraph evidence.',
      });
    }
  }
}

function classifyUnresolvedUniversalDisconnects(out, disconnectedIndex, rayResolvedFaceIds, add) {
  for (const item of disconnectedIndex.byFaceId.values()) {
    const info = disconnectedIdentity(item);
    const resolvedByRay = rayResolvedFaceIds.has(info.faceId);

    if (resolvedByRay) continue;

    out.unresolvedUniversalDisconnected.push({
      id: `TC-UNRESOLVED-${String(out.unresolvedUniversalDisconnected.length + 1).padStart(5, '0')}`,
      decision: RAY_DECISIONS.MANUAL_REVIEW,
      universalDisconnected: info,
      reason: 'UniversalTopoGraph disconnected face has no safe RayTopoGraph promotion candidate.',
    });

    add({
      severity: DIAGNOSTIC_SEVERITIES.WARNING,
      code: 'UXML-COMPARE-UNRESOLVED-DISCONNECTED-FACE',
      message: `${info.componentId} ${info.role} remains disconnected after RayTopoGraph comparison.`,
      componentId: info.componentId,
      portId: info.portId,
      details: info,
    });
  }
}

function addResolvedRayFaces(out) {
  const rayResolvedFaceIds = new Set();

  for (const item of out.promotionCandidates) {
    const ray = item.rayCandidate;
    if (ray.sourceFaceId) rayResolvedFaceIds.add(ray.sourceFaceId);
    if (ray.targetFaceId) rayResolvedFaceIds.add(ray.targetFaceId);
  }

  for (const item of out.agreements) {
    const ray = item.rayCandidate;
    if (ray.sourceFaceId) rayResolvedFaceIds.add(ray.sourceFaceId);
    if (ray.targetFaceId) rayResolvedFaceIds.add(ray.targetFaceId);
  }

  return rayResolvedFaceIds;
}

function makeSummary(out) {
  return {
    agreementCount: out.agreements.length,
    universalOnlyCount: out.universalOnly.length,
    rayOnlyCount: out.rayOnly.length,
    promotionCandidateCount: out.promotionCandidates.length,
    faceProximityCandidateCount: out.faceProximityCandidates.length,
    rejectedRayCount: out.rejectedRay.length,
    manualReviewCount: out.manualReview.length,
    unresolvedUniversalDisconnectedCount: out.unresolvedUniversalDisconnected.length,

    universalEdgeCount: out.universalGraph?.edges?.length || 0,
    universalDisconnectedCount: out.universalGraph?.disconnected?.length || 0,
    rayCandidateCount: out.rayGraph?.rayCandidates?.length || 0,
    rayConnectionCount: out.rayGraph?.rayConnections?.length || 0,
    rayFaceSnapCandidateCount: out.rayGraph?.faceSnapCandidates?.length || 0,

    diagnosticCount: out.diagnostics.length,
  };
}

export function compareUxmlTopoGraphs(uxml, options = {}) {
  const config = normalizeConfig(options);

  const out = {
    schema: TOPO_GRAPH_COMPARATOR_SCHEMA,
    ok: true,
    blocked: false,
    config,

    universalGraph: options.universalGraph || null,
    rayGraph: options.rayGraph || null,

    agreements: [],
    universalOnly: [],
    rayOnly: [],
    promotionCandidates: [],
    faceProximityCandidates: [],
    rejectedRay: [],
    manualReview: [],
    unresolvedUniversalDisconnected: [],

    diagnostics: [],
    summary: {},
  };

  const add = makeDiagnosticFactory(out);

  if (!uxml && !options.universalGraph && !options.rayGraph) {
    add({
      severity: DIAGNOSTIC_SEVERITIES.FATAL,
      code: 'UXML-COMPARE-NO-INPUT',
      message: 'Cannot compare topology graphs because no UXML, UniversalTopoGraph, or RayTopoGraph was provided.',
    });

    out.ok = false;
    out.blocked = true;
    out.summary = makeSummary(out);
    return out;
  }

  if (!out.universalGraph) {
    out.universalGraph = buildUxmlUniversalTopoGraph(uxml, options.universalOptions || {});
  }

  if (!out.rayGraph) {
    out.rayGraph = buildUxmlRayTopoGraph(uxml, {
      ...(options.rayOptions || {}),
      universalGraph: out.universalGraph,
    });
  }

  if ((out.universalGraph?.blocked || out.rayGraph?.blocked) && !config.allowBlockedGraphs) {
    add({
      severity: DIAGNOSTIC_SEVERITIES.ERROR,
      code: 'UXML-COMPARE-BLOCKED-GRAPH',
      message: 'Cannot compare because one or more source graphs are blocked.',
      details: {
        universalBlocked: out.universalGraph?.blocked === true,
        rayBlocked: out.rayGraph?.blocked === true,
      },
    });

    out.ok = false;
    out.blocked = true;
    out.summary = makeSummary(out);
    return out;
  }

  const edgeIndexes = buildUniversalEdgeIndexes(out.universalGraph);
  const disconnectedIndex = buildUniversalDisconnectedIndex(out.universalGraph);

  for (const candidate of out.rayGraph?.rayConnections || []) {
    classifyRayCandidate(out, candidate, edgeIndexes, add);
  }

  const rayConnectionIds = new Set((out.rayGraph?.rayConnections || []).map(item => item.id));

  for (const candidate of out.rayGraph?.rayCandidates || []) {
    if (rayConnectionIds.has(candidate.id)) continue;
    if (candidate.safe === true) continue;

    classifyRayCandidate(out, candidate, edgeIndexes, add);
  }

  if (config.includeFaceSnapCandidates) {
    for (const candidate of out.rayGraph?.faceSnapCandidates || []) {
      classifyFaceSnapCandidate(out, candidate, edgeIndexes);
    }
  }

  classifyUniversalOnlyEdges(out, edgeIndexes);

  const rayResolvedFaceIds = addResolvedRayFaces(out);
  classifyUnresolvedUniversalDisconnects(out, disconnectedIndex, rayResolvedFaceIds, add);

  out.summary = makeSummary(out);
  return out;
}

export const compareUxmlTopologyGraphs = compareUxmlTopoGraphs;
export const buildUxmlTopoGraphComparison = compareUxmlTopoGraphs;