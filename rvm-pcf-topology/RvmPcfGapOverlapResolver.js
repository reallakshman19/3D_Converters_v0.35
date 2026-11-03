import {
  cloneRows,
  isPipe,
  rowPoint,
  setRowPoint,
  pipeLengthAfterMove,
  distance,
  clonePoint,
  normalizeTopoConfig,
} from './RvmPcfTopoTypes.js';

import { buildPcfTopoGraph } from './RvmPcfTopoGraphBuilder.js';

/**
 * Dry-run and transactional gap/overlap resolver.
 *
 * Controlled user action only:
 * - No silent export-time fixing.
 * - Only PIPE ep1/ep2 may change.
 * - No fittings move.
 * - No fittings trim.
 */

function rowKey(row) {
  return String(row?.rowNo ?? row?.sourceCanonicalId ?? row?.id ?? '');
}

function findRowByTopoId(rows, graph, topoId) {
  const component = graph.components.find(c => c.topoId === topoId);
  if (!component) return null;

  return rows.find(row => {
    if (row.rowNo != null && component.rowNo != null && Number(row.rowNo) === Number(component.rowNo)) {
      return true;
    }

    return String(row.sourceCanonicalId || row.id || '') === String(component.sourceCanonicalId || '');
  }) || null;
}

function selectPipeSideForGap(candidate, graph) {
  const sourcePort = graph.ports.find(p => p.portId === candidate.sourcePortId);
  const targetPort = graph.ports.find(p => p.portId === candidate.targetPortId);

  if (!sourcePort || !targetPort) return null;

  if (sourcePort.isPipeEndpoint && !targetPort.isPipeEndpoint) {
    return {
      pipePort: sourcePort,
      targetPort,
    };
  }

  if (targetPort.isPipeEndpoint && !sourcePort.isPipeEndpoint) {
    return {
      pipePort: targetPort,
      targetPort: sourcePort,
    };
  }

  if (sourcePort.isPipeEndpoint && targetPort.isPipeEndpoint) {
    // Deterministic choice for two pipe ends: move higher rowNo endpoint to lower rowNo endpoint.
    if (Number(sourcePort.rowNo) >= Number(targetPort.rowNo)) {
      return { pipePort: sourcePort, targetPort };
    }

    return { pipePort: targetPort, targetPort: sourcePort };
  }

  return null;
}

function addBlocker(plan, code) {
  if (!plan.blockers.includes(code)) plan.blockers.push(code);
  plan.safe = false;
}

