import { buildXmlCiiCustomInputXml } from '../converters/xml-cii2019-core/custom-input-api.js';
import {
  bindXmlCiiCustomInputPanel,
  getXmlCiiCustomInputState,
  renderXmlCiiCustomInputPanel,
  saveXmlCiiCustomInputState,
} from './model-converters/custom-input/custom-input-panel.js?v=20260710-xml-builder-1';
import { buildInputXmlFromNodeXml } from './model-converters/xml-cii-node-to-inputxml-core.js?v=20260710-xml-builder-1';
import { renderXmlCiiTopology5BPanel } from './model-converters/xml-cii-topology-5b-panel.js?v=20260710-xml-builder-1';
import { createXmlBuilderDiagnostic, createXmlBuilderDiagnostics, mergeXmlBuilderDiagnosticRecords, serializeXmlBuilderDiagnostics } from '../converters/xml-cii2019-core/custom-input-diagnostics.js';
import { renderXmlBuilderDiagnosticsHtml } from './xml-builder-diagnostics-view.js';

/**
 * Standalone XML Builder tab.
 * Inputs: pasted/custom branch, node, DTXR, support, and coordinate tables.
 * Outputs: generated node XML, Caesar InputXML, and a topology canvas preview.
 * Fallback: build errors are shown inline and pasted table text remains editable.
 */

const STYLE_ID = 'xml-builder-standalone-style';
const OUTPUT_STORE = 'xmlBuilder.outputs.v1';
const TOPOLOGY_STATE_KEY = '__xmlCiiTopology5BNativeState';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function readOutputs() {
  try { return JSON.parse(localStorage.getItem(OUTPUT_STORE) || '{}'); } catch { return {}; }
}

function saveOutputs(outputs) {
  try { localStorage.setItem(OUTPUT_STORE, JSON.stringify(outputs)); } catch {}
}

function ensureStylesheet() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '.xml-builder-root{display:grid;gap:12px}.xml-builder-grid{display:grid;grid-template-columns:minmax(380px,1fr) minmax(380px,1fr);gap:12px;align-items:start}.xml-builder-root textarea{box-sizing:border-box}.xml-builder-output{width:100%;min-height:260px;font-family:ui-monospace,Consolas,monospace;font-size:12px;background:#07101f;color:#e6edf5;border:1px solid rgba(148,163,184,.35);border-radius:8px;padding:8px}@media(max-width:980px){.xml-builder-grid{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }
  if (!document.querySelector('link[data-xml-builder-model-style="true"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './tabs/model-converters-tab.css?v=20260710-xml-builder-1';
    link.dataset.xmlBuilderModelStyle = 'true';
    document.head.appendChild(link);
  }
}

function downloadText(fileName, text, type) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([text], { type }));
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function collectCustomState(container) {
  const state = getXmlCiiCustomInputState();
  container.querySelectorAll('[data-custom-input-text]').forEach((field) => {
    state[field.dataset.customInputText] = field.value;
  });
  container.querySelectorAll('[data-custom-input-opt]').forEach((input) => {
    state.options[input.dataset.customInputOpt] = input.checked;
  });
  saveXmlCiiCustomInputState(state);
  return state;
}

function firstNodeNumber(xmlText) {
  return String(xmlText || '').match(/<NodeNumber>([^<]+)<\/NodeNumber>/)?.[1]?.trim() || '100';
}

function buildAll(container, outputs) {
  const state = collectCustomState(container);
  const xmlResult = buildXmlCiiCustomInputXml(state, state.options);
  state.xmlText = xmlResult.xmlText;
  saveXmlCiiCustomInputState(state);
  const inputResult = buildInputXmlFromNodeXml(xmlResult.xmlText, {
    applyEnrichment: false,
    buildProfile: 'xml-builder',
    jobName: 'XML_BUILDER',
    sourceName: 'xml-builder-generated.xml',
  });
  const elementCount = Number(inputResult.diagnostics?.summary?.elementCount || 0);
  const inputXmlReady = elementCount > 0;
  const records = mergeXmlBuilderDiagnosticRecords(xmlResult.diagnostics, inputResult.diagnostics?.records);
  const diagnostics = createXmlBuilderDiagnostics(records, {
    sourceName: 'xml-builder-generated.xml', buildProfile: 'xml-builder', outputReady: inputXmlReady,
  });
  Object.assign(outputs, {
    xmlText: xmlResult.xmlText,
    inputXmlText: inputResult.finalInputXmlText || inputResult.coreInputXmlText || '',
    inputXmlReady,
    diagnostics,
    diagnosticsText: serializeXmlBuilderDiagnostics(diagnostics),
    xmlSummary: JSON.stringify({ ...xmlResult.summary, diagnosticEvents: xmlResult.diagnostics?.records?.length || 0 }, null, 2),
    inputXmlSummary: JSON.stringify({ ...(inputResult.diagnostics?.summary || {}), diagnostics: diagnostics.summary }, null, 2),
    error: inputXmlReady ? '' : 'No PIPINGELEMENT route was generated. Review XML Builder diagnostics.',
  });
  saveOutputs(outputs);
}

