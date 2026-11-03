import { collectRvmDtxrGeometryCoverageFromScene } from './RvmDtxrGeometryCoverageEngine.js';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-dtxr-geometry-coverage-bridge-v1');
const BRIDGE_VERSION = '20260622-rvm-dtxr-coverage-1';
const GLOBAL_KEY = '__PCF_GLB_RVM_DTXR_COVERAGE__';
const MAX_ISSUE_ROWS = 120;

export function installRvmDtxrGeometryCoverageBridge() {
  if (typeof document === 'undefined') return globalThis[GLOBAL_KEY] || null;
  if (globalThis[INSTALL_FLAG]) return globalThis[GLOBAL_KEY];
  globalThis[INSTALL_FLAG] = true;
  injectStyles();
  document.addEventListener('click', onDocumentClick, true);
  let attempts = 0;
  const waitAttach = () => {
    attempts += 1;
    const ok = attach();
    if (!ok && attempts < 180) setTimeout(waitAttach, 300);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitAttach, { once: true });
  else waitAttach();
  globalThis.addEventListener?.('rvm-model-loaded', () => setTimeout(() => { attach(); renderCoverage(); }, 520));
  globalThis.addEventListener?.('rvm-render-policy-diagnostics', () => setTimeout(() => renderCoverage(false), 120));

  const api = {
    version: BRIDGE_VERSION,
    collect: collectCoverage,
    open: openDialog,
    render: renderCoverage,
    exportJson: exportCoverageJson,
    copySummary,
  };
  globalThis[GLOBAL_KEY] = api;
  return api;
}

export function collectCoverage(options = {}) {
  const viewer = globalThis.__3D_RVM_VIEWER__ || null;
  const root = options.root || viewer?.modelGroup || null;
  const report = collectRvmDtxrGeometryCoverageFromScene(root, {
    ...options,
    fileKey: options.fileKey || fileKey(viewer),
    expectedRecords: options.expectedRecords || activeExpectedRecords(),
    source: options.source || 'rvm-viewer-scene',
  });
  globalThis.__PCF_GLB_RVM_DTXR_COVERAGE_REPORT__ = report;
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-dtxr-geometry-coverage', { detail: report })); } catch (_) {}
  return report;
}

function activeExpectedRecords() {
  const appState = globalThis.__PCF_GLB_APP_STATE__ || globalThis.__PCF_GLB_STATE__ || {};
  const rvm = appState.rvm || {};
  const extract = rvm.rvmPcfExtract || appState.rvmPcfExtract || {};
  const candidates = [
    rvm.dtxrRecords,
    rvm.stagedRecords,
    rvm.componentRecords,
    rvm.supportRecords,
    extract.rows,
    extract.records,
    extract.componentRecords,
    extract.supportRecords,
  ];
  return candidates.flatMap((records) => Array.isArray(records) ? records : []);
}

function fileKey(viewer = globalThis.__3D_RVM_VIEWER__) {
  const root = rootEl();
  return String(viewer?.loadedFileName || viewer?.sourceFileName || root?.dataset?.rvmFileName || 'rvm-model').slice(0, 160);
}

function rootEl() {
  return typeof document === 'undefined' ? null : document.querySelector('[data-rvm-viewer]');
}

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setStatus(text, warning = false) {
  const el = rootEl()?.querySelector?.('#rvm-sb-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color = warning ? '#ffcf70' : '';
}

function attach() {
  const root = rootEl();
  if (!root) return false;
  injectToolbar(root);
  updateToolbarSummary(root, globalThis.__PCF_GLB_RVM_DTXR_COVERAGE_REPORT__ || null);
  return true;
}

function injectToolbar(root) {
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!ribbon) return;
  let section = ribbon.querySelector('.rvm-dtxr-coverage-tool-group');
  if (section?.dataset?.rvmDtxrCoverage === BRIDGE_VERSION) return;
  if (!section) {
    section = document.createElement('div');
    section.className = 'rvm-ribbon-section rvm-tool-group rvm-dtxr-coverage-tool-group';
    const health = ribbon.querySelector('.rvm-model-health-tool-group');
    ribbon.insertBefore(section, health?.nextSibling || ribbon.querySelector('.rvm-report-export-tool-group') || null);
  }
  section.dataset.rvmDtxrCoverage = BRIDGE_VERSION;
  section.innerHTML = `
    <span class="rvm-ribbon-label">Coverage</span>
    <div class="rvm-ribbon-button-row">
      <button type="button" class="rvm-tool-btn" data-rvm-dtxr-coverage-open="true" title="Validate core RVM geometry coverage"><span aria-hidden="true">✓</span><span>Core</span></button>
      <button type="button" class="rvm-tool-btn" data-rvm-dtxr-coverage-refresh="true" title="Refresh geometry coverage"><span aria-hidden="true">↻</span><span>Scan</span></button>
    </div>
    <div class="rvm-dtxr-coverage-summary" data-rvm-dtxr-coverage-summary>Coverage: load model</div>`;
}

