import { calculateSbcType3FromUserEngineeringData } from '../converters/vibration/sbc/type3-user-data.js?v=20260815-sbc-pf05-cache-1';
import {
  createMechanicalFacilityUiState,
  handleMechanicalFacilityChange,
  handleMechanicalFacilityClick,
} from './vibration-integrity-mechanical-controller.js';
import { renderVibrationIntegrityActivity } from './vibration-integrity-activity-view.js';
import { renderMechanicalFacilityPanel } from './vibration-integrity-mechanical-view.js';
import {
  handleSbcType3Change,
  handleSbcType3Click,
} from './vibration-integrity-sbc-type3-controller.js?v=20260815-sbc-pf05-cache-1';
import {
  createSbcType3UiState,
  recordSbcType3UserDataTableMutation,
} from './vibration-integrity-sbc-type3-state.js?v=20260815-sbc-pf05-cache-1';
import { renderSbcType3UserInputPanel } from './vibration-integrity-sbc-type3-view.js?v=20260815-sbc-pf05-cache-1';
import { VIBRATION_INTEGRITY_UI_CONTRACT } from './vibration-integrity-ui-contract.js';
import {
  addSbcT3UserEngineeringDataRows,
  addSbcType3UserEngineeringDataRows,
  addVibrationUserEngineeringDataRow,
  createVibrationUserEngineeringDataTable,
  deleteVibrationUserEngineeringDataRow,
  updateVibrationUserEngineeringDataCell,
  vibrationUserEngineeringDataResolverRows,
} from './vibration-integrity-user-data-model.js';
import { renderVibrationUserEngineeringData } from './vibration-integrity-user-data-view.js';
import { renderVibrationIntegrityHtml } from './vibration-integrity-view.js?v=20260815-sbc-pf05-cache-1';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function tabButton(tab, active) {
  return `<button type="button" class="vi-detail-tab${active === tab.id ? ' is-active' : ''}" data-vi-workspace-tab="${tab.id}">${tab.label}</button>`;
}

function workspaceTabs(active) {
  return `<nav class="vi-detail-tabs" aria-label="Vibration Integrity workspace tabs">
    ${VIBRATION_INTEGRITY_UI_CONTRACT.workspaceTabs.map((tab) => tabButton(tab, active)).join('')}
  </nav>`;
}

function injectWorkspaceTabs(html, tabs) {
  const marker = '</header>';
  const index = html.indexOf(marker);
  if (index < 0) return `${tabs}${html}`;
  const insertion = index + marker.length;
  return `${html.slice(0, insertion)}${tabs}${html.slice(insertion)}`;
}

function userDataPage(state) {
  return `<div class="vi-root">
    <header class="vi-header"><div><h2>Vibration Integrity</h2><p>Project-specific engineering data for vibration mechanisms when governed master data is unavailable.</p></div><div class="vi-authority"><strong>PROJECT INPUT</strong><span>NOT MASTER / SCREENING / DESIGN AUTHORITY</span></div></header>
    ${workspaceTabs('user-data')}
    ${state.error ? `<div class="vi-banner bad"><strong>Unable to update user engineering data.</strong><span>${esc(state.error)}</span></div>` : ''}
    ${renderVibrationUserEngineeringData(state)}
    ${renderSbcType3UserInputPanel(state)}
  </div>`;
}

function mechanicalPage(state) {
  return `<div class="vi-root">
    <header class="vi-header"><div><h2>Vibration Integrity</h2><p>Facility-scoped Mechanical Excitation assessment using the governed EI AVIFF T2.3 candidate master.</p></div><div class="vi-authority"><strong>CANDIDATE MASTER</strong><span>NOT SCREENING / DESIGN AUTHORITY</span></div></header>
    ${workspaceTabs('mechanical')}
    ${state.error ? `<div class="vi-banner bad"><strong>Unable to evaluate Mechanical T2.3 candidate.</strong><span>${esc(state.error)}</span></div>` : ''}
    ${renderMechanicalFacilityPanel(state)}
  </div>`;
}

function activityPage(state) {
  return `<div class="vi-root">
    <header class="vi-header"><div><h2>Vibration Integrity</h2><p>Assessment workflow, action history and non-authoritative product audit evidence.</p></div><div class="vi-authority"><strong>ACTIVITY LOG</strong><span>OBSERVATIONAL · ENGINEERING AUTHORITY NONE</span></div></header>
    ${workspaceTabs('activity')}
    ${state.error ? `<div class="vi-banner bad"><strong>Current workspace issue.</strong><span>${esc(state.error)}</span></div>` : ''}
    ${renderVibrationIntegrityActivity(state)}
  </div>`;
}

