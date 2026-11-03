export const VIBRATION_INTEGRITY_WORKFLOW_SCHEMA = 'VibrationIntegrityWorkflowState.v1';

export const VIBRATION_INTEGRITY_WORKFLOW_STATES = Object.freeze([
  'EMPTY',
  'INPUTS_LOADED',
  'READY_CHECKED',
  'RUNNING',
  'RESULT_CURRENT',
  'RESULT_STALE',
  'INVALID_INPUT',
]);

const ACTIONS = Object.freeze({
  EMPTY: ['LOAD_INPUTS', 'Load project inputs or a controlled benchmark'],
  INPUTS_LOADED: ['CHECK_READINESS', 'Check readiness'],
  RUNNING: ['RUN_IN_PROGRESS', 'Execution in progress'],
  RESULT_CURRENT: ['REVIEW_AND_EXPORT', 'Review governing results and export evidence'],
  RESULT_STALE: ['RERUN_SCREENING', 'Rerun screening with the current inputs'],
  INVALID_INPUT: ['CORRECT_INPUTS', 'Correct invalid or incomplete inputs'],
});

function topologyRows(state) {
  return state?.tables?.topology?.rows?.length ?? 0;
}

function readinessCounts(state) {
  const counts = state?.preflight?.preflight?.counts ?? null;
  return counts ? {
    ready: Number(counts.ready ?? 0),
    notReady: Number(counts.notReady ?? 0),
    assessmentPoints: Number(counts.assessmentPoints ?? 0),
  } : null;
}

function workflowStateId(state) {
  if (state?.busyAction === 'screening' || state?.resultState === 'RUNNING') return 'RUNNING';
  if (state?.resultState === 'CURRENT_RESULT') return 'RESULT_CURRENT';
  if (state?.resultState === 'STALE_RESULT') return 'RESULT_STALE';
  if (state?.resultState === 'INVALID_INPUT') return 'INVALID_INPUT';
  if (state?.preflight?.preflight) return 'READY_CHECKED';
  if (topologyRows(state) > 0) return 'INPUTS_LOADED';
  return 'EMPTY';
}

function readyCheckedAction(counts) {
  if ((counts?.notReady ?? 0) > 0) {
    return ['RESOLVE_READINESS', 'Resolve readiness blockers'];
  }
  return ['RUN_SCREENING', 'Run FIT screening'];
}

export function deriveVibrationIntegrityWorkflowState(state = {}) {
  const id = workflowStateId(state);
  const counts = readinessCounts(state);
  const [nextAction, nextActionLabel] = id === 'READY_CHECKED'
    ? readyCheckedAction(counts)
    : ACTIONS[id];
  return Object.freeze({
    schema: VIBRATION_INTEGRITY_WORKFLOW_SCHEMA,
    state: id,
    nextAction,
    nextActionLabel,
    topologyRowCount: topologyRows(state),
    readiness: counts ? Object.freeze(counts) : null,
    resultState: state?.resultState ?? 'UNRUN',
    busyAction: state?.busyAction ?? null,
  });
}
