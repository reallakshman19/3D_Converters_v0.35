import { AIV_UI_BENCHMARK_SOURCE } from './vibration-aiv-benchmarks.js';
import { aivCanvasFieldKey } from './vibration-aiv-canvas-field.js?v=20260816-aiv-canvas-release-1';
import { renderAivAssumptionProfileHtml } from './vibration-aiv-assumption-view.js';
import { AIV_INPUT_MODE } from './vibration-aiv-engineering-revision.js';
import { renderAivMasterDbHtml } from './vibration-aiv-master-db-view.js';
import { renderAivUnifiedCanvasWorkspaceHtml } from './vibration-aiv-unified-canvas-view.js?v=20260816-aiv-canvas-release-1';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fileStatus(file, table, fallback) {
  if (!file && !table?.rows?.length) return `<span class="aivq-empty">${esc(fallback)}</span>`;
  const name = file?.name ?? table?.sourceName ?? 'Working table';
  const kind = table?.dirty && table?.benchmarkId
    ? 'Edited benchmark working copy'
    : file?.kind ?? table?.sourceKind ?? fallback;
  return `<strong>${esc(name)}</strong><small>${esc(kind)}</small>`;
}

function benchmarkPanel(state) {
  const loaded = state.benchmark?.loaded;
  const reference = loaded?.publishedReference;
  const status = !loaded ? 'NOT_LOADED' : loaded.modified ? 'NOT_APPLICABLE_MODIFIED_INPUTS' : 'CONTROLLED_INPUT_REFERENCE';
  return `<section class="aivq-card aivq-benchmark-card">
    <div class="aivq-section-head"><div><h4>Controlled EI D.2.3 benchmark</h4><p>Loads the controlled example into the same editable working tables. Published values remain comparison targets, not UI equations.</p></div></div>
    <div class="aivq-actions"><button type="button" class="engineering-console-btn primary" data-aiv-action="load-d23-benchmark"${state.busy ? ' disabled' : ''}>Load EI D.2.3</button></div>
    ${loaded ? `<div class="aivq-benchmark-facts"><span>Input reference <strong>${esc(status)}</strong></span><span>Relief raw source PWL <strong>${esc(reference.reliefRawSourcePwlDb)} dB</strong></span><span>Recycle raw source PWL <strong>${esc(reference.recycleRawSourcePwlDb)} dB</strong></span><span>Recycle trim <strong>${esc(reference.recycleTrimReductionDb)} dB</strong></span><span>Relief point PWL <strong>${esc(reference.reliefPointPwlDb)} dB</strong></span><span>Relief LOF <strong>${esc(reference.reliefFirstDiscontinuityLof)}</strong></span><span>FLM1 published <strong>${esc(reference.publishedFlm1)}</strong></span><span>FLM1 alternative <strong>1.2109758194311824</strong></span></div>
    ${loaded.modified ? '<div class="aivq-banner is-warning aivq-benchmark-warning"><strong>Benchmark inputs modified.</strong><span>Published values remain visible only as the original controlled-case reference. Reload EI D.2.3 to restore exact benchmark-input identity.</span></div>' : ''}
    <div class="aivq-benchmark-source">${esc(AIV_UI_BENCHMARK_SOURCE.benchmarkSetId)} · ${esc(AIV_UI_BENCHMARK_SOURCE.readableSource.path)} · blob ${esc(AIV_UI_BENCHMARK_SOURCE.readableSource.gitBlob)} · ${esc(AIV_UI_BENCHMARK_SOURCE.readableSource.locator)}</div>` : ''}
  </section>`;
}

function eitSummary(state) {
  const imported = state.eitImport;
  if (!imported) return '';
  const legacy = imported.importedResults.filter((item) => item.importedResultKind === 'LEGACY_LINE_LEVEL_RESULT').length;
  const modern = imported.importedResults.length - legacy;
  return `<section class="aivq-card aivq-eit-summary">
    <div class="aivq-section-head"><div><h4>Imported EI .eit</h4><p>${esc(imported.title)} · imported results are evidence only until the registered AIV screening calculation is rerun.</p></div><span class="aivq-status gap">REVIEW_REQUIRED</span></div>
    <div class="aivq-result-summary"><span>AIV lines <strong>${imported.counts.aivLines}</strong></span><span>Sources <strong>${imported.counts.sources}</strong></span><span>Assessments <strong>${imported.counts.assessments}</strong></span><span>Relationships <strong>${imported.counts.relationships}</strong></span><span>Legacy line traces <strong>${legacy}</strong></span><span>Prior assessment traces <strong>${modern}</strong></span></div>
    <div class="aivq-readiness-note"><strong>Authority boundary:</strong> imported <code>line.aiv</code> values are never current screening authority. Review missing/derived fields, check readiness, then run <code>VIB.AIV.ACOUSTIC</code>.</div>
  </section>`;
}

