import { renderVibrationIntegrityFitCalculation } from './vibration-integrity-fit-detail-view.js';

export const VIBRATION_INTEGRITY_DETAIL_TABS = Object.freeze([
  'summary', 'inputs', 'calculation', 'case', 'evidence', 'source', 'diagnostics',
]);

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function display(value) {
  if (value === null || value === undefined || value === '') return '<span class="vi-empty">—</span>';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.length ? esc(value.join('; ')) : '<span class="vi-empty">—</span>';
  return esc(value);
}

function section(title, body) {
  return `<section class="vi-detail-section"><h4>${esc(title)}</h4>${body}</section>`;
}

function keyValueTable(rows) {
  return `<div class="vi-detail-table-wrap"><table class="vi-detail-table"><tbody>${rows.map(([label, value]) => `<tr><th>${esc(label)}</th><td>${display(value)}</td></tr>`).join('')}</tbody></table></div>`;
}

function dataTable(headers, rows, emptyMessage) {
  const head = `<thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead>`;
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((value) => `<td>${display(value)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${headers.length}" class="vi-table-empty">${esc(emptyMessage)}</td></tr>`;
  return `<div class="vi-detail-table-wrap"><table class="vi-detail-table">${head}<tbody>${body}</tbody></table></div>`;
}

function mechanismContract(context = {}) {
  const set = context.mechanismAssessmentSet;
  const item = set?.items?.[0];
  if (!set || !item) return '';
  return section('Mechanism assessment contract', keyValueTable([
    ['Assessment set ID', set.setId], ['Mechanism item ID', item.itemId],
    ['Child cardinality', set.cardinality?.kind], ['Child count', set.cardinality?.count],
    ['Implementation state', item.implementationState], ['Assessment state', item.assessmentState],
    ['Result currency', item.resultState], ['Benchmark state', item.benchmark?.status],
    ['Input trace state', item.trace?.inputTrace?.status], ['Screening authority', false],
  ]));
}

function mechanismWorkingTrace(context = {}) {
  const item = context.mechanismAssessmentSet?.items?.[0];
  const cells = item?.trace?.inputTrace?.workingCells ?? {};
  const rows = Object.entries(cells).map(([input, trace]) => [
    input, trace?.sourceAnchorId, trace?.valueRef?.kind, trace?.valueRef?.rowId,
    trace?.valueRef?.header, trace?.unitRef?.header,
  ]);
  if (!item) return '';
  return section('Mechanism working-input trace', dataTable(
    ['Input', 'Source anchor', 'Table', 'Row ID', 'Value field', 'Unit field'],
    rows,
    'No exact working-cell pointers are available for this mechanism item.',
  ));
}

function summaryView(detail, context = {}) {
  const row = detail.summary ?? {};
  return `<div class="vi-detail-grid">
    ${section('Identity', keyValueTable([
      ['Line', row.line], ['Operating Case', row.caseId], ['Canonical ID', row.canonicalId],
      ['Status', row.status], ['Completeness', row.completenessStatus],
    ]))}
    ${section('FIT reference result', keyValueTable([
      ['Standard LOF', row.standardLof], ['Refined LOF', row.refinedLof],
      ['Governing reference LOF', row.governingReferenceLof], ['Reference band', row.referenceBand],
      ['Assessment status', row.assessmentStatus],
    ]))}
    ${section('Qualification / evidence', keyValueTable([
      ['Qualification', row.qualificationState], ['Benchmark authority', row.benchmarkAuthority],
      ['Phase evidence', row.phaseEvidenceStrength], ['Correlation evidence', row.correlationEvidenceStrength],
      ['Advanced evidence', row.advancedEvidenceStrength],
      ['Engineering review candidate', row.candidateForEngineeringReview],
      ['Candidate status', row.screeningCandidateStatus], ['Continuation required', row.continuationRequired],
    ]))}
    ${mechanismContract(context)}
  </div>`;
}

function inputSource(detail, key) {
  const geometry = detail.sourceTrace?.geometry ?? {};
  const geometryTrace = {
    outsideDiameter: geometry.outsideDiameter,
    wallThickness: geometry.wallThickness,
    insideDiameter: geometry.insideDiameter,
    maximumUnsupportedSpan: geometry.maximumUnsupportedSpan,
    naturalFrequency: geometry.naturalFrequency,
  }[key];
  if (geometryTrace?.source) return geometryTrace.source;
  if (['phase', 'massFlow', 'density', 'fluidVelocity', 'gasDynamicViscosity'].includes(key)) {
    return detail.sourceTrace?.operatingCase?.source ?? null;
  }
  return null;
}

function inputsView(detail, context = {}) {
  if (!detail.inputs) return '<p class="vi-empty">No executable request exists for this row.</p>';
  const values = detail.inputs.values ?? {};
  const units = detail.inputs.units ?? {};
  const rows = Object.keys(values).map((key) => [key, values[key], units[key] ?? null, inputSource(detail, key)]);
  return `${section('Prepared benchmark request', dataTable(
    ['Input', 'Value', 'Unit', 'Source context'], rows, 'No prepared inputs.',
  ))}${section('Execution boundary', keyValueTable([
    ['Qualification mode', detail.inputs.qualificationMode],
    ['Screening authority', false],
  ]))}${mechanismWorkingTrace(context)}`;
}

function operatingCaseQuantityRows(operatingCase) {
  if (!operatingCase) return [];
  return Object.entries(operatingCase)
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value)
      && Object.hasOwn(value, 'value') && Object.hasOwn(value, 'unit'))
    .map(([key, value]) => [key, value.value, value.unit, value.reference ?? null]);
}

