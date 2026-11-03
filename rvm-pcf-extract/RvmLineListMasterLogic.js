/**
 * RvmLineListMasterLogic.js
 *
 * Pure line-list master helpers for Json -> PCF extraction.
 * Inputs: raw workbook rows, mapped master rows, header mappings, and lookup queries.
 * Outputs: detected mappings, indexed lookup results, canonical candidate values, and legacy storage payloads.
 * Fallback: exact matches are preferred; normalized and high-confidence fuzzy matches are used only when exact lookup fails.
 */

const HEADER_KEYWORDS = Object.freeze([
  'LINE',
  'SERVICE',
  'PID',
  'PRESSURE',
  'TEMP',
  'CLASS',
  'PIPING',
  'SPEC',
  'UNIT',
]);

const HIGH_CONFIDENCE_SCORE = 0.92;
const MIN_FUZZY_SCORE = 0.72;

const DEFAULT_DENSITY_OPTIONS = Object.freeze({
  mixedPreference: 'Liquid',
  defaultGas: 1.2,
  defaultLiquid: 1000,
});

export const LINE_LIST_FIELD_ALIASES = Object.freeze({
  lineNo: ['Line No', 'Line Number', 'ISO', 'Line Ref', 'Line', 'Pipeline Ref', 'PIPELINE_REF', 'LINE_NO'],
  service: ['Service', 'System', 'Fluid Service'],
  sequence: ['Sequence', 'Seq', 'Line Number', 'Line No', 'ISO', 'Pipeline Ref'],
  pipingClass: ['Piping Class', 'Class', 'Spec', 'Pipe Spec', 'PIPING_CLASS', 'SPEC'],
  rating: ['Rating', 'Pressure Class', 'Class Rating'],
  material: ['Material', 'Material_Name', 'MATERIAL'],
  schedule: ['Schedule', 'SCHEDULE', 'SCH'],
  wallThickness: ['Wall Thickness', 'WALL_THICKNESS', 'WT'],
  corrosionAllowance: ['Corrosion Allowance', 'CORROSION_ALLOWANCE', 'CA'],
  convertedBore: ['Converted Bore', 'DN', 'NB', 'Bore', 'Size', 'NPS', 'Line Size', 'Nominal Size'],
  p1: ['Design Pressure', 'Des Press', 'Press', 'P1', 'Design_P', 'Op. Pr', 'Oper. Pr', 'Operating Pressure'],
  t1: ['Design Temperature', 'Des Temp', 'Temp', 'T1', 'Design_T', 'Max Temp', 'Operating Temp', 'Temperature'],
  insThk: ['Insulation Thickness', 'Ins Thk', 'Insul', 'Insulation', 'Ins. Thk'],
  insType: ['Insulation Type', 'Ins Type', 'Insul Type', 'Insulation Class', 'Insulation Grade'],
  hp: ['Hydro Test Pressure', 'Test Press', 'Hydro', 'HP', 'Hydrostatic', 'Hydro Pr'],
  densityDirect: ['Fluid Density', 'Density'],
  densityGas: ['Density (Gas)', 'Gas Density', 'Rho Gas', 'Vapor Density'],
  densityLiquid: ['Density (Liquid)', 'Liq Density', 'Density (Liq)', 'Rho Liq', 'Liquid Density'],
  densityMixed: ['Density (Mixed)', 'Mixed Density', 'Two Phase Density'],
  phase: ['Phase', 'Fluid State', 'State', 'Flow Phase', 'Fluid Phase'],
});

const LEGACY_SMART_TO_FIELD = Object.freeze({
  LineRef: 'lineNo',
  P1: 'p1',
  T1: 't1',
  InsThk: 'insThk',
  InsType: 'insType',
  HP: 'hp',
  PipingClass: 'pipingClass',
  DensityDirect: 'densityDirect',
  DensityGas: 'densityGas',
  DensityLiquid: 'densityLiquid',
  DensityLiq: 'densityLiquid',
  DensityMixed: 'densityMixed',
  Phase: 'phase',
});

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function normalizeHeader(value) {
  return upper(value).replace(/[^A-Z0-9]/g, '');
}

