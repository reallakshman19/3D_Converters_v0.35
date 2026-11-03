/**
 * RvmPcfExportGuard.js
 *
 * Agent 14: Generate PCF export guard.
 *
 * Purpose:
 * - Centralize whether Generate PCF may proceed.
 * - Respect both legacy readiness and UXML topology decision readiness.
 *
 * Important:
 * - Does not generate PCF.
 * - Does not resolve masters.
 * - Does not mutate rows.
 * - Does not apply fixes.
 */

import {
  DEFAULT_RVM_PCF_TOPOLOGY_MODE,
  RVM_PCF_TOPOLOGY_MODES,
  normalizeRvmPcfTopologyMode,
  topologyModeLabel,
} from './RvmPcfTopologyModes.js';

export const RVM_PCF_EXPORT_GUARD_SCHEMA = 'rvm-pcf-export-guard/v1';

export const RVM_PCF_EXPORT_BLOCK_CODES = Object.freeze({
  NO_ROWS: 'RVM-PCF-EXPORT-NO-ROWS',
  READINESS_NOT_RUN: 'RVM-PCF-EXPORT-READINESS-NOT-RUN',
  LEGACY_READINESS_BLOCKED: 'RVM-PCF-EXPORT-LEGACY-READINESS-BLOCKED',
  UXML_OUTPUT_BRIDGE_NOT_READY: 'RVM-PCF-EXPORT-UXML-OUTPUT-BRIDGE-NOT-READY',
  UXML_DECISION_BLOCKED: 'RVM-PCF-EXPORT-UXML-DECISION-BLOCKED',
  UXML_READINESS_BLOCKED: 'RVM-PCF-EXPORT-UXML-READINESS-BLOCKED',
});

function clean(value) {
  return String(value ?? '').trim();
}

function bool(value) {
  return value === true;
}

function count(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hasRows(rows) {
  return Array.isArray(rows) && rows.length > 0;
}

function readinessAllowPcfExport(readinessGate) {
  if (readinessGate?.report && typeof readinessGate.report.allowPcfExport === 'boolean') {
    return readinessGate.report.allowPcfExport;
  }

  if (typeof readinessGate?.allowPcfExport === 'boolean') {
    return readinessGate.allowPcfExport;
  }

  if (typeof readinessGate?.pass === 'boolean') {
    return readinessGate.pass;
  }

  if (typeof readinessGate?.ok === 'boolean') {
    return readinessGate.ok;
  }

  return false;
}

function readinessWasRun(readinessGate) {
  return !!readinessGate && typeof readinessGate === 'object';
}

function exportBlockReasonFromReadiness(readinessGate) {
  return clean(
    readinessGate?.report?.exportBlockReason ||
    readinessGate?.exportBlockReason ||
    ''
  );
}

function makeResult({
  topologyMode,
  allowed,
  code = '',
  reason = '',
  readinessGate = null,
  rows = [],
  allowPartialExport = false,
}) {
  const topologyDecision = readinessGate?.topologyDecision || null;
  const summary = readinessGate?.summary || {};
  const reportSummary = readinessGate?.report?.summary || {};

  return {
    schema: RVM_PCF_EXPORT_GUARD_SCHEMA,
    topologyMode,
    topologyModeLabel: topologyModeLabel(topologyMode),
    allowed,
    blocked: !allowed,
    code,
    reason,
    allowPartialExport,
    rowCount: Array.isArray(rows) ? rows.length : 0,
    outputBridgeReady: bool(topologyDecision?.outputBridgeReady) || bool(summary.outputBridgeReady),
    exportAllowedByDecision: bool(topologyDecision?.exportAllowed),
    exportAllowedByReadiness: readinessAllowPcfExport(readinessGate),
    acceptedConnectionCount: count(
      topologyDecision?.summary?.acceptedConnectionCount ??
      summary.acceptedConnectionCount ??
      reportSummary.acceptedConnectionCount
    ),
    manualReviewCount: count(
      topologyDecision?.summary?.manualReviewCount ??
      summary.manualReviewCount ??
      reportSummary.manualReviewCount
    ),
    rejectedCount: count(
      topologyDecision?.summary?.rejectedCount ??
      summary.rejectedCount ??
      reportSummary.rejectedCount
    ),
    unresolvedCount: count(
      topologyDecision?.summary?.unresolvedCount ??
      summary.unresolvedCount ??
      reportSummary.unresolvedCount
    ),
    legacyRoutingContinues: bool(summary.legacyRoutingContinues),
    mastersDeferredToLegacyRoute: bool(summary.mastersDeferredToLegacyRoute),
    pcfEmitterDeferredToLegacyRoute: bool(summary.pcfEmitterDeferredToLegacyRoute),
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
    code: '',
    reason: '',
  });
}

