import { AIV_D23_PRODUCT_PATH_VALIDATION } from './vibration-aiv-validation-records.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function empty(value) {
  return value === null || value === undefined || value === ''
    ? '<span class="aivq-empty">NOT_CALCULATED</span>'
    : esc(value);
}

function fixed(value, decimals) {
  const number = Number(value);
  if (!Number.isFinite(number)) return empty(value);
  const text = number.toFixed(decimals);
  return `<span title="Full precision: ${esc(value)}">${esc(text)}</span>`;
}

function db(value) { return fixed(value, 1); }
function factor(value) { return fixed(value, 4); }
function lof(value) { return fixed(value, 2); }
function screeningBadge() { return '<span class="aiv-canvas-badge authority">SCREENING OUTPUT</span>'; }

function screeningHtml(engineResult) {
  const sourceRows = (engineResult.outputs?.sourceResults ?? []).map((row) => `<tr><td><code>${esc(row.sourceCanonicalId)}</code></td><td>${esc(row.caseId)}</td><td>${db(row.rawSourcePwlDb)}</td><td>${db(row.sonicFlowFactorDb)}</td><td>${db(row.trimReductionDb)}</td><td>${db(row.effectiveSourcePwlDb)}</td><td>${screeningBadge()}</td></tr>`).join('');
  const assessmentRows = (engineResult.outputs?.assessmentResults ?? []).map((row) => `<tr><td><code>${esc(row.assessmentCanonicalId)}</code></td><td>${esc(row.line ?? '—')}</td><td>${esc(row.caseId)}</td><td>${db(row.combinedPointPwlDb)}</td><td>${factor(row.t26Intermediates?.FLM1)}</td><td>${factor(row.t26Intermediates?.FLM2)}</td><td><strong>${lof(row.lof)}</strong></td><td>${screeningBadge()}</td></tr>`).join('');
  const lineRows = (engineResult.outputs?.lineCaseSummaries ?? []).map((row) => `<tr><td>${esc(row.line ?? '—')}</td><td>${esc(row.caseId)}</td><td>${lof(row.lof)}</td><td>${lof(row.maxAssessmentLof)}</td><td>${esc(row.aggregationBasis)}</td><td><span class="aivq-status gap">NON-AUTHORITATIVE</span></td></tr>`).join('');
  const assumptions = engineResult.evidence?.domainResult?.assumptionProfile;
  return `<section class="aivq-card aivq-results-card">
    <div class="aivq-section-head"><div><h4>AIV screening results</h4><p>Assessment-level screening output from the registered <code>VIB.AIV.ACOUSTIC</code> Engineering Calculation API. The configured line/case summary remains traceability-only and is not a screening decision.</p></div><div><button type="button" class="engineering-console-btn" data-aiv-action="export-screening-result">Export screening result JSON</button> <button type="button" class="engineering-console-btn" data-aiv-action="export-eit">Export EI .eit</button></div></div>
    <div class="aivq-result-summary"><span>Qualification <strong>SCREENING</strong></span><span>Result scope <strong>${esc(engineResult.outputs?.screeningResultScope)}</strong></span><span>Kernel stages <strong>${esc(engineResult.outputs?.completeKernelStageCount)}/10</strong></span><span>Assumptions <strong>${assumptions?.policy?.assumptionsMustBeVisible ? 'VISIBLE / EDITABLE' : '—'}</strong></span><span>Design authority <strong>false</strong></span></div>
    <h5>Source Results · <code>AivSourceResult.v1</code></h5><div class="aivq-example-table"><table><thead><tr><th>Source</th><th>Case</th><th>Raw PWL (dB)</th><th>SFF (dB)</th><th>Trim (dB)</th><th>Effective PWL (dB)</th><th>Authority</th></tr></thead><tbody>${sourceRows || '<tr><td colspan="7">—</td></tr>'}</tbody></table></div>
    <h5>Assessment Screening Results · <code>AivAssessmentResult.v1</code></h5><div class="aivq-example-table"><table><thead><tr><th>Assessment</th><th>Line</th><th>Case</th><th>Point PWL (dB)</th><th>FLM1</th><th>FLM2</th><th>LOF</th><th>Authority</th></tr></thead><tbody>${assessmentRows || '<tr><td colspan="8">—</td></tr>'}</tbody></table></div>
    <h5>Line / Case Summary · non-authoritative for screening</h5><div class="aivq-example-table"><table><thead><tr><th>Line</th><th>Case</th><th>Configured line LOF</th><th>Max assessment LOF</th><th>Basis</th><th>Authority</th></tr></thead><tbody>${lineRows || '<tr><td colspan="6">—</td></tr>'}</tbody></table></div>
    <div class="aivq-readiness-note"><strong>Display precision:</strong> dB values are shown to 0.1 dB, LOF to 0.01 and FLM factors to four decimals; hover retains the full-precision calculation value. Exported evidence remains unrounded.</div>
    <div class="aivq-readiness-note"><strong>Screening only.</strong> Assessment LOF is the qualified screening scope. This output is not design approval and does not make the configured line/case LOF authoritative.</div>
  </section>`;
}