export function createVibrationUserDataUiState() {
  return {
    ...createMechanicalFacilityUiState(),
    ...createSbcType3UiState(),
    workspaceTab: 'screening',
    userEngineeringData: createVibrationUserEngineeringDataTable(),
  };
}

export function renderVibrationIntegrityWithUserData(state) {
  if (state.workspaceTab === 'user-data') return userDataPage(state);
  if (state.workspaceTab === 'mechanical') return mechanicalPage(state);
  if (state.workspaceTab === 'activity') return activityPage(state);
  return injectWorkspaceTabs(renderVibrationIntegrityHtml(state), workspaceTabs('screening'));
}

function updateTable(state, table, render, audit, details = {}) {
  const before = state.userEngineeringData;
  state.userEngineeringData = table;
  recordSbcType3UserDataTableMutation(state, before, table);
  state.sbcType3Result = null;
  state.error = null;
  audit?.('USER_DATA_CHANGED', details, state.sbcType3ScopeId || null);
  render();
}

function addType3Template(state, hasMass, render, audit) {
  const scopeId = String(state.sbcType3ScopeId ?? '').trim();
  if (!scopeId) {
    state.error = 'Enter an SBC scope / assessment ID before adding Type-3 input rows.';
    render();
    return;
  }
  updateTable(state, addSbcType3UserEngineeringDataRows(
    state.userEngineeringData, scopeId, hasMass,
  ), render, audit, { action: 'SBC_TYPE3_TEMPLATE_ADDED', hasMass });
}

function evaluateType3(state, render, audit) {
  try {
    state.sbcType3Result = calculateSbcType3FromUserEngineeringData({
      userRows: vibrationUserEngineeringDataResolverRows(state.userEngineeringData),
      scopeId: state.sbcType3ScopeId,
    });
    state.error = null;
    audit?.('SBC_TYPE3_EVALUATED', {
      status: state.sbcType3Result?.status ?? null,
      lof: state.sbcType3Result?.lof ?? null,
      mode: 'LEGACY_EXPLICIT_INTERMEDIATE',
    }, state.sbcType3ScopeId || null);
  } catch (error) {
    state.sbcType3Result = null;
    state.error = String(error?.message || error);
  }
  render();
}

export function handleVibrationUserDataClick(state, event, render, audit) {
  if (handleMechanicalFacilityClick(state, event, render, audit)) return true;
  if (handleSbcType3Click(state, event, render, audit)) return true;
  const tab = event.target.closest('[data-vi-workspace-tab]')?.dataset.viWorkspaceTab;
  if (tab) {
    const known = VIBRATION_INTEGRITY_UI_CONTRACT.workspaceTabs.some((item) => item.id === tab);
    state.workspaceTab = known ? tab : 'screening';
    audit?.('WORKSPACE_TAB_OPENED', { tab: state.workspaceTab }, null);
    render();
    return true;
  }
  const type3Template = event.target.closest('[data-vi-sbc-type3-template]')?.dataset.viSbcType3Template;
  if (type3Template) {
    addType3Template(state, type3Template === 'mass', render, audit);
    return true;
  }
  if (event.target.closest('[data-vi-sbc-type3-evaluate]')) {
    evaluateType3(state, render, audit);
    return true;
  }
  if (event.target.closest('[data-vi-user-data-add-sbc]')) {
    updateTable(state, addSbcT3UserEngineeringDataRows(state.userEngineeringData), render, audit, { action: 'SBC_ROWS_ADDED' });
    return true;
  }
  if (event.target.closest('[data-vi-user-data-add]')) {
    updateTable(state, addVibrationUserEngineeringDataRow(state.userEngineeringData), render, audit, { action: 'ROW_ADDED' });
    return true;
  }
  const deleteButton = event.target.closest('[data-vi-user-data-delete]');
  if (!deleteButton) return false;
  updateTable(state, deleteVibrationUserEngineeringDataRow(
    state.userEngineeringData,
    Number(deleteButton.dataset.viUserDataDelete),
  ), render, audit, { action: 'ROW_DELETED', row: Number(deleteButton.dataset.viUserDataDelete) });
  return true;
}

export function handleVibrationUserDataChange(state, event, render, audit) {
  if (handleMechanicalFacilityChange(state, event, render, audit)) return true;
  if (handleSbcType3Change(state, event, render, audit)) return true;
  const columnKey = event.target.dataset.viUserDataCell;
  if (!columnKey) return false;
  updateTable(state, updateVibrationUserEngineeringDataCell(
    state.userEngineeringData,
    Number(event.target.dataset.viUserDataRow),
    columnKey,
    event.target.value,
  ), render, audit, { action: 'CELL_CHANGED', columnKey });
  return true;
}
