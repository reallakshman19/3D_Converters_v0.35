import { buildXmlCiiCustomInputXml } from '../../../converters/xml-cii2019-core/custom-input-api.js';

/**
 * Renders Custom Input as a synthetic XML generator.
 * Inputs: manually entered branch/node/DTXR/restraint/coordinate tables.
 * Outputs: generated XML text that can be downloaded or attached as XML input.
 * Fallback: if browser file handoff is unavailable, the generated XML remains
 * visible for manual upload through the main XML input.
 */

const STORE = 'xmlCii.customInput.v1';
const TABLE_TABS = Object.freeze([
  ['branchRows', 'Branches'],
  ['weightRows', 'Nodes/components'],
  ['dtxrRows', 'DTXR'],
  ['restraintRows', 'Supports/restraints'],
  ['coordinateRows', 'Coordinates'],
  ['build', 'Build XML'],
]);

const SAMPLE = Object.freeze({
  branchRows: 'BranchName\tLineNo\tNodeNumber\tBoreMm\tOutsideDiameter\tWallThickness\tP1\tP9\tT1\tT2\tT3\tT9\tFluidDensity\tInsulationDensity\n/CUSTOM-4"-P8810212-31441C4-PP/B1\t4-P8810212-31441C4-PP\t100\t100\t114.3\t6.02\t4140\t900\t260\t151\t5\t9\t983\t0.00012',
  coordinateRows: 'BranchName\tNodeNumber\tX\tY\tZ\n/CUSTOM-4"-P8810212-31441C4-PP/B1\t100\t200000\t-1098000\t101000\n/CUSTOM-4"-P8810212-31441C4-PP/B1\t110\t200500\t-1098000\t101000',
  weightRows: 'BranchName\tNodeNumber\tComponentType\tRigid\tEndpoint\tWeight\tComponentRefNo\n/CUSTOM-4"-P8810212-31441C4-PP/B1\t100\tPIPE\t0\t1\t0\n/CUSTOM-4"-P8810212-31441C4-PP/B1\t110\tRIGID\t2\t2\t0',
  restraintRows: 'BranchName\tNodeNumber\tNodeName\tRestraintType\tGap\tStiffness\tFriction\tDirection\n/CUSTOM-4"-P8810212-31441C4-PP/B1\t100\tPS-1001\tREST\t0\t1.751270E+12\t0.3\t+Y',
  dtxrRows: 'BranchName\tNodeNumber\tDTXR\n/CUSTOM-4"-P8810212-31441C4-PP/B1\t110\tGATE VALVE FLGD 300#',
});

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function read() {
  try {
    return JSON.parse(globalThis.localStorage?.getItem?.(STORE) || '{}');
  } catch {
    return {};
  }
}

function save(state) {
  try {
    globalThis.localStorage?.setItem?.(STORE, JSON.stringify(state));
  } catch {}
  publishStateApi();
}

export function saveXmlCiiCustomInputState(state) {
  save(state);
}

function getState() {
  const state = read();
  const allowed = new Set(TABLE_TABS.map(([id]) => id));
  state.active = allowed.has(state.active) ? state.active : 'branchRows';
  for (const key of Object.keys(SAMPLE)) state[key] = state[key] ?? '';
  state.options = {
    dropShortElementLengthNodes: true,
    shortElementLengthDropThresholdMm: 6,
    ...(state.options || {}),
  };
  return state;
}

export function getXmlCiiCustomInputState() {
  return getState();
}

function publishStateApi() {
  if (typeof window !== 'undefined') window.xmlCiiCustomInputState = { getSnapshot: () => getState() };
}

function downloadText(name, text, type) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([text], { type }));
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function textarea(id, state) {
  return `<textarea data-custom-input-text="${id}" spellcheck="false" style="width:100%;min-height:260px;font-family:monospace;font-size:12px;">${esc(state[id] || '')}</textarea>`;
}

function tablePanel(state) {
  return `<div class="xml-cii-native-card"><div class="xml-cii-native-toolbar"><button type="button" class="model-converters-download-btn" data-custom-input-sample="${esc(state.active)}">Load sample</button><button type="button" class="model-converters-download-btn" data-custom-input-clear="${esc(state.active)}">Clear</button></div>${textarea(state.active, state)}</div>`;
}

