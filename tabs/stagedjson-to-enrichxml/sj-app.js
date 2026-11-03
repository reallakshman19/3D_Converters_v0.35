/**
 * Functionality: main app controller. Manages state, renders the
 * bulk-mode UI, orchestrates file import and enrichment pipeline,
 * triggers popups and exports.
 * Parameters: none (mounts to #sj-app). Outputs: DOM. No shared modules.
 */

import { runEnrichment } from './sj-enrichment-engine.js';
import { loadConfig, saveConfig, renderConfigForm } from './sj-config.js';
import { openBranchPopup } from './sj-branch-popup.js';
import { openOverrideMatrix } from './sj-override-ui.js';
import { downloadXml, downloadAudit, downloadTraceCsv, safeStem } from './sj-export.js';
import { parseStagedJson, tallyByType } from './sj-parser.js?v=2';
import { buildAuditTablePanel } from './sj-audit-table.js';
import { build3dViewerPanel } from './sj-3d-viewer.js?v=20260718-explicit-geometry-v2';
import { renderStagedJsonEnrichmentPanel } from '../xml-cii-2019-standalone/stagedjson-enrichment/stagedjson-enrichment-ui.js?v=20260718-envelope-v1';

// ─── App State ───────────────────────────────────────────────────

const state = {
  file: null,
  fileName: '',
  stagedJsonText: '',
  config: loadConfig(),
  result: null,
  status: 'idle',
  error: '',
  configExpanded: false,
  activeRightTab: 'trace',
  hostId: 'sj-app',
};

// ─── Mount ───────────────────────────────────────────────────────

export function mountApp(hostId = 'sj-app') {
  state.hostId = hostId;
  const host = document.getElementById(hostId);
  if (!host) return;
  host.innerHTML = '';
  renderApp(host);
}

function renderApp(host) {
  host.innerHTML = '';

  // ── Two-panel shell ───────────────────────────────────────────
  const shell = el('div', 'sj-split-shell');

  // Left: controls
  const left = el('div', 'sj-split-left');
  left.appendChild(buildHeader());
  left.appendChild(buildDropZone());
  if (state.stagedJsonText) left.appendChild(buildTally());
  if (state.result)         left.appendChild(buildSummary());
  left.appendChild(buildConfigSection());
  left.appendChild(buildActionBar());
  if (state.result)         left.appendChild(buildExportBar());
  if (state.error)          left.appendChild(buildError());

  // Right: tabbed viewer panel
  const right = el('div', 'sj-split-right sj-right-panel-wrapper');

  const tabHeader = el('div', 'sj-tab-header');
  
  const tabTrace = el('button', 'sj-tab-btn', '📑 Node Wise Trace');
  if (state.activeRightTab === 'trace') tabTrace.className += ' sj-tab-active';
  tabTrace.onclick = () => { state.activeRightTab = 'trace'; rerender(); };

  const tab3d = el('button', 'sj-tab-btn', '🌐 Pipeline 3D Model');
  if (state.activeRightTab === '3d') tab3d.className += ' sj-tab-active';
  tab3d.onclick = () => { state.activeRightTab = '3d'; rerender(); };

  tabHeader.append(tabTrace, tab3d);
  right.appendChild(tabHeader);

  const tabContent = el('div', 'sj-tab-content');
  tabContent.style.flex = '1';
  tabContent.style.overflow = 'hidden';
  tabContent.style.display = 'flex';
  tabContent.style.flexDirection = 'column';

  if (state.activeRightTab === '3d') {
    tabContent.appendChild(build3dViewerPanel(state.result?.records ?? []));
  } else {
    tabContent.appendChild(buildAuditTablePanel(state.result?.audit ?? null, state.result?.records ?? []));
  }
  right.appendChild(tabContent);

  shell.append(left, right);
  host.appendChild(shell);
}

function rerender() { renderApp(document.getElementById(state.hostId)); }

// ─── Header ──────────────────────────────────────────────────────

