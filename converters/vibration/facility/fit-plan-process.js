import {
  FIT_FACILITY_ENRICHMENT_PROPERTIES,
  FIT_FACILITY_SUPPORTED_PHASES,
} from './fit-plan-contract.js';
import {
  fitFacilityEnrichmentRow,
  fitFacilityEnrichmentTrace,
} from './fit-plan-context.js';

function validQuantity(row) {
  return Boolean(row)
    && typeof row.value === 'number'
    && Number.isFinite(row.value)
    && typeof row.unit === 'string'
    && row.unit.trim();
}

function enrichment(index, canonicalId, property, caseId) {
  return fitFacilityEnrichmentRow(index, canonicalId, property, caseId);
}

function fallbackQuantity(operatingValue, row, field, invalid) {
  if (operatingValue) return { value: operatingValue, source: 'OPERATING_CASE', row: null };
  if (!row) return { value: null, source: 'MISSING', row: null };
  if (!validQuantity(row)) {
    invalid.push(field);
    return { value: null, source: 'INVALID_BLOCKER', row };
  }
  return { value: { value: row.value, unit: row.unit }, source: 'DATA_BLOCKER', row };
}

function fallbackText(operatingValue, row, field, invalid) {
  if (operatingValue) return { value: operatingValue, source: 'OPERATING_CASE', row: null };
  if (!row) return { value: null, source: 'MISSING', row: null };
  if (typeof row.value !== 'string' || !row.value.trim()) {
    invalid.push(field);
    return { value: null, source: 'INVALID_BLOCKER', row };
  }
  return { value: row.value.trim(), source: 'DATA_BLOCKER', row };
}

function quantityFromBlocker(index, canonicalId, caseId, property, field, invalid) {
  return fallbackQuantity(null, enrichment(index, canonicalId, property, caseId), field, invalid);
}

function trace(resolution) {
  if (!resolution) return null;
  return {
    selection: resolution.source,
    blocker: resolution.row ? fitFacilityEnrichmentTrace(resolution.row, 'CASE_SPECIFIC') : null,
  };
}

function standardProcess(phase, resolved, missing) {
  if (!resolved.density.value) missing.push('density');
  if (!resolved.velocity.value && !resolved.massFlow.value) missing.push('massFlowOrVelocity');
  if (phase === 'GAS' && !resolved.dynamicViscosity.value) missing.push('dynamicViscosity');
  return phase;
}

function multiphaseMode(resolved, missing, invalid) {
  const aggregate = Boolean(resolved.density.value && (resolved.velocity.value || resolved.massFlow.value));
  const components = Boolean(
    resolved.gasMassFlow.value && resolved.gasDensity.value
    && resolved.liquidMassFlow.value && resolved.liquidDensity.value,
  );
  const explicit = resolved.multiphaseResolutionMode.value;
  if (explicit && !['AGGREGATE_EFFECTIVE', 'COMPONENT_DERIVED'].includes(explicit)) {
    invalid.push('multiphaseResolutionMode');
    return null;
  }
  if (explicit === 'AGGREGATE_EFFECTIVE') {
    if (!aggregate) missing.push('aggregateMultiphaseInputs');
    return aggregate ? 'AGGREGATE_EFFECTIVE' : null;
  }
  if (explicit === 'COMPONENT_DERIVED') {
    if (!components) missing.push('componentMultiphaseInputs');
    return components ? 'COMPONENT_DERIVED' : null;
  }
  if (aggregate && components) {
    invalid.push('multiphaseResolutionMode');
    return null;
  }
  if (aggregate) return 'AGGREGATE_EFFECTIVE';
  if (components) return 'COMPONENT_DERIVED';
  missing.push('multiphaseInputShape');
  return null;
}

