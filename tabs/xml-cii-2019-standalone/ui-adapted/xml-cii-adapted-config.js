import { createElement } from './xml-cii-adapted-dom.js';
import { validateSupportConfigJson } from '../xml-cii-workflow-api.js';
import { saveMasterContextToLocalStorage } from './xml-cii-adapted-state.js';
import { DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS, RESTRAINT_TYPE_MUTATION_INFO, normalizeRestraintTypeMutationRows } from '../../../converters/xml-cii2019-core/restraint-type-mutation.js';
import { isXmlMaskEnabled, setXmlMaskEnabled } from '../xml-cii-workflow-source-detect.js';

function esc(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Master reference tables (weight/material/piping-class/line-list rows) can run to thousands of
// rows once loaded from the app defaults or an import. Editing/displaying that inline as raw JSON
// text makes the textarea multi-hundred-KB, which is slow enough to read as a hang. This editor
// summarizes those specific fields with a placeholder and edits everything else directly; the
// omitted rows are always preserved from the authoritative in-memory config on save/export.
const LARGE_ROW_FIELDS = Object.freeze([
  { section: 'weight', field: 'masterRows' },
  { section: 'material', field: 'mapRows' },
  { section: 'pipingClass', field: 'masterRows' },
  { section: 'linelist', field: 'masterRows' },
]);
const LARGE_ROW_THRESHOLD = 50;
const OMITTED_MARKER_KEY = '__rowsOmittedFromEditor';

function buildDisplayConfig(fullConfig) {
  const display = { ...fullConfig };
  for (const { section, field } of LARGE_ROW_FIELDS) {
    const rows = fullConfig?.[section]?.[field];
    if (!Array.isArray(rows) || rows.length <= LARGE_ROW_THRESHOLD) continue;
    display[section] = { ...display[section], [field]: { [OMITTED_MARKER_KEY]: rows.length, note: `${rows.length} row(s) omitted from this editor — manage via the Import Masters tab (Source & Masters). Saving/exporting keeps the full data.` } };
  }
  return display;
}

// Merges a user-edited config back onto the authoritative full config: any large-row field left
// as the omitted-placeholder (or missing entirely) keeps its real rows; anything the user actually
// replaced with a real array is accepted as-is.
function mergeEditedConfig(editedConfig, fullConfig) {
  const merged = { ...editedConfig };
  for (const { section, field } of LARGE_ROW_FIELDS) {
    const editedValue = merged?.[section]?.[field];
    const isPlaceholder = editedValue && typeof editedValue === 'object' && !Array.isArray(editedValue) && OMITTED_MARKER_KEY in editedValue;
    if (Array.isArray(editedValue) && !isPlaceholder) continue;
    const originalRows = fullConfig?.[section]?.[field];
    if (Array.isArray(originalRows)) merged[section] = { ...merged[section], [field]: originalRows };
  }
  return merged;
}

function makeCheckbox(parent, labelText, checked, onChange) {
  const label = createElement('label');
  label.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:#cbd5e1;cursor:pointer;';
  const input = createElement('input');
  input.type = 'checkbox';
  input.checked = !!checked;
  input.addEventListener('change', (e) => onChange(e.target.checked));
  label.append(input, document.createTextNode(labelText));
  parent.appendChild(label);
  return input;
}

function makeNumberInput(parent, labelText, value, step, onChange) {
  const label = createElement('label');
  label.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:12px;color:#cbd5e1;';
  const input = createElement('input');
  input.type = 'number';
  input.step = step;
  input.value = value ?? '';
  input.style.cssText = 'background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:4px;padding:4px;width:100px;text-align:right;font-size:12px;';
  input.addEventListener('change', (e) => onChange(Number(e.target.value)));
  label.append(document.createTextNode(labelText), input);
  parent.appendChild(label);
  return input;
}

function makeTextInput(parent, labelText, value, onChange) {
  const label = createElement('label');
  label.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:12px;color:#cbd5e1;';
  const input = createElement('input');
  input.type = 'text';
  input.value = value ?? '';
  input.style.cssText = 'background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:4px;padding:4px;width:100px;text-align:right;font-size:12px;';
  input.addEventListener('change', (e) => onChange(e.target.value.trim()));
  label.append(document.createTextNode(labelText), input);
  parent.appendChild(label);
  return input;
}

function ensureRestraintTypeMutationConfig(configObj) {
  const current = configObj.inputXmlRestraintTypeMutation || configObj.restraintTypeMutation || {};
  const rows = normalizeRestraintTypeMutationRows(Array.isArray(current.rows) ? current.rows : DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS);
  configObj.inputXmlRestraintTypeMutation = { enabled: current.enabled !== false, rows };
  return configObj.inputXmlRestraintTypeMutation;
}

function _renderCleanupCard(configObj, syncJsonText, controls) {
  const card = createElement('div');
  card.style.cssText = 'background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px 16px;';
  card.innerHTML = '<h3 style="margin:0 0 10px;font-size:14px;color:#38bdf8;">🗑️ Cleanup & Drop Rules</h3>';
  controls.dropGaskNode = makeCheckbox(card, 'Drop Gasket Nodes (GASK)', configObj.dropGasketNodes !== false, (val) => {
    configObj.dropGasketNodes = val;
    configObj.dropGasketsInEnrichment = val;
    syncJsonText();
  });
  controls.dropShortNode = makeCheckbox(card, 'Drop Short Element Length Nodes', configObj.dropShortElementLengthNodes !== false, (val) => {
    configObj.dropShortElementLengthNodes = val;
    syncJsonText();
  });
  controls.shortThresholdInput = makeNumberInput(card, 'Short Element Drop Limit (mm)', configObj.shortElementLengthDropThresholdMm ?? 6, '0.1', (val) => {
    configObj.shortElementLengthDropThresholdMm = val;
    syncJsonText();
  });
  return card;
}

function _renderModelingCard(configObj, syncJsonText, controls) {
  const card = createElement('div');
  card.style.cssText = 'background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px 16px;';
  card.innerHTML = '<h3 style="margin:0 0 10px;font-size:14px;color:#38bdf8;">📏 Restraint & Modeling Defaults</h3>';
  controls.stiffnessInput = makeNumberInput(card, 'Default Stiffness', configObj.defaultStiffness ?? 1751270000000, '1000000', (val) => {
    configObj.defaultStiffness = val;
    syncJsonText();
  });
  controls.frictionInput = makeNumberInput(card, 'Default Friction', configObj.defaultFriction ?? 0.3, '0.01', (val) => {
    configObj.defaultFriction = val;
    syncJsonText();
  });
  controls.gapInput = makeNumberInput(card, 'Default Gap (mm)', configObj.defaultGap ?? 0, '0.1', (val) => {
    configObj.defaultGap = val;
    syncJsonText();
  });
  controls.SifInput = makeNumberInput(card, 'Default Tee SIF Type', configObj.defaultTeeSifType ?? 5, '1', (val) => {
    configObj.defaultTeeSifType = val;
    syncJsonText();
  });
  return card;
}

function _renderRestraintTypeMutationCard(configObj, syncJsonText, controls) {
  const cfg = ensureRestraintTypeMutationConfig(configObj);
  const card = createElement('div');
  card.style.cssText = 'background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px 16px;';
  const title = createElement('h3');
  title.style.cssText = 'margin:0 0 10px;font-size:14px;color:#38bdf8;';
  title.append(document.createTextNode('Restraint Type Mutation '));
  const info = createElement('span', 'i');
  info.title = RESTRAINT_TYPE_MUTATION_INFO;
  info.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border:1px solid #60a5fa;border-radius:50%;font-size:11px;color:#bfdbfe;cursor:help;';
  title.appendChild(info);
  card.appendChild(title);
  controls.restraintTypeMutationEnabled = makeCheckbox(card, 'Enable InputXML restraint TYPE mutation', cfg.enabled !== false, (val) => {
    cfg.enabled = val;
    syncJsonText();
  });
  const table = createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;';
  table.innerHTML = '<thead><tr><th style="text-align:left;padding:4px;color:#bfdbfe;">Label</th><th style="text-align:left;padding:4px;color:#bfdbfe;">From TYPE</th><th style="text-align:left;padding:4px;color:#bfdbfe;">To TYPE</th><th></th></tr></thead>';
  const body = createElement('tbody');
  table.appendChild(body);
  card.appendChild(table);
  const renderRows = () => {
    body.innerHTML = '';
    cfg.rows.forEach((row, index) => {
      const tr = createElement('tr');
      for (const col of ['label', 'from', 'to']) {
        const td = createElement('td');
        td.style.cssText = 'padding:4px;';
        const input = createElement('input');
        input.type = 'text';
        input.value = row[col] ?? '';
        input.style.cssText = 'width:100%;box-sizing:border-box;background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:4px;padding:4px;font-size:12px;';
        input.addEventListener('change', (event) => {
          cfg.rows[index][col] = event.target.value.trim();
          syncJsonText();
        });
        td.appendChild(input);
        tr.appendChild(td);
      }
      const action = createElement('td');
      action.style.cssText = 'padding:4px;width:1%;';
      const del = createElement('button', 'Delete');
      del.type = 'button';
      del.style.cssText = 'background:#27272a;color:#fff;border:1px solid #3f3f46;border-radius:5px;padding:4px 7px;font-size:11px;cursor:pointer;';
      del.addEventListener('click', () => {
        cfg.rows.splice(index, 1);
        renderRows();
        syncJsonText();
      });
      action.appendChild(del);
      tr.appendChild(action);
      body.appendChild(tr);
    });
  };
  renderRows();
  const add = createElement('button', 'Add row');
  add.type = 'button';
  add.style.cssText = 'margin-top:8px;background:#27272a;color:#fff;border:1px solid #3f3f46;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;';
  add.addEventListener('click', () => {
    cfg.rows.push({ label: '', from: '', to: '' });
    renderRows();
    syncJsonText();
  });
  card.appendChild(add);
  return card;
}

function _renderFlagsCard(configObj, syncJsonText, controls) {
  const card = createElement('div');
  card.style.cssText = 'background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px 16px;';
  card.innerHTML = '<h3 style="margin:0 0 10px;font-size:14px;color:#38bdf8;">🎛️ Option Toggles</h3>';
  controls.xmlMaskedNode = makeCheckbox(card, 'XML_Masked: download XML/InputXML as .txt', isXmlMaskEnabled(), (val) => {
    setXmlMaskEnabled(val);
  });
  controls.frictionSentinelNode = makeCheckbox(card, 'Use Friction Sentinel (non-Y)', configObj.useFrictionSentinelForNonYSupports !== false, (val) => {
    configObj.useFrictionSentinelForNonYSupports = val;
    syncJsonText();
  });
  controls.splitCondensedNode = makeCheckbox(card, 'Apply resolved split (Valve/Flange)', configObj.splitCondensedValveFlange !== false, (val) => {
    configObj.splitCondensedValveFlange = val;
    syncJsonText();
  });
  controls.disableSupportTagNode = makeCheckbox(card, 'Suppress CII Support tag labels', configObj.disableCiiSupportTagPopulation !== false, (val) => {
    configObj.disableCiiSupportTagPopulation = val;
    syncJsonText();
  });
  controls.convertDensityNode = makeCheckbox(card, 'Convert density kg/m3 -> kg/cm3', configObj.convertDensityKgM3ToKgCm3 !== false, (val) => {
    configObj.convertDensityKgM3ToKgCm3 = val;
    syncJsonText();
  });
  return card;
}

function _renderProcessCard(configObj, syncJsonText, controls) {
  const card = createElement('div');
  card.style.cssText = 'background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px 16px;';
  card.innerHTML = '<h3 style="margin:0 0 10px;font-size:14px;color:#38bdf8;">🗺️ Process Fallbacks (Line List)</h3>';
  if (!configObj.processDefaults || typeof configObj.processDefaults !== 'object') {
    configObj.processDefaults = { p1: '700', t1: '120', t2: '60', t3: '-5', density: '100' };
  }
  controls.p1Input = makeTextInput(card, 'Design Pressure (p1)', configObj.processDefaults.p1, (val) => {
    configObj.processDefaults.p1 = val;
    syncJsonText();
  });
  controls.t1Input = makeTextInput(card, 'Design Temperature (t1)', configObj.processDefaults.t1, (val) => {
    configObj.processDefaults.t1 = val;
    syncJsonText();
  });
  controls.t2Input = makeTextInput(card, 'Operating Temperature (t2)', configObj.processDefaults.t2, (val) => {
    configObj.processDefaults.t2 = val;
    syncJsonText();
  });
  controls.t3Input = makeTextInput(card, 'Minimum Temperature (t3)', configObj.processDefaults.t3, (val) => {
    configObj.processDefaults.t3 = val;
    syncJsonText();
  });
  controls.densityInput = makeTextInput(card, 'Fluid Density', configObj.processDefaults.density, (val) => {
    configObj.processDefaults.density = val;
    syncJsonText();
  });
  return card;
}

export function renderAdaptedConfigPanel(card, stateRef, render) {
  const state = stateRef.current;
  // configObj is always the full, authoritative config (including any large master row arrays).
  // configText is only ever the *display* text shown in the raw-JSON textarea, which summarizes
  // large row arrays via buildDisplayConfig() so the textarea stays small and fast to render.
  let configObj = {};
  try { configObj = JSON.parse(state.supportConfigJson || '{}'); } catch {}
  ensureRestraintTypeMutationConfig(configObj);
  let configText = JSON.stringify(buildDisplayConfig(configObj), null, 2);

  const statusDiv = createElement('div');
  statusDiv.style.cssText = 'padding:10px;margin-bottom:14px;border-radius:6px;font-size:12px;font-weight:bold;';

  function updateValidationStatus(text) {
    const val = validateSupportConfigJson(text);
    statusDiv.textContent = val.ok ? '✓ Support Configuration JSON is valid.' : `⚠ Invalid Configuration: ${val.error}`;
    statusDiv.style.background = val.ok ? '#065f46' : '#991b1b';
    statusDiv.style.color = '#fff';
    statusDiv.style.border = `1px solid ${val.ok ? '#059669' : '#dc2626'}`;
  }
  updateValidationStatus(configText);
  card.appendChild(statusDiv);

  const grid = createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px;margin-bottom:16px;';

  const ctrlRefs = {};

  function syncJsonText() {
    configText = JSON.stringify(buildDisplayConfig(configObj), null, 2);
    textarea.value = configText;
    updateValidationStatus(configText);
  }

  const cleanup = _renderCleanupCard(configObj, syncJsonText, ctrlRefs);
  const modeling = _renderModelingCard(configObj, syncJsonText, ctrlRefs);
  const restraintMutation = _renderRestraintTypeMutationCard(configObj, syncJsonText, ctrlRefs);
  const flags = _renderFlagsCard(configObj, syncJsonText, ctrlRefs);
  const process = _renderProcessCard(configObj, syncJsonText, ctrlRefs);

  grid.append(cleanup, modeling, restraintMutation, flags, process);
  card.appendChild(grid);

  const editorSec = createElement('details');
  editorSec.setAttribute('open', 'true');
  editorSec.appendChild(createElement('summary', 'Raw Config JSON Editor'));
  editorSec.appendChild(createElement('div', 'Large master row lists (weight/material/piping-class/line-list) are summarized here — manage them via the Import Masters tab. Save/Export always keep the full data.', 'xml-cii-phase-help'));

  const textarea = createElement('textarea');
  textarea.value = configText;
  textarea.spellcheck = false;
  textarea.style.cssText = 'width:100%;height:320px;font-family:monospace;font-size:12px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:8px;margin-top:6px;';

  textarea.addEventListener('input', (e) => {
    configText = e.target.value;
    updateValidationStatus(configText);
    try {
      configObj = mergeEditedConfig(JSON.parse(configText), configObj);
      ensureRestraintTypeMutationConfig(configObj);
      syncControls();
    } catch {}
  });
  editorSec.appendChild(textarea);
  card.appendChild(editorSec);

  const toolbar = createElement('div');
  toolbar.style.cssText = 'display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:14px;';

  const saveBtn = createElement('button', '💾 Save Config');
  saveBtn.type = 'button';
  saveBtn.style.cssText = 'background:#1d4ed8;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:12px;font-weight:bold;cursor:pointer;';
  saveBtn.addEventListener('click', () => {
    const val = validateSupportConfigJson(configText);
    if (!val.ok) { alert(`Invalid configuration JSON: ${val.error}`); return; }
    const fullConfigJson = JSON.stringify(configObj, null, 2);
    stateRef.current = { ...stateRef.current, supportConfigJson: fullConfigJson, masterContext: { ...(stateRef.current.masterContext || {}), config: configObj } };
    saveMasterContextToLocalStorage(stateRef.current.masterContext);
    render();
    if (typeof showToast === 'function') showToast('Configuration saved successfully!');
    else alert('Configuration saved!');
  });
  toolbar.appendChild(saveBtn);

  const exportBtn = createElement('button', '📥 Export JSON');
  exportBtn.type = 'button';
  exportBtn.style.cssText = 'background:#27272a;color:#fff;border:1px solid #3f3f46;border-radius:6px;padding:8px 16px;font-size:12px;font-weight:bold;cursor:pointer;';
  exportBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(configObj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `support-config-${Date.now()}.json`; a.click();
  });
  toolbar.appendChild(exportBtn);

  const importLabel = createElement('label', '📤 Import JSON');
  importLabel.style.cssText = 'background:#27272a;color:#fff;border:1px solid #3f3f46;border-radius:6px;padding:8px 16px;font-size:12px;font-weight:bold;cursor:pointer;text-align:center;';
  const importInput = createElement('input'); importInput.type = 'file'; importInput.accept = '.json'; importInput.hidden = true;
  importInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const raw = evt.target.result || '{}';
      let importedObj;
      try { importedObj = JSON.parse(raw); } catch { updateValidationStatus(raw); return; }
      configObj = mergeEditedConfig(importedObj, configObj);
      const text = JSON.stringify(buildDisplayConfig(configObj), null, 2);
      configText = text; textarea.value = text; updateValidationStatus(text);
      syncControls();
    };
    reader.readAsText(file);
  });
  importLabel.appendChild(importInput); toolbar.appendChild(importLabel);
  card.appendChild(toolbar);

  function syncControls() {
    ctrlRefs.dropGaskNode.checked = configObj.dropGasketNodes !== false;
    ctrlRefs.dropShortNode.checked = configObj.dropShortElementLengthNodes !== false;
    ctrlRefs.shortThresholdInput.value = configObj.shortElementLengthDropThresholdMm ?? 6;
    ctrlRefs.stiffnessInput.value = configObj.defaultStiffness ?? 1751270000000;
    ctrlRefs.frictionInput.value = configObj.defaultFriction ?? 0.3;
    ctrlRefs.gapInput.value = configObj.defaultGap ?? 0;
    ctrlRefs.SifInput.value = configObj.defaultTeeSifType ?? 5;
    ctrlRefs.frictionSentinelNode.checked = configObj.useFrictionSentinelForNonYSupports !== false;
    ctrlRefs.splitCondensedNode.checked = configObj.splitCondensedValveFlange !== false;
    ctrlRefs.disableSupportTagNode.checked = configObj.disableCiiSupportTagPopulation !== false;
    ctrlRefs.convertDensityNode.checked = configObj.convertDensityKgM3ToKgCm3 !== false;
    if (ctrlRefs.xmlMaskedNode) ctrlRefs.xmlMaskedNode.checked = isXmlMaskEnabled();
    if (ctrlRefs.restraintTypeMutationEnabled) {
      ctrlRefs.restraintTypeMutationEnabled.checked = ensureRestraintTypeMutationConfig(configObj).enabled !== false;
    }
    if (configObj.processDefaults && typeof configObj.processDefaults === 'object') {
      ctrlRefs.p1Input.value = configObj.processDefaults.p1 ?? '';
      ctrlRefs.t1Input.value = configObj.processDefaults.t1 ?? '';
      ctrlRefs.t2Input.value = configObj.processDefaults.t2 ?? '';
      ctrlRefs.t3Input.value = configObj.processDefaults.t3 ?? '';
      ctrlRefs.densityInput.value = configObj.processDefaults.density ?? '';
    }
  }
}
