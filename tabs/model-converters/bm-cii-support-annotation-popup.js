import { run as runInputXmlToGlb } from './converters/inputxml-to-glb.js';
import { downloadOutput } from './core/output-utils.js';
import { state } from '../../core/state.js';
import { emit } from '../../core/event-bus.js';
import { RuntimeEvents } from '../../contracts/runtime-events.js';

const CONVERTER_ID = 'bmcii_support_annotation_glb';
const CONVERTER_LABEL = 'BM_CII InputXML→GLB Support + ISONOTE';

const DEFAULT_ISONOTE_TEXT = `NODE,ISONOTE
35,:/PS-123 :ISONOTE 'REST(28kN), GUIDE(6kN),LINE STOP(15kN)'
130,:ISONOTE 'REST NOT DEFINED, SINGLE AXIS Z'
255,:ISONOTE 'REST(3kN), GUIDE(1kN)'
205,:/PS-456 :ISONOTE 'REST(10kN), HOLDDOWN,LINE STOP(6kN), Holddown without Guide Can Spring'`;

const DEFAULT_LINE_NO_TEXT = `NODE,LINE_NO
10,LINE XYZ`;

function text(value) {
  return String(value ?? '').trim();
}

function esc(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function appendConverterOption(root) {
  const select = root?.querySelector?.('#model-converters-select');
  if (!select || select.querySelector(`option[value="${CONVERTER_ID}"]`)) return select;
  const option = document.createElement('option');
  option.value = CONVERTER_ID;
  option.textContent = CONVERTER_LABEL;
  const anchor = select.querySelector('option[value="inputxml_to_glb"]') ||
    select.querySelector('option[value="inputxml_to_dxf"]') ||
    select.querySelector('option[value="inputxml_to_cii2019"]');
  if (anchor?.nextSibling) select.insertBefore(option, anchor.nextSibling);
  else if (anchor) anchor.insertAdjacentElement('afterend', option);
  else select.appendChild(option);
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
  if (diag) {
    diag.style.display = 'none';
    diag.innerHTML = '';
  }
  const previewMeta = root.querySelector('#model-converters-preview-meta');
  if (previewMeta) previewMeta.textContent = 'Use Open in Basic GLB-PCF on GLB outputs to inspect the exact generated file.';
  setLogs(root, []);
}

function blobFromOutput(output) {
  if (typeof output?.base64 === 'string' && output.base64.length > 0) {
    const binary = atob(output.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: output.mime || 'application/octet-stream' });
  }
  const ext = String(output?.name || '').split('.').pop().toLowerCase();
  const inferredMime = (ext === 'txt' || ext === 'csv')
    ? 'text/plain;charset=utf-8'
    : 'application/octet-stream';
  return new Blob([output?.text || ''], { type: output?.mime || inferredMime });
}

function openInBasicViewer(output) {
  const pending = state.modelConvertersPendingBasicOpen;
  if (pending?.revokeOnLoad && /^blob:/i.test(text(pending.url))) {
    try { URL.revokeObjectURL(pending.url); } catch {}
  }
  const blob = blobFromOutput(output);
  const url = URL.createObjectURL(blob);
  state.modelConvertersPendingBasicOpen = {
    url,
    name: text(output?.name || 'converted.glb'),
    revokeOnLoad: true,
    source: CONVERTER_ID,
    createdAt: Date.now(),
  };
  emit(RuntimeEvents.TAB_CHANGE_REQUESTED, { tabId: 'basic-glb-pcf' });
}

