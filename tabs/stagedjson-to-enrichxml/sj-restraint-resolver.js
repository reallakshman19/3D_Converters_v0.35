/**
 * Functionality: resolves CAESAR II restraint type, gap, friction,
 * stiffness and direction from StagedJSON support attributes.
 * Logic derived from support-mapping.js classifySupportKind() and
 * restraint-type-codes.js — reimplemented standalone.
 * Parameters: explicit. Outputs: plain object. No side effects.
 */

/**
 * All valid CAESAR II restraint type → numeric code.
 * Mirrors NATIVE_RESTRAINT_TYPE_CODES from restraint-type-codes.js.
 */
export const RESTRAINT_CODE_MAP = Object.freeze({
  ANC: 1, GUI: 8, GUIDE: 8, LIM: 9, LIMIT: 9,
  XSNB: 10, YSNB: 11, ZSNB: 12,
  '+X': 13, '+Y': 14, '+Z': 15, '-X': 16, '-Y': 17, '-Z': 18,
  '+RX': 19, '+RY': 20, '+RZ': 21, '-RX': 22, '-RY': 23, '-RZ': 24,
  '+LIM': 25, '-LIM': 26, XROD: 27, YROD: 28, ZROD: 29,
  XSPR: 54, YSPR: 55, ZSPR: 56,
});

/** Default friction for REST supports */
const DEFAULT_FRICTION = 0.3;

/**
 * Classify support kind from raw attribute values.
 * Checks SUPPORT_KIND → SUPPORT_MAPPER_KIND → SUPPORT_TYPE →
 * CMPSUPTYPE → NODETYPE → MDSSUPPTYPE → DTXR → fallback.
 * @param {Record<string,string>} attrs
 * @returns {string}  e.g. 'REST', 'GUIDE', 'ANCHOR', 'LINESTOP', 'SPRING'
 */
export function classifySupportKind(attrs) {
  const a = attrs || {};
  const raw = firstText(a, [
    'SUPPORT_KIND', 'SUPPORT_MAPPER_KIND', 'SUPPORT_TYPE',
    'CMPSUPTYPE', 'NODETYPE', 'MDSSUPPTYPE',
  ]) || firstText(a, ['DTXR']);
  return mapKindString(raw);
}

/**
 * Map a raw kind string to a normalized support kind.
 * @param {string} raw
 * @returns {string}
 */
export function mapKindString(raw) {
  const u = String(raw ?? '').toUpperCase().trim();
  if (!u) return 'REST';
  if (/ANCHOR|FIXED|FIX|ANCI/.test(u)) return 'ANCHOR';
  if (/GUIDE|GT01/.test(u)) return 'GUIDE';
  if (/LINE\s*STOP|LINESTOP|ST06|LS[-_]/.test(u)) return 'LINESTOP';
  if (/SPRING|HANG|HANGER/.test(u)) return 'SPRING';
  if (/REST|SHOE|BASE\s*PLATE|SUPPORT|ATTA/.test(u)) return 'REST';
  return 'REST';
}

/**
 * Build the full restraint record for a support node.
 * Returns type code letter, gap, friction, stiffness, direction.
 * @param {Record<string,string>} attrs  — node attributes
 * @param {string} verticalAxis  — 'Y' or 'Z' (default 'Y')
 * @returns {{kind:string, type:string, gap:number, friction:number, stiffness:number, direction:string, confidence:string}}
 */
export function resolveRestraint(attrs, verticalAxis = 'Y') {
  const kind = classifySupportKind(attrs);
  const gap = numAttr(attrs, ['NODEGAP', 'CMPSUPGAP', 'GAP_MM']) ?? 0;
  const stiffness = numAttr(attrs, ['NODESTIFF', 'STIFFNESS']) ?? 0;
  const friction = numAttr(attrs, ['NODEFRICTION', 'FRICTION']) ?? (kind === 'REST' ? DEFAULT_FRICTION : 0);

  switch (kind) {
    case 'ANCHOR':
      return { kind, type: 'ANC', gap, friction: 0, stiffness: 0, direction: 'A', confidence: 'HIGH' };
    case 'GUIDE':
      return { kind, type: 'GUI', gap, friction: 0, stiffness, direction: 'GUI', confidence: 'HIGH' };
    case 'LINESTOP':
      return { kind, type: 'LIM', gap, friction: 0, stiffness, direction: 'LIM', confidence: 'HIGH' };
    case 'SPRING':
      return {
        kind, type: verticalAxis === 'Z' ? 'ZSPR' : 'YSPR',
        gap: 0, friction: 0, stiffness, direction: verticalAxis === 'Z' ? '+Z' : '+Y',
        confidence: 'HIGH',
      };
    default: // REST / SHOE
      return {
        kind: 'REST', type: verticalAxis === 'Z' ? '+Z' : '+Y',
        gap, friction, stiffness: 0, direction: verticalAxis === 'Z' ? '+Z' : '+Y',
        confidence: 'HIGH',
      };
  }
}

/**
 * Format a <Restraint> XML block string from a resolved restraint.
 * @param {{type:string, gap:number, friction:number, stiffness:number}} r
 * @returns {string}
 */
export function formatRestraintXml(r) {
  const lines = ['<Restraint>'];
  lines.push(`  <Type>${r.type}</Type>`);
  if (r.gap > 0) lines.push(`  <Gap>${r.gap}</Gap>`);
  if (r.stiffness > 0) lines.push(`  <Stiffness>${r.stiffness}</Stiffness>`);
  if (r.friction > 0) lines.push(`  <Friction>${r.friction}</Friction>`);
  lines.push('</Restraint>');
  return lines.join('\n');
}

// ─── Internal helpers ────────────────────────────────────────────

function firstText(attrs, keys) {
  for (const key of keys) {
    const v = attrs?.[key];
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function numAttr(attrs, keys) {
  for (const key of keys) {
    const v = attrs?.[key];
    if (v === undefined || v === null) continue;
    const s = String(v).replace(/[^0-9.-]/g, '');
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
