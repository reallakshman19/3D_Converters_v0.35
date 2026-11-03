/**
 * RvmMasterResolutionWorkflow.js
 *
 * Handles interactive/manual master resolution for PCF extraction:
 * 1) Derived piping class approximate / no match against piping class master.
 * 2) Multiple / no matches in weight master for VALVE and FLANGE.
 * 3) No match in line list, with manual CA entry.
 *
 * Resolution decisions are persisted in localStorage and reused.
 */

import {
  buildLineListLookup,
  findLineListMatch,
  formatDensityForCa9,
  getLineListCandidateValues as getLegacyLineListCandidateValues,
  readLineListValue
} from './RvmLineListMasterLogic.js';
import { applyLineListCaUnitsToRow } from './RvmLineListUnitDetector.js';

const STORAGE_KEY = 'rvm_pcf_master_resolution_overrides_v1';

const DEFAULT_PIPING_CLASS_REGEX =
  '(?:^|\\/)[^-\\/]+-[^-]+-[^-]+-[^-]+-([A-Z0-9]+)-[^\\/]+';

const DEFAULT_PIPING_CLASS_REGEX_GROUP = 1;

const DEFAULT_RATING_REGEX = '';
const DEFAULT_RATING_REGEX_GROUP = 1;

const PIPING_CLASS_REGEX_STORAGE_KEY = 'rvm_pcf_piping_class_regex';
const PIPING_CLASS_REGEX_GROUP_STORAGE_KEY = 'rvm_pcf_piping_class_regex_group';
const RATING_REGEX_STORAGE_KEY = 'rvm_pcf_rating_regex';
const RATING_REGEX_GROUP_STORAGE_KEY = 'rvm_pcf_rating_regex_group';

// Line key regex: captures position 4 (index 3) by default — e.g. P1710011 from BTRM-1000-10"-P1710011-66620M0-01
const DEFAULT_LINE_KEY_REGEX = '(?:^|\\/)[^-\\/]+-[^-]+-[^-]+-([A-Z][A-Z0-9]*\\d+)-[^-]+-[^\\/]+';
const DEFAULT_LINE_KEY_REGEX_GROUP = 1;
const LINE_KEY_REGEX_STORAGE_KEY = 'rvm_pcf_line_key_regex';
const LINE_KEY_REGEX_GROUP_STORAGE_KEY = 'rvm_pcf_line_key_regex_group';

const RATING_PRIORITY_TOKENS = Object.freeze([
  '20000',
  '15000',
  '10000',
  '5000',
  '2500',
  '1500',
  '900',
  '600',
  '300',
  '150',
]);

const HIGH_PRESSURE_RATING_TOKENS = Object.freeze([
  '20000',
  '15000',
  '10000',
  '5000',
  '2500',
  '1500',
]);

const ASME_CLASS_RATING_TOKENS = Object.freeze([
  '900',
  '600',
  '300',
  '150',
]);

const MASTER_APPLY_SCOPES = Object.freeze({
  PIPELINE_BORE: 'PIPELINE_BORE',
  PIPELINE: 'PIPELINE',
  LINE_KEY: 'LINE_KEY',
  FULL_DATASET: 'FULL_DATASET',
});

function normalizeMasterApplyScope(value) {
  const v = clean(value).toUpperCase();

  if (v === MASTER_APPLY_SCOPES.PIPELINE) return MASTER_APPLY_SCOPES.PIPELINE;
  if (v === MASTER_APPLY_SCOPES.LINE_KEY) return MASTER_APPLY_SCOPES.LINE_KEY;
  if (v === MASTER_APPLY_SCOPES.FULL_DATASET) return MASTER_APPLY_SCOPES.FULL_DATASET;

  return MASTER_APPLY_SCOPES.PIPELINE_BORE;
}

const HIGH_CONFIDENCE_SCORE = 0.92;
const MIN_FUZZY_SCORE = 0.72;
const LENGTH_TOLERANCE_MM = 4;

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function norm(value) {
  return upper(value).replace(/[^A-Z0-9]/g, '');
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function saveOverrides(overrides) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides || {}));
  } catch {
    // ignore localStorage write failure
  }
}

function ensureBucket(overrides, bucket) {
  if (!overrides[bucket]) overrides[bucket] = {};
  return overrides[bucket];
}

function levenshtein(a, b) {
  const s = norm(a);
  const t = norm(b);

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

      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }

    for (let j = 0; j <= t.length; j += 1) prev[j] = curr[j];
  }

  return prev[t.length];
}

function similarity(a, b) {
  const s = norm(a);
  const t = norm(b);

  if (!s && !t) return 1;
  if (!s || !t) return 0;
  if (s === t) return 1;

  if (s.includes(t) || t.includes(s)) {
    const min = Math.min(s.length, t.length);
    const max = Math.max(s.length, t.length);
    return Math.max(0.86, min / max);
  }

  const dist = levenshtein(s, t);
  return Math.max(0, 1 - dist / Math.max(s.length, t.length));
}

function rowValue(row, keys) {
  const allKeys = Object.keys(row || {});
  for (const key of keys) {
    const exact = allKeys.find(k => k === key);
    if (exact && row[exact] != null && clean(row[exact]) !== '') return row[exact];

    const ci = allKeys.find(k => upper(k) === upper(key));
    if (ci && row[ci] != null && clean(row[ci]) !== '') return row[ci];
  }
  return '';
}

function getRowsFromMaster(masters, key) {
  const block = masters?.[key] || {};

  if (Array.isArray(block)) return block;
  if (Array.isArray(block.rows)) return block.rows;
  if (Array.isArray(block.blocks)) return block.blocks;

  return [];
}

function getLineListRows(masters) {
  return getRowsFromMaster(masters, 'linelist');
}

/**
 * Saved Line List field map (canonical field -> source column), read from the
 * masters block. Used to interpret linelist rows (e.g. the ColumnX1 LineNo Key)
 * during resolution.
 */
function getLineListFieldMap(masters) {
  const block = masters?.linelist;
  if (block && !Array.isArray(block) && block.linelistFieldMap && typeof block.linelistFieldMap === 'object') {
    return block.linelistFieldMap;
  }
  return {};
}

function getPipingClassRows(masters) {
  return getRowsFromMaster(masters, 'pipingClass');
}

function buildKnownPipingClassSet(masters) {
  const known = new Set();

  for (const row of getPipingClassRows(masters)) {
    const value = getPipingClassFromMasterRow(row);
    if (value) known.add(norm(value));
  }

  return known;
}

function getWeightRows(masters) {
  const weightBlockRows = getRowsFromMaster(masters, 'weight');
  if (weightBlockRows.length) return weightBlockRows;

  if (Array.isArray(masters?.valveWeightMaster)) return masters.valveWeightMaster;

  return [];
}

function resolveLengthMm(row) {
  const direct =
    toNumber(row.lengthMm) ??
    toNumber(row.length) ??
    toNumber(row.len) ??
    toNumber(row.valveWeightLengthMm) ??
    toNumber(row.attributes?.lengthMm) ??
    toNumber(row.attributes?.length) ??
    toNumber(row.attributes?.len) ??
    toNumber(row.attributes?.axisLength);

  if (direct != null) return direct;

  const ep1 = row.ep1;
  const ep2 = row.ep2;

  if (
    ep1 &&
    ep2 &&
    Number.isFinite(Number(ep1.x)) &&
    Number.isFinite(Number(ep1.y)) &&
    Number.isFinite(Number(ep1.z)) &&
    Number.isFinite(Number(ep2.x)) &&
    Number.isFinite(Number(ep2.y)) &&
    Number.isFinite(Number(ep2.z))
  ) {
    const dx = Number(ep2.x) - Number(ep1.x);
    const dy = Number(ep2.y) - Number(ep1.y);
    const dz = Number(ep2.z) - Number(ep1.z);

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  return null;
}

function extractRegexGroup(value, regexText, groupNumber) {
  const text = clean(value);
  const rxText = clean(regexText);
  const group = Number(groupNumber || 1);

  if (!text || !rxText) return '';

  try {
    const re = new RegExp(rxText);
    const match = text.match(re);

    if (match && match[group]) return clean(match[group]);
  } catch {
    return '';
  }

  return '';
}

function ratingTokenPattern(token) {
  return new RegExp(
    `(?:^|[^A-Z0-9])(?:CL(?:ASS)?|ANSI)?\\s*${token}\\s*(?:#|LB|LBS|CLASS)?(?=$|[^A-Z0-9])`,
    'i'
  );
}

function normalizeResolvedRating(value) {
  const raw = clean(value);
  if (!raw) return '';

  const n = toNumber(raw);
  if (n == null) return '';

  const token = String(Math.round(n));

  if (RATING_PRIORITY_TOKENS.includes(token)) {
    return token;
  }

  return '';
}

function extractRatingTokenFromPipelineRef(pipelineRef) {
  const ref = clean(pipelineRef);
  if (!ref) return '';

  for (const token of RATING_PRIORITY_TOKENS) {
    if (ratingTokenPattern(token).test(ref)) {
      return token;
    }
  }

  return '';
}

function pipePropertyCacheKey(row) {
  const pipelineRef = norm(row?.pipelineRef || row?.lineNoKey || row?.lineKey || '');
  const bore = toNumber(row?.convertedBore);

  return [
    pipelineRef || 'NO_PIPELINE',
    bore == null ? 'NO_BORE' : `DN${Math.round(bore)}`,
  ].join('||');
}

function pipelinePropertyCacheKey(row) {
  const pipelineRef = norm(row?.pipelineRef || row?.lineNoKey || row?.lineKey || '');

  return pipelineRef || 'NO_PIPELINE';
}

function bestRatingForGroup(values = []) {
  const found = values
    .map(normalizeResolvedRating)
    .filter(Boolean);

  if (!found.length) return '';

  for (const token of RATING_PRIORITY_TOKENS) {
    if (found.includes(token)) return token;
  }

  return found[0] || '';
}

function extractPipingClassTokenFromPipelineRef(pipelineRef) {
  const ref = clean(pipelineRef);
  if (!ref) return '';

  // Example:
  // /BTRM-1000-10"-P1710011-66620M0-01/B1
  // first path segment = BTRM-1000-10"-P1710011-66620M0-01
  const mainSegment = ref.replace(/^\/+/, '').split('/')[0] || '';
  const parts = mainSegment.split('-').map(clean).filter(Boolean);

  if (parts.length >= 5 && /^[A-Z0-9]+$/i.test(parts[4])) {
    return parts[4];
  }

  // Fallback: scan right-to-left for a spec-like token.
  // Exclude line number style P1710011 and simple revision tokens like 01.
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const p = clean(parts[i]);

    if (!/^[A-Z0-9]+$/i.test(p)) continue;
    if (/^P\d+$/i.test(p)) continue;
    if (/^\d{1,2}$/.test(p)) continue;
    if (p.length < 4) continue;
    if (!/[A-Z]/i.test(p) || !/\d/.test(p)) continue;

    return p;
  }

  return '';
}