function startPanel(state) {
  const eitDisabled = state.screeningResult?.ok ? '' : ' disabled';
  return `<section class="aivq-card aivq-start-card">
    <div class="aivq-section-head"><div><h4>Start an AIV assessment</h4><p>Import an EI <code>.eit</code>, load the controlled two-RV mock or benchmark, author a flare network, or use advanced CSV/XLSX inputs.</p></div></div>
    <div class="aivq-start-grid">
      <label class="aivq-file-field aivq-file-field-primary"><span>Import EI .eit</span><input type="file" data-aiv-file="eit" accept=".eit,.json,application/json"><span>${fileStatus(state.files?.eit, null, 'EnergyInstituteEit.v5 JSON')}</span></label>
      <div class="aivq-primary-stack">
        <div class="aivq-start-action"><strong>Mock flare network</strong><span>2 RVs → 4 in subheader → 8 in header · explicit 38 m / 41 m engineering paths</span><button type="button" class="engineering-console-btn primary" data-aiv-action="load-mock-flare-network"${state.busy ? ' disabled' : ''}>Load mock flare network</button><button type="button" class="engineering-console-btn" data-aiv-action="export-eit"${eitDisabled}>Export current EI .eit</button><span>EI .eit export becomes available after the current registered screening run.</span></div>
        <div class="aivq-start-action"><strong>Controlled benchmark</strong><span>EI D.2.3 · exact known reference inputs</span><button type="button" class="engineering-console-btn primary" data-aiv-action="load-d23-benchmark"${state.busy ? ' disabled' : ''}>Load EI D.2.3</button></div>
      </div>
    </div>
    <details class="aivq-inline-disclosure" data-aiv-disclosure-key="advanced-imports"><summary>Advanced XLSX / CSV imports</summary><div class="aivq-import-grid">
      <label class="aivq-file-field"><span>3D EDIT complete topology XLSX</span><input type="file" data-aiv-file="topology" accept=".xlsx"><span>${fileStatus(state.files?.topology, null, 'Five-sheet TopologyEditTableHumanExport.v1 XLSX')}</span></label>
      <label class="aivq-file-field"><span>AIV Sources</span><input type="file" data-aiv-file="sources" accept=".csv,text/csv"><span>${fileStatus(state.files?.sources, state.tables?.sources, 'AivSourceCsv.v2')}</span></label>
      <label class="aivq-file-field"><span>AIV Assessments</span><input type="file" data-aiv-file="assessments" accept=".csv,text/csv"><span>${fileStatus(state.files?.assessments, state.tables?.assessments, 'AivAssessmentCsv.v1')}</span></label>
      <label class="aivq-file-field"><span>Source → Assessment</span><input type="file" data-aiv-file="relationships" accept=".csv,text/csv"><span>${fileStatus(state.files?.relationships, state.tables?.relationships, 'AivSourceAssessmentCsv.v1')}</span></label>
    </div><div class="aivq-actions"><button type="button" class="engineering-console-btn" data-aiv-action="source-template">Sources template</button><button type="button" class="engineering-console-btn" data-aiv-action="assessment-template">Assessments template</button><button type="button" class="engineering-console-btn" data-aiv-action="relationship-template">Source→Assessment template</button></div></details>
  </section>`;
}

function tableValue(table, row, column) {
  const index = table.header.indexOf(column);
  return index < 0 ? '' : String(row[index] ?? '').trim();
}

function tableSelectionKey(table, row) {
  if (table.kind === 'sources') {
    const id = tableValue(table, row, 'Source Canonical ID');
    const caseId = tableValue(table, row, 'Operating Case');
    return id && caseId ? `SOURCE:${id}:${caseId}` : '';
  }
  if (table.kind === 'assessments') {
    const id = tableValue(table, row, 'Assessment Canonical ID');
    return id ? `ASSESSMENT:${id}` : '';
  }
  const sourceId = tableValue(table, row, 'Source Canonical ID');
  const assessmentId = tableValue(table, row, 'Assessment Canonical ID');
  const caseId = tableValue(table, row, 'Operating Case');
  return sourceId && assessmentId && caseId ? `REL:${sourceId}:${assessmentId}:${caseId}` : '';
}