function renderOutputs(root, outputs) {
  const output = root.querySelector('#model-converters-output');
  if (!output) return;
  const normalized = Array.isArray(outputs) ? outputs.filter((entry) => entry?.name) : [];
  if (!normalized.length) {
    output.innerHTML = '<span class="model-converters-muted">No output generated.</span>';
    return;
  }
  output.innerHTML = normalized.map((entry, index) => `
    <div class="model-converters-output-row">
      <strong>${esc(entry.name)}</strong>
      <button type="button" class="model-converters-download-btn" data-bmcii-support-output="${index}">Download</button>
      ${/\.glb$/i.test(text(entry.name))
        ? `<button type="button" class="model-converters-download-btn" data-bmcii-support-open-basic="${index}">Open in Basic GLB-PCF</button>`
        : ''}
    </div>
  `).join('');
  for (const button of output.querySelectorAll('[data-bmcii-support-output]')) {
    const idx = Number(button.getAttribute('data-bmcii-support-output'));
    button.addEventListener('click', () => {
      const selected = normalized[idx];
      if (selected) downloadOutput(selected);
    });
  }
  for (const button of output.querySelectorAll('[data-bmcii-support-open-basic]')) {
    const idx = Number(button.getAttribute('data-bmcii-support-open-basic'));
    button.addEventListener('click', () => {
      const selected = normalized[idx];
      if (!selected) return;
      try {
        openInBasicViewer(selected);
        setStatus(root, `Opening ${selected.name} in Basic GLB-PCF Viewer...`, 'ok');
      } catch (error) {
        const message = error?.message || String(error);
        setStatus(root, `Failed: ${message}`, 'bad');
      }
    });
  }
}

function textareaStyle() {
  return 'width:100%;min-height:86px;box-sizing:border-box;border-radius:8px;border:1px solid #31455f;background:#182334;color:#e6edf5;padding:8px 10px;font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;font-size:12px;line-height:1.35;resize:vertical;';
}

function noteBlock(title, body) {
  return `
    <div style="border:1px solid #2c3a4f;border-radius:8px;background:#09111a;padding:8px 10px;margin:8px 0;">
      <div style="font-weight:700;color:#d7e6ff;margin-bottom:4px;">${esc(title)}</div>
      <div style="font-size:12px;color:#9aa8ba;line-height:1.45;white-space:pre-wrap;">${esc(body)}</div>
    </div>
  `;
}

function renderAdvancedFields(root) {
  const fields = root.querySelector('#model-converters-advanced-fields');
  if (!fields) return;
  fields.innerHTML = `
    <label class="model-converters-label">
      <span>Branches to include (comma-separated; empty = all)</span>
      <input type="text" data-option-key="selectedBranches" value="">
    </label>
    <label class="model-converters-label">
      <span>Support source mode</span>
      <select data-option-key="bmCiiSupportMode">
        <option value="inputxml-actual">InputXML actual restraints</option>
        <option value="isonote-expected">ISONOTE expected restraints</option>
        <option value="compare" selected>Compare actual vs expected</option>
      </select>
    </label>
    <label class="model-converters-label">
      <span>SINGLE AXIS Z decision</span>
      <select data-option-key="bmCiiSingleAxisZDecision">
        <option value="warning" selected>No +/- provided → warning marker</option>
        <option value="+Z">Resolve as +Z</option>
        <option value="-Z">Resolve as -Z</option>
      </select>
    </label>
    <label class="model-converters-label">
      <span>ISONOTE sideload CSV / text</span>
      <textarea data-option-key="bmCiiIsonoteSideloadText" style="${textareaStyle()}">${esc(DEFAULT_ISONOTE_TEXT)}</textarea>
    </label>
    <label class="model-converters-label">
      <span>Line No. sideload CSV / text</span>
      <textarea data-option-key="bmCiiLineNoSideloadText" style="${textareaStyle()}">${esc(DEFAULT_LINE_NO_TEXT)}</textarea>
    </label>
    <label style="display:flex;align-items:center;gap:8px;color:#d7e6ff;font-size:12px;">
      <input type="checkbox" data-option-key="includeSidecarJson" checked>
      <span>Export sidecar JSON</span>
    </label>
    <label style="display:flex;align-items:center;gap:8px;color:#d7e6ff;font-size:12px;">
      <input type="checkbox" data-option-key="exportNodeLabels" checked>
      <span>Export node labels</span>
    </label>
    <label style="display:flex;align-items:center;gap:8px;color:#d7e6ff;font-size:12px;">
      <input type="checkbox" data-option-key="exportComponentText">
      <span>Export component text labels (off for compact BM_CII output)</span>
    </label>
    <label style="display:flex;align-items:center;gap:8px;color:#d7e6ff;font-size:12px;">
      <input type="checkbox" data-option-key="exportRestraintText">
      <span>Export support/restraint text labels (off for compact BM_CII output)</span>
    </label>
    <button type="button" class="model-converters-download-btn" data-bmcii-support-popup="setup">Open BM_CII setup / rules popup</button>
    ${noteBlock('Locked support mapping', 'REST = +Y upward. HOLDDOWN = vertical ±Y. GUIDE = lateral: pipe X→Z, pipe Z→X, vertical pipe→±X and ±Z. LIMIT/LIM and LINE STOP = axial ± unless explicit sign. Can Spring/Spring Can = warning coil below pipe.')}
    ${noteBlock('Placement rule', 'Apply engineering contact first. Then classify final symbol orientation. Apply visual resolver offset OD×2/3 only to final pipe-parallel / axial symbols. Axial gap = 10×GAP; non-axial positive gap = OD/2 + 10×GAP.')}
  `;

  fields.querySelector('[data-bmcii-support-popup="setup"]')?.addEventListener('click', () => openSetupPopup(root));
}