function buildHeader() {
  const h = el('header', 'sj-header');
  h.appendChild(el('h1', 'sj-title', '⚙ StagedJSON → Enriched XML'));
  h.appendChild(el('p', 'sj-subtitle',
    'Zero-touch enrichment: rating, wall, weight, restraints auto-resolved from DTXR + SPRE.'));
  return h;
}

// ─── Drop zone ───────────────────────────────────────────────────

function buildDropZone() {
  const zone = el('div', 'sj-dropzone' + (state.stagedJsonText ? ' is-loaded' : ''));
  zone.id = 'sj-dropzone';
  zone.setAttribute('role', 'button');
  zone.setAttribute('tabindex', '0');

  const icon = el('span', 'sj-drop-icon', state.stagedJsonText ? '✅' : '📁');
  const msg  = el('span', 'sj-drop-msg',
    state.stagedJsonText
      ? `${state.fileName}  (loaded)`
      : 'Drop StagedJSON here or click to browse');

  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = '.json';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', e => handleFile(e.target.files?.[0]));

  zone.append(icon, msg, fileInput);
  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('keydown', e => { if (e.key === 'Enter') fileInput.click(); });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('is-dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('is-dragover');
    handleFile(e.dataTransfer.files?.[0]);
  });
  return zone;
}

// ─── Tally ───────────────────────────────────────────────────────

function buildTally() {
  const parsed = tryParse(state.stagedJsonText);
  if (!parsed) return el('div');
  const records = parseStagedJson(parsed, state.config);
  const tally = tallyByType(records);

  const box = el('div', 'sj-tally');
  box.appendChild(el('div', 'sj-tally-title', 'Component Tally'));
  const grid = el('div', 'sj-tally-grid');
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  sorted.forEach(([type, count]) => {
    const chip = el('div', 'sj-tally-chip');
    chip.appendChild(el('span', 'sj-tally-type', type));
    chip.appendChild(el('span', 'sj-tally-count', String(count)));
    grid.appendChild(chip);
  });
  const total = Object.values(tally).reduce((s, n) => s + n, 0);
  const totalChip = el('div', 'sj-tally-chip sj-tally-total');
  totalChip.appendChild(el('span', 'sj-tally-type', 'TOTAL'));
  totalChip.appendChild(el('span', 'sj-tally-count', String(total)));
  grid.appendChild(totalChip);
  box.appendChild(grid);
  return box;
}

// ─── Summary ─────────────────────────────────────────────────────

function buildSummary() {
  const { audit } = state.result;
  const box = el('div', 'sj-summary');
  box.appendChild(el('div', 'sj-summary-title', 'Auto-Resolved Summary'));

  const totals = audit.totals || {};
  const statsEl = el('div', 'sj-summary-stats');
  statsEl.innerHTML = `
    <span class="sj-stat"><b>${audit.overallPct}%</b> overall confidence</span>
    <span class="sj-stat"><b>${audit.totalNodes}</b> nodes</span>
    <span class="sj-stat"><b>${audit.totalBranches}</b> branches</span>
    <span class="sj-stat ${totals.missing > 0 ? 'sj-stat-warn' : ''}">
      <b>${totals.missing ?? 0}</b> unresolved
    </span>`;
  box.appendChild(statsEl);

  if (totals.missing > 0) {
    const btnRow = el('div', 'sj-action-bar');
    btnRow.style.marginTop = '10px';

    // ⚡ Override Matrix — primary fix action
    const overrideBtn = el('button', 'sj-btn-override',
      `⚡ Fix ${totals.missing} Issues — Override Matrix`);
    overrideBtn.type = 'button';
    overrideBtn.onclick = () => openOverrideMatrix({
      records: state.result.records,
      config: state.config,
      onRerun: async (newConfig) => {
        state.config = newConfig;
        saveConfig(newConfig);
        await handleGenerate();
      },
    });
    btnRow.appendChild(overrideBtn);

    box.appendChild(btnRow);
  }
  return box;
}

