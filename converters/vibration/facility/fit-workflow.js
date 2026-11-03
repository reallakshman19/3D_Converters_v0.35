import { assembleVibrationIntegrityDataset } from '../dataset/index.js';
import { buildVibrationFacilityFitPlan } from './fit-plan.js';
import { executeVibrationFacilityFitPlan } from './fit-execute.js';
import { buildVibrationFacilityFitRegister } from './fit-register.js';

export const VIBRATION_FACILITY_FIT_WORKFLOW_SCHEMA = 'VibrationFacilityFitWorkflow.v1';

const ALLOWED_OPTIONS = Object.freeze(new Set(['allowLimitedExchange']));

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function workflowError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'VibrationFacilityFitWorkflowError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function validateOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw workflowError(
      'FIT_FACILITY_WORKFLOW_OPTIONS_INVALID',
      'Facility FIT workflow options must be an object.',
    );
  }
  const unknown = Object.keys(options).filter((key) => !ALLOWED_OPTIONS.has(key));
  if (unknown.length) {
    throw workflowError(
      'FIT_FACILITY_WORKFLOW_OPTION_UNSUPPORTED',
      `Unsupported facility FIT workflow options: ${unknown.join(', ')}.`,
      { unknown },
    );
  }
  if (options.allowLimitedExchange !== undefined && typeof options.allowLimitedExchange !== 'boolean') {
    throw workflowError(
      'FIT_FACILITY_WORKFLOW_OPTIONS_INVALID',
      'allowLimitedExchange must be boolean when supplied.',
      { value: options.allowLimitedExchange },
    );
  }
  return options;
}

function runVibrationFacilityFit(input, options, qualificationMode) {
  const workflowOptions = validateOptions(options);
  const dataset = assembleVibrationIntegrityDataset({
    exchange: input.exchange,
    operatingCases: input.operatingCases ?? [],
    enrichment: input.enrichment ?? [],
  }, {
    allowLimitedExchange: workflowOptions.allowLimitedExchange === true,
  });
  const plan = buildVibrationFacilityFitPlan(dataset, { qualificationMode });
  const result = executeVibrationFacilityFitPlan(plan);
  const register = buildVibrationFacilityFitRegister(result);
  const screening = qualificationMode === 'screening';

  return deepFreeze({
    schema: VIBRATION_FACILITY_FIT_WORKFLOW_SCHEMA,
    authority: 'WORKFLOW_ORCHESTRATION_ONLY',
    engineeringAuthority: screening ? 'SCREENING' : 'NONE',
    screeningAuthorized: screening,
    qualificationMode,
    dataset,
    plan,
    result,
    register,
    summary: register.summary,
    warnings: {
      dataset: dataset.warnings,
      plan: plan.warnings,
      result: result.warnings,
      register: register.warnings,
    },
  });
}

export function runVibrationFacilityFitBenchmark(input = {}, options = {}) {
  return runVibrationFacilityFit(input, options, 'benchmark');
}

export function runVibrationFacilityFitScreening(input = {}, options = {}) {
  return runVibrationFacilityFit(input, options, 'screening');
}
