import { AIV_MASTER_DB_REFERENCE } from '../converters/vibration/aiv/aiv-master-db-reference.js';

function esc(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function status(state) {
  if (state.masterLoadState === 'LOADING') return ['AUTO-LOADING', 'gap'];
  if (state.masterDb) return ['PIN VERIFIED', 'ok'];
  if (state.masterLoadState === 'ERROR') return ['LOAD ERROR', 'gap'];
  return ['INITIALIZING', 'gap'];
}
function countFacts(db) {
  if (!db) return '';
  const items = Object.entries(db.rowCounts ?? {}).map(([name, count]) => `<span>${esc(name)} <strong>${esc(count)}</strong></span>`).join('');
  return `<div class="aivq-result-summary">${items}</div>`;
}
function resolutionFacts(state) {
  const value = state.masterResolution;
  if (!value) return '<span class="aivq-empty">The bundled master snapshot is available automatically; enrichment will run when topology is available.</span>';
  return `<div class="aivq-result-summary"><span>Derived fields <strong>${esc(value.resolvedFieldCount)}</strong></span><span>Discovered assessments <strong>${esc(value.discoveredAssessmentCandidateCount)}</strong></span><span>Source candidates <strong>${esc(value.sourceCandidates?.length ?? 0)}</strong></span><span>Unresolved geometry <strong>${esc(value.unresolved?.length ?? 0)}</strong></span></div>`;
}

export function renderAivMasterDbHtml(state = {}) {
  const [label, kind] = status(state);
  const disabled = !state.masterDb || state.masterLoadState === 'LOADING' ? ' disabled' : '';
  const loadError = state.masterLoadError
    ? `<div class="aivq-banner is-warning"><strong>Master auto-load failed.</strong><span>${esc(state.masterLoadError)}</span></div>`
    : '';
  return `<section class="aivq-card aivq-master-db-card">
    <div class="aivq-section-head"><div><h4>AIV master database</h4><p>The controlled DB-creator master snapshot is bundled with the product and verified automatically at runtime. End users do not load or maintain master CSVs.</p></div><span class="aivq-status ${kind}">${label}</span></div>
    <div class="aivq-grid"><div><small>Source repository</small><strong>${esc(AIV_MASTER_DB_REFERENCE.repository)}</strong><span>${esc(AIV_MASTER_DB_REFERENCE.commit)}</span></div><div><small>Master path</small><strong>${esc(AIV_MASTER_DB_REFERENCE.path)}</strong><span>Seven vendored files · exact source Git blobs</span></div><div><small>Authority</small><strong>REFERENCE ENRICHMENT</strong><span>Structural/pin verification does not confer new screening or design authority.</span></div></div>
    ${loadError}${countFacts(state.masterDb)}
    <div class="aivq-actions"><button type="button" class="engineering-console-btn" data-aiv-action="apply-master-data"${disabled}>Reapply master data</button></div>
    ${resolutionFacts(state)}
    <div class="aivq-readiness-note"><strong>Precedence:</strong> explicit project/user values &gt; exact-pinned master values <strong>[M]</strong> &gt; visible assumptions <strong>[A]</strong>. Master resolution never invents operating case, flow, P1/P2, temperature, molecular weight, source state, applicability, simultaneous-source scenario, or physical distance from generic topology.</div>
  </section>`;
}