export function evaluateRvmPcfExportGuard({
  topologyMode = DEFAULT_RVM_PCF_TOPOLOGY_MODE,
  rows = [],
  readinessGate = null,
  allowPartialExport = false,
} = {}) {
  const mode = normalizeRvmPcfTopologyMode(topologyMode);

  if (!hasRows(rows)) {
    return block({
      topologyMode: mode,
      rows,
      readinessGate,
      allowPartialExport,
      code: RVM_PCF_EXPORT_BLOCK_CODES.NO_ROWS,
      reason: 'No rows are available for PCF export. Build/rebuild the Extract PCF rows first.',
    });
  }

  if (!readinessWasRun(readinessGate)) {
    return block({
      topologyMode: mode,
      rows,
      readinessGate,
      allowPartialExport,
      code: RVM_PCF_EXPORT_BLOCK_CODES.READINESS_NOT_RUN,
      reason: 'Run readiness check before generating PCF.',
    });
  }

  if (mode === RVM_PCF_TOPOLOGY_MODES.UXML_TOPOLOGY) {
    const topologyDecision = readinessGate.topologyDecision || null;
    const outputBridgeReady =
      bool(topologyDecision?.outputBridgeReady) ||
      bool(readinessGate?.summary?.outputBridgeReady);

    const decisionExportAllowed = bool(topologyDecision?.exportAllowed);
    const readinessAllowed = readinessAllowPcfExport(readinessGate);

    if (!outputBridgeReady) {
      return block({
        topologyMode: mode,
        rows,
        readinessGate,
        allowPartialExport,
        code: RVM_PCF_EXPORT_BLOCK_CODES.UXML_OUTPUT_BRIDGE_NOT_READY,
        reason: 'UXML topology output bridge is not ready. Review UXML topology diagnostics before generating PCF.',
      });
    }

    if (!decisionExportAllowed && allowPartialExport !== true) {
      return block({
        topologyMode: mode,
        rows,
        readinessGate,
        allowPartialExport,
        code: RVM_PCF_EXPORT_BLOCK_CODES.UXML_DECISION_BLOCKED,
        reason: exportBlockReasonFromReadiness(readinessGate) ||
          'UXML topology decision gate did not allow export. Review manual/rejected/unresolved topology items.',
      });
    }

    if (!readinessAllowed && allowPartialExport !== true) {
      return block({
        topologyMode: mode,
        rows,
        readinessGate,
        allowPartialExport,
        code: RVM_PCF_EXPORT_BLOCK_CODES.UXML_READINESS_BLOCKED,
        reason: exportBlockReasonFromReadiness(readinessGate) ||
          'UXML readiness gate blocked PCF export.',
      });
    }

    return allow({
      topologyMode: mode,
      rows,
      readinessGate,
      allowPartialExport,
    });
  }

  if (!readinessAllowPcfExport(readinessGate)) {
    return block({
      topologyMode: mode,
      rows,
      readinessGate,
      allowPartialExport,
      code: RVM_PCF_EXPORT_BLOCK_CODES.LEGACY_READINESS_BLOCKED,
      reason: exportBlockReasonFromReadiness(readinessGate) ||
        'Legacy readiness gate blocked PCF export.',
    });
  }

  return allow({
    topologyMode: mode,
    rows,
    readinessGate,
    allowPartialExport,
  });
}

export function assertRvmPcfExportAllowed(options = {}) {
  const result = evaluateRvmPcfExportGuard(options);

  if (!result.allowed) {
    const err = new Error(result.reason);
    err.code = result.code;
    err.guard = result;
    throw err;
  }

  return result;
}

export function formatRvmPcfExportGuardMessage(guard) {
  if (!guard) return 'PCF export guard was not evaluated.';

  if (guard.allowed) {
    if (guard.topologyMode === RVM_PCF_TOPOLOGY_MODES.UXML_TOPOLOGY) {
      return `PCF export allowed by UXML topology gate. Accepted=${guard.acceptedConnectionCount}; legacy masters/PCF route continues.`;
    }

    return 'PCF export allowed by legacy readiness gate.';
  }

  return `${guard.topologyModeLabel} export blocked: ${guard.reason}`;
}