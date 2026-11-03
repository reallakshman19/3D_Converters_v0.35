import { compareText } from '../../zone-geometry/compare.js';

const REVIEW_SCHEMA = 'FbxBranchFittingReviewModel.v1';

function rounded(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function portByRole(record, role) {
  return record.ports?.find((port) => port.role === role) || null;
}

function blockedReason(record) {
  return Array.isArray(record.blockingReasons) && record.blockingReasons.length
    ? record.blockingReasons.join(', ') : null;
}

function rowOf(record) {
  const large = portByRole(record, 'LARGE_PORT');
  const small = portByRole(record, 'SMALL_PORT');
  return Object.freeze({
    managedRecordId: record.managedRecordId,
    reference: record.reference,
    displayName: record.displayName,
    sourceOccurrenceId: record.sourceOccurrenceId,
    disposition: record.disposition,
    largeDiameterMm: rounded(large?.diameterMm),
    smallDiameterMm: rounded(small?.diameterMm),
    axialLengthMm: rounded(record.branchFitting?.axialLengthMm),
    halfAngleDeg: rounded(record.branchFitting?.halfAngleDeg),
    blockingReason: blockedReason(record),
  });
}

function emptyModel(status, message, mappingStatus) {
  return Object.freeze({
    schema: REVIEW_SCHEMA,
    status,
    message,
    mappingStatus,
    managedCount: 0,
    admittedCount: 0,
    blockedCount: 0,
    rows: Object.freeze([]),
  });
}

export function unavailableBranchFittingReview(mappingStatus = 'MAPPED_STAGE_NOT_AVAILABLE') {
  const message = mappingStatus === 'MAPPED_STAGE_OUTPUT_INVALID'
    ? 'Mapped StagedJSON is invalid; selected-zone OLET evidence was not evaluated.'
    : mappingStatus === 'MAPPED_STAGE_OUTPUT_MISSING'
      ? 'Mapped StagedJSON was not published; selected-zone OLET evidence was not evaluated.'
      : 'Approved mapped StagedJSON is required before selected-zone OLET evidence can be evaluated.';
  return emptyModel('MAPPING_REQUIRED', message, mappingStatus);
}

export function buildBranchFittingReviewModel(evidence, mappingStatus = 'MAPPED_STAGE_AVAILABLE') {
  if (evidence?.schema !== 'FbxBranchFittingPortEvidence.v1') {
    throw new TypeError('FBX branch-fitting review requires FbxBranchFittingPortEvidence.v1.');
  }
  const rows = evidence.branchFittingEvidence.map(rowOf).sort((left, right) => (
    compareText(left.managedRecordId, right.managedRecordId)
  ));
  const status = evidence.managedBranchFittingCount === 0 ? 'NO_OLET_IN_SELECTED_ZONE'
    : evidence.blockedBranchFittingCount === 0 ? 'PASS'
      : evidence.admittedBranchFittingCount > 0 ? 'PARTIAL' : 'BLOCKED';
  const message = evidence.managedBranchFittingCount === 0
    ? 'No mapped OLET components are bound to the selected zone.'
    : `${evidence.admittedBranchFittingCount} admitted and ${evidence.blockedBranchFittingCount} blocked OLET components.`;
  return Object.freeze({
    schema: REVIEW_SCHEMA,
    status,
    message,
    mappingStatus,
    managedCount: evidence.managedBranchFittingCount,
    admittedCount: evidence.admittedBranchFittingCount,
    blockedCount: evidence.blockedBranchFittingCount,
    rows: Object.freeze(rows),
  });
}
