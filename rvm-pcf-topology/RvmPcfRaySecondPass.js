import {
  cloneRows,
  clonePoint,
  distance,
  isFinitePoint,
  isPipe,
  normalizeTopoConfig,
  pipeLengthAfterMove,
  setRowPoint,
} from './RvmPcfTopoTypes.js';

import { buildPcfTopoGraph } from './RvmPcfTopoGraphBuilder.js';

const DEFAULT_RAY_SECOND_PASS_CONFIG = Object.freeze({
  maxRayLengthMm: 500,
  perpendicularToleranceMm: 12,
  connectToleranceMm: 6,
  minPipeLengthMm: 1,
  allowMediumConfidenceAutoFix: true,
});

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeRayConfig(raw = {}) {
  const topo = normalizeTopoConfig(raw);

  return {
    ...topo,
    maxRayLengthMm: clampNumber(
      raw.maxRayLengthMm ?? raw.rayMaxLengthMm,
      1,
      5000,
      DEFAULT_RAY_SECOND_PASS_CONFIG.maxRayLengthMm
    ),
    perpendicularToleranceMm: clampNumber(
      raw.perpendicularToleranceMm ?? raw.rayPerpendicularToleranceMm,
      0,
      100,
      DEFAULT_RAY_SECOND_PASS_CONFIG.perpendicularToleranceMm
    ),
    minPipeLengthMm: clampNumber(
      raw.minPipeLengthMm,
      0.001,
      1000,
      DEFAULT_RAY_SECOND_PASS_CONFIG.minPipeLengthMm
    ),
    allowMediumConfidenceAutoFix: raw.allowMediumConfidenceAutoFix !== false,
  };
}

function vector(a, b) {
  if (!isFinitePoint(a) || !isFinitePoint(b)) return null;
  return {
    x: Number(b.x) - Number(a.x),
    y: Number(b.y) - Number(a.y),
    z: Number(b.z) - Number(a.z),
  };
}

function vectorLength(v) {
  if (!v) return 0;
  return Math.sqrt(
    Number(v.x || 0) * Number(v.x || 0) +
      Number(v.y || 0) * Number(v.y || 0) +
      Number(v.z || 0) * Number(v.z || 0)
  );
}

function normalizeVector(v) {
  const len = vectorLength(v);
  if (len < 1e-9) return null;
  return {
    x: Number(v.x || 0) / len,
    y: Number(v.y || 0) / len,
    z: Number(v.z || 0) / len,
  };
}

function dot(a, b) {
  return (
    Number(a.x || 0) * Number(b.x || 0) +
    Number(a.y || 0) * Number(b.y || 0) +
    Number(a.z || 0) * Number(b.z || 0)
  );
}

function midpoint(a, b) {
  if (!isFinitePoint(a) || !isFinitePoint(b)) return null;
  return {
    x: (Number(a.x) + Number(b.x)) / 2,
    y: (Number(a.y) + Number(b.y)) / 2,
    z: (Number(a.z) + Number(b.z)) / 2,
  };
}

function pointFromRay(origin, dir, t) {
  return {
    x: Number(origin.x) + Number(dir.x) * t,
    y: Number(origin.y) + Number(dir.y) * t,
    z: Number(origin.z) + Number(dir.z) * t,
  };
}

function projectPointToRay(point, origin, dir) {
  if (!isFinitePoint(point) || !isFinitePoint(origin) || !dir) return null;

  const op = vector(origin, point);
  const t = dot(op, dir);
  const projected = pointFromRay(origin, dir, t);
  const miss = distance(point, projected);

  return {
    distanceAlongRayMm: t,
    perpendicularMissMm: miss,
    projected,
  };
}

function round3(value) {
  return Number(Number(value || 0).toFixed(3));
}

function pointLabel(point) {
  if (!isFinitePoint(point)) return '-';
  return `${round3(point.x)}, ${round3(point.y)}, ${round3(point.z)}`;
}

