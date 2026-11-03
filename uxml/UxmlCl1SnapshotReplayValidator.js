/**
 * UxmlCl1SnapshotReplayValidator.js
 *
 * Validates whether a CL1 snapshot is structurally replayable.
 */

import {
  UXML_CL1_PACKAGE_SNAPSHOT_SCHEMA,
} from './UxmlCl1PackageSnapshot.js';

export const UXML_CL1_SNAPSHOT_REPLAY_VALIDATOR_SCHEMA =
  'uxml-cl1-snapshot-replay-validator/v1';

export const UXML_CL1_REPLAY_BLOCK_CODES = Object.freeze({
  INVALID_JSON: 'UXML-CL1-REPLAY-INVALID-JSON',
  INVALID_SNAPSHOT_SCHEMA: 'UXML-CL1-REPLAY-INVALID-SNAPSHOT-SCHEMA',
  NOT_DEBUG_ONLY: 'UXML-CL1-REPLAY-NOT-DEBUG-ONLY',
  PCF_GENERATED_FLAG_TRUE: 'UXML-CL1-REPLAY-PCF-GENERATED-FLAG-TRUE',
  MASTERS_RESOLVED_FLAG_TRUE: 'UXML-CL1-REPLAY-MASTERS-RESOLVED-FLAG-TRUE',
  COORDINATES_MUTATED_FLAG_TRUE: 'UXML-CL1-REPLAY-COORDINATES-MUTATED-FLAG-TRUE',
  FIXES_APPLIED_FLAG_TRUE: 'UXML-CL1-REPLAY-FIXES-APPLIED-FLAG-TRUE',
  MISSING_PACKAGE_ID: 'UXML-CL1-REPLAY-MISSING-PACKAGE-ID',
  MISSING_SNAPSHOT_ID: 'UXML-CL1-REPLAY-MISSING-SNAPSHOT-ID',
  MISSING_TARGET_ROUTE: 'UXML-CL1-REPLAY-MISSING-TARGET-ROUTE',
  MISSING_COUNTS: 'UXML-CL1-REPLAY-MISSING-COUNTS',
  ROUTE_CONTRACT_UNSAFE: 'UXML-CL1-REPLAY-ROUTE-CONTRACT-UNSAFE',
});