function ensureDialog() {
  let dialog = document.getElementById('rvm-dtxr-coverage-dialog');
  if (dialog) return dialog;
  dialog = document.createElement('div');
  dialog.id = 'rvm-dtxr-coverage-dialog';
  dialog.className = 'rvm-dtxr-coverage-dialog';
  dialog.setAttribute('aria-hidden', 'true');
  dialog.innerHTML = `
    <div class="rvm-dtxr-coverage-card" role="dialog" aria-modal="false" aria-label="RVM DTXR geometry coverage">
      <div class="rvm-dtxr-coverage-head">
        <div><b>Core Geometry Coverage</b><small>${esc(BRIDGE_VERSION)}</small></div>
        <button type="button" data-rvm-dtxr-coverage-close="true" aria-label="Close coverage panel">×</button>
      </div>
      <div data-rvm-dtxr-coverage-body class="rvm-dtxr-coverage-body">Click refresh to inspect rendered RVM geometry.</div>
      <div class="rvm-dtxr-coverage-actions">
        <button type="button" data-rvm-dtxr-coverage-dialog-refresh="true">Refresh</button>
        <button type="button" data-rvm-dtxr-coverage-copy="true">Copy Summary</button>
        <button type="button" data-rvm-dtxr-coverage-export="true">Export JSON</button>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  bindDialog(dialog);
  return dialog;
}

function openDialog() {
  const dialog = ensureDialog();
  dialog.classList.add('is-open');
  dialog.setAttribute('aria-hidden', 'false');
  renderCoverage(true);
}

function closeDialog() {
  const dialog = document.getElementById('rvm-dtxr-coverage-dialog');
  if (!dialog) return;
  dialog.classList.remove('is-open');
  dialog.setAttribute('aria-hidden', 'true');
}

function renderCoverage(force = true) {
  const report = force || !globalThis.__PCF_GLB_RVM_DTXR_COVERAGE_REPORT__
    ? collectCoverage()
    : globalThis.__PCF_GLB_RVM_DTXR_COVERAGE_REPORT__;
  updateToolbarSummary(rootEl(), report);
  const dialog = document.getElementById('rvm-dtxr-coverage-dialog');
  if (!dialog) return report;
  const body = dialog.querySelector('[data-rvm-dtxr-coverage-body]');
  if (body) body.innerHTML = coverageHtml(report);
  setStatus(`Coverage: ${report.summary.status} · ${report.summary.rendered.toLocaleString()} rendered · ${report.summary.missing.toLocaleString()} missing · ${report.summary.nonPickable.toLocaleString()} non-pickable.`, report.summary.status !== 'OK');
  return report;
}

function coverageHtml(report) {
  const rows = Object.values(report.categories || {}).filter((row) => row.expected || row.rendered || row.missing || row.nonPickable || row.unmapped);
  return `
    <div class="rvm-dtxr-coverage-status is-${esc(String(report.summary?.status || 'EMPTY').toLowerCase())}">
      <b>${esc(report.summary?.status || 'EMPTY')}</b>
      <span>${esc(report.fileKey || 'rvm-model')} · expected source: ${esc(report.expectedSource || '-')}</span>
    </div>
    <div class="rvm-dtxr-coverage-grid">
      <div><b>${num(report.summary?.expected)}</b><span>Expected</span></div>
      <div><b>${num(report.summary?.rendered)}</b><span>Rendered</span></div>
      <div><b>${num(report.summary?.native)}</b><span>Native</span></div>
      <div><b>${num(report.summary?.fallback)}</b><span>Fallback</span></div>
      <div><b>${num(report.summary?.missing)}</b><span>Missing</span></div>
      <div><b>${num(report.summary?.nonPickable)}</b><span>Non-pickable</span></div>
    </div>
    <table class="rvm-dtxr-coverage-table"><thead><tr><th>Category</th><th>Expected</th><th>Rendered</th><th>Native</th><th>Fallback</th><th>Missing</th><th>Non-pickable</th><th>Unmapped</th></tr></thead><tbody>${rows.map(categoryRowHtml).join('') || '<tr><td colspan="8">No rendered RVM geometry found.</td></tr>'}</tbody></table>
    <div class="rvm-dtxr-coverage-issues"><h4>Issues</h4>${issueRowsHtml(report.issues || [])}</div>`;
}

function categoryRowHtml(row) {
  return `<tr><td>${esc(row.category)}</td><td>${num(row.expected)}</td><td>${num(row.rendered)}</td><td>${num(row.native)}</td><td>${num(row.fallback)}</td><td>${num(row.missing)}</td><td>${num(row.nonPickable)}</td><td>${num(row.unmapped)}</td></tr>`;
}

function issueRowsHtml(issues = []) {
  const rows = issues.slice(0, MAX_ISSUE_ROWS);
  if (!rows.length) return '<div class="rvm-dtxr-coverage-empty">No coverage issues detected in current scan.</div>';
  return `<div class="rvm-dtxr-coverage-issue-list">${rows.map(issueRowHtml).join('')}${issues.length > rows.length ? `<div class="rvm-dtxr-coverage-more">${issues.length - rows.length} more issue(s) omitted from UI; export JSON for full list.</div>` : ''}</div>`;
}

function issueRowHtml(issue) {
  return `<div class="rvm-dtxr-coverage-issue is-${esc(issue.severity || 'info')}"><b>${esc(issue.code)}</b><span>${esc(issue.reviewName || issue.sourcePath || issue.id || '-')}</span><small>${esc(issue.renderKind || '')} ${esc(issue.primitiveCode || '')} ${esc((issue.reasons || []).join(', '))}</small></div>`;
}

function updateToolbarSummary(root, report) {
  const el = root?.querySelector?.('[data-rvm-dtxr-coverage-summary]');
  if (!el) return;
  if (!report) {
    el.textContent = 'Coverage: pending';
    return;
  }
  el.textContent = `Coverage: ${report.summary.status} · miss ${report.summary.missing} · non-pick ${report.summary.nonPickable}`;
}

function bindDialog(dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-rvm-dtxr-coverage-close]')) { closeDialog(); return; }
    if (event.target?.closest?.('[data-rvm-dtxr-coverage-dialog-refresh]')) { renderCoverage(true); return; }
    if (event.target?.closest?.('[data-rvm-dtxr-coverage-copy]')) { copySummary(); return; }
    if (event.target?.closest?.('[data-rvm-dtxr-coverage-export]')) exportCoverageJson();
  }, true);
}

function onDocumentClick(event) {
  if (event.target?.closest?.('[data-rvm-dtxr-coverage-open]')) {
    event.preventDefault();
    event.stopPropagation();
    openDialog();
    return;
  }
  if (event.target?.closest?.('[data-rvm-dtxr-coverage-refresh]')) {
    event.preventDefault();
    event.stopPropagation();
    renderCoverage(true);
  }
}

async function copySummary() {
  const report = collectCoverage();
  const text = `RVM coverage ${report.fileKey}: ${report.summary.status}, expected ${report.summary.expected}, rendered ${report.summary.rendered}, missing ${report.summary.missing}, fallback ${report.summary.fallback}, non-pickable ${report.summary.nonPickable}, unmapped ${report.summary.unmapped}`;
  try {
    await navigator.clipboard?.writeText?.(text);
    setStatus('Coverage: copied summary.');
  } catch (_) {
    setStatus('Coverage: clipboard unavailable.', true);
  }
  renderCoverage(false);
  return text;
}

function exportCoverageJson() {
  const report = collectCoverage();
  const json = JSON.stringify(report, omitRuntimeObjects, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFileName(report.fileKey || 'rvm-model')}.coverage.json`;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 0);
  setStatus('Coverage: exported JSON.');
  return report;
}