function assumptionMap(state) {
  const map = new Map();
  for (const item of state.assumptionResolution?.assumptions ?? []) {
    const key = aivCanvasFieldKey(item.tableKind, item.rowIndex, item.column);
    if (key) map.set(key, item);
  }
  return map;
}

function masterMap(state) {
  const map = new Map();
  for (const item of state.masterResolution?.resolutions ?? []) {
    const key = aivCanvasFieldKey(item.tableKind, item.rowIndex, item.column);
    if (key) map.set(key, item);
  }
  return map;
}

function topologyExchange(state) {
  if (state.readinessEnvelope?.exchange) return state.readinessEnvelope.exchange;
  if (state.topologyInput?.format === 'PARSED_EXCHANGE' || state.topologyInput?.format === 'FLARE_NETWORK') return state.topologyInput.data;
  return state.topology ?? null;
}

function tableFilterContext(state, tables) {
  const lineById = new Map((topologyExchange(state)?.elements ?? []).map((item) => [String(item.canonicalId ?? '').trim(), String(item.line ?? '').trim()]));
  const casesByAssessment = new Map();
  for (const row of tables.relationships.rows) {
    const id = tableValue(tables.relationships, row, 'Assessment Canonical ID');
    const caseId = tableValue(tables.relationships, row, 'Operating Case');
    if (!id || !caseId) continue;
    if (!casesByAssessment.has(id)) casesByAssessment.set(id, new Set());
    casesByAssessment.get(id).add(caseId);
  }
  return { lineById, casesByAssessment };
}

function rowFilterMeta(table, row, context) {
  if (table.kind === 'sources') {
    const id = tableValue(table, row, 'Source Canonical ID');
    return { cases: [tableValue(table, row, 'Operating Case')].filter(Boolean), line: context.lineById.get(id) ?? '' };
  }
  if (table.kind === 'assessments') {
    const id = tableValue(table, row, 'Assessment Canonical ID');
    return { cases: [...(context.casesByAssessment.get(id) ?? [])].sort(), line: context.lineById.get(id) ?? '' };
  }
  const sourceId = tableValue(table, row, 'Source Canonical ID');
  const assessmentId = tableValue(table, row, 'Assessment Canonical ID');
  return {
    cases: [tableValue(table, row, 'Operating Case')].filter(Boolean),
    line: context.lineById.get(assessmentId) ?? context.lineById.get(sourceId) ?? '',
  };
}

function filterAttrs(meta) {
  return ` data-aiv-filterable="true" data-aiv-canvas-cases="${esc(meta.cases.join('|'))}" data-aiv-canvas-line="${esc(meta.line)}"`;
}

function editableCell(table, rowIndex, columnIndex, value, assumptions, masters, readOnly) {
  const column = table.header[columnIndex];
  const fieldKey = aivCanvasFieldKey(table.kind, rowIndex, column);
  const assumption = assumptions.get(fieldKey);
  const master = masters.get(fieldKey);
  const assumedAttr = assumption ? ' data-aiv-assumed="true"' : '';
  const masterAttr = master ? ' data-aiv-master-derived="true"' : '';
  const readOnlyAttr = readOnly ? ' readonly aria-readonly="true"' : '';
  const assumedBadge = assumption ? `<small class="aivq-assumed-cell" title="${esc(`${assumption.profilePath} · ${assumption.reason}`)}">[A] ${esc(assumption.assumedValue)}</small>` : '';
  const masterBadge = master ? `<small class="aivq-assumed-cell" title="${esc(`${master.masterTable ?? master.origin} · ${master.masterRecordId ?? ''} · ${master.sourceDocumentId ?? ''}`)}">[M] ${esc(master.value)}</small>` : '';
  const kind = master ? ' class="is-master"' : assumption ? ' class="is-assumed"' : '';
  return `<td${kind}><input class="aivq-cell-input" data-aiv-table-cell="${esc(table.kind)}" data-aiv-edit-row="${rowIndex}" data-aiv-edit-column="${columnIndex}" data-aiv-field-key="${esc(fieldKey)}"${assumedAttr}${masterAttr}${readOnlyAttr} value="${esc(value)}" aria-label="${esc(column)} row ${rowIndex + 1}">${masterBadge}${assumedBadge}</td>`;
}

function editableRow(table, row, rowIndex, assumptions, masters, filterContext, readOnly) {
  const selectionKey = tableSelectionKey(table, row);
  const selectionAttr = selectionKey ? ` data-aiv-selection-key="${esc(selectionKey)}"` : '';
  const cells = row.map((value, columnIndex) => editableCell(table, rowIndex, columnIndex, value, assumptions, masters, readOnly)).join('');
  const disabled = readOnly ? ' disabled' : '';
  return `<tr data-aiv-table-row-kind="${esc(table.kind)}" data-aiv-table-row-index="${rowIndex}"${selectionAttr}${filterAttrs(rowFilterMeta(table, row, filterContext))} aria-selected="false">${cells}<td><button type="button" class="engineering-console-btn aivq-row-delete" data-aiv-table-delete="${esc(table.kind)}" data-aiv-edit-row="${rowIndex}"${disabled}>Delete</button></td></tr>`;
}

