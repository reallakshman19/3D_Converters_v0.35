import { buildVibrationFacilityFitPreflightFromTables } from '../converters/vibration/facility/fit-preflight-tabular.js';
import { serializeVibrationFacilityFitRegisterCsv } from '../converters/vibration/facility/fit-register-export.js';
import { createVibrationFitDataBlockerCsvTemplate } from '../converters/vibration/tabular/fit-data-blockers.js';
import { createVibrationEnrichmentCsvTemplate, createVibrationOperatingCaseCsvTemplate } from '../converters/vibration/tabular/templates.js';
import { buildVibrationWorkspaceModel } from '../converters/vibration/workspace/model.js';
import {
  addVibrationIntegrityInputRow, deleteVibrationIntegrityInputRow,
  revertVibrationIntegrityInputCell, revertVibrationIntegrityInputRow,
  revertVibrationIntegrityInputTable, updateVibrationIntegrityInputCell,
} from './vibration-integrity-input-model.js';
import {
  buildLoadedVibrationIntegrityBenchmark, buildVibrationIntegrityFacilityTableInput,
  captureVibrationIntegrityExecutionState, createVibrationIntegrityInputRuntimeState,
  readVibrationIntegrityInputFile,
} from './vibration-integrity-input-runtime.js';
import { downloadVibrationIntegrityText, ensureVibrationIntegrityStylesheet } from './vibration-integrity-dom.js';
import {
  appendVibrationIntegrityAuditEvent, createVibrationIntegrityAuditLog,
  serializeVibrationIntegrityAuditExport,
} from './vibration-integrity-audit-log.js';
import { serializeVibrationIntegrityRunEvidence } from './vibration-integrity-run-evidence.js';
import {
  executeVibrationIntegrityRun, vibrationIntegrityCapturedInputDrifted,
  vibrationIntegrityRunInputDrifted,
} from './vibration-integrity-run-controller.js';
import {
  createVibrationUserDataUiState, handleVibrationUserDataChange,
  handleVibrationUserDataClick, renderVibrationIntegrityWithUserData,
} from './vibration-integrity-user-data-shell.js?v=20260815-sbc-pf05-cache-1';
import { deriveVibrationIntegrityWorkflowState } from './vibration-integrity-workflow-state.js';

function workspaceOptions(state) {
  const filters = {};
  if (state.filters.line) filters.lines = [state.filters.line];
  if (state.filters.completeness) filters.completenessStatuses = [state.filters.completeness];
  if (state.filters.band) filters.referenceBands = [state.filters.band];
  if (state.filters.candidate === 'true') filters.candidateForEngineeringReview = true;
  if (state.filters.candidate === 'false') filters.candidateForEngineeringReview = false;
  return { filters, sort: { ...state.sort }, ...(state.selectedRowKey ? { selectedRowKey: state.selectedRowKey } : {}) };
}

function initialState() {
  return {
    ...createVibrationIntegrityInputRuntimeState(), ...createVibrationUserDataUiState(),
    preflight: null, envelope: null, workspace: null,
    resultState: 'UNRUN', runSnapshot: null, inputTab: 'engineering',
    filters: { line: '', completeness: '', band: '', candidate: '' },
    sort: { field: 'line', direction: 'asc' }, selectedRowKey: null, detailTab: 'summary',
    auditLog: createVibrationIntegrityAuditLog(),
    busy: false, busyAction: null, error: null, destroyed: false,
  };
}

function inputDriftError() {
  const error = new Error('Working inputs changed while FIT readiness was being evaluated. Run readiness again.');
  error.code = 'VIBRATION_PREFLIGHT_INPUT_DRIFT';
  return error;
}

