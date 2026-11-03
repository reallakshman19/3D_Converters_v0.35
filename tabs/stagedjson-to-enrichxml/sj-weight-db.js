/**
 * Functionality: essential built-in weight master rows for standard
 * valves, flanges and gaskets. Extracted from default-weight-master-rows.js.
 * Keys: componentType, boreMm, rating, weightKg.
 * All rows in plain JS — no external dependencies.
 */

/**
 * Valve type keyword → semantic weight type.
 * Used by sj-weight-resolver.js to classify DTXR strings.
 */
export const VALVE_TYPE_KEYWORDS = Object.freeze({
  GATE: /\bGATE\b/i,
  GLOBE: /\bGLOBE\b/i,
  CHECK: /\bCHECK\b/i,
  BALL: /\bBALL\b/i,
  BUTTERFLY: /\bBUTTERFLY\b/i,
  PLUG: /\bPLUG\b/i,
  NEEDLE: /\bNEEDLE\b/i,
  CONTROL: /\bCONTROL\b/i,
  SAFETY: /\bSAFETY|RELIEF\b/i,
  SWING: /\bSWING\b/i,
  DIAPHRAGM: /\bDIAPHRAGM\b/i,
});

/**
 * OD reference: DN bore → OD mm (ASME B36.10)
 */
export const DN_TO_OD_MM = Object.freeze({
  15: 21.3, 20: 26.7, 25: 33.4, 32: 42.2, 40: 48.3, 50: 60.3,
  65: 73.0, 80: 88.9, 100: 114.3, 125: 141.3, 150: 168.3,
  200: 219.1, 250: 273.0, 300: 323.8, 350: 355.6, 400: 406.4,
  450: 457.2, 500: 508.0, 600: 609.6,
});

/**
 * Flange weight fallback table by bore + rating (approx kg).
 * Source: ASME B16.5 standard flange weight estimates.
 * Format: { [DN]: { [rating]: kg } }
 */
export const FLANGE_WEIGHT_KG = Object.freeze({
  25:  { 150: 1.2,  300: 1.8,  600: 2.5,  900: 3.8,  1500: 6.2  },
  40:  { 150: 1.8,  300: 2.5,  600: 3.8,  900: 5.5,  1500: 9.0  },
  50:  { 150: 2.5,  300: 3.5,  600: 5.2,  900: 7.5,  1500: 12.5 },
  80:  { 150: 4.5,  300: 6.2,  600: 9.5,  900: 14.0, 1500: 23.0 },
  100: { 150: 6.5,  300: 9.5,  600: 14.0, 900: 21.0, 1500: 34.0 },
  150: { 150: 11.5, 300: 17.0, 600: 25.0, 900: 38.0, 1500: 62.0 },
  200: { 150: 19.0, 300: 28.0, 600: 42.0, 900: 65.0, 1500: 106.0},
  250: { 150: 28.0, 300: 43.0, 600: 65.0, 900: 100.0,1500: 165.0},
  300: { 150: 42.0, 300: 63.0, 600: 95.0, 900: 148.0,1500: 245.0},
  350: { 150: 55.0, 300: 85.0, 600: 130.0,900: 200.0,1500: 330.0},
  400: { 150: 72.0, 300: 110.0,600: 170.0,900: 265.0,1500: 440.0},
  450: { 150: 90.0, 300: 140.0,600: 215.0,900: 335.0,1500: 560.0},
  500: { 150: 115.0,300: 175.0,600: 275.0,900: 425.0,1500: 715.0},
  600: { 150: 165.0,300: 255.0,600: 400.0,900: 625.0,1500: 1050.0},
});

/**
 * Gate valve weight table (butt-weld, CS, ASME B16.10/API 600 estimates).
 * Format: { [DN]: { [rating]: kg } }
 */