// ─── Config ──────────────────────────────────────────────────────

function buildConfigSection() {
  const sec = el('div', 'sj-config-wrap');
  
  const hdrRow = document.createElement('div');
  hdrRow.style.display = 'flex';
  hdrRow.style.gap = '10px';
  hdrRow.style.alignItems = 'center';
  hdrRow.style.padding = '8px 16px';
  hdrRow.style.background = 'var(--surface)';

  const toggle = el('button', 'sj-config-toggle',
    (state.configExpanded ? '▼ Hide General Config' : '▶ Show General Config (rating, corrosion, axis)'));
  toggle.type = 'button';
  toggle.style.padding = '4px 8px';
  toggle.style.flex = '1';
  toggle.onclick = () => { state.configExpanded = !state.configExpanded; rerender(); };
  
  const matrixBtn = el('button', 'sj-btn-secondary', '📊 Piping Class / Bore Matrix');
  matrixBtn.type = 'button';
  matrixBtn.onclick = () => {
    openOverrideMatrix({
      records: state.result ? state.result.records : [],
      config: state.config,
      onRerun: async (newConfig) => {
        state.config = newConfig;
        saveConfig(newConfig);
        if (state.result) await handleGenerate();
      },
    });
  };

  const masterEnrichBtn = el('button', 'sj-btn-secondary', '📚 Master File Enrichment');
  masterEnrichBtn.type = 'button';
  masterEnrichBtn.onclick = () => openMasterEnrichmentPopup();

  hdrRow.append(toggle, matrixBtn, masterEnrichBtn);
  sec.appendChild(hdrRow);

  if (state.configExpanded) {
    const form = el('div', 'sj-config-form');
    renderConfigForm(form, state.config, updatedConfig => {
      state.config = updatedConfig;
      saveConfig(updatedConfig);
      rerender();
    });
    sec.appendChild(form);
  }
  return sec;
}

// ─── Action bar ──────────────────────────────────────────────────

function buildActionBar() {
  const bar = el('div', 'sj-action-bar');
  const canRun = !!state.stagedJsonText;

  const runBtn = el('button', 'sj-btn-primary' + (canRun ? '' : ' is-disabled'),
    state.status === 'running' ? '⏳ Running…' : '▶ Generate Enriched XML');
  runBtn.type = 'button';
  runBtn.disabled = !canRun || state.status === 'running';
  runBtn.onclick = () => handleGenerate();
  bar.appendChild(runBtn);

  if (state.result) {
    const popupBtn = el('button', 'sj-btn-secondary', '📊 Branch Confidence');
    popupBtn.type = 'button';
    popupBtn.onclick = () => openBranchPopup({ 
      audit: state.result.audit, 
      records: state.result.records,
      onOverride: (issue, value) => {
        const current = state.config.nodeOverrides || {};
        const nodeObj = current[issue.name] || {};
        nodeObj[issue.field] = value;
        setState({ config: { ...state.config, nodeOverrides: { ...current, [issue.name]: nodeObj } } });
        runPipelineDebounced();
      },
      onBranchOverride: (branchName, field, value) => {
        const current = state.config.branchOverrides || {};
        const branchObj = current[branchName] || {};
        branchObj[field] = value;
        setState({ config: { ...state.config, branchOverrides: { ...current, [branchName]: branchObj } } });
        runPipelineDebounced();
      }
    });
    bar.appendChild(popupBtn);
  }
  return bar;
}

// ─── Export bar ──────────────────────────────────────────────────

