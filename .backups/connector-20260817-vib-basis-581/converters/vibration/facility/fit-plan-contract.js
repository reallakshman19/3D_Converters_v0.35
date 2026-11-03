export const VIBRATION_FACILITY_FIT_PLAN_SCHEMA = 'VibrationFacilityFitPlan.v1';
export const VIBRATION_FACILITY_FIT_CALCULATION_ID = 'VIB.FIV.FLOW_TURBULENCE';

export const FIT_FACILITY_QUALIFICATION_MODES = Object.freeze(['benchmark', 'screening']);

export function normalizeFitFacilityQualificationMode(value = 'benchmark') {
  const mode = String(value ?? 'benchmark').trim().toLowerCase();
  if (!FIT_FACILITY_QUALIFICATION_MODES.includes(mode)) {
    throw fitFacilityPlanError(
      'FIT_FACILITY_QUALIFICATION_MODE_UNSUPPORTED',
      `FIT facility qualification mode must be one of ${FIT_FACILITY_QUALIFICATION_MODES.join(', ')}.`,
      { value },
    );
  }
  return mode;
}

export const FIT_FACILITY_ENRICHMENT_PROPERTIES = Object.freeze({
  ASSESSMENT_POINT: 'FIT_ASSESSMENT_POINT',
  OUTSIDE_DIAMETER: 'OUTSIDE_DIAMETER',
  WALL_THICKNESS: 'WALL_THICKNESS',
  INSIDE_DIAMETER: 'INSIDE_DIAMETER',
  MAX_UNSUPPORTED_SPAN: 'MAX_UNSUPPORTED_SPAN',
  NATURAL_FREQUENCY: 'NATURAL_FREQUENCY',
  PHASE: 'FIT_PHASE',
  MASS_FLOW: 'FIT_MASS_FLOW',
  DENSITY: 'FIT_DENSITY',
  DYNAMIC_VISCOSITY: 'FIT_DYNAMIC_VISCOSITY',
  VELOCITY: 'FIT_VELOCITY',
  MULTIPHASE_RESOLUTION_MODE: 'FIT_MULTIPHASE_RESOLUTION_MODE',
  GAS_MASS_FLOW: 'FIT_GAS_MASS_FLOW',
  GAS_DENSITY: 'FIT_GAS_DENSITY',
  LIQUID_MASS_FLOW: 'FIT_LIQUID_MASS_FLOW',
  LIQUID_DENSITY: 'FIT_LIQUID_DENSITY',
});

export const FIT_FACILITY_SUPPORTED_PHASES = Object.freeze(['LIQUID', 'GAS', 'MULTIPHASE']);

export function fitFacilityPlanError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'VibrationFacilityFitPlanError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}
