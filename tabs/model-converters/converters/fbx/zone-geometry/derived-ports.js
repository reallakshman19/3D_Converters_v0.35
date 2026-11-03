import { FBX_DERIVED_PORT_SCHEMA, FBX_DERIVED_PORT_TOLERANCE_PROFILE,
  ZONE_GEOMETRY_STATUS, REJECTION_REASON_ORDER } from './constants.js';
import { compareDecimalId, compareOccurrenceId, compareText } from './compare.js';
import { artifactWithId, evidenceId } from './identity.js';
import { decodeExactPolygonTopology } from './polygon-topology.js';
import { deriveConnectedShells } from './shells.js';
import { deriveBoundaryLoops } from './boundary-loops.js';
import { fitBoundaryCircleLocal } from './circle-fit.js';
import { transformBoundaryFit } from './occurrence-transform.js';

function reasonRank(value) {
  const index = REJECTION_REASON_ORDER.indexOf(value);
  return index < 0 ? REJECTION_REASON_ORDER.length : index;
}

function orderedReasons(values) {
  return [...new Set(values)].sort((a, b) => reasonRank(a) - reasonRank(b) || compareText(a, b));
}

function localLoopPoints(topology, loop) {
  const indices = loop.orderedTopology.windingVertexIndices;
  const open = indices.length > 1 && indices[0] === indices.at(-1) ? indices.slice(0, -1) : indices;
  return open.map((index) => topology.points[index]);
}

function baseCandidate(parentId, occurrence, topology, loop) {
  return {
    sourceZoneGeometryArtifactId: parentId,
    sourceOccurrenceId: occurrence.sourceOccurrenceId,
    geometryObjectId: topology.geometryObjectId,
    shellId: loop.shellId,
    boundaryLoopId: loop.boundaryLoopId,
    orderedTopology: loop.orderedTopology,
  };
}

function rejectedCandidate(base, status, reasons, fit = {}) {
  return {
    ...base, centreMm: fit.centreMm || null, normal: fit.normal || null,
    radiusMm: fit.radiusMm ?? null, diameterMm: fit.diameterMm ?? null,
    planarityResidualMm: fit.planarityResidualMm ?? null,
    circularResidualMm: fit.circularResidualMm ?? null,
    tolerancesMm: fit.tolerancesMm || null,
    orientationRule: fit.orientationRule || null,
    transformDisposition: fit.transformDisposition || null,
    admissionDisposition: 'REJECTED', status, rejectionReasons: orderedReasons(reasons),
  };
}

function admittedCandidate(base, transformed) {
  return { ...base, centreMm: transformed.centreMm, normal: transformed.normal,
    radiusMm: transformed.radiusMm, diameterMm: transformed.diameterMm,
    planarityResidualMm: transformed.planarityResidualMm,
    circularResidualMm: transformed.circularResidualMm,
    tolerancesMm: transformed.tolerancesMm, orientationRule: transformed.orientationRule,
    transformDisposition: transformed.transformDisposition, admissionDisposition: 'ADMITTED',
    status: 'DERIVED_PORT_ADMITTED', rejectionReasons: [] };
}

async function withPortId(candidate) {
  const portEvidenceId = await evidenceId('FbxDerivedPortCandidate.v1', 'port-evidence', candidate);
  return { portEvidenceId, ...candidate };
}

async function candidateFor(parentId, occurrence, topology, loop) {
  const base = baseCandidate(parentId, occurrence, topology, loop);
  if (loop.rejectionReasons.length) return withPortId(rejectedCandidate(base,
    ZONE_GEOMETRY_STATUS.LOOP, loop.rejectionReasons));
  const points = localLoopPoints(topology, loop), fit = fitBoundaryCircleLocal(points);
  if (fit.rejectionReasons.length) return withPortId(rejectedCandidate(base,
    ZONE_GEOMETRY_STATUS.FIT, fit.rejectionReasons));
  const transformed = transformBoundaryFit(occurrence, fit, points);
  if (transformed.rejectionReasons.length) return withPortId(rejectedCandidate(base,
    ZONE_GEOMETRY_STATUS.FIT, transformed.rejectionReasons, transformed));
  return withPortId(admittedCandidate(base, transformed));
}

function relevantOccurrences(scope, geometryObjectId) {
  return scope.selectedOccurrences.filter((item) => item.geometryObjectIds.includes(geometryObjectId))
    .sort((a, b) => compareOccurrenceId(a.sourceOccurrenceId, b.sourceOccurrenceId));
}

async function geometryCandidates(parentId, scope, selection) {
  const topology = decodeExactPolygonTopology(selection);
  const shells = await deriveConnectedShells(topology);
  const loops = await deriveBoundaryLoops(topology, shells);
  const candidates = [];
  for (const occurrence of relevantOccurrences(scope, topology.geometryObjectId)) {
    for (const loop of loops) candidates.push(await candidateFor(parentId, occurrence, topology, loop));
  }
  return candidates;
}

function rejectionCounts(candidates) {
  const counts = {};
  for (const candidate of candidates) for (const reason of candidate.rejectionReasons) {
    counts[reason] = (counts[reason] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => reasonRank(a[0]) - reasonRank(b[0])
    || compareText(a[0], b[0])));
}

export async function buildDerivedPortEvidence(zoneArtifact, scope, selections) {
  const candidates = [];
  for (const selection of selections) candidates.push(...await geometryCandidates(
    zoneArtifact.artifactId, scope, selection));
  candidates.sort((a, b) => compareOccurrenceId(a.sourceOccurrenceId, b.sourceOccurrenceId)
    || compareDecimalId(a.geometryObjectId, b.geometryObjectId) || compareText(a.shellId, b.shellId)
    || compareText(a.boundaryLoopId, b.boundaryLoopId));
  const admittedPortCount = candidates.filter((item) => item.admissionDisposition === 'ADMITTED').length;
  return artifactWithId(FBX_DERIVED_PORT_SCHEMA, 'fbx-derived-port-evidence', {
    sourceZoneGeometryArtifactId: zoneArtifact.artifactId,
    toleranceProfile: FBX_DERIVED_PORT_TOLERANCE_PROFILE,
    classificationDisposition: 'NOT_PERFORMED',
    connectivityDisposition: 'NOT_PERFORMED',
    candidateCount: candidates.length,
    admittedPortCount,
    rejectedPortCount: candidates.length - admittedPortCount,
    rejectionCounts: rejectionCounts(candidates),
    candidates,
  });
}
