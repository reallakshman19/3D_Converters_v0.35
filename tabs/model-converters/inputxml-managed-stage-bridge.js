import { run as runInputXmlToStagedJson } from './converters/inputxml-to-stagedjson.js';
import { downloadOutput } from './core/output-utils.js';

const CONVERTER_ID = 'inputxml_to_stagedjson';
const CONVERTER_LABEL = 'InputXML -> StagedJSON';

function text(value) { return String(value ?? '').trim(); }
function esc(value) { return text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

function appendConverterOption(root) {
  const select = root?.querySelector?.('#model-converters-select');
  if (!select) return select;
  let option = select.querySelector(`option[value="${CONVERTER_ID}"]`);
  if (!option) {
    option = document.createElement('option');
    option.value = CONVERTER_ID;
    const anchor = select.querySelector('option[value="inputxml_to_basic_glb"]') || select.querySelector('option[value="inputxml_to_rvm"]');
    if (anchor?.nextSibling) select.insertBefore(option, anchor.nextSibling);
    else if (anchor) anchor.insertAdjacentElement('afterend', option);
    else select.appendChild(option);
  }
  option.textContent = CONVERTER_LABEL;
  return select;
}
function setStatus(root, message, tone = '') {
  const status = root.querySelector('#model-converters-status');
  if (!status) return;
  status.textContent = message;
  status.className = `model-converters-status ${tone}`.trim();
}
function setLogs(root, lines) {
  const logs = root.querySelector('#model-converters-logs');
  if (logs) logs.textContent = (Array.isArray(lines) ? lines.filter(Boolean) : []).join('\n') || '(no logs)';
}
function renderOutputs(root, outputs) {
  const output = root.querySelector('#model-converters-output');
  if (!output) return;
  const normalized = Array.isArray(outputs) ? outputs.filter((entry) => entry?.name) : [];
  if (!normalized.length) { output.innerHTML = '<span class="model-converters-muted">No output generated.</span>'; return; }
  output.innerHTML = normalized.map((entry, index) => `<div class="model-converters-output-row"><strong>${esc(entry.name)}</strong><button type="button" class="model-converters-download-btn" data-inputxml-stage-output="${index}">Download</button></div>`).join('');
  for (const button of output.querySelectorAll('[data-inputxml-stage-output]')) button.addEventListener('click', () => {
    const selected = normalized[Number(button.getAttribute('data-inputxml-stage-output'))];
    if (selected) downloadOutput(selected);
  });
}
function selectedPrimaryFile(root) { return root.querySelector('#model-converters-primary-input')?.files?.[0] || null; }
function readOptions(root) {
  const includeAuditJson = root.querySelector('[data-inputxml-stage-include-audit]')?.checked !== false;
  return { includeAuditJson };
}
function renderMode(root) {
  const primaryLabel = root.querySelector('#model-converters-primary-label');
  const primaryInput = root.querySelector('#model-converters-primary-input');
  const primaryName = root.querySelector('#model-converters-primary-name');
  const secondaryWrap = root.querySelector('#model-converters-secondary-wrap');
  const xmlWorkflow = root.querySelector('#model-converters-xml-cii-workflow');
  const supportMapper = root.querySelector('#model-converters-support-mapper');
  const fields = root.querySelector('#model-converters-advanced-fields');
  if (primaryLabel) primaryLabel.textContent = 'Input XML (CAESAR II) (.xml,.XML,.txt)';
  if (primaryInput) primaryInput.setAttribute('accept', '.xml,.XML,.txt,.TXT');
  if (primaryName && !primaryInput?.files?.[0]) primaryName.textContent = 'No InputXML selected.';
  if (secondaryWrap) secondaryWrap.style.display = 'none';
  if (xmlWorkflow) { xmlWorkflow.hidden = true; xmlWorkflow.open = false; }
  if (supportMapper) { supportMapper.hidden = true; supportMapper.open = false; }
  // The scope manager's sync() cannot fire because we call stopImmediatePropagation().
  // Clean up scope-owned elements manually so they don't bleed into this converter.
  const _wfCard = root.querySelector('[data-xml-cii-workflow-card]');
  if (_wfCard) { _wfCard.hidden = true; _wfCard.style.display = 'none'; if (_wfCard.isConnected) _wfCard.remove(); }
  const _runBtn = root.querySelector('#model-converters-run');
  if (_runBtn) { _runBtn.removeAttribute('data-xml-cii-direct-run-hidden'); _runBtn.hidden = false; _runBtn.style.display = ''; _runBtn.style.visibility = ''; }
  const _advDetails = root.querySelector('details.model-converters-advanced:not(#model-converters-support-mapper)');
  if (_advDetails) { delete _advDetails.dataset.xmlCiiLeftPanelOptionsHidden; _advDetails.hidden = false; _advDetails.style.display = ''; }
  if (fields) fields.innerHTML = `<div style="border:1px solid #2e4057;border-radius:6px;padding:8px 10px;background:#132033;color:#d7e6ff;font-size:12px;line-height:1.45;">
    <div style="font-weight:700;color:#9cc5ff;margin-bottom:4px;">Direct InputXML → stagedJSON</div>
    <div>Creates managed-stage JSON without building GLB first.</div>
    <div>Preserves RIGID weight/type, BEND metadata, SIF entries, source restraint rows/tags, and source engineering fields.</div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:8px;"><input type="checkbox" data-inputxml-stage-include-audit checked> Emit audit JSON</label>
  </div>`;
  const output = root.querySelector('#model-converters-output');
  if (output) output.innerHTML = '<span class="model-converters-muted">No output generated yet.</span>';
  const previewMeta = root.querySelector('#model-converters-preview-meta');
  if (previewMeta) previewMeta.textContent = 'Direct stagedJSON output is download-only; load it into the RVM/RVM JSON paths after export.';
  setLogs(root, []);
  setStatus(root, 'Build managed-stage JSON directly from CAESAR II InputXML.', '');
}
async function runDirectStage(root) {
  const file = selectedPrimaryFile(root);
  if (!file) { const msg = 'Select a primary InputXML file first.'; setStatus(root, `Failed: ${msg}`, 'bad'); setLogs(root, [msg]); renderOutputs(root, []); return; }
  const runButton = root.querySelector('#model-converters-run');
  try {
    if (runButton) runButton.disabled = true;
    setStatus(root, 'Running direct InputXML->StagedJSON converter...', 'running');
    setLogs(root, []); renderOutputs(root, []);
    const response = await runInputXmlToStagedJson({ converterId: CONVERTER_ID, inputFiles: [{ role: 'primary', name: file.name, file }], options: readOptions(root), setStatus: (msg, tone) => setStatus(root, msg, tone) });
    const logs = [].concat(response?.logs?.stdout || []).concat(response?.logs?.stderr || []);
    setLogs(root, logs); renderOutputs(root, response?.outputs || []);
    if (!response?.ok) throw new Error(logs.join('\n') || 'InputXML->StagedJSON conversion failed.');
    setStatus(root, `Completed: ${response.outputs?.[0]?.name || 'managed_stage.json'}`, 'ok');
  } catch (error) {
    const message = error?.message || String(error);
    setStatus(root, `Failed: ${message}`, 'bad'); setLogs(root, [message]); renderOutputs(root, []);
  } finally {
    if (runButton) runButton.disabled = false;
  }
}

export function installInputXmlManagedStageBridge(root = globalThis.document) {
  if (!root?.querySelector || !globalThis.document) return () => {};
  const select = appendConverterOption(root);
  const runButton = root.querySelector('#model-converters-run');
  if (!select || !runButton || root.dataset?.inputxmlManagedStageBridge === 'mounted') return () => {};
  if (root.dataset) root.dataset.inputxmlManagedStageBridge = 'mounted';
  const onSelectChange = (event) => { if (select.value !== CONVERTER_ID) return; event.preventDefault(); event.stopImmediatePropagation(); renderMode(root); };
  const onRun = (event) => { if (select.value !== CONVERTER_ID) return; event.preventDefault(); event.stopImmediatePropagation(); void runDirectStage(root); };
  select.addEventListener('change', onSelectChange, true);
  runButton.addEventListener('click', onRun, true);
  if (select.value === CONVERTER_ID) renderMode(root);
  return () => {
    select.removeEventListener('change', onSelectChange, true);
    runButton.removeEventListener('click', onRun, true);
  };
}
