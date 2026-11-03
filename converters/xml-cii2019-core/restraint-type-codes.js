/**
 * CAESAR II restraint type letter/kind -> numeric type code (1-62) lookup.
 * This must stay in sync with NATIVE_RESTRAINT_TYPE_CODES and
 * _restraint_type_to_code() in converters/scripts/xml_to_cii2019.py — that
 * Python worker is the source of truth for the numeric codes actually written
 * into CII output; this module mirrors it for UI display/edit purposes only.
 */

export const NATIVE_RESTRAINT_TYPE_CODES = Object.freeze({
  ANC: 1, GUI: 8, GUIDE: 8, LIM: 9, LIMIT: 9, XSNB: 10, YSNB: 11, ZSNB: 12,
  '+X': 13, '+Y': 14, '+Z': 15, '-X': 16, '-Y': 17, '-Z': 18,
  '+RX': 19, '+RY': 20, '+RZ': 21, '-RX': 22, '-RY': 23, '-RZ': 24,
  '+LIM': 25, '-LIM': 26, XROD: 27, YROD: 28, ZROD: 29,
  '+XROD': 30, '+YROD': 31, '+ZROD': 32, '-XROD': 33, '-YROD': 34,
  '-ZROD': 35, X2: 36, Y2: 37, Z2: 38, RX2: 39, RY2: 40,
  RZ2: 41, '+X2': 42, '+Y2': 43, '+Z2': 44, '-X2': 45, '-Y2': 46,
  '-Z2': 47, '+RX2': 48, '+RY2': 49, '+RZ2': 50, '-RX2': 51,
  '-RY2': 52, '-RZ2': 53, XSPR: 54, YSPR: 55, ZSPR: 56,
  '+XSNB': 57, '+YSNB': 58, '+ZSNB': 59, '-XSNB': 60, '-YSNB': 61,
  '-ZSNB': 62,
});

/**
 * Mirrors _restraint_type_to_code(): explicit numeric strings pass through,
 * signed/native letter codes map directly, A/ANCHOR/FIXED/FIX -> 1, and bare
 * unsigned axis letters follow the XML->CII frame swap (X->17, Y->19, Z->18)
 * that compensates for the coordinate frame difference between XML geometry
 * (XML XYZ -> CII X, Z, -Y) and restraint axis letters.
 */
export function restraintTypeToCaesarCode(restraintType) {
  const normalized = String(restraintType ?? '').trim().toUpperCase();
  if (!normalized) return null;

  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && Math.abs(numeric - Math.round(numeric)) < 1e-6) {
    const rounded = Math.round(numeric);
    if (rounded >= 1 && rounded <= 62) return rounded;
  }

  if (Object.prototype.hasOwnProperty.call(NATIVE_RESTRAINT_TYPE_CODES, normalized)) {
    return NATIVE_RESTRAINT_TYPE_CODES[normalized];
  }

  if (['A', 'ANCHOR', 'FIXED', 'FIX'].includes(normalized)) return 1;

  const bare = normalized.replace(/^[+-]/, '');
  if (bare === 'X') return 17;
  if (bare === 'Y') return 19;
  if (bare === 'Z') return 18;

  return null;
}
