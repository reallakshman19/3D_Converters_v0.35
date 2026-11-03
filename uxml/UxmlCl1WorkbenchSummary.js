/**
 * UxmlCl1WorkbenchSummary.js
 *
 * One-screen QA summary for the CL1 chain.
 */

export const UXML_CL1_WORKBENCH_SUMMARY_SCHEMA = 'uxml-cl1-workbench-summary/v1';

export const UXML_CL1_WORKBENCH_STATUS = Object.freeze({
  PASS: 'PASS',
  WARN: 'WARN',
  BLOCKED: 'BLOCKED',
  NOT_RUN: 'NOT_RUN',
});

function clean(value) {
  return String(value ?? '').trim();
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function bool(value) {
  return value === true;
}

function stageStatus({ present, pass, warn = false }) {
  if (!present) return UXML_CL1_WORKBENCH_STATUS.NOT_RUN;
  if (pass) return warn ? UXML_CL1_WORKBENCH_STATUS.WARN : UXML_CL1_WORKBENCH_STATUS.PASS;
  return UXML_CL1_WORKBENCH_STATUS.BLOCKED;
}

function makeStage({ id, label, status, message = '', details = {} }) {
  return { id, label, status, message, details };
}

function decisionStage(topologyDecision) {
  const present = !!topologyDecision;
  const summary = topologyDecision?.summary || {};
  const outputBridgeReady = bool(topologyDecision?.outputBridgeReady);
  const exportAllowed = bool(topologyDecision?.exportAllowed);
  const manual = number(summary.manualReviewCount);
  const rejected = number(summary.rejectedCount);
  const unresolved = number(summary.unresolvedCount);
  const warn = manual > 0 || rejected > 0 || unresolved > 0 || !exportAllowed;

  return makeStage({
    id: 'decision-gate',
    label: 'Decision Gate',
    status: stageStatus({
      present,
      pass: outputBridgeReady,
      warn,
    }),
    message: !present
      ? 'Decision gate has not run.'
      : outputBridgeReady
        ? `Decision gate ready. Accepted=${number(summary.acceptedConnectionCount)}, Manual=${manual}, Rejected=${rejected}, Unresolved=${unresolved}.`
        : 'Decision gate output bridge is not ready.',
    details: {
      outputBridgeReady,
      exportAllowed,
      acceptedConnectionCount: number(summary.acceptedConnectionCount),
      manualReviewCount: manual,
      rejectedCount: rejected,
      unresolvedCount: unresolved,
    },
  });
}

function routeHandoffStage(routeHandoff) {
  const policy = routeHandoff?.policy || routeHandoff || null;
  const present = !!policy;
  const allowed = bool(policy?.allowed);

  return makeStage({
    id: 'route-handoff',
    label: 'Route Handoff',
    status: stageStatus({
      present,
      pass: allowed,
    }),
    message: !present
      ? 'Route handoff has not run.'
      : allowed
        ? `Route handoff allowed to ${clean(policy.targetRouteLabel || policy.targetRoute)}.`
        : `Route handoff blocked: ${clean(policy.blockedReason)}`,
    details: {
      targetRoute: clean(policy?.targetRoute),
      targetRouteLabel: clean(policy?.targetRouteLabel),
      allowed,
      blockCode: clean(policy?.blockCode),
      blockedReason: clean(policy?.blockedReason),
      masterOwner: clean(policy?.masterOwner),
    },
  });
}

function cl1PackageStage(pkg) {
  const present = !!pkg;
  const allowed = bool(pkg?.allowed);

  return makeStage({
    id: 'cl1-package',
    label: 'CL1 Route Package',
    status: stageStatus({
      present,
      pass: allowed,
    }),
    message: !present
      ? 'CL1 route package has not been built.'
      : allowed
        ? `CL1 package ready: ${clean(pkg.packageId)}.`
        : `CL1 package blocked: ${clean(pkg.blockedReason)}`,
    details: {
      packageId: clean(pkg?.packageId),
      targetRoute: clean(pkg?.targetRoute),
      allowed,
      componentCount: number(pkg?.entityCounts?.componentCount),
      anchorCount: number(pkg?.entityCounts?.anchorCount),
      portCount: number(pkg?.entityCounts?.portCount),
      segmentCount: number(pkg?.entityCounts?.segmentCount),
      acceptedConnectionCount: number(pkg?.topologyCounts?.acceptedConnectionCount),
    },
  });
}

function cl1SnapshotStage(snapshot) {
  const present = !!snapshot;
  const pass = bool(snapshot?.debugOnly) && snapshot?.pcfGenerated !== true && snapshot?.mastersResolved !== true;

  return makeStage({
    id: 'cl1-snapshot',
    label: 'CL1 Snapshot JSON',
    status: stageStatus({
      present,
      pass,
    }),
    message: !present
      ? 'CL1 snapshot has not been built.'
      : pass
        ? `CL1 snapshot ready: ${clean(snapshot.snapshotId)}.`
        : 'CL1 snapshot is not replay-safe.',
    details: {
      snapshotId: clean(snapshot?.snapshotId),
      packageId: clean(snapshot?.packageId),
      debugOnly: bool(snapshot?.debugOnly),
      payloadIncluded: bool(snapshot?.payloadIncluded),
      pcfGenerated: bool(snapshot?.pcfGenerated),
      mastersResolved: bool(snapshot?.mastersResolved),
      coordinatesMutated: bool(snapshot?.coordinatesMutated),
      fixesApplied: bool(snapshot?.fixesApplied),
    },
  });
}

function cl1ReplayStage(replay) {
  const present = !!replay;
  const pass = bool(replay?.replayReady);
  const warn = pass && number(replay?.summary?.warningCount) > 0;

  return makeStage({
    id: 'cl1-replay',
    label: 'CL1 Replay Validator',
    status: stageStatus({
      present,
      pass,
      warn,
    }),
    message: !present
      ? 'CL1 snapshot replay has not been validated.'
      : pass
        ? `CL1 snapshot replay-ready. Blocking=${number(replay?.summary?.blockingIssueCount)}, Warnings=${number(replay?.summary?.warningCount)}.`
        : 'CL1 snapshot replay blocked.',
    details: {
      replayReady: pass,
      blockingIssueCount: number(replay?.summary?.blockingIssueCount),
      warningCount: number(replay?.summary?.warningCount),
      componentCount: number(replay?.countSummary?.componentCount),
      acceptedConnectionCount: number(replay?.countSummary?.acceptedConnectionCount),
      manualReviewCount: number(replay?.countSummary?.manualReviewCount),
      rejectedCount: number(replay?.countSummary?.rejectedCount),
      unresolvedCount: number(replay?.countSummary?.unresolvedCount),
      debugOnly: bool(replay?.debugOnly),
      pcfGenerated: bool(replay?.pcfGenerated),
      mastersResolved: bool(replay?.mastersResolved),
      coordinatesMutated: bool(replay?.coordinatesMutated),
      fixesApplied: bool(replay?.fixesApplied),
    },
  });
}

function countBlocked(stages) {
  return Object.values(stages).filter((stage) => stage.status === UXML_CL1_WORKBENCH_STATUS.BLOCKED).length;
}

function countWarn(stages) {
  return Object.values(stages).filter((stage) => stage.status === UXML_CL1_WORKBENCH_STATUS.WARN).length;
}

function countNotRun(stages) {
  return Object.values(stages).filter((stage) => stage.status === UXML_CL1_WORKBENCH_STATUS.NOT_RUN).length;
}

function stageSummary({
  topologyDecision,
  routeHandoff,
  cl1RoutePackage,
  cl1Snapshot,
  cl1ReplayValidation,
}) {
  const stages = {
    decisionGate: decisionStage(topologyDecision),
    routeHandoff: routeHandoffStage(routeHandoff),
    cl1Package: cl1PackageStage(cl1RoutePackage),
    cl1Snapshot: cl1SnapshotStage(cl1Snapshot),
    cl1Replay: cl1ReplayStage(cl1ReplayValidation),
  };

  const blockedCount = countBlocked(stages);
  const warningCount = countWarn(stages);
  const notRunCount = countNotRun(stages);
  const readyForRouteConsumption =
    blockedCount === 0 &&
    warningCount === 0 &&
    notRunCount === 0 &&
    stages.decisionGate.status === UXML_CL1_WORKBENCH_STATUS.PASS &&
    stages.routeHandoff.status === UXML_CL1_WORKBENCH_STATUS.PASS &&
    stages.cl1Package.status === UXML_CL1_WORKBENCH_STATUS.PASS &&
    stages.cl1Snapshot.status === UXML_CL1_WORKBENCH_STATUS.PASS &&
    stages.cl1Replay.status === UXML_CL1_WORKBENCH_STATUS.PASS;

  let overallStatus = UXML_CL1_WORKBENCH_STATUS.WARN;
  if (blockedCount > 0) {
    overallStatus = UXML_CL1_WORKBENCH_STATUS.BLOCKED;
  } else if (warningCount === 0 && notRunCount === 0) {
    overallStatus = UXML_CL1_WORKBENCH_STATUS.PASS;
  } else if (notRunCount > 0 || warningCount > 0) {
    overallStatus = UXML_CL1_WORKBENCH_STATUS.WARN;
  }

  const packageCounts = cl1RoutePackage?.entityCounts || {};
  const replayCounts = cl1ReplayValidation?.countSummary || {};
  const counts = {
    componentCount: number(packageCounts.componentCount || replayCounts.componentCount),
    anchorCount: number(packageCounts.anchorCount || replayCounts.anchorCount),
    portCount: number(packageCounts.portCount || replayCounts.portCount),
    segmentCount: number(packageCounts.segmentCount || replayCounts.segmentCount),
    supportCount: number(packageCounts.supportCount || replayCounts.supportCount),
    acceptedConnectionCount: number(
      cl1RoutePackage?.topologyCounts?.acceptedConnectionCount ||
      topologyDecision?.summary?.acceptedConnectionCount ||
      replayCounts.acceptedConnectionCount
    ),
    manualReviewCount: number(
      cl1RoutePackage?.topologyCounts?.manualReviewCount ||
      topologyDecision?.summary?.manualReviewCount ||
      replayCounts.manualReviewCount
    ),
    rejectedCount: number(
      cl1RoutePackage?.topologyCounts?.rejectedCount ||
      topologyDecision?.summary?.rejectedCount ||
      replayCounts.rejectedCount
    ),
    unresolvedCount: number(
      cl1RoutePackage?.topologyCounts?.unresolvedCount ||
      topologyDecision?.summary?.unresolvedCount ||
      replayCounts.unresolvedCount
    ),
  };

  return {
    schema: UXML_CL1_WORKBENCH_SUMMARY_SCHEMA,
    overallStatus,
    readyForRouteConsumption,
    blockedCount,
    warningCount,
    notRunCount,
    counts,
    safety: {
      pcfGenerated: bool(cl1Snapshot?.pcfGenerated || cl1ReplayValidation?.pcfGenerated),
      mastersResolved: bool(cl1Snapshot?.mastersResolved || cl1ReplayValidation?.mastersResolved),
      coordinatesMutated: bool(cl1Snapshot?.coordinatesMutated || cl1ReplayValidation?.coordinatesMutated),
      fixesApplied: bool(cl1Snapshot?.fixesApplied || cl1ReplayValidation?.fixesApplied),
    },
    stages,
    sourceRoute: clean(routeHandoff?.policy?.targetRoute || cl1RoutePackage?.targetRoute || topologyDecision?.targetRoute),
  };
}

export function buildUxmlCl1WorkbenchSummary({
  topologyDecision = null,
  routeHandoff = null,
  cl1RoutePackage = null,
  cl1Snapshot = null,
  cl1ReplayValidation = null,
} = {}) {
  return stageSummary({
    topologyDecision,
    routeHandoff,
    cl1RoutePackage,
    cl1Snapshot,
    cl1ReplayValidation,
  });
}

export function summarizeUxmlCl1WorkbenchSummary(summary) {
  if (!summary) return 'CL1 workbench summary was not run.';
  return `CL1 workbench ${summary.overallStatus}. Components=${number(summary.counts?.componentCount)}; Accepted=${number(summary.counts?.acceptedConnectionCount)}; Ready=${summary.readyForRouteConsumption ? 'YES' : 'NO'}.`;
}

export const createUxmlCl1WorkbenchSummary = buildUxmlCl1WorkbenchSummary;
