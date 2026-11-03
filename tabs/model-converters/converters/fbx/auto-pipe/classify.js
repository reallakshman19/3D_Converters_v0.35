import { compareOccurrenceId } from './identity.js';
import {
  assignRoles, cylinderResiduals, radiusMatches, worldControlPoints,
} from './pipe-admission-gates.js';
import { AUTO_PIPE_PROFILE } from './profile.js';
import { classifySolidFittingPipeOccurrence } from '../solid-fitting-ports/classifier.js?v=20260729-fbx2-direct-pipe-1';

function fail(occurrence, reason, detail) {
  return Object.freeze({
    admitted: false,
    status: 'BLOCKED_AUTO_PIPE_CLASSIFICATION',
    sourceOccurrenceId: occurrence.sourceOccurrenceId,
    sourceModelObjectId: occurrence.sourceModelObjectId,
    geometryObjectId: occurrence.geometryObjectIds?.[0] || null,
    reason,
    detail,
  });
}

function candidatesFor(derived, occurrenceId, geometryId) {
  return derived.candidates.filter((item) => item.sourceOccurrenceId === occurrenceId
    && item.geometryObjectId === geometryId);
}

function validateCandidateSet(occurrence, candidates) {
  const admitted = candidates.filter((item) => item.admissionDisposition === 'ADMITTED');
  if (candidates.length !== 2 || admitted.length !== 2) {
    return { failure: fail(occurrence, 'BOUNDARY_COUNT',
      'PIPE requires exactly two admitted boundary loops and no rejected candidates.') };
  }
  if (new Set(admitted.map((item) => item.shellId)).size !== 1) {
    return { failure: fail(occurrence, 'SHELL_COUNT',
      'PIPE boundary loops must belong to one authoritative shell.') };
  }
  return { admitted };
}

export function classifyPipeOccurrence({
  occurrence, selection, derivedPortEvidence, profile = AUTO_PIPE_PROFILE,
}) {
  const geometryIds = occurrence.geometryObjectIds || [];
  if (geometryIds.length !== 1) {
    return fail(occurrence, 'GEOMETRY_COUNT', 'PIPE requires exactly one selected geometry.');
  }
  const geometryId = geometryIds[0];
  if (!selection || selection.geometry.geometryObjectId !== geometryId) {
    return fail(occurrence, 'GEOMETRY_BINDING', 'Selected topology does not bind to the occurrence geometry.');
  }
  const checked = validateCandidateSet(
    occurrence, candidatesFor(derivedPortEvidence, occurrence.sourceOccurrenceId, geometryId));
  if (checked.failure) return checked.failure;
  const ports = assignRoles(checked.admitted[0], checked.admitted[1], profile);
  if (!ports) {
    return fail(occurrence, 'ROLE_ASSIGNMENT',
      'Exactly one deterministic A/L assignment is required.');
  }
  if (!radiusMatches(ports, profile)) {
    return fail(occurrence, 'RADIUS_MISMATCH',
      'End radii exceed the PIPE admission tolerance.');
  }
  if (!cylinderResiduals(worldControlPoints(selection, occurrence), ports, profile)) {
    return fail(occurrence, 'CYLINDER_RESIDUAL',
      'Exact transformed control points do not form a constant-radius open cylinder.');
  }
  return Object.freeze({
    admitted: true,
    status: 'PIPE_INFERENCE_PASS',
    sourceOccurrenceId: occurrence.sourceOccurrenceId,
    sourceModelObjectId: occurrence.sourceModelObjectId,
    geometryObjectId: geometryId,
    ...ports,
  });
}

function closedSolidRecordFor(closedSolidPipeEvidence, occurrenceId, geometryId) {
  return closedSolidPipeEvidence?.occurrenceEvidence.find((item) => item.sourceOccurrenceId === occurrenceId
    && item.geometryObjectId === geometryId) || null;
}

function repairedShellEvidence(record) {
  const projection = record?.analysisProjection;
  const baseRepair = projection?.method === 'POSITION_WELD_AND_FACE_DEDUP_V1'
    && (projection.mergedVertexCount > 0 || projection.duplicateFaceIds?.length > 0);
  const capRepair = projection?.terminalCapBridge?.method === 'DETACHED_CAP_RING_BRIDGE_V1'
    && projection.terminalCapBridge.disposition === 'APPLIED';
  return baseRepair || capRepair;
}

function closedSolidEligible(openBoundary, record) {
  if (openBoundary.reason === 'BOUNDARY_COUNT') return true;
  return openBoundary.reason === 'SHELL_COUNT' && repairedShellEvidence(record);
}

// Open-boundary admission always wins. Closed-solid inference is consulted only
// when open topology cannot represent the component, including a shell split
// that a governed weld/dedup or detached-cap projection demonstrably repaired.
function classifyOccurrence({
  occurrence, selection, derivedPortEvidence, closedSolidPipeEvidence, profile, closedSolidProfile,
}) {
  const openBoundary = classifyPipeOccurrence({ occurrence, selection, derivedPortEvidence, profile });
  if (openBoundary.admitted) return openBoundary;
  const geometryId = occurrence.geometryObjectIds?.[0];
  const record = closedSolidRecordFor(closedSolidPipeEvidence, occurrence.sourceOccurrenceId, geometryId);
  if (!record || !closedSolidEligible(openBoundary, record)) return openBoundary;
  const closedSolid = classifySolidFittingPipeOccurrence({
    occurrence, selection, record, profile: closedSolidProfile || profile,
  });
  return closedSolid || openBoundary;
}

export function classifySelectedPipes({
  zoneGeometryEvidence, derivedPortEvidence, closedSolidPipeEvidence, selections,
  profile = AUTO_PIPE_PROFILE, closedSolidProfile,
}) {
  const selectionById = new Map(selections.map((item) => [item.geometry.geometryObjectId, item]));
  const occurrences = zoneGeometryEvidence.occurrenceEvidence
    .filter((item) => item.geometryObjectIds?.length)
    .sort((a, b) => compareOccurrenceId(a.sourceOccurrenceId, b.sourceOccurrenceId));
  return occurrences.map((occurrence) => classifyOccurrence({
    occurrence,
    selection: selectionById.get(occurrence.geometryObjectIds?.[0]),
    derivedPortEvidence,
    closedSolidPipeEvidence,
    profile,
    closedSolidProfile,
  }));
}
