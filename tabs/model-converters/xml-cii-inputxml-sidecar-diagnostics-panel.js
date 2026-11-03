import { CONVERTERS } from './converter-registry.js?v=20260713-xml-cii-sidecar-audit-1';

const CONVERTER_ID = 'xml_to_cii';
const EVENT_NAME = 'model-converters:xml-cii-inputxml-sidecar-diagnostics';
const WRAP_VERSION = 'xml-cii-inputxml-sidecar-diagnostics/v1';

function text(value) { return String(value ?? '').trim(); }
function esc(value) { return text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function rows(value) { return Array.isArray(value) ? value : []; }

function ensurePanel(root) {
  let panel = root.querySelector('[data-xml-cii-sidecar-diagnostics-panel]');
  if (panel) return panel;
  panel = document.createElement('details');
  panel.dataset.xmlCiiSidecarDiagnosticsPanel = 'v1';
  panel.className = 'model-converters-advanced';
  panel.hidden = true;
  const output = root.querySelector('#model-converters-output');
  if (output?.parentNode) output.insertAdjacentElement('afterend', panel);
  else root.appendChild(panel);
  return panel;
}

function downloadDiagnostics(diagnostics) {
  const sourceStem = text(diagnostics?.sourceName).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '_') || 'xml';
  const name = `${sourceStem}_xml_to_cii2019_inputxml_sidecar_diagnostics.json`;
  const body = `${JSON.stringify(diagnostics || {}, null, 2)}\n`;
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderRows(records) {
  return records.slice(0, 500).map((record) => `
    <tr>
      <td>${esc(record.severity)}</td>
      <td><code>${esc(record.code)}</code></td>
      <td>${esc(record.stage)}</td>
      <td>${esc(record.element ?? '')}</td>
      <td>${esc(record.action)}</td>
      <td>${esc(record.message)}</td>
    </tr>`).join('');
}

function renderPanel(panel, diagnostics) {
  const summary = diagnostics?.summary || {};
  const records = rows(diagnostics?.records);
  const warnings = Number(summary.warning || 0);
  const errors = Number(summary.error || 0);
  panel.hidden = false;
  panel.open = errors > 0 || warnings > 0;
  panel.innerHTML = `
    <summary>XML→CII InputXML sidecar — parity ${esc(diagnostics?.parityStatus || 'UNKNOWN')}, ${errors} errors, ${warnings} warnings</summary>
    <div style="padding:8px 0;display:grid;gap:8px;">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <div class="model-converters-muted">Role: ${esc(diagnostics?.artifactRole)} · Checked: ${diagnostics?.parityChecked ? 'yes' : 'no'} · Output ready: ${diagnostics?.outputReady ? 'yes' : 'no'}</div>
        <button type="button" class="model-converters-download-btn" data-xml-cii-sidecar-download>Download parity diagnostics</button>
      </div>
      <div class="model-converters-muted">The enriched InputXML is a diagnostic reconstruction; the generated CII remains authoritative.</div>
      <div style="overflow:auto;max-height:360px;">
        <table class="model-converters-table" style="width:100%;font-size:12px;">
          <thead><tr><th>Severity</th><th>Code</th><th>Stage</th><th>Element</th><th>Action</th><th>Message</th></tr></thead>
          <tbody>${renderRows(records)}</tbody>
        </table>
      </div>
      ${records.length > 500 ? `<div class="model-converters-muted">Showing 500 of ${records.length} events. Download JSON for the complete ledger.</div>` : ''}
    </div>`;
  panel.querySelector('[data-xml-cii-sidecar-download]')?.addEventListener('click', () => downloadDiagnostics(diagnostics));
}

function wrapConverter(root) {
  const converter = Array.isArray(CONVERTERS) ? CONVERTERS.find((entry) => entry?.id === CONVERTER_ID) : null;
  if (!converter || converter.xmlCiiSidecarWrapVersion === WRAP_VERSION) return;
  const run = converter.run;
  if (typeof run !== 'function') return;
  converter.run = async (context) => {
    const response = await run(context);
    root.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: response?.logs?.sidecarDiagnostics || null }));
    return response;
  };
  converter.xmlCiiSidecarWrapVersion = WRAP_VERSION;
}

export function installXmlCiiInputXmlSidecarDiagnosticsPanel(root = globalThis.document) {
  if (!root?.querySelector || !globalThis.document) return () => {};
  wrapConverter(root);
  const panel = ensurePanel(root);
  const select = root.querySelector('#model-converters-select');
  const onDiagnostics = (event) => {
    if (select?.value === CONVERTER_ID && event.detail) renderPanel(panel, event.detail);
  };
  const onSelection = () => {
    panel.hidden = select?.value !== CONVERTER_ID;
    if (!panel.hidden && !panel.innerHTML) panel.innerHTML = '<summary>XML→CII InputXML sidecar parity diagnostics</summary><div class="model-converters-muted" style="padding:8px 0;">Run XML→CII(2019) to compare the diagnostic InputXML sidecar with the generated CII.</div>';
  };
  root.addEventListener(EVENT_NAME, onDiagnostics);
  select?.addEventListener('change', onSelection);
  onSelection();
  return () => {
    root.removeEventListener(EVENT_NAME, onDiagnostics);
    select?.removeEventListener('change', onSelection);
  };
}
