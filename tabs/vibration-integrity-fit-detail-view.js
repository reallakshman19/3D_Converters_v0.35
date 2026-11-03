function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
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
  const body = rows.map(([label, value]) => `<tr><th>${esc(label)}</th><td>${display(value)}</td></tr>`).join('');
  return `<div class="vi-detail-table-wrap"><table class="vi-detail-table"><tbody>${body}</tbody></table></div>`;
}

function dataTable(headers, rows, emptyMessage) {
  const head = `<thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead>`;
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((value) => `<td>${display(value)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${headers.length}" class="vi-table-empty">${esc(emptyMessage)}</td></tr>`;
  return `<div class="vi-detail-table-wrap"><table class="vi-detail-table">${head}<tbody>${body}</tbody></table></div>`;
}

function resolvedInputRows(fit) {
  return Object.values(fit.resolvedInputs ?? {}).map((item) => [
    item.key, item.value, item.unit, item.canonicalValue, item.canonicalUnit,
    item.transformation, item.source?.type ?? null,
  ]);
}

function identitySection(fit) {
  const execution = fit.execution ?? {};
  return section('FIT mechanism execution', keyValueTable([
    ['Mechanism', fit.mechanismId], ['Calculation ID', fit.calculationId],
    ['Method revision', fit.methodRevision], ['Execution ID', execution.executionId],
    ['Implementation revision', execution.implementationRevision], ['Timestamp', execution.timestamp],
    ['Qualification', fit.qualification?.effective ?? fit.qualification?.method],
    ['Engineering authority', fit.provenance?.engineeringAuthority],
  ]));
}

function inputsSection(fit) {
  return section('Normalized engineering inputs', dataTable(
    ['Input', 'Working value', 'Working unit', 'Canonical value', 'Canonical unit', 'Transformation', 'Resolution source'],
    resolvedInputRows(fit),
    'No normalized input trace is available.',
  ));
}

function hydraulicsSection(fit) {
  const h = fit.intermediates?.hydraulics ?? {};
  return section('Hydraulics', keyValueTable([
    ['Inside diameter (m)', h.insideDiameterM], ['Inside diameter source', h.insideDiameterSource],
    ['Flow area (m²)', h.flowAreaM2], ['Gas volumetric flow (m³/s)', h.gasVolumetricFlowM3S],
    ['Liquid volumetric flow (m³/s)', h.liquidVolumetricFlowM3S],
    ['Aggregate volumetric flow (m³/s)', h.aggregateVolumetricFlowM3S],
    ['Velocity (m/s)', h.velocityMS], ['Velocity source', h.velocitySource],
    ['Resolution mode', h.resolutionMode], ['Resolution selection', h.resolutionModeSelection],
    ['Alternate-mode data present', h.alternateModeDataPresent],
  ]));
}

function excitationSection(fit) {
  const excitation = fit.intermediates?.excitation ?? {};
  const standard = fit.intermediates?.standard ?? {};
  return section('Excitation / standard demand', keyValueTable([
    ['Density (kg/m³)', excitation.densityKgM3], ['Density source', excitation.densitySource],
    ['ρv² (Pa)', excitation.rhoV2], ['Gas viscosity factor', standard.fluidViscosityFactor],
    ['Standard demand (Pa)', standard.demand],
  ]));
}

function supportSection(fit) {
  const support = fit.intermediates?.support ?? {};
  const boundaries = support.boundaries ?? {};
  return section('Support classification', keyValueTable([
    ['Stiffness', support.stiffness], ['Support category', support.category],
    ['Stiff maximum span (m)', boundaries.stiffMaxM],
    ['Medium-stiff maximum span (m)', boundaries.mediumStiffMaxM],
    ['Medium maximum span (m)', boundaries.mediumMaxM],
  ]));
}

function standardCorrelationSection(fit) {
  const correlation = fit.intermediates?.standardCorrelation ?? {};
  return section('Standard FIT correlation', keyValueTable([
    ['Correlation ID', correlation.correlationId], ['Path', correlation.path],
    ['Support category', correlation.category], ['Form', correlation.form],
    ['Coefficient a', correlation.a], ['Coefficient b', correlation.b],
    ['Reference Fv (Pa)', correlation.fv], ['Standard LOF', fit.outputs?.standardLof],
  ]));
}

function advancedSection(fit) {
  const eligibility = fit.intermediates?.advancedEligibility ?? {};
  const correlation = fit.intermediates?.advancedCorrelation ?? {};
  const advanced = fit.intermediates?.advanced ?? {};
  const range = eligibility.rangeHz ?? {};
  return section('Advanced FIT path', keyValueTable([
    ['Eligible', eligibility.eligible], ['Eligibility reason', eligibility.reason],
    ['Declared fn minimum (Hz)', range.min], ['Minimum inclusive', range.minInclusive],
    ['Declared fn maximum (Hz)', range.max], ['Maximum inclusive', range.maxInclusive],
    ['Natural frequency (Hz)', advanced.naturalFrequencyHz],
    ['Correlation ID', correlation.correlationId], ['Support category', correlation.category],
    ['Form', correlation.form], ['Coefficient a', correlation.a], ['Coefficient b', correlation.b],
    ['Reference Fv (Pa)', correlation.fv], ['Advanced LOF', fit.outputs?.refinedLof],
  ]));
}

function resultSection(fit) {
  return section('Governing FIT reference result', keyValueTable([
    ['Standard LOF', fit.outputs?.standardLof], ['Advanced LOF', fit.outputs?.refinedLof],
    ['Governing reference LOF', fit.outputs?.governingReferenceLof],
    ['Reference band', fit.outputs?.referenceBand], ['Assessment status', fit.assessment?.status],
    ['Reference threshold', fit.outputs?.referenceThreshold],
    ['Threshold exceeded', fit.outputs?.referenceThresholdExceeded],
  ]));
}

function evidenceSection(fit) {
  const source = fit.provenance?.sourceWorkbook ?? {};
  return section('Calculation trace / provenance', keyValueTable([
    ['Correlation IDs', fit.correlationIds], ['Equation IDs', fit.equationIds],
    ['Domain API', fit.provenance?.domainApi],
    ['Qualification coverage ID', fit.provenance?.qualificationCoverageId],
    ['Screening-candidate scope ID', fit.provenance?.screeningCandidateScopeId],
    ['Source repository', source.repository], ['Source commit', source.commit],
    ['Source path', source.path], ['Source blob', source.gitBlob], ['Source sheet', source.sheet],
  ]));
}

export function renderVibrationIntegrityFitCalculation(detail) {
  const fit = detail?.fitMechanism;
  if (!fit) return '<p class="vi-empty">No central FIT calculation exists for this row.</p>';
  return `${identitySection(fit)}${inputsSection(fit)}${hydraulicsSection(fit)}${excitationSection(fit)}${supportSection(fit)}${standardCorrelationSection(fit)}${advancedSection(fit)}${resultSection(fit)}${evidenceSection(fit)}`;
}
