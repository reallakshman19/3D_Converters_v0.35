import {
  renderVibrationIntegrityDetailBody,
  renderVibrationIntegrityDetailTabs,
} from './vibration-integrity-detail-view.js';
import { renderVibrationIntegrityInputArea } from './vibration-integrity-input-view.js';
import { buildSelectedFitMechanismAssessmentSet } from './vibration-integrity-mechanism-context.js';
import {
  VIBRATION_INTEGRITY_MECHANISMS,
  buildVibrationMechanismMatrixRow,
} from './vibration-integrity-mechanisms.js?v=20260815-sbc-pf05-cache-1';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cell(value) {
  return value === null || value === undefined || value === ''
    ? '<span class="vi-empty">—</span>'
    : esc(value);
}

function listCell(values) {
  return Array.isArray(values) && values.length
    ? esc(values.join('; '))
    : '<span class="vi-empty">—</span>';
}

function option(value, selected, label = value) {
  return `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
}

function unique(rows, field) {
  return [...new Set(rows.map((row) => row[field]).filter((value) => (
    value !== null && value !== undefined && value !== ''
  )))].sort((a, b) => String(a).localeCompare(String(b)));
}

function preflightRows(preflight) {
  if (!preflight.rows.length) {
    return '<tr><td colspan="8" class="vi-table-empty">No FIT assessment points are defined in the enrichment table.</td></tr>';
  }
  return preflight.rows.map((row) => `<tr>
    <td>${cell(row.line)}</td><td>${cell(row.caseId)}</td><td class="vi-mono">${cell(row.canonicalId)}</td>
    <td>${cell(row.status)}</td><td>${listCell(row.missing)}</td><td>${listCell(row.invalid)}</td>
    <td>${listCell(row.reasons)}</td><td>${row.requestPrepared ? 'Prepared' : '<span class="vi-empty">—</span>'}</td>
  </tr>`).join('');
}

function preflightPanel(state) {
  const wrapper = state.preflight;
  if (!wrapper?.preflight) return '';
  const preflight = wrapper.preflight;
  const cards = [
    ['Topology integrity', wrapper.imports.exchangeIntegrityStatus ?? 'UNKNOWN'],
    ['Assessment points', preflight.counts.assessmentPoints],
    ['Plan rows', preflight.counts.rows],
    ['Ready', preflight.counts.ready],
    ['Not ready', preflight.counts.notReady],
    ['Active manual inputs', wrapper.imports.activeDataBlockerCount ?? 0],
  ];
  return `<section class="vi-card vi-preflight-card">
    <div class="vi-section-head"><div><h3>FIT readiness</h3><p>Input-contract and completeness check only. No FIT calculation is executed by this readiness check.</p></div></div>
    <div class="vi-summary vi-preflight-summary">${cards.map(([label, value]) => `<div class="vi-metric"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('')}</div>
    <div class="vi-table-wrap"><table class="vi-table vi-preflight-table"><thead><tr>
      <th>Line</th><th>Case</th><th>Canonical ID</th><th>Readiness</th><th>Missing</th><th>Invalid</th><th>Reasons</th><th>Request</th>
    </tr></thead><tbody>${preflightRows(preflight)}</tbody></table></div>
  </section>`;
}

function summaryCards(workspace) {
  if (!workspace) return '';
  const summary = workspace.summary;
  const cards = [
    ['Rows', summary.totalRows],
    ['Visible', summary.visibleRows],
    ['FIT calculated', summary.calculatedRows],
    ['Data incomplete', summary.incompleteRows],
    ['Calculation failed', summary.calculationFailedRows],
    ['Review candidates', summary.candidateForEngineeringReviewRows],
  ];
  return `<div class="vi-summary">${cards.map(([label, value]) => `<div class="vi-metric"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('')}</div>`;
}

function filters(state) {
  const sourceRows = state.envelope?.workflow?.register?.rows ?? [];
  return `<div class="vi-filterbar">
    <label>Line<select data-vi-filter="line"><option value="">All lines</option>${unique(sourceRows, 'line').map((value) => option(value, state.filters.line)).join('')}</select></label>
    <label>Completeness<select data-vi-filter="completeness"><option value="">All states</option>${unique(sourceRows, 'completenessStatus').map((value) => option(value, state.filters.completeness)).join('')}</select></label>
    <label>FIT reference band<select data-vi-filter="band"><option value="">All bands</option>${unique(sourceRows, 'referenceBand').map((value) => option(value, state.filters.band)).join('')}</select></label>
    <label>Review candidate<select data-vi-filter="candidate">${option('', state.filters.candidate, 'All')}${option('true', state.filters.candidate, 'Yes')}${option('false', state.filters.candidate, 'No')}</select></label>
    <label>Sort<select data-vi-sort="field">${['line','caseId','canonicalId','status','completenessStatus','referenceBand'].map((value) => option(value, state.sort.field, value)).join('')}</select></label>
    <label>Direction<select data-vi-sort="direction">${option('asc', state.sort.direction, 'Ascending')}${option('desc', state.sort.direction, 'Descending')}</select></label>
  </div>`;
}

function mechanicalInputAction(assessment, compact = false) {
  if (assessment.mechanism.id !== 'mechanicalExcitation' || !assessment.facilityScopeId) return null;
  const incomplete = assessment.assessmentState === 'APPLICABLE_INCOMPLETE';
  const notApplicable = assessment.assessmentState === 'NOT_APPLICABLE';
  const label = compact ? 'Edit' : incomplete ? 'Evaluate sources' : 'Mechanical inputs';
  const button = `<button type="button" class="vi-row-link" data-vi-mechanical-facility-scope="${esc(assessment.facilityScopeId)}">${label}</button>`;
  if (compact) return button;
  const status = notApplicable ? 'NOT APPLICABLE' : incomplete ? 'NOT READY' : 'INPUT REQUIRED';
  return `${button}<small class="vi-mono">${status}</small>`;
}

function sbcInputAction(assessment, compact = false) {
  if (assessment.mechanism.id !== 'smallBoreConnections' || !assessment.facilityScopeId) return null;
  const incomplete = assessment.assessmentState === 'APPLICABLE_INCOMPLETE';
  const label = compact ? 'Edit' : incomplete ? 'Complete inputs' : 'SBC inputs';
  const button = `<button type="button" class="vi-row-link" data-vi-sbc-facility-scope="${esc(assessment.facilityScopeId)}">${label}</button>`;
  if (compact) return button;
  return `${button}<small class="vi-mono">${incomplete ? 'NOT READY' : 'INPUT REQUIRED'}</small>`;
}

function mechanismCell(assessment) {
  if (!assessment.calculated) {
    const mechanicalAction = mechanicalInputAction(assessment);
    if (mechanicalAction) return mechanicalAction;
    const sbcAction = sbcInputAction(assessment);
    if (sbcAction) return sbcAction;
    const reason = assessment.assessmentState === 'NOT_IMPLEMENTED'
      ? 'Not implemented; no mechanism calculation was performed.'
      : 'No current mechanism calculation.';
    return `<span class="vi-empty" title="${esc(reason)}">—</span>`;
  }
  const band = assessment.referenceBand
    ? `<small class="vi-mono">${esc(assessment.referenceBand)}</small>`
    : '';
  const qualification = assessment.qualificationState === 'CANDIDATE_USER_INPUT'
    ? '<small class="vi-mono">CANDIDATE USER INPUT</small>'
    : assessment.qualificationState === 'CANDIDATE_MASTER'
      ? '<small class="vi-mono">CANDIDATE MASTER</small>' : '';
  const currency = assessment.resultState === 'STALE_RESULT'
    ? '<small class="vi-mono">STALE_RESULT</small>' : '';
  const editAction = assessment.mechanism.id === 'mechanicalExcitation'
    ? mechanicalInputAction(assessment, true)
    : assessment.mechanism.id === 'smallBoreConnections'
      ? sbcInputAction(assessment, true) : '';
  return `<strong>${esc(assessment.lof)}</strong>${band}${qualification}${currency}${editAction ?? ''}`;
}

function evidenceCell(row) {
  const slices = [
    ['Phase', row.phaseEvidenceStrength],
    ['Standard', row.correlationEvidenceStrength],
    ['Advanced', row.advancedEvidenceStrength],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '');
  return slices.length
    ? slices.map(([label, value]) => `<span class="vi-mono">${esc(label)}: ${esc(value)}</span>`).join('<br>')
    : '<span class="vi-empty">—</span>';
}

function mechanismHeaders() {
  return VIBRATION_INTEGRITY_MECHANISMS.map((mechanism) => (
    `<th title="${esc(`${mechanism.title} · ${mechanism.sourceSection}`)}">${esc(mechanism.label)}</th>`
  )).join('');
}

function governingCell(assessment, suffix = '') {
  return assessment
    ? `${esc(assessment.mechanism.label)} · ${esc(assessment.lof)}${suffix}`
    : '<span class="vi-empty">—</span>';
}

function tableRows(workspace, state) {
  const colspan = VIBRATION_INTEGRITY_MECHANISMS.length + 9;
  if (!workspace?.rows?.length) {
    return `<tr><td colspan="${colspan}" class="vi-table-empty">No rows match the current table filters.</td></tr>`;
  }
  const userEngineeringDataRows = state.userEngineeringData?.rows ?? [];
  return workspace.rows.map((row) => {
    const matrix = buildVibrationMechanismMatrixRow(row, {
      resultState: state.resultState,
      userEngineeringDataRows,
      mechanicalSourceKeysByScope: state.mechanicalSourceKeysByScope ?? {},
      mechanicalNotApplicableByScope: state.mechanicalNotApplicableByScope ?? {},
      mechanicalCandidateResultsByScope: state.mechanicalCandidateResultsByScope ?? {},
      sbcCandidateResultsByScope: state.sbcFacilityCandidateResults ?? {},
    });
    return `<tr${workspace.selectedRowKey === row.rowKey ? ' class="is-selected"' : ''}>
      <td><button type="button" class="vi-row-link" data-vi-row="${esc(row.rowKey)}">${cell(row.line)}</button></td>
      <td>${cell(row.caseId)}</td><td class="vi-mono">${cell(row.canonicalId)}</td>
      <td>${cell(row.completenessStatus)}</td>
      ${matrix.assessments.map(mechanismCell).map((value) => `<td>${value}</td>`).join('')}
      <td>${governingCell(matrix.screeningGoverning)}</td>
      <td>${governingCell(matrix.candidateGoverning, ' · CANDIDATE')}</td>
      <td>${cell(row.qualificationState)}</td>
      <td>${evidenceCell(row)}</td>
      <td>${row.continuationRequired ? 'Further assessment required' : '<span class="vi-empty">—</span>'}</td>
    </tr>`;
  }).join('');
}

function resultCurrencyBanner(state) {
  if (state.resultState !== 'STALE_RESULT') return '';
  return '<div class="vi-banner warn"><strong>STALE RESULT · rerun required.</strong><span>FIT screening plus facility-scoped Mechanical and SBC candidate values are retained for inspection only and cannot become current governing results until rerun.</span></div>';
}

function workspaceTable(state) {
  if (!state.workspace) {
    return '<section class="vi-card vi-empty-state"><h3>No facility register yet</h3><p>Inspect or edit the working tables, check readiness if desired, then run FIT screening. Mechanical and SBC inputs attach to the resulting line/case/canonical facility rows.</p></section>';
  }
  return `<section class="vi-card vi-workspace-card">
    <div class="vi-section-head"><div><h3>Facility vibration screening register</h3><p>FIT is qualified for bounded screening. Mechanical T2.3 and SBC Type-3 are separately identified non-authorizing candidates.</p></div></div>
    ${resultCurrencyBanner(state)}
    <div class="vi-banner warn"><strong>Authority boundary.</strong><span>Screening governing uses authorized screening mechanisms only. Mechanical/SBC candidate values are displayed separately and cannot replace FIT screening. Design authority remains false and full multi-mechanism screening is not established.</span></div>
    ${summaryCards(state.workspace)}${filters(state)}
    <div class="vi-table-wrap"><table class="vi-table"><thead><tr>
      <th>Line</th><th>Case</th><th>Canonical ID</th><th>Completeness</th>${mechanismHeaders()}<th>Screening governing</th><th>Candidate governing</th><th>Qualification</th><th>FIT evidence</th><th>Disposition</th>
    </tr></thead><tbody>${tableRows(state.workspace, state)}</tbody></table></div>
  </section>`;
}

function detailPanel(state) {
  const detail = state.workspace?.detail;
  if (!detail) return '';
  const mechanismAssessmentSet = buildSelectedFitMechanismAssessmentSet(state);
  return `<section class="vi-card vi-detail-card"><div class="vi-section-head"><div><h3>${esc(detail.summary.line)} · ${esc(detail.summary.caseId)}</h3><p class="vi-mono">${esc(detail.summary.canonicalId)}</p></div></div><div class="vi-detail-tabs">${renderVibrationIntegrityDetailTabs(state.detailTab)}</div><div class="vi-detail-body">${renderVibrationIntegrityDetailBody(detail, state.detailTab, { mechanismAssessmentSet })}</div></section>`;
}

function importFacts(state) {
  const imports = state.envelope?.imports;
  if (!imports) return '';
  const snapshot = state.runSnapshot?.snapshotHash;
  return `<div class="vi-import-facts"><span>Topology: <strong>${esc(imports.topologyFormat)}</strong></span><span>Integrity: <strong>${esc(imports.exchangeIntegrityStatus)}</strong></span><span>Operating cases: <strong>${esc(imports.operatingCaseCount)}</strong></span><span>Enrichment rows: <strong>${esc(imports.enrichmentCount)}</strong></span><span>Data blockers: <strong>${esc(imports.dataBlockerCount ?? 0)}</strong></span><span>Active manual inputs: <strong>${esc(imports.activeDataBlockerCount ?? 0)}</strong></span><span>Qualification: <strong>${esc(state.envelope?.qualificationMode ?? '—')}</strong></span><span>Result: <strong>${esc(state.resultState ?? 'UNRUN')}</strong></span>${snapshot ? `<span>Run snapshot: <strong class="vi-mono">${esc(snapshot)}</strong></span>` : ''}</div>`;
}

export function renderVibrationIntegrityHtml(state) {
  return `<div class="vi-root">
    <header class="vi-header"><div><h2>Vibration Integrity</h2><p>Line-centric vibration integrity workspace with bounded FIT screening and separately identified Mechanical/SBC candidates.</p></div><div class="vi-authority"><strong>SCREENING</strong><span>FIT BOUNDED · MECHANICAL/SBC CANDIDATE · DESIGN AUTHORITY FALSE</span></div></header>
    ${state.error ? `<div class="vi-banner bad"><strong>Unable to run workspace.</strong><span>${esc(state.error)}</span></div>` : ''}
    ${renderVibrationIntegrityInputArea(state)}${preflightPanel(state)}${importFacts(state)}${workspaceTable(state)}${detailPanel(state)}
  </div>`;
}
