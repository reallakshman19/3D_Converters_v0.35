import {
  FIT_PHASES,
  FIT_REFERENCE_LIMITS,
  classifyFitSupportStiffness,
  fitSpanBoundaries,
  resolveFitSupportCategory,
} from './method.js';

export const FIT_MULTIPHASE_RESOLUTION_MODES = Object.freeze([
  'AGGREGATE_EFFECTIVE',
  'COMPONENT_DERIVED',
]);

const COMPONENT_FIELDS = Object.freeze([
  'gasMassFlowKgS',
  'gasDensityKgM3',
  'liquidMassFlowKgS',
  'liquidDensityKgM3',
]);

function error(code, field, message, details = {}) {
  return Object.freeze({ code, field, message, details: Object.freeze({ ...details }) });
}

function finite(input, field, { positive = false, nonNegative = false } = {}) {
  const value = input[field];
  if (value === undefined || value === null) return error('FIT_INPUT_REQUIRED', field, `${field} is required.`);
  if (typeof value !== 'number' || !Number.isFinite(value)) return error('FIT_INPUT_INVALID', field, `${field} must be a finite number.`);
  if (positive && value <= 0) return error('FIT_INPUT_INVALID', field, `${field} must be greater than zero.`, { value });
  if (nonNegative && value < 0) return error('FIT_INPUT_INVALID', field, `${field} must be zero or greater.`, { value });
  return null;
}

function present(input, field) {
  return input[field] !== undefined && input[field] !== null;
}

export function resolveFitMultiphaseResolutionMode(input = {}) {
  if (input.phase !== 'MULTIPHASE') {
    return Object.freeze({
      mode: null,
      selection: 'NOT_APPLICABLE',
      aggregateDataPresent: false,
      componentDataPresent: false,
      alternateModeDataPresent: false,
    });
  }

  const aggregateDataPresent = present(input, 'densityKgM3') || present(input, 'massFlowKgS');
  const componentDataPresent = COMPONENT_FIELDS.some((field) => present(input, field));
  const explicit = input.multiphaseResolutionMode;

  if (explicit !== undefined && explicit !== null) {
    if (!FIT_MULTIPHASE_RESOLUTION_MODES.includes(explicit)) {
      return Object.freeze({
        mode: null,
        selection: 'INVALID',
        aggregateDataPresent,
        componentDataPresent,
        alternateModeDataPresent: false,
      });
    }
    return Object.freeze({
      mode: explicit,
      selection: 'EXPLICIT',
      aggregateDataPresent,
      componentDataPresent,
      alternateModeDataPresent: aggregateDataPresent && componentDataPresent,
    });
  }

  if (aggregateDataPresent && componentDataPresent) {
    return Object.freeze({
      mode: null,
      selection: 'AMBIGUOUS',
      aggregateDataPresent,
      componentDataPresent,
      alternateModeDataPresent: true,
    });
  }

  return Object.freeze({
    mode: aggregateDataPresent ? 'AGGREGATE_EFFECTIVE' : 'COMPONENT_DERIVED',
    selection: 'INFERRED',
    aggregateDataPresent,
    componentDataPresent,
    alternateModeDataPresent: false,
  });
}

export function usesAggregateMultiphaseInput(input = {}) {
  return resolveFitMultiphaseResolutionMode(input).mode === 'AGGREGATE_EFFECTIVE';
}

function requiredPhaseData(input, multiphaseResolution) {
  if (input.phase === 'LIQUID' || input.phase === 'GAS') {
    const fields = [['densityKgM3', { positive: true }]];
    if (input.fluidVelocityMS === undefined) fields.unshift(['massFlowKgS', { nonNegative: true }]);
    return fields;
  }
  if (multiphaseResolution?.mode === 'AGGREGATE_EFFECTIVE') {
    const fields = [['densityKgM3', { positive: true }]];
    if (input.fluidVelocityMS === undefined) fields.unshift(['massFlowKgS', { nonNegative: true }]);
    return fields;
  }
  return [
    ['gasMassFlowKgS', { nonNegative: true }],
    ['gasDensityKgM3', { positive: true }],
    ['liquidMassFlowKgS', { nonNegative: true }],
    ['liquidDensityKgM3', { positive: true }],
  ];
}