function confidenceRank(confidence) {
  if (confidence === 'HIGH') return 3;
  if (confidence === 'MEDIUM') return 2;
  if (confidence === 'LOW') return 1;
  return 0;
}

function componentByTopoId(graph, topoId) {
  return graph?.components?.find(component => component.topoId === topoId) || null;
}

function findRowByTopoId(rows, graph, topoId) {
  const component = componentByTopoId(graph, topoId);
  if (!component) return null;

  return (
    rows.find(row => {
      if (
        row.rowNo != null &&
        component.rowNo != null &&
        Number(row.rowNo) === Number(component.rowNo)
      ) {
        return true;
      }

      return (
        String(row.sourceCanonicalId || row.id || '') ===
        String(component.sourceCanonicalId || '')
      );
    }) || null
  );
}

function isBranchDisconnectedDiagnostic(diagnostic) {
  return [
    'TOPO-OLET-BRANCH-DISCONNECTED',
    'TOPO-TEE-BRANCH-DISCONNECTED',
  ].includes(String(diagnostic?.code || ''));
}

function makeDiagnostic({
  severity = 'WARNING',
  code,
  message,
  port,
  component,
  details = {},
}) {
  return {
    severity,
    code,
    message,
    rowNo: port?.rowNo ?? component?.rowNo ?? null,
    type: port?.componentType ?? component?.type ?? null,
    refNo: port?.refNo ?? component?.refNo ?? '',
    seqNo: port?.seqNo ?? component?.seqNo ?? '',
    lineNo: port?.lineNo ?? component?.lineNo ?? '',
    pipelineRef: port?.pipelineRef ?? component?.pipelineRef ?? '',
    portId: port?.portId ?? null,
    portRole: port?.role ?? null,
    pointKey: port?.pointKey ?? null,
    point: port?.point ?? null,
    _source: 'ray-second-pass',
    ...details,
  };
}

/**
 * Ray derivation policy:
 *
 * OLET:
 *   origin = BP
 *   direction = normalize(BP - CP)
 *   confidence = HIGH
 *
 * TEE:
 *   origin = BP
 *   direction = normalize(BP - CP)
 *   confidence = HIGH
 *
 * TEE fallback:
 *   origin = BP
 *   direction = normalize(BP - midpoint(EP1, EP2))
 *   confidence = MEDIUM
 */