function clean(value) {
  return String(value ?? '').trim();
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function makeIssue({
  severity = 'ERROR',
  code,
  message,
  path = '',
  details = {},
}) {
  return {
    severity,
    code,
    message,
    path,
    details,
  };
}

function parseSnapshot(input) {
  if (typeof input === 'string') {
    try {
      return { ok: true, snapshot: JSON.parse(input) };
    } catch (error) {
      return { ok: false, error };
    }
  }

  return { ok: true, snapshot: input };
}

function countSummary(snapshot) {
  const entityCounts = snapshot?.entityCounts || {};
  const topologyCounts = snapshot?.topologyCounts || {};
  const handoffSummary = snapshot?.handoffSummary || {};

  return {
    componentCount: number(entityCounts.componentCount),
    anchorCount: number(entityCounts.anchorCount),
    portCount: number(entityCounts.portCount),
    segmentCount: number(entityCounts.segmentCount),
    supportCount: number(entityCounts.supportCount),
    acceptedConnectionCount: number(topologyCounts.acceptedConnectionCount),
    manualReviewCount: number(topologyCounts.manualReviewCount),
    rejectedCount: number(topologyCounts.rejectedCount),
    unresolvedCount: number(topologyCounts.unresolvedCount),
    handoffConnectionCount: number(handoffSummary.handoffConnectionCount),
    annotatedRowCount: number(handoffSummary.annotatedRowCount),
  };
}

function validateSafetyFlags(snapshot, issues) {
  if (snapshot.debugOnly !== true) {
    issues.push(makeIssue({
      code: UXML_CL1_REPLAY_BLOCK_CODES.NOT_DEBUG_ONLY,
      message: 'CL1 snapshot must be debug-only for replay validation.',
      path: 'debugOnly',
    }));
  }

  if (snapshot.pcfGenerated === true) {
    issues.push(makeIssue({
      code: UXML_CL1_REPLAY_BLOCK_CODES.PCF_GENERATED_FLAG_TRUE,
      message: 'Snapshot claims PCF was generated; replay validator only accepts non-PCF debug snapshots.',
      path: 'pcfGenerated',
    }));
  }

  if (snapshot.mastersResolved === true) {
    issues.push(makeIssue({
      code: UXML_CL1_REPLAY_BLOCK_CODES.MASTERS_RESOLVED_FLAG_TRUE,
      message: 'Snapshot claims masters were resolved; replay validator only accepts topology/debug snapshots.',
      path: 'mastersResolved',
    }));
  }

  if (snapshot.coordinatesMutated === true) {
    issues.push(makeIssue({
      code: UXML_CL1_REPLAY_BLOCK_CODES.COORDINATES_MUTATED_FLAG_TRUE,
      message: 'Snapshot claims coordinates were mutated.',
      path: 'coordinatesMutated',
    }));
  }

  if (snapshot.fixesApplied === true) {
    issues.push(makeIssue({
      code: UXML_CL1_REPLAY_BLOCK_CODES.FIXES_APPLIED_FLAG_TRUE,
      message: 'Snapshot claims fixes were applied.',
      path: 'fixesApplied',
    }));
  }
}

function validateRouteContract(snapshot, issues) {
  const contract = snapshot?.routeContract || {};

  if (contract.uxmlEmitsPcfDirectly === true) {
    issues.push(makeIssue({
      code: UXML_CL1_REPLAY_BLOCK_CODES.ROUTE_CONTRACT_UNSAFE,
      message: 'Route contract is unsafe: uxmlEmitsPcfDirectly is true.',
      path: 'routeContract.uxmlEmitsPcfDirectly',
    }));
  }

  if (contract.uxmlMutatesCoordinates === true) {
    issues.push(makeIssue({
      code: UXML_CL1_REPLAY_BLOCK_CODES.ROUTE_CONTRACT_UNSAFE,
      message: 'Route contract is unsafe: uxmlMutatesCoordinates is true.',
      path: 'routeContract.uxmlMutatesCoordinates',
    }));
  }

  if (contract.uxmlAppliesFixes === true) {
    issues.push(makeIssue({
      code: UXML_CL1_REPLAY_BLOCK_CODES.ROUTE_CONTRACT_UNSAFE,
      message: 'Route contract is unsafe: uxmlAppliesFixes is true.',
      path: 'routeContract.uxmlAppliesFixes',
    }));
  }
}

function validateCounts(snapshot, issues) {
  const counts = countSummary(snapshot);

  if (
    counts.componentCount < 0 ||
    counts.anchorCount < 0 ||
    counts.portCount < 0 ||
    counts.acceptedConnectionCount < 0
  ) {
    issues.push(makeIssue({
      code: UXML_CL1_REPLAY_BLOCK_CODES.MISSING_COUNTS,
      message: 'Snapshot counts are invalid.',
      path: 'entityCounts/topologyCounts/handoffSummary',
    }));
  }
}

function baseResult({
  snapshot,
  issues,
  warnings,
}) {
  const countSummaryValue = countSummary(snapshot);
  const blockingIssueCount = issues.length;
  const warningCount = warnings.length;
  const replayReady = blockingIssueCount === 0;

  return {
    schema: UXML_CL1_SNAPSHOT_REPLAY_VALIDATOR_SCHEMA,
    ok: replayReady,
    replayReady,
    issues: [...issues, ...warnings],
    summary: {
      blockingIssueCount,
      warningCount,
    },
    countSummary: countSummaryValue,
    debugOnly: snapshot?.debugOnly === true,
    pcfGenerated: snapshot?.pcfGenerated === true,
    mastersResolved: snapshot?.mastersResolved === true,
    coordinatesMutated: snapshot?.coordinatesMutated === true,
    fixesApplied: snapshot?.fixesApplied === true,
    snapshotId: clean(snapshot?.snapshotId),
    packageId: clean(snapshot?.packageId),
    targetRoute: clean(snapshot?.targetRoute),
    allowed: snapshot?.allowed === true,
  };
}

export function validateUxmlCl1SnapshotReplay(input, {
  requirePayloadForReplay = false,
} = {}) {
  const parsed = parseSnapshot(input);

  if (!parsed.ok) {
    return {
      schema: UXML_CL1_SNAPSHOT_REPLAY_VALIDATOR_SCHEMA,
      ok: false,
      replayReady: false,
      issues: [
        makeIssue({
          code: UXML_CL1_REPLAY_BLOCK_CODES.INVALID_JSON,
          message: `Invalid CL1 snapshot JSON: ${parsed.error.message}`,
          path: '',
        }),
      ],
      summary: { blockingIssueCount: 1, warningCount: 0 },
      countSummary: countSummary({}),
      debugOnly: false,
      pcfGenerated: false,
      mastersResolved: false,
      coordinatesMutated: false,
      fixesApplied: false,
      snapshotId: '',
      packageId: '',
      targetRoute: '',
      allowed: false,
    };
  }

  const snapshot = parsed.snapshot;
  const issues = [];
  const warnings = [];

  if (!isPlainObject(snapshot)) {
    issues.push(makeIssue({
      code: UXML_CL1_REPLAY_BLOCK_CODES.INVALID_SNAPSHOT_SCHEMA,
      message: 'CL1 replay validation requires a snapshot object.',
      path: '',
    }));
    return baseResult({ snapshot: {}, issues, warnings });
  }

  if (clean(snapshot.schema) !== UXML_CL1_PACKAGE_SNAPSHOT_SCHEMA) {
    issues.push(makeIssue({
      code: UXML_CL1_REPLAY_BLOCK_CODES.INVALID_SNAPSHOT_SCHEMA,
      message: `Invalid snapshot schema: ${clean(snapshot.schema)}`,
      path: 'schema',
    }));
  }

  if (!clean(snapshot.packageId)) {
    issues.push(makeIssue({
      code: UXML_CL1_REPLAY_BLOCK_CODES.MISSING_PACKAGE_ID,
      message: 'CL1 snapshot is missing packageId.',
      path: 'packageId',
    }));
  }

  if (!clean(snapshot.snapshotId)) {
    issues.push(makeIssue({
      code: UXML_CL1_REPLAY_BLOCK_CODES.MISSING_SNAPSHOT_ID,
      message: 'CL1 snapshot is missing snapshotId.',
      path: 'snapshotId',
    }));
  }

  if (!clean(snapshot.targetRoute)) {
    issues.push(makeIssue({
      code: UXML_CL1_REPLAY_BLOCK_CODES.MISSING_TARGET_ROUTE,
      message: 'CL1 snapshot is missing targetRoute.',
      path: 'targetRoute',
    }));
  }

  validateSafetyFlags(snapshot, issues);
  validateRouteContract(snapshot, issues);
  validateCounts(snapshot, issues);

  if (requirePayloadForReplay && snapshot.payloadIncluded !== true) {
    warnings.push(makeIssue({
      severity: 'WARNING',
      code: 'UXML-CL1-REPLAY-PAYLOAD-NOT-INCLUDED',
      message: 'Replay validation can proceed, but the snapshot does not include payload data.',
      path: 'payloadIncluded',
    }));
  }

  return baseResult({ snapshot, issues, warnings });
}

export function assertUxmlCl1SnapshotReplayReady(input, options = {}) {
  const report = validateUxmlCl1SnapshotReplay(input, options);

  if (!report.replayReady) {
    const issue = report.issues[0];
    const err = new Error(issue?.message || 'CL1 snapshot replay validation failed.');
    err.code = issue?.code || UXML_CL1_REPLAY_BLOCK_CODES.INVALID_JSON;
    err.replayReport = report;
    throw err;
  }

  return report;
}

export function summarizeUxmlCl1SnapshotReplay(report) {
  if (!report) return 'CL1 snapshot replay was not run.';
  if (!report.replayReady) {
    return `CL1 snapshot replay blocked: ${report.issues[0]?.message || 'blocked'}`;
  }

  return `CL1 snapshot replay-ready. Components=${report.countSummary.componentCount}; Accepted=${report.countSummary.acceptedConnectionCount}.`;
}

export const validateUxmlCl1ReplaySnapshot = validateUxmlCl1SnapshotReplay;
