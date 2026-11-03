/**
 * UxmlTopologyDecisionGate.js
 *
 * Agent 11: UXML Topology Decision / Acceptance Gate.
 *
 * Purpose:
 * - Convert UniversalTopoGraph/RayTopoGraph comparator evidence into
 *   deterministic accepted/manual/rejected/export decisions.
 * - Provide output-bridge-ready evidence without mutating UXML, rows,
 *   component coordinates, or topology graphs.
 *
 * Out of scope:
 * - Applying fixes.
 * - Moving pipe endpoints.
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
  compareUxmlTopoGraphs,
} from './UxmlTopoGraphComparator.js';

const TOPOLOGY_DECISION_SCHEMA = 'uxml-topology-decision-gate/v1';

const DECISIONS = Object.freeze({
  ACCEPT: 'ACCEPT',
  ACCEPT_WITH_REVIEW_NOTE: 'ACCEPT_WITH_REVIEW_NOTE',
  PROMOTE_SAFE_RAY: 'PROMOTE_SAFE_RAY',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  REJECT: 'REJECT',
  BLOCK_EXPORT: 'BLOCK_EXPORT',
});

const SOURCES = Object.freeze({
  UNIVERSAL_RAY_AGREEMENT: 'UNIVERSAL_RAY_AGREEMENT',
  UNIVERSAL_ONLY: 'UNIVERSAL_ONLY',
  SAFE_RAY_PROMOTION: 'SAFE_RAY_PROMOTION',
  FACE_PROXIMITY: 'FACE_PROXIMITY',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  REJECTED_RAY: 'REJECTED_RAY',
  UNRESOLVED_DISCONNECTED: 'UNRESOLVED_DISCONNECTED',
});

const DEFAULT_CONFIG = Object.freeze({
  acceptUniversalOnly: true,
  allowSafeRayPromotions: true,
  allowFaceProximityPromotions: false,
  allowPartialExport: false,
  maxPromotionDistanceAlongRayMm: 500,
  maxPromotionPerpendicularMissMm: 12,
});

function clean(value) {
  return String(value ?? '').trim();
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeConfig(options = {}) {
  return {
    acceptUniversalOnly: options.acceptUniversalOnly !== false,
    allowSafeRayPromotions: options.allowSafeRayPromotions !== false,
    allowFaceProximityPromotions: options.allowFaceProximityPromotions === true,
    allowPartialExport: options.allowPartialExport === true,
    maxPromotionDistanceAlongRayMm: clampNumber(
      options.maxPromotionDistanceAlongRayMm,
      0,
      50000,
      DEFAULT_CONFIG.maxPromotionDistanceAlongRayMm
    ),
    maxPromotionPerpendicularMissMm: clampNumber(
      options.maxPromotionPerpendicularMissMm,
      0,
      5000,
      DEFAULT_CONFIG.maxPromotionPerpendicularMissMm
    ),
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
      id: `TD-D-${String(out.diagnostics.length + 1).padStart(5, '0')}`,
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

function clonePlain(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function pairKey(a, b) {
  return [clean(a), clean(b)].sort().join('|');
}

function edgeId(edge) {
  return clean(edge?.id);
}

function candidateId(candidate) {
  return clean(candidate?.id);
}

function nextId(prefix, list) {
  return `${prefix}-${String(list.length + 1).padStart(5, '0')}`;
}

function rayCandidateWithinPromotionLimits(rayCandidate, config) {
  const distanceAlong = numberOrNull(rayCandidate?.distanceAlongRayMm);
  const miss = numberOrNull(rayCandidate?.perpendicularMissMm);

  if (distanceAlong == null || miss == null) return false;
  if (distanceAlong > config.maxPromotionDistanceAlongRayMm) return false;
  if (miss > config.maxPromotionPerpendicularMissMm) return false;

  return true;
}

function makeAcceptedConnection({
  id,
  source,
  decision,
  confidence,
  universalEdge = null,
  rayCandidate = null,
  reason = '',
  exportReady = true,
  action = 'NO_MUTATION',
}) {
  const sourceComponentId =
    universalEdge?.sourceComponentId ||
    rayCandidate?.sourceComponentId ||
    '';

  const targetComponentId =
    universalEdge?.targetComponentId ||
    rayCandidate?.targetComponentId ||
    '';

  return {
    id,
    source,
    decision,
    confidence,
    sourceComponentId,
    targetComponentId,
    componentPairKey: pairKey(sourceComponentId, targetComponentId),
    universalEdge: clonePlain(universalEdge),
    rayCandidate: clonePlain(rayCandidate),
    reason,
    exportReady,
    action,
  };
}

function addAgreementDecisions(out) {
  for (const item of out.comparison?.agreements || []) {
    out.acceptedConnections.push(makeAcceptedConnection({
      id: nextId('TD-ACCEPT-AGREE', out.acceptedConnections),
      source: SOURCES.UNIVERSAL_RAY_AGREEMENT,
      decision: DECISIONS.ACCEPT,
      confidence: 'HIGH',
      universalEdge: item.universalEdge,
      rayCandidate: item.rayCandidate,
      reason: item.reason || 'UniversalTopoGraph and RayTopoGraph agree.',
      exportReady: true,
      action: 'USE_UNIVERSAL_EDGE',
    }));
  }
}

function addUniversalOnlyDecisions(out) {
  for (const item of out.comparison?.universalOnly || []) {
    if (out.config.acceptUniversalOnly) {
      out.acceptedConnections.push(makeAcceptedConnection({
        id: nextId('TD-ACCEPT-UNIVERSAL', out.acceptedConnections),
        source: SOURCES.UNIVERSAL_ONLY,
        decision: DECISIONS.ACCEPT_WITH_REVIEW_NOTE,
        confidence: 'MEDIUM',
        universalEdge: item.universalEdge,
        rayCandidate: null,
        reason: item.reason || 'UniversalTopoGraph edge accepted without Ray evidence.',
        exportReady: true,
        action: 'USE_UNIVERSAL_EDGE',
      }));
    } else {
      out.manualReview.push({
        id: nextId('TD-MANUAL-UNIVERSAL', out.manualReview),
        source: SOURCES.UNIVERSAL_ONLY,
        decision: DECISIONS.MANUAL_REVIEW,
        universalEdge: clonePlain(item.universalEdge),
        reason: 'Universal-only edge requires review because acceptUniversalOnly=false.',
      });
    }
  }
}

function addRayPromotionDecisions(out, add) {
  for (const item of out.comparison?.promotionCandidates || []) {
    const rayCandidate = item.rayCandidate;

    if (
      out.config.allowSafeRayPromotions &&
      rayCandidate?.safe === true &&
      rayCandidateWithinPromotionLimits(rayCandidate, out.config)
    ) {
      out.acceptedConnections.push(makeAcceptedConnection({
        id: nextId('TD-PROMOTE-RAY', out.acceptedConnections),
        source: SOURCES.SAFE_RAY_PROMOTION,
        decision: DECISIONS.PROMOTE_SAFE_RAY,
        confidence: 'MEDIUM',
        universalEdge: null,
        rayCandidate,
        reason: item.reason || 'Safe RayTopoGraph promotion accepted as output-bridge candidate.',
        exportReady: true,
        action: 'PROMOTE_RAY_CONNECTION_NO_MUTATION',
      }));
      continue;
    }

    const reason = out.config.allowSafeRayPromotions
      ? 'Safe Ray candidate exceeds configured promotion limits.'
      : 'Safe Ray promotion requires review because allowSafeRayPromotions=false.';

    out.manualReview.push({
      id: nextId('TD-MANUAL-RAY', out.manualReview),
      source: SOURCES.SAFE_RAY_PROMOTION,
      decision: DECISIONS.MANUAL_REVIEW,
      rayCandidate: clonePlain(rayCandidate),
      reason,
    });

    add({
      severity: DIAGNOSTIC_SEVERITIES.WARNING,
      code: 'UXML-TOPO-DECISION-RAY-PROMOTION-REVIEW',
      message: 'Safe Ray promotion candidate requires manual review.',
      componentId: rayCandidate?.sourceComponentId || '',
      details: rayCandidate,
    });
  }
}

function addFaceProximityDecisions(out, add) {
  for (const item of out.comparison?.faceProximityCandidates || []) {
    const rayCandidate = item.rayCandidate;

    if (
      out.config.allowFaceProximityPromotions &&
      rayCandidate?.safe === true &&
      rayCandidateWithinPromotionLimits(rayCandidate, out.config)
    ) {
      out.acceptedConnections.push(makeAcceptedConnection({
        id: nextId('TD-PROMOTE-P0', out.acceptedConnections),
        source: SOURCES.FACE_PROXIMITY,
        decision: DECISIONS.PROMOTE_SAFE_RAY,
        confidence: 'LOW',
        universalEdge: item.universalEdge,
        rayCandidate,
        reason: 'P0 face proximity candidate accepted by explicit configuration.',
        exportReady: true,
        action: 'PROMOTE_FACE_PROXIMITY_NO_MUTATION',
      }));
      continue;
    }

    out.manualReview.push({
      id: nextId('TD-MANUAL-P0', out.manualReview),
      source: SOURCES.FACE_PROXIMITY,
      decision: DECISIONS.MANUAL_REVIEW,
      universalEdge: clonePlain(item.universalEdge),
      rayCandidate: clonePlain(rayCandidate),
      reason: 'P0 face proximity evidence is review-only by default.',
      recommendedAction: rayCandidate?.recommendedAction || 'MANUAL_REVIEW',
    });

    add({
      severity: DIAGNOSTIC_SEVERITIES.INFO,
      code: 'UXML-TOPO-DECISION-P0-REVIEW',
      message: 'P0 face proximity candidate kept as manual review evidence.',
      componentId: rayCandidate?.sourceComponentId || '',
      details: rayCandidate,
    });
  }
}

function addRejectedRayDecisions(out, add) {
  for (const item of out.comparison?.rejectedRay || []) {
    out.rejected.push({
      id: nextId('TD-REJECT-RAY', out.rejected),
      source: SOURCES.REJECTED_RAY,
      decision: DECISIONS.REJECT,
      rayCandidate: clonePlain(item.rayCandidate),
      reason: item.reason || 'Ray candidate rejected.',
    });

    add({
      severity: DIAGNOSTIC_SEVERITIES.WARNING,
      code: 'UXML-TOPO-DECISION-RAY-REJECTED',
      message: 'Rejected Ray candidate retained for traceability.',
      componentId: item.rayCandidate?.sourceComponentId || '',
      details: item.rayCandidate,
    });
  }
}

function addManualReviewDecisions(out) {
  const existing = new Set(
    out.manualReview.map(item => `${item.source}|${candidateId(item.rayCandidate)}|${edgeId(item.universalEdge)}`)
  );

  for (const item of out.comparison?.manualReview || []) {
    const key = `${SOURCES.MANUAL_REVIEW}|${candidateId(item.rayCandidate)}|${edgeId(item.universalEdge)}`;
    if (existing.has(key)) continue;

    existing.add(key);

    out.manualReview.push({
      id: nextId('TD-MANUAL-COMPARE', out.manualReview),
      source: SOURCES.MANUAL_REVIEW,
      decision: DECISIONS.MANUAL_REVIEW,
      rayCandidate: clonePlain(item.rayCandidate),
      universalEdge: clonePlain(item.universalEdge),
      reason: item.reason || 'Comparator requested manual review.',
      recommendedAction: item.recommendedAction || 'MANUAL_REVIEW',
    });
  }
}

function addUnresolvedDisconnectedDecisions(out, add) {
  for (const item of out.comparison?.unresolvedUniversalDisconnected || []) {
    out.unresolved.push({
      id: nextId('TD-UNRESOLVED', out.unresolved),
      source: SOURCES.UNRESOLVED_DISCONNECTED,
      decision: DECISIONS.BLOCK_EXPORT,
      universalDisconnected: clonePlain(item.universalDisconnected),
      reason: item.reason || 'Disconnected face remains unresolved.',
    });

    add({
      severity: DIAGNOSTIC_SEVERITIES.ERROR,
      code: 'UXML-TOPO-DECISION-UNRESOLVED-DISCONNECTED',
      message: 'Topology decision gate found unresolved disconnected face.',
      componentId: item.universalDisconnected?.componentId || '',
      portId: item.universalDisconnected?.portId || '',
      details: item.universalDisconnected,
    });
  }
}

function dedupeAcceptedConnections(out) {
  const seen = new Set();
  const deduped = [];

  for (const item of out.acceptedConnections) {
    const key = item.universalEdge
      ? `U|${edgeId(item.universalEdge)}`
      : `R|${candidateId(item.rayCandidate)}`;

    if (seen.has(key)) continue;

    seen.add(key);
    deduped.push(item);
  }

  out.acceptedConnections = deduped;
}

function makeSummary(out) {
  return {
    acceptedConnectionCount: out.acceptedConnections.length,
    agreementAcceptedCount: out.acceptedConnections.filter(i => i.source === SOURCES.UNIVERSAL_RAY_AGREEMENT).length,
    universalOnlyAcceptedCount: out.acceptedConnections.filter(i => i.source === SOURCES.UNIVERSAL_ONLY).length,
    rayPromotionAcceptedCount: out.acceptedConnections.filter(i => i.source === SOURCES.SAFE_RAY_PROMOTION).length,
    faceProximityAcceptedCount: out.acceptedConnections.filter(i => i.source === SOURCES.FACE_PROXIMITY).length,
    manualReviewCount: out.manualReview.length,
    rejectedCount: out.rejected.length,
    unresolvedCount: out.unresolved.length,
    exportAllowed: out.exportAllowed,
    outputBridgeReady: out.outputBridgeReady,
    diagnosticCount: out.diagnostics.length,
  };
}

function finalizeDecision(out) {
  dedupeAcceptedConnections(out);

  const hardBlockers = out.unresolved.length + out.rejected.length;
  const reviewCount = out.manualReview.length;

  out.outputBridgeReady = out.acceptedConnections.length > 0;

  out.exportAllowed =
    out.outputBridgeReady &&
    (out.config.allowPartialExport || (hardBlockers === 0 && reviewCount === 0));

  out.ok = out.exportAllowed || out.outputBridgeReady;
  out.blocked = !out.outputBridgeReady;

  out.summary = makeSummary(out);
  return out;
}

export function decideUxmlTopologyAcceptance(uxml, options = {}) {
  const config = normalizeConfig(options);

  const out = {
    schema: TOPOLOGY_DECISION_SCHEMA,
    ok: true,
    blocked: false,
    exportAllowed: false,
    outputBridgeReady: false,
    config,
    comparison: options.comparison || null,
    acceptedConnections: [],
    manualReview: [],
    rejected: [],
    unresolved: [],
    diagnostics: [],
    summary: {},
  };

  const add = makeDiagnosticFactory(out);

  if (!uxml && !options.comparison) {
    add({
      severity: DIAGNOSTIC_SEVERITIES.FATAL,
      code: 'UXML-TOPO-DECISION-NO-INPUT',
      message: 'Cannot decide topology acceptance because neither UXML nor comparison report was provided.',
    });

    out.ok = false;
    out.blocked = true;
    out.summary = makeSummary(out);
    return out;
  }

  if (!out.comparison) {
    out.comparison = compareUxmlTopoGraphs(uxml, {
      ...(options.compareOptions || {}),
      allowBlockedGraphs: true,
    });
  }

  addAgreementDecisions(out);
  addUniversalOnlyDecisions(out);
  addRayPromotionDecisions(out, add);
  addFaceProximityDecisions(out, add);
  addRejectedRayDecisions(out, add);
  addManualReviewDecisions(out);
  addUnresolvedDisconnectedDecisions(out, add);

  return finalizeDecision(out);
}

export const runUxmlTopologyDecisionGate = decideUxmlTopologyAcceptance;
export const buildUxmlAcceptedTopology = decideUxmlTopologyAcceptance;

export const UXML_TOPOLOGY_DECISIONS = DECISIONS;
export const UXML_TOPOLOGY_DECISION_SOURCES = SOURCES;