function caseView(detail) {
  const row = detail.operatingCase;
  const metadata = row ? keyValueTable([
    ['Line', row.line], ['Operating Case', row.caseId], ['Label', row.label], ['Phase', row.phase],
    ['Source', row.source], ['Source revision', row.sourceRevision], ['Record ID', row.recordId],
  ]) : '<p class="vi-empty">No operating-case record is joined to this row.</p>';
  const quantities = dataTable(
    ['Quantity', 'Value', 'Unit', 'Reference'], operatingCaseQuantityRows(row), 'No operating-case quantities.',
  );
  const enrichmentRows = (detail.enrichment ?? []).map((item) => [
    item.property, item.caseId ?? 'GLOBAL', item.value, item.unit, item.source,
    item.sourceRevision, item.status, item.reviewer,
  ]);
  const enrichment = dataTable(
    ['Property', 'Case scope', 'Value', 'Unit', 'Source', 'Revision', 'Status', 'Reviewer'],
    enrichmentRows,
    'No enrichment rows are joined to this Canonical ID / case.',
  );
  return `${section('Operating case', metadata)}${section('Process quantities', quantities)}${section('Vibration enrichment', enrichment)}`;
}

function evidenceRow(label, evidence) {
  if (!evidence) return [label, null, null, null, null];
  return [
    label,
    evidence.path ?? evidence.supportCategory ?? evidence.evaluatedPath ?? null,
    evidence.evidenceStrength,
    evidence.evidenceTypes,
    evidence.evidenceIds,
  ];
}