function deriveBranchRay(component, sourcePort) {
  if (!component || !sourcePort) {
    return {
      ok: false,
      code: 'RAY2-COMPONENT-MISSING',
      reason: 'Component or source branch port missing.',
    };
  }

  const type = String(component.type || sourcePort.componentType || '').toUpperCase();
  const points = component.points || {};

  const bp = isFinitePoint(points.bp)
    ? clonePoint(points.bp)
    : isFinitePoint(sourcePort.point)
      ? clonePoint(sourcePort.point)
      : null;

  if (!isFinitePoint(bp)) {
    return {
      ok: false,
      code: 'RAY2-BRANCH-POINT-MISSING',
      reason: 'Branch point BP is missing.',
    };
  }

  if (type === 'OLET' || type === 'WELDOLET' || type === 'SOCKOLET') {
    const cp = clonePoint(points.cp);

    if (!isFinitePoint(cp)) {
      return {
        ok: false,
        code: 'RAY2-OLET-CP-MISSING',
        reason: 'OLET CP/header tap is missing; cannot derive BP-CP branch vector.',
        origin: bp,
      };
    }

    const direction = normalizeVector(vector(cp, bp));

    if (!direction) {
      return {
        ok: false,
        code: 'RAY2-OLET-BRANCH-VECTOR-ZERO',
        reason: 'OLET BP and CP are coincident or invalid.',
        origin: bp,
        cp,
        bp,
      };
    }

    return {
      ok: true,
      origin: bp,
      direction,
      confidence: 'HIGH',
      method: 'OLET_BP_MINUS_CP',
      cp,
      bp,
      sourcePointLabel: `BP ${pointLabel(bp)}`,
      referencePointLabel: `CP ${pointLabel(cp)}`,
    };
  }

  if (type === 'TEE') {
    const cp = clonePoint(points.cp);

    if (isFinitePoint(cp)) {
      const direction = normalizeVector(vector(cp, bp));

      if (!direction) {
        return {
          ok: false,
          code: 'RAY2-TEE-BRANCH-VECTOR-ZERO',
          reason: 'TEE BP and CP are coincident or invalid.',
          origin: bp,
          cp,
          bp,
        };
      }

      return {
        ok: true,
        origin: bp,
        direction,
        confidence: 'HIGH',
        method: 'TEE_BP_MINUS_CP',
        cp,
        bp,
        sourcePointLabel: `BP ${pointLabel(bp)}`,
        referencePointLabel: `CP ${pointLabel(cp)}`,
      };
    }

    const ep1 = clonePoint(points.ep1);
    const ep2 = clonePoint(points.ep2);
    const mainMid = midpoint(ep1, ep2);

    if (!isFinitePoint(mainMid)) {
      return {
        ok: false,
        code: 'RAY2-TEE-CP-AND-MAIN-MIDPOINT-MISSING',
        reason: 'TEE CP is missing and EP1/EP2 midpoint fallback is unavailable.',
        origin: bp,
      };
    }

    const direction = normalizeVector(vector(mainMid, bp));

    if (!direction) {
      return {
        ok: false,
        code: 'RAY2-TEE-MIDPOINT-BRANCH-VECTOR-ZERO',
        reason: 'TEE BP and main midpoint are coincident or invalid.',
        origin: bp,
        bp,
        mainMid,
      };
    }

    return {
      ok: true,
      origin: bp,
      direction,
      confidence: 'MEDIUM',
      method: 'TEE_BP_MINUS_MAIN_MIDPOINT',
      cp: null,
      bp,
      mainMid,
      sourcePointLabel: `BP ${pointLabel(bp)}`,
      referencePointLabel: `MAIN-MID ${pointLabel(mainMid)}`,
    };
  }

  return {
    ok: false,
    code: 'RAY2-UNSUPPORTED-BRANCH-TYPE',
    reason: `Unsupported branch source type: ${type}`,
    origin: bp,
  };
}

function collectDisconnectedBranchPorts(graph) {
  const out = [];
  const seen = new Set();

  const branchDiagnostics = (graph?.diagnostics || []).filter(isBranchDisconnectedDiagnostic);

  for (const diagnostic of branchDiagnostics) {
    const port = graph.ports.find(p => p.portId === diagnostic.portId);

    if (port && isFinitePoint(port.point)) {
      if (!seen.has(port.portId)) {
        seen.add(port.portId);
        out.push(port);
      }
      continue;
    }

    const fallbackPorts = graph.ports.filter(
      p =>
        p.rowNo === diagnostic.rowNo &&
        ['TEE_BRANCH', 'OLET_BRANCH'].includes(p.role) &&
        isFinitePoint(p.point)
    );

    for (const fallbackPort of fallbackPorts) {
      if (!seen.has(fallbackPort.portId)) {
        seen.add(fallbackPort.portId);
        out.push(fallbackPort);
      }
    }
  }

  return out;
}

function sortCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const ar = confidenceRank(a.rayConfidence);
    const br = confidenceRank(b.rayConfidence);

    if (ar !== br) return br - ar;

    const ad = Number(a.distanceAlongRayMm ?? 0);
    const bd = Number(b.distanceAlongRayMm ?? 0);

    if (Math.abs(ad - bd) > 1e-9) return ad - bd;

    const am = Number(a.perpendicularMissMm ?? 0);
    const bm = Number(b.perpendicularMissMm ?? 0);

    if (Math.abs(am - bm) > 1e-9) return am - bm;

    return String(a.candidateId || '').localeCompare(String(b.candidateId || ''));
  });
}

function candidateKey(candidate) {
  return [
    candidate.sourcePortId,
    candidate.targetPortId,
    candidate.targetRowNo,
    candidate.targetPointKey,
  ].join('|');
}

