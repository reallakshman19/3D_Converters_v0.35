import { notify } from '../diagnostics/notification-center.js';

const FLAG = '__xmlCiiDefaultMasterAutoload_lite_v1';
const INPUT_SELECTOR = '[data-option-key="supportConfigJson"]';
const REPO_NAME = '3D_Viewer';
const RAW_BASE = 'https://raw.githubusercontent.com/reallaksh19/3D_Viewer/main/';

const DEFAULT_MASTER_PATHS = Object.freeze({
  materialMapPath: 'docs/Masters/PCF_MAT_MAP.TXT',
  weightPath: 'docs/Masters/wtValveweights.json',
});

const SECTIONS = Object.freeze({
  material: Object.freeze({
    title: 'Material Map',
    rowsKey: 'mapRows',
    pathKey: 'materialMapPath',
    fieldMap: Object.freeze({ code: 'code', material: 'material', spec: 'spec' }),
  }),
  weight: Object.freeze({
    title: 'Weights / Valve CA8',
    rowsKey: 'masterRows',
    pathKey: 'weightPath',
    fieldMap: Object.freeze({ bore: 'bore', rating: 'rating', length: 'length', valveType: 'valveType', weight: 'weight', typeDesc: 'typeDesc' }),
  }),
});

function browserReady() {
  return typeof window !== 'undefined' && typeof document !== 'undefined' && typeof location !== 'undefined';
}

function text(value) { return value == null ? '' : String(value); }
function clean(value) { return text(value).replace(/\s+/g, ' ').trim(); }
function numericText(value) { const match = clean(value).match(/[-+]?\d*\.?\d+/); return match ? match[0] : ''; }
function rawValue(row, keys) { for (const key of keys || []) { const value = row?.[key] ?? row?._raw?.[key]; if (value != null && clean(value) !== '') return clean(value); } return ''; }

function appRootPrefix() {
  const parts = location.pathname.split('/').filter(Boolean);
  if (parts.includes(REPO_NAME)) return `/${REPO_NAME}/`;
  if (/github\.io$/i.test(location.hostname)) return `/${REPO_NAME}/`;
  return parts[0] ? `/${parts[0]}/` : '/';
}

function normalizeMasterPath(masterPath) {
  return clean(masterPath).replace(/^\/+/, '').replace(/^\.\//, '');
}

function candidateUrls(masterPath) {
  const p = normalizeMasterPath(masterPath);
  return [...new Set([
    `${RAW_BASE}${p.split('/').map(encodeURIComponent).join('/')}`,
    `${location.origin}${appRootPrefix()}${p}`,
    new URL(`../../${p}`, import.meta.url).href,
  ])];
}

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

function parseJsonRows(rawText) {
  const trimmed = clean(rawText).replace(/^export\s+default\s+/i, '').replace(/^window\.[A-Za-z0-9_$]+\s*=\s*/i, '').replace(/;\s*$/g, '');
  const parsed = JSON.parse(trimmed || '[]');
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  for (const key of ['rows', 'masterRows', 'mapRows', 'data', 'items']) if (Array.isArray(parsed[key])) return parsed[key];
  return [];
}

function parseMaterialRows(rawText) {
  return text(rawText)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\d{4}$/.test(line))
    .map((line, index) => {
      const match = line.match(/^(\S+)\s+(.+)$/);
      return { _rowIndex: index + 1, code: match ? match[1].trim() : '', material: match ? match[2].trim() : line };
    });
}

function normalizeWeightRow(row, index = 0) {
  const bore = rawValue(row, ['bore', 'convertedBore', 'Converted Bore', 'DN', 'NB', 'Bore', 'NPS', 'NS', 'Size', 'Size (NPS)']);
  const length = rawValue(row, ['length', 'lengthMm', 'Length (RF-F/F)', 'RF-F/F', 'Length', 'LEN', 'faceToFace', 'Face To Face']);
  return {
    ...row,
    _raw: row,
    _sourceRowIndex: row?._sourceRowIndex || row?._rowIndex || index + 1,
    bore: numericText(bore) || bore,
    convertedBore: numericText(bore) || bore,
    rating: rawValue(row, ['rating', 'Rating', 'RATING', 'Class', 'CLASS', 'Pressure Class']),
    length: numericText(length) || length,
    valveType: rawValue(row, ['valveType', 'Type Description', 'TypeDesc', 'Valve Type', 'Type', 'Description']),
    typeDesc: rawValue(row, ['typeDesc', 'TypeDesc', 'Type Description', 'Description', 'Valve Type']),
    weight: rawValue(row, ['weight', 'valveWeight', 'RF/RTJ KG', 'Valve Weight', 'Weight']),
  };
}