export function createGapOverlapFixPlan(rows = [], graph, rawOptions = {}) {
  const config = normalizeTopoConfig(rawOptions);
  const fixPlans = [];

  const usedPipeEndpoint = new Set();

  for (const candidate of graph.gapCandidates || []) {
    const selected = selectPipeSideForGap(candidate, graph);

    if (!selected) continue;

    const { pipePort, targetPort } = selected;
    const pipeRow = findRowByTopoId(rows, graph, pipePort.topoId);

    const plan = {
      planId: `FIX-GAP-${fixPlans.length + 1}`,
      kind: 'GAP',
      action: 'MOVE_PIPE_ENDPOINT',
      pipeTopoId: pipePort.topoId,
      pipeRowNo: pipePort.rowNo,
      pipePointKey: pipePort.pointKey,
      targetTopoId: targetPort.topoId,
      targetRowNo: targetPort.rowNo,
      targetPointKey: targetPort.pointKey,
      before: clonePoint(pipePort.point),
      after: clonePoint(targetPort.point),
      movementMm: candidate.distanceMm,
      safe: true,
      blockers: [],
      candidateId: candidate.candidateId,
    };

    if (!pipeRow || !isPipe(pipeRow)) addBlocker(plan, 'SOURCE_NOT_PIPE');
    if (!['ep1', 'ep2'].includes(pipePort.pointKey)) addBlocker(plan, 'NOT_PIPE_ENDPOINT');
    if (Number(plan.movementMm) > config.fixToleranceMm) addBlocker(plan, 'ABOVE_TOLERANCE');
    if (targetPort.role === 'OLET_HEADER_TAP') addBlocker(plan, 'OLET_HEADER_TAP_NOT_ENDPOINT_FIX');

    const endpointKey = `${pipePort.topoId}:${pipePort.pointKey}`;
    if (usedPipeEndpoint.has(endpointKey)) addBlocker(plan, 'PIPE_ENDPOINT_HAS_MULTIPLE_FIXES');

    const newLength = pipeRow
      ? pipeLengthAfterMove(pipeRow, pipePort.pointKey, targetPort.point)
      : null;

    if (newLength == null || newLength < config.minPipeLengthMm) {
      addBlocker(plan, 'PIPE_ZERO_LENGTH_RISK');
    }

    if (plan.safe) usedPipeEndpoint.add(endpointKey);

    fixPlans.push(plan);
  }

  for (const candidate of graph.overlapCandidates || []) {
    const pipeRow = findRowByTopoId(rows, graph, candidate.pipeTopoId);

    const plan = {
      planId: `FIX-OVERLAP-${fixPlans.length + 1}`,
      kind: 'OVERLAP',
      action: 'TRIM_PIPE_ENDPOINT',
      pipeTopoId: candidate.pipeTopoId,
      pipeRowNo: candidate.pipeRowNo,
      pipePointKey: candidate.pipePointKey,
      fittingTopoId: candidate.fittingTopoId,
      fittingRowNo: candidate.fittingRowNo,
      fittingPointKey: candidate.fittingPointKey,
      before: pipeRow ? rowPoint(pipeRow, candidate.pipePointKey) : null,
      after: clonePoint(candidate.targetPoint),
      trimMm: candidate.trimMm,
      safe: true,
      blockers: [],
      candidateId: candidate.candidateId,
    };

    if (!pipeRow || !isPipe(pipeRow)) addBlocker(plan, 'SOURCE_NOT_PIPE');
    if (!['ep1', 'ep2'].includes(candidate.pipePointKey)) addBlocker(plan, 'NOT_PIPE_ENDPOINT');
    if (Number(plan.trimMm) > config.fixToleranceMm) addBlocker(plan, 'ABOVE_TOLERANCE');

    const endpointKey = `${candidate.pipeTopoId}:${candidate.pipePointKey}`;
    if (usedPipeEndpoint.has(endpointKey)) addBlocker(plan, 'PIPE_ENDPOINT_HAS_MULTIPLE_FIXES');

    const newLength = pipeRow
      ? pipeLengthAfterMove(pipeRow, candidate.pipePointKey, candidate.targetPoint)
      : null;

    if (newLength == null || newLength < config.minPipeLengthMm) {
      addBlocker(plan, 'PIPE_ZERO_LENGTH_RISK');
    }

    if (plan.safe) usedPipeEndpoint.add(endpointKey);

    fixPlans.push(plan);
  }

  const summary = {
    fixToleranceMm: config.fixToleranceMm,
    gapFixPlanCount: fixPlans.filter(p => p.kind === 'GAP').length,
    overlapFixPlanCount: fixPlans.filter(p => p.kind === 'OVERLAP').length,
    safeFixPlanCount: fixPlans.filter(p => p.safe).length,
    blockedFixPlanCount: fixPlans.filter(p => !p.safe).length,
    fittingMovedCount: 0,
    fittingTrimmedCount: 0,
    fixesAboveToleranceCount: fixPlans.filter(p =>
      Number(p.movementMm ?? p.trimMm ?? 0) > config.fixToleranceMm
    ).length,
    pipeZeroLengthAfterFixCount: fixPlans.filter(p => p.blockers.includes('PIPE_ZERO_LENGTH_RISK')).length,
  };

  return {
    schema: 'rvm-pcf-topology/fix-plan/v1',
    summary,
    fixPlans,
  };
}

