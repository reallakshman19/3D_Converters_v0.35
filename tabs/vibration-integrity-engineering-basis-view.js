import { FIT_SOURCE_BASIS_EVIDENCE } from '../converters/vibration/fit/source-basis-evidence.js';
import { vibrationIntegrityInputCellState } from './vibration-integrity-input-model.js';
import {
  buildVibrationEngineeringBasisProjection,
  vibrationEngineeringBasisSourceCellId,
} from './vibration-integrity-engineering-basis.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function empty(value) {
  return value === null || value === undefined || value === '';
}

function stateForRef(state, ref) {
  if (!ref) return null;
  const table = state.tables?.[ref.kind];
  if (!table || ref.rowIndex < 0 || ref.rowIndex >= table.rows.length) return null;
  return vibrationIntegrityInputCellState(table, ref.rowIndex, ref.columnIndex);
}

function sourceLink(ref, label = 'source') {
  const id = vibrationEngineeringBasisSourceCellId(ref);
  if (!id) return '<span class="vi-empty">—</span>';
  return `<a class="vi-row-link vi-source-link" href="#${esc(id)}" data-vi-source-target="${esc(id)}" title="Open exact Source Data cell">${esc(label)}</a>`;
}

function fieldEditState(state, field) {
  const valueState = stateForRef(state, field.valueRef);
  const unitState = stateForRef(state, field.unitRef);
  return {
    valueState,
    unitState,
    edited: Boolean(valueState?.edited || unitState?.edited),
  };
}

function input(ref, value, label, suffix = '') {
  if (!ref) return `<span class="vi-empty">${empty(value) ? '—' : esc(value)}</span>`;
  return `<input class="vi-cell-input${suffix}" data-vi-table-cell="${esc(ref.kind)}" data-vi-edit-row="${ref.rowIndex}" data-vi-edit-column="${ref.columnIndex}" data-vi-row-id="${esc(ref.rowId)}" value="${esc(value)}" aria-label="${esc(label)}">`;
}

function revertButton(field, editState) {
  if (!editState.edited) return '';
  const ref = field.unitRef ?? field.valueRef;
  const cellState = ref === field.unitRef ? editState.unitState : editState.valueState;
  if (!ref || cellState?.originalValue === null) return '';
  return `<button type="button" class="vi-btn vi-cell-revert" data-vi-cell-revert="${esc(ref.kind)}" data-vi-edit-row="${ref.rowIndex}" data-vi-edit-column="${ref.columnIndex}" title="Revert original value/unit">↶</button>`;
}

function scalarEditor(state, field) {
  if (!field?.valueRef) return '<span class="vi-empty">—</span>';
  const editState = fieldEditState(state, field);
  return `<div class="vi-basis-editor${editState.edited ? ' is-edited' : ''}">${input(field.valueRef, field.value, field.label)}${revertButton(field, editState)}${sourceLink(field.valueRef)}</div>`;
}

function quantityEditor(state, field) {
  if (!field?.valueRef) return '<span class="vi-empty">—</span>';
  const editState = fieldEditState(state, field);
  const selection = field.sourceSelection && field.sourceSelection !== 'GLOBAL'
    ? `<small>${esc(field.sourceSelection)}</small>` : '';
  return `<div class="vi-basis-editor vi-basis-quantity${editState.edited ? ' is-edited' : ''}">
    ${input(field.valueRef, field.value, `${field.label} value`, ' vi-basis-value')}
    ${field.unitRef ? input(field.unitRef, field.unit, `${field.label} unit`, ' vi-basis-unit') : ''}
    ${revertButton(field, editState)}${sourceLink(field.valueRef)}${selection}
  </div>`;
}

function identityCell(value, ref) {
  return `<div class="vi-basis-identity"><strong>${empty(value) ? '—' : esc(value)}</strong>${sourceLink(ref)}</div>`;
}

function sourceContext(row) {
  const source = row.sourceContext?.source;
  if (!source) return '<span class="vi-empty">—</span>';
  const revision = row.sourceContext.sourceRevision ? ` · ${row.sourceContext.sourceRevision}` : '';
  const record = row.sourceContext.recordId ? ` · ${row.sourceContext.recordId}` : '';
  return `<span title="${esc(`${source}${revision}${record}`)}">${esc(source)}</span>`;
}