function normalizeLookup(value) {
  return upper(value).replace(/[^A-Z0-9]/g, '');
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function levenshtein(a, b) {
  const s = normalizeLookup(a);
  const t = normalizeLookup(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const prev = Array(t.length + 1).fill(0);
  const curr = Array(t.length + 1).fill(0);
  for (let j = 0; j <= t.length; j += 1) prev[j] = j;

  for (let i = 1; i <= s.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= t.length; j += 1) prev[j] = curr[j];
  }

  return prev[t.length];
}

export function lineListSimilarity(a, b) {
  const s = normalizeLookup(a);
  const t = normalizeLookup(b);
  if (!s && !t) return 1;
  if (!s || !t) return 0;
  if (s === t) return 1;
  if (s.includes(t) || t.includes(s)) {
    const min = Math.min(s.length, t.length);
    const max = Math.max(s.length, t.length);
    return Math.max(0.86, min / max);
  }
  const distance = levenshtein(s, t);
  return Math.max(0, 1 - distance / Math.max(s.length, t.length));
}

export function detectLineListHeaderRow(rawRows) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const maxScan = Math.min(rows.length, 25);
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < maxScan; i += 1) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    let score = 0;
    for (const cell of row) {
      const value = upper(cell);
      if (value && HEADER_KEYWORDS.some(keyword => value.includes(keyword))) score += 1;
    }
    if (score > bestScore) {
      bestIdx = i;
      bestScore = score;
    }
  }

  if (bestScore > 0) return bestIdx;

  let largestIdx = -1;
  let largestCols = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const cols = row.filter(cell => clean(cell) !== '').length;
    if (cols > largestCols) {
      largestCols = cols;
      largestIdx = i;
    }
  }

  return largestIdx >= 0 ? largestIdx : 0;
}

function findHeader(headers, aliases) {
  if (!Array.isArray(headers) || !Array.isArray(aliases)) return '';
  const safeHeaders = headers.map(h => clean(h)).filter(Boolean);
  const normalized = new Map(safeHeaders.map(h => [normalizeHeader(h), h]));

  for (const alias of aliases) {
    const exact = normalized.get(normalizeHeader(alias));
    if (exact) return exact;
  }

  const sortedAliases = [...aliases].sort((a, b) => clean(b).length - clean(a).length);
  for (const alias of sortedAliases) {
    const tag = upper(alias);
    if (!tag) continue;
    const hit = safeHeaders.find(header => {
      const candidate = upper(header);
      if (!candidate.includes(tag) && !tag.includes(candidate)) return false;
      if (tag.length <= 3 && candidate.length > 10) return false;
      if (candidate === 'CONSTRUCTION CLASS' && tag === 'CLASS') return false;
      return true;
    });
    if (hit) return hit;
  }

  return '';
}

export function autoMapLineListFields(headers, existingMap = {}) {
  const next = { ...(existingMap || {}) };
  for (const [field, aliases] of Object.entries(LINE_LIST_FIELD_ALIASES)) {
    if (!next[field]) next[field] = findHeader(headers, aliases);
  }
  if (!next.sequence && next.lineNo) next.sequence = next.lineNo;
  return next;
}

function rowKeys(row) {
  return Object.keys(row || {});
}

function readCaseInsensitive(row, key) {
  if (!row || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  const match = rowKeys(row).find(k => upper(k) === upper(key));
  return match ? row[match] : undefined;
}

export function readLineListValue(row, fieldMap = {}, fieldName, fallbackKeys = []) {
  const sourceHeader = fieldMap?.[fieldName];
  const keys = [fieldName, sourceHeader, ...fallbackKeys].filter(Boolean);

  for (const key of keys) {
    const direct = readCaseInsensitive(row, key);
    if (direct != null && clean(direct) !== '') return direct;
  }

  const raw = row?._raw;
  if (raw && typeof raw === 'object') {
    for (const key of keys) {
      const direct = readCaseInsensitive(raw, key);
      if (direct != null && clean(direct) !== '') return direct;
    }
  }

  return '';
}

function addToMultiMap(map, key, row) {
  const k = clean(key);
  if (!k) return;
  if (!map.has(k)) map.set(k, []);
  map.get(k).push(row);
}

function lineKeyForRow(row, fieldMap, keyConfig = {}) {
  return clean(
    // ColumnX1 is the explicit, user-derived LineNo Key (the composite pipeline
    // reference). Prefer it over a raw `lineNo`/`sequence` column, which is
    // frequently only a partial (e.g. "8010125" vs the composite "A8010125")
    // and would otherwise shadow the correct join key.
    readLineListValue(row, fieldMap, 'ColumnX1', ['ColumnX1', 'COLUMNX1']) ||
    readLineListValue(row, fieldMap, keyConfig.sequenceCol || 'sequence', ['lineNo', 'Line Number', 'Line No']) ||
    readLineListValue(row, fieldMap, 'lineNo', ['ColumnX1', 'pipelineRef', 'PIPELINE_REF'])
  );
}

function serviceKeyForRow(row, fieldMap, keyConfig = {}) {
  return clean(
    readLineListValue(row, fieldMap, keyConfig.serviceCol || 'service', ['Service', 'System'])
  );
}

export function buildLineListLookup(rows, fieldMap = {}, keyConfig = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const composite = new Map();
  const simple = new Map();
  const normalized = new Map();
  const candidates = [];

  for (const row of safeRows) {
    const lineKey = lineKeyForRow(row, fieldMap, keyConfig);
    const serviceKey = serviceKeyForRow(row, fieldMap, keyConfig);
    if (!lineKey) continue;

    if (serviceKey) addToMultiMap(composite, `${serviceKey}-${lineKey}`, row);
    addToMultiMap(simple, lineKey, row);
    addToMultiMap(normalized, normalizeLookup(lineKey), row);
    candidates.push({ row, key: lineKey });
  }

  return {
    rows: safeRows,
    fieldMap: { ...(fieldMap || {}) },
    keyConfig: { ...(keyConfig || {}) },
    composite,
    simple,
    normalized,
    candidates,
  };
}

function queryParts(query) {
  if (typeof query === 'string') return { lineKey: clean(query), serviceKey: '' };
  const raw = query?.raw || query || {};
  const lineKey = clean(
    raw.lineNo ||
    raw.LineNo ||
    raw.LINENO ||
    raw.lookupKey ||
    raw.pipelineRef ||
    raw['Line Number'] ||
    raw['Line No'] ||
    raw.ISO ||
    raw.name ||
    ''
  );
  const serviceKey = clean(raw.service || raw.Service || raw.SERVICE || raw.System || '');
  return { lineKey, serviceKey };
}

function resultFromRows(rows, source, key, score = 1) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (safeRows.length === 1) {
    return {
      row: safeRows[0],
      match: safeRows[0],
      source,
      reason: 'MATCH',
      key,
      score,
      candidates: [{ row: safeRows[0], key, score }],
    };
  }
  if (safeRows.length > 1) {
    return {
      row: null,
      match: null,
      source,
      reason: 'AMBIGUOUS_EXACT',
      key,
      score,
      candidates: safeRows.map(row => ({ row, key, score })),
    };
  }
  return null;
}