function evidenceView(detail) {
  const block = detail.evidenceQualification;
  if (!block) return '<p class="vi-empty">No central calculation evidence exists for this row.</p>';
  const qualification = block.qualification ?? {};
  const coverage = block.qualificationCoverage ?? {};
  const candidate = block.screeningCandidate ?? {};
  const evidence = block.evidence ?? {};
  return `${section('Qualification', keyValueTable([
    ['Effective', qualification.effective], ['Method', qualification.method], ['Data', qualification.data],
    ['Design authority', qualification.designAuthority], ['Reasons', qualification.reasons],
  ]))}${section('Qualification evidence coverage', dataTable(
    ['Slice', 'Path / category', 'Strength', 'Evidence types', 'Evidence IDs'],
    [
      evidenceRow('Phase / hydraulic path', coverage.phasePath),
      evidenceRow('Standard correlation', coverage.standardCorrelation),
      evidenceRow('Advanced correlation', coverage.advancedCorrelation),
      evidenceRow('Reference band', coverage.referenceBand),
    ],
    'No qualification coverage metadata.',
  ))}${section('Engineering-review candidate', keyValueTable([
    ['Scope ID', candidate.scopeId], ['Status', candidate.status],
    ['Candidate for engineering review', candidate.candidateForEngineeringReview],
    ['Continuation required', candidate.continuationRequired], ['Coverage basis', candidate.coverageBasis],
    ['Phase path', candidate.phasePath], ['Support category', candidate.supportCategory],
    ['Standard reference LOF', candidate.standardReferenceLof],
    ['Point coverage only', candidate.pointCoverageOnly], ['Domain coverage established', candidate.domainCoverageEstablished],
    ['Screening authorized', candidate.screeningAuthorized], ['Engineering authority', candidate.engineeringAuthority],
    ['Reasons', candidate.reasons],
  ]))}${section('Calculation evidence', keyValueTable([
    ['Correlation IDs', evidence.correlationIds], ['Equation IDs', evidence.equationIds],
    ['Multiphase resolution mode', evidence.inputResolution?.multiphaseResolutionMode],
    ['Resolution selection', evidence.inputResolution?.selection],
    ['Alternate mode data present', evidence.inputResolution?.alternateModeDataPresent],
  ]))}`;
}

function traceRows(object) {
  if (!object || typeof object !== 'object') return [];
  return Object.entries(object)
    .filter(([, value]) => value === null || value === undefined || typeof value !== 'object')
    .map(([key, value]) => [key, value]);
}

function sourceView(detail) {
  const trace = detail.sourceTrace ?? {};
  const geometryRows = Object.entries(trace.geometry ?? {}).map(([field, item]) => [
    field, item?.source, item?.sourceRevision, item?.recordId, item?.status, item?.reviewer, item?.selection,
  ]);
  return `${section('Assessment point source', keyValueTable(traceRows(trace.assessmentPoint)))}${section(
    'Operating-case source', keyValueTable(traceRows(trace.operatingCase)),
  )}${section('Geometry / vibration source trace', dataTable(
    ['Field', 'Source', 'Revision', 'Record ID', 'Status', 'Reviewer', 'Selection'],
    geometryRows,
    'No geometry/vibration source trace is available.',
  ))}`;
}

function diagnosticsView(detail) {
  const diagnostics = detail.diagnostics ?? {};
  const errorRows = (diagnostics.centralErrors ?? []).map((error) => [
    error.code, error.field, error.message,
  ]);
  return `${section('Data readiness diagnostics', keyValueTable([
    ['Missing', diagnostics.missing], ['Invalid', diagnostics.invalid], ['Error codes', diagnostics.errorCodes],
  ]))}${section('Central calculation errors', dataTable(
    ['Code', 'Field', 'Message'], errorRows, 'No central calculation errors.',
  ))}`;
}

export function renderVibrationIntegrityDetailTabs(active) {
  return VIBRATION_INTEGRITY_DETAIL_TABS.map((tab) => `<button type="button" class="vi-detail-tab${tab === active ? ' is-active' : ''}" data-vi-detail="${tab}">${esc(tab[0].toUpperCase() + tab.slice(1))}</button>`).join('');
}

export function renderVibrationIntegrityDetailBody(detail, tab, context = {}) {
  if (!detail) return '';
  if (tab === 'inputs') return inputsView(detail, context);
  if (tab === 'calculation') return renderVibrationIntegrityFitCalculation(detail);
  if (tab === 'case') return caseView(detail);
  if (tab === 'evidence') return evidenceView(detail);
  if (tab === 'source') return sourceView(detail);
  if (tab === 'diagnostics') return diagnosticsView(detail);
  return summaryView(detail, context);
}
