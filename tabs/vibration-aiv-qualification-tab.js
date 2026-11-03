import { createAivAssessmentCsvTemplate } from '../converters/vibration/aiv/assessment-csv.js';
import {
  AIV_DEFAULT_ASSUMPTION_PROFILE,
  updateAivAssumptionProfile,
} from '../converters/vibration/aiv/aiv-assumption-profile.js';
import { createAivSourceCsvTemplate } from '../converters/vibration/aiv/source-csv.js';
import { createAivSourceAssessmentCsvTemplate } from '../converters/vibration/aiv/source-assessment-csv.js';
import { createAivAssumptionAcceptanceController } from './vibration-aiv-assumption-acceptance-controller.js';
import {
  addAivInputRow,
  addAivRelationshipInputRow,
  deleteAivInputRow,
  findAivRelationshipInputRowIndex,
  updateAivInputCell,
} from './vibration-aiv-input-model.js';
import { createAivCanvasExportController } from './vibration-aiv-canvas-export-controller.js?v=20260816-aiv-canvas-release-1';
import { aivRelationshipIdentityFromTableRow, confirmAivRelationshipDelete } from './vibration-aiv-delete-safeguard.js';
import { markAivEngineeringInputChanged } from './vibration-aiv-engineering-revision.js?v=20260816-aiv-526-editor-3';
import { createAivExecutionActions } from './vibration-aiv-execution.js?v=20260816-aiv-526-editor-3';
import { createAivDatasetLoader } from './vibration-aiv-dataset-loader.js?v=20260816-aiv-526-editor-3';
import { createAivMasterDbController } from './vibration-aiv-master-db-controller.js?v=20260816-aiv-526-editor-3';
import {
  assertAivTableMutationAllowed,
  detachAivGeneratedTables,
  markAivTableDrivenInputChanged,
} from './vibration-aiv-mode-transition.js?v=20260816-aiv-526-editor-3';
import { renderAivQualificationWorkspaceHtml } from './vibration-aiv-qualification-view.js?v=20260816-aiv-canvas-release-1';
import { createInitialAivQualificationState } from './vibration-aiv-state.js?v=20260816-aiv-526-editor-3';
import { captureAivUiContext, restoreAivUiContext } from './vibration-aiv-ui-context.js';
import { createAivUnifiedCanvasController } from './vibration-aiv-unified-canvas-controller.js?v=20260816-aiv-canvas-release-1';
import { renderAivUnifiedCanvasSelectedDetailHtml } from './vibration-aiv-unified-canvas-inspector.js?v=20260816-aiv-canvas-release-1';
import {
  addAivUnifiedCanvasTableRow,
  readAivUnifiedCanvasTableDraft,
  validateAivUnifiedCanvasTableDraft,
} from './vibration-aiv-unified-canvas-table-author.js';
import { downloadAivText, ensureAivQualificationStylesheet } from './vibration-aiv-workspace-browser.js';
import { applyAivFlareNetworkPresentationState, loadAivSmallFlareMock } from './vibration-aiv-workspace-loaders.js?v=20260816-aiv-526-editor-3';