export const GATE_VALVE_KG = Object.freeze({
  25:  { 150: 5,    300: 7,    600: 9,    900: 12,   1500: 18   },
  40:  { 150: 8,    300: 11,   600: 15,   900: 20,   1500: 30   },
  50:  { 150: 12,   300: 17,   600: 24,   900: 32,   1500: 48   },
  80:  { 150: 22,   300: 32,   600: 45,   900: 60,   1500: 90   },
  100: { 150: 38,   300: 55,   600: 78,   900: 104,  1500: 156  },
  150: { 150: 75,   300: 110,  600: 155,  900: 207,  1500: 310  },
  200: { 150: 130,  300: 190,  600: 270,  900: 360,  1500: 540  },
  250: { 150: 210,  300: 310,  600: 440,  900: 585,  1500: 880  },
  300: { 150: 320,  300: 470,  600: 665,  900: 885,  1500: 1330 },
  350: { 150: 450,  300: 660,  600: 935,  900: 1245, 1500: 1870 },
  400: { 150: 610,  300: 895,  600: 1265, 900: 1685, 1500: 2530 },
  450: { 150: 800,  300: 1175, 600: 1660, 900: 2215, 1500: 3320 },
  500: { 150: 1030, 300: 1510, 600: 2135, 900: 2845, 1500: 4270 },
  600: { 150: 1560, 300: 2285, 600: 3230, 900: 4305, 1500: 6460 },
});

/**
 * Globe valve weight table (approx 1.4× gate valve).
 */
export const GLOBE_VALVE_KG = Object.freeze(
  Object.fromEntries(
    Object.entries(GATE_VALVE_KG).map(([dn, ratings]) => [
      dn,
      Object.fromEntries(Object.entries(ratings).map(([r, w]) => [r, Math.round(w * 1.4)])),
    ])
  )
);

/**
 * Check valve weight table (approx 0.8× gate valve).
 */
export const CHECK_VALVE_KG = Object.freeze(
  Object.fromEntries(
    Object.entries(GATE_VALVE_KG).map(([dn, ratings]) => [
      dn,
      Object.fromEntries(Object.entries(ratings).map(([r, w]) => [r, Math.round(w * 0.8)])),
    ])
  )
);

/**
 * Ball valve weight table (approx 0.7× gate valve).
 */
export const BALL_VALVE_KG = Object.freeze(
  Object.fromEntries(
    Object.entries(GATE_VALVE_KG).map(([dn, ratings]) => [
      dn,
      Object.fromEntries(Object.entries(ratings).map(([r, w]) => [r, Math.round(w * 0.7)])),
    ])
  )
);

/**
 * Butterfly valve weight (approx 0.3× gate valve, disc type).
 */
export const BUTTERFLY_VALVE_KG = Object.freeze(
  Object.fromEntries(
    Object.entries(GATE_VALVE_KG).map(([dn, ratings]) => [
      dn,
      Object.fromEntries(Object.entries(ratings).map(([r, w]) => [r, Math.round(w * 0.3)])),
    ])
  )
);

/** Map of valve type name → weight table */
export const VALVE_WEIGHT_TABLES = Object.freeze({
  GATE: GATE_VALVE_KG,
  GLOBE: GLOBE_VALVE_KG,
  CHECK: CHECK_VALVE_KG,
  BALL: BALL_VALVE_KG,
  BUTTERFLY: BUTTERFLY_VALVE_KG,
  PLUG: GATE_VALVE_KG,      // approximate
  SWING: CHECK_VALVE_KG,    // approximate
  CONTROL: GLOBE_VALVE_KG,  // approximate
  SAFETY: GLOBE_VALVE_KG,   // approximate
  DIAPHRAGM: GATE_VALVE_KG, // approximate
  NEEDLE: GATE_VALVE_KG,    // approximate
  GENERIC: GATE_VALVE_KG,   // last resort
});

/** Gasket weight table (negligible but needed for zero-weight detection) */
export const GASKET_WEIGHT_KG = Object.freeze({
  25: { 150: 0.1, 300: 0.15, 600: 0.2, 900: 0.3, 1500: 0.5 },
  50: { 150: 0.2, 300: 0.3,  600: 0.4, 900: 0.6, 1500: 0.9 },
  100:{ 150: 0.5, 300: 0.7,  600: 1.0, 900: 1.5, 1500: 2.2 },
  150:{ 150: 0.8, 300: 1.2,  600: 1.7, 900: 2.5, 1500: 3.8 },
  200:{ 150: 1.2, 300: 1.8,  600: 2.5, 900: 3.8, 1500: 5.7 },
  250:{ 150: 1.8, 300: 2.7,  600: 3.8, 900: 5.7, 1500: 8.5 },
  300:{ 150: 2.5, 300: 3.8,  600: 5.4, 900: 8.0, 1500: 12.0},
  400:{ 150: 4.2, 300: 6.3,  600: 9.0, 900: 13.5,1500: 20.0},
  600:{ 150: 9.0, 300: 13.5, 600: 19.0,900: 28.0,1500: 42.0},
});
