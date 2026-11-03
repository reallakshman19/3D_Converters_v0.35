import {
  parseXmlCiiEnrichmentConfig,
  toText,
} from './config.js';
import { buildPipingClassIndex } from './piping-class-resolver.js';
import { buildPipeDataWeightRows } from './pipe-component-data-adapter.js';
import { DEFAULT_WEIGHT_MASTER_ROWS } from './default-weight-master-rows.js';
import { DEFAULT_MATERIAL_MAP_ROWS } from './default-material-map-rows.js';

export const DEFAULT_PIPING_CLASS_MASTER_URLS = Object.freeze([
  '../docs/Masters/SpecwisePipingClass/index.json',
  'docs/Masters/SpecwisePipingClass/index.json',
]);

export const DEFAULT_MATERIAL_MAP_URLS = Object.freeze([
  '../docs/Masters/PCF_MAT_MAP.TXT',
  'docs/Masters/PCF_MAT_MAP.TXT',
]);

function _ensureSection(config, key) {
  if (!config[key] || typeof config[key] !== 'object' || Array.isArray(config[key])) {
    config[key] = {};
  }
  return config[key];
}

function _asRows(value) {
  return Array.isArray(value) ? value : [];
}

function _uniqueNonBlank(values) {
  return [...new Set((values || []).map((value) => toText(value).trim()).filter(Boolean))];
}

function _parseMaterialMapText(text) {
  let rows = null;
  try {
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed)
      ? parsed.map((row) => ({
          code: toText(row?.code),
          material: toText(row?.material || row?.desc || row?.name),
        }))
      : null;
  } catch {
    rows = null;
  }

  if (rows) return rows;

  rows = [];
  for (const line of toText(text).split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(.+?)\s*$/);
    if (match) rows.push({ code: match[1], material: match[2] });
  }
  return rows;
}

function _appendPipeComponentDataWeightRows(config, rows, diagnostics) {
  if (config?.derivation?.pipeComponentData?.weightSource !== true) return rows;
  if (rows.some((row) => row?.__source === 'pipe-component-data')) return rows;

  const extraRows = buildPipeDataWeightRows();
  if (extraRows.length) {
    rows.push(...extraRows);
    diagnostics.push({ type: 'weight-master-source', source: 'pipe-component-data', rows: extraRows.length });
  }
  return rows;
}

export async function loadXmlCiiWeightMasterRows(config, diagnostics = []) {
  const rows = await _loadXmlCiiWeightMasterRowsBase(config, diagnostics);
  return _appendPipeComponentDataWeightRows(config, rows, diagnostics);
}

async function _loadXmlCiiWeightMasterRowsBase(config, diagnostics = []) {
  const weight = _ensureSection(config, 'weight');
  if (Array.isArray(weight.masterRows) && weight.masterRows.length) {
    diagnostics.push({ type: 'weight-master-source', source: 'inline-config', rows: weight.masterRows.length });
    return weight.masterRows;
  }

  const masterUrl = toText(weight.masterUrl).trim();
  if (masterUrl && typeof fetch === 'function') {
    try {
      const response = await fetch(masterUrl);
      const data = response.ok ? await response.json() : null;
      if (Array.isArray(data)) {
        weight.masterRows = data;
        diagnostics.push({ type: 'weight-master-source', source: masterUrl, rows: data.length });
        return weight.masterRows;
      }
      diagnostics.push({ type: 'weight-master-fetch-skip', url: masterUrl, reason: response.ok ? 'not-array' : `status-${response.status}` });
    } catch (error) {
      diagnostics.push({ type: 'weight-master-fetch-skip', url: masterUrl, reason: toText(error?.message || error) });
    }
  }

  weight.masterRows = DEFAULT_WEIGHT_MASTER_ROWS.map((row) => ({ ...row }));
  diagnostics.push({ type: 'weight-master-source', source: 'app-default', rows: weight.masterRows.length });
  return weight.masterRows;
}