function validateMultiphaseComponentFlow(input, errors, multiphaseResolution) {
  if (input.phase !== 'MULTIPHASE' || multiphaseResolution?.mode !== 'COMPONENT_DERIVED') return;
  const values = COMPONENT_FIELDS.map((field) => input[field]);
  if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) return;
  const volumetricFlow = (input.gasMassFlowKgS / input.gasDensityKgM3)
    + (input.liquidMassFlowKgS / input.liquidDensityKgM3);
  if (!(volumetricFlow > 0)) {
    errors.push(error(
      'FIT_INPUT_INVALID',
      'gasMassFlowKgS',
      'Component-derived multiphase input requires a positive total volumetric flow.',
    ));
  }
}

export function validateFitReferenceInput(input = {}) {
  const errors = [];
  for (const [field, rule] of [
    ['outsideDiameterM', { positive: true }],
    ['wallThicknessM', { positive: true }],
    ['maximumUnsupportedSpanM', { positive: true }],
  ]) {
    const issue = finite(input, field, rule);
    if (issue) errors.push(issue);
  }
  if (!FIT_PHASES.includes(input.phase)) {
    errors.push(error('FIT_INPUT_INVALID', 'phase', `phase must be one of ${FIT_PHASES.join(', ')}.`));
  }
  if (input.insideDiameterM !== undefined) {
    const issue = finite(input, 'insideDiameterM', { positive: true });
    if (issue) errors.push(issue);
  }
  if (input.fluidVelocityMS !== undefined) {
    const issue = finite(input, 'fluidVelocityMS', { nonNegative: true });
    if (issue) errors.push(issue);
  }

  const multiphaseResolution = resolveFitMultiphaseResolutionMode(input);
  if (input.phase === 'MULTIPHASE' && multiphaseResolution.selection === 'INVALID') {
    errors.push(error(
      'FIT_INPUT_INVALID',
      'multiphaseResolutionMode',
      `multiphaseResolutionMode must be one of ${FIT_MULTIPHASE_RESOLUTION_MODES.join(', ')}.`,
      { value: input.multiphaseResolutionMode },
    ));
  }
  if (input.phase === 'MULTIPHASE' && multiphaseResolution.selection === 'AMBIGUOUS') {
    errors.push(error(
      'FIT_MULTIPHASE_INPUT_AMBIGUOUS',
      'multiphaseResolutionMode',
      'Both aggregate-effective and component multiphase data are present. Select multiphaseResolutionMode explicitly.',
      { allowedModes: FIT_MULTIPHASE_RESOLUTION_MODES },
    ));
  }

  if (!['INVALID', 'AMBIGUOUS'].includes(multiphaseResolution.selection)) {
    for (const [field, rule] of requiredPhaseData(input, multiphaseResolution)) {
      const issue = finite(input, field, rule);
      if (issue) errors.push(issue);
    }
    validateMultiphaseComponentFlow(input, errors, multiphaseResolution);
  }

  if (input.phase === 'GAS') {
    const issue = finite(input, 'gasDynamicViscosityPaS', { positive: true });
    if (issue) errors.push(issue);
  }
  if (input.naturalFrequencyHz !== undefined) {
    const issue = finite(input, 'naturalFrequencyHz', { positive: true });
    if (issue) errors.push(issue);
  }
  if (Number.isFinite(input.outsideDiameterM) && Number.isFinite(input.wallThicknessM)
      && 2 * input.wallThicknessM >= input.outsideDiameterM) {
    errors.push(error('FIT_INPUT_INVALID', 'wallThicknessM', 'Wall thickness must leave a positive internal diameter.'));
  }
  if (Number.isFinite(input.insideDiameterM) && Number.isFinite(input.outsideDiameterM)
      && input.insideDiameterM >= input.outsideDiameterM) {
    errors.push(error('FIT_INPUT_INVALID', 'insideDiameterM', 'Inside diameter must be less than outside diameter.'));
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

export function evaluateFitApplicability(input = {}) {
  const validation = validateFitReferenceInput(input);
  if (!validation.ok) return Object.freeze({ applicable: false, errors: validation.errors, limitations: Object.freeze([]) });

  const diameterMm = input.outsideDiameterM * 1000;
  const limits = FIT_REFERENCE_LIMITS;
  const errors = [];
  if (diameterMm < limits.minOutsideDiameterMm || diameterMm > limits.maxOutsideDiameterMm) {
    errors.push(error(
      'FIT_INPUT_OUTSIDE_APPLICABILITY',
      'outsideDiameterM',
      `Reference correlation requires outside diameter between ${limits.minOutsideDiameterMm} and ${limits.maxOutsideDiameterMm} mm.`,
      { diameterMm },
    ));
  }

  const boundaries = fitSpanBoundaries(diameterMm);
  const stiffness = classifyFitSupportStiffness(input.maximumUnsupportedSpanM, boundaries);
  const supportCategory = resolveFitSupportCategory(stiffness, diameterMm);
  if (!supportCategory) {
    errors.push(error(
      'FIT_SUPPORT_SIZE_FAMILY_UNRESOLVED',
      'outsideDiameterM',
      'Reference method does not define a deterministic medium/flexible diameter family for this manual diameter.',
      { diameterMm, smallMaxMm: limits.smallFamilyMaxOutsideDiameterMm, largeMinMm: limits.largeFamilyMinOutsideDiameterMm },
    ));
  }

  return Object.freeze({
    applicable: errors.length === 0,
    errors: Object.freeze(errors),
    limitations: Object.freeze([
      'BOUNDED_SCREENING_ONLY_DESIGN_AUTHORITY_FALSE',
      'QST_003_DIAMETER_GAP_219_1_TO_273_MM_FAIL_CLOSED',
      'MAIN_LINE_FIT_ONLY',
    ]),
    support: Object.freeze({ boundaries, stiffness, category: supportCategory }),
  });
}

export function fitAdvancedEligibility(calculation) {
  if (!calculation?.standard || calculation.standard.lof < FIT_REFERENCE_LIMITS.referenceLofThreshold) {
    return Object.freeze({ eligible: false, reason: 'STANDARD_LOF_BELOW_REFERENCE_THRESHOLD' });
  }
  if (!String(calculation.support?.category ?? '').startsWith('FLEXIBLE_')) {
    return Object.freeze({ eligible: false, reason: 'SUPPORT_NOT_FLEXIBLE' });
  }
  const fn = calculation.input?.naturalFrequencyHz;
  if (fn === undefined || fn === null) return Object.freeze({ eligible: false, reason: 'NATURAL_FREQUENCY_REQUIRED' });
  if (fn <= FIT_REFERENCE_LIMITS.advancedNaturalFrequencyMinHz || fn > FIT_REFERENCE_LIMITS.advancedNaturalFrequencyMaxHz) {
    return Object.freeze({
      eligible: false,
      reason: 'NATURAL_FREQUENCY_OUTSIDE_DECLARED_RANGE',
      rangeHz: Object.freeze({
        min: FIT_REFERENCE_LIMITS.advancedNaturalFrequencyMinHz,
        minInclusive: FIT_REFERENCE_LIMITS.advancedNaturalFrequencyMinInclusive,
        max: FIT_REFERENCE_LIMITS.advancedNaturalFrequencyMaxHz,
        maxInclusive: true,
      }),
    });
  }
  return Object.freeze({ eligible: true, reason: 'ELIGIBLE' });
}
