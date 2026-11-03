import {
  FIT_FACILITY_ENRICHMENT_PROPERTIES,
  FIT_FACILITY_PROCESS_BASES,
  FIT_FACILITY_WALL_BASES,
} from './fit-plan-contract.js';
import {
  fitFacilityEnrichmentRow,
  fitFacilityEnrichmentTrace,
} from './fit-plan-context.js';

export const FIT_FACILITY_ENGINEERING_BASIS_SCHEMA = 'FitFacilityEngineeringBasis.v1';
export { FIT_FACILITY_PROCESS_BASES, FIT_FACILITY_WALL_BASES } from './fit-plan-contract.js';

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

function methodValue(row, missing, invalid) {
  if (!row) {
    missing.push('spanDeterminationMethod');
    return null;
  }
  if (typeof row.value !== 'string' || !row.value.trim()) {
    invalid.push('spanDeterminationMethod');
    return null;
  }
  return row.value.trim();
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

function actualBasis(row, field, missing, invalid, reasons) {
  const value = textValue(row, field, missing, invalid, FIT_FACILITY_PROCESS_BASES);
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
    densityBasis: null, velocityBasis: null,
    gasDensityBasis: null, liquidDensityBasis: null,
  };
  if (process.phase === 'MULTIPHASE' && process.mode === 'COMPONENT_DERIVED') {
    result.gasDensityBasis = actualBasis(rows.gasDensityBasis, 'gasDensityBasis', missing, invalid, reasons);
    result.liquidDensityBasis = actualBasis(rows.liquidDensityBasis, 'liquidDensityBasis', missing, invalid, reasons);
    return result;
  }
  result.densityBasis = actualBasis(rows.densityBasis, 'densityBasis', missing, invalid, reasons);
  if (process.resolved?.velocity?.value) {
    result.velocityBasis = actualBasis(rows.velocityBasis, 'velocityBasis', missing, invalid, reasons);
  }
  return result;
}

function traces(rows) {
  return Object.freeze(Object.fromEntries(
    Object.entries(rows).map(([key, row]) => [key, fitFacilityEnrichmentTrace(row, row?.caseId ? 'CASE_SPECIFIC' : 'GLOBAL')]),
  ));
}

export function resolveFitFacilityEngineeringBasis({
  index,
  canonicalId,
  line,
  caseId,
  process,
} = {}) {
  const missing = [];
  const invalid = [];
  const reasons = [];
  const p = FIT_FACILITY_ENRICHMENT_PROPERTIES;
  const rows = {
    wallBasis: basisRow(index, canonicalId, p.WALL_BASIS),
    maximumSpanBetweenEffectiveSupports: basisRow(index, canonicalId, p.MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS),
    spanDeterminationMethod: basisRow(index, canonicalId, p.SPAN_DETERMINATION_METHOD),
    supportEffectivenessConfirmed: basisRow(index, canonicalId, p.SUPPORT_EFFECTIVENESS_CONFIRMED),
    ...processBasisRows(index, canonicalId, caseId),
    operatingScenarioCoherent: basisRow(index, canonicalId, p.OPERATING_SCENARIO_COHERENT, caseId),
  };
  const wallBasis = textValue(rows.wallBasis, 'wallBasis', missing, invalid, FIT_FACILITY_WALL_BASES);
  const span = quantityValue(
    rows.maximumSpanBetweenEffectiveSupports,
    'maximumSpanBetweenEffectiveSupports', missing, invalid,
  );
  const method = methodValue(rows.spanDeterminationMethod, missing, invalid);
  const supportConfirmed = confirmedValue(
    rows.supportEffectivenessConfirmed,
    'supportEffectivenessConfirmed', missing, invalid, reasons,
    'SUPPORT_EFFECTIVENESS_NOT_CONFIRMED',
  );
  const resolvedProcess = processBasis(process, rows, missing, invalid, reasons);
  const scenarioCoherent = confirmedValue(
    rows.operatingScenarioCoherent,
    'operatingScenarioCoherent', missing, invalid, reasons,
    'OPERATING_SCENARIO_NOT_COHERENT',
  );
  const uniqueMissing = [...new Set(missing)].sort();
  const uniqueInvalid = [...new Set(invalid)].sort();
  return deepFreeze({
    schema: FIT_FACILITY_ENGINEERING_BASIS_SCHEMA,
    status: uniqueMissing.length || uniqueInvalid.length ? 'NOT_READY' : 'READY',
    scope: { line, caseId: caseId ?? null, canonicalId },
    geometry: { wallBasis },
    support: {
      maximumSpanBetweenEffectiveSupports: span,
      spanDeterminationMethod: method,
      supportEffectivenessConfirmed: supportConfirmed,
    },
    process: resolvedProcess,
    scenario: { coherent: scenarioCoherent },
    missing: uniqueMissing,
    invalid: uniqueInvalid,
    reasons: [...new Set(reasons)],
    trace: traces(rows),
    authority: BASIS_AUTHORITY,
  });
}