export function renderAivQualificationWorkspace(container) {
  ensureAivQualificationStylesheet();
  const state = createInitialAivQualificationState();
  const canvasController = createAivUnifiedCanvasController(container, {
    getNetwork: () => state.flareNetwork,
    onNetworkChange: applyFlareNetwork,
    onPresentationChange: applyFlareNetworkPresentation,
    onCreateRelationship: createCanvasRelationship,
    onDeleteRelationship: deleteCanvasRelationship,
    onSelectionChange: updateCanvasSelectionDetail,
    onFieldCommit: (fieldKey) => { state.lastCommittedAivFieldKey = fieldKey || null; },
    onError: (error) => { state.error = String(error?.message || error); render(); },
  });
  const canvasExportController = createAivCanvasExportController(container, {
    getState: () => state,
    getLayout: () => canvasController.getLayout(),
  });
  const execution = createAivExecutionActions({ state, render, downloadText: downloadAivText });
  const assumptionAcceptanceController = createAivAssumptionAcceptanceController({ state, render, container });
  const masterDbController = createAivMasterDbController({
    state,
    render,
    clearReadiness: execution.clearReadiness,
    onEngineeringInputsChanged: () => markAivEngineeringInputChanged(state),
  });
  const datasetLoader = createAivDatasetLoader({
    state, render, clearReadiness: execution.clearReadiness,
    clearMasterResolution: () => masterDbController.clearResolution({ clearDerivedValues: true }),
    onDatasetLoaded: () => masterDbController.apply({ silent: true }),
  });

  function showCanvasError(error) {
    state.canvasError = String(error?.message || error);
    const canvasCard = container.querySelector('.aiv-canvas-card');
    const documentRef = container.ownerDocument ?? globalThis.document;
    if (!canvasCard || !documentRef?.createElement) return;
    const banner = documentRef.createElement('div');
    banner.className = 'aivq-banner is-warning';
    banner.dataset.aivCanvasError = 'true';
    banner.textContent = `Canvas unavailable: ${state.canvasError}. Engineering tables and screening controls remain authoritative and usable.`;
    canvasCard.prepend(banner);
  }

  function render() {
    if (state.destroyed) return;
    const uiContext = captureAivUiContext(container);
    state.canvasError = null;
    container.innerHTML = renderAivQualificationWorkspaceHtml(state);
    try { canvasController.sync(); } catch (error) { showCanvasError(error); }
    canvasExportController.sync();
    restoreAivUiContext(container, uiContext);
  }

  function updateCanvasSelectionDetail(selection) {
    state.selectedCanvasKey = selection?.selectionKey ?? null;
    const host = container.querySelector('[data-aiv-canvas-selected-detail-host]');
    if (host) host.innerHTML = renderAivUnifiedCanvasSelectedDetailHtml(state, state.selectedCanvasKey);
  }

  function applyFlareNetworkPresentation(network) {
    applyAivFlareNetworkPresentationState(state, network);
    render();
  }

  function applyFlareNetwork(network, options = {}) {
    datasetLoader.applyFlareNetwork(network, options);
  }

  function tableMutationAllowed() {
    try {
      assertAivTableMutationAllowed(state);
      return true;
    } catch (error) {
      state.error = String(error?.message || error);
      render();
      return false;
    }
  }

  function applyTableMutation(kind, table, preserveMasterResolution = false) {
    assertAivTableMutationAllowed(state);
    state.tables[kind] = table;
    if (!preserveMasterResolution) masterDbController.clearResolution();
    markAivTableDrivenInputChanged(state);
    datasetLoader.markBenchmarkModified();
    execution.clearReadiness();
    state.error = null;
    render();
  }

  function detachGeneratedTables() {
    try {
      detachAivGeneratedTables(state);
      datasetLoader.markBenchmarkModified();
      execution.clearReadiness();
      state.error = null;
    } catch (error) {
      state.error = String(error?.message || error);
    }
    render();
  }

  function effectiveRelationshipTable() {
    return state.assumptionResolution?.tables?.relationships ?? state.tables.relationships;
  }

  function createCanvasRelationship(input) {
    try {
      assertAivTableMutationAllowed(state);
      if (findAivRelationshipInputRowIndex(effectiveRelationshipTable(), input) >= 0) {
        throw new Error('AIV_INPUT_RELATIONSHIP_DUPLICATE: Relationship already exists for the selected source, assessment and operating case.');
      }
      applyTableMutation('relationships', addAivRelationshipInputRow(state.tables.relationships, input), true);
      return true;
    } catch (error) {
      state.error = String(error?.message || error);
      render();
      return false;
    }
  }

  function deleteCanvasRelationship(input) {
    try {
      assertAivTableMutationAllowed(state);
      if (!confirmAivRelationshipDelete(input)) return false;
      const rowIndex = findAivRelationshipInputRowIndex(effectiveRelationshipTable(), input);
      if (rowIndex < 0) throw new Error('AIV_INPUT_RELATIONSHIP_NOT_FOUND: Selected relationship no longer exists.');
      masterDbController.noteRowDeleted('relationships', rowIndex);
      applyTableMutation('relationships', deleteAivInputRow(state.tables.relationships, rowIndex), true);
      return true;
    } catch (error) {
      state.error = String(error?.message || error);
      render();
      return false;
    }
  }

  function createTableCanvasItem(action) {
    const kind = action === 'add-source' ? 'sources' : action === 'add-assessment' ? 'assessments' : null;
    if (!kind || !tableMutationAllowed()) return Boolean(kind);
    try {
      const values = readAivUnifiedCanvasTableDraft(container, kind);
      validateAivUnifiedCanvasTableDraft(kind, values);
      state.selectedCanvasKey = kind === 'sources'
        ? `SOURCE:${values['Source Canonical ID']}:${values['Operating Case']}`
        : `ASSESSMENT:${values['Assessment Canonical ID']}`;
      applyTableMutation(kind, addAivUnifiedCanvasTableRow(state.tables[kind], values), true);
    } catch (error) {
      state.error = String(error?.message || error);
      render();
    }
    return true;
  }

  function handleTableClick(event) {
    const canvasAction = event.target.closest('[data-aiv-canvas-table-action]')?.dataset.aivCanvasTableAction;
    if (canvasAction && createTableCanvasItem(canvasAction)) return true;
    const addKind = event.target.closest('[data-aiv-table-add]')?.dataset.aivTableAdd;
    if (addKind) {
      if (!tableMutationAllowed()) return true;
      applyTableMutation(addKind, addAivInputRow(state.tables[addKind]), true);
      return true;
    }
    const button = event.target.closest('[data-aiv-table-delete]');
    if (!button) return false;
    if (!tableMutationAllowed()) return true;
    const kind = button.dataset.aivTableDelete;
    const rowIndex = Number(button.dataset.aivEditRow);
    if (kind === 'relationships' && !confirmAivRelationshipDelete(aivRelationshipIdentityFromTableRow(state.tables.relationships, rowIndex))) return true;
    masterDbController.noteRowDeleted(kind, rowIndex);
    applyTableMutation(kind, deleteAivInputRow(state.tables[kind], rowIndex), true);
    return true;
  }

  function resetAssumptions() {
    state.assumptionProfile = AIV_DEFAULT_ASSUMPTION_PROFILE;
    state.assumptionProfileModified = false;
    markAivEngineeringInputChanged(state);
    execution.clearReadiness();
    state.error = null;
    render();
  }

  function onClick(event) {
    if (event.target.closest('[data-aiv-network-editor]')) return;
    if (handleTableClick(event)) return;
    const row = event.target.closest('[data-aiv-row]');
    if (row) {
      state.selectedRowKey = row.dataset.aivRow;
      render();
      return;
    }
    const action = event.target.closest('[data-aiv-action]')?.dataset.aivAction;
    if (assumptionAcceptanceController.handleAction(action)) return;
    if (action === 'detach-generated-tables') detachGeneratedTables();
    if (action === 'apply-master-data') masterDbController.apply();
    if (action === 'load-mock-flare-network') loadAivSmallFlareMock(state, applyFlareNetwork);
    if (action === 'load-d23-benchmark') datasetLoader.loadBenchmark();
    if (action === 'source-template') downloadAivText(createAivSourceCsvTemplate(), 'aiv-sources-v2.csv');
    if (action === 'assessment-template') downloadAivText(createAivAssessmentCsvTemplate(), 'aiv-assessments-v1.csv');
    if (action === 'relationship-template') downloadAivText(createAivSourceAssessmentCsvTemplate(), 'aiv-source-assessment-v1.csv');
    if (action === 'check-readiness') execution.checkReadiness();
    if (action === 'run-screening') execution.runScreening();
    if (action === 'export-d23-validation') execution.exportValidatedBenchmark();
    if (action === 'export-screening-result') execution.exportScreeningResult();
    if (action === 'export-eit') execution.exportEit();
    if (action === 'reset-assumptions') resetAssumptions();
  }

  function handleTableChange(event) {
    const kind = event.target.dataset.aivTableCell;
    if (!kind) return false;
    if (!tableMutationAllowed()) return true;
    state.lastCommittedAivFieldKey = event.target.dataset.aivFieldKey ?? state.lastCommittedAivFieldKey ?? null;
    const rowIndex = Number(event.target.dataset.aivEditRow);
    const columnIndex = Number(event.target.dataset.aivEditColumn);
    const baseTable = masterDbController.prepareUserEdit(kind, rowIndex, columnIndex);
    applyTableMutation(kind, updateAivInputCell(
      baseTable,
      rowIndex,
      columnIndex,
      event.target.value,
    ), true);
    return true;
  }

  function onChange(event) {
    if (event.target.closest('[data-aiv-network-editor]')) return;
    const assumptionPath = event.target.dataset.aivAssumption;
    if (assumptionPath) {
      try {
        state.assumptionProfile = updateAivAssumptionProfile(state.assumptionProfile, assumptionPath, event.target.value);
        state.assumptionProfileModified = true;
        markAivEngineeringInputChanged(state);
        execution.clearReadiness();
        state.error = null;
      } catch (error) {
        state.error = String(error?.message || error);
      }
      render();
      return;
    }
    const target = event.target.dataset.aivFile;
    if (target) {
      const file = event.target.files?.[0];
      if (file) datasetLoader.loadFile(target, file);
      return;
    }
    handleTableChange(event);
  }

  container.addEventListener('click', onClick);
  container.addEventListener('change', onChange);
  render();
  masterDbController.loadBundled();

  return () => {
    state.destroyed = true;
    canvasExportController.destroy();
    canvasController.destroy();
    container.removeEventListener('click', onClick);
    container.removeEventListener('change', onChange);
  };
}
