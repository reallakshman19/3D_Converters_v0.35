/**
 * formatter.js — Number formatting and unit conversion helpers.
 * Asset version: 20260610-format-1.
 */

/**
 * Format a number to fixed decimal places, return '—' for null/undefined.
 * @param {number|null} val
 * @param {number} dp  decimal places
 */
export function fmt(val, dp = 2) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return Number(val).toFixed(dp);
}

/**
 * Round a numeric value and return a Number, or null if invalid.
 */
export function round(val, dp = 2) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(dp));
}

/**
 * Make a unit label more readable for display.
 */
export function prettyUnit(unit) {
  if (unit === null || unit === undefined || unit === '') return '';
  const raw = String(unit).trim();
  const key = raw.toUpperCase().replace(/[^A-Z0-9/]+/g, '');
  const map = {
    C: '°C',
    DEGC: '°C',
    CELSIUS: '°C',
    KPA: 'kPa',
    MPA: 'MPa',
    BAR: 'bar',
    MM: 'mm',
    M: 'm',
    CM: 'cm',
    'KG/M3': 'kg/m³',
    'KG/M^3': 'kg/m³',
    'KG/CM3': 'kg/cm³',
    'KG/CM^3': 'kg/cm³',
    N: 'N',
    NM: 'N·m',
    PA: 'Pa',
    PSI: 'psi',
  };
  return map[key] || raw;
}

/**
 * Return a formatted suffix like ` (mm)` or an empty string if no unit is known.
 */
export function unitSuffix(unit) {
  const label = prettyUnit(unit);
  return label ? ` (${label})` : '';
}

/**
 * Format a number with a unit suffix.
 */
export function fmtUnit(val, unit, dp = 2) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const suffix = prettyUnit(unit);
  return `${Number(val).toFixed(dp)}${suffix ? ` ${suffix}` : ''}`;
}

/**
 * Format with a + sign for positive values (displacements).
 */
export function fmtSigned(val, dp = 1) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const n = Number(val);
  return (n >= 0 ? '+' : '') + n.toFixed(dp);
}

/**
 * Format a ratio (0–100) as a percentage string, e.g. "33.1%".
 */
export function fmtPct(val) {
  if (val === null || val === undefined) return '—';
  return Number(val).toFixed(1) + '%';
}

/**
 * Derive material label from density (kg/m³ or kg/cm³).
 * CAESAR II stores density in kg/cm³ → 7.833e-3 = CS.
 */
export function materialFromDensity(densityValue) {
  let d = Number(densityValue);
  if (!Number.isFinite(d) || d <= 0) return '?';

  // Normalize density to kg/m^3 when it is clearly stored as kg/cm^3.
  if (d < 0.1) d *= 1e6;

  if (d > 5000 && d < 9000) return 'CS';
  if (d >= 9000 && d < 12000) return 'SS304';
  if (d >= 12000) return 'CS-HT';
  return 'CS';
}

/**
 * Format a node ID nicely (integer if whole number).
 */
export function fmtNode(val) {
  const n = Number(val);
  return Number.isInteger(n) ? String(n) : fmt(n, 0);
}

/**
 * Compute pipe length from delta components (mm).
 */
export function pipeLength(dx, dy, dz) {
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
