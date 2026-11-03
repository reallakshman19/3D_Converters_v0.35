import { assembleVibrationIntegrityDataset } from '../dataset/index.js';
import { buildVibrationFacilityFitPlan } from './fit-plan.js';

export const VIBRATION_FACILITY_FIT_PREFLIGHT_SCHEMA = 'VibrationFacilityFitPreflight.v1';

const ALLOWED_OPTIONS = new Set(['allowLimitedExchange']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function preflightError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'VibrationFacilityFitPreflightError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function validateOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw preflightError('FIT_PREFLIGHT_OPTIONS_INVALID', 'FIT preflight options must be an object.');
  }
  const unknown = Object.keys(options).filter((key) => !ALLOWED_OPTIONS.has(key));
  if (unknown.length) {
    throw preflightError(
      'FIT_PREFLIGHT_OPTION_UNSUPPORTED',
      `Unsupported FIT preflight options: ${unknown.join(', ')}.`,
      { unknown },
    );
  }
  if (options.allowLimitedExchange !== undefined && typeof options.allowLimitedExchange !== 'boolean') {
    throw preflightError(
      'FIT_PREFLIGHT_OPTIONS_INVALID',
      'allowLimitedExchange must be boolean when supplied.',
      { value: options.allowLimitedExchange },
    );
  }
  return options;
}

function projectItem(item) {
  return {
    canonicalId: item.canonicalId,
    line: item.line,
    caseId: item.caseId,
    status: item.status,
    missing: Object.freeze([...(item.missing ?? [])]),
    invalid: Object.freeze([...(item.invalid ?? [])]),
    reasons: Object.freeze([...(item.reasons ?? [])]),
    requestPrepared: item.status === 'READY' && Boolean(item.request),
    sourceTrace: item.sourceTrace ?? null,
  };
}

export function buildVibrationFacilityFitPreflight(input = {}, optionsInput = {}) {
  const options = validateOptions(optionsInput);
  const dataset = assembleVibrationIntegrityDataset({
    exchange: input.exchange,
    operatingCases: input.operatingCases ?? [],
    enrichment: input.enrichment ?? [],
  }, {
    allowLimitedExchange: options.allowLimitedExchange === true,
  });
  const plan = buildVibrationFacilityFitPlan(dataset);
  const rows = plan.items.map(projectItem);

  return deepFreeze({
    schema: VIBRATION_FACILITY_FIT_PREFLIGHT_SCHEMA,
    authority: 'PREFLIGHT_ONLY',
    engineeringAuthority: 'NONE',
    screeningAuthorized: false,
    qualificationMode: 'benchmark',
    dataset,
    plan,
    rows,
    counts: {
      assessmentPoints: plan.counts.assessmentPoints,
      rows: rows.length,
      ready: rows.filter((row) => row.status === 'READY').length,
      notReady: rows.filter((row) => row.status !== 'READY').length,
    },
    warnings: {
      dataset: dataset.warnings,
      plan: plan.warnings,
    },
  });
}
