/**
 * Functionality: resolves pipe wall thickness from DTXR schedule text
 * using ASME B36.10 built-in table. Logic derived from
 * dtxr-wall-thickness-resolver.js — reimplemented standalone.
 * Parameters: explicit. Outputs: {wallMm, schedule, source}|null.
 * No side effects.
 */

/** NPS → DN (mm) map */
const NPS_TO_DN = Object.freeze({
  '0.5': 15, '0.75': 20, '1': 25, '1.25': 32, '1.5': 40, '2': 50,
  '2.5': 65, '3': 80, '4': 100, '6': 150, '8': 200, '10': 250,
  '12': 300, '14': 350, '16': 400, '18': 450, '20': 500, '24': 600,
});

/** ASME B36.10M common schedule wall thicknesses in mm — [NPS][SCH] */
const ASME_WALL_MM = Object.freeze({
  '0.5':  { '40': 2.77, '80': 3.73, 'STD': 2.77, 'XS': 3.73 },
  '0.75': { '40': 2.87, '80': 3.91, 'STD': 2.87, 'XS': 3.91 },
  '1':    { '40': 3.38, '80': 4.55, 'STD': 3.38, 'XS': 4.55 },
  '1.25': { '40': 3.56, '80': 4.85, 'STD': 3.56, 'XS': 4.85 },
  '1.5':  { '40': 3.68, '80': 5.08, 'STD': 3.68, 'XS': 5.08 },
  '2':    { '40': 3.91, '80': 5.54, 'STD': 3.91, 'XS': 5.54 },
  '2.5':  { '40': 5.16, '80': 7.01, 'STD': 5.16, 'XS': 7.01 },
  '3':    { '40': 5.49, '80': 7.62, 'STD': 5.49, 'XS': 7.62 },
  '4':    { '40': 6.02, '80': 8.56, '160': 13.49, 'STD': 6.02, 'XS': 8.56 },
  '6':    { '40': 7.11, '80': 10.97, '160': 18.26, 'STD': 7.11, 'XS': 10.97 },
  '8':    { '40': 8.18, '80': 12.70, '160': 23.01, 'STD': 9.53, 'XS': 12.70 },
  '10':   { '40': 9.27, '80': 15.09, '160': 28.58, 'STD': 9.53, 'XS': 15.09 },
  '12':   { '40': 10.31, '80': 17.48, '160': 33.32, 'STD': 9.53, 'XS': 17.48 },
  '14':   { '40': 11.13, '80': 19.05, 'STD': 9.53, 'XS': 19.05 },
  '16':   { '40': 12.70, '80': 21.44, 'STD': 9.53, 'XS': 21.44 },
  '18':   { '40': 14.27, '80': 23.83, 'STD': 9.53, 'XS': 23.83 },
  '20':   { '40': 15.09, '80': 26.19, 'STD': 9.53, 'XS': 26.19 },
  '24':   { '40': 17.48, '80': 30.96, 'STD': 9.53, 'XS': 30.96 },
});

/** Standard (Sch40 / STD) wall fallback by DN */
const ASME_STD_WALL = Object.freeze({
  15: 2.77, 20: 2.87, 25: 3.38, 32: 3.56, 40: 3.68, 50: 3.91,
  65: 5.16, 80: 5.49, 100: 6.02, 150: 7.11, 200: 8.18, 250: 9.27,
  300: 9.53, 350: 9.53, 400: 9.53, 450: 9.53, 500: 9.53, 600: 9.53,
});

/**
 * Convert bore mm to NPS string (closest match within 2% or 2mm).
 * @param {number} boreMm
 * @returns {string} NPS or ''
 */
export function boreMmToNps(boreMm) {
  const bore = Number(boreMm);
  if (!Number.isFinite(bore) || bore <= 0) return '';
  let best = null;
  for (const [nps, dn] of Object.entries(NPS_TO_DN)) {
    const err = Math.abs(dn - bore);
    if (!best || err < best.err) best = { nps, err };
  }
  return best && best.err <= Math.max(2, bore * 0.02) ? best.nps : '';
}

