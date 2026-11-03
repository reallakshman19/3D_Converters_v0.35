import { isXmlCiiRigidNode } from '../converters/xml-cii2019-core/weight-match-model.js';
import { notify } from '../diagnostics/notification-center.js';

const FLAG = '__xmlCiiDefaultMasterAutoload_single_session_v3';
const RECOVERY_FLAG = '__xmlCiiRecovery_single_session_v3';
const SESSION_KEY = '__xmlCiiDefaultMasterAutoloadSession_v3';
const INPUT_SELECTOR = '[data-option-key="supportConfigJson"]';
const PRIMARY_FILE_SELECTOR = '#model-converters-primary-input';
const STATUS_ID = 'xml-cii-master-autoload-status';
const PATH_PANEL_ID = 'xml-cii-master-paths-panel';
const REPO_NAME = '3D_Viewer';
const RAW_BASE = 'https://raw.githubusercontent.com/reallaksh19/3D_Viewer/main/';

const DEFAULT_MASTER_PATHS = Object.freeze({
  materialMapPath: 'docs/Masters/PCF_MAT_MAP.TXT',
  weightPath: 'docs/Masters/wtValveweights.json',
  pipingClassIndexPath: 'docs/Masters/SpecwisePipingClass/index.json',
  pipingClassShardFolder: 'docs/Masters/SpecwisePipingClass/',
});

const PIPING_PLACEHOLDER_ROW = Object.freeze({
  _smartMasterPlaceholder: true,
  pipingClass: '__ON_DEMAND__',
  convertedBore: '',
  wallThickness: '',
  materialName: '',
  rating: '',
  corrosion: '',
  schedule: '',
});

const MASTER_SECTIONS = Object.freeze({
  material: Object.freeze({
    title: 'Material Map',
    sectionKey: 'material',
    rowsKey: 'mapRows',
    fieldMapKey: 'fieldMap',
    pathKey: 'materialMapPath',
    fieldMap: Object.freeze({ code: 'code', material: 'material', spec: 'spec' }),
  }),
  weight: Object.freeze({
    title: 'Weights / Valve CA8',
    sectionKey: 'weight',
    rowsKey: 'masterRows',
    fieldMapKey: 'fieldMap',
    pathKey: 'weightPath',
    fieldMap: Object.freeze({ bore: 'bore', rating: 'rating', length: 'length', valveType: 'valveType', weight: 'weight', typeDesc: 'typeDesc' }),
  }),
  pipingClass: Object.freeze({
    title: 'Piping Class',
    sectionKey: 'pipingClass',
    rowsKey: 'masterRows',
    fieldMapKey: 'fieldMap',
    fieldMap: Object.freeze({
      pipingClass: 'pipingClass',
      convertedBore: 'convertedBore',
      componentType: 'componentType',
      rating: 'rating',
      materialName: 'materialName',
      schedule: 'schedule',
      wallThickness: 'wallThickness',
      corrosion: 'corrosion',
      endCondition: 'endCondition',
    }),
  }),
});

function browserReady() {
  return typeof window !== 'undefined' && typeof document !== 'undefined' && typeof location !== 'undefined';
}

function sessionState() {
  if (!browserReady()) return { scheduled: false, running: false, pending: false };
  if (!window[SESSION_KEY] || typeof window[SESSION_KEY] !== 'object') {
    window[SESSION_KEY] = {
      scheduled: false,
      running: false,
      pending: false,
      lastSuccessNotifyKey: '',
      lastErrorNotifyKey: '',
      lastPipingNotifyKey: '',
    };
  }
  return window[SESSION_KEY];
}