export function renderVibrationIntegrityTab(container) {
  ensureVibrationIntegrityStylesheet();
  const state = initialState();

  function workflowId() {
    return deriveVibrationIntegrityWorkflowState(state).state;
  }

  function recordAudit(eventType, details = {}, scopeId = null, workflowBefore = undefined) {
    const workflowAfter = workflowId();
    const before = workflowBefore === undefined ? workflowAfter : workflowBefore;
    state.auditLog = appendVibrationIntegrityAuditEvent(state.auditLog, {
      timestamp: new Date().toISOString(), eventType,
      workflowBefore: before, workflowAfter, scopeId, details,
    });
  }

  function render() {
    if (!state.destroyed) container.innerHTML = renderVibrationIntegrityWithUserData(state);
  }

  function discardCalculatedState() {
    state.preflight = null; state.envelope = null; state.workspace = null; state.selectedRowKey = null;
    state.resultState = 'UNRUN'; state.runSnapshot = null;
  }

  function staleCalculatedState() {
    const wasCurrent = state.resultState === 'CURRENT_RESULT';
    state.preflight = null;
    state.resultState = state.envelope?.workflow ? 'STALE_RESULT' : 'UNRUN';
    return wasCurrent && state.resultState === 'STALE_RESULT';
  }

  function syncBenchmarkModified() {
    const loaded = state.benchmark.loaded;
    if (!loaded) return;
    const modified = state.benchmark.detachedFromSource || Object.values(state.tables).some((table) => table.dirty);
    if (loaded.modified !== modified) state.benchmark.loaded = Object.freeze({ ...loaded, modified });
  }

  function rebuildWorkspace() {
    if (!state.envelope?.workflow) { state.workspace = null; return; }
    state.workspace = buildVibrationWorkspaceModel(state.envelope.workflow, workspaceOptions(state));
    if (state.selectedRowKey && !state.workspace.selectedRowKey) state.selectedRowKey = null;
  }

  function recordStale(transitioned, before, trigger, table = null) {
    if (transitioned) recordAudit('RESULT_STALE', { trigger, ...(table ? { table } : {}) }, null, before);
  }

  function applyTableMutation(kind, table, eventType = 'INPUT_EDITED', details = {}) {
    const before = workflowId();
    state.tables[kind] = table;
    if (kind === 'topology') state.allowLimitedExchange = true;
    syncBenchmarkModified();
    const transitioned = staleCalculatedState();
    state.error = null;
    recordAudit(eventType, { table: kind, ...details }, null, before);
    recordStale(transitioned, before, eventType, kind);
    render();
  }

  async function loadFile(target, file) {
    const before = workflowId();
    state.error = null;
    try {
      const loaded = await readVibrationIntegrityInputFile(target, file);
      if (state.destroyed) return;
      state.files[target] = loaded.file; state.tables[target] = loaded.table;
      if (state.benchmark.loaded) state.benchmark.detachedFromSource = true;
      syncBenchmarkModified();
      const transitioned = staleCalculatedState();
      recordAudit('SOURCE_IMPORTED', {
        target, name: loaded.file?.name ?? file.name ?? null,
        format: loaded.file?.format ?? loaded.file?.kind ?? null,
      }, null, before);
      recordStale(transitioned, before, 'SOURCE_IMPORTED', target);
    } catch (error) {
      if (state.destroyed) return;
      state.error = String(error?.message || error);
      recordAudit('SOURCE_IMPORT_FAILED', { target, error: state.error.slice(0, 500) }, null, before);
    }
    render();
  }

  function loadBenchmark() {
    const before = workflowId();
    try {
      const benchmark = buildLoadedVibrationIntegrityBenchmark(state.benchmark.selectedId);
      state.benchmark.loaded = benchmark.loaded; state.benchmark.detachedFromSource = false;
      state.tables = benchmark.tables; state.files = benchmark.files;
      state.allowLimitedExchange = benchmark.allowLimitedExchange; discardCalculatedState(); state.error = null;
      recordAudit('BENCHMARK_LOADED', { benchmarkId: benchmark.loaded?.id ?? state.benchmark.selectedId }, null, before);
    } catch (error) { state.error = String(error?.message || error); }
    render();
  }

  async function checkReadiness() {
    if (!state.tables.topology.rows.length) return;
    const before = workflowId();
    state.busy = true; state.busyAction = 'preflight'; state.error = null;
    recordAudit('READINESS_STARTED', {}, null, before); render();
    try {
      const captured = captureVibrationIntegrityExecutionState(state);
      const tableInput = await buildVibrationIntegrityFacilityTableInput(captured);
      const preflight = buildVibrationFacilityFitPreflightFromTables(
        tableInput, { allowLimitedExchange: captured.allowLimitedExchange },
      );
      if (await vibrationIntegrityCapturedInputDrifted(captured, state)) throw inputDriftError();
      state.preflight = preflight;
      recordAudit('READINESS_COMPLETED', {
        ready: preflight?.preflight?.counts?.ready ?? 0,
        notReady: preflight?.preflight?.counts?.notReady ?? 0,
      }, null, before);
    } catch (error) {
      state.preflight = null; state.error = `${error?.code ? `${error.code}: ` : ''}${String(error?.message || error)}`;
      recordAudit('READINESS_FAILED', { error: state.error.slice(0, 500) }, null, before);
    } finally { state.busy = false; state.busyAction = null; render(); }
  }

  async function runScreening() {
    if (!state.tables.topology.rows.length) return;
    const before = workflowId();
    state.busy = true; state.busyAction = 'screening'; state.resultState = 'RUNNING'; state.error = null;
    recordAudit('FIT_RUN_STARTED', {}, null, before); render();
    try {
      const captured = captureVibrationIntegrityExecutionState(state);
      const { runVibrationFacilityFitScreeningFromTables } = await import('../converters/vibration/facility/fit-workflow-tabular.js');
      const executed = await executeVibrationIntegrityRun(captured, runVibrationFacilityFitScreeningFromTables);
      if (state.destroyed) return;
      state.envelope = executed.envelope;
      const drifted = await vibrationIntegrityRunInputDrifted(executed.runSnapshot, state);
      if (state.destroyed) return;
      state.runSnapshot = Object.freeze({ ...executed.runSnapshot, runId: `FIT-RUN-${new Date().toISOString()}` });
      state.resultState = drifted ? 'STALE_RESULT' : 'CURRENT_RESULT';
      state.selectedRowKey = null; state.detailTab = 'summary'; rebuildWorkspace();
      recordAudit('FIT_RUN_COMPLETED', {
        resultState: state.resultState, runId: state.runSnapshot.runId,
        registerRows: state.envelope?.workflow?.register?.rows?.length ?? 0,
      }, null, 'RUNNING');
    } catch (error) {
      if (state.destroyed) return;
      state.resultState = state.envelope?.workflow ? 'STALE_RESULT' : 'INVALID_INPUT';
      state.error = `${error?.code ? `${error.code}: ` : ''}${String(error?.message || error)}`;
      recordAudit('FIT_RUN_FAILED', { error: state.error.slice(0, 500) }, null, 'RUNNING');
    } finally { state.busy = false; state.busyAction = null; render(); }
  }

  function exportRegister() {
    if (state.resultState !== 'CURRENT_RESULT' || !state.envelope?.workflow?.register) return;
    try {
      downloadVibrationIntegrityText(
        serializeVibrationFacilityFitRegisterCsv(state.envelope.workflow.register),
        'vibration-fit-screening-register.csv',
      );
      recordAudit('REGISTER_EXPORTED', { rows: state.envelope.workflow.register.rows?.length ?? 0 });
      render();
    } catch (error) { state.error = String(error?.message || error); render(); }
  }

  async function exportRunEvidence() {
    if (state.resultState !== 'CURRENT_RESULT') return;
    recordAudit('RUN_EVIDENCE_EXPORT_STARTED', { runId: state.runSnapshot?.runId ?? null });
    try {
      const payload = await serializeVibrationIntegrityRunEvidence(state);
      downloadVibrationIntegrityText(payload, 'vibration-fit-run-evidence.json', 'application/json;charset=utf-8');
      recordAudit('RUN_EVIDENCE_EXPORTED', { runId: state.runSnapshot?.runId ?? null });
      render();
    } catch (error) {
      state.error = `${error?.code ? `${error.code}: ` : ''}${String(error?.message || error)}`; render();
    }
  }

  function exportAudit() {
    try {
      const payload = serializeVibrationIntegrityAuditExport(state, new Date().toISOString());
      downloadVibrationIntegrityText(payload, 'vibration-integrity-activity-log.json', 'application/json;charset=utf-8');
      recordAudit('AUDIT_EXPORTED', { exportedEvents: state.auditLog.events.length });
      render();
    } catch (error) { state.error = String(error?.message || error); render(); }
  }

  function applyPresentationChange() {
    try { rebuildWorkspace(); state.error = null; } catch (error) { state.error = String(error?.message || error); }
    render();
  }

  function handleTableClick(event) {
    const addKind = event.target.closest('[data-vi-table-add]')?.dataset.viTableAdd;
    if (addKind) {
      applyTableMutation(addKind, addVibrationIntegrityInputRow(state.tables[addKind]), 'INPUT_ROW_ADDED'); return true;
    }
    const revertTableKind = event.target.closest('[data-vi-table-revert]')?.dataset.viTableRevert;
    if (revertTableKind) {
      applyTableMutation(revertTableKind, revertVibrationIntegrityInputTable(state.tables[revertTableKind]), 'INPUT_REVERTED', { level: 'table' }); return true;
    }
    const revertCell = event.target.closest('[data-vi-cell-revert]');
    if (revertCell) {
      const kind = revertCell.dataset.viCellRevert;
      applyTableMutation(kind, revertVibrationIntegrityInputCell(
        state.tables[kind], Number(revertCell.dataset.viEditRow), Number(revertCell.dataset.viEditColumn),
      ), 'INPUT_REVERTED', { level: 'cell' });
      return true;
    }
    const revertRow = event.target.closest('[data-vi-row-revert]');
    if (revertRow) {
      const kind = revertRow.dataset.viRowRevert;
      applyTableMutation(kind, revertVibrationIntegrityInputRow(
        state.tables[kind], Number(revertRow.dataset.viEditRow),
      ), 'INPUT_REVERTED', { level: 'row' });
      return true;
    }
    const button = event.target.closest('[data-vi-table-delete]');
    if (!button) return false;
    const kind = button.dataset.viTableDelete;
    applyTableMutation(kind, deleteVibrationIntegrityInputRow(
      state.tables[kind], Number(button.dataset.viEditRow),
    ), 'INPUT_ROW_DELETED');
    return true;
  }

  function openSourceTarget(sourceTarget) {
    state.inputTab = 'source';
    render();
    const target = container.ownerDocument?.getElementById(sourceTarget);
    if (!target) return;
    target.focus?.({ preventScroll: true });
    target.scrollIntoView?.({ block: 'center' });
  }

  function onClick(event) {
    if (handleVibrationUserDataClick(state, event, render, recordAudit)) return;
    if (handleTableClick(event)) return;
    const sourceTarget = event.target.closest('[data-vi-source-target]')?.dataset.viSourceTarget;
    if (sourceTarget) { event.preventDefault(); openSourceTarget(sourceTarget); return; }
    const inputTab = event.target.closest('[data-vi-input-tab]')?.dataset.viInputTab;
    if (inputTab) { state.inputTab = inputTab; return render(); }
    const row = event.target.closest('[data-vi-row]');
    if (row) { state.selectedRowKey = row.dataset.viRow; state.detailTab = 'summary'; return applyPresentationChange(); }
    const detail = event.target.closest('[data-vi-detail]');
    if (detail) { state.detailTab = detail.dataset.viDetail; return render(); }
    const action = event.target.closest('[data-vi-action]')?.dataset.viAction;
    if (action === 'load-benchmark') loadBenchmark();
    if (action === 'preflight') checkReadiness();
    if (action === 'run') runScreening();
    if (action === 'export') exportRegister();
    if (action === 'export-evidence') exportRunEvidence();
    if (action === 'export-audit') exportAudit();
    if (action === 'operating-template') downloadVibrationIntegrityText(createVibrationOperatingCaseCsvTemplate(), 'vibration-operating-cases-v1.csv');
    if (action === 'enrichment-template') downloadVibrationIntegrityText(createVibrationEnrichmentCsvTemplate(), 'vibration-enrichment-v1.csv');
    if (action === 'data-blocker-template') downloadVibrationIntegrityText(createVibrationFitDataBlockerCsvTemplate(), 'vibration-fit-data-blockers-v1.csv');
  }

  function handleTableChange(event) {
    const kind = event.target.dataset.viTableCell;
    if (!kind) return false;
    const table = updateVibrationIntegrityInputCell(
      state.tables[kind], Number(event.target.dataset.viEditRow),
      Number(event.target.dataset.viEditColumn), event.target.value,
    );
    applyTableMutation(kind, table, 'INPUT_EDITED'); return true;
  }

  function onChange(event) {
    if (handleVibrationUserDataChange(state, event, render, recordAudit)) return;
    const fileTarget = event.target.dataset.viFile;
    if (fileTarget) { const file = event.target.files?.[0]; if (file) loadFile(fileTarget, file); return; }
    if (event.target.matches('[data-vi-benchmark-select]')) { state.benchmark.selectedId = event.target.value; return render(); }
    if (event.target.matches('[data-vi-limited]')) {
      const before = workflowId();
      state.allowLimitedExchange = event.target.checked;
      const transitioned = staleCalculatedState();
      recordAudit('INPUT_EDITED', { option: 'allowLimitedExchange', value: event.target.checked }, null, before);
      recordStale(transitioned, before, 'INPUT_EDITED');
      return render();
    }
    if (handleTableChange(event)) return;
    const filter = event.target.dataset.viFilter;
    if (filter) { state.filters[filter] = event.target.value; return applyPresentationChange(); }
    const sort = event.target.dataset.viSort;
    if (sort) { state.sort[sort] = event.target.value; applyPresentationChange(); }
  }

  recordAudit('WORKSPACE_OPENED', {}, null, null);
  container.addEventListener('click', onClick); container.addEventListener('change', onChange); render();
  return () => {
    state.destroyed = true; container.removeEventListener('click', onClick); container.removeEventListener('change', onChange);
  };
}