function renderOutputPanel(outputs) {
  return `<section class="xml-cii-native-card">
    <div class="xml-cii-native-card-head"><div><strong>Build Output</strong><div class="xml-cii-native-hint">Generated XML, InputXML, and topology geometry are derived from the table builder state.</div></div></div>
    <div class="xml-cii-native-toolbar">
      <button type="button" class="model-converters-run-btn" data-xml-builder-build>Build XML + InputXML + Geometry</button>
      <button type="button" class="model-converters-download-btn" data-xml-builder-download="xml" ${outputs.xmlText ? '' : 'disabled'}>Download XML</button>
      <button type="button" class="model-converters-download-btn" data-xml-builder-download="inputxml" ${outputs.inputXmlReady === true ? '' : 'disabled'}>Download InputXML</button>
    </div>
    <div class="${outputs.error ? 'xml-cii-native-status-row is-warn' : 'xml-cii-native-status-row is-ok'}"><span class="xml-cii-native-status-icon"></span><span>${esc(outputs.error || 'Ready')}</span></div>
    <div class="xml-builder-grid">
      <div><div class="model-converters-workflow-section-title">Generated XML</div><pre class="xml-cii-native-hint">${esc(outputs.xmlSummary || 'No XML built yet.')}</pre><textarea class="xml-builder-output" readonly>${esc(outputs.xmlText || '')}</textarea></div>
      <div><div class="model-converters-workflow-section-title">InputXML</div><pre class="xml-cii-native-hint">${esc(outputs.inputXmlSummary || 'No InputXML built yet.')}</pre><textarea class="xml-builder-output" readonly>${esc(outputs.inputXmlText || '')}</textarea></div>
    </div>
    ${renderXmlBuilderDiagnosticsHtml(outputs.diagnostics || {})}
  </section>`;
}

function renderTopology(host, outputs) {
  const xmlText = outputs.xmlText || getXmlCiiCustomInputState().xmlText || '';
  if (!xmlText) {
    host.innerHTML = '<section class="xml-cii-native-card"><div class="model-converters-workflow-section-title">Topology Canvas</div><div class="xml-cii-native-hint">Build XML to show route geometry.</div></section>';
    return;
  }
  host[TOPOLOGY_STATE_KEY] = {
    ...(host[TOPOLOGY_STATE_KEY] || {}),
    manualXml: xmlText,
    manualSourceName: 'XML Builder output',
    anchorNode: firstNodeNumber(xmlText),
  };
  renderXmlCiiTopology5BPanel(host, { root: host, anchorNode: firstNodeNumber(xmlText) });
}

function render(container, outputs) {
  container.innerHTML = `<div class="xml-builder-root">
    <section class="xml-cii-native-card"><div class="xml-cii-native-phase-head"><div><div class="model-converters-workflow-detail-title">XML Builder</div><div class="model-converters-workflow-detail-text">Build node XML and Caesar InputXML from pasted tables, then inspect the topology canvas.</div></div></div></section>
    <section data-xml-builder-custom></section>
    <div data-xml-builder-output>${renderOutputPanel(outputs)}</div>
    <section data-xml-builder-topology></section>
  </div>`;
  const customHost = container.querySelector('[data-xml-builder-custom]');
  customHost.innerHTML = renderXmlCiiCustomInputPanel();
  bindXmlCiiCustomInputPanel(customHost, container, {});
  bindOutputActions(container, outputs);
  renderTopology(container.querySelector('[data-xml-builder-topology]'), outputs);
}

function bindOutputActions(container, outputs) {
  container.querySelector('[data-xml-builder-build]')?.addEventListener('click', () => {
    try { buildAll(container, outputs); } catch (error) {
      const message = error?.message || String(error);
      const diagnostics = createXmlBuilderDiagnostics([createXmlBuilderDiagnostic({ severity: 'ERROR', code: 'XML_BUILDER_BUILD_FAILED', stage: 'build', action: 'clear-stale-output', message })], { sourceName: 'xml-builder-generated.xml', outputReady: false });
      Object.assign(outputs, { xmlText: '', inputXmlText: '', inputXmlReady: false, xmlSummary: '', inputXmlSummary: '', diagnostics, diagnosticsText: serializeXmlBuilderDiagnostics(diagnostics), error: message });
      saveOutputs(outputs);
    }
    render(container, outputs);
  });
  container.querySelectorAll('[data-xml-builder-download]').forEach((button) => button.addEventListener('click', () => {
    const kind = button.dataset.xmlBuilderDownload;
    if (kind === 'xml') downloadText('xml-builder-generated.xml', outputs.xmlText || '', 'application/xml');
    if (kind === 'inputxml' && outputs.inputXmlReady === true) downloadText('xml-builder-inputxml.xml', outputs.inputXmlText || '', 'application/xml');
  }));
  container.querySelector('[data-xml-builder-download-diagnostics]')?.addEventListener('click', () => {
    downloadText('xml_builder_diagnostics.json', outputs.diagnosticsText || serializeXmlBuilderDiagnostics(outputs.diagnostics || {}), 'application/json');
  });
}

export function renderXmlBuilderTab(container) {
  ensureStylesheet();
  const outputs = readOutputs();
  render(container, outputs);
  return () => { container.innerHTML = ''; };
}