function sourceCanAutoApply(rayInfo, config) {
  if (rayInfo.confidence === 'HIGH') return true;
  if (rayInfo.confidence === 'MEDIUM' && config.allowMediumConfidenceAutoFix) return true;
  return false;
}

function addBlocker(plan, code) {
  if (!plan.blockers.includes(code)) plan.blockers.push(code);
  plan.safe = false;
}

export function buildRaySecondPassCandidates(rows = [], graph, rawOptions = {}) {
  const config = normalizeRayConfig(rawOptions);
  const disconnectedBranchPorts = collectDisconnectedBranchPorts(graph);

  const candidates = [];
  const diagnostics = [];

  for (const sourcePort of disconnectedBranchPorts) {
    const sourceComponent = componentByTopoId(graph, sourcePort.topoId);
    const rayInfo = deriveBranchRay(sourceComponent, sourcePort);

    if (!rayInfo.ok) {
      diagnostics.push(
        makeDiagnostic({
          severity: 'WARNING',
          code: rayInfo.code || 'RAY2-BRANCH-DIRECTION-MISSING',
          message:
            `Ray 2nd pass skipped ${sourcePort.componentType} row ${sourcePort.rowNo} ` +
            `${sourcePort.role}: ${rayInfo.reason}`,
          port: sourcePort,
          component: sourceComponent,
          details: {
            rayDerivationOk: false,
            rayDerivationReason: rayInfo.reason,
            rayOrigin: rayInfo.origin || null,
          },
        })
      );
      continue;
    }

    diagnostics.push(
      makeDiagnostic({
        severity: 'INFO',
        code: 'RAY2-BRANCH-RAY-DERIVED',
        message:
          `Ray 2nd pass branch ray derived for ${sourcePort.componentType} row ${sourcePort.rowNo} ` +
          `${sourcePort.role}: ${rayInfo.method}, confidence=${rayInfo.confidence}, ` +
          `${rayInfo.sourcePointLabel}, ${rayInfo.referencePointLabel}.`,
        port: sourcePort,
        component: sourceComponent,
        details: {
          rayDerivationOk: true,
          rayMethod: rayInfo.method,
          rayConfidence: rayInfo.confidence,
          rayOrigin: rayInfo.origin,
          rayDirection: rayInfo.direction,
          rayReferencePoint: rayInfo.cp || rayInfo.mainMid || null,
        },
      })
    );

    for (const targetPort of graph.ports || []) {
      if (targetPort.portId === sourcePort.portId) continue;
      if (targetPort.topoId === sourcePort.topoId) continue;
      if (!isFinitePoint(targetPort.point)) continue;
      if (targetPort.pipelineRef !== sourcePort.pipelineRef) continue;

      const projection = projectPointToRay(targetPort.point, rayInfo.origin, rayInfo.direction);
      if (!projection) continue;

      if (projection.distanceAlongRayMm <= config.connectToleranceMm) continue;
      if (projection.distanceAlongRayMm > config.maxRayLengthMm) continue;
      if (projection.perpendicularMissMm > config.perpendicularToleranceMm) continue;

      const targetRow = findRowByTopoId(rows, graph, targetPort.topoId);
      const targetIsPipeEndpoint = !!targetPort.isPipeEndpoint && isPipe(targetRow);
      const rayConfidenceAllowsAuto = sourceCanAutoApply(rayInfo, config);

      const blockers = [];

      if (!targetIsPipeEndpoint) blockers.push('TARGET_NOT_PIPE_ENDPOINT');
      if (!rayConfidenceAllowsAuto) blockers.push('RAY_CONFIDENCE_NOT_AUTO_FIXABLE');

      const safeForAutoApply = blockers.length === 0;

      candidates.push({
        candidateId: `RAY2-${sourcePort.portId}-${targetPort.portId}`,
        kind: 'RAY_SECOND_PASS_BRANCH_CONNECTION',

        sourcePortId: sourcePort.portId,
        sourceTopoId: sourcePort.topoId,
        sourceRowNo: sourcePort.rowNo,
        sourceType: sourcePort.componentType,
        sourceRole: sourcePort.role,
        sourcePointKey: sourcePort.pointKey,
        sourcePoint: clonePoint(sourcePort.point),
        sourceRefNo: sourcePort.refNo,
        sourceSeqNo: sourcePort.seqNo,
        sourceLineNo: sourcePort.lineNo,

        targetPortId: targetPort.portId,
        targetTopoId: targetPort.topoId,
        targetRowNo: targetPort.rowNo,
        targetType: targetPort.componentType,
        targetRole: targetPort.role,
        targetPointKey: targetPort.pointKey,
        targetPoint: clonePoint(targetPort.point),
        targetRefNo: targetPort.refNo,
        targetSeqNo: targetPort.seqNo,
        targetLineNo: targetPort.lineNo,

        pipelineRef: sourcePort.pipelineRef,

        rayMethod: rayInfo.method,
        rayConfidence: rayInfo.confidence,
        rayOrigin: clonePoint(rayInfo.origin),
        rayDirection: rayInfo.direction,
        rayReferencePoint: rayInfo.cp || rayInfo.mainMid || null,

        distanceAlongRayMm: round3(projection.distanceAlongRayMm),
        perpendicularMissMm: round3(projection.perpendicularMissMm),
        projectedPoint: projection.projected,

        targetIsPipeEndpoint,
        safeForAutoApply,
        blockers,

        futureAction: targetIsPipeEndpoint
          ? 'MOVE_PIPE_ENDPOINT_TO_BRANCH_PORT'
          : 'MANUAL_REVIEW_FIXED_TARGET',
      });
    }
  }

  const deduped = [];
  const seen = new Set();

  for (const candidate of sortCandidates(candidates)) {
    const key = candidateKey(candidate);
    if (seen.has(key)) continue;

    seen.add(key);
    deduped.push(candidate);
  }

  return {
    schema: 'rvm-pcf-ray-second-pass/candidates/v2',
    config,
    candidates: deduped,
    diagnostics,
    summary: {
      disconnectedBranchPortCount: disconnectedBranchPorts.length,
      rayCandidateCount: deduped.length,
      safeCandidateCount: deduped.filter(c => c.safeForAutoApply).length,
      blockedCandidateCount: deduped.filter(c => !c.safeForAutoApply).length,
      highConfidenceCandidateCount: deduped.filter(c => c.rayConfidence === 'HIGH').length,
      mediumConfidenceCandidateCount: deduped.filter(c => c.rayConfidence === 'MEDIUM').length,
      maxRayLengthMm: config.maxRayLengthMm,
      perpendicularToleranceMm: config.perpendicularToleranceMm,
      allowMediumConfidenceAutoFix: config.allowMediumConfidenceAutoFix,
    },
  };
}