function text(value) { return value == null ? '' : String(value); }
function clean(value) { return text(value).replace(/\s+/g, ' ').trim(); }
function esc(value) { return text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function normalizeKey(value) { return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function numericText(value) { const match = clean(value).match(/[-+]?\d*\.?\d+/); return match ? match[0] : ''; }
function rawValue(row, keys) { for (const key of keys || []) { const value = row?.[key] ?? row?._raw?.[key]; if (value != null && clean(value) !== '') return clean(value); } return ''; }
function isPipingPlaceholderRow(row) { return row?._smartMasterPlaceholder === true || normalizeKey(row?.pipingClass || row?.['Piping Class']) === 'ONDEMAND'; }

function masterPaths(config) {
  const existing = config?.masterPaths && typeof config.masterPaths === 'object' && !Array.isArray(config.masterPaths) ? config.masterPaths : {};
  const merged = { ...DEFAULT_MASTER_PATHS, ...existing };
  delete merged.legacyPipingMasterPath;
  return merged;
}
function normalizeMasterPath(masterPath) { return clean(masterPath).replace(/^\/+/, '').replace(/^\.\//, ''); }
function rawUrl(masterPath) { const p = normalizeMasterPath(masterPath); return `${RAW_BASE}${p.split('/').map(encodeURIComponent).join('/')}`; }
function appRootPrefix() {
  const parts = location.pathname.split('/').filter(Boolean);
  if (parts.includes(REPO_NAME)) return `/${REPO_NAME}/`;
  if (/github\.io$/i.test(location.hostname)) return `/${REPO_NAME}/`;
  return parts[0] ? `/${parts[0]}/` : '/';
}
function pageUrl(masterPath) { const p = normalizeMasterPath(masterPath); return `${location.origin}${appRootPrefix()}${p}`; }
function moduleRelativeUrl(masterPath) { return new URL(`../../${normalizeMasterPath(masterPath)}`, import.meta.url).href; }
function candidateUrls(masterPath) { const p = normalizeMasterPath(masterPath); return [...new Set([rawUrl(p), pageUrl(p), moduleRelativeUrl(p)])]; }

async function fetchTextByPath(masterPath) {
  const errors = [];
  for (const url of candidateUrls(masterPath)) {
    try {
      const response = await fetch(url, { cache: 'no-store', mode: 'cors' });
      if (!response.ok) { errors.push(`${url}: HTTP ${response.status}`); continue; }
      const rawText = await response.text();
      if (!clean(rawText)) { errors.push(`${url}: empty response`); continue; }
      return { rawText, url };
    } catch (error) {
      errors.push(`${url}: ${clean(error?.message || error)}`);
    }
  }
  throw new Error(`Failed to load ${masterPath}. Tried: ${errors.join(' | ')}`);
}

function configInput() { return document.querySelector(INPUT_SELECTOR); }
function parseConfig(input = configInput()) { try { const value = JSON.parse(input?.value || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return null; } }
function writeConfig(input, config) { const next = JSON.stringify(config, null, 2); if (!input || input.value === next) return false; input.value = next; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; }
function ensureSection(config, section) { const key = section.sectionKey; if (!config[key] || typeof config[key] !== 'object' || Array.isArray(config[key])) config[key] = {}; if (!config[key][section.fieldMapKey] || typeof config[key][section.fieldMapKey] !== 'object' || Array.isArray(config[key][section.fieldMapKey])) config[key][section.fieldMapKey] = {}; return config[key]; }
function rowCount(section, source) { const rows = source?.[section.rowsKey]; if (!Array.isArray(rows)) return 0; return section.sectionKey === 'pipingClass' ? rows.filter((row) => !isPipingPlaceholderRow(row)).length : rows.length; }

function parseJsonRows(rawText) {
  const trimmed = clean(rawText).replace(/^export\s+default\s+/i, '').replace(/^window\.[A-Za-z0-9_$]+\s*=\s*/i, '').replace(/;\s*$/g, '');
  const parsed = JSON.parse(trimmed || '[]');
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  for (const key of ['rows', 'masterRows', 'mapRows', 'data', 'items']) if (Array.isArray(parsed[key])) return parsed[key];
  return [];
}
function parseIndex(rawText) { const parsed = JSON.parse(clean(rawText).replace(/^export\s+default\s+/i, '').replace(/^window\.[A-Za-z0-9_$]+\s*=\s*/i, '').replace(/;\s*$/g, '') || '{}'); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.classes) throw new Error('Invalid specwise piping class index.'); return parsed; }
function parseMaterialRows(rawText) { return text(rawText).replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !/^\d{4}$/.test(line)).map((line, index) => { const match = line.match(/^(\S+)\s+(.+)$/); return { _rowIndex: index + 1, code: match ? match[1].trim() : '', material: match ? match[2].trim() : line }; }); }
function normalizeWeightRow(row, index = 0) { const bore = rawValue(row, ['bore', 'convertedBore', 'Converted Bore', 'DN', 'NB', 'Bore', 'NPS', 'NS', 'Size', 'Size (NPS)']); const length = rawValue(row, ['length', 'lengthMm', 'Length (RF-F/F)', 'RF-F/F', 'Length', 'LEN', 'faceToFace', 'Face To Face']); return { ...row, _raw: row, _sourceRowIndex: row?._sourceRowIndex || row?._rowIndex || index + 1, bore: numericText(bore) || bore, convertedBore: numericText(bore) || bore, rating: rawValue(row, ['rating', 'Rating', 'RATING', 'Class', 'CLASS', 'Pressure Class']), length: numericText(length) || length, valveType: rawValue(row, ['valveType', 'Type Description', 'TypeDesc', 'Valve Type', 'Type', 'Description']), typeDesc: rawValue(row, ['typeDesc', 'TypeDesc', 'Type Description', 'Description', 'Valve Type']), weight: rawValue(row, ['weight', 'valveWeight', 'RF/RTJ KG', 'Valve Weight', 'Weight']) }; }
function normalizePipingRow(row, index = 0) { return { ...row, _raw: row, _sourceRowIndex: row?._sourceRowIndex || row?._rowIndex || index + 1, pipingClass: rawValue(row, ['pipingClass', 'Piping Class', 'PIPING_CLASS', 'Class', 'SPEC', 'Spec']), convertedBore: numericText(rawValue(row, ['convertedBore', 'Converted Bore', 'DN', 'NB', 'Bore', 'NPS', 'Size'])), componentType: rawValue(row, ['componentType', 'Component Type', 'COMPONENT_TYPE', 'Type', 'Item Type']), rating: rawValue(row, ['rating', 'Rating', 'RATING', 'Class Rating', 'Pressure Class']), materialName: rawValue(row, ['materialName', 'Material_Name', 'Material', 'MATERIAL', 'Material Name']), schedule: rawValue(row, ['schedule', 'Schedule', 'SCHEDULE', 'SCH']), wallThickness: rawValue(row, ['wallThickness', 'Wall Thickness', 'Wall thickness', 'WALL_THICKNESS', 'WT', 'WallThickness']), corrosion: rawValue(row, ['corrosion', 'Corrosion', 'Corrosion Allowance', 'CORROSION_ALLOWANCE', 'CA']), endCondition: rawValue(row, ['endCondition', 'End Condition', 'END_CONDITION', 'End Type']) }; }
function normalizeRows(sectionKey, rows) { if (!Array.isArray(rows)) return []; if (sectionKey === 'material') return rows; if (sectionKey === 'weight') return rows.map(normalizeWeightRow).filter((row) => clean(row.bore) || clean(row.rating) || clean(row.length) || clean(row.weight)); if (sectionKey === 'pipingClass') return rows.map(normalizePipingRow).filter((row) => clean(row.pipingClass)); return rows; }

function extractBranchNames(xmlText) {
  const source = text(xmlText); const names = [];
  if (typeof DOMParser !== 'undefined') { try { const doc = new DOMParser().parseFromString(source, 'application/xml'); if (!doc.getElementsByTagName('parsererror').length) for (const node of [...doc.getElementsByTagName('Branchname')]) { const value = clean(node.textContent); if (value) names.push(value); } } catch {} }
  if (!names.length) for (const match of source.matchAll(/<Branchname\b[^>]*>([\s\S]*?)<\/Branchname>/gi)) { const value = clean(match[1].replace(/<[^>]+>/g, '')); if (value) names.push(value); }
  return [...new Set(names)];
}
function branchClassToken(branchName, config) { const parts = text(branchName).replace(/^\/+/, '').replace(/\/B\d+$/i, '').split(config?.rating?.tokenDelimiter || '-').map((p) => clean(p)); const configured = parts[Math.max(1, Number(config?.rating?.pipingClassTokenIndex || 5)) - 1] || ''; if (/^(CS|SS|LTCS|DSS|SDSS)$/i.test(configured) && /^S\d+/i.test(parts[5] || '')) return ''; return configured; }
function matchedClassesFromIndex(index, branchNames, config) { const classes = index?.classes && typeof index.classes === 'object' ? index.classes : {}; const out = []; const branchKeys = branchNames.map((name) => ({ classToken: normalizeKey(branchClassToken(name, config)), branch: normalizeKey(name) })); for (const [classKey, meta] of Object.entries(classes)) { const tokens = [classKey, ...(Array.isArray(meta?.matchTokens) ? meta.matchTokens : [])].map(normalizeKey).filter(Boolean); if (!tokens.length) continue; if (branchKeys.some(({ classToken, branch }) => tokens.some((token) => (classToken && (classToken.includes(token) || token.includes(classToken))) || branch.includes(token)))) out.push({ classKey, meta }); } return out; }
function joinPath(folder, file) { return `${normalizeMasterPath(folder).replace(/\/+$/, '')}/${clean(file).replace(/^\/+/, '')}`; }
function primaryXmlFile() { return document.querySelector(PRIMARY_FILE_SELECTOR)?.files?.[0] || null; }

function phaseTitle(regex = /Import Masters/i) { return Array.from(document.querySelectorAll('.model-converters-workflow-detail-title, .xml-cii-native-phase-head .model-converters-workflow-detail-title')).find((el) => regex.test(clean(el.textContent))); }
function renderStatus(message, tone = 'info') { const title = phaseTitle(/Import Masters|Preview|Run|Config|Weight Match/i); if (!title) return; let host = document.getElementById(STATUS_ID); if (!host) { host = document.createElement('div'); host.id = STATUS_ID; title.insertAdjacentElement('afterend', host); } host.textContent = message; host.style.cssText = `margin:8px 0;padding:8px 10px;border:1px solid ${tone === 'error' ? '#7f3040' : '#2b7656'};border-radius:8px;background:#0f1b2c;color:${tone === 'error' ? '#ffc2c2' : '#7dffc0'};font-size:12px;`; }
function pathInput(label, key, value) { return `<label class="model-converters-workflow-regex-field"><span>${esc(label)}</span><input type="text" value="${esc(value)}" data-xml-cii-master-path="${esc(key)}"></label>`; }
function pathPanelHtml(config, status) { const paths = masterPaths(config); return `<div id="${PATH_PANEL_ID}" class="model-converters-workflow-master-card" style="margin:10px 0;border-color:#25466b;"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;"><div><div class="model-converters-workflow-detail-title">Master Paths / Specwise Piping Class Index</div><div class="model-converters-workflow-detail-text">Default masters load once per browser session. Piping class rows are loaded from specwise shards after XML selection.</div></div><button type="button" class="model-converters-run-btn" data-xml-cii-rescan-piping>Rescan XML</button></div><div class="model-converters-workflow-regex-grid" style="margin-top:10px;grid-template-columns:repeat(4,minmax(180px,1fr));">${pathInput('Material Map Path', 'materialMapPath', paths.materialMapPath)}${pathInput('Weights / Valve CA8 Path', 'weightPath', paths.weightPath)}${pathInput('Piping Class Index Path', 'pipingClassIndexPath', paths.pipingClassIndexPath)}${pathInput('Piping Class Shard Folder', 'pipingClassShardFolder', paths.pipingClassShardFolder)}</div><div data-xml-cii-path-status style="margin-top:8px;padding:8px 10px;border:1px solid #2b7656;border-radius:8px;color:#7dffc0;background:#0f1b2c;font-size:12px;">${esc(status)}</div></div>`; }
function renderMasterPathsPanel(input = configInput(), status = 'Material Map and Weight Master auto-load once from docs/Masters. Select XML to scan specwise piping class shards.') { const config = parseConfig(input); if (!config) return; const title = phaseTitle(/Import Masters/i); if (!title) return; const html = pathPanelHtml(config, status); const existing = document.getElementById(PATH_PANEL_ID); if (existing) existing.outerHTML = html; else title.insertAdjacentHTML('afterend', html); bindPathPanel(input); }
function bindPathPanel(input) { const panel = document.getElementById(PATH_PANEL_ID); if (!panel || panel.dataset.bound === 'true') return; panel.dataset.bound = 'true'; panel.querySelectorAll('[data-xml-cii-master-path]').forEach((field) => field.addEventListener('change', () => { const config = parseConfig(input); if (!config) return; config.masterPaths = config.masterPaths && typeof config.masterPaths === 'object' ? config.masterPaths : {}; config.masterPaths[field.getAttribute('data-xml-cii-master-path') || ''] = normalizeMasterPath(field.value); delete config.masterPaths.legacyPipingMasterPath; writeConfig(input, config); renderMasterPathsPanel(input, 'Master paths updated. Rescan XML to reload specwise piping class rows.'); })); panel.querySelector('[data-xml-cii-rescan-piping]')?.addEventListener('click', () => rescanPipingClassFromXml({ force: true, notifyUser: true }).catch((error) => notifyOnce('error', `manual:${clean(error?.message || error)}`, { level: 'error', title: 'XML->CII Masters', message: clean(error?.message || error) }))); }

function notifyOnce(kind, key, payload) {
  const state = sessionState();
  const prop = kind === 'error' ? 'lastErrorNotifyKey' : (kind === 'piping' ? 'lastPipingNotifyKey' : 'lastSuccessNotifyKey');
  if (state[prop] === key) return;
  state[prop] = key;
  notify(payload);
}

async function loadMaterialAndWeight(input = configInput()) {
  const config = parseConfig(input);
  if (!config || config.disableDefaultMasterAutoload === true || config._disableDefaultMasterAutoload === true) return false;
  const paths = masterPaths(config);
  const missing = Object.entries(MASTER_SECTIONS).filter(([key, section]) => key !== 'pipingClass' && rowCount(section, config[section.sectionKey]) <= 0);
  if (!missing.length) return false;
  const loaded = [];
  const errors = [];
  for (const [key, section] of missing) {
    try {
      const { rawText, url } = await fetchTextByPath(paths[section.pathKey] || DEFAULT_MASTER_PATHS[section.pathKey]);
      const rawRows = key === 'material' ? parseMaterialRows(rawText) : parseJsonRows(rawText);
      const rows = normalizeRows(key, rawRows);
      if (!rows.length) throw new Error(`${section.title} loaded 0 usable rows.`);
      const target = ensureSection(config, section);
      target[section.rowsKey] = rows;
      target[section.fieldMapKey] = { ...section.fieldMap };
      target.masterUrl = url;
      target.defaultUrl = url;
      target._autoloadedRows = rows.length;
      target._autoloadedFrom = url;
      loaded.push(`${section.title}: ${rows.length} row(s)`);
    } catch (error) {
      errors.push(`${section.title}: ${clean(error?.message || error)}`);
    }
  }
  if (loaded.length) {
    config.masterPaths = config.masterPaths && typeof config.masterPaths === 'object' ? config.masterPaths : {};
    Object.assign(config.masterPaths, paths);
    delete config.masterPaths.legacyPipingMasterPath;
    config._defaultMastersAutoloaded = { loadedAt: new Date().toISOString(), source: 'single-session raw-first docs/Masters', loaded };
    writeConfig(input, config);
    const message = `Autoloaded ${loaded.join(' · ')}.`;
    renderMasterPathsPanel(input, message);
    notifyOnce('success', loaded.join('|'), { level: 'success', title: 'XML->CII Masters', message });
  }
  if (errors.length) {
    const message = `Default master autoload failed: ${errors.join(' || ')}`;
    renderStatus(message, 'error');
    notifyOnce('error', errors.join('|'), { level: 'error', title: 'XML->CII Masters', message });
  }
  return loaded.length > 0;
}

let rescanBusy = false;
async function rescanPipingClassFromXml({ force = false, notifyUser = false } = {}) {
  if (rescanBusy) return false;
  const input = configInput();
  const config = parseConfig(input);
  if (!input || !config || config.disableDefaultMasterAutoload === true) return false;
  const xmlFile = primaryXmlFile();
  if (!xmlFile) {
    renderMasterPathsPanel(input, 'Piping Class: select XML, then Rescan XML to load specwise shard rows.');
    return false;
  }
  rescanBusy = true;
  try {
    const paths = masterPaths(config);
    const xmlText = await xmlFile.text();
    const branchNames = extractBranchNames(xmlText);
    if (!branchNames.length) {
      renderMasterPathsPanel(input, 'Piping Class: no Branchname values found in XML.');
      return false;
    }
    const signature = JSON.stringify({ file: `${xmlFile.name}:${xmlFile.size}:${xmlFile.lastModified}`, branches: branchNames.length, index: paths.pipingClassIndexPath, folder: paths.pipingClassShardFolder });
    if (!force && config.pipingClass?._rescanSignature === signature && rowCount(MASTER_SECTIONS.pipingClass, config.pipingClass) > 0) {
      renderMasterPathsPanel(input, `Piping Class: cached ${config.pipingClass._autoloadedRows || rowCount(MASTER_SECTIONS.pipingClass, config.pipingClass)} row(s), ${branchNames.length} branchname(s).`);
      return true;
    }
    renderMasterPathsPanel(input, `Scanning ${branchNames.length} XML branchname(s) against specwise piping class index…`);
    const indexLoad = await fetchTextByPath(paths.pipingClassIndexPath);
    const index = parseIndex(indexLoad.rawText);
    const matches = matchedClassesFromIndex(index, branchNames, config);
    const rows = [];
    const loadedFiles = [];
    const folder = paths.pipingClassShardFolder || index.shardBase || DEFAULT_MASTER_PATHS.pipingClassShardFolder;
    for (const match of matches) {
      const file = clean(match.meta?.file || `${match.classKey}.json`);
      if (!file) continue;
      const shard = await fetchTextByPath(joinPath(folder, file));
      const shardRows = normalizeRows('pipingClass', parseJsonRows(shard.rawText));
      if (shardRows.length) { rows.push(...shardRows); loadedFiles.push(file); }
    }
    const section = ensureSection(config, MASTER_SECTIONS.pipingClass);
    section.masterRows = rows.length ? rows : [{ ...PIPING_PLACEHOLDER_ROW }];
    section.fieldMap = { ...MASTER_SECTIONS.pipingClass.fieldMap };
    section.masterUrl = indexLoad.url;
    section.defaultUrl = indexLoad.url;
    section._smartMode = rows.length ? 'specwise-shard' : 'specwise-index-no-match';
    section._autoloadedRows = rows.length;
    section._matchedClassCount = matches.length;
    section._loadedShardCount = loadedFiles.length;
    section._loadedShardFiles = loadedFiles;
    section._branchNameCount = branchNames.length;
    section._rescanSignature = signature;
    section._rescanAt = new Date().toISOString();
    config.masterPaths = config.masterPaths && typeof config.masterPaths === 'object' ? config.masterPaths : {};
    Object.assign(config.masterPaths, paths);
    delete config.masterPaths.legacyPipingMasterPath;
    writeConfig(input, config);
    const msg = rows.length ? `Piping Class: ${loadedFiles.length}/${matches.length} shard(s), ${rows.length} row(s), ${branchNames.length} branchname(s).` : `Piping Class: 0/${matches.length} shard(s), 0 row(s), ${branchNames.length} branchname(s).`;
    renderMasterPathsPanel(input, msg);
    renderStatus(msg, rows.length ? 'ok' : 'error');
    if (notifyUser) notifyOnce('piping', msg, { level: rows.length ? 'success' : 'warning', title: 'XML->CII Masters', message: msg });
    return rows.length > 0;
  } finally {
    rescanBusy = false;
  }
}

function scheduleAutoload(delay = 0) {
  const state = sessionState();
  if (state.scheduled) return;
  state.scheduled = true;
  setTimeout(() => runAutoloadSession().catch((error) => {
    const message = clean(error?.message || error);
    renderStatus(`Default master autoload failed: ${message}`, 'error');
    notifyOnce('error', `session:${message}`, { level: 'error', title: 'XML->CII Masters', message: `Default master autoload failed: ${message}` });
  }), delay);
}

async function runAutoloadSession() {
  const state = sessionState();
  state.scheduled = false;
  if (state.running) {
    state.pending = true;
    return;
  }
  state.running = true;
  try {
    const input = configInput();
    if (!input) return;
    renderMasterPathsPanel(input);
    await loadMaterialAndWeight(input);
    await rescanPipingClassFromXml({ force: false, notifyUser: false });
    renderMasterPathsPanel(input);
  } finally {
    state.running = false;
    if (state.pending) {
      state.pending = false;
      scheduleAutoload(120);
    }
  }
}

export function installXmlCiiDefaultMasterAutoload() {
  if (!browserReady()) return;
  if (window[FLAG]) return;
  window[FLAG] = true;
  document.addEventListener('change', (event) => { if (event.target?.matches?.(`${INPUT_SELECTOR}, ${PRIMARY_FILE_SELECTOR}`)) scheduleAutoload(0); }, true);
  document.addEventListener('input', (event) => { if (event.target?.matches?.(INPUT_SELECTOR)) scheduleAutoload(250); }, true);
  document.addEventListener('click', (event) => { if (event.target?.closest?.('[data-xml-cii-phase], [data-native-master-tab], [data-xml-cii-save-master], [data-xml-cii-master-tab]')) scheduleAutoload(0); }, true);
  scheduleAutoload(0);
}

export function installXmlCiiRecoveryPatch() {
  if (!browserReady()) return;
  if (window[RECOVERY_FLAG]) return;
  window[RECOVERY_FLAG] = true;
  if (typeof globalThis !== 'undefined' && !globalThis.isXmlCiiRigidNode) Object.defineProperty(globalThis, 'isXmlCiiRigidNode', { value: isXmlCiiRigidNode, configurable: true });
}