function renderMode(root) {
  const primaryLabel = root.querySelector('#model-converters-primary-label');
  const primaryInput = root.querySelector('#model-converters-primary-input');
  const primaryName = root.querySelector('#model-converters-primary-name');
  const secondaryWrap = root.querySelector('#model-converters-secondary-wrap');
  const secondaryLabel = root.querySelector('#model-converters-secondary-label');
  const secondaryInput = root.querySelector('#model-converters-secondary-input');
  const secondaryName = root.querySelector('#model-converters-secondary-name');
  const xmlWorkflow = root.querySelector('#model-converters-xml-cii-workflow');
  const supportMapper = root.querySelector('#model-converters-support-mapper');

  if (primaryLabel) primaryLabel.textContent = 'Input XML (CAESAR II) (.xml,.XML)';
  if (primaryInput) primaryInput.setAttribute('accept', '.xml,.XML');
  if (primaryName && !primaryInput?.files?.[0]) primaryName.textContent = 'No file selected.';
  if (secondaryWrap) secondaryWrap.style.display = '';
  if (secondaryLabel) secondaryLabel.textContent = 'Optional sideload bundle (.csv,.json,.txt)';
  if (secondaryInput) secondaryInput.setAttribute('accept', '.csv,.CSV,.json,.JSON,.txt,.TXT');
  if (secondaryName && !secondaryInput?.files?.[0]) secondaryName.textContent = 'No sideload bundle selected.';
  if (xmlWorkflow) {
    xmlWorkflow.hidden = true;
    xmlWorkflow.open = false;
  }
  if (supportMapper) {
    supportMapper.hidden = true;
    supportMapper.open = false;
  }

  renderAdvancedFields(root);
  setStatus(root, 'Build BM_CII GLB with InputXML component metadata, support mapping, ISONOTE/Line No sideloads, and single-axis prompts.', '');
  resetOutput(root);
}

function readOptions(root) {
  const options = {};
  for (const input of root.querySelectorAll('[data-option-key]')) {
    const key = input.getAttribute('data-option-key');
    if (!key) continue;
    if (input.type === 'checkbox') options[key] = input.checked;
    else if (input.type === 'number') options[key] = Number(input.value);
    else options[key] = input.value;
  }
  options.bmCiiSupportAnnotationTool = true;
  options.bmCiiSupportMode = text(options.bmCiiSupportMode) || 'compare';
  options.bmCiiIsonoteSideloadText = text(options.bmCiiIsonoteSideloadText) || DEFAULT_ISONOTE_TEXT;
  options.bmCiiLineNoSideloadText = text(options.bmCiiLineNoSideloadText) || DEFAULT_LINE_NO_TEXT;
  options.bmCiiSupportMappingContract = 'common-inputxml-support-mapper/v3';
  options.bmCiiAxialResolver = 'engineering-contact-first-then-ODx2over3-only-if-pipe-parallel';
  options.exportComponentText = options.exportComponentText === true;
  options.showComponentLabels = options.exportComponentText;
  options.exportRestraintText = options.exportRestraintText === true;
  options.showSupportLabels = options.exportRestraintText;
  return options;
}

function selectedFile(root, selector) {
  return root.querySelector(selector)?.files?.[0] || null;
}

async function readOptionalFile(file) {
  if (!file) return '';
  if (typeof file.text === 'function') return file.text();
  return '';
}

