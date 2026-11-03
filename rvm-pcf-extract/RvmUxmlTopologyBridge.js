/**
 * RvmUxmlTopologyBridge.js
 *
 * Runs UXML topology generation for existing Extract PCF rows, then pushes
 * topology evidence back to the legacy Extract PCF state/row model.
 *
 * Important:
 * - Topology-only bridge.
 * - Does not mutate coordinates.
 * - Does not resolve masters.
 * - Does not emit PCF.
 * - Existing master and PCF generation routes continue after this bridge.
 */

import { adaptRvmRowsToUxml } from './RvmRowsToUxmlAdapter.js';
import {
  RVM_PCF_TOPOLOGY_MODES,
} from './RvmPcfTopologyModes.js';

import {
  annotateRowsWithAcceptedTopologyHandoff,
  buildRvmPcfAcceptedTopologyHandoff,
} from './RvmPcfAcceptedTopologyHandoff.js';

import { validateUxmlDocument } from '../uxml/UxmlValidationGate.js';
import { buildUxmlFaceModel } from '../uxml/UxmlFaceModelBuilder.js';
import { buildUxmlUniversalTopoGraph } from '../uxml/UxmlUniversalTopoGraphBuilder.js';
import { buildUxmlRayTopoGraph } from '../uxml/UxmlRayTopoGraphBuilder.js';
import { compareUxmlTopoGraphs } from '../uxml/UxmlTopoGraphComparator.js';
import { decideUxmlTopologyAcceptance } from '../uxml/UxmlTopologyDecisionGate.js';

const BRIDGE_SCHEMA = 'rvm-pcf-uxml-topology-bridge/v1';

