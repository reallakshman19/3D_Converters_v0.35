export const ENGINEERING_CALCULATION_CONTRACT_VERSION = 'engineering-calculation-contract/v1';
export const ENGINEERING_CALCULATION_RESULT_VERSION = 'engineering-calculation-result/v1';
export const ENGINEERING_CALCULATION_BATCH_VERSION = 'engineering-calculation-batch/v1';

export const ENGINEERING_CALCULATION_FAMILIES = Object.freeze([
  'PIPE', 'VIB', 'RELIEF', 'SUPPORT', 'EQUIP', 'FLANGE', 'HAZARD', 'ESTIMATION',
]);

export const ENGINEERING_CALCULATION_FAMILY_LABELS = Object.freeze({
  PIPE: 'Pipe Design & Pressure Integrity',
  VIB: 'Vibration & Dynamic Screening',
  RELIEF: 'Relief / Discharge / Transient Loads',
  SUPPORT: 'Local Supports & Attachments',
  EQUIP: 'Equipment Interface Loads',
  FLANGE: 'Flanges & Joints',
  HAZARD: 'Hazard & Special Screening',
  ESTIMATION: 'Engineering Estimation / Empirical Models',
});

export const METHOD_QUALIFICATION_STATES = Object.freeze([
  'CONCEPT', 'SOURCE_INVENTORIED', 'METHOD_SPECIFIED', 'IMPLEMENTED',
  'BENCHMARK_ONLY', 'SCREENING', 'PROJECT_APPROVED', 'VERIFIED',
  'PRODUCTION_AUTHORIZED', 'BLOCKED',
]);

export const DATA_QUALIFICATION_STATES = Object.freeze([
  'DRAFT', 'BENCHMARK_ONLY', 'SCREENING', 'PROJECT_APPROVED', 'VERIFIED', 'RETIRED',
]);

export const ENGINEERING_ERROR_CODES = Object.freeze([
  'CALCULATION_NOT_REGISTERED', 'CONTRACT_VERSION_UNSUPPORTED', 'INPUT_REQUIRED',
  'INPUT_INVALID', 'INPUT_UNIT_UNSUPPORTED', 'INPUT_OUTSIDE_APPLICABILITY',
  'MASTER_DATA_REQUIRED', 'MASTER_RECORD_NOT_FOUND', 'MASTER_RECORD_AMBIGUOUS',
  'MASTER_RECORD_NOT_QUALIFIED', 'ENGINEERING_METHOD_BLOCKED',
  'ENGINEERING_METHOD_NOT_QUALIFIED', 'CALCULATION_FAILED', 'ASSESSMENT_NOT_AVAILABLE',
]);

export function normalizeEngineeringCalculationId(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function createEngineeringCalculationError(code, message, details = {}, field = null) {
  const error = { code, message };
  if (field) error.field = field;
  if (details && Object.keys(details).length) error.details = details;
  return error;
}

export function cloneEngineeringValue(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (seen.has(value)) return seen.get(value);
  const copy = Array.isArray(value) ? [] : {};
  seen.set(value, copy);
  for (const [key, child] of Object.entries(value)) copy[key] = cloneEngineeringValue(child, seen);
  return copy;
}

export function deepFreezeEngineeringValue(value, seen = new WeakSet()) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreezeEngineeringValue(child, seen);
  return Object.freeze(value);
}

export function immutableEngineeringSnapshot(value) {
  return deepFreezeEngineeringValue(cloneEngineeringValue(value));
}

export function normalizeThrownEngineeringError(error, fallbackCode = 'CALCULATION_FAILED') {
  if (error?.code && error?.message) {
    return createEngineeringCalculationError(error.code, error.message, error.details ?? {});
  }
  return createEngineeringCalculationError(
    fallbackCode,
    error instanceof Error ? error.message : String(error ?? 'Unknown calculation error'),
  );
}