function normalizeRows(sectionKey, rows) {
  if (!Array.isArray(rows)) return [];
  if (sectionKey === 'material') return rows;
  if (sectionKey === 'weight') return rows.map(normalizeWeightRow).filter((row) => clean(row.bore) || clean(row.rating) || clean(row.length) || clean(row.weight));
  return rows;
}

function parseConfig(input) {
  try {
    const value = JSON.parse(input?.value || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return null;
  }
}

function rowCount(sectionKey, config) {
  const rows = config?.[sectionKey]?.[SECTIONS[sectionKey].rowsKey];
  return Array.isArray(rows) ? rows.length : 0;
}

function ensureSection(config, sectionKey) {
  const section = SECTIONS[sectionKey];
  if (!config[sectionKey] || typeof config[sectionKey] !== 'object' || Array.isArray(config[sectionKey])) config[sectionKey] = {};
  if (!config[sectionKey].fieldMap || typeof config[sectionKey].fieldMap !== 'object' || Array.isArray(config[sectionKey].fieldMap)) config[sectionKey].fieldMap = {};
  return { section, target: config[sectionKey] };
}

function writeConfig(input, config) {
  const next = JSON.stringify(config, null, 2);
  if (!input || input.value === next) return false;
  input.value = next;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

async function loadOne(sectionKey, config) {
  const { section, target } = ensureSection(config, sectionKey);
  const paths = config.masterPaths && typeof config.masterPaths === 'object' && !Array.isArray(config.masterPaths) ? config.masterPaths : {};
  const masterPath = paths[section.pathKey] || DEFAULT_MASTER_PATHS[section.pathKey];
  const { rawText, url } = await fetchTextByPath(masterPath);
  const rawRows = sectionKey === 'material' ? parseMaterialRows(rawText) : parseJsonRows(rawText);
  const rows = normalizeRows(sectionKey, rawRows);
  if (!rows.length) throw new Error(`${section.title} loaded 0 usable rows.`);
  target[section.rowsKey] = rows;
  target.fieldMap = { ...section.fieldMap };
  target.masterUrl = url;
  target.defaultUrl = url;
  target._autoloadedRows = rows.length;
  target._autoloadedFrom = url;
  return `${section.title}: ${rows.length} row(s)`;
}

async function runLiteAutoload() {
  const input = document.querySelector(INPUT_SELECTOR);
  const config = parseConfig(input);
  if (!input || !config || config.disableDefaultMasterAutoload === true || config._disableDefaultMasterAutoload === true) return;
  const missing = Object.keys(SECTIONS).filter((sectionKey) => rowCount(sectionKey, config) <= 0);
  if (!missing.length) return;
  const loaded = [];
  const errors = [];
  for (const sectionKey of missing) {
    try { loaded.push(await loadOne(sectionKey, config)); }
    catch (error) { errors.push(`${SECTIONS[sectionKey].title}: ${clean(error?.message || error)}`); }
  }
  if (loaded.length) {
    config.masterPaths = config.masterPaths && typeof config.masterPaths === 'object' && !Array.isArray(config.masterPaths) ? config.masterPaths : {};
    Object.assign(config.masterPaths, DEFAULT_MASTER_PATHS);
    delete config.masterPaths.legacyPipingMasterPath;
    config._defaultMastersAutoloaded = { loadedAt: new Date().toISOString(), source: 'lite single-shot docs/Masters', loaded };
    writeConfig(input, config);
    const key = loaded.join('|');
    if (window.__xmlCiiLiteAutoloadLastNotify !== key) {
      window.__xmlCiiLiteAutoloadLastNotify = key;
      notify({ level: 'success', title: 'XML->CII Masters', message: `Autoloaded ${loaded.join(' · ')}.` });
    }
  }
  if (errors.length && window.__xmlCiiLiteAutoloadLastError !== errors.join('|')) {
    window.__xmlCiiLiteAutoloadLastError = errors.join('|');
    notify({ level: 'error', title: 'XML->CII Masters', message: `Default master autoload failed: ${errors.join(' || ')}` });
  }
}

function scheduleOnce() {
  const runner = () => runLiteAutoload().catch((error) => {
    const message = clean(error?.message || error);
    if (window.__xmlCiiLiteAutoloadLastError !== message) {
      window.__xmlCiiLiteAutoloadLastError = message;
      notify({ level: 'error', title: 'XML->CII Masters', message: `Default master autoload failed: ${message}` });
    }
  });
  if (typeof requestIdleCallback === 'function') requestIdleCallback(runner, { timeout: 1500 });
  else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(runner);
  else Promise.resolve().then(runner);
}

export function installXmlCiiDefaultMasterAutoloadLite() {
  if (!browserReady()) return;
  if (window[FLAG]) return;
  window[FLAG] = true;
  scheduleOnce();
}
