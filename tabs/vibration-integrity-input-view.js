import { VIBRATION_FIT_DATA_BLOCKER_FIELDS } from '../converters/vibration/tabular/fit-data-blockers.js';
import { buildFitMechanismBenchmarkComparison } from '../converters/vibration/mechanisms/index.js';
import {
  vibrationIntegrityInputCellState,
  vibrationIntegrityInputRowState,
} from './vibration-integrity-input-model.js';
import { VIBRATION_FIT_UI_BENCHMARK_CASES, VIBRATION_FIT_UI_BENCHMARK_SOURCE } from './vibration-integrity-benchmarks.js';
import { renderVibrationEngineeringBasis } from './vibration-integrity-engineering-basis-view.js';
import { vibrationEngineeringBasisSourceCellId } from './vibration-integrity-engineering-basis.js';

const BLOCKER_INPUT_HINTS = Object.freeze({
  outsideDiameter: 'OUTSIDE_DIAMETER',
  wallThickness: 'WALL_THICKNESS',
  insideDiameter: 'INSIDE_DIAMETER',
  maximumUnsupportedSpan: 'MAX_UNSUPPORTED_SPAN',
  naturalFrequency: 'NATURAL_FREQUENCY',
  phase: 'PHASE',
  density: 'DENSITY',
  dynamicViscosity: 'DYNAMIC_VISCOSITY',
  massFlowOrVelocity: 'MASS_FLOW or VELOCITY',
  aggregateMultiphaseInputs: 'DENSITY + MASS_FLOW or VELOCITY',
  componentMultiphaseInputs: 'GAS_MASS_FLOW + GAS_DENSITY + LIQUID_MASS_FLOW + LIQUID_DENSITY',
  multiphaseInputShape: 'Choose aggregate or component data shape; use MULTIPHASE_RESOLUTION_MODE when both exist',
  operatingCase: 'Enter Line + Operating Case scope in Data Blockers or Operating cases',
  line: 'Line identity must be corrected in Source Data topology',
});

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function option(value, selected, label) {
  return `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
}

function fileStatus(file, table, fallback) {
  if (!file && !table?.rows?.length) return `<span class="vi-empty">${esc(fallback)}</span>`;
  const name = file?.name ?? table?.sourceName ?? 'Working table';
  const kind = table?.authorityDowngraded && table?.kind === 'topology' && table.originalCertifiedExchange
    ? 'Local Elements override · complete-exchange authority not retained'
    : file?.kind ?? table?.sourceKind ?? fallback;
  return `<strong>${esc(name)}</strong><small>${esc(kind)}</small>`;
}

function actualBenchmarkRow(state) {
  const benchmark = state.benchmark?.loaded;
  const rows = state.envelope?.workflow?.register?.rows ?? [];
  if (!benchmark) return null;
  return rows.find((row) => row.canonicalId === benchmark.identity.canonicalId
    && row.line === benchmark.identity.line && row.caseId === benchmark.identity.caseId) ?? null;
}

function benchmarkComparison(state) {
  return buildFitMechanismBenchmarkComparison({
    benchmark: state.benchmark?.loaded ?? null,
    actual: actualBenchmarkRow(state),
    resultState: state.resultState,
  });
}

function comparisonLabel(status) {
  if (status === 'PASS') return 'Benchmark parity PASS';
  if (status === 'FAIL') return 'Benchmark parity FAIL';
  if (status === 'STALE_RESULT') return 'Stale result · rerun required';
  if (status === 'NOT_RUN') return 'Run screening to compare';
  return 'Not applicable · inputs modified';
}

function benchmarkPanel(state) {
  const selected = state.benchmark?.selectedId ?? VIBRATION_FIT_UI_BENCHMARK_CASES[0]?.id ?? '';
  const loaded = state.benchmark?.loaded;
  const comparison = benchmarkComparison(state);
  const delta = comparison?.relativeDelta;
  return `<section class="vi-card vi-benchmark-card">
    <div class="vi-section-head"><div><h3>FIT validation benchmark</h3><p>Load a controlled EI worked example into the editable tables, then run the same bounded FIT screening path used by the app.</p></div></div>
    <div class="vi-benchmark-controls"><label>Benchmark case<select data-vi-benchmark-select>${VIBRATION_FIT_UI_BENCHMARK_CASES.map((entry) => option(entry.id, selected, entry.label)).join('')}</select></label><button type="button" class="vi-btn primary" data-vi-action="load-benchmark"${state.busy ? ' disabled' : ''}>Load BENCHMARK</button></div>
    ${loaded ? `<div class="vi-benchmark-facts">
      <span>Source: <strong>${esc(loaded.sourceLocation)}</strong></span><span>Target standard LOF: <strong>${esc(loaded.published.standardLof)}</strong></span><span>LOF tolerance: <strong>±${esc(loaded.published.standardLofTolerance)}</strong></span><span>Target band: <strong>${esc(loaded.published.referenceBand)}</strong></span><span>Published support: <strong>${esc(loaded.published.supportStiffness)}</strong></span>
      <span>Actual standard LOF: <strong>${comparison?.actualLof ?? '—'}</strong></span><span>Actual band: <strong>${comparison?.actualBand ?? '—'}</strong></span><span>Relative delta: <strong>${delta === null ? '—' : `${(delta * 100).toFixed(3)}%`}</strong></span><span>Comparison: <strong>${esc(comparisonLabel(comparison?.status))}</strong></span>
    </div>${loaded.modified ? '<div class="vi-banner warn"><strong>Benchmark inputs modified.</strong><span>The published target remains visible only as the original-case reference. Revert all working edits or reload the benchmark before claiming parity.</span></div>' : ''}
    <div class="vi-benchmark-source">${esc(VIBRATION_FIT_UI_BENCHMARK_SOURCE.benchmarkSetId)} · ${esc(VIBRATION_FIT_UI_BENCHMARK_SOURCE.edition)} · ${esc(VIBRATION_FIT_UI_BENCHMARK_SOURCE.tolerancePolicyId)}</div>` : ''}
  </section>`;
}

function inputStateFacts(state) {
  const edits = Object.values(state.tables ?? {}).reduce((sum, table) => sum + (table.editCount ?? 0), 0);
  const snapshot = state.runSnapshot?.snapshotHash;
  const engineering = state.runSnapshot?.engineeringInputHash;
  const auditEvents = state.auditLog?.events ?? [];
  const lastAudit = auditEvents[auditEvents.length - 1]?.eventType ?? '—';
  const readiness = state.preflight ? 'CHECKED' : 'NOT CHECKED';
  const evidence = state.resultState === 'CURRENT_RESULT' ? 'AVAILABLE' : 'LOCKED';
  return `<div class="vi-import-facts"><span>Working edits: <strong>${esc(edits)}</strong></span><span>Readiness: <strong>${esc(readiness)}</strong></span><span>Result: <strong>${esc(state.resultState ?? 'UNRUN')}</strong></span><span>Evidence: <strong>${esc(evidence)}</strong></span><span>Audit events: <strong>${esc(auditEvents.length)}</strong></span><span>Last audit: <strong class="vi-mono">${esc(lastAudit)}</strong></span>${snapshot ? `<span>Run snapshot: <strong class="vi-mono">${esc(snapshot.slice(0, 16))}…</strong></span>` : ''}${engineering ? `<span>Engineering input: <strong class="vi-mono">${esc(engineering.slice(0, 16))}…</strong></span>` : ''}</div>`;
}

function importPanel(state) {
  const topology = state.tables?.topology;
  const topologyLimited = state.files.topology?.format === 'CSV_ELEMENTS_ONLY' || topology?.authorityDowngraded;
  const checking = state.busy && state.busyAction === 'preflight';
  const running = state.busy && state.busyAction === 'screening';
  return `<section class="vi-card vi-import-card">
    <div class="vi-section-head"><div><h3>Working table inputs</h3><p>The complete topology contract is the five-sheet XLSX export. Files load into original/working state; limited Elements-only CSV remains explicit and source values stay available for exact revert.</p></div></div>
    <div class="vi-import-grid">
      <label class="vi-file-field"><span>3D EDIT table export</span><input type="file" data-vi-file="topology" accept=".xlsx,.csv"><span class="vi-file-status">${fileStatus(state.files.topology, topology, 'Complete five-sheet XLSX export preferred · CSV is Elements-only')}</span></label>
      <label class="vi-file-field"><span>Operating cases</span><input type="file" data-vi-file="operating" accept=".csv,text/csv"><span class="vi-file-status">${fileStatus(state.files.operating, state.tables?.operating, 'VibrationOperatingCaseCsv.v1')}</span></label>
      <label class="vi-file-field"><span>Vibration enrichment</span><input type="file" data-vi-file="enrichment" accept=".csv,text/csv"><span class="vi-file-status">${fileStatus(state.files.enrichment, state.tables?.enrichment, 'VibrationEnrichmentCsv.v1')}</span></label>
    </div>${inputStateFacts(state)}
    <div class="vi-actions"><button type="button" class="vi-btn" data-vi-action="operating-template">Operating-case template</button><button type="button" class="vi-btn" data-vi-action="enrichment-template">Enrichment template</button><label class="vi-check"><input type="checkbox" data-vi-limited${state.allowLimitedExchange ? ' checked' : ''}> Allow limited Elements-only CSV</label><button type="button" class="vi-btn" data-vi-action="preflight"${!state.tables?.topology?.rows?.length || state.busy ? ' disabled' : ''}>${checking ? 'Checking…' : 'Check readiness'}</button><button type="button" class="vi-btn primary" data-vi-action="run"${!state.tables?.topology?.rows?.length || state.busy ? ' disabled' : ''}>${running ? 'Running FIT screening…' : 'Run FIT screening'}</button><button type="button" class="vi-btn" data-vi-action="export"${state.resultState === 'CURRENT_RESULT' ? '' : ' disabled'}>Export register CSV</button><button type="button" class="vi-btn" data-vi-action="export-evidence"${state.resultState === 'CURRENT_RESULT' ? '' : ' disabled'}>Export run evidence JSON</button></div>
    ${topologyLimited ? '<div class="vi-banner warn"><strong>Limited topology input.</strong><span>Execution uses the visible Elements working table. Once a certified XLSX is edited, complete-exchange authority remains downgraded until the source is explicitly reloaded, even if values are reverted.</span></div>' : ''}
  </section>`;
}

function sourceCellRef(table, rowIndex, columnIndex) {
  return { kind: table.kind, rowIndex, rowId: table.rowIds?.[rowIndex] ?? null, columnIndex };
}

function editableCell(table, rowIndex, columnIndex, value) {
  const state = vibrationIntegrityInputCellState(table, rowIndex, columnIndex);
  const canRevert = state.edited && state.originalValue !== null;
  const editedClass = state.edited ? ' is-edited' : '';
  const original = state.originalValue === null ? 'Local row' : `Original: ${state.originalValue}`;
  const sourceId = vibrationEngineeringBasisSourceCellId(sourceCellRef(table, rowIndex, columnIndex));
  return `<td class="vi-working-cell${editedClass}" title="${esc(original)}"><input id="${esc(sourceId)}" class="vi-cell-input" data-vi-table-cell="${esc(table.kind)}" data-vi-edit-row="${rowIndex}" data-vi-edit-column="${columnIndex}" data-vi-row-id="${esc(state.rowId)}" value="${esc(value)}" aria-label="${esc(table.header[columnIndex])} row ${rowIndex + 1}">${canRevert ? `<button type="button" class="vi-btn vi-cell-revert" data-vi-cell-revert="${esc(table.kind)}" data-vi-edit-row="${rowIndex}" data-vi-edit-column="${columnIndex}" title="Revert to ${esc(state.originalValue)}">↶</button>` : ''}</td>`;
}

function rowActions(table, rowIndex) {
  const state = vibrationIntegrityInputRowState(table, rowIndex);
  const revert = state.edited
    ? `<button type="button" class="vi-btn" data-vi-row-revert="${esc(table.kind)}" data-vi-edit-row="${rowIndex}">Revert row</button>`
    : '';
  return `${revert}<button type="button" class="vi-btn vi-row-delete" data-vi-table-delete="${esc(table.kind)}" data-vi-edit-row="${rowIndex}">Delete</button>`;
}

function editableRows(table) {
  if (!table.rows.length) return `<tr><td colspan="${table.header.length + 1}" class="vi-table-empty">No rows loaded. Add a row or import CSV.</td></tr>`;
  return table.rows.map((row, rowIndex) => `<tr>${row.map((value, columnIndex) => editableCell(table, rowIndex, columnIndex, value)).join('')}<td><div class="vi-actions">${rowActions(table, rowIndex)}</div></td></tr>`).join('');
}

function editableTable(title, table, description) {
  const authorityNote = table.kind === 'topology' && table.authorityDowngraded && !table.dirty
    ? '<small>Values match original; topology authority remains downgraded until reload.</small>' : '';
  return `<section class="vi-card vi-input-table-card vi-source-table"><div class="vi-section-head"><div><h3>${esc(title)}</h3><p>${esc(description)}</p>${authorityNote}</div><div class="vi-actions">${table.dirty ? `<button type="button" class="vi-btn" data-vi-table-revert="${esc(table.kind)}">Revert table</button>` : ''}<button type="button" class="vi-btn" data-vi-table-add="${esc(table.kind)}">Add row</button></div></div><div class="vi-table-wrap vi-input-table-wrap"><table class="vi-table vi-input-table"><thead><tr>${table.header.map((heading) => `<th>${esc(heading)}</th>`).join('')}<th>Row</th></tr></thead><tbody>${editableRows(table)}</tbody></table></div></section>`;
}

function sourceDataArea(tables) {
  return `<section class="vi-source-data"><div class="vi-section-head"><div><h3>Source Data</h3><p>Raw import/storage contracts remain authoritative. Engineering-basis source links navigate to exact backing cells; cell, row and whole-table revert operate on the same working records.</p></div></div>
    ${editableTable('Topology · Elements working table', tables.topology, 'Certified XLSX is preserved only while its captured Elements projection fingerprint still matches and no topology mutation has occurred. Revert restores values but does not restore complete-exchange authority.')}
    ${editableTable('Operating cases', tables.operating, 'Process quantities preserve original and working values. Unit-only edits convert the numeric value through the central engineering unit layer when quantity semantics are known.')}
    ${editableTable('Vibration enrichment', tables.enrichment, 'Assessment-point and FIT geometry evidence keyed by Canonical ID. Known numeric engineering properties use central unit conversion; unknown property semantics are never guessed.')}
  </section>`;
}

function blockerHint(field) {
  return BLOCKER_INPUT_HINTS[field] ?? field;
}

function blockerReadinessRows(state) {
  const rows = state.preflight?.preflight?.rows ?? [];
  const blocked = rows.filter((row) => row.status !== 'READY' && ((row.missing?.length ?? 0) || (row.invalid?.length ?? 0)));
  if (!state.preflight) return '<div class="vi-banner"><strong>Readiness not checked.</strong><span>Run Check readiness to list unresolved data fields by line/case before entering manual values.</span></div>';
  if (!blocked.length) return '<div class="vi-banner"><strong>No unresolved readiness data.</strong><span>The latest readiness check has no missing or invalid FIT input fields.</span></div>';
  return `<section class="vi-card"><div class="vi-section-head"><div><h3>Current unresolved input blockers</h3><p>These are the latest readiness findings. Enter only verified missing data below; method/domain blockers remain non-overridable.</p></div></div><div class="vi-table-wrap"><table class="vi-table"><thead><tr><th>Line</th><th>Case</th><th>Canonical ID</th><th>Missing / invalid</th><th>User-input field / action</th></tr></thead><tbody>${blocked.map((row) => {
    const fields = [...new Set([...(row.missing ?? []), ...(row.invalid ?? [])])];
    return `<tr><td>${esc(row.line ?? '—')}</td><td>${esc(row.caseId ?? '—')}</td><td class="vi-mono">${esc(row.canonicalId ?? '—')}</td><td>${esc(fields.join(', '))}</td><td>${esc(fields.map(blockerHint).join(' · '))}</td></tr>`;
  }).join('')}</tbody></table></div></section>`;
}

function dataBlockerArea(state, tables) {
  const supported = Object.keys(VIBRATION_FIT_DATA_BLOCKER_FIELDS).join(', ');
  return `<section class="vi-source-data"><div class="vi-section-head"><div><h3>Data Blockers</h3><p>Enter missing engineering data here instead of relying on hidden defaults. ACTIVE rows may fill missing source fields; HOLD and RESOLVED rows are audit-only. Existing source values always win and a collision fails closed.</p></div></div>
    ${blockerReadinessRows(state)}
    <section class="vi-card vi-import-card"><div class="vi-import-grid"><label class="vi-file-field"><span>FIT data blocker CSV</span><input type="file" data-vi-file="dataBlockers" accept=".csv,text/csv"><span class="vi-file-status">${fileStatus(state.files?.dataBlockers, tables.dataBlockers, 'VibrationFitDataBlockerCsv.v1 · optional manual gap data')}</span></label></div><div class="vi-actions"><button type="button" class="vi-btn" data-vi-action="data-blocker-template">Data-blocker template</button></div><div class="vi-banner warn"><strong>Manual data is evidence, not authority.</strong><span>ACTIVE rows require Canonical ID, field, source, value and status; numeric ACTIVE values require units. HOLD/RESOLVED rows may retain a pending blank value. QST-003 remains a method/domain exclusion and cannot be bypassed by this table.</span></div><small>Supported fields: ${esc(supported)}</small></section>
    ${editableTable('FIT manual data gaps', tables.dataBlockers, 'One row per unresolved input. Keep a pending row on HOLD; change to ACTIVE only when value, unit and provenance are ready to participate in the screening workflow.')}
  </section>`;
}

function inputTabs(selected) {
  const tabs = [['engineering', 'Engineering Basis'], ['source', 'Source Data'], ['data-blockers', 'Data Blockers']];
  return `<div class="vi-detail-tabs">${tabs.map(([id, label]) => `<button type="button" class="vi-btn${selected === id ? ' primary' : ''}" data-vi-input-tab="${id}">${label}</button>`).join('')}</div>`;
}

function inputTabBody(state, tables) {
  if (state.inputTab === 'source') return sourceDataArea(tables);
  if (state.inputTab === 'data-blockers') return dataBlockerArea(state, tables);
  return renderVibrationEngineeringBasis(state);
}

function fallbackTable(kind) {
  return { kind, header: [], rows: [], records: [], rowIds: [], sourceName: null, sourceKind: 'WORKING_TABLE', dirty: false, editCount: 0, authorityDowngraded: false };
}

function fallbackTables() {
  return {
    topology: fallbackTable('topology'), operating: fallbackTable('operating'),
    enrichment: fallbackTable('enrichment'), dataBlockers: fallbackTable('dataBlockers'),
  };
}

export function renderVibrationIntegrityInputArea(state) {
  const tables = state.tables ?? fallbackTables();
  const inputState = state.tables ? state : { ...state, tables };
  const selected = inputState.inputTab ?? 'engineering';
  return `${benchmarkPanel(inputState)}${importPanel(inputState)}${inputTabs(selected)}${inputTabBody({ ...inputState, inputTab: selected }, tables)}`;
}