function applyPlanToClonedRows(clonedRows, graph, plan) {
  if (!plan.safe) return false;

  const pipeRow = findRowByTopoId(clonedRows, graph, plan.pipeTopoId);
  if (!pipeRow || !isPipe(pipeRow)) return false;

  return setRowPoint(pipeRow, plan.pipePointKey, plan.after);
}

function countFatal(graph) {
  return (graph.diagnostics || []).filter(d => d.severity === 'ERROR').length;
}

export function applySafeGapOverlapFixTransaction(rows = [], graph, fixPlanResult, rawOptions = {}) {
  const config = normalizeTopoConfig(rawOptions);
  const beforeGraph = graph || buildPcfTopoGraph(rows, config);
  const clonedRows = cloneRows(rows);

  const safePlans = (fixPlanResult?.fixPlans || []).filter(plan => plan.safe);
  const applied = [];

  for (const plan of safePlans) {
    const ok = applyPlanToClonedRows(clonedRows, beforeGraph, plan);
    if (ok) applied.push(plan);
  }

  const afterGraph = buildPcfTopoGraph(clonedRows, config);

  const beforeFatal = countFatal(beforeGraph);
  const afterFatal = countFatal(afterGraph);

  const beforeTee = beforeGraph.stats.teeIssueCount || 0;
  const afterTee = afterGraph.stats.teeIssueCount || 0;

  const beforeOlet = beforeGraph.stats.oletIssueCount || 0;
  const afterOlet = afterGraph.stats.oletIssueCount || 0;

  const transactionReport = {
    schema: 'rvm-pcf-topology/transaction/v1',
    committed: false,
    fixToleranceMm: config.fixToleranceMm,

    attemptedFixCount: safePlans.length,
    appliedFixCount: applied.length,

    gapFixedCount: applied.filter(p => p.kind === 'GAP').length,
    overlapFixedCount: applied.filter(p => p.kind === 'OVERLAP').length,

    fittingMovedCount: 0,
    fittingTrimmedCount: 0,
    pipeEndpointModifiedCount: applied.length,

    fixesAboveToleranceCount: applied.filter(p =>
      Number(p.movementMm ?? p.trimMm ?? 0) > config.fixToleranceMm
    ).length,

    pipeZeroLengthAfterFixCount: 0,

    beforeFatalIssueCount: beforeFatal,
    afterFatalIssueCount: afterFatal,
    newFatalIssueCount: Math.max(0, afterFatal - beforeFatal),

    beforeTeeIssueCount: beforeTee,
    afterTeeIssueCount: afterTee,
    newTeeIssueCount: Math.max(0, afterTee - beforeTee),

    beforeOletIssueCount: beforeOlet,
    afterOletIssueCount: afterOlet,
    newOletIssueCount: Math.max(0, afterOlet - beforeOlet),

    rejectReasons: [],
    appliedPlans: applied,
  };

  if (transactionReport.fixesAboveToleranceCount > 0) {
    transactionReport.rejectReasons.push('FIXES_ABOVE_TOLERANCE');
  }

  if (transactionReport.newFatalIssueCount > 0) {
    transactionReport.rejectReasons.push('NEW_FATAL_TOPOLOGY_ISSUES');
  }

  if (transactionReport.newTeeIssueCount > 0) {
    transactionReport.rejectReasons.push('NEW_TEE_ISSUES');
  }

  if (transactionReport.newOletIssueCount > 0) {
    transactionReport.rejectReasons.push('NEW_OLET_ISSUES');
  }

  if (transactionReport.fittingMovedCount > 0 || transactionReport.fittingTrimmedCount > 0) {
    transactionReport.rejectReasons.push('FITTING_MUTATION_DETECTED');
  }

  transactionReport.committed = transactionReport.rejectReasons.length === 0;

  return {
    rows: transactionReport.committed ? clonedRows : rows,
    beforeGraph,
    afterGraph,
    transactionReport,
  };
}