function extractLineKeyFromPipelineRef(pipelineRef, options = {}) {
  const ref = clean(pipelineRef);
  if (!ref) return '';

  // 1. Try user-configured (or default) regex first.
  const regexText =
    options.lineKeyRegex ||
    localStorage.getItem(LINE_KEY_REGEX_STORAGE_KEY) ||
    DEFAULT_LINE_KEY_REGEX;

  const group = Number(
    options.lineKeyRegexGroup ??
    localStorage.getItem(LINE_KEY_REGEX_GROUP_STORAGE_KEY) ??
    DEFAULT_LINE_KEY_REGEX_GROUP
  );

  const regexResult = extractRegexGroup(ref, regexText, group);
  if (regexResult) return regexResult;

  // 2. Structural fallback for assembled formats like P-17-10011 → P1710011.
  const mainSegment = ref.replace(/^\/+/, '').split('/')[0] || '';
  const parts = mainSegment.split('-').map(clean).filter(Boolean);

  // Position-independent scan: the line key is a letter-prefixed token with at
  // least 4 digits (e.g. S8810101, A8010125, P1710011) at ANY segment position.
  // Scanning (instead of a fixed index) tolerates branch-name variants such as
  // an extra area prefix ".../ASIM-88-1885-..." that shift segment positions.
  for (const candidate of parts) {
    if (/^[A-Z][A-Z0-9]*\d{4,}$/i.test(candidate)) {
      return candidate;
    }
  }

  // Assembled: short letter prefix + consecutive digit segments → join them
  // (handles split variants such as ".../S-8810101-...").
  for (let i = 1; i < parts.length - 1; i++) {
    if (/^[A-Z]{1,3}$/i.test(parts[i]) && /^\d+$/.test(parts[i + 1])) {
      let token = parts[i];
      let j = i + 1;
      while (j < parts.length && /^\d+$/.test(parts[j]) && j < i + 4) {
        token += parts[j];
        j++;
      }
      if (/^[A-Z]\d{4,}$/i.test(token)) {
        return token;
      }
    }
  }

  return '';
}

function choosePipingClassFromPipelineRef(pipelineRef, regexValue) {
  const tokenValue = extractPipingClassTokenFromPipelineRef(pipelineRef);
  const rx = clean(regexValue);
  const token = clean(tokenValue);

  // For known AVEVA-style pipeline refs, the structural token is safer than
  // stale child component data or accidentally-short regex extraction.
  if (token) return token;

  return rx;
}

function extractPipingClassFromPipelineRef(pipelineRef, options = {}) {
  const ref = clean(pipelineRef);
  if (!ref) return '';

  const regexText =
    options.pipingClassRegex ||
    localStorage.getItem(PIPING_CLASS_REGEX_STORAGE_KEY) ||
    DEFAULT_PIPING_CLASS_REGEX;

  const group =
    Number(
      options.pipingClassRegexGroup ??
      localStorage.getItem(PIPING_CLASS_REGEX_GROUP_STORAGE_KEY) ??
      DEFAULT_PIPING_CLASS_REGEX_GROUP
    );

  const regexValue = extractRegexGroup(ref, regexText, group);

  return choosePipingClassFromPipelineRef(ref, regexValue);
}

function extractRatingFromPipelineRef(pipelineRef, options = {}) {
  const ref = clean(pipelineRef);
  if (!ref) return '';

  const regexText =
    options.ratingRegex ||
    localStorage.getItem(RATING_REGEX_STORAGE_KEY) ||
    DEFAULT_RATING_REGEX;

  const group =
    Number(
      options.ratingRegexGroup ??
      localStorage.getItem(RATING_REGEX_GROUP_STORAGE_KEY) ??
      DEFAULT_RATING_REGEX_GROUP
    );

  const regexRating = normalizeResolvedRating(
    extractRegexGroup(ref, regexText, group)
  );

  if (regexRating) return regexRating;

  return extractRatingTokenFromPipelineRef(ref);
}

