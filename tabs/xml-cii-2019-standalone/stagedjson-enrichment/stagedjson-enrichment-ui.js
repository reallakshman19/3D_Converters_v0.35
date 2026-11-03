/**
 * Functionality: renders the element-aware stagedJson enrichment workflow.
 * Parameters: host element. Outputs: import, preview, enrich, and export interactions.
 */

import { downloadTextFile } from '../ui-adapted/xml-cii-adapted-dom.js';
import { DEFAULT_VISIBLE_STAGEDJSON_CONFIG, parseVisibleStagedJsonConfig } from './stagedjson-enrichment-contract.js';
import { enrichStagedJson } from './stagedjson-enrichment-engine.js?v=20260718-envelope-v1';
import { readStagedJsonFile, readStagedJsonMasterFile } from './stagedjson-file-parser.js';
import { DEFAULT_MATERIAL_MAP_ROWS } from '../../../converters/xml-cii2019-core/default-material-map-rows.js';
import { DEFAULT_WEIGHT_MASTER_ROWS } from '../../../converters/xml-cii2019-core/default-weight-master-rows.js';

const MASTER_DEFS = Object.freeze([
  { key: 'lineList', label: 'Master line list' },
  { key: 'pipingClass', label: 'Piping class / thickness' },
  { key: 'materialMap', label: 'Material map' },
  { key: 'weight', label: 'Component weight master' },
]);

export function renderStagedJsonEnrichmentPanel(host, options = {}) {
  ensureStylesheet();
  const state = createState();
  state.options = options;
  const container = element('div', 'sjp-container');
  host.appendChild(container);
  const render = () => renderBody(container, state, render);
  render();
  
  // Async restore from IndexedDB
  restoreState(state, render);
  
  return () => container.remove();
}

function createState() {
  return {
    stagedJson: null,
    sourceFileName: '',
    masters: { 
      lineList: [], 
      pipingClass: [], 
      materialMap: DEFAULT_MATERIAL_MAP_ROWS || [], 
      weight: DEFAULT_WEIGHT_MASTER_ROWS || [], 
      files: {
        materialMap: 'built-in defaults',
        weight: 'built-in defaults'
      } 
    },
    configText: JSON.stringify(DEFAULT_VISIBLE_STAGEDJSON_CONFIG, null, 2),
    result: null,
    completed: false,
    status: 'Ready: Import stagedJson and explicit master files to begin.',
    error: false,
  };
}

