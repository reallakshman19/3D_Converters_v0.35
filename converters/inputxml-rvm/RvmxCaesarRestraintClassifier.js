function text(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function normalizeSupportLabel(value) {
  return upper(value)
    .replace(/[_\-./]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const CAESAR_SUPPORT_MAPPING_TABLE = Object.freeze({
  REST: Object.freeze([
    'REST',
    'SHOE',
    'BP',
    'BEARING PLATE',
    'WP',
    'WEAR PAD',
    'ANCI',
  ]),
  GUIDE: Object.freeze([
    'GUIDE',
  ]),
  LINESTOP: Object.freeze([
    'LINE STOP',
    'LINESTOP',
    'STOPPER',
  ]),
  LIMIT: Object.freeze([
    'LIMIT',
    'LIMIT STOP',
    'LIM',
  ]),
  ANCHOR: Object.freeze([
    'ANCHOR',
    'ANC',
  ]),
  HANGER: Object.freeze([
    'HANGER',
    'SPRING',
  ]),
});

function hasSupportAlias(label, kind) {
  const normalized = normalizeSupportLabel(label);
  const aliases = CAESAR_SUPPORT_MAPPING_TABLE[kind] || [];

  return aliases.some((alias) => {
    const normalizedAlias = normalizeSupportLabel(alias);
    if (!normalizedAlias) return false;

    if (normalizedAlias.length <= 4) {
      const tokenPattern = new RegExp(`(^|\\s)${escapeRegex(normalizedAlias)}(\\s|$)`);
      return tokenPattern.test(normalized);
    }

    return normalized.includes(normalizedAlias);
  });
}

export function caesarNumberOrNull(value) {
  const raw = text(value);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n - -1.0101) < 0.001) return null;
  return n;
}

export function caesarAxisFromAttrs(attrs = {}) {
  const x = caesarNumberOrNull(attrs.XCOSINE ?? attrs.X_COSINE ?? attrs.XCOS ?? attrs.X) ?? 0;
  const y = caesarNumberOrNull(attrs.YCOSINE ?? attrs.Y_COSINE ?? attrs.YCOS ?? attrs.Y) ?? 0;
  const z = caesarNumberOrNull(attrs.ZCOSINE ?? attrs.Z_COSINE ?? attrs.ZCOS ?? attrs.Z) ?? 0;
  const abs = { x: Math.abs(x), y: Math.abs(y), z: Math.abs(z) };
  const dominant = abs.x >= abs.y && abs.x >= abs.z ? 'X' : abs.y >= abs.z ? 'Y' : 'Z';
  return { x, y, z, dominant, magnitude: Math.sqrt(x * x + y * y + z * z) };
}

export function classifyCaesarRestraint(attrs = {}, context = {}) {
  const tagName = upper(context.tagName || attrs.sourceTagName || '');
  if (tagName.includes('HANGER') || tagName.includes('SPRING')) return 'HANGER';

  const label = upper([
    attrs.NAME,
    attrs.LABEL,
    attrs.DESCRIPTION,
    attrs.TYPE_DESC,
    attrs.TYPE_DESCRIPTION,
  ].filter(Boolean).join(' '));

  if (hasSupportAlias(label, 'LINESTOP')) return 'LINESTOP';
  if (hasSupportAlias(label, 'GUIDE')) return 'GUIDE';
  if (hasSupportAlias(label, 'LIMIT')) return 'LIMIT';

  // Project support descriptions such as ANCI / SHOE / BP / WP denote a resting
  // support family. Check this before ANCHOR so ANCI does not get confused with
  // ANC/ANCHOR shorthand.
  if (hasSupportAlias(label, 'REST')) return 'REST';

  if (hasSupportAlias(label, 'ANCHOR')) return 'ANCHOR';
  if (hasSupportAlias(label, 'HANGER')) return 'HANGER';

  const code = caesarNumberOrNull(attrs.TYPE ?? attrs.RESTRAINT_TYPE ?? attrs.CAESAR_TYPE);
  const gap = caesarNumberOrNull(attrs.GAP ?? attrs.GAP1 ?? attrs.GAP2);
  const stiffness = caesarNumberOrNull(attrs.STIFFNESS ?? attrs.K ?? attrs.STIF);
  const cNode = caesarNumberOrNull(attrs.CNODE ?? attrs.C_NODE ?? attrs.C_NODE_NUMBER);
  const axis = caesarAxisFromAttrs(attrs);

  if (code === 17) return 'GUIDE';
  if ([18, 19].includes(code)) return 'LINESTOP';
  if ([15, 16, 20, 21].includes(code)) return 'LIMIT';
  if ([22, 23, 24].includes(code)) return 'ANCHOR';
  if (gap != null && Math.abs(gap) > 1e-9) return 'LIMIT';
  if (cNode != null) return 'LIMIT';
  if (stiffness != null && stiffness > 0 && code != null && code >= 10) return 'LIMIT';
  if ([1, 2, 3, 4, 5, 6].includes(code)) return 'REST';
  if (axis.magnitude > 0.5) return 'REST';
  return 'UNKNOWN';
}

export function caesarSupportLabel(attrs = {}, context = {}) {
  const kind = classifyCaesarRestraint(attrs, context);
  const node = text(attrs.NODE ?? attrs.AT_NODE ?? attrs.SUPPORT_NODE ?? attrs.RESTRAINT_NODE);
  const code = caesarNumberOrNull(attrs.TYPE ?? attrs.RESTRAINT_TYPE ?? attrs.CAESAR_TYPE);
  const axis = caesarAxisFromAttrs(attrs);
  const parts = [kind];
  if (node) parts.push(`N${node}`);
  if (code != null) parts.push(`T${code}`);
  if (axis.magnitude > 0.5) parts.push(axis.dominant);
  return parts.join(' ');
}

export function isValidCaesarSupportAttrs(attrs = {}, tagName = '') {
  const tag = upper(tagName);
  if (tag.includes('HANGER') || tag.includes('SPRING')) return true;
  const node = caesarNumberOrNull(attrs.NODE ?? attrs.AT_NODE ?? attrs.SUPPORT_NODE ?? attrs.RESTRAINT_NODE);
  const type = caesarNumberOrNull(attrs.TYPE ?? attrs.RESTRAINT_TYPE ?? attrs.CAESAR_TYPE);
  return node != null || type != null;
}
