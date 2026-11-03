/**
 * Functionality: resolves pressure rating (CAESAR II numeric value,
 * e.g. 150, 300, 600) from StagedJSON SPRE / ISPE / DTXR strings.
 * Logic copied from xml-cii-regex-tester.js deriveRatingFromPc().
 * Parameters: explicit. Outputs: {rating:number|null, source, confidence}.
 * No side effects.
 */

/**
 * Default ratingSequence: [prefix, CII-rating-value] pairs.
 * Prefix matched against start of piping class string (after cleanup).
 * Ordered longest-match first to avoid ambiguity.
 */
export const DEFAULT_RATING_SEQUENCE = Object.freeze([
  ['200', 20000],
  ['150', 15000],
  ['100', 10000],
  ['900', 900],
  ['600', 600],
  ['300', 300],
  ['25',  2500],
  ['15',  1500],
  ['5',   5000],
  ['9',   900],
  ['3',   300],
  ['6',   600],
  ['1',   150],
]);

/**
 * DTXR keyword patterns → known rating values.
 * Used as fallback when SPRE prefix gives no result.
 */
const DTXR_RATING_PATTERNS = Object.freeze([
  [/\b20000\s*#/,  20000], [/\b15000\s*#/, 15000], [/\b10000\s*#/, 10000],
  [/\b9000\s*#/,    9000], [/\b6000\s*#/,   6000], [/\b5000\s*#/,   5000],
  [/\b3000\s*#/,    3000], [/\b2500\s*#/,   2500], [/\b1500\s*#/,   1500],
  [/\b900\s*#/,      900], [/\b600\s*#/,     600], [/\b300\s*#/,     300],
  [/\b150\s*#/,      150],
  [/\bclass\s*20000\b/i, 20000], [/\bclass\s*15000\b/i, 15000],
  [/\bclass\s*10000\b/i, 10000], [/\bclass\s*9000\b/i,  9000],
  [/\bclass\s*6000\b/i,  6000],  [/\bclass\s*5000\b/i,  5000],
  [/\bclass\s*3000\b/i,  3000],  [/\bclass\s*2500\b/i,  2500],
  [/\bclass\s*1500\b/i,  1500],  [/\bclass\s*900\b/i,    900],
  [/\bclass\s*600\b/i,   600],   [/\bclass\s*300\b/i,   300],
  [/\bclass\s*150\b/i,   150],
  [/\bPN\s*250\b/i, 2500],       [/\bPN\s*150\b/i, 1500],
  [/\bPN\s*100\b/i, 1000],       [/\bPN\s*63\b/i,   630],
  [/\bPN\s*40\b/i,   400],       [/\bPN\s*25\b/i,   250],
  [/\bPN\s*16\b/i,   160],       [/\bPN\s*10\b/i,   100],
]);

/**
 * Derive rating from piping class string using prefix sequence.
 * Strips leading '/', site path tokens, then checks each prefix.
 * @param {string} pipingClass  e.g. "/91261M7r01-AMF1/E90B-150"
 * @param {Array} ratingSequence  [[prefix, value], ...]
 * @returns {{rating: number|null, source: string, confidence: string}}
 */
export function ratingFromPipingClass(pipingClass, ratingSequence = DEFAULT_RATING_SEQUENCE) {
  const clean = String(pipingClass ?? '')
    .replace(/^\/+/, '')
    .split('/')
    .pop()
    .toUpperCase()
    .trim();
  if (!clean) return { rating: null, source: 'none', confidence: 'NONE' };
  for (const [prefix, value] of ratingSequence) {
    const p = String(prefix).toUpperCase();
    if (clean.startsWith(p)) {
      return { rating: Number(value), source: `piping-class-prefix:${prefix}`, confidence: 'HIGH' };
    }
  }
  return { rating: null, source: 'none', confidence: 'NONE' };
}

/**
 * Extract ASME class rating from AVEVA hash-notation path segments.
 * Matches /HOLD-300#/..., /SPCOM-900#/..., /ABC-150#/... patterns.
 * This is the PRIMARY source for AVEVA PSI StagedJSON exports.
 * @param {string} spreValue  — full SPRE path e.g. "/HOLD-300#/GKSW-100"
 * @returns {{rating: number|null, source: string, confidence: string}}
 */
export function ratingFromHashClass(spreValue) {
  const src = String(spreValue ?? '');
  // Match NNN# in any path segment: -150#, -300#, -900#, -1500#, -2500# etc.
  const hit = src.match(/-(\d+)#/);
  if (hit) {
    const n = Number(hit[1]);
    if (Number.isFinite(n) && n > 0) {
      return { rating: n, source: `spre-hash-class:${hit[0]}`, confidence: 'HIGH' };
    }
  }
  return { rating: null, source: 'none', confidence: 'NONE' };
}

/**
 * Try to extract rating from a DTXR description string.
 * @param {string} dtxr
 * @returns {{rating: number|null, source: string, confidence: string}}
 */
export function ratingFromDtxr(dtxr) {
  const src = String(dtxr ?? '');
  for (const [pattern, value] of DTXR_RATING_PATTERNS) {
    if (pattern.test(src)) {
      return { rating: value, source: `dtxr-keyword:${pattern.source}`, confidence: 'MED' };
    }
  }
  return { rating: null, source: 'none', confidence: 'NONE' };
}

/**
 * Resolve rating for a component — tries SPRE → ISPE → DTXR → null.
 * @param {{SPRE?:string, ISPE?:string, DTXR?:string}} attrs
 * @param {Array} ratingSequence
 * @returns {{rating: number|null, source: string, confidence: string}}
 */
export function resolveRating(attrs, ratingSequence = DEFAULT_RATING_SEQUENCE, config = {}) {
  if (!attrs) return { rating: null, source: 'none', confidence: 'NONE' };

  // Strategy 0: user classRatingOverrides map { "31441C4r01-AMF1": 300 }
  const classMap = config.classRatingOverrides;
  if (classMap) {
    const spre = attrs.SPRE || attrs.ISPE || attrs.LSTU || '';
    const cls = pipingClassFromSpre(spre);
    if (cls && classMap[cls] != null) {
      return { rating: Number(classMap[cls]), source: `class-override:${cls}`, confidence: 'HIGH' };
    }
  }

  // Strategy 1: AVEVA hash-class notation (explicit ASME class in SPRE path)
  for (const key of ['SPRE', 'ISPE', 'LSTU']) {
    const val = attrs[key];
    if (val) {
      const result = ratingFromHashClass(val);
      if (result.rating !== null) return result;
    }
  }
  // Strategy 2: Prefix match on the class code segment
  for (const key of ['SPRE', 'ISPE', 'LSTU']) {
    const val = attrs[key];
    if (val) {
      const result = ratingFromPipingClass(val, ratingSequence);
      if (result.rating !== null) return result;
    }
  }
  // Strategy 3: DTXR keyword scan
  const dtxr = attrs.DTXR || attrs.RAW_TYPE || '';
  if (dtxr) {
    const result = ratingFromDtxr(dtxr);
    if (result.rating !== null) return result;
  }
  return { rating: null, source: 'unresolved', confidence: 'NONE' };
}

/** Extract piping class prefix from a SPRE path for class-override lookup. */
function pipingClassFromSpre(spre) {
  const parts = String(spre || '').replace(/^\/+/, '').split('/');
  return parts.length >= 2 ? parts.slice(0, -1).join('/') : (parts[0] || '');
}

