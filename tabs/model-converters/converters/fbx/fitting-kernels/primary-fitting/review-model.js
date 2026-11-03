import { compareText } from '../../zone-geometry/compare.js';

const REVIEW_SCHEMA = 'FbxPrimaryFittingReviewModel.v1';
const FAMILY_ORDER = Object.freeze(['ELBOW', 'TEE', 'REDUCER']);

const FAMILY_SPECS = Object.freeze({
  ELBOW: Object.freeze({
    schema: 'FbxElbowPortEvidence.v1',
    records: 'elbowEvidence',
    managed: 'managedElbowCount',
    admitted: 'admittedElbowCount',
    blocked: 'blockedElbowCount',
  }),
  TEE: Object.freeze({
    schema: 'FbxTeePortEvidence.v1',
    records: 'teeEvidence',
    managed: 'managedTeeCount',
    admitted: 'admittedTeeCount',
    blocked: 'blockedTeeCount',
  }),
  REDUCER: Object.freeze({
    schema: 'FbxReducerPortEvidence.v1',
    records: 'reducerEvidence',
    managed: 'managedReducerCount',
    admitted: 'admittedReducerCount',
    blocked: 'blockedReducerCount',
  }),
});

function rounded(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function portByRole(record, role) {
  return record.ports?.find((port) => port.role === role) || null;
}

function blockedReason(record) {
  return record.blockingReasons?.length ? record.blockingReasons.join(', ') : null;
}

function commonRow(family, record) {
  return {
    family,
    managedRecordId: record.managedRecordId,
    reference: record.reference,
    displayName: record.displayName,
    sourceOccurrenceId: record.sourceOccurrenceId,
    disposition: record.disposition,
    portCount: record.ports?.length || 0,
    blockingReason: blockedReason(record),
  };
}

function elbowRow(record) {
  const ports = record.ports || [];
  return Object.freeze({
    ...commonRow('ELBOW', record),
    primaryDiameterMm: rounded(ports[0]?.diameterMm),
    secondaryDiameterMm: rounded(ports[1]?.diameterMm),
    axialLengthMm: null,
    angleDeg: rounded(record.bend?.angleDeg),
    radiusMm: rounded(record.bend?.radiusMm),
    geometryMethod: record.bend?.method || null,
  });
}

function teeRow(record) {
  const run = portByRole(record, 'RUN_NEGATIVE') || portByRole(record, 'RUN_POSITIVE');
  const branch = portByRole(record, 'BRANCH');
  return Object.freeze({
    ...commonRow('TEE', record),
    primaryDiameterMm: rounded(run?.diameterMm),
    secondaryDiameterMm: rounded(branch?.diameterMm),
    axialLengthMm: rounded(record.tee?.runSpanMm),
    angleDeg: rounded(record.tee?.branchAngleDeg),
    radiusMm: null,
    geometryMethod: record.tee?.method || null,
  });
}

function reducerRow(record) {
  const large = portByRole(record, 'LARGE_END');
  const small = portByRole(record, 'SMALL_END');
  return Object.freeze({
    ...commonRow('REDUCER', record),
    primaryDiameterMm: rounded(large?.diameterMm),
    secondaryDiameterMm: rounded(small?.diameterMm),
    axialLengthMm: rounded(record.reducer?.axialLengthMm),
    angleDeg: rounded(record.reducer?.halfAngleDeg),
    radiusMm: null,
    geometryMethod: record.reducer?.method || null,
  });
}

function rowsFor(family, evidence) {
  const spec = FAMILY_SPECS[family];
  const rowBuilder = family === 'ELBOW' ? elbowRow : family === 'TEE' ? teeRow : reducerRow;
  return evidence[spec.records].map(rowBuilder);
}

function validateEvidence(family, evidence) {
  const spec = FAMILY_SPECS[family];
  if (evidence?.schema !== spec.schema || !Array.isArray(evidence[spec.records])) {
    throw new TypeError(`FBX primary fitting review requires ${spec.schema}.`);
  }
}

function familyCount(family, evidence) {
  const spec = FAMILY_SPECS[family];
  return Object.freeze({
    family,
    managedCount: evidence[spec.managed],
    admittedCount: evidence[spec.admitted],
    blockedCount: evidence[spec.blocked],
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
    familySummary: Object.freeze(FAMILY_ORDER.map((family) => Object.freeze({
      family, managedCount: 0, admittedCount: 0, blockedCount: 0,
    }))),
    rows: Object.freeze([]),
  });
}

export function unavailablePrimaryFittingReview(mappingStatus = 'MAPPED_STAGE_NOT_AVAILABLE') {
  const message = mappingStatus === 'MAPPED_STAGE_OUTPUT_INVALID'
    ? 'Mapped StagedJSON is invalid; ELBOW, TEE, and REDUCER evidence was not evaluated.'
    : mappingStatus === 'MAPPED_STAGE_OUTPUT_MISSING'
      ? 'Mapped StagedJSON was not published; ELBOW, TEE, and REDUCER evidence was not evaluated.'
      : 'Approved mapped StagedJSON is required before ELBOW, TEE, and REDUCER evidence can be evaluated.';
  return emptyModel('MAPPING_REQUIRED', message, mappingStatus);
}

export function buildPrimaryFittingReviewModel({
  elbowEvidence,
  teeEvidence,
  reducerEvidence,
  mappingStatus = 'MAPPED_STAGE_AVAILABLE',
} = {}) {
  const evidenceByFamily = { ELBOW: elbowEvidence, TEE: teeEvidence, REDUCER: reducerEvidence };
  for (const family of FAMILY_ORDER) validateEvidence(family, evidenceByFamily[family]);
  const familySummary = FAMILY_ORDER.map((family) => familyCount(family, evidenceByFamily[family]));
  const rows = FAMILY_ORDER.flatMap((family) => rowsFor(family, evidenceByFamily[family]))
    .sort((left, right) => FAMILY_ORDER.indexOf(left.family) - FAMILY_ORDER.indexOf(right.family)
      || compareText(left.managedRecordId, right.managedRecordId));
  const managedCount = familySummary.reduce((sum, item) => sum + item.managedCount, 0);
  const admittedCount = familySummary.reduce((sum, item) => sum + item.admittedCount, 0);
  const blockedCount = familySummary.reduce((sum, item) => sum + item.blockedCount, 0);
  const status = managedCount === 0 ? 'NO_PRIMARY_FITTING_IN_SELECTED_ZONE'
    : blockedCount === 0 ? 'PASS' : admittedCount > 0 ? 'PARTIAL' : 'BLOCKED';
  const message = managedCount === 0
    ? 'No mapped ELBOW, TEE, or REDUCER components are bound to the selected zone.'
    : `${admittedCount} admitted and ${blockedCount} blocked primary fitting components.`;
  return Object.freeze({
    schema: REVIEW_SCHEMA,
    status,
    message,
    mappingStatus,
    managedCount,
    admittedCount,
    blockedCount,
    familySummary: Object.freeze(familySummary),
    rows: Object.freeze(rows),
  });
}
