/**
 * bore-converter.js
 *
 * Single canonical bore conversion utility used by:
 * - Linelist Manager
 * - Weight Config
 * - Piping Class Master
 * - Stage 1 raw CSV → 2D CSV
 *
 * Goal:
 * Raw value / OD / NPS / DN / range -> Converted Bore in DN/NB mm.
 */

export const CONVERTED_BORE_COL = 'Converted Bore';
export const CONVERTED_BORE_SOURCE_COL = '_Converted Bore Source';
export const CONVERTED_BORE_STATUS_COL = '_Converted Bore Status';

const EPS = 1e-9;

export const NPS_TO_DN = new Map([
  [0.125, 6], [0.25, 8], [0.375, 10], [0.5, 15], [0.75, 20],
  [1, 25], [1.25, 32], [1.5, 40], [2, 50], [2.5, 65],
  [3, 80], [3.5, 90], [4, 100], [5, 125], [6, 150],
  [8, 200], [10, 250], [12, 300], [14, 350], [16, 400],
  [18, 450], [20, 500], [22, 550], [24, 600], [26, 650],
  [28, 700], [30, 750], [32, 800], [34, 850], [36, 900],
  [42, 1050], [48, 1200],
]);

export const DN_TO_NPS = new Map([...NPS_TO_DN.entries()].map(([nps, dn]) => [dn, nps]));

export const PIPE_OD_TO_DN = [
  [10.3, 6], [13.7, 8], [17.1, 10], [21.3, 15], [26.7, 20],
  [33.4, 25], [42.2, 32], [48.3, 40], [60.3, 50], [73.0, 65],
  [88.9, 80], [101.6, 90], [114.3, 100], [141.3, 125], [168.3, 150],
  [219.1, 200], [273.1, 250], [323.9, 300], [355.6, 350], [406.4, 400],
  [457.2, 450], [508.0, 500], [558.8, 550], [609.6, 600], [660.4, 650],
  [711.2, 700], [762.0, 750], [812.8, 800], [863.6, 850], [914.4, 900],
  [1066.8, 1050], [1219.2, 1200],
].map(([od, dn]) => ({ od, dn }));

