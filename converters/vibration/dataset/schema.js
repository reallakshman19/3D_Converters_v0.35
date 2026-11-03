export const VIBRATION_INTEGRITY_DATASET_SCHEMA = 'VibrationIntegrityDataset.v1';
export const VIBRATION_INTEGRITY_DATASET_AUTHORITY = 'DATA_ASSEMBLY_ONLY';

export const VIBRATION_OPERATING_CASE_QUANTITIES = Object.freeze([
  'massFlow',
  'density',
  'pressure',
  'temperature',
  'dynamicViscosity',
  'velocity',
]);

export function vibrationDatasetError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'VibrationIntegrityDatasetError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

export function deepFreezeVibrationDataset(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreezeVibrationDataset(child);
  return Object.freeze(value);
}