function buildPanel(state) {
  return `<div class="xml-cii-native-card"><label class="xml-cii-native-check"><input type="checkbox" data-custom-input-opt="dropShortElementLengthNodes" ${state.options.dropShortElementLengthNodes !== false ? 'checked' : ''}> Drop ElementLengthMm <= 6 mm nodes</label><div class="xml-cii-native-toolbar"><button type="button" class="model-converters-run-btn" data-custom-input-generate>Generate XML</button><button type="button" class="model-converters-download-btn" data-custom-input-download>Download XML</button><button type="button" class="model-converters-run-btn" data-custom-input-use>Use as XML input</button></div><pre data-custom-input-summary style="white-space:pre-wrap;max-height:120px;overflow:auto"></pre><textarea data-custom-input-xml spellcheck="false" style="width:100%;min-height:300px;font-family:monospace;font-size:12px;">${esc(state.xmlText || '')}</textarea></div>`;
}

function activePanel(state) {
  return state.active === 'build' ? buildPanel(state) : tablePanel(state);
}

export function renderXmlCiiCustomInputPanel() {
  const state = getState();
  return `<div class="xml-cii-native-phase-head"><div><div class="model-converters-workflow-detail-title">Custom Input</div><div class="model-converters-workflow-detail-text">Generate XML from manually entered branch, component, support, DTXR, and coordinate tables when source XML is unavailable.</div></div></div><section class="xml-cii-native-card"><div class="xml-cii-native-master-tabs">${TABLE_TABS.map(([id, label]) => `<button type="button" class="xml-cii-native-master-tab ${state.active === id ? 'is-active' : ''}" data-custom-input-tab="${id}"><span>${label}</span></button>`).join('')}</div></section>${activePanel(state)}`;
}

function collect(root) {
  const state = getState();
  root.querySelectorAll('[data-custom-input-text]').forEach((textareaEl) => { state[textareaEl.dataset.customInputText] = textareaEl.value; });
  root.querySelectorAll('[data-custom-input-opt]').forEach((input) => { state.options[input.dataset.customInputOpt] = input.checked; });
  save(state);
  return state;
}

function build(root) {
  const state = collect(root);
  const result = buildXmlCiiCustomInputXml(state, state.options);
  state.xmlText = result.xmlText;
  save(state);
  const output = root.querySelector('[data-custom-input-xml]');
  if (output) output.value = state.xmlText;
  const summary = root.querySelector('[data-custom-input-summary]');
  if (summary) summary.textContent = JSON.stringify({ ...result.summary, diagnosticEvents: result.diagnostics?.records?.length || 0 }, null, 2);
  return result.xmlText;
}

function setPrimaryXml(xml) {
  const file = new File([xml], 'custom_input_generated.xml', { type: 'application/xml' });
  const input = document.querySelector('#model-converters-primary-input,input[data-role="primary"],input[type="file"]');
  if (!input || typeof DataTransfer === 'undefined') return false;
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function rerender(body, root, workflowState) {
  body.innerHTML = renderXmlCiiCustomInputPanel();
  bindXmlCiiCustomInputPanel(body, root, workflowState);
}

export function bindXmlCiiCustomInputPanel(body, root, workflowState) {
  body.querySelectorAll('[data-custom-input-tab]').forEach((button) => button.addEventListener('click', () => {
    const state = collect(body);
    state.active = button.dataset.customInputTab || 'branchRows';
    save(state);
    rerender(body, root, workflowState);
  }));
  body.querySelectorAll('[data-custom-input-sample]').forEach((button) => button.addEventListener('click', () => {
    const state = getState();
    state[button.dataset.customInputSample] = SAMPLE[button.dataset.customInputSample] || '';
    save(state);
    rerender(body, root, workflowState);
  }));
  body.querySelectorAll('[data-custom-input-clear]').forEach((button) => button.addEventListener('click', () => {
    const state = getState();
    state[button.dataset.customInputClear] = '';
    save(state);
    rerender(body, root, workflowState);
  }));
  body.querySelectorAll('[data-custom-input-opt]').forEach((input) => input.addEventListener('change', () => collect(body)));
  body.querySelector('[data-custom-input-generate]')?.addEventListener('click', () => build(body));
  body.querySelector('[data-custom-input-download]')?.addEventListener('click', () => downloadText('custom_input_generated.xml', build(body), 'application/xml'));
  body.querySelector('[data-custom-input-use]')?.addEventListener('click', () => {
    const ok = setPrimaryXml(build(body));
    const summary = body.querySelector('[data-custom-input-summary]');
    if (summary) summary.textContent += ok ? '\nSynthetic XML attached as primary input.' : '\nGenerated XML ready. Browser blocked file handoff; download and upload it as primary XML.';
  });
}

publishStateApi();