export async function loadXmlCiiMasterRows(cfgSection, defaultUrls, label, diagnostics = []) {
  const section = cfgSection && typeof cfgSection === 'object' && !Array.isArray(cfgSection)
    ? cfgSection
    : {};

  if (Array.isArray(section.masterRows) && section.masterRows.length) {
    diagnostics.push({ type: `${label}-master-source`, source: 'inline-config', rows: section.masterRows.length });
    return section.masterRows;
  }

  if (typeof fetch !== 'function') {
    diagnostics.push({ type: `${label}-master-source`, source: 'fetch-unavailable', rows: 0 });
    section.masterRows = _asRows(section.masterRows);
    return section.masterRows;
  }

  const urls = _uniqueNonBlank([section.masterUrl, ...(defaultUrls || [])]);
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        diagnostics.push({ type: `${label}-master-fetch-skip`, url, status: response.status });
        continue;
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        section.masterRows = data;
        diagnostics.push({ type: `${label}-master-source`, source: url, rows: data.length });
        return section.masterRows;
      }
      diagnostics.push({ type: `${label}-master-fetch-skip`, url, reason: 'not-array' });
    } catch (error) {
      diagnostics.push({ type: `${label}-master-fetch-skip`, url, reason: toText(error?.message || error) });
    }
  }

  section.masterRows = _asRows(section.masterRows);
  return section.masterRows;
}

export async function loadXmlCiiMaterialMap(config, diagnostics = []) {
  const material = _ensureSection(config, 'material');
  if (Array.isArray(material.mapRows) && material.mapRows.length) {
    diagnostics.push({ type: 'material-map-source', source: 'inline-config', rows: material.mapRows.length });
    return material.mapRows;
  }

  if (typeof fetch === 'function') {
    const urls = _uniqueNonBlank([material.masterUrl, ...DEFAULT_MATERIAL_MAP_URLS]);
    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const rows = _parseMaterialMapText(await response.text());
          material.mapRows = rows;
          diagnostics.push({ type: 'material-map-source', source: url, rows: rows.length });
          return material.mapRows;
        }
        diagnostics.push({ type: 'material-map-fetch-skip', url, reason: `status-${response.status}` });
      } catch (error) {
        diagnostics.push({ type: 'material-map-fetch-skip', url, reason: toText(error?.message || error) });
      }
    }
  }

  material.mapRows = DEFAULT_MATERIAL_MAP_ROWS.map((row) => ({ ...row }));
  diagnostics.push({ type: 'material-map-source', source: 'app-default', rows: material.mapRows.length });
  return material.mapRows;
}

/**
 * Build the shared XML→CII(2019) master context used by both XML→CII and
 * JSON/RVM→PCF row enrichment.
 *
 * Master loader ownership lives in this core module. UI/helper adapters must
 * import these loaders from here instead of owning parallel loader copies.
 */
export async function prepareXmlCiiMasterContext({
  rawConfig = {},
  diagnostics = [],
} = {}) {
  const configInput = typeof rawConfig === 'string'
    ? rawConfig
    : JSON.stringify(rawConfig || {});

  const config = parseXmlCiiEnrichmentConfig(configInput);
  const material = _ensureSection(config, 'material');
  const pipingClass = _ensureSection(config, 'pipingClass');
  _ensureSection(config, 'weight');
  _ensureSection(config, 'linelist');

  await loadXmlCiiWeightMasterRows(config, diagnostics);
  const materialMapRows = await loadXmlCiiMaterialMap(config, diagnostics);
  const pipingClassRows = await loadXmlCiiMasterRows(
    pipingClass,
    DEFAULT_PIPING_CLASS_MASTER_URLS,
    'piping-class',
    diagnostics
  );

  material.mapRows = materialMapRows;
  pipingClass.masterRows = pipingClassRows;

  const lineRows = _asRows(config.linelist?.masterRows);
  const weightMasterRows = _asRows(config.weight?.masterRows);
  const pipingClassIndex = buildPipingClassIndex(pipingClassRows);

  return {
    config,
    diagnostics,
    lineRows,
    materialMapRows,
    pipingClassRows,
    pipingClassIndex,
    weightMasterRows,
  };
}