function parseIsonoteRows(rawText) {
  const rows = [];
  const lines = text(rawText).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^node\s*,/i.test(line)) continue;
    const comma = line.indexOf(',');
    if (comma > 0) {
      const node = line.slice(0, comma).trim();
      const note = line.slice(comma + 1).trim();
      if (/^\d+(?:\.\d+)?$/.test(node) && note) rows.push({ node, note });
      continue;
    }
    const match = line.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
    if (match) rows.push({ node: match[1], note: match[2].trim() });
  }
  return rows;
}

function buildAudit(options, secondaryText, sourceName) {
  const isonoteText = [options.bmCiiIsonoteSideloadText, secondaryText].map(text).filter(Boolean).join('\n') || DEFAULT_ISONOTE_TEXT;
  const records = parseIsonoteRows(isonoteText);
  const singleAxis = [];
  for (const row of records) {
    for (const match of row.note.matchAll(/\bSINGLE\s+AXIS\s+([XYZ])\b/ig)) {
      singleAxis.push({ node: row.node, axis: match[1].toUpperCase(), decision: options.bmCiiSingleAxisZDecision || 'warning' });
    }
  }
  return {
    schema: 'bm-cii-support-annotation-converter-audit/v2',
    source: sourceName,
    mode: options.bmCiiSupportMode,
    supportMappingContract: options.bmCiiSupportMappingContract,
    axialResolver: options.bmCiiAxialResolver,
    isonoteRecordCount: records.length,
    isonoteRecords: records,
    singleAxisPrompts: singleAxis,
    lineNoSideloadText: options.bmCiiLineNoSideloadText || DEFAULT_LINE_NO_TEXT,
    compactOutput: {
      exportComponentText: options.exportComponentText === true,
      exportRestraintText: options.exportRestraintText === true,
    },
    rules: {
      rest: 'REST is always +Y upward.',
      holddown: 'HOLDDOWN is vertical double-arrow ±Y.',
      guide: 'Horizontal X pipe -> ±Z; horizontal Z pipe -> ±X; vertical pipe -> ±X and ±Z.',
      axial: 'LINE STOP, LIMIT, LIM = axial ± unless explicit sign; axial gap = 10×GAP.',
      springWarning: 'Can Spring / Spring Can = warning coil below pipe.',
      visualResolver: 'Apply OD×2/3 only after engineering contact and only for final pipe-parallel/axial symbols.',
    },
  };
}

function auditOutputName(sourceName) {
  const stem = text(sourceName).replace(/\.[^.]+$/, '') || 'inputxml';
  return `${stem}-bmcii-support-annotation-audit.json`;
}

async function runTool(root) {
  const file = selectedFile(root, '#model-converters-primary-input');
  if (!file) {
    const msg = 'Select a primary Input XML file first.';
    setStatus(root, `Failed: ${msg}`, 'bad');
    setLogs(root, [msg]);
    renderOutputs(root, []);
    return;
  }

  const runButton = root.querySelector('#model-converters-run');
  try {
    if (runButton) runButton.disabled = true;
    setStatus(root, 'Running BM_CII support/annotation GLB tool...', 'running');
    setLogs(root, []);
    renderOutputs(root, []);

    const secondaryFile = selectedFile(root, '#model-converters-secondary-input');
    const secondaryText = await readOptionalFile(secondaryFile);
    const options = readOptions(root);
    options.bmCiiSideloadBundleName = secondaryFile?.name || '';
    options.bmCiiSideloadBundleText = secondaryText;

    const audit = buildAudit(options, secondaryText, file.name);
    if (audit.singleAxisPrompts.length && (options.bmCiiSingleAxisZDecision || 'warning') === 'warning') {
      stdoutWarn(root, audit.singleAxisPrompts);
    }

    const response = await runInputXmlToGlb({
      converterId: CONVERTER_ID,
      inputFiles: [{ role: 'primary', name: file.name, file }],
      options,
      setStatus: (msg, tone) => setStatus(root, msg, tone),
    });

    const logs = []
      .concat(response?.logs?.stdout || [])
      .concat(response?.logs?.stderr || []);
    if (audit.singleAxisPrompts.length) {
      logs.push(`BM_CII SINGLE AXIS prompts: ${JSON.stringify(audit.singleAxisPrompts)}`);
    }
    const outputs = [...(response?.outputs || []), {
      name: auditOutputName(file.name),
      text: JSON.stringify(audit, null, 2),
      mime: 'application/json',
    }];
    setLogs(root, logs);
    renderOutputs(root, outputs);
    if (!response?.ok) throw new Error(logs.join('\n') || 'BM_CII support/annotation GLB failed.');
    setStatus(root, `Completed: ${outputs[0]?.name || 'BM_CII GLB output'}`, 'ok');
  } catch (error) {
    const message = error?.message || String(error);
    setStatus(root, `Failed: ${message}`, 'bad');
    setLogs(root, [message]);
  } finally {
    if (runButton) runButton.disabled = false;
  }
}

