import { assignRoles, radiusMatches } from '../auto-pipe/pipe-admission-gates.js';
import { AUTO_PIPE_PROFILE } from '../auto-pipe/profile.js';
import { PORT_TOPOLOGY_DISPOSITION } from './constants.js?v=20260729-fbx2-direct-pipe-1';
import { closedSolidSidewallResiduals } from './sidewall-residual.js?v=20260729-fbx2-direct-pipe-1';

function fail(occurrence, record, reason) {
  return Object.freeze({
    admitted: false,
    status: 'BLOCKED_AUTO_PIPE_CLASSIFICATION',
    sourceOccurrenceId: occurrence.sourceOccurrenceId,
    sourceModelObjectId: occurrence.sourceModelObjectId,
    geometryObjectId: record.geometryObjectId,
    reason,
    detail: 'Closed-solid PIPE candidate failed the shared PIPE admission gate.',
  });
}

export function classifySolidFittingPipeOccurrence({
  occurrence, selection, record, profile = AUTO_PIPE_PROFILE,
}) {
  if (record.topologyDisposition !== PORT_TOPOLOGY_DISPOSITION.STRAIGHT_TWO_PORT) return null;
  const admitted = record.candidates.filter((item) => item.admissionDisposition === 'ADMITTED');
  if (admitted.length !== 2) return null;
  const ports = assignRoles(admitted[0], admitted[1], profile);
  if (!ports) return fail(occurrence, record, 'ROLE_ASSIGNMENT');
  if (!radiusMatches(ports, profile)) return fail(occurrence, record, 'RADIUS_MISMATCH');
  if (!closedSolidSidewallResiduals({ occurrence, selection, record, ports, profile })) {
    return fail(occurrence, record, 'CYLINDER_RESIDUAL');
  }
  return Object.freeze({
    admitted: true,
    status: 'PIPE_INFERENCE_PASS',
    sourceOccurrenceId: occurrence.sourceOccurrenceId,
    sourceModelObjectId: occurrence.sourceModelObjectId,
    geometryObjectId: record.geometryObjectId,
    inferenceMethod: 'CLOSED_SOLID_CYLINDER',
    ...ports,
  });
}
