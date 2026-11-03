import { scaledTolerance } from '../auto-pipe/profile.js';
import { deriveBoundaryLoops } from '../zone-geometry/boundary-loops.js';
import { fitBoundaryCircleLocal } from '../zone-geometry/circle-fit.js';
import { buildSolidFittingAnalysisTopology } from './analysis-topology.js?v=20260729-fbx2-direct-pipe-1';

function subtract(left, right) {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}
function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}
function distance(left, right) { return Math.hypot(...subtract(left, right)); }
function loopIndices(loop) {
  const indices = loop.orderedTopology.windingVertexIndices;
  return indices.length > 1 && indices[0] === indices.at(-1) ? indices.slice(0, -1) : indices;
}
function loopPoints(topology, loop) { return loopIndices(loop).map((index) => topology.points[index]); }
function shellPointIndices(shell) {
  return [...new Set(shell.faces.flatMap((face) => face.vertices))].sort((a, b) => a - b);
}
function planeResidual(topology, shell, fit) {
  return Math.max(...shellPointIndices(shell).map((index) => Math.abs(dot(
    subtract(topology.points[index], fit.centre), fit.normal))));
}
function circleFit(topology, loop) {
  const fit = fitBoundaryCircleLocal(loopPoints(topology, loop));
  return fit.rejectionReasons.length ? null : fit;
}
function loopByShell(loops) {
  const result = new Map();
  for (const loop of loops) {
    const entries = result.get(loop.shellId) || []; entries.push(loop); result.set(loop.shellId, entries);
  }
  return result;
}
function planarRoles(topology, shells, fits, tolerance) {
  const records = shells.map((shell) => ({ shell, fit: fits.get(shell.shellId),
    residual: planeResidual(topology, shell, fits.get(shell.shellId)) }));
  const planar = records.filter((item) => item.residual <= tolerance);
  const spatial = records.filter((item) => item.residual > tolerance);
  return planar.length === 1 && spatial.length === 1
    ? { cap: planar[0], body: spatial[0] } : null;
}
function nearestPairs(capPoints, bodyPoints) {
  const used = new Set(), pairs = [];
  for (let capIndex = 0; capIndex < capPoints.length; capIndex += 1) {
    const ranked = bodyPoints.map((point, bodyIndex) => ({ bodyIndex,
      residual: distance(capPoints[capIndex], point) }))
      .filter((item) => !used.has(item.bodyIndex))
      .sort((left, right) => left.residual - right.residual || left.bodyIndex - right.bodyIndex);
    if (!ranked.length) return null;
    used.add(ranked[0].bodyIndex); pairs.push({ capIndex, ...ranked[0] });
  }
  return pairs;
}
function compatibleRings(cap, body, profile) {
  const radiusScale = Math.max(cap.fit.radius, body.fit.radius);
  const radiusTolerance = scaledTolerance(profile.radiusAbsoluteMm, profile.radiusRatio, radiusScale);
  const radiusResidual = Math.abs(cap.fit.radius - body.fit.radius);
  const centreSeparationMm = distance(cap.fit.centre, body.fit.centre);
  const normalDot = Math.abs(dot(cap.fit.normal, body.fit.normal));
  const capPoints = cap.points, bodyPoints = body.points;
  if (capPoints.length !== bodyPoints.length || capPoints.length < 3) return null;
  const pairs = nearestPairs(capPoints, bodyPoints);
  const maximumVertexPairResidualMm = pairs ? Math.max(...pairs.map((item) => item.residual)) : Infinity;
  const valid = radiusResidual <= radiusTolerance
    && centreSeparationMm <= profile.terminalCapBridgeAbsoluteMm
    && normalDot >= 1 - profile.coAxialDotTolerance
    && maximumVertexPairResidualMm <= profile.terminalCapBridgeAbsoluteMm;
  return valid ? { radiusResidualMm: radiusResidual, centreSeparationMm,
    maximumVertexPairResidualMm, pairedVertexCount: pairs.length } : null;
}
function loopRecord(topology, shell, loop, fit) {
  return { shell, loop, fit, points: loopPoints(topology, loop) };
}
function bridgeEvidence(roles, compatibility, projection) {
  return Object.freeze({
    method: 'DETACHED_CAP_RING_BRIDGE_V1', disposition: 'APPLIED',
    toleranceMm: projection.evidence.toleranceMm,
    capShellId: roles.cap.shell.shellId, bodyShellId: roles.body.shell.shellId,
    capBoundaryLoopId: roles.cap.loop.boundaryLoopId,
    bodyBoundaryLoopId: roles.body.loop.boundaryLoopId,
    ...compatibility,
    bridgedMergedVertexCount: projection.evidence.mergedVertexCount,
    bridgedDuplicateFaceCount: projection.evidence.duplicateFaceIds.length,
  });
}

export async function bridgeDetachedTerminalCap(rawTopology, baseTopology, shells, profile) {
  if (shells.length !== 2 || shells.some((shell) => shell.rejectionReasons.length)) return null;
  const loops = await deriveBoundaryLoops(baseTopology, shells), byShell = loopByShell(loops);
  if (loops.length !== 2 || shells.some((shell) => byShell.get(shell.shellId)?.length !== 1)) return null;
  const fits = new Map();
  for (const loop of loops) {
    const fit = circleFit(baseTopology, loop); if (!fit) return null; fits.set(loop.shellId, fit);
  }
  const roles = planarRoles(baseTopology, shells, fits, profile.terminalCapBridgeAbsoluteMm);
  if (!roles) return null;
  roles.cap = loopRecord(baseTopology, roles.cap.shell,
    byShell.get(roles.cap.shell.shellId)[0], roles.cap.fit);
  roles.body = loopRecord(baseTopology, roles.body.shell,
    byShell.get(roles.body.shell.shellId)[0], roles.body.fit);
  const compatibility = compatibleRings(roles.cap, roles.body, profile);
  if (!compatibility) return null;
  const bridgeProfile = { ...profile, vertexMergeAbsoluteMm: profile.terminalCapBridgeAbsoluteMm,
    vertexMergeRelativeTolerance: 0 };
  const projection = buildSolidFittingAnalysisTopology(rawTopology, bridgeProfile);
  return Object.freeze({ topology: projection.topology,
    evidence: bridgeEvidence(roles, compatibility, projection) });
}
