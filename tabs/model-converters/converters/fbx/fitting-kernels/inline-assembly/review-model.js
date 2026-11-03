import { compareText } from '../../zone-geometry/compare.js';
import { INLINE_ASSEMBLY_FAMILY_ORDER } from './family-specs.js';

const REVIEW_SCHEMA = 'FbxInlineAssemblyReviewModel.v1';

function rounded(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function blockedReason(record) {
  return record.blockingReasons?.length ? record.blockingReasons.join(', ') : null;
}

function diameterOf(record) {
  const geometry = record.assemblyGeometry;
  if (Number.isFinite(geometry?.meanDiameterMm)) return rounded(geometry.meanDiameterMm);
  if (!record.ports?.length) return null;
  return rounded(record.ports.reduce((sum, port) => sum + port.diameterMm, 0) / record.ports.length);
}

function rowOf(record) {
  return Object.freeze({
    managedRecordId: record.managedRecordId,
    family: record.family,
    reference: record.reference,
    displayName: record.displayName,
    sourceOccurrenceId: record.sourceOccurrenceId,
    disposition: record.disposition,
    nativeMappingSupported: record.nativeMappingSupported,
    topologyDisposition: record.topologyDisposition,
    portCount: record.ports?.length || 0,
    diameterMm: diameterOf(record),
    faceToFaceMm: rounded(record.assemblyGeometry?.faceToFaceMm),
    geometryMethod: record.assemblyGeometry?.method || null,
    blockingReason: blockedReason(record),
  });
}

function familySummary(evidence) {
  return Object.freeze(INLINE_ASSEMBLY_FAMILY_ORDER.map((family) => Object.freeze({
    family,
    ...evidence.familyCounts[family],
    authorityStatus: family === 'BLIND'
      ? evidence.authority.blindAuthorityGate
      : family === 'INSTRUMENT'
        ? 'MAPPED_TWO_PORT_ONLY' : 'MAPPED_TWO_PORT_SUPPORTED',
  })));
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
    familySummary: Object.freeze([]),
    rows: Object.freeze([]),
  });
}

export function unavailableInlineAssemblyReview(mappingStatus = 'MAPPED_STAGE_NOT_AVAILABLE') {
  const message = mappingStatus === 'MAPPED_STAGE_OUTPUT_INVALID'
    ? 'Mapped StagedJSON is invalid; inline assembly evidence was not evaluated.'
    : mappingStatus === 'MAPPED_STAGE_OUTPUT_MISSING'
      ? 'Mapped StagedJSON was not published; inline assembly evidence was not evaluated.'
      : 'Approved mapped StagedJSON is required before inline assembly evidence can be evaluated.';
  return emptyModel('MAPPING_REQUIRED', message, mappingStatus);
}

export function buildInlineAssemblyReviewModel(
  evidence,
  mappingStatus = 'MAPPED_STAGE_AVAILABLE',
) {
  if (evidence?.schema !== 'FbxInlineAssemblyPortEvidence.v1') {
    throw new TypeError('FBX inline assembly review requires FbxInlineAssemblyPortEvidence.v1.');
  }
  const rows = evidence.inlineAssemblyEvidence.map(rowOf).sort((left, right) => (
    INLINE_ASSEMBLY_FAMILY_ORDER.indexOf(left.family)
      - INLINE_ASSEMBLY_FAMILY_ORDER.indexOf(right.family)
      || compareText(left.managedRecordId, right.managedRecordId)
  ));
  const status = evidence.managedInlineAssemblyCount === 0 ? 'NO_INLINE_ASSEMBLY_IN_SELECTED_ZONE'
    : evidence.blockedInlineAssemblyCount === 0 ? 'PASS'
      : evidence.admittedInlineAssemblyCount > 0 ? 'PARTIAL' : 'BLOCKED';
  const message = evidence.managedInlineAssemblyCount === 0
    ? 'No mapped flange, gasket, blind, valve, or instrument records are bound to the selected zone.'
    : `${evidence.admittedInlineAssemblyCount} admitted and ${evidence.blockedInlineAssemblyCount} blocked inline assembly components.`;
  return Object.freeze({
    schema: REVIEW_SCHEMA,
    status,
    message,
    mappingStatus,
    managedCount: evidence.managedInlineAssemblyCount,
    admittedCount: evidence.admittedInlineAssemblyCount,
    blockedCount: evidence.blockedInlineAssemblyCount,
    familySummary: familySummary(evidence),
    rows: Object.freeze(rows),
  });
}
