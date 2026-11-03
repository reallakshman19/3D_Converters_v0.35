import { compareText } from '../family-policy.js';
import { describeLinks } from './endpoint-model.js';
import {
  GENERATED_GAP_PIPE_METHOD,
  GENERATED_GAP_PIPE_PROFILE,
} from './profile.js';

function subtract(left, right) {
  return left.map((value, index) => value - right[index]);
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function negate(vector) {
  return vector.map((value) => -value);
}

function gapGeometry(left, right) {
  const delta = subtract(right.positionMm, left.positionMm);
  const lengthMm = Math.hypot(...delta);
  return {
    lengthMm,
    axis: lengthMm > 0 ? delta.map((value) => value / lengthMm) : [0, 0, 0],
  };
}

function alignmentResiduals(left, right, axis) {
  return {
    leftAxis: 1 - dot(left.direction.vector, axis),
    rightAxis: 1 - dot(right.direction.vector, negate(axis)),
  };
}

function blockingReasons(geometry, residuals, profile) {
  const reasons = [];
  if (!Number.isFinite(geometry.lengthMm) || geometry.lengthMm <= 0) {
    reasons.push('GAP_LENGTH_INVALID');
  }
  if (residuals.leftAxis > profile.axisAlignmentDotTolerance) {
    reasons.push('LEFT_ENDPOINT_AXIS_MISMATCH');
  }
  if (residuals.rightAxis > profile.axisAlignmentDotTolerance) {
    reasons.push('RIGHT_ENDPOINT_AXIS_MISMATCH');
  }
  return reasons;
}

function candidateIdentity(index) {
  const suffix = String(index + 1).padStart(4, '0');
  return {
    candidateId: `FBX-GAP-CANDIDATE-${suffix}`,
    generatedMappingEntryId: `generated-gap-${suffix}`,
    generatedLogicalComponentId: `FBX-GAP-PIPE-${suffix}`,
  };
}

function candidateRecord(link, index, profile) {
  const geometry = gapGeometry(link.left, link.right);
  const identity = candidateIdentity(index);
  if (geometry.lengthMm <= profile.coincidenceToleranceMm) {
    return Object.freeze({
      ...identity,
      sourcePairKey: link.pairKey,
      sourceEndpoints: [link.left.endpointId, link.right.endpointId],
      disposition: 'NO_GENERATION_REQUIRED',
      lengthMm: geometry.lengthMm,
      axis: geometry.axis,
      residuals: { leftAxis: 0, rightAxis: 0 },
      blockingReasons: [],
      method: null,
      left: link.left,
      right: link.right,
    });
  }
  const residuals = alignmentResiduals(link.left, link.right, geometry.axis);
  const reasons = blockingReasons(geometry, residuals, profile);
  return Object.freeze({
    ...identity,
    sourcePairKey: link.pairKey,
    sourceEndpoints: [link.left.endpointId, link.right.endpointId],
    disposition: reasons.length ? 'BLOCKED' : 'GENERATE',
    lengthMm: geometry.lengthMm,
    axis: geometry.axis,
    residuals,
    blockingReasons: reasons.sort(compareText),
    method: GENERATED_GAP_PIPE_METHOD,
    left: link.left,
    right: link.right,
  });
}

export function qualifyGeneratedGapPipes({
  entries,
  resolvedByEntry,
  links,
  profile = GENERATED_GAP_PIPE_PROFILE,
} = {}) {
  const described = describeLinks(entries, resolvedByEntry, links);
  return Object.freeze(described.map((link, index) => candidateRecord(link, index, profile)));
}