function blockedSourceRows(resultSet) {
  const rows = resultSet?.sourceResults ?? [];
  if (!rows.length) return '<tr><td colspan="10" class="aivq-empty-row">No Source Result shells available. Check readiness after loading working inputs.</td></tr>';
  return rows.map((row) => `<tr><td><code>${esc(row.sourceCanonicalId)}</code></td><td>${esc(row.caseId)}</td><td>${esc(row.sourceDeviceType)}</td><td>${empty(row.rawSourcePwlDb)}</td><td>${empty(row.sonicFlowFactorDb)}</td><td>${empty(row.trimReductionDb)}</td><td>${empty(row.effectiveSourcePwlDb)}</td><td>${empty(row.thresholdBranch)}</td><td><span class="aivq-status gap">${esc(row.status)}</span></td><td>${esc(row.readiness.relationshipCount)}</td></tr>`).join('');
}

function blockedAssessmentRows(resultSet) {
  const rows = resultSet?.assessmentResults ?? [];
  if (!rows.length) return '<tr><td colspan="10" class="aivq-empty-row">No Assessment Result shells available.</td></tr>';
  return rows.map((row) => `<tr><td><code>${esc(row.assessmentCanonicalId)}</code></td><td>${esc(row.line ?? '—')}</td><td>${esc(row.caseId)}</td><td>${esc(row.assessmentType ?? '—')}</td><td>${esc(row.contributingSourceCanonicalIds.join(', '))}</td><td>${empty(row.combinedPointPwlDb)}</td><td>${row.t26Intermediates === null ? '<span class="aivq-empty">NOT_CALCULATED</span>' : esc('AVAILABLE')}</td><td>${empty(row.lof)}</td><td><span class="aivq-status gap">${esc(row.status)}</span></td><td>${esc(row.readiness.statuses.join(', ') || '—')}</td></tr>`).join('');
}

function blockedLineRows(resultSet) {
  const rows = resultSet?.lineCaseSummaries ?? [];
  if (!rows.length) return '<tr><td colspan="9" class="aivq-empty-row">No Line / Case Summary shells available.</td></tr>';
  return rows.map((row) => `<tr><td>${esc(row.line ?? '—')}</td><td>${esc(row.caseId)}</td><td>${esc(row.assessmentCount)}</td><td>${esc(row.assessmentCanonicalIds.join(', '))}</td><td>${esc(row.sourceCanonicalIds.join(', '))}</td><td>${empty(row.lof)}</td><td>${empty(row.controllingAssessmentCanonicalId)}</td><td>${row.controllingSourceCanonicalIds.length ? esc(row.controllingSourceCanonicalIds.join(', ')) : '<span class="aivq-empty">NOT_CALCULATED</span>'}</td><td><span class="aivq-status gap">${esc(row.status)}</span></td></tr>`).join('');
}