export function resolveFitFacilityProcessEvidence(operatingCase, index, canonicalId, caseId) {
  const missing = [];
  const invalid = [];
  const property = FIT_FACILITY_ENRICHMENT_PROPERTIES;
  const phase = fallbackText(
    operatingCase.phase,
    enrichment(index, canonicalId, property.PHASE, caseId),
    'phase', invalid,
  );
  if (!phase.value) missing.push('phase');
  else if (!FIT_FACILITY_SUPPORTED_PHASES.includes(phase.value)) invalid.push('phase');

  const resolved = {
    phase,
    massFlow: fallbackQuantity(operatingCase.massFlow,
      enrichment(index, canonicalId, property.MASS_FLOW, caseId), 'massFlow', invalid),
    density: fallbackQuantity(operatingCase.density,
      enrichment(index, canonicalId, property.DENSITY, caseId), 'density', invalid),
    dynamicViscosity: fallbackQuantity(operatingCase.dynamicViscosity,
      enrichment(index, canonicalId, property.DYNAMIC_VISCOSITY, caseId), 'dynamicViscosity', invalid),
    velocity: fallbackQuantity(operatingCase.velocity,
      enrichment(index, canonicalId, property.VELOCITY, caseId), 'velocity', invalid),
    multiphaseResolutionMode: fallbackText(null,
      enrichment(index, canonicalId, property.MULTIPHASE_RESOLUTION_MODE, caseId),
      'multiphaseResolutionMode', invalid),
    gasMassFlow: quantityFromBlocker(index, canonicalId, caseId, property.GAS_MASS_FLOW, 'gasMassFlow', invalid),
    gasDensity: quantityFromBlocker(index, canonicalId, caseId, property.GAS_DENSITY, 'gasDensity', invalid),
    liquidMassFlow: quantityFromBlocker(index, canonicalId, caseId, property.LIQUID_MASS_FLOW, 'liquidMassFlow', invalid),
    liquidDensity: quantityFromBlocker(index, canonicalId, caseId, property.LIQUID_DENSITY, 'liquidDensity', invalid),
  };

  let mode = null;
  if (phase.value === 'MULTIPHASE') mode = multiphaseMode(resolved, missing, invalid);
  else if (phase.value) standardProcess(phase.value, resolved, missing);

  return Object.freeze({
    phase: phase.value,
    mode,
    resolved: Object.freeze(resolved),
    missing: Object.freeze([...new Set(missing)].sort()),
    invalid: Object.freeze([...new Set(invalid)].sort()),
    trace: Object.freeze(Object.fromEntries(Object.entries(resolved).map(([key, value]) => [key, trace(value)]))),
  });
}

function putQuantity(inputs, units, key, quantity) {
  if (!quantity?.value) return;
  inputs[key] = quantity.value.value;
  units[key] = quantity.value.unit;
}

export function appendFitFacilityProcessRequest(process, inputs, inputUnits) {
  inputs.phase = process.phase;
  if (process.phase === 'MULTIPHASE') inputs.multiphaseResolutionMode = process.mode;
  if (process.phase !== 'MULTIPHASE' || process.mode === 'AGGREGATE_EFFECTIVE') {
    putQuantity(inputs, inputUnits, 'density', process.resolved.density);
    if (process.resolved.velocity.value) putQuantity(inputs, inputUnits, 'fluidVelocity', process.resolved.velocity);
    else putQuantity(inputs, inputUnits, 'massFlow', process.resolved.massFlow);
  }
  if (process.phase === 'GAS') {
    putQuantity(inputs, inputUnits, 'gasDynamicViscosity', process.resolved.dynamicViscosity);
  }
  if (process.phase === 'MULTIPHASE' && process.mode === 'COMPONENT_DERIVED') {
    putQuantity(inputs, inputUnits, 'gasMassFlow', process.resolved.gasMassFlow);
    putQuantity(inputs, inputUnits, 'gasDensity', process.resolved.gasDensity);
    putQuantity(inputs, inputUnits, 'liquidMassFlow', process.resolved.liquidMassFlow);
    putQuantity(inputs, inputUnits, 'liquidDensity', process.resolved.liquidDensity);
  }
}