function clean(value) {
  return String(value ?? '').trim();
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function bySeverity(diagnostics = []) {
  return diagnostics.reduce((acc, diagnostic) => {
    const severity = clean(diagnostic.severity || diagnostic.level || 'INFO').toUpperCase();
    acc[severity] = (acc[severity] || 0) + 1;
    return acc;
  }, {});
}

function identityFor(rowIdentityByComponentId, componentId) {
  return rowIdentityByComponentId?.[componentId] || {
    rowNo: '',
    refNo: '',
    seqNo: '',
    lineNo: '',
    pipelineRef: '',
    type: '',
    name: '',
  };
}

function enrichDiagnostic(diagnostic, rowIdentityByComponentId, source = 'uxml-topology') {
  const id = identityFor(rowIdentityByComponentId, diagnostic.componentId);

  return {
    ...diagnostic,
    rowNo: diagnostic.rowNo ?? id.rowNo,
    refNo: diagnostic.refNo ?? id.refNo,
    seqNo: diagnostic.seqNo ?? id.seqNo,
    lineNo: diagnostic.lineNo ?? id.lineNo,
    pipelineRef: diagnostic.pipelineRef ?? id.pipelineRef,
    type: diagnostic.type ?? id.type,
    name: diagnostic.name ?? id.name,
    _source: source,
  };
}

function flattenDiagnostics({
  adapter,
  validation,
  faceModel,
  universalGraph,
  rayGraph,
  comparison,
  topologyDecision,
  rowIdentityByComponentId,
}) {
  const diagnostics = [
    ...(adapter?.diagnostics || []),
    ...(validation?.diagnostics || []),
    ...(faceModel?.diagnostics || []),
    ...(universalGraph?.diagnostics || []),
    ...(rayGraph?.diagnostics || []),
    ...(comparison?.diagnostics || []),
    ...(topologyDecision?.diagnostics || []),
  ];

  return diagnostics.map(d => enrichDiagnostic(d, rowIdentityByComponentId));
}

function makeLegacyReadinessReport(result, options) {
  const diagnostics = result.diagnostics || [];
  const severity = bySeverity(diagnostics);

  const universalSummary = result.universalGraph?.summary || {};
  const raySummary = result.rayGraph?.summary || {};
  const comparisonSummary = result.comparison?.summary || {};
  const decisionSummary = result.topologyDecision?.summary || {};
  const handoffSummary = result.acceptedTopologyHandoff?.summary || {};

  const unresolved =
    comparisonSummary.unresolvedUniversalDisconnectedCount ??
    universalSummary.disconnectedCount ??
    0;

  const blockedRows = clampNumber(unresolved, 0, 999999, 0);

  const safeFixPlanCount = clampNumber(
    comparisonSummary.promotionCandidateCount ??
      raySummary.rayConnectionCount ??
      0,
    0,
    999999,
    0
  );

  const manualReviewCount = clampNumber(
    comparisonSummary.manualReviewCount ??
      0,
    0,
    999999,
    0
  );

  const blockedFixPlanCount = manualReviewCount + blockedRows;

  const pass = result.topologyDecision?.exportAllowed === true;

  return {
    schema: 'rvm-pcf-readiness-gate/uxml-bridge-compat/v1',
    topologyMode: RVM_PCF_TOPOLOGY_MODES.UXML_TOPOLOGY,
    pass,
    ok: pass,
    topologyDecision: result.topologyDecision,
    acceptedTopologyHandoff: result.acceptedTopologyHandoff,
    graph: result.universalGraph,
    uxml: result.uxml,
    faceModel: result.faceModel,
    rayGraph: result.rayGraph,
    comparison: result.comparison,
    diagnostics,
    bySeverity: severity,
    summary: {
      topologyMode: RVM_PCF_TOPOLOGY_MODES.UXML_TOPOLOGY,
      rowCount: result.rows?.length || 0,
      componentCount: result.adapter?.stats?.componentCount || 0,
      anchorCount: result.adapter?.stats?.anchorCount || 0,
      portCount: result.adapter?.stats?.portCount || 0,
      universalNodeCount: universalSummary.nodeCount || 0,
      universalEdgeCount: universalSummary.edgeCount || 0,
      disconnectedCount: universalSummary.disconnectedCount || 0,
      rayCandidateCount: raySummary.rayCandidateCount || 0,
      rayConnectionCount: raySummary.rayConnectionCount || 0,
      promotionCandidateCount: comparisonSummary.promotionCandidateCount || 0,
      manualReviewCount,
      blockedRows,
      safeFixPlanCount,
      blockedFixPlanCount,
      acceptedConnectionCount: decisionSummary.acceptedConnectionCount || 0,
      acceptedTopologyHandoffCount: handoffSummary.handoffConnectionCount || 0,
      acceptedTopologyAnnotatedRowCount: handoffSummary.annotatedRowCount || 0,
      exportAllowed: result.topologyDecision?.exportAllowed === true,
      outputBridgeReady: result.topologyDecision?.outputBridgeReady === true,
      legacyRoutingContinues: true,
      mastersDeferredToLegacyRoute: true,
      pcfEmitterDeferredToLegacyRoute: true,
    },
    report: {
      allowPcfExport: result.topologyDecision?.exportAllowed === true,
      exportBlockReason: result.topologyDecision?.exportAllowed
        ? ''
        : 'UXML topology decision gate did not allow export.',
      summary: {
        topologyMode: RVM_PCF_TOPOLOGY_MODES.UXML_TOPOLOGY,
        rowCount: result.rows?.length || 0,
        blockedRows,
        safeFixPlanCount,
        blockedFixPlanCount,
        acceptedConnectionCount: decisionSummary.acceptedConnectionCount || 0,
        acceptedTopologyHandoffCount: handoffSummary.handoffConnectionCount || 0,
        acceptedTopologyAnnotatedRowCount: handoffSummary.annotatedRowCount || 0,
        manualReviewCount: decisionSummary.manualReviewCount || 0,
        unresolvedCount: decisionSummary.unresolvedCount || 0,
        rejectedCount: decisionSummary.rejectedCount || 0,
      },
    },
  };
}

function componentStatusMap(universalGraph, comparison) {
  const map = new Map();

  for (const item of universalGraph?.disconnected || []) {
    if (!item.componentId) continue;

    const existing = map.get(item.componentId) || {
      disconnected: 0,
      promotions: 0,
      manualReview: 0,
    };

    existing.disconnected += 1;
    map.set(item.componentId, existing);
  }

  for (const item of comparison?.promotionCandidates || []) {
    const componentId = item.rayCandidate?.sourceComponentId;

    if (!componentId) continue;

    const existing = map.get(componentId) || {
      disconnected: 0,
      promotions: 0,
      manualReview: 0,
    };

    existing.promotions += 1;
    map.set(componentId, existing);
  }

  for (const item of comparison?.manualReview || []) {
    const componentId = item.rayCandidate?.sourceComponentId || item.universalEdge?.sourceComponentId;

    if (!componentId) continue;

    const existing = map.get(componentId) || {
      disconnected: 0,
      promotions: 0,
      manualReview: 0,
    };

    existing.manualReview += 1;
    map.set(componentId, existing);
  }

  return map;
}

export function pushUxmlTopologyBackToLegacyRows(rows, bridgeResult) {
  const statusByComponentId = componentStatusMap(
    bridgeResult.universalGraph,
    bridgeResult.comparison
  );

  return (rows || []).map((row, index) => {
    const componentId =
      clean(row.componentId || row.id || row.canonicalId || row.rowId || row.refNo || `ROW-${row.rowNo ?? index + 1}`)
        .replace(/[^\w:.-]+/g, '-') ||
      `ROW-${index + 1}`;

    const status = statusByComponentId.get(componentId) || {
      disconnected: 0,
      promotions: 0,
      manualReview: 0,
    };

    return {
      ...row,
      _topologyMode: RVM_PCF_TOPOLOGY_MODES.UXML_TOPOLOGY,
      _uxmlComponentId: componentId,
      _uxmlTopologyDisconnected: status.disconnected,
      _uxmlTopologyPromotions: status.promotions,
      _uxmlTopologyManualReview: status.manualReview,
      _uxmlTopologyReady:
        status.disconnected === 0 && status.manualReview === 0,
    };
  });
}

export function runUxmlTopologyForRvmRows(rows = [], options = {}) {
  const normalizedOptions = {
    connectToleranceMm: clampNumber(options.connectToleranceMm, 0, 1000, 6),
    fixToleranceMm: clampNumber(options.fixToleranceMm, 0, 100, 25),
    maxRayLengthMm: clampNumber(options.maxRayLengthMm, 1, 5000, 500),
    tubeToleranceMm: clampNumber(options.tubeToleranceMm ?? options.perpendicularToleranceMm, 0, 1000, 12),
    allowPartialExport: options.allowPartialExport === true,
    name: options.name || 'rvm-pcf-extract-rows',
  };

  const adapter = adaptRvmRowsToUxml(rows, {
    name: normalizedOptions.name,
  });

  const uxml = adapter.uxml;

  const validation = validateUxmlDocument(uxml);

  const faceModel = buildUxmlFaceModel(uxml, {
    allowPartial: true,
  });

  const universalGraph = buildUxmlUniversalTopoGraph(uxml, {
    faceModel,
    allowPartialFaceModel: true,
    allowBlockedFaceModel: true,
    connectToleranceMm: normalizedOptions.connectToleranceMm,
  });

  const rayGraph = buildUxmlRayTopoGraph(uxml, {
    faceModel,
    universalGraph,
    allowPartialFaceModel: true,
    allowBlockedFaceModel: true,
    maxRayLengthMm: normalizedOptions.maxRayLengthMm,
    tubeToleranceMm: normalizedOptions.tubeToleranceMm,
  });

  const comparison = compareUxmlTopoGraphs(uxml, {
    universalGraph,
    rayGraph,
    allowBlockedGraphs: true,
  });

  const topologyDecision = decideUxmlTopologyAcceptance(uxml, {
    comparison,
    allowPartialExport: normalizedOptions.allowPartialExport,
    acceptUniversalOnly: true,
    allowSafeRayPromotions: true,
    allowFaceProximityPromotions: false,
    maxPromotionDistanceAlongRayMm: normalizedOptions.maxRayLengthMm,
    maxPromotionPerpendicularMissMm: normalizedOptions.tubeToleranceMm,
  });

  const acceptedTopologyHandoff = buildRvmPcfAcceptedTopologyHandoff({
    rows,
    topologyDecision,
    rowIdentityByComponentId: adapter.rowIdentityByComponentId,
  });

  const diagnostics = flattenDiagnostics({
    adapter,
    validation,
    faceModel,
    universalGraph,
    rayGraph,
    comparison,
    topologyDecision,
    rowIdentityByComponentId: adapter.rowIdentityByComponentId,
  });

  const result = {
    schema: BRIDGE_SCHEMA,
    ok: true,
    topologyMode: RVM_PCF_TOPOLOGY_MODES.UXML_TOPOLOGY,
    options: normalizedOptions,
    rows,
    adapter,
    uxml,
    validation,
    faceModel,
    universalGraph,
    rayGraph,
    comparison,
    topologyDecision,
    acceptedTopologyHandoff,
    diagnostics,
    legacyRows: [],
    readinessGate: null,
  };

  result.legacyRows = annotateRowsWithAcceptedTopologyHandoff(
    pushUxmlTopologyBackToLegacyRows(rows, result),
    acceptedTopologyHandoff
  );
  result.readinessGate = makeLegacyReadinessReport(result, normalizedOptions);
  result.ok = result.readinessGate.pass;

  return result;
}

export const buildRvmPcfUxmlTopology = runUxmlTopologyForRvmRows;