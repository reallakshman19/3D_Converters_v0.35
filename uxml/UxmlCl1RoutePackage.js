/**
 * UxmlCl1RoutePackage.js
 *
 * CL1 route package layer.
 *
 * Purpose:
 * - Package UXML topology-decision evidence into a deterministic downstream
 *   route payload.
 * - Stay topology-only: no PCF emission, no master resolution, no coordinate
 *   mutation, no topology repair.
 */

import {
  UXML_ROUTE_TARGETS,
  evaluateUxmlRouteHandoffPolicy,
  summarizeUxmlRouteHandoff,
} from './UxmlRouteHandoffPolicy.js';

export const UXML_CL1_ROUTE_PACKAGE_SCHEMA = 'uxml-cl1-route-package/v1';

export const UXML_CL1_ROUTE_PACKAGE_BLOCK_CODES = Object.freeze({
  NO_UXML: 'UXML-CL1-NO-UXML',
  ROUTE_HANDOFF_BLOCKED: 'UXML-CL1-ROUTE-HANDOFF-BLOCKED',
});

function clean(value) {
  return String(value ?? '').trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function canonicalJson(value) {
  if (value == null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function stableHash(value) {
  const text = canonicalJson(value);
  let hash = 2166136261;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return `cl1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function uxmlCounts(uxml) {
  return {
    sourceCount: list(uxml?.sources).length,
    pipelineCount: list(uxml?.pipelines).length,
    componentCount: list(uxml?.components).length,
    anchorCount: list(uxml?.anchors).length,
    portCount: list(uxml?.ports).length,
    segmentCount: list(uxml?.segments).length,
    supportCount: list(uxml?.supports).length,
    mappingCount: list(uxml?.mappings).length,
    diagnosticCount: list(uxml?.diagnostics).length,
    lossCount: list(uxml?.lossContract).length,
  };
}

function decisionCounts(topologyDecision) {
  const summary = topologyDecision?.summary || {};

  return {
    outputBridgeReady: topologyDecision?.outputBridgeReady === true,
    exportAllowed: topologyDecision?.exportAllowed === true,
    acceptedConnectionCount: Number(summary.acceptedConnectionCount) || 0,
    agreementAcceptedCount: Number(summary.agreementAcceptedCount) || 0,
    universalOnlyAcceptedCount: Number(summary.universalOnlyAcceptedCount) || 0,
    rayPromotionAcceptedCount: Number(summary.rayPromotionAcceptedCount) || 0,
    faceProximityAcceptedCount: Number(summary.faceProximityAcceptedCount) || 0,
    manualReviewCount: Number(summary.manualReviewCount) || 0,
    rejectedCount: Number(summary.rejectedCount) || 0,
    unresolvedCount: Number(summary.unresolvedCount) || 0,
    diagnosticCount: Number(summary.diagnosticCount) || 0,
  };
}

function handoffCounts(acceptedTopologyHandoff) {
  const summary = acceptedTopologyHandoff?.summary || {};

  return {
    handoffConnectionCount: Number(summary.handoffConnectionCount) || 0,
    annotatedRowCount: Number(summary.annotatedRowCount) || 0,
    totalRowCount: Number(summary.totalRowCount) || 0,
    pipelineCount: Number(summary.pipelineCount) || 0,
    coordinatesMutated: summary.coordinatesMutated === true,
    legacyRoutingContinues: summary.legacyRoutingContinues === true,
    mastersDeferredToLegacyRoute: summary.mastersDeferredToLegacyRoute === true,
    pcfEmitterDeferredToLegacyRoute: summary.pcfEmitterDeferredToLegacyRoute === true,
  };
}

function componentTypes(uxml) {
  const counts = {};

  for (const component of list(uxml?.components)) {
    const type = clean(component?.normalizedType || component?.type || 'UNKNOWN').toUpperCase();
    counts[type] = (counts[type] || 0) + 1;
  }

  return counts;
}

function pipelineRefs(uxml) {
  return list(uxml?.pipelines)
    .map((pipeline) => clean(pipeline?.pipelineRef || pipeline?.id))
    .filter(Boolean);
}

function packageIdFor({
  targetRoute,
  sourceInfo,
  entityCounts,
  topologyCounts,
  handoffSummary,
}) {
  return stableHash({
    targetRoute,
    sourceInfo,
    entityCounts,
    topologyCounts,
    handoffSummary,
  });
}

function makeBlockedPackage({
  targetRoute,
  blockCode,
  blockedReason,
  sourceInfo,
  uxml,
  topologyDecision,
  acceptedTopologyHandoff,
  diagnostics,
  lossContract,
  policy = null,
}) {
  const entityCounts = uxmlCounts(uxml || {});
  const topologyCounts = decisionCounts(topologyDecision || {});
  const handoffSummary = handoffCounts(acceptedTopologyHandoff || {});

  return {
    schema: UXML_CL1_ROUTE_PACKAGE_SCHEMA,
    ok: false,
    allowed: false,
    blocked: true,
    blockCode,
    blockedReason,
    packageId: packageIdFor({
      targetRoute,
      sourceInfo,
      entityCounts,
      topologyCounts,
      handoffSummary,
    }),
    targetRoute,
    targetRouteLabel: clean(targetRoute),
    sourceInfo: cloneJson(sourceInfo),
    policy: cloneJson(policy),
    entityCounts,
    topologyCounts,
    handoffSummary,
    componentTypes: componentTypes(uxml || {}),
    pipelineRefs: pipelineRefs(uxml || {}),
    diagnostics: cloneJson(list(diagnostics)),
    lossContract: cloneJson(list(lossContract)),
    routeContract: cloneJson(policy?.routeContract || {
      uxmlMutatesCoordinates: false,
      uxmlAppliesFixes: false,
      uxmlEmitsPcfDirectly: false,
    }),
    payload: null,
  };
}

export function createUxmlCl1RoutePackage({
  targetRoute = UXML_ROUTE_TARGETS.DIAGNOSTICS_ONLY,
  uxml = null,
  topologyDecision = null,
  acceptedTopologyHandoff = null,
  diagnostics = [],
  lossContract = [],
  allowPartialExport = false,
  sourceInfo = {},
} = {}) {
  if (!uxml || typeof uxml !== 'object') {
    return makeBlockedPackage({
      targetRoute,
      blockCode: UXML_CL1_ROUTE_PACKAGE_BLOCK_CODES.NO_UXML,
      blockedReason: 'Cannot create CL1 route package because UXML document is missing.',
      sourceInfo,
      uxml,
      topologyDecision,
      acceptedTopologyHandoff,
      diagnostics,
      lossContract,
    });
  }

  const policy = evaluateUxmlRouteHandoffPolicy({
    targetRoute,
    uxml,
    topologyDecision,
    acceptedTopologyHandoff,
    diagnostics,
    lossContract,
    allowPartialExport,
  });

  if (!policy.allowed) {
    return makeBlockedPackage({
      targetRoute: policy.targetRoute || targetRoute,
      blockCode: UXML_CL1_ROUTE_PACKAGE_BLOCK_CODES.ROUTE_HANDOFF_BLOCKED,
      blockedReason: policy.blockedReason,
      policy,
      sourceInfo,
      uxml,
      topologyDecision,
      acceptedTopologyHandoff,
      diagnostics,
      lossContract,
    });
  }

  const entityCounts = uxmlCounts(uxml);
  const topologyCounts = decisionCounts(topologyDecision || {});
  const handoffSummary = handoffCounts(acceptedTopologyHandoff || {});
  const packageId = packageIdFor({
    targetRoute: policy.targetRoute,
    sourceInfo,
    entityCounts,
    topologyCounts,
    handoffSummary,
  });

  return {
    schema: UXML_CL1_ROUTE_PACKAGE_SCHEMA,
    ok: true,
    allowed: true,
    blocked: false,
    blockCode: '',
    blockedReason: '',
    packageId,
    targetRoute: policy.targetRoute,
    targetRouteLabel: policy.targetRouteLabel,
    sourceInfo: cloneJson(sourceInfo),
    policy: cloneJson(policy),
    entityCounts,
    topologyCounts,
    handoffSummary,
    componentTypes: componentTypes(uxml),
    pipelineRefs: pipelineRefs(uxml),
    diagnostics: cloneJson(list(diagnostics)),
    lossContract: cloneJson(list(lossContract)),
    routeContract: cloneJson(policy.routeContract),
    payload: {
      uxml: cloneJson(uxml),
      topologyDecision: cloneJson(topologyDecision),
      acceptedTopologyHandoff: cloneJson(acceptedTopologyHandoff),
      requiredPayload: cloneJson(policy.requiredPayload),
      masterOwner: policy.masterOwner,
      diagnosticsPolicy: cloneJson(policy.diagnosticsPolicy),
      lossPolicy: cloneJson(policy.lossPolicy),
    },
  };
}

export function assertUxmlCl1RoutePackageAllowed(options = {}) {
  const pkg = createUxmlCl1RoutePackage(options);

  if (!pkg.allowed) {
    const err = new Error(pkg.blockedReason);
    err.code = pkg.blockCode;
    err.cl1RoutePackage = pkg;
    throw err;
  }

  return pkg;
}

export function summarizeUxmlCl1RoutePackage(pkg) {
  if (!pkg) return 'CL1 route package was not created.';

  if (!pkg.allowed) {
    return `CL1 route package blocked: ${pkg.blockedReason}`;
  }

  const routeText = summarizeUxmlRouteHandoff(pkg.policy);
  return `${routeText} CL1 package=${pkg.packageId}; components=${pkg.entityCounts.componentCount}; accepted=${pkg.topologyCounts.acceptedConnectionCount}.`;
}

export const buildUxmlCl1RoutePackage = createUxmlCl1RoutePackage;
