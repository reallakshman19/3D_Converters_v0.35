import { buildVibrationWorkspaceDetail } from './detail.js';
import {
  buildWorkspaceQuery,
  normalizeWorkspaceFilters,
  normalizeWorkspaceSort,
  serializeWorkspaceFilters,
  vibrationWorkspaceRowKey,
  workspaceQueryError,
} from './query.js';

export const VIBRATION_WORKSPACE_MODEL_SCHEMA = 'VibrationWorkspaceModel.v1';
const SOURCE_WORKFLOW_SCHEMA = 'VibrationFacilityFitWorkflow.v1';
const SOURCE_REGISTER_SCHEMA = 'VibrationFacilityFitRegister.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function workflowAuthorityValid(workflow) {
  if (workflow.qualificationMode === 'benchmark') {
    return workflow.screeningAuthorized === false && workflow.engineeringAuthority === 'NONE';
  }
  if (workflow.qualificationMode === 'screening') {
    return workflow.screeningAuthorized === true && workflow.engineeringAuthority === 'SCREENING';
  }
  return false;
}

function assertWorkflow(workflow) {
  if (workflow?.schema !== SOURCE_WORKFLOW_SCHEMA) {
    throw workspaceQueryError(
      'VIBRATION_WORKSPACE_WORKFLOW_SCHEMA_MISMATCH',
      `Workspace requires ${SOURCE_WORKFLOW_SCHEMA}.`,
      { actual: workflow?.schema ?? null },
    );
  }
  if (workflow.register?.schema !== SOURCE_REGISTER_SCHEMA || !Array.isArray(workflow.register.rows)) {
    throw workspaceQueryError(
      'VIBRATION_WORKSPACE_REGISTER_INVALID',
      `Workspace requires ${SOURCE_REGISTER_SCHEMA} rows.`,
    );
  }
  if (!workflowAuthorityValid(workflow)) {
    throw workspaceQueryError(
      'VIBRATION_WORKSPACE_AUTHORITY_VIOLATION',
      'Workspace accepts only coherent FIT benchmark or bounded-screening workflow authority.',
      {
        qualificationMode: workflow.qualificationMode ?? null,
        screeningAuthorized: workflow.screeningAuthorized ?? null,
        engineeringAuthority: workflow.engineeringAuthority ?? null,
      },
    );
  }
  return workflow;
}

function validateOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw workspaceQueryError('VIBRATION_WORKSPACE_OPTIONS_INVALID', 'Workspace options must be an object.');
  }
  const unknown = Object.keys(options).filter((key) => !['filters', 'sort', 'selectedRowKey'].includes(key));
  if (unknown.length) {
    throw workspaceQueryError(
      'VIBRATION_WORKSPACE_OPTION_UNSUPPORTED',
      `Unsupported workspace options: ${unknown.join(', ')}.`,
      { unknown },
    );
  }
  if (options.selectedRowKey !== undefined && typeof options.selectedRowKey !== 'string') {
    throw workspaceQueryError(
      'VIBRATION_WORKSPACE_SELECTION_INVALID',
      'selectedRowKey must be a string when supplied.',
    );
  }
  return options;
}

function workspaceWarnings(workflow, selectedRow, selectedRowKey) {
  return [
    ...(selectedRow === null && selectedRowKey !== undefined ? [{
      code: 'WORKSPACE_SELECTION_NOT_FOUND',
      message: 'The selected row key does not exist in the source register.',
    }] : []),
    ...((workflow.register.warnings ?? []).map((warning) => ({ ...warning, source: 'REGISTER' }))),
  ];
}

export function buildVibrationWorkspaceModel(workflowInput = {}, optionsInput = {}) {
  const workflow = assertWorkflow(workflowInput);
  const options = validateOptions(optionsInput);
  const filters = normalizeWorkspaceFilters(options.filters ?? {});
  const sort = normalizeWorkspaceSort(options.sort ?? {});
  const query = buildWorkspaceQuery(workflow.register.rows, filters, sort);
  const selectedRow = options.selectedRowKey === undefined
    ? null
    : query.allRows.find((row) => row.rowKey === options.selectedRowKey) ?? null;

  return deepFreeze({
    schema: VIBRATION_WORKSPACE_MODEL_SCHEMA,
    authority: 'READ_MODEL_ONLY',
    engineeringAuthority: workflow.engineeringAuthority,
    screeningAuthorized: workflow.screeningAuthorized,
    qualificationMode: workflow.qualificationMode,
    sourceWorkflowSchema: workflow.schema,
    summary: query.summary,
    filters: serializeWorkspaceFilters(filters),
    sort,
    rows: query.visibleRows,
    selectedRowKey: selectedRow?.rowKey ?? null,
    detail: buildVibrationWorkspaceDetail(workflow, selectedRow),
    warnings: workspaceWarnings(workflow, selectedRow, options.selectedRowKey),
  });
}

export { vibrationWorkspaceRowKey };
