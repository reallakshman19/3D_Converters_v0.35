import { createPipeDataDb } from '../../vendor/create-pipe-data-db.js';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function norm(value) {
  return text(value).toUpperCase().replace(/\s+/g, ' ');
}

function unique(values) {
  return [...new Set((values || []).map(text).filter(Boolean))];
}

const COMMON_ASME_B36_10_WALL_MM = Object.freeze({
  '0.5': { '40': 2.77, '80': 3.73 },
  '0.75': { '40': 2.87, '80': 3.91 },
  '1': { '40': 3.38, '80': 4.55 },
  '1.25': { '40': 3.56, '80': 4.85 },
  '1.5': { '40': 3.68, '80': 5.08 },
  '2': { '40': 3.91, '80': 5.54 },
  '2.5': { '40': 5.16, '80': 7.01 },
  '3': { '40': 5.49, '80': 7.62 },
  '4': { '40': 6.02, '80': 8.56, '160': 13.49 },
  '6': { '40': 7.11, '80': 10.97, '160': 18.26 },
  '8': { '40': 8.18, '80': 12.70, '160': 23.01 },
  '10': { '40': 9.27, '80': 15.09, '160': 28.58 },
  '12': { '40': 10.31, '80': 17.48, '160': 33.32 },
  '14': { '40': 11.13, '80': 19.05 },
  '16': { '40': 12.70, '80': 21.44 },
  '18': { '40': 14.27, '80': 23.83 },
  '20': { '40': 15.09, '80': 26.19 },
  '24': { '40': 17.48, '80': 30.96 },
});

function scheduleFromText(value) {
  const source = norm(value).replace(/SCH\.?/g, ' SCH ');
  if (/\bXXS\b|DOUBLE\s+EXTRA\s+STRONG/.test(source)) return 'XXS';
  if (/\bXS\b|EXTRA\s+STRONG/.test(source)) return '80';
  if (/\bSTD\b|STANDARD\s+WT/.test(source)) return '40';
  const hit = source.match(/\bSCH(?:EDULE)?\s*[-:]?\s*(\d{1,3})\s*S?\b/i)
    || source.match(/\bSCHEDULE\s*(\d{1,3})\s*S?\b/i)
    || source.match(/\bSCH\s*(\d{1,3})\b/i);
  if (!hit) return '';
  return String(Number(hit[1]));
}

function npsMap(config) {
  const map = config?.weight?.npsToDn && typeof config.weight.npsToDn === 'object'
    ? config.weight.npsToDn
    : { '0.5': 15, '0.75': 20, '1': 25, '1.25': 32, '1.5': 40, '2': 50, '2.5': 65, '3': 80, '4': 100, '6': 150, '8': 200, '10': 250, '12': 300, '14': 350, '16': 400, '18': 450, '20': 500, '24': 600 };
  return Object.entries(map).map(([nps, dn]) => ({ nps: String(Number(nps)), dn: Number(dn) })).filter((row) => Number.isFinite(row.dn));
}

export function xmlCiiNpsFromBoreMm(boreMm, config = {}) {
  const bore = Number(boreMm);
  if (!Number.isFinite(bore) || bore <= 0) return '';
  let best = null;
  for (const row of npsMap(config)) {
    const err = Math.abs(row.dn - bore);
    if (!best || err < best.err) best = { ...row, err };
  }
  return best && best.err <= Math.max(1, Math.abs(bore) * 0.02) ? best.nps : '';
}

function pipeDbWall(nps, schedule) {
  try {
    const hit = createPipeDataDb().lookupPipe({ nps, schedule });
    const wall = Number(hit?.row?.wallMm);
    return hit?.ok && Number.isFinite(wall) && wall > 0 ? { wall, source: 'pipe-data-db', provenance: hit.provenance || null } : null;
  } catch {
    return null;
  }
}

function fallbackWall(nps, schedule) {
  const row = COMMON_ASME_B36_10_WALL_MM[nps];
  const wall = row?.[schedule];
  return Number.isFinite(Number(wall)) && Number(wall) > 0
    ? { wall: Number(wall), source: 'asme-b36.10-common-fallback', provenance: { standard: 'ASME B36.10M', dataStatus: 'COMMON_SCREENING_TABLE' } }
    : null;
}

export function resolveXmlCiiWallThicknessFromDtxr({ boreMm, dtxrValues = [], config = {} } = {}) {
  const nps = xmlCiiNpsFromBoreMm(boreMm, config);
  if (!nps) return null;
  for (const dtxr of unique(dtxrValues)) {
    const schedule = scheduleFromText(dtxr);
    if (!schedule) continue;
    const resolved = pipeDbWall(nps, schedule) || fallbackWall(nps, schedule);
    if (!resolved) continue;
    return {
      wallThicknessMm: resolved.wall,
      nps,
      schedule,
      dtxr,
      source: resolved.source,
      provenance: resolved.provenance,
    };
  }
  return null;
}

export function xmlCiiDtxrScheduleText(value) {
  return scheduleFromText(value);
}