function buildExportBar() {
  const bar = el('div', 'sj-export-bar');
  bar.appendChild(el('div', 'sj-export-title', '💾 Export'));
  const stem = safeStem(state.fileName);

  const xmlBtn = el('button', 'sj-btn-export', '⬇ Enriched XML');
  xmlBtn.type = 'button';
  xmlBtn.onclick = () => downloadXml(stem, state.result.xmlText);

  const auditBtn = el('button', 'sj-btn-export', '⬇ Audit JSON');
  auditBtn.type = 'button';
  auditBtn.onclick = () => downloadAudit(stem, state.result.audit);

  const csvBtn = el('button', 'sj-btn-export', '⬇ Trace CSV');
  csvBtn.type = 'button';
  csvBtn.onclick = () => downloadTraceCsv(stem, state.result.records);

  bar.append(xmlBtn, auditBtn, csvBtn);
  return bar;
}

// ─── Error ───────────────────────────────────────────────────────

function buildError() {
  const box = el('div', 'sj-error');
  box.textContent = `⚠ ${state.error}`;
  return box;
}

// ─── Popups ──────────────────────────────────────────────────────

function openMasterEnrichmentPopup() {
  const overlay = el('div', 'sj-modal-overlay');
  overlay.style.position = 'fixed';
  overlay.style.top = '0'; overlay.style.left = '0';
  overlay.style.right = '0'; overlay.style.bottom = '0';
  overlay.style.background = 'rgba(0,0,0,0.85)';
  overlay.style.zIndex = '99999';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '20px';

  const modal = el('div', 'sj-modal');
  modal.style.background = '#1e1e1e';
  modal.style.width = '100%';
  modal.style.maxWidth = '1200px';
  modal.style.height = '90vh';
  modal.style.borderRadius = '8px';
  modal.style.display = 'flex';
  modal.style.flexDirection = 'column';
  modal.style.overflow = 'hidden';
  modal.style.boxShadow = '0 10px 40px rgba(0,0,0,0.5)';

  const header = el('div');
  header.style.padding = '15px 20px';
  header.style.borderBottom = '1px solid #333';
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  
  const title = el('h2', '', 'Master File Enrichment Workbench');
  title.style.margin = '0';
  title.style.color = '#fff';
  title.style.fontSize = '18px';
  
  const closeBtn = el('button', 'sj-btn-secondary', '✕ Close');
  closeBtn.style.padding = '6px 12px';
  
  header.append(title, closeBtn);

  const body = el('div');
  body.style.flex = '1';
  body.style.overflowY = 'auto';
  body.style.position = 'relative';

  modal.append(header, body);
  overlay.append(modal);
  document.body.appendChild(overlay);

  const dispose = renderStagedJsonEnrichmentPanel(body, {
    onApplyToWorkspace: async (json) => {
      state.stagedJsonText = JSON.stringify(json, null, 2);
      if (state.fileName && !state.fileName.includes('_enriched')) {
        state.fileName = state.fileName.replace('.json', '') + '_enriched.json';
      }
      state.result = null;
      state.status = 'idle';
      dispose?.();
      overlay.remove();
      rerender();
      await handleGenerate();
    }
  });

  closeBtn.onclick = () => {
    dispose?.();
    overlay.remove();
  };
}

// ─── Handlers ────────────────────────────────────────────────────

async function handleFile(file) {
  if (!file) return;
  state.fileName = file.name;
  state.status = 'reading';
  state.error = '';
  rerender();
  try {
    state.stagedJsonText = await file.text();
    state.result = null;
    state.status = 'idle';
  } catch (err) {
    state.error = `Failed to read file: ${err.message}`;
    state.status = 'idle';
  }
  rerender();
}

async function handleGenerate() {
  state.status = 'running';
  state.error = '';
  rerender();
  await microtask();
  try {
    state.result = runEnrichment({ stagedJsonText: state.stagedJsonText, config: state.config });
    state.status = 'done';
  } catch (err) {
    state.error = `Enrichment failed: ${err.message}`;
    state.status = 'idle';
  }
  rerender();
}

// ─── Helpers ─────────────────────────────────────────────────────

function el(tag, cls = '', text = '') {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== '') node.textContent = String(text);
  return node;
}

function tryParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function microtask() { return new Promise(r => setTimeout(r, 10)); }
