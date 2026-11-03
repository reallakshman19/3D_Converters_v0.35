import {
  FIT_FACILITY_ENRICHMENT_PROPERTIES,
  FIT_FACILITY_PROCESS_REFERENCE_BASES,
  FIT_FACILITY_SPAN_DETERMINATION_METHODS,
  FIT_FACILITY_SUPPORT_EVIDENCE_STATUSES,
  FIT_FACILITY_WALL_BASES,
} from './fit-plan-contract.js';
import {
  fitFacilityEnrichmentRow,
  fitFacilityEnrichmentTrace,
} from './fit-plan-context.js';
import { resolveFitFacilityGeometryCustody } from './fit-geometry-custody.js';

export const FIT_FACILITY_ENGINEERING_BASIS_SCHEMA = 'FitFacilityEngineeringBasis.v1';
export {
  FIT_FACILITY_PROCESS_REFERENCE_BASES,
  FIT_FACILITY_SPAN_DETERMINATION_METHODS,
  FIT_FACILITY_SUPPORT_EVIDENCE_STATUSES,
  FIT_FACILITY_WALL_BASES,
} from './fit-plan-contract.js';

const BASIS_AUTHORITY = Object.freeze({
  authority: 'ENGINEERING_BASIS_CUSTODY_ONLY',
  engineeringAuthority: 'NONE',
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function basisRow(index, canonicalId, property, caseId = null) {
  return fitFacilityEnrichmentRow(index, canonicalId, property, caseId);
}

function textValue(row, field, missing, invalid, allowed = null) {
  if (!row) {
    missing.push(field);
    return null;
  }
  if (typeof row.value !== 'string' || !row.value.trim()) {
    invalid.push(field);
    return null;
  }
  const value = row.value.trim().toUpperCase();
  if (allowed && !allowed.includes(value)) {
    invalid.push(field);
    return null;
  }
  return value;
}

function confirmedValue(row, field, missing, invalid, reasons, reason) {
  if (!row) {
    missing.push(field);
    return null;
  }
  if (row.value !== true) {
    invalid.push(field);
    reasons.push(reason);
    return false;
  }
  return true;
}

function quantityValue(row, field, missing, invalid) {
  if (!row) {
    missing.push(field);
    return null;
  }
  if (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value <= 0
      || typeof row.unit !== 'string' || !row.unit.trim()) {
    invalid.push(field);
    return null;
  }
  return Object.freeze({ value: row.value, unit: row.unit });
}

function actualReferenceBasis(row, field, missing, invalid, reasons) {
  const value = textValue(row, field, missing, invalid, FIT_FACILITY_PROCESS_REFERENCE_BASES);
  if (value && value !== 'ACTUAL') {
    invalid.push(field);
    reasons.push(`PROCESS_BASIS_CONVERSION_REQUIRED:${field}`);
  }
  return value;
}

function processBasisRows(index, canonicalId, caseId) {
  const p = FIT_FACILITY_ENRICHMENT_PROPERTIES;
  return {
    densityBasis: basisRow(index, canonicalId, p.DENSITY_BASIS, caseId),
    velocityBasis: basisRow(index, canonicalId, p.VELOCITY_BASIS, caseId),
    gasDensityBasis: basisRow(index, canonicalId, p.GAS_DENSITY_BASIS, caseId),
    liquidDensityBasis: basisRow(index, canonicalId, p.LIQUID_DENSITY_BASIS, caseId),
  };
}

function processBasis(process, rows, missing, invalid, reasons) {
  const result = {
    densityReferenceBasis: null, velocityReferenceBasis: null,
    gasDensityReferenceBasis: null, liquidDensityReferenceBasis: null,
  };
  if (process.phase === 'MULTIPHASE' && process.mode === 'COMPONENT_DERIVED') {
    result.gasDensityReferenceBasis = actualReferenceBasis(
      rows.gasDensityBasis, 'gasDensityReferenceBasis', missing, invalid, reasons,
    );
    result.liquidDensityReferenceBasis = actualReferenceBasis(
      rows.liquidDensityBasis, 'liquidDensityReferenceBasis', missing, invalid, reasons,
    );
    return result;
  }
  result.densityReferenceBasis = actualReferenceBasis(
    rows.densityBasis, 'densityReferenceBasis', missing, invalid, reasons,
  );
  if (process.resolved?.velocity?.value) {
    result.velocityReferenceBasis = actualReferenceBasis(
      rows.velocityBasis, 'velocityReferenceBasis', missing, invalid, reasons,
    );
  }
  return result;
}

function supportMethodMatches(status, method) {
  if (status === 'METHOD_ACCEPTED_PROJECT_STANDARD') return method === 'PROJECT_PIPING_STANDARD';
  return ['LINE_WALK_EFFECTIVE_SUPPORTS', 'ISOMETRIC_EFFECTIVE_SUPPORTS'].includes(method);
}

function supportEvidence(rows, missing, invalid, reasons) {
  const method = textValue(
    rows.spanDeterminationMethod, 'spanDeterminationMethod', missing, invalid,
    FIT_FACILITY_SPAN_DETERMINATION_METHODS,
  );
  const status = textValue(
    rows.supportEvidenceStatus, 'supportEvidenceStatus', missing, invalid,
    FIT_FACILITY_SUPPORT_EVIDENCE_STATUSES,
  );
  if (method && status && !supportMethodMatches(status, method)) {
    invalid.push('supportEvidenceStatus');
    reasons.push('SUPPORT_EVIDENCE_METHOD_MISMATCH');
  }
  return { spanDeterminationMethod: method, evidenceStatus: status };
}

function traces(rows, geometryCustody) {
  return Object.freeze({
    ...Object.fromEntries(
      Object.entries(rows).map(([key, row]) => [
        key,
        fitFacilityEnrichmentTrace(row, row?.caseId ? 'CASE_SPECIFIC' : 'GLOBAL'),
      ]),
    ),
    geometryCustody: geometryCustody.trace,
  });
}

export function resolveFitFacilityEngineeringBasis({
  index, canonicalId, line, caseId, process, geometryCustody,
} = {}) {
  const missing = [];
  const invalid = [];
  const reasons = [];
  const p = FIT_FACILITY_ENRICHMENT_PROPERTIES;
  const rows = {
    wallBasis: basisRow(index, canonicalId, p.WALL_BASIS),
    maximumSpanBetweenEffectiveSupports: basisRow(index, canonicalId, p.MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS),
    spanDeterminationMethod: basisRow(index, canonicalId, p.SPAN_DETERMINATION_METHOD),
    supportEvidenceStatus: basisRow(index, canonicalId, p.SUPPORT_EVIDENCE_STATUS),
    ...processBasisRows(index, canonicalId, caseId),
    operatingScenarioCoherent: basisRow(index, canonicalId, p.OPERATING_SCENARIO_COHERENT, caseId),
  };
  const wallBasis = textValue(rows.wallBasis, 'wallBasis', missing, invalid, FIT_FACILITY_WALL_BASES);
  const geometry = resolveFitFacilityGeometryCustody({ wallBasis, custody: geometryCustody });
  missing.push(...geometry.missing);
  invalid.push(...geometry.invalid);
  reasons.push(...geometry.reasons);
  const span = quantityValue(
    rows.maximumSpanBetweenEffectiveSupports, 'maximumSpanBetweenEffectiveSupports', missing, invalid,
  );
  const support = supportEvidence(rows, missing, invalid, reasons);
  const resolvedProcess = processBasis(process, rows, missing, invalid, reasons);
  const scenarioCoherent = confirmedValue(
    rows.operatingScenarioCoherent, 'operatingScenarioCoherent', missing, invalid, reasons,
    'OPERATING_SCENARIO_NOT_COHERENT',
  );
  const uniqueMissing = [...new Set(missing)].sort();
  const uniqueInvalid = [...new Set(invalid)].sort();
  return deepFreeze({
    schema: FIT_FACILITY_ENGINEERING_BASIS_SCHEMA,
    status: uniqueMissing.length || uniqueInvalid.length ? 'NOT_READY' : 'READY',
    scope: { line, caseId: caseId ?? null, canonicalId },
    geometry: {
      wallBasis,
      geometrySource: geometry.geometrySource,
      catalogueAuthority: geometry.catalogueAuthority,
      catalogueRecordId: geometry.catalogueRecordId,
      nominalDescriptor: geometry.nominalDescriptor,
    },
    support: { maximumSpanBetweenEffectiveSupports: span, ...support },
    process: resolvedProcess,
    scenario: { coherent: scenarioCoherent },
    missing: uniqueMissing,
    invalid: uniqueInvalid,
    reasons: [...new Set(reasons)],
    trace: traces(rows, geometry),
    authority: BASIS_AUTHORITY,
  });
}
