import {
  normalizeTopoConfig,
  distance,
  round3,
  projectPointToSegment,
  pointOnSegment,
  topoDiagnostic,
} from './RvmPcfTopoTypes.js';

import { buildPcfTopoFromRows } from './RvmPcfTopoFromRowsAdapter.js';

/**
 * Read-only PCF topology graph builder.
 *
 * Produces:
 * - exact endpoint connections
 * - OLET segment tap connections
 * - gap candidates
 * - overlap candidates
 * - required-port issues
 *
 * It does not mutate rows.
 */

function samePipeline(a, b) {
  return String(a?.pipelineRef || '') === String(b?.pipelineRef || '');
}

function isOletHeaderTap(port) {
  return port?.role === 'OLET_HEADER_TAP';
}

function isEndpointPort(port) {
  return !port?.connectsToSegment;
}

function isPipeEndpoint(port) {
  return !!port?.isPipeEndpoint;
}

function isRequired(port) {
  return port?.required !== false;
}

function roleCompatibleForEndpoint(a, b) {
  if (!a || !b) return false;
  if (a.portId === b.portId) return false;
  if (a.topoId === b.topoId) return false;
  if (!samePipeline(a, b)) return false;

  if (isOletHeaderTap(a) || isOletHeaderTap(b)) return false;
  if (!isEndpointPort(a) || !isEndpointPort(b)) return false;

  return true;
}

function roleCompatibleForFutureGapFix(a, b) {
  if (!roleCompatibleForEndpoint(a, b)) return false;

  // Gap/overlap fix must have at least one pipe endpoint.
  return isPipeEndpoint(a) || isPipeEndpoint(b);
}

function sortedByDistanceThenIds(items) {
  return [...items].sort((a, b) => {
    const d = (a.distanceMm ?? 0) - (b.distanceMm ?? 0);
    if (Math.abs(d) > 1e-9) return d;

    const ar = Number(a.sourceRowNo ?? a.pipeRowNo ?? 0);
    const br = Number(b.sourceRowNo ?? b.pipeRowNo ?? 0);
    if (ar !== br) return ar - br;

    return String(a.candidateId || '').localeCompare(String(b.candidateId || ''));
  });
}

function edgeCandidateBase(kind, a, b, distanceMm, extra = {}) {
  return {
    candidateId: `C-${kind}-${a.portId}-${b?.portId || extra.targetSegmentId || 'SEG'}`,
    kind,
    sourcePortId: a.portId,
    targetPortId: b?.portId || null,
    sourceTopoId: a.topoId,
    targetTopoId: b?.topoId || null,
    sourceRowNo: a.rowNo,
    targetRowNo: b?.rowNo ?? null,
    sourceRole: a.role,
    targetRole: b?.role ?? null,
    distanceMm: round3(distanceMm),
    pipelineRef: a.pipelineRef,
    legal: true,
    blockers: [],
    ...extra,
  };
}

function acceptExactEndpointEdges(candidates, ports) {
  const accepted = [];
  const used = new Set();

  const byPort = new Map(ports.map(port => [port.portId, port]));

  for (const candidate of sortedByDistanceThenIds(candidates)) {
    const a = byPort.get(candidate.sourcePortId);
    const b = byPort.get(candidate.targetPortId);

    if (!a || !b) continue;
    if (used.has(a.portId) || used.has(b.portId)) continue;

    used.add(a.portId);
    used.add(b.portId);

    accepted.push({
      edgeId: `E-${accepted.length + 1}`,
      kind: 'EXACT_ENDPOINT_CONNECTION',
      sourcePortId: a.portId,
      targetPortId: b.portId,
      sourceRowNo: a.rowNo,
      targetRowNo: b.rowNo,
      distanceMm: candidate.distanceMm,
      pipelineRef: a.pipelineRef,
    });
  }

  return { accepted, used };
}

