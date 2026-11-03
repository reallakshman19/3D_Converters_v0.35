/**
 * Functionality: resolves component weight (kg) for rigid elements
 * (VALV, FLAN, GASK) by matching DTXR description keywords against
 * the built-in weight DB. Supports interpolation between bore/rating.
 * Parameters: explicit. Outputs: {weightKg, source, confidence}. Pure.
 */

import {
  VALVE_TYPE_KEYWORDS,
  VALVE_WEIGHT_TABLES,
  FLANGE_WEIGHT_KG,
  GASKET_WEIGHT_KG,
} from './sj-weight-db.js';

/**
 * Detect valve type from DTXR description string.
 * @param {string} dtxr
 * @returns {string}  e.g. 'GATE', 'GLOBE', 'BALL', 'GENERIC'
 */
export function detectValveType(dtxr) {
  const src = String(dtxr ?? '');
  for (const [type, pattern] of Object.entries(VALVE_TYPE_KEYWORDS)) {
    if (pattern.test(src)) return type;
  }
  return 'GENERIC';
}

/**
 * Lookup weight from a bore×rating table.
 * Interpolates between nearest bore rows if exact match not found.
 * @param {Record<string,Record<string,number>>} table
 * @param {number} boreMm
 * @param {number} rating
 * @returns {{weightKg: number, method: string}|null}
 */
export function lookupFromTable(table, boreMm, rating) {
  const bore = Math.round(boreMm);
  const rat  = Math.round(rating);
  const availBores = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (!availBores.length) return null;

  const nearestRating = nearestKey(Object.keys(table[availBores[0]] || {}).map(Number), rat);

  // Exact bore match
  if (table[bore]?.[nearestRating] !== undefined) {
    const w = table[bore][nearestRating];
    return { weightKg: w, method: nearestRating === rat ? 'exact' : 'rating-interpolated' };
  }

  // Interpolate between two nearest bores
  const lo = availBores.filter(b => b <= bore).pop();
  const hi = availBores.filter(b => b >= bore)[0];
  if (!lo && !hi) return null;
  if (!lo) return { weightKg: table[hi][nearestRating] ?? 0, method: 'bore-extrapolated' };
  if (!hi) return { weightKg: table[lo][nearestRating] ?? 0, method: 'bore-extrapolated' };
  if (lo === hi) return { weightKg: table[lo][nearestRating] ?? 0, method: 'bore-interpolated' };

  const wLo = table[lo][nearestRating] ?? 0;
  const wHi = table[hi][nearestRating] ?? 0;
  const t = (bore - lo) / (hi - lo);
  return { weightKg: Math.round(wLo + t * (wHi - wLo)), method: 'bore-interpolated' };
}

/**
 * Resolve weight for a VALV component.
 * @param {{boreMm:number, rating:number, dtxr:string}} params
 * @returns {{weightKg:number, valveType:string, source:string, confidence:string}}
 */
export function resolveValveWeight({ boreMm, rating, dtxr }) {
  const valveType = detectValveType(dtxr);
  const table = VALVE_WEIGHT_TABLES[valveType] ?? VALVE_WEIGHT_TABLES.GENERIC;
  const rat = rating || 150;
  const result = lookupFromTable(table, boreMm, rat);
  if (!result) return { weightKg: 0, valveType, source: 'not-found', confidence: 'NONE' };
  return {
    weightKg: result.weightKg,
    valveType,
    source: `built-in-db:${valveType}`,
    confidence: result.method === 'exact' ? 'HIGH' : 'MED',
  };
}

/**
 * Resolve weight for a FLAN component.
 * @param {{boreMm:number, rating:number}} params
 * @returns {{weightKg:number, source:string, confidence:string}}
 */
export function resolveFlangeWeight({ boreMm, rating }) {
  const rat = rating || 150;
  const result = lookupFromTable(FLANGE_WEIGHT_KG, boreMm, rat);
  if (!result) return { weightKg: 0, source: 'not-found', confidence: 'NONE' };
  return {
    weightKg: result.weightKg,
    source: `built-in-db:FLAN`,
    confidence: result.method === 'exact' ? 'HIGH' : 'MED',
  };
}

/**
 * Resolve weight for a GASK component.
 * @param {{boreMm:number, rating:number}} params
 * @returns {{weightKg:number, source:string, confidence:string}}
 */
export function resolveGasketWeight({ boreMm, rating }) {
  const rat = rating || 150;
  const result = lookupFromTable(GASKET_WEIGHT_KG, boreMm, rat);
  if (!result) return { weightKg: 0.2, source: 'default-gasket', confidence: 'LOW' };
  return {
    weightKg: result.weightKg,
    source: 'built-in-db:GASK',
    confidence: result.method === 'exact' ? 'HIGH' : 'MED',
  };
}

/**
 * Main dispatcher: resolve weight for any rigid component.
 * @param {{componentType:string, boreMm:number, rating:number, dtxr:string}} params
 * @returns {{weightKg:number, source:string, confidence:string}}
 */
export function resolveRigidWeight({ componentType, boreMm, rating, dtxr }) {
  const type = String(componentType ?? '').toUpperCase();
  if (type === 'VALV') return resolveValveWeight({ boreMm, rating, dtxr });
  if (type === 'FLAN') return resolveFlangeWeight({ boreMm, rating });
  if (type === 'GASK') return resolveGasketWeight({ boreMm, rating });
  // Other rigid types — use gate valve as generic
  return resolveValveWeight({ boreMm, rating, dtxr: '' });
}

// ─── Internal helpers ────────────────────────────────────────────

function nearestKey(keys, target) {
  if (!keys.length) return target;
  return keys.reduce((best, k) =>
    Math.abs(k - target) < Math.abs(best - target) ? k : best
  );
}