function normalizeRating(value) {
  return upper(value).replace(/#/g, '');
}

function getPipingClassFromMasterRow(row) {
  return clean(
    row.pipingClass ??
    row.PipingClass ??
    row['Piping Class'] ??
    row.PIPING_CLASS ??
    row.Class ??
    row.CLASS ??
    row.Spec ??
    row.SPEC ??
    row._raw?.['Piping Class'] ??
    row._raw?.PIPING_CLASS ??
    ''
  );
}

function getBoreFromMasterRow(row) {
  return (
    toNumber(row.convertedBore) ??
    toNumber(row['Converted Bore']) ??
    toNumber(row.bore) ??
    toNumber(row.Bore) ??
    toNumber(row.DN) ??
    toNumber(row.NB) ??
    toNumber(row._raw?.['Converted Bore']) ??
    toNumber(row._raw?.DN) ??
    toNumber(row._raw?.NB)
  );
}

function getRatingFromMasterRow(row) {
  return clean(
    row.rating ??
    row.Rating ??
    row.RATING ??
    row.ratingClass ??
    row['Pressure Class'] ??
    row.Class ??
    row.CLASS ??
    row._raw?.Rating ??
    row._raw?.RATING ??
    row._raw?.['Pressure Class'] ??
    ''
  );
}

function getLengthFromWeightRow(row) {
  return (
    toNumber(row.length) ??
    toNumber(row.lengthMm) ??
    toNumber(row['Length (RF-F/F)']) ??
    toNumber(row['RF-F/F']) ??
    toNumber(row.LEN) ??
    toNumber(row.faceToFace) ??
    toNumber(row._raw?.['Length (RF-F/F)']) ??
    toNumber(row._raw?.['RF-F/F']) ??
    toNumber(row._raw?.Length)
  );
}

function getWeightFromWeightRow(row) {
  return (
    toNumber(row.weight) ??
    toNumber(row.valveWeight) ??
    toNumber(row.directWeight) ??
    toNumber(row['RF/RTJ KG']) ??
    toNumber(row['Valve Weight']) ??
    toNumber(row.Weight) ??
    toNumber(row._raw?.['RF/RTJ KG']) ??
    toNumber(row._raw?.['Valve Weight']) ??
    toNumber(row._raw?.Weight)
  );
}

function getDescriptionFromWeightRow(row) {
  return clean(
    row.valveType ??
    row.componentType ??
    row.description ??
    row.Description ??
    row['Type Description'] ??
    row['Valve Type'] ??
    row.Type ??
    row._raw?.['Type Description'] ??
    row._raw?.['Valve Type'] ??
    row._raw?.Type ??
    ''
  );
}

// Piping-class master field extractors (handle raw xlsx column names from
// "Piping class master.xlsx": Size, SCH, Wall thickness, Material_Name,
// Corrosion, plus canonical names after field mapping).
function getWallThicknessFromMasterRow(row) {
  return toNumber(
    row.wallThickness ??
    row['Wall Thickness'] ??
    row['Wall thickness'] ??
    row.WALL_THICKNESS ??
    row.WT ??
    row._raw?.['Wall thickness'] ??
    row._raw?.['Wall Thickness']
  );
}

function getCorrosionFromMasterRow(row) {
  return toNumber(
    row.corrosionAllowance ??
    row.Corrosion ??
    row['Corrosion Allowance'] ??
    row.CORROSION ??
    row.CA ??
    row._raw?.Corrosion ??
    row._raw?.['Corrosion Allowance']
  );
}

function getMaterialFromMasterRow(row) {
  return clean(
    row.material ??
    row.Material ??
    row.Material_Name ??
    row['Material Name'] ??
    row.MATERIAL ??
    row._raw?.Material_Name ??
    row._raw?.Material ??
    ''
  );
}

function getScheduleFromMasterRow(row) {
  return clean(
    row.schedule ??
    row.Schedule ??
    row.SCH ??
    row.SCHEDULE ??
    row._raw?.SCH ??
    row._raw?.Schedule ??
    ''
  );
}

function getLineListKey(row) {
  // ColumnX1 is the explicit, user-derived pipeline-reference key (LineNo Key).
  // Prefer it over a raw `lineNo` column, which is frequently only a partial
  // (e.g. "8010125" instead of the composite "A8010125") and would otherwise
  // shadow the correct join key and yield MASTER-LINELIST-NO_MASTER.
  return clean(
    row.ColumnX1 ??
    row.COLUMNX1 ??
    row._raw?.ColumnX1 ??
    row.lineNoKey ??
    row._raw?.lineNoKey ??
    row.lineNo ??
    row.pipelineRef ??
    row.PIPELINE_REF ??
    row['Pipeline Ref'] ??
    row['Pipeline Reference'] ??
    row._raw?.lineNo ??
    row._raw?.['Pipeline Ref'] ??
    ''
  );
}

function getLineListCandidateValues(row, fieldMap = {}) {
  const values = getLegacyLineListCandidateValues(row, fieldMap, {
    mixedPreference: 'Liquid',
    defaultGas: 1.2,
    defaultLiquid: 1000,
  });
  values.rating = normalizeResolvedRating(values.rating);
  return values;
}

function applyLineListValuesToRow(row, values, source) {
  if (!row.ca) row.ca = {};

  const refClass = extractPipingClassFromPipelineRef(row.pipelineRef);
  const refRating = extractRatingFromPipelineRef(row.pipelineRef);

  // The line list's own piping class column is authoritative for the line; the
  // pipeline-ref token is only a fallback (it can be a spec/job code, e.g.
  // 91261M7, that is not a real class). _resolvePipingClass then validates the
  // effective class against the master.
  if (values.pipingClass) {
    row.pipingClass = values.pipingClass;
    row.pipingClassSource = source;
  } else if (refClass) {
    row.pipingClass = refClass;
    row.pipingClassDerived = refClass;
    row.pipingClassSource = 'PIPELINE-REF-TOKEN';
  }

  const resolvedRating = normalizeResolvedRating(
    row.rating ||
    row.ratingClass ||
    row.ratingDerived ||
    values.rating ||
    refRating ||
    ''
  );

  if (resolvedRating) {
    row.rating = resolvedRating;
    row.ratingDerived = resolvedRating;
    row.ratingSource = 'PIPELINE-LINELIST-RATING';
  }

  // Keep convertedBore as read-only source/row property.
  // Do not require user manual input for convertedBore.
  if (values.convertedBore != null && row.convertedBore == null) {
    row.convertedBore = values.convertedBore;
  }

  if (values.__lineListRow) {
    const unitDiagnostics = [];
    applyLineListCaUnitsToRow({
      row,
      lineListRow: values.__lineListRow,
      fieldMap: values.__unitFieldMap || {},
      diagnostics: unitDiagnostics,
    });
  } else {
    if (values.p1 !== '') row.ca['1'] = values.p1;
    if (values.t1 !== '') row.ca['2'] = values.t1;
    if (values.insThk !== '') row.ca['5'] = values.insThk;
    if (values.hp !== '') row.ca['10'] = values.hp;
  }

  const densityText = formatDensityForCa9(values.density);
  if (densityText) row.ca['9'] = densityText;
  if (values.phase) row.lineListPhase = values.phase;
  if (values.insType) row.insulationType = values.insType;

  row.lineListMatchSource = source;

  if (!Array.isArray(row.diagnostics)) row.diagnostics = [];
  row.diagnostics.push(source);
}

function applyPipingClassMasterToRow(row, candidate, source) {
  const pc = getPipingClassFromMasterRow(candidate);

  if (pc) row.pipingClass = pc;

  const rating = getRatingFromMasterRow(candidate);
  if (rating) row.rating = rating;

  // Fetch corrosion allowance / material / wall thickness / schedule from the
  // matched class+bore master row (fill only where not already set).
  const wall = getWallThicknessFromMasterRow(candidate);
  if (wall != null && (row.wallThickness == null || row.wallThickness === '')) row.wallThickness = wall;
  const corr = getCorrosionFromMasterRow(candidate);
  if (corr != null && (row.corrosionAllowance == null || row.corrosionAllowance === '')) row.corrosionAllowance = corr;
  const material = getMaterialFromMasterRow(candidate);
  if (material && (row.material == null || row.material === '')) row.material = material;
  const schedule = getScheduleFromMasterRow(candidate);
  if (schedule && (row.schedule == null || row.schedule === '')) row.schedule = schedule;

  row.pipingClassMasterMatch = {
    source,
    pipingClass: pc,
    rating,
    wallThickness: wall,
    corrosionAllowance: corr,
    material,
    schedule,
    componentType: clean(candidate.componentType ?? candidate['Component Type'] ?? candidate.Type ?? ''),
    raw: candidate._raw || candidate
  };

  if (!Array.isArray(row.diagnostics)) row.diagnostics = [];
  row.diagnostics.push(source);
}

function applyWeightToRow(row, candidate, source) {
  const weight = getWeightFromWeightRow(candidate);

  if (weight == null) return false;

  if (!row.ca) row.ca = {};
  row.ca['8'] = weight;

  row.weightMatchSource = source;
  row.weightMatchDescription = getDescriptionFromWeightRow(candidate);
  row.valveWeightSource = source;

  if (!Array.isArray(row.diagnostics)) row.diagnostics = [];
  row.diagnostics.push(source);

  return true;
}

function requestId(prefix, row, key) {
  return `${prefix}:${row.sourceCanonicalId || row.rowNo || row.name || 'row'}:${norm(key).slice(0, 80)}`;
}

function byScoreDesc(a, b) {
  return b.score - a.score;
}

export class RvmMasterResolutionWorkflow {
  constructor({ masters = {}, options = {} } = {}) {
    this.masters = masters || {};
    this.options = options || {};
    this._knownPipingClassSet = buildKnownPipingClassSet(this.masters);
    this._lineListFieldMap = getLineListFieldMap(this.masters);
    this._lineListLookup = buildLineListLookup(
      getLineListRows(this.masters),
      this._lineListFieldMap,
      this.masters?.linelist?.keyConfig || {}
    );
    this.overrides = loadOverrides();
  }

  _applyPipePropertyCache(rows = [], diagnostics = []) {
    const boreGroups = new Map();
    const pipelineGroups = new Map();

    for (const row of rows) {
      if (!row || row.include === false) continue;

      const boreKey = pipePropertyCacheKey(row);
      const pipelineKey = pipelinePropertyCacheKey(row);

      if (!boreGroups.has(boreKey)) {
        boreGroups.set(boreKey, {
          key: boreKey,
          pipingClasses: [],
          ratings: [],
          rows: [],
        });
      }

      if (!pipelineGroups.has(pipelineKey)) {
        pipelineGroups.set(pipelineKey, {
          key: pipelineKey,
          pipingClasses: [],
          ratings: [],
          rows: [],
        });
      }

      const boreGroup = boreGroups.get(boreKey);
      const pipelineGroup = pipelineGroups.get(pipelineKey);

      boreGroup.rows.push(row);
      pipelineGroup.rows.push(row);

      const pipeClass =
        extractPipingClassFromPipelineRef(row.pipelineRef, this.options) ||
        row.pipingClassDerived ||
        row.pipingClass ||
        '';

      if (pipeClass) {
        boreGroup.pipingClasses.push(pipeClass);
        pipelineGroup.pipingClasses.push(pipeClass);
      }

      const rating =
        row.rating ||
        row.ratingClass ||
        row.ratingDerived ||
        extractRatingFromPipelineRef(row.pipelineRef, this.options) ||
        '';

      if (rating) {
        boreGroup.ratings.push(rating);
        pipelineGroup.ratings.push(rating);
      }
    }

    for (const boreGroup of boreGroups.values()) {
      const groupPipingClass = clean(boreGroup.pipingClasses[0] || '');

      // Rating rule:
      // 1. Prefer same Pipeline Ref + Bore.
      // 2. If missing, inherit from same Pipeline Ref.
      const sameBoreRating = bestRatingForGroup(boreGroup.ratings);
      const pipelineKey = pipelinePropertyCacheKey(boreGroup.rows[0]);
      const samePipelineRating = bestRatingForGroup(pipelineGroups.get(pipelineKey)?.ratings || []);
      const groupRating = sameBoreRating || samePipelineRating;

      for (const row of boreGroup.rows) {
        if (groupPipingClass) {
          const previous = clean(row.pipingClass);

          row.pipingClass = groupPipingClass;
          row.pipingClassDerived = groupPipingClass;
          row.pipingClassSource = 'PIPELINE-REF-TOKEN-GROUP';

          if (previous && norm(previous) !== norm(groupPipingClass) && this._knownPipingClassSet.has(norm(previous))) {
            diagnostics.push({
              severity: 'WARNING',
              code: 'PCF-CLASS-GROUP-OVERRIDE',
              message: `Component piping class "${previous}" overridden by pipe-group piping class "${groupPipingClass}".`,
              rowNo: row.rowNo,
              componentType: row.type,
              pipelineRef: row.pipelineRef,
              previousPipingClass: previous,
              derivedPipingClass: groupPipingClass,
            });
          }
        }

        if (groupRating) {
          const previousRating = clean(row.rating || row.ratingClass || row.ratingDerived);

          row.rating = groupRating;
          row.ratingDerived = groupRating;
          row.ratingSource = sameBoreRating
            ? 'PIPELINE-BORE-RATING-GROUP'
            : 'PIPELINE-REF-RATING-GROUP';

          if (previousRating && normalizeResolvedRating(previousRating) !== groupRating) {
            diagnostics.push({
              severity: 'WARNING',
              code: 'RATING-GROUP-OVERRIDE',
              message: `Component rating "${previousRating}" overridden by pipe-group rating "${groupRating}".`,
              rowNo: row.rowNo,
              componentType: row.type,
              pipelineRef: row.pipelineRef,
              previousRating,
              derivedRating: groupRating,
            });
          }

          if (!sameBoreRating && samePipelineRating) {
            diagnostics.push({
              severity: 'INFO',
              code: 'RATING-INHERITED-FROM-PIPELINE',
              message: `Rating "${samePipelineRating}" inherited from another bore group with the same Pipeline Ref.`,
              rowNo: row.rowNo,
              componentType: row.type,
              pipelineRef: row.pipelineRef,
              derivedRating: samePipelineRating,
            });
          }
        }
      }
    }
  }

  _applyLineListOverrideOnly(row) {
    const key = this._lineListLookupKey(row);
    if (!key) return;

    const override = this.overrides?.linelist?.[norm(key)];
    if (!override) return;

    if (override.action === 'candidate') {
      applyLineListValuesToRow(row, getLineListCandidateValues(override.candidate, this._lineListFieldMap), 'LINELIST-OVERRIDE');
    } else if (override.action === 'manual') {
      applyLineListValuesToRow(row, override.values, 'LINELIST-OVERRIDE-MANUAL');
    }
  }

  processRows(rows = []) {
    const requests = [];
    const diagnostics = [];

    this._applyPipePropertyCache(rows, diagnostics);

    // Deduplicate LINELIST requests: one representative per line key.
    // PIPE rows are preferred; if no pipe exists, first row wins.
    // Non-representative rows still get saved overrides applied so they stay in sync,
    // but they do NOT generate their own request in the popup.
    const lineKeyRep = new Map();
    for (const row of rows) {
      if (!row || row.include === false) continue;
      const k = norm(this._lineListLookupKey(row));
      if (!k) continue;
      const isPipe = /^PIPE$/i.test(String(row.type || ''));
      if (!lineKeyRep.has(k) || isPipe) lineKeyRep.set(k, row);
    }

    for (const row of rows) {
      if (!row || row.include === false) continue;

      const k = norm(this._lineListLookupKey(row));
      if (k && lineKeyRep.get(k) !== row) {
        this._applyLineListOverrideOnly(row);
      } else {
        this._resolveLineList(row, requests, diagnostics);
      }

      this._resolvePipingClass(row, requests, diagnostics);
      this._resolveWeight(row, requests, diagnostics);
    }

    saveOverrides(this.overrides);

    return { rows, requests, diagnostics };
  }

  applyRequestResolution(rows, request, payload) {
    if (!request || !payload) return { applied: 0, diagnostics: [] };

    const diagnostics = [];
    const applyScope = normalizeMasterApplyScope(payload.applyScope);
    let applied = 0;

    const targetRows = (rows || []).filter(row => {
      if (row?.include === false) return false;

      if (applyScope === MASTER_APPLY_SCOPES.PIPELINE_BORE) {
        if (request.kind === 'PIPING_CLASS' || request.kind === 'LINELIST') {
          return this._samePipePropertyGroup(row, request);
        }

        if (request.kind === 'WEIGHT') {
          return this._weightKey(row) === request.weightKey;
        }

        return false;
      }

      if (applyScope === MASTER_APPLY_SCOPES.PIPELINE) {
        if (request.kind === 'PIPING_CLASS' || request.kind === 'LINELIST') {
          return this._samePipelineGroup(row, request);
        }

        // Weight is still protected from broad unsafe propagation.
        // For weight, Pipeline scope means same pipeline + same weight key.
        if (request.kind === 'WEIGHT') {
          return this._samePipelineGroup(row, request) && this._weightKey(row) === request.weightKey;
        }

        return false;
      }

      if (applyScope === MASTER_APPLY_SCOPES.LINE_KEY) {
        if (request.kind === 'LINELIST') {
          return this._sameLineKeyGroup(row, request);
        }
        return false;
      }

      if (applyScope === MASTER_APPLY_SCOPES.FULL_DATASET) {
        if (request.kind === 'PIPING_CLASS' || request.kind === 'LINELIST') {
          return true;
        }

        // For weight, full dataset applies only to rows with same weight key.
        // This avoids putting one valve/flange weight onto unrelated components.
        if (request.kind === 'WEIGHT') {
          return this._weightKey(row) === request.weightKey;
        }

        return false;
      }

      return false;
    });

    for (const row of targetRows) {
      if (request.kind === 'PIPING_CLASS') {
        const bucket = ensureBucket(this.overrides, 'pipingClass');

        if (payload.action === 'candidate') {
          const candidate = request.candidates[payload.candidateIndex];
          applyPipingClassMasterToRow(row, candidate.row, 'PCF-CLASS-USER-RESOLVED');
          bucket[norm(request.derivedPipingClass)] = {
            action: 'candidate',
            candidate: candidate.row
          };
          applied += 1;
        }

        if (payload.action === 'manual') {
          row.pipingClass = clean(payload.pipingClass);
          if (payload.rating) row.rating = clean(payload.rating);
          row.pipingClassMasterMatch = {
            source: 'PCF-CLASS-MANUAL',
            pipingClass: row.pipingClass,
            rating: row.rating || ''
          };
          bucket[norm(request.derivedPipingClass)] = {
            action: 'manual',
            pipingClass: row.pipingClass,
            rating: row.rating || ''
          };
          applied += 1;
        }
      }

      if (request.kind === 'LINELIST') {
        const bucket = ensureBucket(this.overrides, 'linelist');

        if (payload.action === 'candidate') {
          const candidate = request.candidates[payload.candidateIndex];
          const values = getLineListCandidateValues(candidate.row, this._lineListFieldMap);
          applyLineListValuesToRow(row, values, 'LINELIST-USER-RESOLVED');
          bucket[norm(request.lookupKey)] = {
            action: 'candidate',
            candidate: candidate.row
          };
          applied += 1;
        }

        if (payload.action === 'manual') {
          const values = {
            pipingClass: clean(payload.pipingClass),
            rating: normalizeResolvedRating(payload.rating),
            convertedBore: null,
            p1: clean(payload.p1),
            t1: clean(payload.t1),
            insThk: clean(payload.insThk),
            hp: clean(payload.hp)
          };
          applyLineListValuesToRow(row, values, 'LINELIST-MANUAL');
          bucket[norm(request.lookupKey)] = {
            action: 'manual',
            values
          };
          applied += 1;
        }
      }

      if (request.kind === 'WEIGHT') {
        const bucket = ensureBucket(this.overrides, 'weight');

        if (payload.action === 'candidate') {
          const candidate = request.candidates[payload.candidateIndex];
          if (applyWeightToRow(row, candidate.row, 'WM-WEIGHT-CA8-USER-RESOLVED')) {
            bucket[request.weightKey] = {
              action: 'candidate',
              candidate: candidate.row
            };
            applied += 1;
          }
        }

        if (payload.action === 'manual') {
          if (!row.ca) row.ca = {};
          row.ca['8'] = toNumber(payload.weight);
          row.weightMatchSource = 'WM-WEIGHT-CA8-MANUAL';
          row.valveWeightSource = 'WM-WEIGHT-CA8-MANUAL';
          bucket[request.weightKey] = {
            action: 'manual',
            weight: row.ca['8']
          };
          applied += 1;
        }
      }
    }

    saveOverrides(this.overrides);

    diagnostics.push({
      severity: applied ? 'INFO' : 'WARNING',
      code: applied ? 'MASTER-RESOLUTION-APPLIED' : 'MASTER-RESOLUTION-NOT-APPLIED',
      message: `${applied} row(s) updated for ${request.kind}.`,
      requestId: request.id
    });

    return { applied, diagnostics };
  }

  _resolveLineList(row, requests, diagnostics) {
    const key = this._lineListLookupKey(row);
    if (!key) return;

    const override = this.overrides?.linelist?.[norm(key)];
    if (override) {
      if (override.action === 'candidate') {
        applyLineListValuesToRow(row, getLineListCandidateValues(override.candidate, this._lineListFieldMap), 'LINELIST-OVERRIDE');
      } else if (override.action === 'manual') {
        applyLineListValuesToRow(row, override.values, 'LINELIST-OVERRIDE-MANUAL');
      }
      return;
    }

    if (!this._lineListLookup.rows.length) {
      requests.push(this._lineListRequest(row, key, [], 'NO_MASTER'));
      return;
    }

    const matchResult = findLineListMatch({
      lineNo: key,
      pipelineRef: row.pipelineRef,
      service: row.service || row.attributes?.Service || row.attributes?.SERVICE || ''
    }, this._lineListLookup);

    if (matchResult.match) {
      applyLineListValuesToRow(
        row,
        getLineListCandidateValues(matchResult.match, this._lineListFieldMap),
        matchResult.source || 'LINELIST-EXACT-MATCH'
      );
      if (matchResult.source === 'LINELIST-FUZZY-MATCH') {
        diagnostics.push({
          severity: 'WARNING',
          code: 'LINELIST-FUZZY-MATCH',
          message: `Line list fuzzy match used: ${key} -> ${matchResult.key}`,
          rowNo: row.rowNo,
          score: matchResult.score
        });
      }
      return;
    }

    if (matchResult.reason === 'AMBIGUOUS_EXACT') {
      requests.push(this._lineListRequest(row, key, matchResult.candidates, 'AMBIGUOUS_EXACT'));
      return;
    }

    requests.push(this._lineListRequest(
      row,
      key,
      matchResult.candidates || [],
      matchResult.reason === 'AMBIGUOUS_FUZZY' ? 'AMBIGUOUS_FUZZY' : 'NO_MATCH'
    ));
  }

  _resolvePipingClass(row, requests, diagnostics) {
    const refDerived = this._derivedPipingClass(row);
    const derivedRating = this._derivedRating(row);
    // Piping class set by the line-list resolution (runs before this).
    const linelistClass = clean(row.pipingClass);

    // A pipeline-ref token is authoritative ONLY when it is a known piping class
    // (present in the master). Otherwise it is likely a spec/job code such as
    // "91261M7" in /ASIM-1885-10"-S8810101-91261M7-HC/B1 and must not override
    // the line-list class (e.g. 13421). The effective class then drives the
    // master lookup so wall/corrosion/material are fetched by class+bore.
    let derived = '';
    let source = '';
    if (refDerived && this._knownPipingClassSet.has(norm(refDerived))) {
      derived = refDerived;
      source = 'PIPELINE-REF-TOKEN';
    } else if (linelistClass) {
      derived = linelistClass;
      source = 'LINELIST';
    } else if (refDerived) {
      derived = refDerived;
      source = 'PIPELINE-REF-TOKEN';
    }

    if (derived) {
      const previous = linelistClass;

      row.pipingClass = derived;
      row.pipingClassDerived = derived;
      row.pipingClassSource = source;

      if (previous && norm(previous) !== norm(derived) && this._knownPipingClassSet.has(norm(previous))) {
        diagnostics.push({
          severity: 'WARNING',
          code: 'PCF-CLASS-CHILD-VALUE-OVERRIDDEN',
          message: `Component piping class "${previous}" overridden by pipeline reference piping class "${derived}".`,
          rowNo: row.rowNo,
          componentType: row.type,
          pipelineRef: row.pipelineRef,
          previousPipingClass: previous,
          derivedPipingClass: derived,
        });
      }
    }

    if (derivedRating) {
      row.rating = derivedRating;
      row.ratingDerived = derivedRating;
      row.ratingSource = row.ratingSource || 'PIPELINE-REF-RATING-GROUP';
    }

    if (!derived) return;

    const override = this.overrides?.pipingClass?.[norm(derived)];
    if (override) {
      if (override.action === 'candidate') {
        applyPipingClassMasterToRow(row, override.candidate, 'PCF-CLASS-OVERRIDE');
      } else if (override.action === 'manual') {
        row.pipingClass = override.pipingClass;
        if (override.rating) row.rating = override.rating;
        row.pipingClassMasterMatch = {
          source: 'PCF-CLASS-OVERRIDE-MANUAL',
          pipingClass: row.pipingClass,
          rating: row.rating || ''
        };
      }
      return;
    }

    const rows = getPipingClassRows(this.masters);
    if (!rows.length) {
      requests.push(this._pipingClassRequest(row, derived, [], 'NO_MASTER'));
      return;
    }

    // Match by piping class AND bore (the master holds one row per class+size),
    // so corrosion/material/wall thickness are fetched for the right size.
    const derivedBore = toNumber(row.convertedBore);
    const exact = rows
      .map(r => {
        const pc = getPipingClassFromMasterRow(r);
        const mBore = getBoreFromMasterRow(r);
        const classOk = norm(pc) === norm(derived);
        const boreOk = derivedBore == null || mBore == null || Math.abs(mBore - derivedBore) < 1;
        return { row: r, pipingClass: pc, bore: mBore, score: classOk && boreOk ? 1 : 0 };
      })
      .filter(c => c.score === 1);

    if (exact.length === 1) {
      applyPipingClassMasterToRow(row, exact[0].row, 'PCF-CLASS-EXACT-MATCH');
      return;
    }

    if (exact.length > 1) {
      requests.push(this._pipingClassRequest(row, derived, exact, 'AMBIGUOUS_EXACT'));
      return;
    }

    const fuzzy = rows
      .map(r => {
        const pc = getPipingClassFromMasterRow(r);
        return { row: r, pipingClass: pc, score: similarity(derived, pc) };
      })
      .filter(c => c.score >= MIN_FUZZY_SCORE)
      .sort(byScoreDesc)
      .slice(0, 10);

    if (
      fuzzy.length === 1 &&
      fuzzy[0].score >= HIGH_CONFIDENCE_SCORE
    ) {
      applyPipingClassMasterToRow(row, fuzzy[0].row, 'PCF-CLASS-FUZZY-MATCH');
      diagnostics.push({
        severity: 'WARNING',
        code: 'PCF-CLASS-FUZZY-MATCH',
        message: `Piping class fuzzy match used: ${derived} -> ${fuzzy[0].pipingClass}`,
        rowNo: row.rowNo,
        score: fuzzy[0].score
      });
      return;
    }

    if (
      fuzzy.length >= 2 &&
      fuzzy[0].score >= HIGH_CONFIDENCE_SCORE &&
      fuzzy[0].score - fuzzy[1].score >= 0.08
    ) {
      applyPipingClassMasterToRow(row, fuzzy[0].row, 'PCF-CLASS-FUZZY-MATCH');
      diagnostics.push({
        severity: 'WARNING',
        code: 'PCF-CLASS-FUZZY-MATCH',
        message: `Piping class fuzzy match used: ${derived} -> ${fuzzy[0].pipingClass}`,
        rowNo: row.rowNo,
        score: fuzzy[0].score
      });
      return;
    }

    requests.push(this._pipingClassRequest(row, derived, fuzzy, fuzzy.length ? 'AMBIGUOUS_FUZZY' : 'NO_MATCH'));
  }

  _resolveWeight(row, requests) {
    const type = upper(row.type);
    if (!['VALVE', 'FLANGE'].includes(type)) return;

    const weightKey = this._weightKey(row);
    if (!weightKey) return;

    const override = this.overrides?.weight?.[weightKey];
    if (override) {
      if (override.action === 'candidate') {
        applyWeightToRow(row, override.candidate, 'WM-WEIGHT-CA8-OVERRIDE');
      } else if (override.action === 'manual') {
        if (!row.ca) row.ca = {};
        row.ca['8'] = override.weight;
        row.weightMatchSource = 'WM-WEIGHT-CA8-OVERRIDE-MANUAL';
        row.valveWeightSource = 'WM-WEIGHT-CA8-OVERRIDE-MANUAL';
      }
      return;
    }

    const boreMm = toNumber(row.convertedBore);
    const rating = row.rating ?? row.ratingClass ?? row.pipingClass ?? '';
    const lengthMm = resolveLengthMm(row);

    if (boreMm == null || !clean(rating) || lengthMm == null) {
      requests.push(this._weightRequest(row, weightKey, [], 'KEY_INCOMPLETE'));
      return;
    }

    const rows = getWeightRows(this.masters);

    if (!rows.length) {
      requests.push(this._weightRequest(row, weightKey, [], 'NO_MASTER'));
      return;
    }

    const candidates = rows
      .map(r => {
        const bore = getBoreFromMasterRow(r);
        const rRating = getRatingFromMasterRow(r);
        const length = getLengthFromWeightRow(r);
        const weight = getWeightFromWeightRow(r);

        const ratingMatch = normalizeRating(rRating) === normalizeRating(rating);
        const boreMatch = bore != null && Math.abs(bore - boreMm) < 1;
        const lengthDelta = length == null ? Infinity : Math.abs(length - lengthMm);
        const lengthMatch = lengthDelta <= LENGTH_TOLERANCE_MM;

        return {
          row: r,
          bore,
          rating: rRating,
          length,
          lengthDelta,
          weight,
          description: getDescriptionFromWeightRow(r),
          score: ratingMatch && boreMatch && lengthMatch ? 1 : 0
        };
      })
      .filter(c => c.score === 1);

    if (candidates.length === 1) {
      applyWeightToRow(row, candidates[0].row, 'WM-WEIGHT-CA8-MATCH');
      return;
    }

    requests.push(
      this._weightRequest(
        row,
        weightKey,
        candidates,
        candidates.length > 1 ? 'AMBIGUOUS' : 'NO_MATCH'
      )
    );
  }

  _derivedPipingClass(row) {
    const fromPipelineRef = extractPipingClassFromPipelineRef(row.pipelineRef, this.options);

    if (fromPipelineRef) {
      return clean(fromPipelineRef);
    }

    return clean(
      row.pipingClassDerived ||
      row.pipingClass ||
      ''
    );
  }

  _derivedRating(row) {
    const existing = normalizeResolvedRating(
      row.rating ||
      row.ratingClass ||
      row.ratingDerived ||
      ''
    );

    if (existing) return existing;

    return normalizeResolvedRating(
      extractRatingFromPipelineRef(row.pipelineRef, this.options)
    );
  }

  _samePipelineGroup(row, request) {
    const requestPipeRef = norm(request.pipelineRef || request.lookupKey || '');
    const rowPipeRef = norm(row.pipelineRef || row.lineNoKey || row.lineKey || row.name || '');

    return Boolean(requestPipeRef && rowPipeRef && requestPipeRef === rowPipeRef);
  }

  _samePipePropertyGroup(row, request) {
    const requestPipeRef = norm(request.pipelineRef || request.lookupKey || '');
    const rowPipeRef = norm(row.pipelineRef || row.lineNoKey || row.lineKey || row.name || '');

    if (!requestPipeRef || !rowPipeRef || requestPipeRef !== rowPipeRef) {
      return false;
    }

    const requestBore = toNumber(request.boreMm);
    const rowBore = toNumber(row.convertedBore);

    // If bore is known, group by pipeline + bore.
    if (requestBore != null && rowBore != null) {
      return Math.abs(requestBore - rowBore) < 1;
    }

    // If bore is missing, fall back to pipeline only.
    // This is still safer than splitting by component type.
    return true;
  }

  _sameLineKeyGroup(row, request) {
    const requestKey = norm(
      request.extractedLineKey ||
      extractLineKeyFromPipelineRef(request.pipelineRef || '', this.options) ||
      request.lookupKey ||
      ''
    );
    const rowKey = norm(
      extractLineKeyFromPipelineRef(row.pipelineRef || '', this.options) ||
      row.lineNoKey ||
      row.lineKey ||
      ''
    );
    return Boolean(requestKey && rowKey && requestKey === rowKey);
  }

  _lineListLookupKey(row) {
    const extracted = extractLineKeyFromPipelineRef(row.pipelineRef || '', this.options);
    if (extracted) return extracted;
    return clean(row.lineNoKey || row.lineKey || row.pipelineRef || row.name || row.sourcePath || '');
  }

  _weightKey(row) {
    const boreMm = toNumber(row.convertedBore);
    const rating = clean(row.rating || row.ratingClass || row.pipingClass || '');
    const lengthMm = resolveLengthMm(row);
    const type = upper(row.type);

    if (boreMm == null || !rating || lengthMm == null) {
      return `${type}|${rating || 'NO_RATING'}|${boreMm ?? 'NO_BORE'}|${lengthMm ?? 'NO_LENGTH'}`;
    }

    return `${type}|${normalizeRating(rating)}|DN${Math.round(boreMm)}|L${Math.round(lengthMm)}`;
  }

  _pipingClassRequest(row, derivedPipingClass, candidates, reason) {
    return {
      id: requestId('PIPING_CLASS', row, derivedPipingClass),
      kind: 'PIPING_CLASS',
      reason,
      rowId: String(row.sourceCanonicalId || row.rowNo),
      rowNo: row.rowNo,
      componentType: row.type,
      name: row.name || row.componentName || '',
      pipelineRef: row.pipelineRef || '',
      lineNo: row.lineNo || row.lineNoKey || row.lineKey || '',
      boreMm: toNumber(row.convertedBore),
      derivedPipingClass,
      derivedRating: this._derivedRating(row),
      rating: this._derivedRating(row),
      candidates
    };
  }

  _lineListRequest(row, lookupKey, candidates, reason) {
    return {
      id: requestId('LINELIST', row, lookupKey),
      kind: 'LINELIST',
      reason,
      rowId: String(row.sourceCanonicalId || row.rowNo),
      rowNo: row.rowNo,
      componentType: row.type,
      name: row.name || row.componentName || '',
      pipelineRef: row.pipelineRef || '',
      lineNo: row.lineNo || row.lineNoKey || row.lineKey || '',
      boreMm: toNumber(row.convertedBore),
      derivedPipingClass: this._derivedPipingClass(row),
      derivedRating: this._derivedRating(row),
      rating: this._derivedRating(row),
      lookupKey,
      extractedLineKey: extractLineKeyFromPipelineRef(row.pipelineRef || ''),
      lineListFieldMap: this._lineListFieldMap,
      candidates
    };
  }

  _weightRequest(row, weightKey, candidates, reason) {
    return {
      id: requestId('WEIGHT', row, weightKey),
      kind: 'WEIGHT',
      reason,
      rowId: String(row.sourceCanonicalId || row.rowNo),
      rowNo: row.rowNo,
      componentType: row.type,
      name: row.name || row.componentName || '',
      pipelineRef: row.pipelineRef || '',
      lineNo: row.lineNo || row.lineNoKey || row.lineKey || '',
      weightKey,
      boreMm: toNumber(row.convertedBore),
      rating: this._derivedRating(row),
      derivedPipingClass: this._derivedPipingClass(row),
      derivedRating: this._derivedRating(row),
      lengthMm: resolveLengthMm(row),
      candidates
    };
  }
}

function requestTitle(request) {
  if (request.kind === 'PIPING_CLASS') {
    return `Piping class resolution — ${request.derivedPipingClass || '(blank)'}`;
  }

  if (request.kind === 'LINELIST') {
    return `Line list resolution — ${request.lookupKey || request.pipelineRef || '(blank)'}`;
  }

  if (request.kind === 'WEIGHT') {
    return `Weight resolution — ${request.weightKey || '(blank)'}`;
  }

  return 'Master resolution';
}

function requestBoreLabel(request) {
  const bore = toNumber(request.boreMm);
  return bore == null ? '—' : `${Math.round(bore)} DN`;
}

function requestPipeClassLabel(request) {
  return clean(
    request.derivedPipingClass ||
    request.pipingClass ||
    ''
  ) || '—';
}

function requestRatingLabel(request) {
  return clean(
    request.derivedRating ||
    request.rating ||
    ''
  ) || '—';
}

function requestLineLabel(request) {
  return clean(
    request.lineNo ||
    request.lookupKey ||
    request.pipelineRef ||
    ''
  ) || '—';
}

function masterResolutionPipePropertyKey(request) {
  return [
    norm(request.pipelineRef || request.lookupKey || ''),
    request.boreMm == null ? 'NO_BORE' : `DN${Math.round(Number(request.boreMm))}`,
  ].join('||');
}

function masterResolutionGroupKey(request) {
  // Important:
  // Do not split line-list / piping-class resolution by component type.
  // Pipe-level properties apply to all children on the same pipeline + bore:
  // PIPE, BEND, TEE, OLET, FLANGE, VALVE, SUPPORT-associated rows, etc.
  if (request.kind === 'LINELIST' || request.kind === 'PIPING_CLASS') {
    return masterResolutionPipePropertyKey(request);
  }

  // Weight remains component-sensitive because weight depends on
  // component type + bore + rating + length.
  if (request.kind === 'WEIGHT') {
    return [
      request.kind || 'WEIGHT',
      request.componentType || '',
      norm(request.pipelineRef || ''),
      request.boreMm == null ? 'NO_BORE' : `DN${Math.round(Number(request.boreMm))}`,
      normalizeRating(request.rating || request.derivedRating || request.derivedPipingClass || ''),
      request.lengthMm == null ? 'NO_LENGTH' : `L${Math.round(Number(request.lengthMm))}`,
    ].join('||');
  }

  return masterResolutionPipePropertyKey(request);
}

function groupMasterRequests(requests = []) {
  const groups = [];
  const map = new Map();

  for (let i = 0; i < requests.length; i += 1) {
    const request = requests[i];
    const key = masterResolutionGroupKey(request);

    if (!map.has(key)) {
      const group = {
        key,
        pipelineRef: request.pipelineRef || request.lookupKey || '(no pipeline)',
        bore: requestBoreLabel(request),
        kinds: new Set(),
        componentTypes: new Set(),
        reasons: new Set(),
        pipingClass: requestPipeClassLabel(request),
        rating: requestRatingLabel(request),
        requests: [],
      };

      map.set(key, group);
      groups.push(group);
    }

    const group = map.get(key);

    if (request.kind) group.kinds.add(request.kind);
    if (request.componentType) group.componentTypes.add(request.componentType);
    if (request.reason) group.reasons.add(request.reason);

    if ((!group.pipingClass || group.pipingClass === '—') && requestPipeClassLabel(request) !== '—') {
      group.pipingClass = requestPipeClassLabel(request);
    }

    if ((!group.rating || group.rating === '—') && requestRatingLabel(request) !== '—') {
      group.rating = requestRatingLabel(request);
    }

    group.requests.push({
      request,
      index: i,
    });
  }

  return groups.sort((a, b) => {
    return String(a.pipelineRef).localeCompare(String(b.pipelineRef)) ||
      String(a.bore).localeCompare(String(b.bore));
  });
}

function renderRegexHeader(activeRequest) {
  const currentPipingRegex =
    localStorage.getItem(PIPING_CLASS_REGEX_STORAGE_KEY) ||
    DEFAULT_PIPING_CLASS_REGEX;

  const currentPipingGroup =
    Number(localStorage.getItem(PIPING_CLASS_REGEX_GROUP_STORAGE_KEY) || DEFAULT_PIPING_CLASS_REGEX_GROUP);

  const currentRatingRegex =
    localStorage.getItem(RATING_REGEX_STORAGE_KEY) ||
    DEFAULT_RATING_REGEX;

  const currentRatingGroup =
    Number(localStorage.getItem(RATING_REGEX_GROUP_STORAGE_KEY) || DEFAULT_RATING_REGEX_GROUP);

  const currentLineKeyRegex =
    localStorage.getItem(LINE_KEY_REGEX_STORAGE_KEY) ||
    DEFAULT_LINE_KEY_REGEX;

  const currentLineKeyGroup =
    Number(localStorage.getItem(LINE_KEY_REGEX_GROUP_STORAGE_KEY) || DEFAULT_LINE_KEY_REGEX_GROUP);

  const pipelineRef = activeRequest?.pipelineRef || '';
  const previewPipingClass = extractPipingClassFromPipelineRef(pipelineRef, {
    pipingClassRegex: currentPipingRegex,
    pipingClassRegexGroup: currentPipingGroup,
  });

  const previewRating = extractRatingFromPipelineRef(pipelineRef, {
    ratingRegex: currentRatingRegex,
    ratingRegexGroup: currentRatingGroup,
  });

  const previewLineKey = extractLineKeyFromPipelineRef(pipelineRef, {
    lineKeyRegex: currentLineKeyRegex,
    lineKeyRegexGroup: currentLineKeyGroup,
  });

  return `
    <div class="rvm-master-regex-header">
      <div class="rvm-master-regex-title">Pipeline Reference Reader</div>

      <div class="rvm-master-simple-help">
        <div class="rvm-master-help-line">
          <b>Example pipeline ref:</b>
          <code>/BTRM-1000-10"-P1710011-66620M0-01/B1</code>
        </div>
        <div class="rvm-master-help-line">
          This is split by <b>-</b> dashes into numbered positions:
        </div>
        <table class="rvm-master-seg-table">
          <thead><tr><th>Pos</th><th>Value</th><th>Meaning</th></tr></thead>
          <tbody>
            <tr><td>1</td><td>BTRM</td><td>Plant / unit code</td></tr>
            <tr><td>2</td><td>1000</td><td>System / line number</td></tr>
            <tr><td>3</td><td>10"</td><td>Bore / diameter</td></tr>
            <tr><td>4</td><td><b>P1710011</b></td><td><b>Line key</b> — used to look up the linelist master</td></tr>
            <tr><td>5</td><td><b style="color:#6ee7b7">66620M0</b></td><td><b style="color:#6ee7b7">Piping class — The app reads <b>66620M0</b> as the <b>Piping Class</b></b></td></tr>
            <tr><td>6</td><td>01</td><td>Sequence / revision</td></tr>
          </tbody>
        </table>
        <div class="rvm-master-help-line" style="margin-top:6px">
          Rating is only extracted if the text contains a class value like <b>300</b>, <b>600</b>, <b>CL600</b>, or <b>600#</b>.
        </div>
      </div>

      <div class="rvm-master-regex-preview">
        <div><b>Pipeline Ref</b></div>
        <div>${esc(pipelineRef || '—')}</div>

        <div><b>Line Key</b></div>
        <div data-regex-preview-line-key>${esc(previewLineKey || '—')}</div>

        <div><b>Piping Class</b></div>
        <div data-regex-preview-piping-class>${esc(previewPipingClass || '—')}</div>

        <div><b>Rating</b></div>
        <div data-regex-preview-rating>${esc(previewRating || '—')}</div>
      </div>

      <details class="rvm-master-advanced-regex">
        <summary>Advanced extraction settings (custom regex)</summary>

        <div class="rvm-master-regex-explainer">
          <p>
            The <b>Piping Class Regex</b> is a regular expression applied to the pipeline reference string.
            It uses a <b>capture group</b> (the part inside parentheses) to pull out the value you want.
          </p>
          <p>
            Each regex skips dash-separated positions and captures one group (the value in parentheses).<br>
            <b>How to read the pattern</b> — example for piping class (position 5):
          </p>
          <table class="rvm-master-seg-table">
            <thead><tr><th>Regex part</th><th>Skips / captures</th><th>Example value</th></tr></thead>
            <tbody>
              <tr><td><code>(?:^|\/)</code></td><td>Path start or <code>/</code> separator</td><td></td></tr>
              <tr><td><code>[^-\/]+</code></td><td>Position 1 (skip)</td><td>BTRM</td></tr>
              <tr><td><code>-[^-]+-[^-]+-[^-]+-</code></td><td>Positions 2, 3, 4 (skip)</td><td>1000, 10", <b>P1710011</b></td></tr>
              <tr><td><code>(<b>[A-Z0-9]+</b>)</code></td><td>Position 5 — <b>captured</b></td><td><b>66620M0</b></td></tr>
              <tr><td><code>-[^\/]+</code></td><td>Position 6+ (ignored)</td><td>01</td></tr>
            </tbody>
          </table>
          <p>
            <b>To capture position 4 (line key)</b> instead, remove one <code>-[^-]+</code> skip block.<br>
            The <b>Line Key Regex</b> input below already defaults to position 4.
          </p>
        </div>

        <div class="rvm-master-regex-grid">
          <label>
            <span>Line Key Regex <em>(pos 4 by default)</em></span>
            <input data-regex-key="lineKeyRegex" type="text" value="${esc(currentLineKeyRegex)}"
              placeholder="(?:^|\\/)[^-\\/]+-[^-]+-[^-]+-([A-Z][A-Z0-9]*\\d+)-[^-]+-[^\\/]+">
          </label>

          <label title="Which capturing parenthesis ( ) in the regex holds the value to extract. 1 = first ( ), 2 = second ( ), etc.">
            <span>Which ( ) to extract <em>(group #)</em></span>
            <input data-regex-key="lineKeyRegexGroup" type="number" min="1" step="1" value="${esc(currentLineKeyGroup)}">
          </label>

          <label>
            <span>Piping Class Regex <em>(pos 5 by default)</em></span>
            <input data-regex-key="pipingClassRegex" type="text" value="${esc(currentPipingRegex)}"
              placeholder="(?:^|\\/)[^-\\/]+-[^-]+-[^-]+-[^-]+-([A-Z0-9]+)-[^\\/]+">
          </label>

          <label title="Which capturing parenthesis ( ) in the regex holds the value to extract. 1 = first ( ), 2 = second ( ), etc.">
            <span>Which ( ) to extract <em>(group #)</em></span>
            <input data-regex-key="pipingClassRegexGroup" type="number" min="1" step="1" value="${esc(currentPipingGroup)}">
          </label>

          <label>
            <span>Rating Regex (optional)</span>
            <input data-regex-key="ratingRegex" type="text" value="${esc(currentRatingRegex)}"
              placeholder="e.g. (\\d+)# to match 600# style">
          </label>

          <label title="Which capturing parenthesis ( ) in the regex holds the value to extract. 1 = first ( ), 2 = second ( ), etc.">
            <span>Which ( ) to extract <em>(group #)</em></span>
            <input data-regex-key="ratingRegexGroup" type="number" min="1" step="1" value="${esc(currentRatingGroup)}">
          </label>
        </div>

        <div class="rvm-master-regex-actions">
          <button type="button" data-action="save-regex">Save Regex</button>
          <span data-regex-status>Saved regex is applied on the next Rebuild 2D CSV / PCF build.</span>
        </div>
      </details>
    </div>
  `;
}

function candidateCellText(request, candidate) {
  if (!candidate) return '';

  if (request.kind === 'PIPING_CLASS') {
    const rating = getRatingFromMasterRow(candidate.row);
    return `${candidate.pipingClass || getPipingClassFromMasterRow(candidate.row)}${rating ? ` | Rating ${rating}` : ''} | Score ${(candidate.score || 0).toFixed(3)}`;
  }

  if (request.kind === 'LINELIST') {
    const values = getLineListCandidateValues(candidate.row, request.lineListFieldMap || {});
    const caItems = [
      values.p1 ? `CA1=${values.p1}` : '',
      values.t1 ? `CA2=${values.t1}` : '',
      values.insThk ? `CA5=${values.insThk}` : '',
      values.density ? `CA9=${values.density}` : '',
      values.hp ? `CA10=${values.hp}` : '',
    ].filter(Boolean).join(', ');
    return `${values.lineNo || candidate.key || ''} | PC ${values.pipingClass || '—'} | Bore ${values.convertedBore ?? '—'} | Score ${(candidate.score || 0).toFixed(3)}${caItems ? ` | ${caItems}` : ' | (no CA data)'}`;
  }

  if (request.kind === 'WEIGHT') {
    return `${candidate.description || ''} | Bore ${candidate.bore ?? '—'} | Rating ${candidate.rating || '—'} | Length ${candidate.length ?? '—'} | Weight ${candidate.weight ?? '—'}`;
  }

  return JSON.stringify(candidate.row || candidate);
}

function renderCandidateRows(request) {
  const candidates = request.candidates || [];

  if (!candidates.length) {
    return `<div class="rvm-master-empty">No candidates found. Use manual entry.</div>`;
  }

  return `
    <div class="rvm-master-candidate-sheet">
      <table>
        <thead>
          <tr>
            <th>Select</th>
            <th>Candidate</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          ${candidates.map((candidate, index) => `
            <tr>
              <td>
                <input type="radio" name="candidateIndex" value="${index}" ${index === 0 ? 'checked' : ''}>
              </td>
              <td>${esc(candidateCellText(request, candidate))}</td>
              <td>${esc(candidate.score != null ? Number(candidate.score).toFixed(3) : '—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderManualFields(request) {
  if (request.kind === 'PIPING_CLASS') {
    return `
      <div class="rvm-master-manual-grid">
        <label>
          <span>Piping Class</span>
          <input name="manualPipingClass" value="${esc(request.derivedPipingClass || '')}" placeholder="e.g. 66620M0">
        </label>

        <label>
          <span>Rating</span>
          <input name="manualRating" value="${esc(request.derivedRating || request.rating || '')}" placeholder="e.g. 150 / 300 / 600 / 150#">
        </label>
      </div>
    `;
  }

  if (request.kind === 'LINELIST') {
    return `
      <div class="rvm-master-readonly-strip">
        <div><b>Pipeline Ref</b><span>${esc(request.pipelineRef || '—')}</span></div>
        <div><b>Bore</b><span>${esc(requestBoreLabel(request))}</span></div>
        <div><b>Derived Piping Class</b><span>${esc(requestPipeClassLabel(request))}</span></div>
        <div><b>Derived Rating</b><span>${esc(requestRatingLabel(request))}</span></div>
      </div>

      <div class="rvm-master-note">
        Converted Bore is not required as manual input because bore is already available from the selected row.
      </div>

      <div class="rvm-master-manual-grid">
        <label>
          <span>Piping Class Override (optional)</span>
          <input name="manualPipingClass" value="${esc(request.derivedPipingClass || '')}" placeholder="leave blank to keep derived">
        </label>

        <label>
          <span>CA1 / P1</span>
          <input name="manualP1" placeholder="e.g. kPa with unit">
        </label>

        <label>
          <span>CA2 / T1</span>
          <input name="manualT1" placeholder="e.g. °C with unit">
        </label>

        <label>
          <span>CA5 / Insulation Thickness</span>
          <input name="manualInsThk" placeholder="e.g. 45 mm">
        </label>

        <label>
          <span>CA10 / HP</span>
          <input name="manualHp" placeholder="e.g. kPa with unit">
        </label>
      </div>
    `;
  }

  if (request.kind === 'WEIGHT') {
    return `
      <div class="rvm-master-readonly-strip">
        <div><b>Pipeline Ref</b><span>${esc(request.pipelineRef || '—')}</span></div>
        <div><b>Bore</b><span>${esc(requestBoreLabel(request))}</span></div>
        <div><b>Rating</b><span>${esc(request.rating || request.derivedRating || request.derivedPipingClass || '—')}</span></div>
        <div><b>Length</b><span>${esc(request.lengthMm != null ? `${Math.round(request.lengthMm)} mm` : '—')}</span></div>
      </div>

      <div class="rvm-master-manual-grid">
        <label>
          <span>Manual Weight / CA8</span>
          <input name="manualWeight" type="number" step="0.001" placeholder="kg">
        </label>
      </div>
    `;
  }

  return '';
}

function renderGroupedDataSheet(requests, activeIndex) {
  const groups = groupMasterRequests(requests);

  return `
    <div class="rvm-master-sheet">
      ${groups.map(group => `
        <div class="rvm-master-group">
          <div class="rvm-master-group-title">
            <span>${esc(group.pipelineRef)}</span>
            <b>→ Bore ${esc(group.bore)}</b>
            <em>
              Pipe properties / ${esc(Array.from(group.kinds).join(', ') || 'MASTER')} / ${group.requests.length} request(s)
            </em>

          </div>

          <table class="rvm-master-sheet-table">
            <thead>
              <tr>
                <th></th>
                <th>Kind</th>
                <th>Row</th>
                <th>Type</th>
                <th>Line / Lookup</th>
                <th>Piping Class</th>
                <th>Rating</th>
                <th>Reason</th>
                <th>Candidates</th>
              </tr>
            </thead>
            <tbody>
              ${group.requests.map(({ request, index }) => `
                <tr class="${index === activeIndex ? 'is-active' : ''}">
                  <td>
                    <button type="button" data-select-request="${index}">Open</button>
                  </td>
                  <td>${esc(request.kind || '—')}</td>
                  <td>${esc(request.rowNo || '—')}</td>
                  <td>${esc(request.componentType || '—')}</td>
                  <td>${esc(requestLineLabel(request))}</td>
                  <td>${esc(requestPipeClassLabel(request))}</td>
                  <td>${esc(requestRatingLabel(request))}</td>
                  <td>${esc(request.reason || '—')}</td>
                  <td>${esc((request.candidates || []).length)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `).join('')}
    </div>
  `;
}

function renderRequestDetail(request, index, total) {
  return `
    <div class="rvm-master-detail">
      <div class="rvm-master-detail-title">
        <span>${esc(requestTitle(request))}</span>
        <em>${index + 1} / ${total}</em>
      </div>

      <div class="rvm-master-detail-kv">
        <div>Reason</div><div>${esc(request.reason)}</div>
        <div>Row</div><div>${esc(request.rowNo)}</div>
        <div>Type</div><div>${esc(request.componentType)}</div>
        <div>Pipeline Ref</div><div>${esc(request.pipelineRef)}</div>
        <div>Bore</div><div>${esc(requestBoreLabel(request))}</div>
        <div>Derived Piping Class</div><div>${esc(requestPipeClassLabel(request))}</div>
        <div>Derived Rating</div><div>${esc(requestRatingLabel(request))}</div>
      </div>

      <div class="rvm-master-section-title">Candidate Data Sheet</div>
      ${renderCandidateRows(request)}

      <div class="rvm-master-section-title">Manual Entry</div>
      ${renderManualFields(request)}

      <div class="rvm-master-apply-row">
        <fieldset class="rvm-master-apply-scope">
          <legend>Apply scope — how many rows get updated</legend>

          <label>
            <input type="radio" name="applyScope" value="PIPELINE_BORE" checked>
            Apply to all rows with same Pipeline Ref + Bore <em>(safest)</em>
          </label>

          <label>
            <input type="radio" name="applyScope" value="PIPELINE">
            Apply to all rows with same Pipeline Ref <em>(all bores)</em>
          </label>

          ${request.kind === 'LINELIST' ? `
          <label>
            <input type="radio" name="applyScope" value="LINE_KEY">
            <span><b>Line Key</b> — all rows whose pipeline ref yields the same line key (e.g. <em>${esc(request.extractedLineKey || request.lookupKey || '?')}</em>), even if the full pipeline ref differs</span>
          </label>
          ` : ''}

          <label>
            <input type="radio" name="applyScope" value="FULL_DATASET">
            <span><b>Full dataset</b> — Apply to all rows for full data set (use with care)</span>
          </label>
        </fieldset>

        <div class="rvm-master-apply-help">
          <b>Apply Selected Candidate</b> — copies values from the radio-button-selected row in the candidate table above into all target rows (based on the chosen scope).<br>
          <b>Apply Manual</b> — uses the values you typed in the Manual Entry fields above instead.
          ${request.kind === 'LINELIST' ? '<br><em>CA 1/2/5/10 fields only appear for Line List requests and are filled from the linelist master or entered manually here.</em>' : ''}
        </div>

        <div class="rvm-master-apply-buttons">
          <button type="button" data-action="apply-candidate"
            ${request.candidates?.length ? '' : 'disabled title="No matching candidates found in master data. Load master data first, check your Line Key regex, or use Apply Manual below."'}>
            Apply Selected Candidate
          </button>
          ${!request.candidates?.length ? `<div class="rvm-master-hint">No candidates found — load master data or use Apply Manual.</div>` : ''}

          <button type="button" data-action="apply-manual">
            Apply Manual
          </button>
        </div>
      </div>
    </div>
  `;
}

function collectManualPayload(form, request) {
  if (request.kind === 'PIPING_CLASS') {
    return {
      action: 'manual',
      pipingClass: clean(form.elements.manualPipingClass?.value),
      rating: clean(form.elements.manualRating?.value),
      applyScope: normalizeMasterApplyScope(form.elements.applyScope?.value),
    };
  }

  if (request.kind === 'LINELIST') {
    return {
      action: 'manual',
      pipingClass: clean(form.elements.manualPipingClass?.value),
      rating: normalizeResolvedRating(form.elements.manualRating?.value || request.rating || request.derivedRating || ''),
      // convertedBore intentionally omitted.
      p1: clean(form.elements.manualP1?.value),
      t1: clean(form.elements.manualT1?.value),
      insThk: clean(form.elements.manualInsThk?.value),
      hp: clean(form.elements.manualHp?.value),
      applyScope: normalizeMasterApplyScope(form.elements.applyScope?.value),
    };
  }

  if (request.kind === 'WEIGHT') {
    return {
      action: 'manual',
      weight: toNumber(form.elements.manualWeight?.value),
      applyScope: normalizeMasterApplyScope(form.elements.applyScope?.value),
    };
  }

  return {
    action: 'manual',
    applyScope: normalizeMasterApplyScope(form.elements.applyScope?.value),
  };
}

function ensureMasterResolutionStyles() {
  if (document.getElementById('rvm-master-resolution-datasheet-styles')) return;

  const style = document.createElement('style');
  style.id = 'rvm-master-resolution-datasheet-styles';
  style.textContent = `
    .rvm-master-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.58);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #dbeafe;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .rvm-master-dialog {
      width: min(1180px, 96vw);
      max-height: 92vh;
      background: #111827;
      border: 1px solid #334155;
      border-radius: 12px;
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .rvm-master-topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-bottom: 1px solid #334155;
      background: #0f172a;
    }

    .rvm-master-topbar h3 {
      margin: 0;
      font-size: 14px;
      color: #f8fafc;
    }

    .rvm-master-topbar button,
    .rvm-master-apply-row button,
    .rvm-master-sheet-table button,
    .rvm-master-regex-actions button {
      background: #2563eb;
      color: #fff;
      border: 1px solid #60a5fa;
      border-radius: 6px;
      padding: 5px 9px;
      cursor: pointer;
      font-size: 12px;
    }

    .rvm-master-topbar button:hover,
    .rvm-master-apply-row button:hover,
    .rvm-master-sheet-table button:hover,
    .rvm-master-regex-actions button:hover {
      background: #1d4ed8;
    }

    .rvm-master-apply-row button:disabled,
    .rvm-master-sheet-table button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .rvm-master-body {
      overflow: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .rvm-master-regex-header {
      border: 1px solid #334155;
      border-radius: 10px;
      background: #162033;
      padding: 10px;
    }

    .rvm-master-regex-title,
    .rvm-master-section-title {
      color: #bfdbfe;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 11px;
      font-weight: 800;
      margin-bottom: 8px;
    }

    .rvm-master-regex-preview,
    .rvm-master-detail-kv {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 5px 10px;
      font-size: 12px;
      margin-bottom: 10px;
    }

    .rvm-master-regex-preview > div:nth-child(odd),
    .rvm-master-detail-kv > div:nth-child(odd) {
      color: #93a4bd;
    }

    .rvm-master-regex-grid,
    .rvm-master-manual-grid {
      display: grid;
      grid-template-columns: 1fr 90px 1fr 90px;
      gap: 8px;
      align-items: end;
    }

    .rvm-master-manual-grid {
      grid-template-columns: repeat(2, minmax(220px, 1fr));
    }

    .rvm-master-regex-grid label,
    .rvm-master-manual-grid label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
      color: #9fb0c8;
    }

    .rvm-master-regex-grid input,
    .rvm-master-manual-grid input {
      background: #0f172a;
      border: 1px solid #334155;
      color: #e2e8f0;
      border-radius: 6px;
      padding: 6px 8px;
    }

    .rvm-master-regex-actions {
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 11px;
      color: #93a4bd;
    }

    .rvm-master-content-grid {
      display: grid;
      grid-template-columns: minmax(520px, 1.2fr) minmax(360px, 0.8fr);
      gap: 12px;
      min-height: 0;
    }

    .rvm-master-sheet,
    .rvm-master-detail {
      border: 1px solid #334155;
      border-radius: 10px;
      background: #111c2f;
      overflow: auto;
    }

    .rvm-master-group {
      border-bottom: 1px solid #26364e;
    }

    .rvm-master-group-title {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 8px 10px;
      background: #17243a;
      font-size: 12px;
      color: #e2e8f0;
    }

    .rvm-master-group-title span {
      font-weight: 800;
      color: #bfdbfe;
    }

    .rvm-master-group-title b {
      color: #7ddc9a;
    }

    .rvm-master-group-title em {
      color: #93a4bd;
      font-style: normal;
      margin-left: auto;
    }

    .rvm-master-sheet-table,
    .rvm-master-candidate-sheet table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }

    .rvm-master-sheet-table th,
    .rvm-master-sheet-table td,
    .rvm-master-candidate-sheet th,
    .rvm-master-candidate-sheet td {
      border-top: 1px solid #26364e;
      padding: 6px 7px;
      text-align: left;
      vertical-align: top;
    }

    .rvm-master-sheet-table th,
    .rvm-master-candidate-sheet th {
      color: #93c5fd;
      background: #0f172a;
      position: sticky;
      top: 0;
      z-index: 1;
    }

    .rvm-master-sheet-table tr.is-active {
      background: rgba(37, 99, 235, 0.18);
      outline: 1px solid rgba(96, 165, 250, 0.45);
    }

    .rvm-master-detail {
      padding: 10px;
      overflow: auto;
    }

    .rvm-master-detail-title {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-size: 13px;
      font-weight: 800;
      color: #f8fafc;
      margin-bottom: 10px;
    }

    .rvm-master-detail-title em {
      color: #93a4bd;
      font-style: normal;
      font-weight: 600;
    }

    .rvm-master-empty,
    .rvm-master-note {
      padding: 8px 10px;
      border: 1px dashed #475569;
      border-radius: 8px;
      color: #fca5a5;
      background: rgba(127, 29, 29, 0.12);
      font-size: 12px;
      margin-bottom: 8px;
    }

    .rvm-master-note {
      color: #facc15;
      background: rgba(161, 98, 7, 0.12);
    }

    .rvm-master-readonly-strip {
      display: grid;
      grid-template-columns: repeat(2, minmax(180px, 1fr));
      gap: 6px;
      margin-bottom: 10px;
    }

    .rvm-master-readonly-strip div {
      background: #0f172a;
      border: 1px solid #26364e;
      border-radius: 7px;
      padding: 6px 8px;
      font-size: 11px;
    }

    .rvm-master-readonly-strip b {
      display: block;
      color: #93a4bd;
      margin-bottom: 2px;
    }

    .rvm-master-readonly-strip span {
      color: #dbeafe;
      font-weight: 700;
    }

.rvm-master-apply-row {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid #334155;
      display: flex;
      align-items: stretch;
      justify-content: flex-end;
      gap: 10px;
      flex-wrap: wrap;
      font-size: 12px;
      color: #cbd5e1;
    }

    .rvm-master-apply-scope {
      flex: 1 1 420px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 0;
      padding: 8px 10px;
      border: 1px solid #334155;
      border-radius: 8px;
      background: #0f172a;
    }

    .rvm-master-apply-scope legend {
      padding: 0 4px;
      color: #93c5fd;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .rvm-master-apply-scope label {
      display: flex;
      align-items: center;
      gap: 7px;
      color: #dbeafe;
      font-size: 12px;
    }

    .rvm-master-apply-scope input[type="radio"] {
      accent-color: #2563eb;
    }

    .rvm-master-apply-buttons {
      display: flex;
      align-items: flex-end;
      justify-content: flex-end;
      gap: 10px;
      flex-wrap: wrap;
    }

.rvm-master-simple-help {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 10px;
      padding: 9px 10px;
      border: 1px solid #334155;
      border-radius: 8px;
      background: #0f172a;
      color: #dbeafe;
      font-size: 12px;
    }

    .rvm-master-help-line code {
      color: #93c5fd;
      background: rgba(37, 99, 235, 0.16);
      padding: 2px 5px;
      border-radius: 4px;
    }

    .rvm-master-advanced-regex {
      margin-top: 8px;
      border-top: 1px solid #334155;
      padding-top: 8px;
    }

    .rvm-master-advanced-regex summary {
      cursor: pointer;
      color: #93c5fd;
      font-size: 12px;
      font-weight: 800;
    }

    .rvm-master-seg-table {
      border-collapse: collapse;
      font-size: 11px;
      margin: 6px 0;
      width: 100%;
    }

    .rvm-master-seg-table th {
      color: #93c5fd;
      background: #0f172a;
      padding: 4px 8px;
      text-align: left;
      border: 1px solid #334155;
    }

    .rvm-master-seg-table td {
      padding: 4px 8px;
      border: 1px solid #26364e;
      color: #dbeafe;
    }

    .rvm-master-seg-table td:first-child {
      color: #93a4bd;
      text-align: center;
      font-weight: 700;
    }

    .rvm-master-regex-explainer {
      font-size: 12px;
      color: #dbeafe;
      margin-bottom: 10px;
      padding: 8px 10px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
    }

    .rvm-master-regex-explainer p {
      margin: 0 0 6px;
    }

    .rvm-master-regex-explainer code {
      color: #93c5fd;
      background: rgba(37, 99, 235, 0.16);
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 11px;
    }

    .rvm-master-apply-help {
      font-size: 11px;
      color: #93a4bd;
      margin-top: 8px;
      padding: 8px 10px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      line-height: 1.6;
    }

    .rvm-master-apply-scope label span {
      line-height: 1.4;
    }

    @media (max-width: 980px) {
      .rvm-master-content-grid {
        grid-template-columns: 1fr;
      }

      .rvm-master-regex-grid,
      .rvm-master-manual-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(style);
}

function saveRegexConfigFromDialog(dialog, activeRequest) {
  const get = key => dialog.querySelector(`[data-regex-key="${key}"]`)?.value ?? '';

  const lineKeyRegex = get('lineKeyRegex');
  const lineKeyGroup = Number(get('lineKeyRegexGroup') || 1);
  const pipingRegex = get('pipingClassRegex');
  const pipingGroup = Number(get('pipingClassRegexGroup') || 1);
  const ratingRegex = get('ratingRegex');
  const ratingGroup = Number(get('ratingRegexGroup') || 1);

  localStorage.setItem(LINE_KEY_REGEX_STORAGE_KEY, lineKeyRegex);
  localStorage.setItem(LINE_KEY_REGEX_GROUP_STORAGE_KEY, String(lineKeyGroup || 1));
  localStorage.setItem(PIPING_CLASS_REGEX_STORAGE_KEY, pipingRegex);
  localStorage.setItem(PIPING_CLASS_REGEX_GROUP_STORAGE_KEY, String(pipingGroup || 1));
  localStorage.setItem(RATING_REGEX_STORAGE_KEY, ratingRegex);
  localStorage.setItem(RATING_REGEX_GROUP_STORAGE_KEY, String(ratingGroup || 1));

  const pipelineRef = activeRequest?.pipelineRef || '';

  const lineKey = extractLineKeyFromPipelineRef(pipelineRef, {
    lineKeyRegex,
    lineKeyRegexGroup: lineKeyGroup || 1,
  });

  const pc = extractPipingClassFromPipelineRef(pipelineRef, {
    pipingClassRegex: pipingRegex,
    pipingClassRegexGroup: pipingGroup || 1,
  });

  const rating = extractRatingFromPipelineRef(pipelineRef, {
    ratingRegex,
    ratingRegexGroup: ratingGroup || 1,
  });

  const lineKeyEl = dialog.querySelector('[data-regex-preview-line-key]');
  const pcEl = dialog.querySelector('[data-regex-preview-piping-class]');
  const ratingEl = dialog.querySelector('[data-regex-preview-rating]');
  const statusEl = dialog.querySelector('[data-regex-status]');

  if (lineKeyEl) lineKeyEl.textContent = lineKey || '—';
  if (pcEl) pcEl.textContent = pc || '—';
  if (ratingEl) ratingEl.textContent = rating || '—';
  if (statusEl) statusEl.textContent = 'Saved. Rebuild 2D CSV / PCF to apply to all rows.';
}

export function showRvmMasterResolutionDialog({
  requests = [],
  rows = [],
  resolver,
  onApplied
} = {}) {
  if (!requests.length || !resolver) return;

  ensureMasterResolutionStyles();

  let activeIndex = 0;

  const overlay = document.createElement('div');
  overlay.className = 'rvm-master-overlay';

  function render() {
    const activeRequest = requests[activeIndex] || requests[0];

    overlay.innerHTML = `
      <div class="rvm-master-dialog" role="dialog" aria-modal="true">
        <div class="rvm-master-topbar">
          <h3>Master Resolution Data Sheet — ${requests.length} pending item(s)</h3>
          <button type="button" data-action="close">Close</button>
        </div>

        <form class="rvm-master-body">
          ${renderRegexHeader(activeRequest)}

          <div class="rvm-master-content-grid">
            ${renderGroupedDataSheet(requests, activeIndex)}
            ${renderRequestDetail(activeRequest, activeIndex, requests.length)}
          </div>
        </form>
      </div>
    `;
  }

  function activeRequest() {
    return requests[activeIndex] || requests[0];
  }

  function activeForm() {
    return overlay.querySelector('form');
  }

  function applyResult(result) {
    if (typeof onApplied === 'function') {
      onApplied(result);
    }
  }

  overlay.addEventListener('click', event => {
    const closeBtn = event.target.closest('[data-action="close"]');
    if (closeBtn) {
      overlay.remove();
      return;
    }

    const selectBtn = event.target.closest('[data-select-request]');
    if (selectBtn) {
      activeIndex = Number(selectBtn.getAttribute('data-select-request') || 0);
      render();
      return;
    }

    const saveRegexBtn = event.target.closest('[data-action="save-regex"]');
    if (saveRegexBtn) {
      saveRegexConfigFromDialog(overlay, activeRequest());
      return;
    }

    const applyCandidateBtn = event.target.closest('[data-action="apply-candidate"]');
    if (applyCandidateBtn) {
      const request = activeRequest();
      const form = activeForm();

      const candidateIndex = Number(form.elements.candidateIndex?.value ?? 0);
      const applyScope = normalizeMasterApplyScope(form.elements.applyScope?.value);

      const result = resolver.applyRequestResolution(rows, request, {
        action: 'candidate',
        candidateIndex,
        applyScope,
      });

      applyResult(result);
      overlay.remove();
      return;
    }

    const applyManualBtn = event.target.closest('[data-action="apply-manual"]');
    if (applyManualBtn) {
      const request = activeRequest();
      const form = activeForm();
      const payload = collectManualPayload(form, request);

      const result = resolver.applyRequestResolution(rows, request, payload);

      applyResult(result);
      overlay.remove();
    }
  });

  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      overlay.remove();
    }
  });

  render();
  document.body.appendChild(overlay);

  const firstOpen = overlay.querySelector('[data-select-request]');
  if (firstOpen) firstOpen.focus();
}