function editableRows(table, assumptions, masters, filterContext, readOnly) {
  if (!table.rows.length) return `<tr><td colspan="${table.header.length + 1}" class="aivq-empty-row">No rows loaded. Add a row or import a controlled CSV.</td></tr>`;
  return table.rows.map((row, rowIndex) => editableRow(table, row, rowIndex, assumptions, masters, filterContext, readOnly)).join('');
}

function editableTable(title, table, description, assumptions, masters, filterContext, readOnly) {
  const disabled = readOnly ? ' disabled' : '';
  return `<section class="aivq-card aivq-input-table-card"><div class="aivq-section-head"><div><h4>${esc(title)}</h4><p>${esc(description)}</p></div><button type="button" class="engineering-console-btn" data-aiv-table-add="${esc(table.kind)}"${disabled}>Add row</button></div><div class="aivq-input-table-wrap" data-aiv-scroll-key="table-${esc(table.kind)}"><table class="aivq-input-table"><thead><tr>${table.header.map((heading) => `<th>${esc(heading)}</th>`).join('')}<th>Row</th></tr></thead><tbody>${editableRows(table, assumptions, masters, filterContext, readOnly)}</tbody></table></div></section>`;
}

function inputAuthorityNotice(state) {
  if (state.inputMode !== AIV_INPUT_MODE.NETWORK_DRIVEN) return '';
  return `<div class="aivq-banner is-warning" data-aiv-generated-table-readonly="true"><strong>NETWORK_DRIVEN · generated tables are read-only.</strong><span>The flare network is the sole engineering owner. Detach creates an editable TABLE_DRIVEN copy and invalidates current readiness/results.</span><button type="button" class="engineering-console-btn" data-aiv-action="detach-generated-tables">Detach to editable tables</button></div>`;
}

function fallbackTable(kind) {
  return { kind, header: [], rows: [], sourceName: null, sourceKind: 'WORKING_TABLE', dirty: false };
}

export function renderAivInputWorkspaceHtml(state = {}) {
  const tables = state.tables ?? { sources: fallbackTable('sources'), assessments: fallbackTable('assessments'), relationships: fallbackTable('relationships') };
  const assumptions = assumptionMap(state);
  const masters = masterMap(state);
  const canvasState = { ...state, tables };
  const filterContext = tableFilterContext(state, tables);
  const readOnly = state.inputMode === AIV_INPUT_MODE.NETWORK_DRIVEN;
  const canvas = renderAivUnifiedCanvasWorkspaceHtml(canvasState);
  const tableSummary = readOnly
    ? 'Generated Source / Assessment / Relationship records · read-only until explicit detach'
    : 'Advanced editable Source / Assessment / Relationship records · [M] master · [A] assumption';
  return `${startPanel({ ...state, tables })}${renderAivMasterDbHtml(state)}${eitSummary(state)}${canvas}
    <details class="aivq-disclosure" data-aiv-disclosure-key="benchmark-assumptions"><summary><span>Controlled benchmark & assumptions</span><small>Reference case and configurable engineering assumptions</small></summary><div class="aivq-disclosure-body">${benchmarkPanel(state)}${renderAivAssumptionProfileHtml(state)}</div></details>
    <details class="aivq-disclosure" data-aiv-disclosure-key="working-data-tables"><summary><span>Working data tables</span><small>${tableSummary}</small></summary><div class="aivq-disclosure-body">
      ${inputAuthorityNotice(state)}
      ${editableTable('AIV Sources', tables.sources, 'Source + operating-case process/device inputs. Pinned masters may classify an exact source device; process/case values remain explicit or assumed.', assumptions, masters, filterContext, readOnly)}
      ${editableTable('AIV Assessments', tables.assessments, 'Topology + pinned masters can discover exact assessment candidates and resolve deterministic geometry/material fields. Explicit values are never overwritten.', assumptions, masters, filterContext, readOnly)}
      ${editableTable('Source → Assessment', tables.relationships, 'Physical distance is explicit engineering evidence or an existing flare-network path sum. Generic topology/master data never invent distance.', assumptions, masters, filterContext, readOnly)}
    </div></details>`;
}