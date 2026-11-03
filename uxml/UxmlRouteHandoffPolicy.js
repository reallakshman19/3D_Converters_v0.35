/**
 * UxmlRouteHandoffPolicy.js
 *
 * Existing Agent: Route handoff policy after UXML topology decision.
 *
 * Purpose:
 * - Define what happens after:
 *   UXML → FaceModel → UniversalTopoGraph → RayTopoGraph → Comparator → DecisionGate
 * - Decide whether a downstream route may receive the accepted topology payload.
 *
 * Important:
 * - Does not emit PCF.
 * - Does not resolve masters.
 * - Does not mutate coordinates.
 * - Does not apply fixes.
 * - Does not inspect raw XML/InputXML schemas.
 */

export const UXML_ROUTE_HANDOFF_POLICY_SCHEMA =
  'uxml-route-handoff-policy/v1';

export const UXML_ROUTE_TARGETS = Object.freeze({
  EXTRACT_PCF_LEGACY: 'EXTRACT_PCF_LEGACY',
  CII_EXPORT: 'CII_EXPORT',
  GLB_EXPORT: 'GLB_EXPORT',
  TWO_D_EXPORT: 'TWO_D_EXPORT',
  INPUTXML_EXPORT: 'INPUTXML_EXPORT',
  DIAGNOSTICS_ONLY: 'DIAGNOSTICS_ONLY',
});

export const UXML_ROUTE_MASTER_OWNERS = Object.freeze({
  LEGACY_PCF_ROUTE: 'LEGACY_PCF_ROUTE',
  CII_ROUTE: 'CII_ROUTE',
  GLB_ROUTE: 'GLB_ROUTE',
  TWO_D_ROUTE: 'TWO_D_ROUTE',
  INPUTXML_ROUTE: 'INPUTXML_ROUTE',
  NONE: 'NONE',
});

export const UXML_ROUTE_BLOCK_CODES = Object.freeze({
  NO_TARGET_ROUTE: 'UXML-ROUTE-NO-TARGET',
  NO_TOPOLOGY_DECISION: 'UXML-ROUTE-NO-TOPOLOGY-DECISION',
  OUTPUT_BRIDGE_NOT_READY: 'UXML-ROUTE-OUTPUT-BRIDGE-NOT-READY',
  EXPORT_NOT_ALLOWED: 'UXML-ROUTE-EXPORT-NOT-ALLOWED',
  MANUAL_REVIEW_REQUIRED: 'UXML-ROUTE-MANUAL-REVIEW-REQUIRED',
  UNRESOLVED_TOPOLOGY: 'UXML-ROUTE-UNRESOLVED-TOPOLOGY',
  REJECTED_TOPOLOGY: 'UXML-ROUTE-REJECTED-TOPOLOGY',
});

