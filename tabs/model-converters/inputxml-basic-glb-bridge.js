import { run as runInputXmlToBasicGlb } from './converters/inputxml-to-basic-glb.js';
import { downloadOutput } from './core/output-utils.js';

const CONVERTER_ID = 'inputxml_to_basic_glb';
const CONVERTER_LABEL = 'INPUTXML->GLB';

const DEFAULT_ISONOTE = `NODE,ISONOTE
35,:/PS-123 :ISONOTE 'REST(28kN), GUIDE(6kN),LINE STOP(15kN)'
130,:ISONOTE 'REST NOT DEFINED, SINGLE AXIS Z'
255,:ISONOTE 'REST(3kN), GUIDE(1kN)'
205,:/PS-456 :ISONOTE 'REST(10kN), HOLDDOWN,LINE STOP(6kN), Holddown without Guide Can Spring'`;

const DEFAULT_LINE_NO = `NODE,LINE_NO
10,LINE XYZ`;

function text(value) { return String(value ?? '').trim(); }
function esc(value) { return text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function asText(value) { return String(value ?? ''); }
function normalizeNewlines(value) { return asText(value).replace(/\r\n?/g, '\n').trim(); }

function appendConverterOption(root) {
  const select = root?.querySelector?.('#model-converters-select');
  if (!select) return select;
  let option = select.querySelector(`option[value="${CONVERTER_ID}"]`);
  if (!option) {
    option = document.createElement('option');
    option.value = CONVERTER_ID;
    const richGlb = select.querySelector('option[value="inputxml_to_glb"]');
    if (richGlb?.nextSibling) select.insertBefore(option, richGlb.nextSibling);
    else if (richGlb) richGlb.insertAdjacentElement('afterend', option);
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
  if (!logs) return;
  const normalized = Array.isArray(lines) ? lines.map(text).filter(Boolean) : [];
  logs.textContent = normalized.length ? normalized.join('\n') : '(no logs)';
}

function resetOutput(root) {
  const output = root.querySelector('#model-converters-output');
  if (output) output.innerHTML = '<span class="model-converters-muted">No output generated yet.</span>';
  const diag = root.querySelector('#model-converters-diagnostics-table');
  if (diag) { diag.style.display = 'none'; diag.innerHTML = ''; }
  const previewMeta = root.querySelector('#model-converters-preview-meta');
  if (previewMeta) previewMeta.textContent = 'InputXML->GLB output is download-only here; open it in the GLB viewer tab.';
  setLogs(root, []);
}

function renderOutputs(root, outputs) {
  const output = root.querySelector('#model-converters-output');
  if (!output) return;
  const normalized = Array.isArray(outputs) ? outputs.filter((entry) => entry?.name) : [];
  if (!normalized.length) { output.innerHTML = '<span class="model-converters-muted">No output generated.</span>'; return; }
  output.innerHTML = normalized.map((entry, index) => `<div class="model-converters-output-row"><strong>${esc(entry.name)}</strong><button type="button" class="model-converters-download-btn" data-inputxml-basic-glb-output="${index}">Download</button></div>`).join('');
  for (const button of output.querySelectorAll('[data-inputxml-basic-glb-output]')) button.addEventListener('click', () => {
    const selected = normalized[Number(button.getAttribute('data-inputxml-basic-glb-output'))];
    if (selected) downloadOutput(selected);
  });
}

function renderRuntimeChecklist(root) {
  let box = root.querySelector('#inputxml-glb-wiring-checklist');
  const fields = root.querySelector('#model-converters-advanced-fields');
  if (!fields) return;
  if (!box) {
    box = document.createElement('div');
    box.id = 'inputxml-glb-wiring-checklist';
    fields.appendChild(box);
  }
  box.style.cssText = 'border:1px solid #2e4057;border-radius:6px;padding:8px 10px;background:#132033;color:#d7e6ff;font-size:12px;line-height:1.45;';
  box.innerHTML = `<div style="font-weight:700;color:#9cc5ff;margin-bottom:4px;">INPUTXML-&gt;GLB wiring checklist</div>
    <div>✓ Converter renamed to <b>INPUTXML-&gt;GLB</b></div>
    <div>✓ Primary input: <b>Input XML (CAESAR II) (.xml,.XML)</b></div>
    <div>✓ Optional sideload bundle: <b>.csv,.json,.txt</b></div>
    <div>✓ ISONOTE sideload wired to <code>isonoteText</code></div>
    <div>✓ LINE_NO sideload wired to <code>lineNoText</code></div>
    <div>✓ Axis/sign option wired to <code>singleAxisDecision</code></div>
    <div>✓ Support source mode wired to <code>supportMode</code></div>
    <div>✓ Node / ISONOTE / sidecar settings wired through Advanced options</div>`;
}

function renderAdvancedFields(root) {
  const fields = root.querySelector('#model-converters-advanced-fields'); if (!fields) return;
  const sel = (key, opts, label) => `<label style="display:flex;flex-direction:column;gap:3px;color:#d7e6ff;font-size:12px;">${label}<select data-option-key="${key}" style="background:#1a2535;color:#d7e6ff;border:1px solid #2e4057;border-radius:4px;padding:3px 6px;font-size:12px;">${opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>`;
  const chk = (key, label, checked = true) => `<label style="display:flex;align-items:center;gap:8px;color:#d7e6ff;font-size:12px;"><input type="checkbox" data-option-key="${key}"${checked ? ' checked' : ''}><span>${label}</span></label>`;
  const ta = (key, label, val, rows = 3) => `<label style="display:flex;flex-direction:column;gap:3px;color:#d7e6ff;font-size:12px;">${label}<textarea data-option-key="${key}" rows="${rows}" style="background:#1a2535;color:#d7e6ff;border:1px solid #2e4057;border-radius:4px;padding:4px 6px;font-size:11px;font-family:monospace;resize:vertical;">${esc(val)}</textarea></label>`;
  fields.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;margin-top:4px;">
${sel('supportMode', [['compare','Compare (InputXML actual + ISONOTE expected)'],['inputxml-actual','InputXML actual only'],['isonote-expected','ISONOTE expected only']], 'Support Source Mode')}
${sel('singleAxisDecision', [['warning','Warning triangle'],['+','Force + (positive)'],['-','Force - (negative)']], 'Ambiguous Single-Axis Sign / Axis Option')}
${sel('lineNoMode', [['sideload-first','LINE_NO sideload first, then fallback'],['single-fallback','Single LINE_NO fallback for all'],['none','Do not apply LINE_NO sideload']], 'Line No. Option')}
${chk('nodeLabels', 'Node labels', true)}
${chk('isonoteBoards', 'ISONOTE annotations', true)}
${chk('includeSidecarJson', 'Export sidecar JSON (audit)', true)}
${ta('isonoteText', 'ISONOTE Sideload (CSV: NODE,ISONOTE)', DEFAULT_ISONOTE, 5)}
${ta('lineNoText', 'LINE_NO Sideload (CSV: NODE,LINE_NO)', DEFAULT_LINE_NO, 2)}
</div>`;
  renderRuntimeChecklist(root);
}

function selectedPrimaryFile(root) { return root.querySelector('#model-converters-primary-input')?.files?.[0] || null; }
function selectedSideloadFile(root) { return root.querySelector('#model-converters-secondary-input')?.files?.[0] || null; }

async function readBrowserFile(file) {
  if (!file) return '';
  if (typeof file.text === 'function') return file.text();
  return '';
}

function parseDelimitedSideload(rawText) {
  const lines = normalizeNewlines(rawText).split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return {};
  const header = lines[0].split(',').map((h) => h.trim().toUpperCase());
  const nodeIdx = header.indexOf('NODE');
  const isonoteIdx = header.findIndex((h) => h === 'ISONOTE' || h === 'ISO_NOTE');
  const lineIdx = header.findIndex((h) => h === 'LINE_NO' || h === 'LINENO' || h === 'LINE NO');
  const out = {};
  if (nodeIdx < 0) return out;
  const isonoteRows = ['NODE,ISONOTE'];
  const lineRows = ['NODE,LINE_NO'];
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const node = text(cols[nodeIdx]);
    if (!node) continue;
    if (isonoteIdx >= 0 && text(cols[isonoteIdx])) isonoteRows.push(`${node},${cols.slice(isonoteIdx).join(',').trim()}`);
    if (lineIdx >= 0 && text(cols[lineIdx])) lineRows.push(`${node},${text(cols[lineIdx])}`);
  }
  if (isonoteRows.length > 1) out.isonoteText = isonoteRows.join('\n');
  if (lineRows.length > 1) out.lineNoText = lineRows.join('\n');
  return out;
}

function normalizeJsonSideload(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  const isonote = value.isonoteText || value.ISONOTE || value.isonote || value.isonotes;
  const lineNo = value.lineNoText || value.LINE_NO || value.lineNo || value.lineNos;
  if (typeof isonote === 'string') out.isonoteText = normalizeNewlines(isonote);
  if (typeof lineNo === 'string') out.lineNoText = normalizeNewlines(lineNo);
  const rowsToCsv = (rows, key) => {
    if (!Array.isArray(rows)) return '';
    const header = key === 'isonote' ? 'NODE,ISONOTE' : 'NODE,LINE_NO';
    const valueKeys = key === 'isonote' ? ['ISONOTE', 'isonote', 'note', 'text'] : ['LINE_NO', 'lineNo', 'line_no', 'line'];
    const csv = [header];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const node = text(row.NODE ?? row.node ?? row.Node);
      const val = valueKeys.map((k) => row[k]).find((v) => text(v));
      if (node && text(val)) csv.push(`${node},${text(val)}`);
    }
    return csv.length > 1 ? csv.join('\n') : '';
  };
  if (!out.isonoteText) out.isonoteText = rowsToCsv(isonote, 'isonote');
  if (!out.lineNoText) out.lineNoText = rowsToCsv(lineNo, 'lineNo');
  return out;
}

function parseSideloadBundle(rawText, fileName = '') {
  const body = normalizeNewlines(rawText);
  if (!body) return {};
  if (/\.json$/i.test(fileName) || /^[\[{]/.test(body)) {
    try { return normalizeJsonSideload(JSON.parse(body)); } catch {}
  }
  return parseDelimitedSideload(body);
}

function applySideloadToFields(root, parsed = {}) {
  const isonote = root.querySelector('[data-option-key="isonoteText"]');
  const lineNo = root.querySelector('[data-option-key="lineNoText"]');
  if (parsed.isonoteText && isonote) isonote.value = parsed.isonoteText;
  if (parsed.lineNoText && lineNo) lineNo.value = parsed.lineNoText;
}

async function applySelectedSideloadBundle(root) {
  const file = selectedSideloadFile(root);
  if (!file) return {};
  const raw = await readBrowserFile(file);
  const parsed = parseSideloadBundle(raw, file.name || '');
  applySideloadToFields(root, parsed);
  return parsed;
}

function readOptions(root) {
  const options = {};
  for (const input of root.querySelectorAll('[data-option-key]')) {
    const key = input.getAttribute('data-option-key');
    if (!key) continue;
    options[key] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
  }
  if (options.lineNoMode === 'none') options.lineNoText = '';
  return options;
}

function renderInputXmlBasicGlbMode(root) {
  const primaryLabel = root.querySelector('#model-converters-primary-label');
  const primaryInput = root.querySelector('#model-converters-primary-input');
  const primaryName = root.querySelector('#model-converters-primary-name');
  const secondaryWrap = root.querySelector('#model-converters-secondary-wrap');
  const secondaryLabel = root.querySelector('#model-converters-secondary-label');
  const secondaryInput = root.querySelector('#model-converters-secondary-input');
  const secondaryName = root.querySelector('#model-converters-secondary-name');
  const xmlWorkflow = root.querySelector('#model-converters-xml-cii-workflow');
  const supportMapper = root.querySelector('#model-converters-support-mapper');
  const advanced = root.querySelector('.model-converters-advanced');

  if (primaryLabel) primaryLabel.textContent = 'Input XML (CAESAR II) (.xml,.XML)';
  if (primaryInput) primaryInput.setAttribute('accept', '.xml,.XML');
  if (primaryName && !primaryInput?.files?.[0]) primaryName.textContent = 'No file selected.';
  if (secondaryWrap) secondaryWrap.style.display = '';
  if (secondaryLabel) secondaryLabel.textContent = 'Optional sideload bundle (.csv,.json,.txt)';
  if (secondaryInput) secondaryInput.setAttribute('accept', '.csv,.CSV,.json,.JSON,.txt,.TXT');
  if (secondaryName && !secondaryInput?.files?.[0]) secondaryName.textContent = 'No sideload bundle selected.';
  if (advanced?.querySelector('summary')) advanced.querySelector('summary').textContent = 'Advanced options';
  if (xmlWorkflow) { xmlWorkflow.hidden = true; xmlWorkflow.open = false; }
  if (supportMapper) { supportMapper.hidden = true; supportMapper.open = false; }
  renderAdvancedFields(root);
  setStatus(root, 'Build a GLB from CAESAR II InputXML with side-loaded ISONOTE, LINE_NO, axis, support and annotation options.', '');
  resetOutput(root);
}

async function runInputXmlBasicGlb(root) {
  const file = selectedPrimaryFile(root);
  if (!file) { const msg = 'Select a primary Input XML file first.'; setStatus(root, `Failed: ${msg}`, 'bad'); setLogs(root, [msg]); renderOutputs(root, []); return; }
  const runButton = root.querySelector('#model-converters-run');
  try {
    if (runButton) runButton.disabled = true;
    setStatus(root, 'Running INPUTXML->GLB converter...', 'running'); setLogs(root, []); renderOutputs(root, []);
    const sideload = await applySelectedSideloadBundle(root);
    const options = { ...readOptions(root), sideloadBundleApplied: !!(sideload.isonoteText || sideload.lineNoText) };
    const inputFiles = [{ role: 'primary', name: file.name, file }];
    const secondary = selectedSideloadFile(root);
    if (secondary) inputFiles.push({ role: 'sideload', name: secondary.name, file: secondary });
    const response = await runInputXmlToBasicGlb({ converterId: CONVERTER_ID, inputFiles, options, setStatus: (msg, tone) => setStatus(root, msg, tone) });
    const logs = [].concat(response?.logs?.stdout || []).concat(response?.logs?.stderr || []);
    setLogs(root, logs); renderOutputs(root, response?.outputs || []);
    if (!response?.ok || !(response?.outputs || []).some((entry) => /\.glb$/i.test(entry?.name || ''))) throw new Error(logs.join('\n') || 'INPUTXML->GLB conversion failed or produced no GLB.');
    setStatus(root, `Completed: ${response.outputs?.[0]?.name || 'INPUTXML->GLB output'}`, 'ok');
  } catch (error) { const message = error?.message || String(error); setStatus(root, `Failed: ${message}`, 'bad'); setLogs(root, [message]); renderOutputs(root, []); }
  finally { if (runButton) runButton.disabled = false; }
}

export function installInputXmlBasicGlbBridge(root = globalThis.document) {
  if (!root?.querySelector || !globalThis.document) return () => {};
  const select = appendConverterOption(root); const runButton = root.querySelector('#model-converters-run');
  if (!select || !runButton || root.dataset?.inputxmlBasicGlbBridge === 'mounted') return () => {};
  if (root.dataset) root.dataset.inputxmlBasicGlbBridge = 'mounted';
  const onSelectChange = (event) => { if (select.value !== CONVERTER_ID) return; event.preventDefault(); event.stopImmediatePropagation(); renderInputXmlBasicGlbMode(root); };
  const onRun = (event) => { if (select.value !== CONVERTER_ID) return; event.preventDefault(); event.stopImmediatePropagation(); void runInputXmlBasicGlb(root); };
  const onSecondaryChange = () => { if (select.value !== CONVERTER_ID) return; void applySelectedSideloadBundle(root); };
  select.addEventListener('change', onSelectChange, true);
  runButton.addEventListener('click', onRun, true);
  root.querySelector('#model-converters-secondary-input')?.addEventListener('change', onSecondaryChange, true);
  if (select.value === CONVERTER_ID) renderInputXmlBasicGlbMode(root);
  return () => {
    select.removeEventListener('change', onSelectChange, true);
    runButton.removeEventListener('click', onRun, true);
    root.querySelector('#model-converters-secondary-input')?.removeEventListener('change', onSecondaryChange, true);
  };
}
