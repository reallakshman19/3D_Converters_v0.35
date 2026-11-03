import {
  AIV_D23_BENCHMARK_CASES,
  AIV_EI_D23_SOURCE,
  AIV_EI_MAIN_GUIDANCE_SOURCE,
  AIV_METHOD_TRACE_FOUNDATION,
} from '../converters/vibration/aiv/aiv-qualification-evidence.js';
import {
  AIV_EI_EXAMPLES_PDF_SOURCE,
  AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE,
} from '../converters/vibration/aiv/aiv-d23-pdf-revalidation.js';
import { AIV_INDEPENDENT_BENCHMARKS } from '../converters/vibration/aiv/aiv-independent-benchmark-evidence.js';
import { renderAivInlineSymbol } from './vibration-aiv-inline-symbols.js';
import { renderAivInputWorkspaceHtml } from './vibration-aiv-input-view.js?v=20260816-aiv-canvas-release-1';
import { renderAivPromotionReadinessHtml } from './vibration-aiv-promotion-view.js';
import { renderAivReadinessPanelHtml } from './vibration-aiv-readiness-view.js';
import { renderAivResultShellsHtml } from './vibration-aiv-result-view.js';

function esc(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function cell(value) { return value === null || value === undefined || value === '' ? '<span class="aivq-empty">—</span>' : esc(value); }
function evidenceKind(state) { return /REQUIRED|PARTIAL|GAP|ERRATA|RECONCILIATION_OPEN/u.test(state) ? 'gap' : 'ok'; }
function sourceLabel(sourceId) {
  if (sourceId === AIV_EI_MAIN_GUIDANCE_SOURCE.sourceId) return 'EI T2.7 main guidance';
  if (sourceId === AIV_EI_D23_SOURCE.sourceId) return 'EI D.2.3 worked example';
  return 'Unresolved source';
}
function coverageRows() {
  return AIV_METHOD_TRACE_FOUNDATION.map((item) => `<tr><td><code>${esc(item.traceId)}</code></td><td>${esc(item.subject)}</td><td>${esc(sourceLabel(item.sourceId))}<br><small>${cell(item.locator)}</small></td><td><span class="aivq-status ${evidenceKind(item.qualificationState)}">${esc(item.qualificationState)}</span></td><td>${item.gaps?.length ? esc(item.gaps.join('; ')) : item.benchmarkIds?.length ? esc(item.benchmarkIds.join('; ')) : '<span class="aivq-empty">—</span>'}</td></tr>`).join('');
}
function benchmarkGap(item) { return item.arithmeticReconciliation?.state === 'OPEN' ? 'CONFIGURABLE_FLM1_VARIANCE' : item.qualificationGap ?? null; }
function benchmarkRows() {
  return AIV_D23_BENCHMARK_CASES.map((item) => `<tr><td><code>${esc(item.benchmarkId)}</code></td><td>${esc(item.caseLabel)}</td><td>${cell(item.publishedOutputs?.sourcePwlDb)}</td><td>${cell(item.publishedIntermediates?.assessmentPwlDb)}</td><td>${cell(item.publishedFinal?.LOF)}</td><td>${esc(item.evidenceState)}</td><td>${benchmarkGap(item) ? `<code>${esc(benchmarkGap(item))}</code>` : '<span class="aivq-empty">—</span>'}</td></tr>`).join('');
}
function independentExpected(item) {
  if (item.expected?.sonicPwlDb !== undefined) return `${item.expected.sonicPwlDb} dB`;
  if (item.expected?.combinedPwlDb !== undefined) return `${item.expected.combinedPwlDb} dB`;
  return null;
}
function independentBenchmarkRows() {
  return AIV_INDEPENDENT_BENCHMARKS.map((item) => `<tr><td><code>${esc(item.benchmarkId)}</code></td><td>${esc(item.purpose)}</td><td>${cell(independentExpected(item))}</td><td>${esc(item.requiredTraceIds.join('; '))}</td><td><span class="aivq-status ok">MACHINE_BENCHMARK</span></td></tr>`).join('');
}

function evidenceHtml(state) {
  return `<details class="aivq-disclosure aivq-evidence-disclosure" data-aiv-disclosure-key="qualification-evidence"><summary><span>Qualification evidence & method trace</span><small>Controlled sources, benchmark vectors, promotion evidence and permanent authority boundaries</small></summary><div class="aivq-disclosure-body">
    ${renderAivPromotionReadinessHtml(state)}
    <section class="aivq-card"><h4>Controlled source set</h4><div class="aivq-grid">
      <div><small>Qualification issue</small><strong>#441</strong></div>
      <div><small>EI T2.7 main guidance</small><strong>${esc(AIV_EI_MAIN_GUIDANCE_SOURCE.path)}</strong><span>${esc(AIV_EI_MAIN_GUIDANCE_SOURCE.repository)} @ ${esc(AIV_EI_MAIN_GUIDANCE_SOURCE.commit)} · blob ${esc(AIV_EI_MAIN_GUIDANCE_SOURCE.gitBlob)} · ${esc(AIV_EI_MAIN_GUIDANCE_SOURCE.locator)}</span><span>Errata-aware trace retained; unresolved method values are visible configurable assumptions.</span></div>
      <div><small>EI worked-example DOCX</small><strong>${esc(AIV_EI_D23_SOURCE.path)}</strong><span>${esc(AIV_EI_D23_SOURCE.repository)} @ ${esc(AIV_EI_D23_SOURCE.commit)} · blob ${esc(AIV_EI_D23_SOURCE.gitBlob)} · ${esc(AIV_EI_D23_SOURCE.locator)}</span></div>
      <div><small>Controlled worked-example Markdown</small><strong>${esc(AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE.path)}</strong><span>${esc(AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE.repository)} @ ${esc(AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE.commit)} · blob ${esc(AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE.gitBlob)} · ${esc(AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE.lineCount)} lines</span></div>
      <div><small>EI examples PDF corroboration</small><strong>${esc(AIV_EI_EXAMPLES_PDF_SOURCE.path)}</strong><span>${esc(AIV_EI_EXAMPLES_PDF_SOURCE.repository)} @ ${esc(AIV_EI_EXAMPLES_PDF_SOURCE.commit)} · blob ${esc(AIV_EI_EXAMPLES_PDF_SOURCE.gitBlob)}</span></div>
      <div><small>Topology authority</small><strong>TopologyEditTableHumanExport.v1</strong><span>Connectivity/identity only; physical AIV distance is explicit input/assumption.</span></div>
    </div></section>
    <section class="aivq-card"><div class="aivq-section-head"><div><h4>SVG adaptation boundary</h4><p>SVG is limited to engineering glyphs and presentation. It never supplies AIV distance.</p></div></div><div class="aivq-example-table"><table><thead><tr><th>Symbol</th><th>Role</th><th>Example</th><th>Engineering meaning</th></tr></thead><tbody>
      <tr><td>${renderAivInlineSymbol({ type: 'RELIEF_VALVE', role: 'SOURCE' })}</td><td>Source</td><td>Pressure-reducing device</td><td>Identity only.</td></tr>
      <tr><td>${renderAivInlineSymbol({ type: 'PIPE', role: 'PROPAGATION_PATH' })}</td><td>Path</td><td>Connected piping</td><td>Connectivity only.</td></tr>
      <tr><td>${renderAivInlineSymbol({ type: 'OLET', role: 'ASSESSMENT' })}</td><td>Assessment</td><td>Welded discontinuity</td><td>Separate assessment identity.</td></tr>
    </tbody></table></div></section>
    <section class="aivq-card"><div class="aivq-section-head"><div><h4>EI D.2.3 benchmark targets</h4><p>Pinned published-reference values; FLM1 published/recalculated behavior is configurable and traceable.</p></div></div><div class="aivq-example-table"><table><thead><tr><th>Benchmark</th><th>Case</th><th>Source PWL</th><th>Point PWL</th><th>Final LOF</th><th>Evidence</th><th>Configuration</th></tr></thead><tbody>${benchmarkRows()}</tbody></table></div></section>
    <section class="aivq-card"><div class="aivq-section-head"><div><h4>Independent analytical vectors</h4><p>Sonic SFF=6 and simultaneous-source vectors are machine-qualified branches.</p></div></div><div class="aivq-example-table"><table><thead><tr><th>Benchmark</th><th>Purpose</th><th>Expected</th><th>Trace</th><th>Use</th></tr></thead><tbody>${independentBenchmarkRows()}</tbody></table></div></section>
    <section class="aivq-card"><div class="aivq-section-head"><div><h4>AIV trace register</h4><p>Trace gaps become explicit assumptions/benchmark comparisons rather than hidden release gates.</p></div></div><div class="aivq-example-table"><table><thead><tr><th>Trace ID</th><th>Method item</th><th>Evidence</th><th>State</th><th>Benchmark / gap</th></tr></thead><tbody>${coverageRows()}</tbody></table></div></section>
    <section class="aivq-card"><h4>Permanent authority boundary</h4><ul class="aivq-list"><li>Advanced_Analysis remains topology/model author.</li><li>No 3D/CAD geometry authority is created here; Flare-network graph authoring governs connectivity and explicit segment lengths only, while SVG layout remains presentation-only.</li><li>No pixel-derived distance or click-to-calculate flow.</li><li>No AIV equations are implemented in UI code.</li><li>Missing values use visible user-configurable assumptions and explicit user values override them.</li><li>Assessment LOF is the qualified screening result scope; configured line/case LOF and imported legacy <code>.eit</code> LOFs are non-authoritative.</li><li><code>designAuthority=false</code>.</li></ul></section>
  </div></details>`;
}

export function renderAivQualificationWorkspaceHtml(state = {}) {
  return `<div class="aivq-root">
    <header class="aivq-header aivq-hero"><div><span class="aivq-eyebrow">EI AVIFF · screening workbench</span><h3>Acoustic-Induced Vibration</h3><p class="aivq-mono">VIB.AIV.ACOUSTIC</p></div><div class="aivq-authority"><strong>SCREENING QUALIFIED</strong><span>Authority scope: Assessment LOF only</span><span>Line/Case: trace only · Design authority: false</span></div></header>
    <section class="aivq-card aivq-banner is-qualified"><strong>Machine-qualified AIV screening · bounded release envelope</strong><span>The registered 10-stage kernel owns numerical execution. This release authorizes assessment-level screening within the configured readiness/applicability and Stage-8 screening model/assumption envelope; it is not design approval. Configured line/case LOF and imported legacy <code>.eit</code> results remain trace evidence only.</span></section>
    <main class="aivq-primary-stack">
      ${renderAivInputWorkspaceHtml(state)}
      ${renderAivReadinessPanelHtml(state)}
      ${renderAivResultShellsHtml(state)}
    </main>
    ${evidenceHtml(state)}
  </div>`;
}