function clean(value) {
  return String(value ?? '').trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function bool(value) {
  return value === true;
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTargetRoute(targetRoute) {
  const value = clean(targetRoute).toUpperCase();

  if (Object.values(UXML_ROUTE_TARGETS).includes(value)) {
    return value;
  }

  return '';
}

function masterOwnerForRoute(targetRoute) {
  switch (targetRoute) {
    case UXML_ROUTE_TARGETS.EXTRACT_PCF_LEGACY:
      return UXML_ROUTE_MASTER_OWNERS.LEGACY_PCF_ROUTE;

    case UXML_ROUTE_TARGETS.CII_EXPORT:
      return UXML_ROUTE_MASTER_OWNERS.CII_ROUTE;

    case UXML_ROUTE_TARGETS.GLB_EXPORT:
      return UXML_ROUTE_MASTER_OWNERS.GLB_ROUTE;

    case UXML_ROUTE_TARGETS.TWO_D_EXPORT:
      return UXML_ROUTE_MASTER_OWNERS.TWO_D_ROUTE;

    case UXML_ROUTE_TARGETS.INPUTXML_EXPORT:
      return UXML_ROUTE_MASTER_OWNERS.INPUTXML_ROUTE;

    case UXML_ROUTE_TARGETS.DIAGNOSTICS_ONLY:
    default:
      return UXML_ROUTE_MASTER_OWNERS.NONE;
  }
}

function routeLabel(targetRoute) {
  switch (targetRoute) {
    case UXML_ROUTE_TARGETS.EXTRACT_PCF_LEGACY:
      return 'Extract PCF legacy route';

    case UXML_ROUTE_TARGETS.CII_EXPORT:
      return 'CII export route';

    case UXML_ROUTE_TARGETS.GLB_EXPORT:
      return 'GLB export route';

    case UXML_ROUTE_TARGETS.TWO_D_EXPORT:
      return '2D export route';

    case UXML_ROUTE_TARGETS.INPUTXML_EXPORT:
      return 'InputXML export route';

    case UXML_ROUTE_TARGETS.DIAGNOSTICS_ONLY:
      return 'Diagnostics-only route';

    default:
      return 'Unknown route';
  }
}

function requiredPayloadForRoute(targetRoute) {
  const base = [
    'uxml',
    'topologyDecision',
    'diagnostics',
    'lossContract',
  ];

  if (targetRoute === UXML_ROUTE_TARGETS.EXTRACT_PCF_LEGACY) {
    return [
      ...base,
      'acceptedTopologyHandoff',
      'legacyMasterRoute',
      'legacyPcfEmitter',
    ];
  }

  if (targetRoute === UXML_ROUTE_TARGETS.GLB_EXPORT) {
    return [
      ...base,
      'acceptedTopologyHandoff',
      'visualMetadata',
    ];
  }

  if (targetRoute === UXML_ROUTE_TARGETS.TWO_D_EXPORT) {
    return [
      ...base,
      'acceptedTopologyHandoff',
      'draftingMetadata',
    ];
  }

  if (targetRoute === UXML_ROUTE_TARGETS.CII_EXPORT) {
    return [
      ...base,
      'acceptedTopologyHandoff',
      'ciiRouteMetadata',
    ];
  }

  if (targetRoute === UXML_ROUTE_TARGETS.INPUTXML_EXPORT) {
    return [
      ...base,
      'acceptedTopologyHandoff',
      'inputXmlRouteMetadata',
    ];
  }

  return base;
}

function getDecisionSummary(topologyDecision = {}) {
  const summary = topologyDecision.summary || {};

  return {
    acceptedConnectionCount: number(summary.acceptedConnectionCount),
    manualReviewCount: number(summary.manualReviewCount),
    rejectedCount: number(summary.rejectedCount),
    unresolvedCount: number(summary.unresolvedCount),
    diagnosticCount: number(summary.diagnosticCount),
    outputBridgeReady: bool(topologyDecision.outputBridgeReady),
    exportAllowed: bool(topologyDecision.exportAllowed),
  };
}

function makeResult({
  targetRoute,
  allowed,
  blockedReason = '',
  blockCode = '',
  topologyDecision = null,
  acceptedTopologyHandoff = null,
  allowPartialExport = false,
}) {
  const decisionSummary = getDecisionSummary(topologyDecision || {});
  const handoffSummary = acceptedTopologyHandoff?.summary || {};

  return {
    schema: UXML_ROUTE_HANDOFF_POLICY_SCHEMA,
    targetRoute,
    targetRouteLabel: routeLabel(targetRoute),
    allowed,
    blocked: !allowed,
    blockCode,
    blockedReason,
    allowPartialExport,
    masterOwner: masterOwnerForRoute(targetRoute),
    requiredPayload: requiredPayloadForRoute(targetRoute),
    diagnosticsPolicy: {
      includeDiagnostics: true,
      includeLossContract: true,
      includeManualReviewItems: true,
      includeRejectedItems: true,
      includeUnresolvedItems: true,
    },
    lossPolicy: {
      preserveLossContract: true,
      blockOnFatalLoss: targetRoute !== UXML_ROUTE_TARGETS.DIAGNOSTICS_ONLY,
    },
    decisionSummary,
    handoffSummary: {
      handoffConnectionCount: number(handoffSummary.handoffConnectionCount),
      annotatedRowCount: number(handoffSummary.annotatedRowCount),
      pipelineCount: number(handoffSummary.pipelineCount),
      coordinatesMutated: handoffSummary.coordinatesMutated === true,
      legacyRoutingContinues: handoffSummary.legacyRoutingContinues === true,
      mastersDeferredToLegacyRoute:
        handoffSummary.mastersDeferredToLegacyRoute === true,
      pcfEmitterDeferredToLegacyRoute:
        handoffSummary.pcfEmitterDeferredToLegacyRoute === true,
    },
    routeContract: {
      ownsExport: targetRoute !== UXML_ROUTE_TARGETS.DIAGNOSTICS_ONLY,
      ownsMasters: masterOwnerForRoute(targetRoute),
      uxmlMutatesCoordinates: false,
      uxmlAppliesFixes: false,
      uxmlEmitsPcfDirectly: false,
    },
  };
}

function block(args) {
  return makeResult({
    ...args,
    allowed: false,
  });
}

function allow(args) {
  return makeResult({
    ...args,
    allowed: true,
    blockCode: '',
    blockedReason: '',
  });
}

export function evaluateUxmlRouteHandoffPolicy({
  targetRoute = UXML_ROUTE_TARGETS.DIAGNOSTICS_ONLY,
  uxml = null,
  topologyDecision = null,
  acceptedTopologyHandoff = null,
  diagnostics = [],
  lossContract = [],
  allowPartialExport = false,
} = {}) {
  const route = normalizeTargetRoute(targetRoute);

  if (!route) {
    return block({
      targetRoute: '',
      topologyDecision,
      acceptedTopologyHandoff,
      allowPartialExport,
      blockCode: UXML_ROUTE_BLOCK_CODES.NO_TARGET_ROUTE,
      blockedReason: 'No valid UXML route target was selected.',
    });
  }

  if (!topologyDecision) {
    return block({
      targetRoute: route,
      topologyDecision,
      acceptedTopologyHandoff,
      allowPartialExport,
      blockCode: UXML_ROUTE_BLOCK_CODES.NO_TOPOLOGY_DECISION,
      blockedReason:
        'TopologyDecisionGate has not been run. Run comparison and decision gate before route handoff.',
    });
  }

  const decisionSummary = getDecisionSummary(topologyDecision);

  if (!decisionSummary.outputBridgeReady) {
    return block({
      targetRoute: route,
      topologyDecision,
      acceptedTopologyHandoff,
      allowPartialExport,
      blockCode: UXML_ROUTE_BLOCK_CODES.OUTPUT_BRIDGE_NOT_READY,
      blockedReason:
        'UXML output bridge is not ready. No accepted topology evidence is available for this route.',
    });
  }

  if (!decisionSummary.exportAllowed && allowPartialExport !== true) {
    return block({
      targetRoute: route,
      topologyDecision,
      acceptedTopologyHandoff,
      allowPartialExport,
      blockCode: UXML_ROUTE_BLOCK_CODES.EXPORT_NOT_ALLOWED,
      blockedReason:
        'TopologyDecisionGate did not allow route handoff. Enable partial export or resolve manual/rejected/unresolved topology items.',
    });
  }

  if (decisionSummary.unresolvedCount > 0 && allowPartialExport !== true) {
    return block({
      targetRoute: route,
      topologyDecision,
      acceptedTopologyHandoff,
      allowPartialExport,
      blockCode: UXML_ROUTE_BLOCK_CODES.UNRESOLVED_TOPOLOGY,
      blockedReason:
        `Route handoff blocked because unresolved topology count is ${decisionSummary.unresolvedCount}.`,
    });
  }

  if (decisionSummary.rejectedCount > 0 && allowPartialExport !== true) {
    return block({
      targetRoute: route,
      topologyDecision,
      acceptedTopologyHandoff,
      allowPartialExport,
      blockCode: UXML_ROUTE_BLOCK_CODES.REJECTED_TOPOLOGY,
      blockedReason:
        `Route handoff blocked because rejected topology count is ${decisionSummary.rejectedCount}.`,
    });
  }

  if (decisionSummary.manualReviewCount > 0 && allowPartialExport !== true) {
    return block({
      targetRoute: route,
      topologyDecision,
      acceptedTopologyHandoff,
      allowPartialExport,
      blockCode: UXML_ROUTE_BLOCK_CODES.MANUAL_REVIEW_REQUIRED,
      blockedReason:
        `Route handoff blocked because manual review count is ${decisionSummary.manualReviewCount}.`,
    });
  }

  return allow({
    targetRoute: route,
    topologyDecision,
    acceptedTopologyHandoff,
    allowPartialExport,
  });
}

export function assertUxmlRouteHandoffAllowed(options = {}) {
  const result = evaluateUxmlRouteHandoffPolicy(options);

  if (!result.allowed) {
    const err = new Error(result.blockedReason);
    err.code = result.blockCode;
    err.routeHandoffPolicy = result;
    throw err;
  }

  return result;
}

export function summarizeUxmlRouteHandoff(policy) {
  if (!policy) {
    return 'UXML route handoff policy was not evaluated.';
  }

  if (!policy.allowed) {
    return `${policy.targetRouteLabel} blocked: ${policy.blockedReason}`;
  }

  if (policy.targetRoute === UXML_ROUTE_TARGETS.EXTRACT_PCF_LEGACY) {
    return `Route handoff allowed to legacy Extract PCF. Accepted=${policy.decisionSummary.acceptedConnectionCount}; masters and PCF emitter remain owned by legacy route.`;
  }

  return `Route handoff allowed to ${policy.targetRouteLabel}. Accepted=${policy.decisionSummary.acceptedConnectionCount}.`;
}

export function createUxmlRouteHandoffPayload({
  targetRoute = UXML_ROUTE_TARGETS.DIAGNOSTICS_ONLY,
  uxml = null,
  topologyDecision = null,
  acceptedTopologyHandoff = null,
  diagnostics = [],
  lossContract = [],
  allowPartialExport = false,
} = {}) {
  const policy = evaluateUxmlRouteHandoffPolicy({
    targetRoute,
    uxml,
    topologyDecision,
    acceptedTopologyHandoff,
    diagnostics,
    lossContract,
    allowPartialExport,
  });

  return {
    schema: 'uxml-route-handoff-payload/v1',
    policy,
    targetRoute: policy.targetRoute,
    allowed: policy.allowed,
    uxml,
    topologyDecision,
    acceptedTopologyHandoff,
    diagnostics: list(diagnostics),
    lossContract: list(lossContract),
    routeContract: policy.routeContract,
  };
}

export const buildUxmlRouteHandoffPolicy = evaluateUxmlRouteHandoffPolicy;