function stdoutWarn(root, prompts) {
  if (!prompts?.length) return;
  const status = root.querySelector('#model-converters-status');
  if (status) status.title = 'SINGLE AXIS without +/- uses warning marker until user chooses + or -.';
}

function openSetupPopup(root) {
  if (!globalThis.document) return;
  root.querySelector?.('[data-bmcii-support-popup-overlay]')?.remove?.();
  const overlay = document.createElement('div');
  overlay.className = 'model-converters-workflow-popup-overlay';
  overlay.setAttribute('data-bmcii-support-popup-overlay', '1');
  overlay.innerHTML = `
    <div class="model-converters-workflow-popup" role="dialog" aria-modal="true" aria-label="BM_CII support annotation setup">
      <div class="model-converters-workflow-popup-head">
        <div>
          <div class="model-converters-workflow-popup-title">BM_CII Support + Annotation Setup</div>
          <div class="model-converters-workflow-detail-text">Configure ISONOTE sideload, line-number sideload, unresolved single-axis prompts, and support mapping rules.</div>
        </div>
        <button type="button" class="model-converters-download-btn model-converters-workflow-popup-close" data-bmcii-popup-close>Close</button>
      </div>
      <div class="model-converters-workflow-popup-tabs">
        <button type="button" class="model-converters-workflow-phase is-active" data-bmcii-popup-tab="sideload"><span>Sideloads</span></button>
        <button type="button" class="model-converters-workflow-phase" data-bmcii-popup-tab="axis"><span>Single Axis</span></button>
        <button type="button" class="model-converters-workflow-phase" data-bmcii-popup-tab="rules"><span>Mapping Rules</span></button>
        <button type="button" class="model-converters-workflow-phase" data-bmcii-popup-tab="run"><span>Run Checklist</span></button>
      </div>
      <div class="model-converters-workflow-popup-body" data-bmcii-popup-body></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const body = overlay.querySelector('[data-bmcii-popup-body]');
  const render = (tab) => {
    for (const btn of overlay.querySelectorAll('[data-bmcii-popup-tab]')) btn.classList.toggle('is-active', btn.getAttribute('data-bmcii-popup-tab') === tab);
    if (tab === 'axis') body.innerHTML = renderSingleAxisPopup(root);
    else if (tab === 'rules') body.innerHTML = renderRulesPopup();
    else if (tab === 'run') body.innerHTML = renderRunChecklistPopup();
    else body.innerHTML = renderSideloadPopup(root);
    bindPopupBody(root, body);
  };

  overlay.querySelector('[data-bmcii-popup-close]')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });
  for (const btn of overlay.querySelectorAll('[data-bmcii-popup-tab]')) {
    btn.addEventListener('click', () => render(btn.getAttribute('data-bmcii-popup-tab') || 'sideload'));
  }
  render('sideload');
}

function fieldValue(root, key) {
  return root.querySelector(`[data-option-key="${key}"]`)?.value || '';
}

function setFieldValue(root, key, value) {
  const el = root.querySelector(`[data-option-key="${key}"]`);
  if (el) el.value = value;
}

function renderSideloadPopup(root) {
  return `
    ${noteBlock('ISONOTE source note names', 'Use source text exactly as sideloaded, node-wise. Example: Node 35, :/PS-123 :ISONOTE \'REST(28kN), GUIDE(6kN),LINE STOP(15kN)\'.')}
    <label class="model-converters-label"><span>ISONOTE sideload</span><textarea data-bmcii-popup-copy="bmCiiIsonoteSideloadText" style="${textareaStyle()}">${esc(fieldValue(root, 'bmCiiIsonoteSideloadText') || DEFAULT_ISONOTE_TEXT)}</textarea></label>
    <label class="model-converters-label"><span>Line No. sideload</span><textarea data-bmcii-popup-copy="bmCiiLineNoSideloadText" style="${textareaStyle()}">${esc(fieldValue(root, 'bmCiiLineNoSideloadText') || DEFAULT_LINE_NO_TEXT)}</textarea></label>
    <button type="button" class="model-converters-download-btn" data-bmcii-popup-apply>Apply sideload text</button>
  `;
}

function renderSingleAxisPopup(root) {
  return `
    ${noteBlock('SINGLE AXIS decision', 'Keyword SINGLE with no +/- sign must prompt the user. If no sign is selected, the GLB should carry warning metadata and show a warning symbol, not a guessed arrow.')}
    <label class="model-converters-label"><span>SINGLE AXIS Z</span><select data-bmcii-popup-copy="bmCiiSingleAxisZDecision">
      ${['warning', '+Z', '-Z'].map((value) => `<option value="${value}" ${fieldValue(root, 'bmCiiSingleAxisZDecision') === value ? 'selected' : ''}>${value === 'warning' ? 'Warning marker only' : esc(value)}</option>`).join('')}
    </select></label>
    <button type="button" class="model-converters-download-btn" data-bmcii-popup-apply>Apply decision</button>
  `;
}

function renderRulesPopup() {
  return `
    ${noteBlock('Support mapper route', 'InputXML actual restraints and ISONOTE expected restraints must route through one common support mapper and one glyph renderer.')}
    ${noteBlock('Direction mapping', 'REST → +Y upward. HOLDDOWN → ±Y double arrow. GUIDE → pipe X uses ±Z; pipe Z uses ±X; vertical pipe uses ±X and ±Z. LIMIT/LIM/LINE STOP → axial ± unless explicit sign.')}
    ${noteBlock('Gap and visual resolver', 'GAP is record-scoped. Axial gap = 10×GAP. Apply engineering contact first; then apply OD×2/3 visual resolver only when the final symbol is parallel to pipe.')}
    ${noteBlock('Warnings', 'Can Spring / Spring Can creates a warning coil below pipe. “without Guide” is a negation and must not create GUIDE.')}
  `;
}

function renderRunChecklistPopup() {
  return `
    ${noteBlock('Before run', 'Select InputXML. Confirm ISONOTE sideload text. Confirm Line No. sideload. Resolve or keep warning for SINGLE AXIS cases.')}
    ${noteBlock('Outputs', 'The converter emits GLB plus BM_CII support/annotation audit JSON. Use Open in Basic GLB-PCF on the GLB output row for direct visual QA.')}
  `;
}

function bindPopupBody(root, body) {
  body.querySelector('[data-bmcii-popup-apply]')?.addEventListener('click', () => {
    for (const input of body.querySelectorAll('[data-bmcii-popup-copy]')) {
      setFieldValue(root, input.getAttribute('data-bmcii-popup-copy'), input.value);
    }
    setStatus(root, 'BM_CII popup settings applied.', 'ok');
  });
}

export function installBmCiiSupportAnnotationPopup(root = globalThis.document) {
  if (!root?.querySelector || !globalThis.document) return () => {};
  const select = appendConverterOption(root);
  const runButton = root.querySelector('#model-converters-run');
  if (!select || !runButton || root.dataset.bmCiiSupportAnnotationPopup === 'mounted') return () => {};
  root.dataset.bmCiiSupportAnnotationPopup = 'mounted';

  const onSelectChange = (event) => {
    if (select.value !== CONVERTER_ID) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    renderMode(root);
  };

  const onRun = (event) => {
    if (select.value !== CONVERTER_ID) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void runTool(root);
  };

  select.addEventListener('change', onSelectChange, true);
  runButton.addEventListener('click', onRun, true);
  if (select.value === CONVERTER_ID) renderMode(root);

  return () => {
    select.removeEventListener('change', onSelectChange, true);
    runButton.removeEventListener('click', onRun, true);
  };
}
