import { fitFacilityPlanError } from './fit-plan-contract.js';

export const FIT_FACILITY_GEOMETRY_CUSTODY_SCHEMA = 'FitFacilityGeometryCustody.v1';

const REQUIRED_CATALOGUE_TEXT_FIELDS = Object.freeze([
  'authority', 'catalogueId', 'catalogueVersion', 'catalogueHash', 'recordId', 'recordHash',
]);

const GEOMETRY_CUSTODY_AUTHORITY = Object.freeze({
  authority: 'GEOMETRY_PROVENANCE_CUSTODY_ONLY',
  engineeringAuthority: 'NONE',
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
  numericalDimensionAuthority: false,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function duplicateError(kind, canonicalId) {
  return fitFacilityPlanError(
    `FIT_GEOMETRY_CUSTODY_DUPLICATE_${kind}`,
    `Geometry custody contains duplicate ${kind.toLowerCase()} for ${canonicalId}.`,
    { canonicalId },
  );
}

function uniqueIndex(rows, kind) {
  const result = new Map();
  for (const row of rows ?? []) {
    const canonicalId = String(row?.canonicalId ?? '').trim();
    if (!canonicalId) continue;
    if (result.has(canonicalId)) throw duplicateError(kind, canonicalId);
    result.set(canonicalId, row);
  }
  return result;
}

export function buildFitFacilityGeometryCustodyIndex(dataset = {}) {
  return Object.freeze({
    exchangeComplete: dataset.exchangeComplete === true,
    exchangeIntegrityStatus: dataset.exchangeIntegrityStatus ?? null,
    elements: uniqueIndex(dataset.elements, 'ELEMENT'),
    catalogueEvidence: uniqueIndex(dataset.catalogueEvidence, 'CATALOGUE_EVIDENCE'),
  });
}

export function fitFacilityGeometryCustodyRecord(index, canonicalId) {
  return Object.freeze({
    exchangeComplete: index.exchangeComplete === true,
    exchangeIntegrityStatus: index.exchangeIntegrityStatus ?? null,
    element: index.elements.get(canonicalId) ?? null,
    catalogueEvidence: index.catalogueEvidence.get(canonicalId) ?? null,
  });
}

function nonBlankText(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function sourceReferencePresent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function invalidCatalogueFields(evidence) {
  const invalid = REQUIRED_CATALOGUE_TEXT_FIELDS
    .filter((field) => !nonBlankText(evidence?.[field]))
    .map((field) => `catalogueEvidence.${field}`);
  if (!sourceReferencePresent(evidence?.sourceReference)) {
    invalid.push('catalogueEvidence.sourceReference');
  }
  return invalid;
}

function nominalDescriptor(element) {
  if (!element) return null;
  return deepFreeze({
    dnInMm: element.dnInMm ?? null,
    dnOutMm: element.dnOutMm ?? null,
    schedule: element.schedule ?? null,
  });
}

function trace(custody, evidence) {
  return deepFreeze({
    source: 'VIBRATION_TABLE_EXCHANGE',
    exchangeComplete: custody?.exchangeComplete === true,
    exchangeIntegrityStatus: custody?.exchangeIntegrityStatus ?? null,
    canonicalId: custody?.element?.canonicalId ?? evidence?.canonicalId ?? null,
    elementCatalogueAuthority: custody?.element?.catalogueAuthority ?? null,
    catalogueAuthority: evidence?.authority ?? null,
    catalogueId: evidence?.catalogueId ?? null,
    catalogueVersion: evidence?.catalogueVersion ?? null,
    catalogueHash: evidence?.catalogueHash ?? null,
    sourceHash: evidence?.sourceHash ?? null,
    recordId: evidence?.recordId ?? null,
    recordHash: evidence?.recordHash ?? null,
    sourceReference: evidence?.sourceReference ?? null,
  });
}

function notRequired(wallBasis) {
  return deepFreeze({
    schema: FIT_FACILITY_GEOMETRY_CUSTODY_SCHEMA,
    state: 'NOT_REQUIRED',
    wallBasis,
    geometrySource: null,
    catalogueAuthority: null,
    catalogueRecordId: null,
    nominalDescriptor: null,
    missing: [],
    invalid: [],
    reasons: [],
    trace: null,
    authority: GEOMETRY_CUSTODY_AUTHORITY,
  });
}

function unavailable(wallBasis, custody) {
  const complete = custody?.exchangeComplete === true;
  return deepFreeze({
    schema: FIT_FACILITY_GEOMETRY_CUSTODY_SCHEMA,
    state: 'NOT_READY',
    wallBasis,
    geometrySource: null,
    catalogueAuthority: null,
    catalogueRecordId: null,
    nominalDescriptor: nominalDescriptor(custody?.element),
    missing: ['catalogueEvidence'],
    invalid: [],
    reasons: [
      ...(complete ? [] : ['NOMINAL_GEOMETRY_COMPLETE_EXCHANGE_REQUIRED']),
      'NOMINAL_GEOMETRY_CATALOGUE_CUSTODY_REQUIRED',
    ],
    trace: trace(custody, null),
    authority: GEOMETRY_CUSTODY_AUTHORITY,
  });
}

export function resolveFitFacilityGeometryCustody({ wallBasis, custody } = {}) {
  if (wallBasis !== 'NOMINAL') return notRequired(wallBasis ?? null);
  const evidence = custody?.catalogueEvidence ?? null;
  if (custody?.exchangeComplete !== true || !custody?.element || !evidence) {
    return unavailable(wallBasis, custody);
  }
  const invalid = invalidCatalogueFields(evidence);
  const elementAuthority = custody.element.catalogueAuthority;
  if (nonBlankText(elementAuthority) && elementAuthority.trim() !== evidence.authority?.trim()) {
    invalid.push('catalogueEvidence.authority');
  }
  const mismatch = invalid.includes('catalogueEvidence.authority')
    && nonBlankText(elementAuthority) && nonBlankText(evidence.authority);
  return deepFreeze({
    schema: FIT_FACILITY_GEOMETRY_CUSTODY_SCHEMA,
    state: invalid.length ? 'NOT_READY' : 'READY',
    wallBasis,
    geometrySource: invalid.length ? null : 'VIBRATION_TABLE_EXCHANGE_CATALOGUE_EVIDENCE',
    catalogueAuthority: invalid.length ? null : evidence.authority.trim(),
    catalogueRecordId: invalid.length ? null : evidence.recordId.trim(),
    nominalDescriptor: nominalDescriptor(custody.element),
    missing: [],
    invalid: [...new Set(invalid)].sort(),
    reasons: mismatch ? ['NOMINAL_GEOMETRY_CATALOGUE_AUTHORITY_MISMATCH'] : [],
    trace: trace(custody, evidence),
    authority: GEOMETRY_CUSTODY_AUTHORITY,
  });
}