function omitRuntimeObjects(key, value) {
  if (key === 'object' || key === 'raw') return undefined;
  return value;
}

function injectStyles() {
  if (document.getElementById('rvm-dtxr-coverage-bridge-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-dtxr-coverage-bridge-style';
  style.textContent = `
    .rvm-dtxr-coverage-tool-group .rvm-tool-btn span:first-child{font-size:12px}.rvm-dtxr-coverage-summary{margin-top:3px;color:#94a3b8;font-size:9.5px;white-space:nowrap;max-width:230px;overflow:hidden;text-overflow:ellipsis}
    .rvm-dtxr-coverage-dialog{position:fixed;inset:0;display:none;align-items:flex-start;justify-content:center;padding-top:82px;background:rgba(2,6,23,.42);z-index:12040}.rvm-dtxr-coverage-dialog.is-open{display:flex}
    .rvm-dtxr-coverage-card{width:min(980px,calc(100vw - 42px));max-height:min(780px,calc(100vh - 118px));display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:10px;border:1px solid rgba(126,190,255,.28);border-radius:12px;background:#0b1424;box-shadow:0 22px 70px rgba(0,0,0,.48);padding:12px;color:#dbeafe}.rvm-dtxr-coverage-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.rvm-dtxr-coverage-head b{font-size:14px;color:#bfdbfe}.rvm-dtxr-coverage-head small{display:block;color:#7f94b7;font-size:9px}.rvm-dtxr-coverage-head button{border:1px solid rgba(148,163,184,.28);background:#111827;color:#e5e7eb;border-radius:7px;width:28px;height:26px}
    .rvm-dtxr-coverage-body{overflow:auto;display:grid;gap:10px}.rvm-dtxr-coverage-status{display:flex;align-items:center;gap:8px;border:1px solid rgba(126,190,255,.16);border-radius:8px;background:rgba(255,255,255,.035);padding:8px;font-size:12px}.rvm-dtxr-coverage-status b{border-radius:999px;padding:3px 8px}.rvm-dtxr-coverage-status.is-ok b{background:rgba(34,197,94,.15);color:#86efac}.rvm-dtxr-coverage-status.is-warn b{background:rgba(245,158,11,.17);color:#fde68a}.rvm-dtxr-coverage-status.is-empty b{background:rgba(148,163,184,.18);color:#cbd5e1}
    .rvm-dtxr-coverage-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.rvm-dtxr-coverage-grid div{border:1px solid rgba(126,190,255,.14);border-radius:8px;background:rgba(255,255,255,.035);padding:8px}.rvm-dtxr-coverage-grid b{display:block;font-size:15px;color:#e0f2fe}.rvm-dtxr-coverage-grid span{font-size:10.5px;color:#8ea8c8}.rvm-dtxr-coverage-table{width:100%;border-collapse:collapse;font-size:11px}.rvm-dtxr-coverage-table th,.rvm-dtxr-coverage-table td{border-bottom:1px solid rgba(126,190,255,.12);padding:5px;text-align:right}.rvm-dtxr-coverage-table th:first-child,.rvm-dtxr-coverage-table td:first-child{text-align:left;color:#bfdbfe}
    .rvm-dtxr-coverage-issues h4{margin:4px 0 6px;color:#bfdbfe;font-size:12px}.rvm-dtxr-coverage-issue-list{display:grid;gap:5px}.rvm-dtxr-coverage-issue{display:grid;grid-template-columns:190px minmax(0,1fr);gap:2px 8px;border:1px solid rgba(126,190,255,.12);border-radius:7px;background:rgba(255,255,255,.028);padding:6px}.rvm-dtxr-coverage-issue.is-error{border-color:rgba(248,113,113,.35)}.rvm-dtxr-coverage-issue b{font-size:10px;color:#fde68a}.rvm-dtxr-coverage-issue span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e2e8f0}.rvm-dtxr-coverage-issue small{grid-column:1/-1;color:#8ea8c8;font-size:10px}.rvm-dtxr-coverage-actions{display:flex;gap:8px}.rvm-dtxr-coverage-actions button{border:1px solid rgba(126,190,255,.24);border-radius:7px;background:#132238;color:#dbeafe;padding:7px 9px}
    @media(max-width:860px){.rvm-dtxr-coverage-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.rvm-dtxr-coverage-issue{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function num(value) { return Number(value || 0).toLocaleString(); }
function safeFileName(value) { return String(value || 'rvm-model').replace(/[^a-z0-9._-]+/gi, '_').slice(0, 120); }