export function findLineListMatch(query, lookup) {
  const index = lookup || buildLineListLookup([]);
  const { lineKey, serviceKey } = queryParts(query);
  if (!lineKey) {
    return { row: null, match: null, reason: 'NO_KEY', candidates: [] };
  }

  if (serviceKey) {
    const compositeHit = resultFromRows(index.composite.get(`${serviceKey}-${lineKey}`), 'LINELIST-COMPOSITE-MATCH', lineKey);
    if (compositeHit) return compositeHit;
  }

  const simpleHit = resultFromRows(index.simple.get(lineKey), 'LINELIST-EXACT-MATCH', lineKey);
  if (simpleHit) return simpleHit;

  const normalizedKey = normalizeLookup(lineKey);
  const normalizedHit = resultFromRows(index.normalized.get(normalizedKey), 'LINELIST-NORMALIZED-MATCH', lineKey);
  if (normalizedHit) return normalizedHit;

  const fuzzy = (index.candidates || [])
    .map(candidate => ({
      row: candidate.row,
      key: candidate.key,
      score: lineListSimilarity(lineKey, candidate.key),
    }))
    .filter(candidate => candidate.score >= MIN_FUZZY_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  if (fuzzy.length === 1 && fuzzy[0].score >= HIGH_CONFIDENCE_SCORE) {
    return {
      row: fuzzy[0].row,
      match: fuzzy[0].row,
      source: 'LINELIST-FUZZY-MATCH',
      reason: 'MATCH',
      key: fuzzy[0].key,
      score: fuzzy[0].score,
      candidates: fuzzy,
    };
  }

  return {
    row: null,
    match: null,
    source: '',
    reason: fuzzy.length ? 'AMBIGUOUS_FUZZY' : 'NO_MATCH',
    key: lineKey,
    score: fuzzy[0]?.score || 0,
    candidates: fuzzy,
  };
}

function selectDensity(row, fieldMap, options) {
  if (!row) return { density: null, phase: null };
  const densityOptions = { ...DEFAULT_DENSITY_OPTIONS, ...(options || {}) };
  const direct = readLineListValue(row, fieldMap, 'densityDirect', ['DensityDirect', 'Fluid Density', 'Density']);
  const phase = readLineListValue(row, fieldMap, 'phase', ['Phase', 'Fluid Phase']);
  if (direct != null && clean(direct) !== '') return { density: direct, phase };

  const gas = readLineListValue(row, fieldMap, 'densityGas', ['DensityGas', 'Gas Density']);
  const liquid = readLineListValue(row, fieldMap, 'densityLiquid', ['DensityLiquid', 'Liquid Density']);
  const mixed = readLineListValue(row, fieldMap, 'densityMixed', ['DensityMixed', 'Mixed Density']);
  const phaseText = upper(phase);

  let selected = null;
  if (phaseText.startsWith('G')) {
    selected = gas;
  } else if (phaseText.startsWith('M')) {
    selected = densityOptions.mixedPreference === 'Mixed' ? (mixed || liquid) : (liquid || mixed);
  } else {
    selected = liquid;
  }

  if (selected == null || clean(selected) === '') {
    selected = phaseText.startsWith('G') ? densityOptions.defaultGas : densityOptions.defaultLiquid;
  }

  return { density: selected, phase };
}

function fieldSpec(fieldMap, fieldName, fallbackHeader) {
  return {
    valueKey: fieldName,
    header: fieldMap?.[fieldName] || fallbackHeader,
  };
}

export function getLineListCandidateValues(row, fieldMap = {}, densityOptions = {}) {
  const values = {
    lineNo: readLineListValue(row, fieldMap, 'lineNo', ['ColumnX1', 'pipelineRef', 'PIPELINE_REF', 'Line Number']),
    pipingClass: readLineListValue(row, fieldMap, 'pipingClass', ['PipingClass', 'Piping Class', 'Class', 'Spec']),
    rating: readLineListValue(row, fieldMap, 'rating', ['Rating', 'Pressure Class']),
    material: readLineListValue(row, fieldMap, 'material', ['Material', 'Material_Name']),
    schedule: readLineListValue(row, fieldMap, 'schedule', ['Schedule', 'SCH']),
    wallThickness: readLineListValue(row, fieldMap, 'wallThickness', ['Wall Thickness', 'WT']),
    corrosionAllowance: readLineListValue(row, fieldMap, 'corrosionAllowance', ['Corrosion Allowance', 'CA']),
    convertedBore: toNumber(readLineListValue(row, fieldMap, 'convertedBore', ['Converted Bore', 'DN', 'NB', 'Bore'])),
    p1: readLineListValue(row, fieldMap, 'p1', ['P1', 'CA1', 'Design Pressure', 'Pressure']),
    t1: readLineListValue(row, fieldMap, 't1', ['T1', 'CA2', 'Design Temperature', 'Temperature']),
    insThk: readLineListValue(row, fieldMap, 'insThk', ['InsThk', 'CA5', 'Insulation Thickness', 'Ins Thk']),
    insType: readLineListValue(row, fieldMap, 'insType', ['InsType', 'Insulation Type']),
    hp: readLineListValue(row, fieldMap, 'hp', ['HP', 'CA10', 'Hydro Pressure', 'Hydrotest Pressure']),
    density: null,
    phase: null,
    Found: !!row,
    Row: row || null,
    __lineListRow: row || null,
    __unitFieldMap: {
      p1: fieldSpec(fieldMap, 'p1', 'P1'),
      t1: fieldSpec(fieldMap, 't1', 'T1'),
      insThk: fieldSpec(fieldMap, 'insThk', 'InsThk'),
      hp: fieldSpec(fieldMap, 'hp', 'HP'),
    },
  };

  const density = selectDensity(row, fieldMap, densityOptions);
  values.density = density.density;
  values.phase = density.phase;

  return values;
}

function parseJsonStorage(storage, key, fallback) {
  try {
    const raw = storage?.getItem?.(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function fieldMapFromLegacyConfig(config = {}) {
  const smartMap = config.smartMap || {};
  const fieldMap = {};
  for (const [legacyKey, fieldName] of Object.entries(LEGACY_SMART_TO_FIELD)) {
    if (smartMap[legacyKey]) fieldMap[fieldName] = smartMap[legacyKey];
  }
  if (config.keys?.serviceCol) fieldMap.service = config.keys.serviceCol;
  if (config.keys?.sequenceCol) fieldMap.sequence = config.keys.sequenceCol;
  return fieldMap;
}

export function loadLegacyLineListStorage(storage = globalThis.localStorage) {
  const rows = parseJsonStorage(storage, 'pcf_master_linelist', []);
  const config = parseJsonStorage(storage, 'pcf_linelist_config', {});
  const headers = Array.isArray(config.headers) ? config.headers : [];
  const fieldMap = {
    ...autoMapLineListFields(headers, {}),
    ...fieldMapFromLegacyConfig(config),
  };

  return {
    rows: Array.isArray(rows) ? rows : [],
    config: config && typeof config === 'object' ? config : {},
    headers,
    fieldMap,
    keyConfig: {
      serviceCol: config?.keys?.serviceCol || fieldMap.service || '',
      sequenceCol: config?.keys?.sequenceCol || fieldMap.sequence || fieldMap.lineNo || '',
    },
    densityOptions: {
      mixedPreference:
        config?.smartOptions?.densityMixedPreference ||
        config?.smartOptions?.densityLogic?.mixedPreference ||
        DEFAULT_DENSITY_OPTIONS.mixedPreference,
    },
  };
}

export function formatDensityForCa9(value) {
  const text = clean(value);
  if (!text) return '';
  if (/[A-Za-z]/.test(text)) return text;
  return `${text} kg/m3`;
}