function groupCandidatesBySource(candidates) {
  const bySource = new Map();

  for (const candidate of sortCandidates(candidates || [])) {
    if (!bySource.has(candidate.sourcePortId)) {
      bySource.set(candidate.sourcePortId, []);
    }

    bySource.get(candidate.sourcePortId).push(candidate);
  }

  return bySource;
}

function isAmbiguousSourceCandidate(sourceCandidates) {
  if (!sourceCandidates || sourceCandidates.length <= 1) return false;

  const safe = sourceCandidates.filter(c => c.safeForAutoApply);
  if (safe.length <= 1) return false;

  const first = safe[0];
  const second = safe[1];

  const rayDelta = Math.abs(
    Number(first.distanceAlongRayMm || 0) - Number(second.distanceAlongRayMm || 0)
  );

  const missDelta = Math.abs(
    Number(first.perpendicularMissMm || 0) - Number(second.perpendicularMissMm || 0)
  );

  return rayDelta <= 1 && missDelta <= 1;
}

export function createRaySecondPassFixPlan(rows = [], graph, rayResult, rawOptions = {}) {
  const config = normalizeRayConfig(rawOptions);
  const plans = [];
  const usedPipeEndpoint = new Set();

  const bySource = groupCandidatesBySource(rayResult?.candidates || []);

  for (const [sourcePortId, sourceCandidates] of bySource.entries()) {
    const best = sourceCandidates[0];
    const ambiguous = isAmbiguousSourceCandidate(sourceCandidates);
    const targetRow = findRowByTopoId(rows, graph, best.targetTopoId);

    const plan = {
      planId: `RAY2-FIX-${plans.length + 1}`,
      kind: 'RAY_SECOND_PASS',
      action: 'MOVE_PIPE_ENDPOINT_TO_BRANCH_PORT',
      candidateId: best.candidateId,

      sourcePortId,
      sourceTopoId: best.sourceTopoId,
      sourceRowNo: best.sourceRowNo,
      sourceType: best.sourceType,
      sourceRole: best.sourceRole,
      sourcePoint: clonePoint(best.sourcePoint),
      sourceRefNo: best.sourceRefNo,
      sourceSeqNo: best.sourceSeqNo,
      sourceLineNo: best.sourceLineNo,

      pipeTopoId: best.targetTopoId,
      pipeRowNo: best.targetRowNo,
      pipePointKey: best.targetPointKey,
      before: clonePoint(best.targetPoint),
      after: clonePoint(best.sourcePoint),

      distanceAlongRayMm: best.distanceAlongRayMm,
      perpendicularMissMm: best.perpendicularMissMm,
      rayMethod: best.rayMethod,
      rayConfidence: best.rayConfidence,
      rayOrigin: clonePoint(best.rayOrigin),
      rayDirection: best.rayDirection,
      rayReferencePoint: best.rayReferencePoint || null,

      pipelineRef: best.pipelineRef,
      safe: true,
      blockers: [],
      alternativeCandidateCount: Math.max(0, sourceCandidates.length - 1),
    };

    if (ambiguous) addBlocker(plan, 'AMBIGUOUS_MULTIPLE_RAY_HITS');
    if (!best.safeForAutoApply) addBlocker(plan, 'CANDIDATE_NOT_SAFE');

    if (best.blockers?.length) {
      for (const blocker of best.blockers) addBlocker(plan, blocker);
    }

    if (!targetRow || !isPipe(targetRow)) addBlocker(plan, 'TARGET_NOT_PIPE');
    if (!['ep1', 'ep2'].includes(best.targetPointKey)) addBlocker(plan, 'TARGET_NOT_PIPE_ENDPOINT');
    if (Number(best.distanceAlongRayMm) > config.maxRayLengthMm) addBlocker(plan, 'ABOVE_RAY_MAX_LENGTH');

    if (Number(best.perpendicularMissMm) > config.perpendicularToleranceMm) {
      addBlocker(plan, 'ABOVE_PERPENDICULAR_TOLERANCE');
    }

    const endpointKey = `${best.targetTopoId}:${best.targetPointKey}`;

    if (usedPipeEndpoint.has(endpointKey)) {
      addBlocker(plan, 'PIPE_ENDPOINT_HAS_MULTIPLE_RAY_FIXES');
    }

    const newLength = targetRow
      ? pipeLengthAfterMove(targetRow, best.targetPointKey, best.sourcePoint)
      : null;

    if (newLength == null || newLength < config.minPipeLengthMm) {
      addBlocker(plan, 'PIPE_ZERO_LENGTH_RISK');
    }

    if (plan.safe) usedPipeEndpoint.add(endpointKey);

    plans.push(plan);
  }

  return {
    schema: 'rvm-pcf-ray-second-pass/fix-plan/v2',
    summary: {
      planCount: plans.length,
      safePlanCount: plans.filter(p => p.safe).length,
      blockedPlanCount: plans.filter(p => !p.safe).length,
      highConfidencePlanCount: plans.filter(p => p.rayConfidence === 'HIGH').length,
      mediumConfidencePlanCount: plans.filter(p => p.rayConfidence === 'MEDIUM').length,
      maxRayLengthMm: config.maxRayLengthMm,
      perpendicularToleranceMm: config.perpendicularToleranceMm,
      allowMediumConfidenceAutoFix: config.allowMediumConfidenceAutoFix,
    },
    plans,
  };
}