/**
 * Extract schedule designation from a DTXR description string.
 * @param {string} text
 * @returns {string} e.g. "40", "80", "160", "STD", "XS", "XXS" or ""
 */
export function scheduleFromDtxr(text) {
  const src = String(text ?? '').toUpperCase().replace(/SCH\.?/g, ' SCH ');
  if (/\bXXS\b|DOUBLE\s+EXTRA\s+STRONG/.test(src)) return 'XXS';
  if (/\bXS\b|EXTRA\s+STRONG/.test(src)) return 'XS';
  if (/\bSTD\b|STANDARD\s+WT/.test(src)) return 'STD';
  const hit = src.match(/\bSCH(?:EDULE)?\s*[-:]?\s*(\d{1,3})\s*S?\b/)
    || src.match(/\bSCHEDULE\s*(\d{1,3})\b/);
  return hit ? String(Number(hit[1])) : '';
}

/**
 * Resolve wall thickness from DTXR text and bore mm.
 * @param {{boreMm:number, dtxrValues:string[]}} params
 * @returns {{wallMm:number, nps:string, schedule:string, dtxr:string, source:string, confidence:string}|null}
 */
export function resolveWallFromDtxr({ boreMm, dtxrValues = [] }) {
  const nps = boreMmToNps(boreMm);
  if (!nps) return null;
  for (const dtxr of dtxrValues) {
    if (!dtxr) continue;
    const schedule = scheduleFromDtxr(dtxr);
    if (!schedule) continue;
    const wall = ASME_WALL_MM[nps]?.[schedule];
    if (wall) {
      return { wallMm: wall, nps, schedule, dtxr, source: 'asme-b36.10', confidence: 'HIGH' };
    }
  }
  return null;
}

/**
 * Fallback: return STD wall for bore.
 * @param {number} boreMm
 * @returns {{wallMm:number, source:string, confidence:string}|null}
 */
export function fallbackStdWall(boreMm) {
  const bore = Math.round(Number(boreMm));
  const wall = ASME_STD_WALL[bore];
  if (wall) return { wallMm: wall, source: 'asme-b36.10-std-fallback', confidence: 'MED' };
  return null;
}

/**
 * Full wall resolution: config overrides first, then DTXR, then STD fallback.
 * @param {{boreMm:number, dtxrValues:string[], spre?:string}} params
 * @param {object} config
 * @returns {{wallMm:number, source:string, confidence:string}|null}
 */
export function resolveWall({ boreMm, dtxrValues = [], spre = '' }, config = {}) {
  // Strategy 0: User class+bore override (e.g. "31441C4r01-AMF1||50": "Sch 40")
  const wallMap = config.classWallOverrides;
  if (wallMap && spre) {
    const cls = pipingClassFromSpre(spre);
    const key = `${cls}||${boreMm || 0}`;
    const overSch = wallMap[key];
    if (overSch) {
      const nps = boreMmToNps(boreMm);
      const wall = nps ? ASME_WALL_MM[nps]?.[overSch] : null;
      if (wall) return { wallMm: wall, nps, schedule: overSch, source: `class-override:${key}`, confidence: 'HIGH' };
    }
  }

  // Strategy 1: Extract from DTXR strings
  const fromDtxr = resolveWallFromDtxr({ boreMm, dtxrValues });
  if (fromDtxr) return fromDtxr;

  // Strategy 2: Fallback to standard (STD) wall
  return fallbackStdWall(boreMm);
}

/** Extract piping class prefix from a SPRE path for class-override lookup. */
function pipingClassFromSpre(spre) {
  const parts = String(spre || '').replace(/^\/+/, '').split('/');
  return parts.length >= 2 ? parts.slice(0, -1).join('/') : (parts[0] || '');
}
