import { parseVibrationFacilityFitTables } from './fit-tables.js';
import {
  runVibrationFacilityFitBenchmark,
  runVibrationFacilityFitScreening,
} from './fit-workflow.js';

export const VIBRATION_FACILITY_FIT_TABULAR_WORKFLOW_SCHEMA = 'VibrationFacilityFitTabularWorkflow.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function runTabular(input, options, runner, qualificationMode) {
  const parsed = parseVibrationFacilityFitTables(input);
  const workflow = runner(parsed, options);
  const screening = qualificationMode === 'screening';
  return deepFreeze({
    schema: VIBRATION_FACILITY_FIT_TABULAR_WORKFLOW_SCHEMA,
    authority: 'TABULAR_WORKFLOW_ORCHESTRATION_ONLY',
    engineeringAuthority: screening ? 'SCREENING' : 'NONE',
    screeningAuthorized: screening,
    qualificationMode,
    imports: parsed.imports,
    workflow,
  });
}

export function runVibrationFacilityFitBenchmarkFromTables(input = {}, options = {}) {
  return runTabular(input, options, runVibrationFacilityFitBenchmark, 'benchmark');
}

export function runVibrationFacilityFitScreeningFromTables(input = {}, options = {}) {
  return runTabular(input, options, runVibrationFacilityFitScreening, 'screening');
}

export { VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT } from './fit-tables.js';
