import { createPipeDataDb } from '../../vendor/create-pipe-data-db.js';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function norm(value) {
  return text(value).toUpperCase().replace(/\s+/g, ' ');
}

const COMMON_WALL_MM = Object.freeze({
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
  '10': { '40': 9.27, '80': 15.09, '100': 18.26, '160': 28.58 },
  '12': { '40': 10.31, '80': 17.48, '100': 21.44, '160': 33.32 },
  '14': { '40': 11.13, '80': 19.05, '100': 23.83 },
  '16': { '40': 12.70, '80': 21.44, '100': 26.19 },
  '18': { '40': 14.27, '80': 23.83, '100': 29.36 },
  '20': { '40': 15.09, '80': 26.19, '100': 32.54 },
  '24': { '40': 17.48, '80': 30.96, '100': 38.89 },
});

const BLOCKED_CARRIER_TYPES = new Set([
  'OLET', 'TEE', 'GASK', 'ATTA', 'SUPPORT', 'RESTRAINT',
]);

const DIRECT_RANK = Object.freeze({
  PIPE: 600, FLAN: 550, REDU: 500, RIGID: 450,
  VALV: 425, INST: 400, ELBO: 375, BEND: 375,
});

const SCHEDULE_RANK = Object.freeze({
  PIPE: 500, RIGID: 450, FLAN: 400, REDU: 375,
  VALV: 350, INST: 325, ELBO: 300, BEND: 300,
});

function scheduleFromText(value) {
  const source = norm(value).replace(/SCH\.?/g, ' SCH ');
  if (/\bXXS\b|DOUBLE\s+EXTRA\s+STRONG/.test(source)) return 'XXS';
  if (/\bXS\b|EXTRA\s+STRONG/.test(source)) return '80';
  if (/\bSTD\b|STANDARD\s+WT/.test(source)) return '40';
  const hit = source.match(/\bSCH(?:EDULE)?\s*[-:]?\s*(\d{1,3})\s*S?\b/i)
    || source.match(/\bSCHEDULE\s*(\d{1,3})\s*S?\b/i)
    || source.match(/\bSCH\s*(\d{1,3})\b/i);
  return hit ? String(Number(hit[1])) : '';
}

function directWallFromText(value) {
  const source = norm(value);
  const hit = source.match(
    /\b(?:WTH|WALL\s*(?:THK|THICKNESS)?|THICKNESS)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:MM)?\b/i,
  );
  const wall = hit ? Number(hit[1]) : NaN;
  return Number.isFinite(wall) && wall > 0 ? wall : null;
}

function npsMap(config) {
  const map = config?.weight?.npsToDn && typeof config.weight.npsToDn === 'object'
    ? config.weight.npsToDn
    : {
      '0.5': 15, '0.75': 20, '1': 25, '1.25': 32, '1.5': 40,
      '2': 50, '2.5': 65, '3': 80, '4': 100, '6': 150, '8': 200,
      '10': 250, '12': 300, '14': 350, '16': 400, '18': 450,
      '20': 500, '24': 600,
    };
  return Object.entries(map)
    .map(([nps, dn]) => ({ nps: String(Number(nps)), dn: Number(dn) }))
    .filter((row) => Number.isFinite(row.dn));
}

export function xmlCiiNpsFromBoreMm(boreMm, config = {}) {
  const bore = Number(boreMm);
  if (!Number.isFinite(bore) || bore <= 0) return '';
  let best = null;
  for (const row of npsMap(config)) {
    const err = Math.abs(row.dn - bore);
    if (!best || err < best.err) best = { ...row, err };
  }
  return best && best.err <= Math.max(1, bore * 0.02) ? best.nps : '';
}

function pipeDbWall(nps, schedule) {
  try {
    const hit = createPipeDataDb().lookupPipe({ nps, schedule });
    const wall = Number(hit?.row?.wallMm);
    return hit?.ok && Number.isFinite(wall) && wall > 0
      ? { wall, source: 'pipe-data-db', provenance: hit.provenance || null }
      : null;
  } catch {
    return null;
  }
}