function validatedBenchmarkHtml() {
  const record = AIV_D23_PRODUCT_PATH_VALIDATION;
  const a = record.assessmentResult;
  const t = a.t26Intermediates;
  const sourceRows = record.sourceResults.map((row) => `<tr><td><code>${esc(row.sourceCanonicalId)}</code></td><td>${esc(row.caseId)}</td><td>${db(row.rawSourcePwlDb)}</td><td>${db(row.sonicFlowFactorDb)}</td><td>${db(row.trimReductionDb)}</td><td>${db(row.effectiveSourcePwlDb)}</td><td><span class="aivq-status ok">VALIDATED</span></td></tr>`).join('');
  return `<section class="aivq-card aivq-results-card">
    <div class="aivq-section-head"><div><h4>Validated EI D.2.3 benchmark results</h4><p>Committed 10-stage benchmark parity. Use Run AIV screening after readiness to execute the registered screening path.</p></div><button type="button" class="engineering-console-btn" data-aiv-action="export-d23-validation">Export validation package</button></div>
    <div class="aivq-result-summary"><span>Validation <strong>${esc(record.status)}</strong></span><span>Checks <strong>${esc(record.counts.passed)}/${esc(record.counts.checks)}</strong></span><span>Stages <strong>${esc(record.completeKernelStageCount)}/10</strong></span><span>Screening release <strong>QUALIFIED</strong></span><span>Design authority <strong>false</strong></span></div>
    <h5>Source Results</h5><div class="aivq-example-table"><table><thead><tr><th>Source</th><th>Case</th><th>Raw PWL (dB)</th><th>SFF (dB)</th><th>Trim (dB)</th><th>Effective PWL (dB)</th><th>Status</th></tr></thead><tbody>${sourceRows}</tbody></table></div>
    <h5>Assessment Result</h5><div class="aivq-example-table"><table><thead><tr><th>Assessment</th><th>Line</th><th>Case</th><th>Point PWL (dB)</th><th>Attenuation (dB)</th><th>LOF</th><th>Status</th></tr></thead><tbody><tr><td><code>${esc(a.assessmentCanonicalId)}</code></td><td>${esc(a.line)}</td><td>${esc(a.caseId)}</td><td>${db(a.combinedPointPwlDb)}</td><td>${db(a.attenuationDb)}</td><td>${lof(a.lof)}</td><td><span class="aivq-status ok">VALIDATED</span></td></tr></tbody></table></div>
    <h5>T2-6 calculation detail</h5><div class="aivq-example-table"><table><thead><tr><th>A</th><th>S</th><th>B</th><th>log10(N)</th><th>N</th><th>Dext/dext</th><th>FLM1</th><th>FLM1 recalculated</th><th>FLM2</th><th>N after FLM2</th><th>Lf</th></tr></thead><tbody><tr><td>${esc(t.A)}</td><td>${esc(t.S)}</td><td>${esc(t.B)}</td><td>${esc(t.log10N)}</td><td>${esc(t.N)}</td><td>${esc(t.diameterRatio)}</td><td>${factor(t.FLM1)}</td><td>${factor(t.calculatedFLM1FromGeometry)}</td><td>${factor(t.FLM2)}</td><td>${esc(t.NAfterFLM2)}</td><td>${esc(t.Lf)}</td></tr></tbody></table></div>
    <h5>Line / Case Summary</h5><div class="aivq-example-table"><table><thead><tr><th>Line</th><th>Case</th><th>Line LOF</th><th>Basis</th><th>Screening authority</th></tr></thead><tbody><tr><td>${esc(record.lineResult.line)}</td><td>${esc(record.lineResult.caseId)}</td><td>${lof(record.lineResult.lof)}</td><td>${esc(record.lineResult.aggregationBasis)}</td><td>NON-AUTHORITATIVE</td></tr></tbody></table></div>
    <div class="aivq-readiness-note"><strong>Display precision:</strong> dB values are shown to 0.1 dB, LOF to 0.01 and FLM factors to four decimals, consistent with the controlled D.2.3 reference panel. Hover retains full precision.</div>
  </section>`;
}

export function renderAivResultShellsHtml(state = {}) {
  if (state.screeningResult?.ok) return screeningHtml(state.screeningResult);
  const validationModified = Boolean(state.benchmark?.loaded?.modified || state.assumptionProfileModified);
  if (state.benchmark?.loaded && !validationModified) return validatedBenchmarkHtml();
  const resultSet = state.resultSet ?? null;
  const summary = resultSet
    ? `<div class="aivq-result-summary"><span>Source shells <strong>${esc(resultSet.counts.sources)}</strong></span><span>Assessment shells <strong>${esc(resultSet.counts.assessments)}</strong></span><span>Line/case shells <strong>${esc(resultSet.counts.lineCaseSummaries)}</strong></span></div>`
    : `<div class="aivq-readiness-note">${validationModified ? 'Benchmark inputs or assumptions were modified, so the committed benchmark validation is not applicable. Check readiness, then run screening for the edited inputs.' : 'Check AIV readiness to instantiate current result scopes.'}</div>`;
  return `<section class="aivq-card aivq-results-card">
    <div class="aivq-section-head"><div><h4>AIV result scopes</h4><p>Source, Assessment and Line/Case scopes remain separate. Assessment-level screening execution becomes available after readiness.</p></div></div>${summary}
    <h5>Source Results</h5><div class="aivq-example-table"><table><thead><tr><th>Source</th><th>Case</th><th>Device</th><th>Raw source PWL (dB)</th><th>SFF (dB)</th><th>Trim (dB)</th><th>Effective source PWL (dB)</th><th>Threshold branch</th><th>Status</th><th>Relationships</th></tr></thead><tbody>${blockedSourceRows(resultSet)}</tbody></table></div>
    <h5>Assessment Results</h5><div class="aivq-example-table"><table><thead><tr><th>Assessment</th><th>Line</th><th>Case</th><th>Type</th><th>Contributing sources</th><th>Combined point PWL (dB)</th><th>T2-6</th><th>LOF</th><th>Status</th><th>Readiness</th></tr></thead><tbody>${blockedAssessmentRows(resultSet)}</tbody></table></div>
    <h5>Line / Case Summary</h5><div class="aivq-example-table"><table><thead><tr><th>Line</th><th>Case</th><th>Assessments</th><th>Assessment IDs</th><th>Source IDs</th><th>Line LOF</th><th>Controlling assessment</th><th>Controlling sources</th><th>Status</th></tr></thead><tbody>${blockedLineRows(resultSet)}</tbody></table></div>
  </section>`;
}
