/**
 * Functionality: normalizes 3-D position values from StagedJSON
 * attribute objects (APOS, LPOS, POS, HPOS, TPOS etc.) to plain
 * {x,y,z} in mm. All coordinates in the StagedJSON are mm already.
 * Parameters: explicit. Outputs: {x,y,z}|null. No side effects.
 */

/**
 * Parse a position from a StagedJSON attribute value.
 * Accepts {x,y,z} object or "E 1234mm S 5678mm U 910mm" strings.
 * @param {*} value
 * @returns {{x:number, y:number, z:number}|null}
 */
export function parsePoint(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return pointFromObj(value);
  }
  if (typeof value === 'string') {
    return pointFromString(value);
  }
  return null;
}

/**
 * Pick the best available position from a component's attribute map.
 * Priority: APOS (arrive) → POS → LPOS (leave) → HPOS → TPOS → BPOS
 * @param {Record<string,*>} attrs
 * @returns {{x:number, y:number, z:number}|null}
 */
export function bestPosition(attrs) {
  if (!attrs || typeof attrs !== 'object') return null;
  const keys = ['APOS', 'POS', 'LPOS', 'HPOS', 'TPOS', 'BPOS'];
  for (const key of keys) {
    const pt = parsePoint(attrs[key]);
    if (pt) return pt;
  }
  return null;
}

/**
 * Pick arrive position (start of component).
 * @param {Record<string,*>} attrs
 * @returns {{x:number, y:number, z:number}|null}
 */
export function arrivePosition(attrs) {
  if (!attrs) return null;
  return parsePoint(attrs.APOS) ?? parsePoint(attrs.HPOS) ?? parsePoint(attrs.POS) ?? null;
}

/**
 * Pick leave position (end of component).
 * @param {Record<string,*>} attrs
 * @returns {{x:number, y:number, z:number}|null}
 */
export function leavePosition(attrs) {
  if (!attrs) return null;
  return parsePoint(attrs.LPOS) ?? parsePoint(attrs.TPOS) ?? parsePoint(attrs.POS) ?? null;
}

/**
 * Format a {x,y,z} point for the XML <Position> PIPEPLUS format.
 * Rounds to 3 decimal places.
 * @param {{x:number,y:number,z:number}} pt
 * @returns {string}  e.g. "421773.221 -1141354.000 1184.150"
 */
export function formatPosition(pt) {
  if (!pt) return '';
  return `${r3(pt.x)} ${r3(pt.y)} ${r3(pt.z)}`;
}

/**
 * Compute Euclidean distance between two points (mm).
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} b
 * @returns {number}
 */
export function distance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

// ─── Internal helpers ────────────────────────────────────────────

function pointFromObj(obj) {
  const x = num(obj.x ?? obj.X);
  const y = num(obj.y ?? obj.Y);
  const z = num(obj.z ?? obj.Z);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

/** Parses "E 421773.221mm S 1141354mm U 1184.15mm" */
function pointFromString(str) {
  const tokens = str.trim().split(/\s+/);
  if (tokens.length < 6) return null;
  // Pattern: [axis, value, axis, value, axis, value]
  const vals = {};
  for (let i = 0; i < tokens.length - 1; i += 2) {
    const axis = tokens[i].toUpperCase();
    const raw = tokens[i + 1]?.replace(/mm|in|ft/gi, '');
    const n = num(raw);
    if (n === null) return null;
    if (axis === 'E') vals.x = n;
    else if (axis === 'N' || axis === 'S') vals.y = (axis === 'S' ? -n : n);
    else if (axis === 'U' || axis === 'D') vals.z = (axis === 'D' ? -n : n);
  }
  if (vals.x === undefined || vals.y === undefined || vals.z === undefined) return null;
  return { x: vals.x, y: vals.y, z: vals.z };
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).replace(/mm|in|ft|,/gi, '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function r3(n) {
  return Number(n).toFixed(3);
}