// ----------------------------------------------------------------------------
// Local Storage / IndexedDB Persistence
// ----------------------------------------------------------------------------
function idbDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('stagedjson-properties-db', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('store');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function idbGet(key) {
  try {
    const db = await idbDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction('store', 'readonly').objectStore('store').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) { console.error('IDB Get Failed', err); return null; }
}
async function idbSet(key, value) {
  try {
    const db = await idbDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction('store', 'readwrite').objectStore('store').put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) { console.error('IDB Set Failed', err); }
}

async function restoreState(state, render) {
  state.status = 'Restoring local data...';
  render();
  try {
    const saved = await idbGet('sjp-state');
    if (saved) {
      if (saved.stagedJson) state.stagedJson = saved.stagedJson;
      if (saved.sourceFileName) state.sourceFileName = saved.sourceFileName;
      if (saved.configText) state.configText = saved.configText;
      if (saved.masters) {
        if (saved.masters.lineList) state.masters.lineList = saved.masters.lineList;
        if (saved.masters.pipingClass) state.masters.pipingClass = saved.masters.pipingClass;
        if (saved.masters.materialMap && saved.masters.materialMap.length > 0) state.masters.materialMap = saved.masters.materialMap;
        if (saved.masters.weight && saved.masters.weight.length > 0) state.masters.weight = saved.masters.weight;
        if (saved.masters.files) state.masters.files = { ...state.masters.files, ...saved.masters.files };
      }
      state.status = 'Restored data from local storage.';
    } else {
      state.status = 'Ready: Import stagedJson and explicit master files to begin.';
    }
  } catch (err) {
    state.status = 'Ready. (Local storage empty or unavailable).';
  }
  render();
}

async function persistState(state) {
  await idbSet('sjp-state', {
    stagedJson: state.stagedJson,
    sourceFileName: state.sourceFileName,
    masters: state.masters,
    configText: state.configText
  });
}

// ----------------------------------------------------------------------------
// Rendering
// ----------------------------------------------------------------------------
function renderBody(container, state, render) {
  container.replaceChildren();
  
  const header = element('header', 'sjp-header');
  header.append(element('h2', '', 'stagedJson -> CII(2019) Attribute Enrichment'));
  header.append(element('p', 'sjp-subtitle', 'Resolve element contexts through reusable Standalone master/resolver modules.'));
  
  container.append(header, statusBanner(state), buildDashboard(state, render), resultView(state, render));
}

function statusBanner(state) {
  const readiness = resolverReadiness(state);
  let statusText = state.status;
  let statusClass = 'sjp-status';
  
  if (state.error) {
    statusClass += ' is-error';
  } else if (state.completed) {
    statusClass += ' is-success';
  } else if (!readiness.canResolve) {
    statusClass += ' is-warning';
    if (readiness.missing.length > 0) {
      statusText = `Waiting for inputs: ${readiness.missing.join(', ')}`;
    }
  } else if (!state.result) {
    statusClass += ' is-ready';
    if (statusText.startsWith('Ready') || statusText.startsWith('Restored')) {
      statusText = 'All inputs loaded. Ready to resolve or enrich.';
    }
  }

  const banner = element('div', statusClass);
  banner.append(element('span', 'sjp-status-icon', state.error ? '⚠️' : state.completed ? '✅' : readiness.canResolve ? '🚀' : '⏳'));
  banner.append(element('span', 'sjp-status-text', statusText));
  return banner;
}

function buildDashboard(state, render) {
  const grid = element('div', 'sjp-grid');
  grid.append(inputsColumn(state, render), actionsColumn(state, render));
  return grid;
}

function inputsColumn(state, render) {
  const col = element('div', 'sjp-col');
  
  // Source
  const sourceCard = element('section', 'sjp-card');
  sourceCard.append(element('h3', 'sjp-card-title', '1. Source Data'));
  const input = fileInput('.json');
  input.addEventListener('change', (event) => loadSource(event, state, render));
  sourceCard.append(fieldRow('Managed stagedJson', input, state.sourceFileName || 'No file chosen'));
  
  // Masters
  const mastersCard = element('section', 'sjp-card');
  mastersCard.append(element('h3', 'sjp-card-title', '2. Master Files'));
  MASTER_DEFS.forEach((def) => {
    const minput = fileInput('.csv,.tsv,.json,.xlsx,.xls,.ods');
    minput.dataset.masterKind = def.key;
    minput.addEventListener('change', (event) => loadMaster(event, state, render));
    const loadedCount = state.masters[def.key].length;
    const fileName = state.masters.files[def.key] || '';
    const statusText = loadedCount ? `${loadedCount} rows${fileName ? ` (${fileName})` : ''}` : 'Not loaded';
    mastersCard.append(fieldRow(def.label, minput, statusText));
  });

  // Config
  const configCard = element('section', 'sjp-card');
  configCard.append(element('h3', 'sjp-card-title', '3. Resolver Configuration'));
  configCard.append(buildConfigForm(state));

  col.append(sourceCard, mastersCard, configCard);
  return col;
}

function buildConfigForm(state) {
  const container = element('div', 'sjp-config-form');
  let config;
  try {
    config = JSON.parse(state.configText);
  } catch (err) {
    config = {};
  }

  const saveConfig = () => {
    state.configText = JSON.stringify(config, null, 2);
    persistState(state);
  };

  const createRow = (label, inputElement) => {
    const row = element('div', 'sjp-form-row');
    row.style.marginBottom = '10px';
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    const lbl = element('label', 'sjp-form-label', label);
    lbl.style.fontSize = '12px';
    lbl.style.marginBottom = '4px';
    lbl.style.color = '#a3a3a3';
    inputElement.style.padding = '6px';
    inputElement.style.background = '#1a1a1a';
    inputElement.style.border = '1px solid #333';
    inputElement.style.color = '#fff';
    inputElement.style.borderRadius = '4px';
    inputElement.style.fontFamily = 'monospace';
    row.append(lbl, inputElement);
    return row;
  };

  const lineKeyInput = element('input');
  lineKeyInput.type = 'text';
  lineKeyInput.value = (config.lineKeyAttributeNames || []).join(', ');
  lineKeyInput.addEventListener('input', (e) => {
    config.lineKeyAttributeNames = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    saveConfig();
  });

  const branchInput = element('input');
  branchInput.type = 'text';
  branchInput.value = (config.branchAttributeNames || []).join(', ');
  branchInput.addEventListener('input', (e) => {
    config.branchAttributeNames = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    saveConfig();
  });

  const containedWrap = element('label');
  containedWrap.style.display = 'flex';
  containedWrap.style.alignItems = 'center';
  containedWrap.style.fontSize = '13px';
  containedWrap.style.marginTop = '10px';
  const containedInput = element('input');
  containedInput.type = 'checkbox';
  containedInput.style.marginRight = '8px';
  containedInput.checked = config.allowContainedLineKey === true;
  containedInput.addEventListener('change', (e) => {
    config.allowContainedLineKey = e.target.checked;
    saveConfig();
  });
  containedWrap.append(containedInput, 'Allow Substring Match for Line Key');

  const weightRow = element('div');
  weightRow.style.display = 'flex';
  weightRow.style.gap = '10px';
  weightRow.style.marginTop = '10px';

  const wMinInput = element('input');
  wMinInput.type = 'number';
  wMinInput.min = '0';
  wMinInput.max = '100';
  wMinInput.value = config.weightMinimumScore ?? 75;
  wMinInput.addEventListener('input', (e) => {
    config.weightMinimumScore = Number(e.target.value);
    saveConfig();
  });

  const wDeltaInput = element('input');
  wDeltaInput.type = 'number';
  wDeltaInput.min = '0';
  wDeltaInput.value = config.weightAmbiguityDelta ?? 1;
  wDeltaInput.addEventListener('input', (e) => {
    config.weightAmbiguityDelta = Number(e.target.value);
    saveConfig();
  });
  weightRow.append(createRow('Weight Min Score (0-100)', wMinInput), createRow('Weight Ambiguity Delta', wDeltaInput));

  const classRow = element('div');
  classRow.style.display = 'flex';
  classRow.style.gap = '10px';
  classRow.style.marginTop = '10px';

  const delimInput = element('input');
  delimInput.type = 'text';
  delimInput.value = config.linelist?.tokenDelimiter || '-';
  delimInput.style.width = '100px';
  delimInput.addEventListener('input', (e) => {
    if (!config.linelist) config.linelist = {};
    config.linelist.tokenDelimiter = e.target.value;
    saveConfig();
  });

  const boreTolInput = element('input');
  boreTolInput.type = 'number';
  boreTolInput.step = '0.1';
  boreTolInput.value = config.pipingClassMatch?.rowScoring?.boreToleranceMm ?? 1.0;
  boreTolInput.addEventListener('input', (e) => {
    if (!config.pipingClassMatch) config.pipingClassMatch = {};
    if (!config.pipingClassMatch.rowScoring) config.pipingClassMatch.rowScoring = {};
    config.pipingClassMatch.rowScoring.boreToleranceMm = Number(e.target.value);
    saveConfig();
  });

  const minRatioInput = element('input');
  minRatioInput.type = 'number';
  minRatioInput.step = '0.01';
  minRatioInput.max = '1.0';
  minRatioInput.min = '0';
  minRatioInput.value = config.pipingClassMatch?.fuzzyMinRatio ?? 0.6;
  minRatioInput.addEventListener('input', (e) => {
    if (!config.pipingClassMatch) config.pipingClassMatch = {};
    config.pipingClassMatch.fuzzyMinRatio = Number(e.target.value);
    saveConfig();
  });
  
  classRow.append(createRow('Branch Delimiter', delimInput), createRow('Fuzzy Min Ratio', minRatioInput), createRow('Bore Tolerance (mm)', boreTolInput));

  container.append(
    createRow('Line Key Attributes (comma separated)', lineKeyInput),
    createRow('Branch Attributes (comma separated)', branchInput),
    classRow,
    weightRow,
    containedWrap
  );

  return container;
}

function actionsColumn(state, render) {
  const col = element('div', 'sjp-col');
  const readiness = resolverReadiness(state);
  const canRun = readiness.canResolve;
  const canExport = state.completed;

  const runCard = element('section', 'sjp-card sjp-card-actions');
  runCard.append(element('h3', 'sjp-card-title', '4. Execution'));
  
  const resolveBtn = action('Preview Resolution Map', !canRun, () => previewResolverMap(state, render));
  const enrichBtn = action('Run Enrichment', !canRun, () => runEnrichment(state, render));
  resolveBtn.className = 'sjp-btn sjp-btn-secondary';
  enrichBtn.className = 'sjp-btn sjp-btn-primary';
  
  const runGroup = element('div', 'sjp-action-group');
  runGroup.append(resolveBtn, enrichBtn);
  runCard.append(runGroup);
  
  const exportCard = element('section', 'sjp-card sjp-card-actions');
  exportCard.append(element('h3', 'sjp-card-title', '5. Export Artifacts'));
  
  const exportStageBtn = action('Export Enriched stagedJson', !canExport, () => exportArtifact('stage', state));
  const exportAuditBtn = action('Export Audit JSON', !canExport, () => exportArtifact('audit', state));
  const exportCsvBtn = action('Export Unresolved CSV', !canExport, () => exportArtifact('csv', state));
  
  const exportGroup = element('div', 'sjp-action-group sjp-vertical');
  exportGroup.append(exportStageBtn, exportAuditBtn, exportCsvBtn);
  
  if (state.options?.onApplyToWorkspace) {
    const applyBtn = action('Apply to Workspace 🚀', !canExport, () => {
      let payload = state.result.enrichedStagedJson;
      state.options.onApplyToWorkspace(payload);
    });
    applyBtn.className = 'sjp-btn sjp-btn-primary';
    applyBtn.style.marginTop = '10px';
    exportGroup.append(applyBtn);
  }
  
  exportCard.append(exportGroup);

  col.append(runCard, exportCard);
  return col;
}

function fieldRow(label, input, status) {
  const row = element('label', 'sjp-field');
  row.append(element('span', 'sjp-field-label', label), input, element('span', 'sjp-field-status', status));
  return row;
}

function action(label, disabled, handler) {
  const button = element('button', 'sjp-btn', label);
  button.type = 'button'; 
  button.disabled = disabled; 
  button.addEventListener('click', handler);
  return button;
}

function resultView(state, render) {
  const wrapper = element('section', 'sjp-card sjp-result-view');
  
  const headerRow = element('div', 'sjp-result-header');
  headerRow.style.display = 'flex';
  headerRow.style.justifyContent = 'space-between';
  headerRow.style.alignItems = 'center';
  headerRow.append(element('h3', 'sjp-card-title', 'Resolution Preview & Audit'));
  
  if (state.result && (state.result.audit.summary.totalMissing > 0 || state.result.audit.summary.totalPartial > 0 || state.result.audit.summary.totalConflicts > 0)) {
     const overrideBtn = element('button', 'sjp-btn sjp-btn-secondary', '🔧 Resolve Missing Data');
     overrideBtn.onclick = () => renderOverridesPopup(state, render);
     headerRow.append(overrideBtn);
  }
  
  wrapper.append(headerRow);
  
  if (!state.result) { 
    wrapper.append(element('p', 'sjp-note', 'Run a preview or enrichment to see results here.')); 
    return wrapper; 
  }
  wrapper.append(summaryBoxes(state.result.audit.summary), previewTable(state.result.previewRows));
  return wrapper;
}

function summaryBoxes(summary) {
  const container = element('div', 'sjp-summary-grid');
  const stats = [
    { label: 'Scanned', value: summary.totalNodesComponentsScanned },
    { label: 'Resolved', value: summary.totalEnriched },
    { label: 'Partial', value: summary.totalPartial },
    { label: 'Missing', value: summary.totalMissing },
    { label: 'Conflicts', value: summary.totalConflicts },
  ];
  stats.forEach(stat => {
    const box = element('div', 'sjp-stat-box');
    box.append(element('div', 'sjp-stat-val', stat.value));
    box.append(element('div', 'sjp-stat-label', stat.label));
    container.append(box);
  });
  return container;
}

function previewTable(rows) {
  const wrap = element('div', 'sjp-table-wrap');
  wrap.style.overflowX = 'auto';
  
  const infoBar = element('div', 'sjp-info-bar');
  infoBar.style.padding = '10px';
  infoBar.style.background = '#1a1a1a';
  infoBar.style.fontSize = '12px';
  infoBar.style.borderBottom = '1px solid #333';
  infoBar.style.color = '#a3a3a3';
  infoBar.innerHTML = `<strong>ℹ️ Physics Defaults & Calculations:</strong><br/>
    • <strong>OD</strong>: Uses ASME default if missing from Piping Class.<br/>
    • <strong>Wall Thickness</strong>: Uses standard STD schedule wall if missing or zero in Piping Class.<br/>
    • <strong>Material Density</strong>: CS/LT -> 7850 kg/m³, SS/DSS -> 8050 kg/m³.<br/>
    • <strong>Operating Density</strong>: Defaulted to 1000 kg/m³ for Liquid ('L') Phase, else 300 kg/m³.<br/>
    • <strong>Hydro Density</strong>: Water (1000 kg/m³) for bores <=16". For >16", uses Test Medium or Operating Density.`;
  wrap.append(infoBar);

  const table = element('table', 'sjp-table');
  const head = element('thead');
  const header = element('tr');
  ['Path', 'Type', 'Line', 'Class', 'Bore', 'OD', 'WT', 'Mat', 'PipeWt', 'OpeDens', 'HydDens', 'InsThk', 'Status', 'Missing'].forEach(label => header.append(element('th', '', label)));
  head.append(header); 
  table.append(head);
  
  const body = element('tbody');
  rows.slice(0, 200).forEach(row => {
    const tr = element('tr');
    [
      row.path, row.type, row.lineNo, row.pipingClass, 
      row.boreMm, row.pipeOdMm, row.wallThicknessMm, row.material,
      row.pipeWeightKgPerM, row.fluidDensityOpeKgM3, row.fluidDensityHydKgM3, row.insulationThicknessMm,
      row.status, row.missing.join(', ')
    ].forEach(value => {
      const td = element('td', '', value ?? 'null');
      td.title = value ?? 'null';
      tr.append(td);
    });
    body.append(tr);
  });
  
  table.append(body); 
  wrap.append(table); 
  return wrap;
}

async function loadSource(event, state, render) {
  try { 
    const result = await readStagedJsonFile(event.target.files?.[0]); 
    state.stagedJson = result.parsed; 
    state.sourceFileName = result.fileName; 
    state.error = false;
    state.status = `Loaded source: ${result.fileName}`;
    await persistState(state);
  } catch (error) { 
    state.error = true;
    state.status = error instanceof Error ? error.message : String(error); 
  }
  render();
}

async function loadMaster(event, state, render) {
  try { 
    const key = event.target.dataset.masterKind; 
    const result = await readStagedJsonMasterFile(event.target.files?.[0], key); 
    state.masters = { ...state.masters, [key]: result.rows, files: { ...state.masters.files, [key]: result.fileName } }; 
    state.error = false;
    state.status = `Loaded master: ${result.fileName} (${result.rows.length} rows)`;
    await persistState(state);
  } catch (error) { 
    state.error = true;
    state.status = error instanceof Error ? error.message : String(error); 
  }
  render();
}

async function previewResolverMap(state, render) {
  state.status = 'Processing... Please wait.';
  state.error = false;
  render();
  
  // yield to browser so it can repaint the status message
  await new Promise(r => setTimeout(r, 20));

  try {
    state.result = buildResolutionResult(state, 'preview resolver map');
    state.completed = false;
    state.error = false;
    state.status = 'Resolution preview complete; no output has been committed.';
  } catch (error) {
    state.completed = false;
    state.error = true;
    state.status = error instanceof Error ? error.message : String(error);
  }
  render();
}

async function runEnrichment(state, render) {
  state.status = 'Processing Enrichment... Please wait.';
  state.error = false;
  render();
  
  // yield to browser so it can repaint the status message
  await new Promise(r => setTimeout(r, 20));

  try {
    state.result = buildResolutionResult(state, 'run enrichment');
    state.completed = true;
    state.error = false;
    state.status = 'Enrichment complete. Artifacts are ready for export.';
  } catch (error) {
    state.completed = false;
    state.error = true;
    state.status = error instanceof Error ? error.message : String(error);
  }
  render();
}

function buildResolutionResult(state, actionLabel) {
  const readiness = resolverReadiness(state);
  if (!readiness.canResolve) throw new Error(`Cannot ${actionLabel} until loaded: ${readiness.missing.join(', ')}.`);
  
  const config = parseVisibleStagedJsonConfig(state.configText);
  return enrichStagedJson({
    stagedJson: state.stagedJson,
    masters: state.masters,
    config,
    sourceFileName: state.sourceFileName,
    evaluatedAt: new Date().toISOString(),
  });
}

function resolverReadiness(state) {
  const missing = [];
  if (!state.stagedJson) missing.push('Managed stagedJson source');
  MASTER_DEFS.forEach((def) => {
    if (!state.masters[def.key].length) missing.push(def.label);
  });
  return { canResolve: missing.length === 0, missing };
}

function exportArtifact(kind, state) {
  const stem = safeStem(state.sourceFileName || 'stagedjson');
  if (kind === 'stage') {
    let payload = state.result.enrichedStagedJson;
    downloadTextFile(`${stem}_enriched_stage.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  }
  if (kind === 'audit') downloadTextFile(`${stem}_enrichment_audit.json`, JSON.stringify(state.result.audit, null, 2), 'application/json;charset=utf-8');
  if (kind === 'csv') downloadTextFile(`${stem}_unresolved.csv`, state.result.unresolvedCsv, 'text/csv;charset=utf-8');
}

function fileInput(accept) { const input = element('input'); input.type = 'file'; input.accept = accept; return input; }
function safeStem(value) { return String(value).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_.-]+/g, '_') || 'stagedjson'; }
function element(tag, className = '', text = '') { 
  const node = document.createElement(tag); 
  if (className) node.className = className; 
  if (text !== '') node.textContent = String(text); 
  return node; 
}
function ensureStylesheet() { 
  if (!document.querySelector('link[data-sjp-style]')) {
    const link = document.createElement('link'); 
    link.rel = 'stylesheet'; 
    link.href = './tabs/xml-cii-2019-standalone/stagedjson-enrichment/stagedjson-enrichment-ui.css?v=20260711-sjp-2'; 
    link.dataset.sjpStyle = 'true'; 
    document.head.appendChild(link); 
  }
  
  if (!document.querySelector('style[data-sjp-modal]')) {
    const style = document.createElement('style');
    style.dataset.sjpModal = 'true';
    style.textContent = `
      .sjp-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px; }
      .sjp-modal { background: #1e1e1e; border: 1px solid #444; border-radius: 8px; width: 100%; max-width: 1100px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
      .sjp-modal-header { padding: 15px 20px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; }
      .sjp-modal-header h2 { margin: 0; font-size: 16px; color: #fff; }
      .sjp-modal-body { padding: 20px; overflow-y: auto; flex: 1; }
      .sjp-modal-footer { padding: 15px 20px; border-top: 1px solid #333; display: flex; justify-content: flex-end; background: #161616; border-radius: 0 0 8px 8px; }
      .sjp-override-section { margin-bottom: 30px; }
      .sjp-override-section h3 { margin: 0 0 10px 0; font-size: 14px; color: #60a5fa; }
      .sjp-override-table { width: 100%; text-align: left; border-collapse: collapse; font-size: 12px; }
      .sjp-override-table th { background: #262626; padding: 8px; border-bottom: 2px solid #444; color: #a3a3a3; font-weight: 500; }
      .sjp-override-table td { padding: 6px 8px; border-bottom: 1px solid #333; vertical-align: middle; }
      .sjp-override-input { width: 100px; background: #111; border: 1px solid #444; color: #fff; padding: 4px; border-radius: 4px; font-family: monospace; }
      .sjp-override-input:focus { border-color: #3b82f6; outline: none; }
      .sjp-truncate { max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    `;
    document.head.appendChild(style);
  }
}

function extractMissingGroups(state) {
  const missingLines = new Map();
  const missingClasses = new Map();
  
  if (!state.result?.previewRows) return { missingLines: [], missingClasses: [] };
  
  state.result.previewRows.forEach(row => {
    if (row.status !== 'missing' && row.status !== 'partial' && row.status !== 'conflict') return;
    
    const needsProcessData = row.missing.some(m => m.includes('fluid') || m.includes('insulation') || m.includes('lineNo') || m.includes('Pressure') || m.includes('Temperature') || m.includes('Phase') || m.includes('Service'));
    if (needsProcessData) {
      const lineKey = row.lineNo || row.branchName || 'UnknownLine';
      if (!missingLines.has(lineKey)) missingLines.set(lineKey, { key: lineKey, count: 0 });
      missingLines.get(lineKey).count++;
    }
    
    const needsClassData = row.missing.some(m => m.includes('wall') || m.includes('corrosion') || m.includes('material') || m.includes('componentWeight') || m.includes('pipingClass'));
    if (needsClassData) {
      const classKey = row.pipingClass || 'UnknownClass';
      const sizeKey = row.boreMm ?? 'UnknownSize';
      const mapKey = classKey + '|' + sizeKey;
      if (!missingClasses.has(mapKey)) missingClasses.set(mapKey, { classKey, sizeKey, count: 0 });
      missingClasses.get(mapKey).count++;
    }
  });
  
  return { 
    missingLines: [...missingLines.values()].sort((a,b) => b.count - a.count), 
    missingClasses: [...missingClasses.values()].sort((a,b) => b.count - a.count)
  };
}

function updateOverride(config, bucket, key, field, value, asText=false) {
  if (!config.overrides) config.overrides = {};
  if (!config.overrides[bucket]) config.overrides[bucket] = {};
  
  const val = value === '' ? null : (asText ? value : (isNaN(Number(value)) ? value : Number(value)));
  
  if (field) {
     if (!config.overrides[bucket][key]) config.overrides[bucket][key] = {};
     config.overrides[bucket][key][field] = val;
  } else {
     config.overrides[bucket][key] = val;
  }
}

function renderOverridesPopup(state, render) {
  const overlay = element('div', 'sjp-modal-overlay');
  const modal = element('div', 'sjp-modal');
  
  const header = element('div', 'sjp-modal-header');
  header.append(element('h2', '', 'Bulk Overrides & Manual Inputs'));
  const closeBtn = element('button', 'sjp-btn', '✕');
  closeBtn.style.padding = '4px 8px';
  closeBtn.onclick = () => overlay.remove();
  header.append(closeBtn);
  
  const body = element('div', 'sjp-modal-body');
  const { missingLines, missingClasses } = extractMissingGroups(state);
  
  let config;
  try { config = JSON.parse(state.configText); } catch { config = {}; }
  if (!config.overrides) config.overrides = {};
  if (!config.overrides.processData) config.overrides.processData = {};
  
  if (missingLines.length === 0 && missingClasses.length === 0) {
    body.append(element('p', 'sjp-note', 'No missing or conflicting elements found!'));
  }
  
  const createOverrideInput = (value, type='number') => {
    const inp = element('input', 'sjp-override-input');
    inp.type = type;
    if (value != null) inp.value = value;
    return inp;
  };
  
  if (missingLines.length > 0) {
    const lineSec = element('div', 'sjp-override-section');
    lineSec.append(element('h3', '', 'Unresolved Lines (Missing Process Data)'));
    const table = element('table', 'sjp-table sjp-override-table');
    const trH = element('tr');
    ['Line Key / Branch Hint', 'Components', 'Ope Dens (kg/m³)', 'Hyd Dens (kg/m³)', 'Ins Thk (mm)', 'Ins Dens (kg/m³)'].forEach(th => trH.append(element('th', '', th)));
    table.append(trH);
    
    missingLines.forEach(item => {
      const tr = element('tr');
      const data = config.overrides.processData[item.key] || {};
      
      const keyTd = element('td');
      keyTd.append(element('div', 'sjp-truncate', item.key));
      keyTd.title = item.key;
      tr.append(keyTd, element('td', '', String(item.count)));
      
      const inOpe = createOverrideInput(data.fluidDensityOpeKgM3);
      inOpe.onchange = () => updateOverride(config, 'processData', item.key, 'fluidDensityOpeKgM3', inOpe.value);
      const tdOpe = element('td'); tdOpe.append(inOpe); tr.append(tdOpe);
      
      const inHyd = createOverrideInput(data.fluidDensityHydKgM3);
      inHyd.onchange = () => updateOverride(config, 'processData', item.key, 'fluidDensityHydKgM3', inHyd.value);
      const tdHyd = element('td'); tdHyd.append(inHyd); tr.append(tdHyd);
      
      const inInsThk = createOverrideInput(data.insulationThicknessMm);
      inInsThk.onchange = () => updateOverride(config, 'processData', item.key, 'insulationThicknessMm', inInsThk.value);
      const tdInsThk = element('td'); tdInsThk.append(inInsThk); tr.append(tdInsThk);
      
      const inInsDens = createOverrideInput(data.insulationDensityKgM3);
      inInsDens.onchange = () => updateOverride(config, 'processData', item.key, 'insulationDensityKgM3', inInsDens.value);
      const tdInsDens = element('td'); tdInsDens.append(inInsDens); tr.append(tdInsDens);
      
      table.append(tr);
    });
    lineSec.append(table);
    body.append(lineSec);
  }
  
  if (missingClasses.length > 0) {
    const classSec = element('div', 'sjp-override-section');
    classSec.append(element('h3', '', 'Unresolved Piping Classes (Missing Specs)'));
    const table = element('table', 'sjp-table sjp-override-table');
    const trH = element('tr');
    ['Piping Class', 'Nominal Size', 'Components', 'Material Code', 'Wall Thk (mm)', 'Corr Allow (mm)'].forEach(th => trH.append(element('th', '', th)));
    table.append(trH);
    
    missingClasses.forEach(item => {
       const tr = element('tr');
       const numSize = Number(item.sizeKey);
       const xmlKey = isNaN(numSize) ? item.classKey : `PC:${item.classKey.toUpperCase().replace(/\s+/g, '')}|DN:${Math.round(numSize)}`;
       const dataWall = config.overrides.wallThickness?.[xmlKey] || config.overrides.wallThickness?.[item.classKey] || '';
       const dataCorr = config.overrides.corrosion?.[xmlKey] || config.overrides.corrosion?.[item.classKey] || '';
       const dataMat = config.overrides.materialCode?.[xmlKey] || config.overrides.materialCode?.[item.classKey] || '';
       
       tr.append(element('td', '', item.classKey), element('td', '', String(item.sizeKey)), element('td', '', String(item.count)));
       
       const inMat = createOverrideInput(dataMat, 'text');
       inMat.onchange = () => updateOverride(config, 'materialCode', xmlKey, null, inMat.value, true);
       const tdMat = element('td'); tdMat.append(inMat); tr.append(tdMat);
       
       const inWall = createOverrideInput(dataWall);
       inWall.onchange = () => updateOverride(config, 'wallThickness', xmlKey, null, inWall.value);
       const tdWall = element('td'); tdWall.append(inWall); tr.append(tdWall);
       
       const inCorr = createOverrideInput(dataCorr);
       inCorr.onchange = () => updateOverride(config, 'corrosion', xmlKey, null, inCorr.value);
       const tdCorr = element('td'); tdCorr.append(inCorr); tr.append(tdCorr);
       
       table.append(tr);
    });
    classSec.append(table);
    body.append(classSec);
  }
  
  const footer = element('div', 'sjp-modal-footer');
  const applyBtn = element('button', 'sjp-btn sjp-btn-primary', 'Apply Overrides & Re-Run Enrichment');
  applyBtn.onclick = () => {
    state.configText = JSON.stringify(config, null, 2);
    persistState(state);
    overlay.remove();
    runEnrichment(state, render);
  };
  footer.append(applyBtn);
  
  modal.append(header, body, footer);
  overlay.append(modal);
  document.body.appendChild(overlay);
}