function basisRow(state, row) {
  const p = row.process;
  const f = row.fit;
  return `<tr>
    <td>${identityCell(row.line, row.identity.lineRef)}</td>
    <td>${identityCell(row.caseId, row.identity.caseIdRef)}</td>
    <td class="vi-mono">${identityCell(row.canonicalId, row.identity.canonicalIdRef)}</td>
    <td>${scalarEditor(state, p.phase)}</td>
    <td>${quantityEditor(state, p.massFlow)}</td>
    <td>${quantityEditor(state, p.density)}</td>
    <td>${quantityEditor(state, p.pressure)}</td>
    <td>${scalarEditor(state, p.pressureReference)}</td>
    <td>${quantityEditor(state, p.temperature)}</td>
    <td>${quantityEditor(state, p.viscosity)}</td>
    <td>${quantityEditor(state, p.velocity)}</td>
    <td>${quantityEditor(state, f.outsideDiameter)}</td>
    <td>${quantityEditor(state, f.wallThickness)}</td>
    <td>${quantityEditor(state, f.insideDiameter)}</td>
    <td>${quantityEditor(state, f.span)}</td>
    <td>${quantityEditor(state, f.naturalFrequency)}</td>
    <td>${sourceContext(row)}</td>
  </tr>`;
}

function emptyRows(colspan) {
  return `<tr><td colspan="${colspan}" class="vi-table-empty">No joined FIT assessment rows are available. Load topology, operating cases and enrichment, or load a controlled benchmark.</td></tr>`;
}

function methodBasis() {
  const evidence = FIT_SOURCE_BASIS_EVIDENCE;
  return `<div class="vi-import-facts vi-fit-method-basis">
    <span>Method: <strong>${esc(evidence.method.edition)} · ${esc(evidence.method.technicalModule)}</strong></span>
    <span>Official errata: <strong>${esc(evidence.officialErrata.status)}</strong></span>
    <span>Product basis: <strong>${esc(evidence.projectBasis.productReferenceMethod)}</strong></span>
    <span>Project/client adoption: <strong>${esc(evidence.projectBasis.externalProjectOrClientAdoption)}</strong></span>
    <span>Authority: <strong>${esc(evidence.authority.qualificationState)}</strong></span>
  </div>`;
}

export function renderVibrationEngineeringBasis(state) {
  const projection = buildVibrationEngineeringBasisProjection(state.tables);
  const rows = projection.rows.length
    ? projection.rows.map((row) => basisRow(state, row)).join('')
    : emptyRows(17);
  return `<section class="vi-card vi-engineering-basis-card">
    <div class="vi-section-head"><div><h3>Engineering basis</h3><p>Primary joined line/case editor projected directly from the authoritative working tables. Identity is source-controlled; editable process/FIT quantities write back to their exact Source Data cells.</p></div></div>
    <div class="vi-import-facts"><span>FIT assessment points: <strong>${projection.counts.assessmentPoints}</strong></span><span>Joined line/case rows: <strong>${projection.counts.rows}</strong></span><span>Projection: <strong>${esc(projection.schema)}</strong></span></div>
    ${methodBasis()}
    <div class="vi-banner warn"><strong>Method custody.</strong><span>EI T2.2 is the product FIT reference method. Official EI corrections to T2-5 and T2-8 do not alter this FIT chain. FIT is qualified for the declared bounded SCREENING scope only; design authority remains false, and each project/client must still confirm its adopted basis.</span></div>
    <div class="vi-banner warn"><strong>One backing state.</strong><span>This table is a projection, not a second data store. FIT geometry remains mechanism-specific; non-FIT inputs will be added only through their qualified mechanism modules.</span></div>
    <div class="vi-table-wrap vi-basis-table-wrap"><table class="vi-table vi-basis-table">
      <thead>
        <tr><th colspan="3">Identity</th><th colspan="8">Shared process basis</th><th colspan="5">FIT basis · current mechanism</th><th>Provenance</th></tr>
        <tr><th>Line</th><th>Case</th><th>Canonical ID</th><th>Phase</th><th>Mass flow</th><th>Density</th><th>Pressure</th><th>Pressure ref.</th><th>Temperature</th><th>Viscosity</th><th>Velocity</th><th>OD</th><th>WT</th><th>ID</th><th>Effective-support span</th><th>Natural f</th><th>Operating source</th></tr>
      </thead><tbody>${rows}</tbody>
    </table></div>
  </section>`;
}
