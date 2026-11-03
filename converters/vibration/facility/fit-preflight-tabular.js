import { buildVibrationFacilityFitPreflight } from './fit-preflight.js';
import { parseVibrationFacilityFitTables } from './fit-tables.js';

export const VIBRATION_FACILITY_FIT_TABULAR_PREFLIGHT_SCHEMA = 'VibrationFacilityFitTabularPreflight.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function buildVibrationFacilityFitPreflightFromTables(input = {}, options = {}) {
  const parsed = parseVibrationFacilityFitTables(input);
  const preflight = buildVibrationFacilityFitPreflight(parsed, options);
  return deepFreeze({
    schema: VIBRATION_FACILITY_FIT_TABULAR_PREFLIGHT_SCHEMA,
    authority: 'TABULAR_PREFLIGHT_ONLY',
    engineeringAuthority: 'NONE',
    screeningAuthorized: false,
    qualificationMode: 'benchmark',
    imports: parsed.imports,
    preflight,
  });
}