function findOletSegmentTaps(ports, segments, config) {
  const candidates = [];
  const accepted = [];
  const issues = [];

  const headerTaps = ports.filter(port => port.role === 'OLET_HEADER_TAP');

  for (const tap of headerTaps) {
    let best = null;

    for (const segment of segments) {
      if (segment.topoId === tap.topoId) continue;
      if (segment.pipelineRef !== tap.pipelineRef) continue;

      const projection = projectPointToSegment(tap.point, segment.a, segment.b);
      if (!projection) continue;
      if (projection.tRaw < -0.001 || projection.tRaw > 1.001) continue;

      if (!best || projection.distanceMm < best.projection.distanceMm) {
        best = { segment, projection };
      }
    }

    if (best && best.projection.distanceMm <= config.connectToleranceMm) {
      const candidate = {
        candidateId: `C-OLET-SEGMENT-${tap.portId}-${best.segment.segmentId}`,
        kind: 'OLET_SEGMENT_TAP',
        sourcePortId: tap.portId,
        targetSegmentId: best.segment.segmentId,
        sourceRowNo: tap.rowNo,
        targetRowNo: best.segment.rowNo,
        sourceRole: tap.role,
        distanceMm: round3(best.projection.distanceMm),
        projectionT: round3(best.projection.t),
        pipelineRef: tap.pipelineRef,
        legal: true,
        blockers: [],
      };

      candidates.push(candidate);

      accepted.push({
        edgeId: `E-OLET-${accepted.length + 1}`,
        kind: 'OLET_SEGMENT_TAP',
        sourcePortId: tap.portId,
        targetSegmentId: best.segment.segmentId,
        sourceRowNo: tap.rowNo,
        targetRowNo: best.segment.rowNo,
        distanceMm: candidate.distanceMm,
        projectionT: candidate.projectionT,
        pipelineRef: tap.pipelineRef,
      });

      continue;
    }

    issues.push(
      topoDiagnostic({
        severity: 'ERROR',
        code: 'TOPO-OLET-HEADER-TAP-DISCONNECTED',
        message: `OLET header tap row ${tap.rowNo} is not on a header pipe segment.`,
        port: tap,
        details: {
          nearestDistanceMm: best ? round3(best.projection.distanceMm) : null,
        },
      })
    );
  }

  return { candidates, accepted, issues };
}

function findEndpointCandidates(ports, config) {
  const exact = [];
  const gap = [];
  const crossPipelineNear = [];

  for (let i = 0; i < ports.length; i += 1) {
    const a = ports[i];

    for (let j = i + 1; j < ports.length; j += 1) {
      const b = ports[j];

      if (a.topoId === b.topoId) continue;

      const d = distance(a.point, b.point);
      if (d == null) continue;

      if (a.pipelineRef !== b.pipelineRef) {
        if (d <= config.fixToleranceMm) {
          crossPipelineNear.push(
            edgeCandidateBase('CROSS_PIPELINE_NEAR', a, b, d, {
              legal: false,
              blockers: ['CROSS_PIPELINE'],
            })
          );
        }
        continue;
      }

      if (!roleCompatibleForEndpoint(a, b)) continue;

      if (d <= config.connectToleranceMm) {
        exact.push(edgeCandidateBase('EXACT_ENDPOINT_CONNECTION', a, b, d));
        continue;
      }

      if (d <= config.fixToleranceMm && roleCompatibleForFutureGapFix(a, b)) {
        gap.push(
          edgeCandidateBase('GAP_CANDIDATE', a, b, d, {
            futureAction: 'MOVE_PIPE_ENDPOINT_ONLY',
            safeForFutureFix: true,
          })
        );
      }
    }
  }

  return { exact, gap, crossPipelineNear };
}

function findOverlapCandidates(ports, segments, config) {
  const candidates = [];

  const fittingPorts = ports.filter(port => {
    if (isOletHeaderTap(port)) return false;
    if (port.isPipeEndpoint) return false;
    return isEndpointPort(port);
  });

  for (const segment of segments) {
    for (const port of fittingPorts) {
      if (segment.topoId === port.topoId) continue;
      if (segment.pipelineRef !== port.pipelineRef) continue;

      const projection = pointOnSegment(port.point, segment.a, segment.b, config.connectToleranceMm);
      if (!projection) continue;

      const dToA = distance(port.point, segment.a);
      const dToB = distance(port.point, segment.b);

      const nearestPointKey = dToA <= dToB ? 'ep1' : 'ep2';
      const trimMm = Math.min(dToA, dToB);

      if (trimMm <= config.connectToleranceMm) continue;
      if (trimMm > config.fixToleranceMm) continue;

      candidates.push({
        candidateId: `C-OVERLAP-${segment.segmentId}-${port.portId}`,
        kind: 'OVERLAP_CANDIDATE',
        pipeTopoId: segment.topoId,
        pipeRowNo: segment.rowNo,
        pipePointKey: nearestPointKey,
        fittingTopoId: port.topoId,
        fittingRowNo: port.rowNo,
        fittingPointKey: port.pointKey,
        fittingRole: port.role,
        targetPoint: port.point,
        trimMm: round3(trimMm),
        pipelineRef: segment.pipelineRef,
        futureAction: 'TRIM_PIPE_ENDPOINT_ONLY',
        safeForFutureFix: true,
        legal: true,
        blockers: [],
      });
    }
  }

  return candidates;
}