function applyPlan(clonedRows, graph, plan) {
  if (!plan.safe) return false;

  const pipeRow = findRowByTopoId(clonedRows, graph, plan.pipeTopoId);
  if (!pipeRow || !isPipe(pipeRow)) return false;

  return setRowPoint(pipeRow, plan.pipePointKey, plan.after);
}

function fatalCount(graph) {
  return (graph?.diagnostics || []).filter(d => d.severity === 'ERROR').length;
}

export function applyRaySecondPassTransaction(rows = [], graph, fixPlan, rawOptions = {}) {
  const config = normalizeRayConfig(rawOptions);
  const beforeGraph = graph || buildPcfTopoGraph(rows, config);
  const clonedRows = cloneRows(rows);

  const safePlans = (fixPlan?.plans || []).filter(p => p.safe);
  const applied = [];

  for (const plan of safePlans) {
    if (applyPlan(clonedRows, beforeGraph, plan)) {
      applied.push(plan);
    }
  }

  const afterGraph = buildPcfTopoGraph(clonedRows, config);

  const report = {
    schema: 'rvm-pcf-ray-second-pass/transaction/v2',
    committed: false,

    attemptedFixCount: safePlans.length,
    appliedFixCount: applied.length,

    highConfidenceAppliedCount: applied.filter(p => p.rayConfidence === 'HIGH').length,
    mediumConfidenceAppliedCount: applied.filter(p => p.rayConfidence === 'MEDIUM').length,

    maxRayLengthMm: config.maxRayLengthMm,
    perpendicularToleranceMm: config.perpendicularToleranceMm,
    allowMediumConfidenceAutoFix: config.allowMediumConfidenceAutoFix,

    fittingMovedCount: 0,
    fittingTrimmedCount: 0,
    pipeEndpointModifiedCount: applied.length,
    bridgePipeInjectedCount: 0,

    beforeFatalIssueCount: fatalCount(beforeGraph),
    afterFatalIssueCount: fatalCount(afterGraph),
    newFatalIssueCount: Math.max(0, fatalCount(afterGraph) - fatalCount(beforeGraph)),

    beforeTeeIssueCount: beforeGraph.stats?.teeIssueCount || 0,
    afterTeeIssueCount: afterGraph.stats?.teeIssueCount || 0,
    newTeeIssueCount: Math.max(
      0,
      (afterGraph.stats?.teeIssueCount || 0) - (beforeGraph.stats?.teeIssueCount || 0)
    ),

    beforeOletIssueCount: beforeGraph.stats?.oletIssueCount || 0,
    afterOletIssueCount: afterGraph.stats?.oletIssueCount || 0,
    newOletIssueCount: Math.max(
      0,
      (afterGraph.stats?.oletIssueCount || 0) - (beforeGraph.stats?.oletIssueCount || 0)
    ),

    rejectReasons: [],
    appliedPlans: applied,
  };

  if (report.attemptedFixCount === 0) report.rejectReasons.push('NO_SAFE_RAY2_PLANS');
  if (report.appliedFixCount !== report.attemptedFixCount) report.rejectReasons.push('NOT_ALL_RAY2_PLANS_APPLIED');
  if (report.newFatalIssueCount > 0) report.rejectReasons.push('NEW_FATAL_TOPOLOGY_ISSUES');
  if (report.newTeeIssueCount > 0) report.rejectReasons.push('NEW_TEE_ISSUES');
  if (report.newOletIssueCount > 0) report.rejectReasons.push('NEW_OLET_ISSUES');

  if (report.fittingMovedCount > 0 || report.fittingTrimmedCount > 0) {
    report.rejectReasons.push('FITTING_MUTATION_DETECTED');
  }

  report.committed = report.rejectReasons.length === 0;

  return {
    rows: report.committed ? clonedRows : rows,
    beforeGraph,
    afterGraph,
    transactionReport: report,
  };
}