function fallbackWall(nps, schedule) {
  const wall = COMMON_WALL_MM[nps]?.[schedule];
  return Number.isFinite(Number(wall)) && Number(wall) > 0
    ? {
      wall: Number(wall),
      source: 'asme-b36.10-common-fallback',
      provenance: {
        standard: 'ASME B36.10M',
        dataStatus: 'COMMON_SCREENING_TABLE',
      },
    }
    : null;
}

function normalizedEvidence(value, sequence) {
  if (typeof value === 'string') {
    return {
      dtxr: text(value), componentType: '', componentRefNo: '',
      boreMm: null, source: 'legacy-string', sequence,
    };
  }
  if (!value || typeof value !== 'object') return null;
  const bore = Number(value.boreMm ?? value.bore ?? value.dn);
  return {
    dtxr: text(value.dtxr ?? value.text ?? value.value),
    componentType: norm(value.componentType ?? value.type),
    componentRefNo: text(value.componentRefNo ?? value.ref),
    boreMm: Number.isFinite(bore) && bore > 0 ? bore : null,
    source: text(value.source) || 'structured-evidence',
    sequence,
  };
}

function sameBore(candidateBore, targetBore) {
  if (!Number.isFinite(candidateBore)) return true;
  return Math.abs(candidateBore - targetBore) <= Math.max(1, targetBore * 0.01);
}

function evidenceRank(evidence, kind) {
  const type = evidence.componentType;
  if (BLOCKED_CARRIER_TYPES.has(type)) return -1;
  const table = kind === 'DIRECT_WALL' ? DIRECT_RANK : SCHEDULE_RANK;
  return table[type] ?? (type ? 250 : 100);
}

function candidateFromEvidence(evidence, nps, targetBore) {
  if (!evidence?.dtxr || !sameBore(evidence.boreMm, targetBore)) return null;
  const directWall = directWallFromText(evidence.dtxr);
  if (directWall !== null) {
    return {
      evidence, kind: 'DIRECT_WALL',
      rank: evidenceRank(evidence, 'DIRECT_WALL'),
      wall: directWall, schedule: '', resolved: null,
    };
  }
  const schedule = scheduleFromText(evidence.dtxr);
  if (!schedule) return null;
  const resolved = pipeDbWall(nps, schedule) || fallbackWall(nps, schedule);
  return resolved ? {
    evidence, kind: 'SCHEDULE',
    rank: evidenceRank(evidence, 'SCHEDULE'),
    wall: resolved.wall, schedule, resolved,
  } : null;
}

export function resolveXmlCiiWallThicknessFromDtxr({
  boreMm, dtxrValues = [], config = {},
} = {}) {
  const targetBore = Number(boreMm);
  const nps = xmlCiiNpsFromBoreMm(targetBore, config);
  if (!nps) return null;
  const candidates = dtxrValues
    .map(normalizedEvidence)
    .map((item) => candidateFromEvidence(item, nps, targetBore))
    .filter((item) => item && item.rank >= 0);
  candidates.sort((left, right) => (
    right.rank - left.rank
    || left.evidence.sequence - right.evidence.sequence
  ));
  const best = candidates[0];
  if (!best) return null;
  return {
    wallThicknessMm: best.wall,
    nps,
    schedule: best.schedule,
    evidenceKind: best.kind,
    dtxr: best.evidence.dtxr,
    source: best.kind === 'DIRECT_WALL'
      ? 'dtxr-direct-wall'
      : best.resolved.source,
    provenance: best.resolved?.provenance || null,
    componentType: best.evidence.componentType,
    componentRefNo: best.evidence.componentRefNo,
    evidenceBoreMm: best.evidence.boreMm,
    evidenceSource: best.evidence.source,
  };
}

export function xmlCiiDtxrScheduleText(value) {
  return scheduleFromText(value);
}

export function xmlCiiDtxrDirectWallText(value) {
  return directWallFromText(value);
}
