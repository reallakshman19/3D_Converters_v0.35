import { VIBRATION_USER_DATA_BLOCKERS } from '../converters/vibration/user-engineering-data.js';
import {
  VIBRATION_USER_DATA_COLUMNS,
  createVibrationUserEngineeringDataTable,
  vibrationUserEngineeringDataRowState,
  vibrationUserEngineeringDataSummary,
} from './vibration-integrity-user-data-model.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function blockerList() {
  return `<datalist id="vi-user-data-blockers">${VIBRATION_USER_DATA_BLOCKERS.map((item) => (
    `<option value="${esc(item.blockerId)}">${esc(item.label)}</option>`
  )).join('')}</datalist>`;
}

function cell(row, rowIndex, column) {
  const list = column.key === 'blockerId' ? ' list="vi-user-data-blockers"' : '';
  return `<td><input class="vi-cell-input" data-vi-user-data-cell="${esc(column.key)}" data-vi-user-data-row="${rowIndex}" value="${esc(row[column.key])}"${list} aria-label="${esc(column.label)} row ${rowIndex + 1}"></td>`;
}

function validationCell(row) {
  const state = vibrationUserEngineeringDataRowState(row);
  if (state.status === 'READY') return '<strong>READY</strong>';
  if (state.status === 'EMPTY') return '<span class="vi-empty">EMPTY</span>';
  return `<span title="${esc(state.errors.join('; '))}">INCOMPLETE</span>`;
}

function rows(table) {
  if (!table.rows.length) {
    return `<tr><td colspan="${VIBRATION_USER_DATA_COLUMNS.length + 2}" class="vi-table-empty">No user engineering data entered. Add a row, or add the four SBC T3 curve-reading rows.</td></tr>`;
  }
  return table.rows.map((row, rowIndex) => `<tr>
    ${VIBRATION_USER_DATA_COLUMNS.map((column) => cell(row, rowIndex, column)).join('')}
    <td>${validationCell(row)}</td>
    <td><button type="button" class="vi-btn vi-row-delete" data-vi-user-data-delete="${rowIndex}">Delete</button></td>
  </tr>`).join('');
}

function summary(table) {
  const counts = vibrationUserEngineeringDataSummary(table);
  return `<div class="vi-summary vi-preflight-summary">
    <div class="vi-metric"><small>Rows</small><strong>${counts.rows}</strong></div>
    <div class="vi-metric"><small>Ready</small><strong>${counts.ready}</strong></div>
    <div class="vi-metric"><small>Incomplete</small><strong>${counts.incomplete}</strong></div>
    <div class="vi-metric"><small>Empty</small><strong>${counts.empty}</strong></div>
    <div class="vi-metric"><small>Authority</small><strong>PROJECT INPUT</strong></div>
  </div>`;
}

function knownBlockers() {
  return `<details><summary>Known blocked-data IDs</summary><div class="vi-detail-body"><div class="vi-detail-grid">${VIBRATION_USER_DATA_BLOCKERS.map((item) => (
    `<div class="vi-metric"><small>${esc(item.mechanismId)}</small><strong class="vi-mono">${esc(item.blockerId)}</strong><small>${esc(item.label)}</small></div>`
  )).join('')}</div></div></details>`;
}

export function renderVibrationUserEngineeringData(state) {
  const table = state.userEngineeringData ?? createVibrationUserEngineeringDataTable();
  return `<section class="vi-card vi-user-engineering-data">
    <div class="vi-section-head"><div><h3>User Engineering Data</h3><p>Enter project-specific data when a governed vibration master is unavailable. Rows are consumed only by an explicit exact-match mechanism request.</p></div><div class="vi-actions"><button type="button" class="vi-btn" data-vi-user-data-add>Add row</button><button type="button" class="vi-btn primary" data-vi-user-data-add-sbc>Add SBC T3-1…T3-4 rows</button></div></div>
    <div class="vi-banner warn"><strong>Authority boundary.</strong><span>User entries are USER_SUPPLIED_PROJECT_INPUT only. They do not become engineering masters, do not override an available governed master, and do not grant screening or design authority. The generic resolver performs no interpolation, extrapolation, nearest-row lookup or unit conversion.</span></div>
    ${summary(table)}${blockerList()}
    <div class="vi-table-wrap vi-input-table-wrap"><table class="vi-table vi-input-table"><thead><tr>${VIBRATION_USER_DATA_COLUMNS.map((column) => `<th>${esc(column.label)}</th>`).join('')}<th>Validation</th><th>Row</th></tr></thead><tbody>${rows(table)}</tbody></table></div>
    <div class="vi-banner"><strong>How to use blocked curves/tables.</strong><span>For a curve reading, identify the exact mechanism/blocker, assessment scope, record key and X/Y engineering coordinates, then enter the evaluated value and source/basis. For a manual reference table, add one row per exact source row/point. Future calculators must request the same keys exactly.</span></div>
    ${knownBlockers()}
  </section>`;
}