function buildDisconnectedIssues(ports, acceptedEndpointEdges, acceptedSegmentTaps, config) {
  const connectedPorts = new Set();

  for (const edge of acceptedEndpointEdges) {
    connectedPorts.add(edge.sourcePortId);
    connectedPorts.add(edge.targetPortId);
  }

  for (const edge of acceptedSegmentTaps) {
    connectedPorts.add(edge.sourcePortId);
  }

  const issues = [];
  const terminals = [];

  for (const port of ports) {
    if (connectedPorts.has(port.portId)) continue;

    if (port.isPipeEndpoint) {
      terminals.push({
        portId: port.portId,
        rowNo: port.rowNo,
        role: port.role,
        pipelineRef: port.pipelineRef,
        reason: 'TERMINAL_PIPE_END',
      });
      continue;
    }

    if (!isRequired(port)) continue;

    let code = 'TOPO-PORT-DISCONNECTED';

    if (port.role === 'TEE_MAIN_1' || port.role === 'TEE_MAIN_2') {
      code = 'TOPO-TEE-MAIN-DISCONNECTED';
    }

    if (port.role === 'TEE_BRANCH') {
      code = 'TOPO-TEE-BRANCH-DISCONNECTED';
    }

    if (port.role === 'OLET_HEADER_TAP') {
      code = 'TOPO-OLET-HEADER-TAP-DISCONNECTED';
    }

    if (port.role === 'OLET_BRANCH') {
      code = 'TOPO-OLET-BRANCH-DISCONNECTED';
    }

    issues.push(
      topoDiagnostic({
        severity: 'ERROR',
        code,
        port,
        details: {
          disconnectedPortRole: port.role,
          disconnectedPointKey: port.pointKey,
          disconnectedPoint: port.point,
        },
      })
    );
  }

  return { issues, terminals };
}

export function buildPcfTopoGraph(rowsOrTopo, rawOptions = {}) {
  const config = normalizeTopoConfig(rawOptions);

  const topo = Array.isArray(rowsOrTopo)
    ? buildPcfTopoFromRows(rowsOrTopo, config)
    : rowsOrTopo;

  const endpointCandidates = findEndpointCandidates(topo.ports, config);
  const acceptedEndpoint = acceptExactEndpointEdges(endpointCandidates.exact, topo.ports);

  const oletSegment = findOletSegmentTaps(topo.ports, topo.segments, config);
  const overlapCandidates = findOverlapCandidates(topo.ports, topo.segments, config);

  const disconnected = buildDisconnectedIssues(
    topo.ports,
    acceptedEndpoint.accepted,
    oletSegment.accepted,
    config
  );

  const diagnostics = [
    ...(topo.diagnostics || []),
    ...(oletSegment.issues || []),
    ...(disconnected.issues || []),
  ];

  const teeIssueCount = diagnostics.filter(d => String(d.code || '').includes('TEE')).length;
  const oletIssueCount = diagnostics.filter(d => String(d.code || '').includes('OLET')).length;

  const stats = {
    ...topo.stats,
    connectToleranceMm: config.connectToleranceMm,
    fixToleranceMm: config.fixToleranceMm,

    exactEndpointConnectionCount: acceptedEndpoint.accepted.length,
    oletSegmentTapCount: oletSegment.accepted.length,

    gapCandidateCount: endpointCandidates.gap.length,
    overlapCandidateCount: overlapCandidates.length,

    teeIssueCount,
    oletIssueCount,
    unresolvedRequiredPortCount: disconnected.issues.length,

    terminalPipeEndCount: disconnected.terminals.length,
    crossPipelineCandidateCount: endpointCandidates.crossPipelineNear.length,

    ambiguousAutoAcceptedCount: 0,
    crossPipelineAutoAcceptedCount: 0,
    fittingMovedCount: 0,
    fittingTrimmedCount: 0,
    pipeEndpointModifiedCount: 0,
    rowMutationCount: 0,
  };

  return {
    schema: 'rvm-pcf-topology/graph/v1',
    config,
    components: topo.components,
    ports: topo.ports,
    segments: topo.segments,
    candidates: [
      ...endpointCandidates.exact,
      ...endpointCandidates.gap,
      ...oletSegment.candidates,
      ...overlapCandidates,
      ...endpointCandidates.crossPipelineNear,
    ],
    acceptedEdges: [
      ...acceptedEndpoint.accepted,
      ...oletSegment.accepted,
    ],
    gapCandidates: endpointCandidates.gap,
    overlapCandidates,
    crossPipelineCandidates: endpointCandidates.crossPipelineNear,
    terminals: disconnected.terminals,
    diagnostics,
    stats,
    pass: diagnostics.filter(d => d.severity === 'ERROR').length === 0,
  };
}