export function normalizeBoreText(value) {
  return String(value ?? '')
    .trim()
    .replace(/½/g, ' 1/2')
    .replace(/¼/g, ' 1/4')
    .replace(/¾/g, ' 3/4')
    .replace(/[“”]/g, '"')
    .replace(/[′’]/g, "'")
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBlankLike(value) {
  const s = normalizeBoreText(value).toUpperCase();
  return !s || s === '-' || s === '—' || s === 'NULL' || s === 'N/A' || s === 'NA';
}

function numberFrom(value) {
  const s = normalizeBoreText(value).replace(/,/g, '');
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? Number.parseFloat(m[0]) : NaN;
}

function sourceHint(sourceColumn = '') {
  const s = String(sourceColumn || '').toLowerCase();
  return {
    nps: /nps|inch|inches|size\s*\(nps\)|nominal\s*pipe\s*size/.test(s),
    od: /\bod\b|o\/d|outside/.test(s),
    dn: /\bdn\b|\bnb\b|bore|size\s*\(mm\)|mm/.test(s),
  };
}

function parseFractionOrMixedNps(raw) {
  let s = normalizeBoreText(raw)
    .replace(/"/g, '')
    .replace(/inches?/ig, '')
    .replace(/\bin\b/ig, '')
    .replace(/\bnps\b/ig, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!s) return NaN;
  s = s.replace(/^(\d+)-(\d+)\/(\d+)$/, '$1 $2/$3');

  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) {
    const whole = Number(m[1]);
    const num = Number(m[2]);
    const den = Number(m[3]);
    return den ? whole + (num / den) : NaN;
  }

  m = s.match(/^(\d+)\/(\d+)$/);
  if (m) {
    const num = Number(m[1]);
    const den = Number(m[2]);
    return den ? num / den : NaN;
  }

  const direct = Number.parseFloat(s);
  return Number.isFinite(direct) ? direct : NaN;
}

function looksLikeRange(raw) {
  const s = normalizeBoreText(raw).replace(/"/g, '').trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  // Avoid treating common NPS fractions like 1/2 and 3/4 as a DN range.
  return a >= 4 && b >= 4 && a !== b;
}

function odToDn(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;

  let best = null;
  let bestErr = Infinity;
  for (const row of PIPE_OD_TO_DN) {
    const err = Math.abs(n - row.od);
    if (err < bestErr) {
      bestErr = err;
      best = row;
    }
  }
  if (!best) return null;

  const tol = Math.max(1.5, Math.abs(best.od) * 0.006);
  return bestErr <= tol ? best.dn : null;
}

function dnLike(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const rounded = Math.round(n);
  return DN_TO_NPS.has(rounded) && Math.abs(n - rounded) <= 1 ? rounded : null;
}

function npsLike(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  for (const [nps, dn] of NPS_TO_DN.entries()) {
    if (Math.abs(n - nps) <= 0.01) return dn;
  }
  return null;
}

export function convertBoreValue(value, options = {}) {
  const { sourceColumn = '', odFallback = null } = options;

  if (isBlankLike(value)) {
    if (!isBlankLike(odFallback)) {
      const odDn = odToDn(numberFrom(odFallback));
      if (odDn != null) return { boreMm: odDn, convertedBore: String(odDn), status: 'from-od-fallback', source: sourceColumn || 'OD fallback', raw: value ?? '', odRaw: odFallback };
    }
    return { boreMm: null, convertedBore: '', status: 'blank', source: sourceColumn || '', raw: value ?? '' };
  }

  const raw = normalizeBoreText(value);
  const hint = sourceHint(sourceColumn);

  if (looksLikeRange(raw)) {
    const [aRaw, bRaw] = raw.replace(/"/g, '').split('/').map(s => s.trim());
    const a = convertBoreValue(aRaw, { sourceColumn: 'NPS range' });
    const b = convertBoreValue(bRaw, { sourceColumn: 'NPS range' });
    const parts = [a.boreMm, b.boreMm].filter(v => Number.isFinite(v));
    return { boreMm: parts.length ? parts[0] : null, boreRangeMm: parts, convertedBore: parts.length === 2 ? `${parts[0]}/${parts[1]}` : '', status: parts.length === 2 ? 'range' : 'unresolved-range', source: sourceColumn || '', raw };
  }

  const nps = parseFractionOrMixedNps(raw);

  if (hint.nps && Number.isFinite(nps)) {
    const dn = npsLike(nps);
    if (dn != null) return { boreMm: dn, convertedBore: String(dn), status: 'nps-to-dn', source: sourceColumn, raw };
  }

  const numeric = numberFrom(raw);

  if (hint.od && Number.isFinite(numeric)) {
    const dn = odToDn(numeric);
    if (dn != null) return { boreMm: dn, convertedBore: String(dn), status: 'od-to-dn', source: sourceColumn, raw };
  }

  if (hint.dn && Number.isFinite(numeric)) {
    const dn = dnLike(numeric);
    if (dn != null) return { boreMm: dn, convertedBore: String(dn), status: 'dn', source: sourceColumn, raw };
  }

  if (Number.isFinite(nps) && /\/|"/.test(raw)) {
    const dn = npsLike(nps);
    if (dn != null) return { boreMm: dn, convertedBore: String(dn), status: 'nps-to-dn', source: sourceColumn, raw };
  }

  if (Number.isFinite(numeric)) {
    const odDn = odToDn(numeric);
    const directDn = dnLike(numeric);

    if (directDn != null && Math.abs(numeric - directDn) <= EPS) return { boreMm: directDn, convertedBore: String(directDn), status: 'dn', source: sourceColumn, raw };
    if (odDn != null) return { boreMm: odDn, convertedBore: String(odDn), status: 'od-to-dn', source: sourceColumn, raw };

    const npsDn = npsLike(numeric);
    if (npsDn != null) return { boreMm: npsDn, convertedBore: String(npsDn), status: 'nps-to-dn', source: sourceColumn, raw };
    if (directDn != null) return { boreMm: directDn, convertedBore: String(directDn), status: 'dn', source: sourceColumn, raw };
  }

  if (!isBlankLike(odFallback)) {
    const odDn = odToDn(numberFrom(odFallback));
    if (odDn != null) return { boreMm: odDn, convertedBore: String(odDn), status: 'from-od-fallback', source: sourceColumn || 'OD fallback', raw, odRaw: odFallback };
  }

  return { boreMm: null, convertedBore: '', status: 'unresolved', source: sourceColumn || '', raw };
}

export function toSingleBoreMm(value, options = {}) {
  const r = convertBoreValue(value, options);
  return Number.isFinite(r.boreMm) ? r.boreMm : null;
}

export function sameConvertedBore(a, b) {
  const ca = convertBoreValue(a);
  const cb = convertBoreValue(b);
  const aList = Array.isArray(ca.boreRangeMm) && ca.boreRangeMm.length ? ca.boreRangeMm : [ca.boreMm];
  const bList = Array.isArray(cb.boreRangeMm) && cb.boreRangeMm.length ? cb.boreRangeMm : [cb.boreMm];
  return aList.some(x => Number.isFinite(x) && bList.some(y => Number.isFinite(y) && Math.abs(x - y) < 1));
}

function firstExistingHeader(headers, candidates) {
  const lower = new Map((headers || []).map(h => [String(h).trim().toLowerCase(), h]));
  for (const c of candidates) {
    const hit = lower.get(String(c).trim().toLowerCase());
    if (hit) return hit;
  }
  return '';
}

export function guessBoreSourceColumn(headers, type = '') {
  const safe = Array.isArray(headers) ? headers.filter(Boolean) : [];
  const t = String(type || '').toLowerCase();

  if (t === 'weights') return firstExistingHeader(safe, ['DN', 'NB', 'Bore', 'Size (NPS)', 'NPS', 'Size', 'OD', 'O/D', 'Outside Diameter']);
  if (t === 'pipingclass') return firstExistingHeader(safe, ['DN', 'NB', 'Bore', 'Size', 'Size (NPS)', 'NPS', 'OD', 'O/D', 'Outside Diameter']);
  if (t === 'linelist') return firstExistingHeader(safe, ['Bore', 'BORE', 'DN', 'NB', 'NPS', 'Line Size', 'LineSize', 'Size', 'Nominal Size', 'OD', 'O/D', 'Outside Diameter']);
  return firstExistingHeader(safe, ['Bore', 'DN', 'NB', 'Size', 'Size (NPS)', 'NPS', 'OD', 'O/D', 'Outside Diameter']);
}

export function ensureConvertedBoreRows(rows, options = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) return { rows: [], sourceColumn: '', converted: 0, unresolved: 0 };

  const headers = Object.keys(safeRows[0] || {});
  const sourceColumn = options.sourceColumn || guessBoreSourceColumn(headers, options.type);
  let converted = 0;
  let unresolved = 0;

  const next = safeRows.map((row) => {
    const out = { ...row };
    const raw = sourceColumn ? row?.[sourceColumn] : '';
    const odFallback = row?.OD ?? row?.['O/D'] ?? row?.['Outside Diameter'] ?? row?.OutsideDiameter ?? '';
    const res = convertBoreValue(raw, { sourceColumn, odFallback });

    out[CONVERTED_BORE_COL] = res.convertedBore;
    out[CONVERTED_BORE_SOURCE_COL] = sourceColumn || '';
    out[CONVERTED_BORE_STATUS_COL] = res.status;

    if (res.convertedBore) converted += 1;
    else unresolved += 1;

    return out;
  });

  return { rows: next, sourceColumn, converted, unresolved };
}
