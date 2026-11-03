/**
 * Pure, stateless support-kind resolver.
 * No browser APIs. No localStorage. No framework imports.
 * See docs/support-kind-resolution.md for the full consumer inventory.
 */

export const SUPPORT_KINDS = ['REST', 'GUIDE', 'LINESTOP', 'LIMIT', 'ANCHOR', 'SPRING'];
export const MATCH_TYPES   = ['startsWith', 'equals', 'contains', 'regex'];

// Default SKEY → kind lookup. Injected as kindMap by callers that need it.
// CA250 is a stiffer rest variant — same render kind as CA150.
export const DEFAULT_KIND_MAP = {
  CA150: 'REST',
  CA250: 'REST',
  CA100: 'GUIDE',
};

// Ordered by precedence. CA codes are checked first, then CMPSUPTYPE
// support-intent rules, then MDSSUPPTYPE subtype rules. This matters for
// real RVM data where PG-* guide supports also carry MDSSUPPTYPE=GT5xx.
export const DEFAULT_RULES = [
  // Custom text patterns for specific support mapping (Higher precedence)
  { id: 'builtin-user-rest',       field: 'SPRE,SKEY,NAME,DESCRIPTION,DESC,CMPSUPTYPE', pattern: 'REST,SHOE,BP,BEARING PLATE,WP,WEAR PAD,ANCI', match: 'contains', kind: 'REST', label: 'REST/SHOE/BP/WP/ANCI -> REST' },
  { id: 'builtin-user-limit',      field: 'SPRE,SKEY,NAME,DESCRIPTION,DESC,CMPSUPTYPE', pattern: 'LIMIT STOP,AXIAL STOP,LINE STOP,DIRECTIONAL ANCHOR', match: 'contains', kind: 'LINESTOP', label: 'LINE/LIMIT/AXIAL STOP/DIRECTIONAL ANCHOR -> LINESTOP' },
  { id: 'builtin-user-guide',      field: 'SPRE,SKEY,NAME,DESCRIPTION,DESC,CMPSUPTYPE', pattern: 'GUIDE', match: 'contains', kind: 'GUIDE', label: 'GUIDE -> GUIDE' },

  { id: 'builtin-ca150',     field: 'SKEY',                            pattern: 'CA150',     match: 'equals',     kind: 'REST',     label: 'SKEY CA150 -> REST' },
  { id: 'builtin-ca250',     field: 'SKEY',                            pattern: 'CA250',     match: 'equals',     kind: 'REST',     label: 'SKEY CA250 -> REST' },
  { id: 'builtin-ca100',     field: 'SKEY',                            pattern: 'CA100',     match: 'equals',     kind: 'GUIDE',    label: 'SKEY CA100 -> GUIDE' },
  { id: 'builtin-pg',        field: 'CMPSUPTYPE',                      pattern: 'PG-',       match: 'startsWith', kind: 'GUIDE',    label: 'PG-* -> GUIDE' },
  { id: 'builtin-ls',        field: 'CMPSUPTYPE',                      pattern: 'LS-',       match: 'startsWith', kind: 'LINESTOP', label: 'LS-* -> LINESTOP' },
  { id: 'builtin-bp',        field: 'CMPSUPTYPE',                      pattern: 'BP-',       match: 'startsWith', kind: 'REST',     label: 'BP-* -> REST' },
  { id: 'builtin-g',         field: 'CMPSUPTYPE',                      pattern: 'G-',        match: 'startsWith', kind: 'GUIDE',    label: 'G-* -> GUIDE' },
  { id: 'builtin-rest',      field: 'CMPSUPTYPE',                      pattern: 'REST',      match: 'equals',     kind: 'REST',     label: 'REST -> REST' },
  { id: 'builtin-gt5-cmp',   field: 'CMPSUPTYPE',                      pattern: 'GT5',       match: 'startsWith', kind: 'REST',     label: 'CMPSUPTYPE GT5* -> REST' },
  { id: 'builtin-gt5-mds',   field: 'MDSSUPPTYPE',                     pattern: 'GT5',       match: 'startsWith', kind: 'REST',     label: 'MDSSUPPTYPE GT5* -> REST' },
  { id: 'builtin-gt5-text',  field: 'SPRE,SKEY,NAME,DESCRIPTION,DESC', pattern: 'GT5',       match: 'contains',   kind: 'REST',     label: 'Text contains GT5 -> REST' },
  { id: 'builtin-gt-mds',          field: 'MDSSUPPTYPE',                     pattern: 'GT',        match: 'startsWith', kind: 'GUIDE',    label: 'GT* -> GUIDE' },
  { id: 'builtin-bt',              field: 'MDSSUPPTYPE',                     pattern: 'BT',        match: 'startsWith', kind: 'REST',     label: 'BT* -> REST' },
  { id: 'builtin-an',              field: 'MDSSUPPTYPE',                     pattern: 'AN',        match: 'startsWith', kind: 'ANCHOR',   label: 'AN* -> ANCHOR' },
  { id: 'builtin-pipe-rest',       field: 'MDSSUPPTYPE',                     pattern: 'PIPE-REST', match: 'equals',     kind: 'REST',     label: 'PIPE-REST -> REST' },
  // AVEVA MDS/SPRECON piping-spec codes (SPRE field) — covers GT01/GT02=GUIDE, ST06=LINESTOP, AT0x/PIPE-REST=REST
  { id: 'builtin-spre-guide',      field: 'SPRE',                            pattern: 'GT01,GT02,GT03,GT04', match: 'contains', kind: 'GUIDE',    label: 'SPRE GT01/GT02/GT03/GT04 -> GUIDE' },
  { id: 'builtin-spre-linestop',   field: 'SPRE',                            pattern: 'ST06,ST07,ST08',      match: 'contains', kind: 'LINESTOP', label: 'SPRE ST06/ST07/ST08 -> LINESTOP' },
  { id: 'builtin-spre-rest',       field: 'SPRE',                            pattern: 'PIPE-REST,AT01,AT02,AT03,AT04,AT05', match: 'contains', kind: 'REST', label: 'SPRE PIPE-REST/AT0x -> REST' },
  
];


// ── Direction heuristic ───────────────────────────────────────────────────────
// Maps PCF SUPPORT-DIRECTION values to support kinds when enough context exists.
// UP/DOWN are vertical → pipe rests on support (REST).
// Cardinal / intercardinal directions require pipe-axis context.
// Kept separate from resolveKindFromText so callers can apply only direction
// matching without triggering the broader keyword scan.
function _vectorFromObject(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x ?? value.X);
  const y = Number(value.y ?? value.Y);
  const z = Number(value.z ?? value.Z);
  if (![x, y, z].every(Number.isFinite)) return null;
  const length = Math.sqrt((x * x) + (y * y) + (z * z));
  return length > 0.0001 ? { x: x / length, y: y / length, z: z / length } : null;
}

function _vectorFromText(value) {
  const parts = String(value || '').split(/[,\s]+/).map(Number).filter(Number.isFinite);
  return parts.length >= 3 ? _vectorFromObject({ x: parts[0], y: parts[1], z: parts[2] }) : null;
}

function _directionAxis(rawText) {
  const t = String(rawText || '').toUpperCase();
  if (/\bUP\b/.test(t)) return { x: 0, y: 1, z: 0, vertical: true };
  if (/\bDOWN\b/.test(t)) return { x: 0, y: -1, z: 0, vertical: true };
  if (/\bNORTHEAST\b|\bNORTH-EAST\b|\bNE\b/.test(t)) return _vectorFromObject({ x: 1, y: 0, z: -1 });
  if (/\bNORTHWEST\b|\bNORTH-WEST\b|\bNW\b/.test(t)) return _vectorFromObject({ x: -1, y: 0, z: -1 });
  if (/\bSOUTHEAST\b|\bSOUTH-EAST\b|\bSE\b/.test(t)) return _vectorFromObject({ x: 1, y: 0, z: 1 });
  if (/\bSOUTHWEST\b|\bSOUTH-WEST\b|\bSW\b/.test(t)) return _vectorFromObject({ x: -1, y: 0, z: 1 });
  if (/\bNORTH\b/.test(t)) return { x: 0, y: 0, z: -1 };
  if (/\bSOUTH\b/.test(t)) return { x: 0, y: 0, z: 1 };
  if (/\bEAST\b/.test(t)) return { x: 1, y: 0, z: 0 };
  if (/\bWEST\b/.test(t)) return { x: -1, y: 0, z: 0 };
  return null;
}

function _pipeAxisFromEntries(entries) {
  const match = (entries || []).find((entry) => (
    entry.normalizedKey === 'PIPEAXISCOSINES' ||
    entry.normalizedKey === 'PIPEAXIS' ||
    entry.normalizedKey === 'PIPEAXISVECTOR'
  ));
  return _vectorFromObject(match?.value) || _vectorFromText(match?.value);
}

export function resolveKindFromDirection(rawText, options = {}) {
  const axis = _directionAxis(rawText);
  if (!axis) return '';
  if (axis.vertical) return 'REST';
  const pipeAxis = _vectorFromObject(options.pipeAxis) ||
    _vectorFromText(options.pipeAxis) ||
    _pipeAxisFromEntries(options.entries);
  if (!pipeAxis) return '';
  const alignment = Math.abs((axis.x * pipeAxis.x) + (axis.y * pipeAxis.y) + (axis.z * pipeAxis.z));
  if (alignment >= 0.75) return 'LINESTOP';
  if (alignment <= 0.35) return 'GUIDE';
  return '';
}

// ── Text heuristic ────────────────────────────────────────────────────────────
// Merges keyword patterns from supportKindFromRestraint (xml-support-builder.js)
// and normalizeSupportKind (RvmSupportSymbols.js). Order matters: specific
// patterns before generic (ANCHOR before REST, LINESTOP/STOPPER before STOP).
export function resolveKindFromText(rawText) {
  const t = String(rawText || '').toUpperCase();
  if (/\bDIRECTIONAL\s+ANCHOR\b|\bLINE\s*STOP\b|\bLINESTOP\b|\bLIMIT\s*STOP\b|\bAXIAL\s*STOP\b/.test(t)) return 'LINESTOP';
  if (/\bANC(HOR)?\b|\bFIX(ED)?\b|\bRIGID\b/.test(t))          return 'ANCHOR';
  if (/\bGUIDE\b|\bGDE\b|\bGUI\b|\bSLIDE\b|\bSLID\b|\bLATERAL\b/.test(t))  return 'GUIDE';
  if (/\bSPRING\b|\bHANGER\b/.test(t))                           return 'SPRING';
  if (/\bREST(ING)?\b|\bRST\b|\bSHOE\b|\bBASE\s*PLATE\b|\bBEARING\s*PLATE\b|\bWEAR\s*PAD\b|\bBP\b|\bWP\b|\bANCI\b|\+Y\b/.test(t)) return 'REST';
  return '';
}

// ── Rule-matching primitives ──────────────────────────────────────────────────
// Exported so RvmSupportMapper.js can re-export them for backwards compatibility
// with existing tests and UI code that imports them from the mapper.

export function splitRuleTerms(value) {
  return String(value || '').split(/[,;\n]+/).map(t => t.trim()).filter(Boolean);
}

export function normalizeMapperFieldName(fieldName) {
  const trimmed = String(fieldName || '').trim();
  if (trimmed === '*') return '*';
  return trimmed.replace(/^<+|>+$/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const _NESTED_KEYS = new Set([
  'ATTRIBUTES', 'RAWATTRIBUTES', 'SOURCEATTRIBUTES', 'USERDATA', 'PROPERTIES', 'PROPS',
]);

function _collectEntries(input, seen = new Set(), depth = 0) {
  if (!input || typeof input !== 'object' || seen.has(input) || depth > 4) return [];
  seen.add(input);
  const out = [];
  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue;
    const nk = normalizeMapperFieldName(key);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (_NESTED_KEYS.has(nk)) out.push(..._collectEntries(value, seen, depth + 1));
      continue;
    }
    out.push({ key, normalizedKey: nk, value });
  }
  return out;
}

export function collectMapperFieldValues(attrs, rule) {
  const entries = _collectEntries(attrs);
  const fields  = splitRuleTerms(rule?.field);
  const all     = !fields.length || fields.some(f => {
    const n = normalizeMapperFieldName(f);
    return n === '*' || n === 'ANY';
  });
  if (all) return entries.map(e => e.value).filter(v => String(v).trim());
  const wanted = new Set(fields.map(normalizeMapperFieldName));
  return entries.filter(e => wanted.has(e.normalizedKey)).map(e => e.value).filter(v => String(v).trim());
}

function _matchValue(rule, value) {
  const match    = MATCH_TYPES.includes(rule?.match) ? rule.match : 'contains';
  const raw      = String(value ?? '');
  const upper    = raw.toUpperCase();
  const patterns = match === 'regex'
    ? [String(rule?.pattern || '').trim()]
    : splitRuleTerms(rule?.pattern);
  return patterns.some(p => {
    if (!p) return false;
    const up = p.toUpperCase();
    switch (match) {
      case 'startsWith': return upper.startsWith(up);
      case 'equals':     return upper === up;
      case 'contains':   return upper.includes(up);
      case 'regex':      try { return new RegExp(p, 'i').test(raw); } catch { return false; }
      default:           return false;
    }
  });
}

function _normalizeKind(kind) {
  const k = String(kind || '').trim().toUpperCase().replace(/\s+/g, '');
  return SUPPORT_KINDS.includes(k) ? k : '';
}

function _explicitKindFromEntries(entries) {
  const explicit = (entries || []).find((entry) => (
    entry.normalizedKey === 'SUPPORTKIND' ||
    entry.normalizedKey === 'SUPPORTMAPPERKIND'
  ));
  return _normalizeKind(explicit?.value || '');
}

function _runRules(attrs, rules) {
  for (const rule of (rules || [])) {
    const kind = _normalizeKind(rule.kind);
    if (!kind) continue;
    if (collectMapperFieldValues(attrs, rule).some(v => _matchValue(rule, v))) return kind;
  }
  return '';
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Resolve a support kind from an attribute bag.
 * All config is injected — no side effects, no globals.
 *
 * Precedence (highest → lowest):
 *   1. Explicit SUPPORT_KIND / SUPPORT-KIND attribute
 *   2. userRules   — caller-injected overrides (e.g. RvmSupportMapper user rules)
 *   3. kindMap     — SKEY shorthand map (e.g. Config Tab entries)
 *   4. defaultRules — shipped DEFAULT_RULES
 *   5. Text heuristic over all attribute values
 *   6. defaultKind
 *
 * @param {object} attrs
 * @param {object} [options]
 * @param {Array}  [options.userRules=[]]              - User-defined rules, run first
 * @param {Array}  [options.defaultRules=DEFAULT_RULES] - Shipped built-in rules
 * @param {object} [options.kindMap=DEFAULT_KIND_MAP]   - SKEY → kind fallback map
 * @param {string} [options.defaultKind='']             - Returned when nothing matches
 * @returns {string}
 */
export function resolveKindPure(attrs, {
  userRules    = [],
  defaultRules = DEFAULT_RULES,
  kindMap      = DEFAULT_KIND_MAP,
  defaultKind  = '',
} = {}) {
  if (!attrs || typeof attrs !== 'object') return defaultKind;
  const entries = _collectEntries(attrs);

  // 1. Explicit attribute. This also supports nested attrs/userData bags.
  const explicit = _explicitKindFromEntries(entries);
  if (explicit) return explicit;

  // 2. User rules
  const fromUser = _runRules(attrs, userRules);
  if (fromUser) return fromUser;

  // 3. kindMap SKEY lookup
  const skey = String(attrs['SKEY'] || attrs['SUPPORT-SKEY'] || '').toUpperCase().trim();
  if (skey && kindMap[skey]) {
    const mapped = _normalizeKind(kindMap[skey]);
    if (mapped) return mapped;
  }

  // 4. Default rules
  const fromDefault = _runRules(attrs, defaultRules);
  if (fromDefault) return fromDefault;

  // 5. Text heuristic then direction heuristic.
  // Support identity text must beat orientation-only direction fields.
  const text        = entries.map(e => String(e.value)).join(' ');
  const fromText    = resolveKindFromText(text);
  if (fromText) return fromText;
  const fromDir     = resolveKindFromDirection(text, { entries });
  if (fromDir) return fromDir;

  return defaultKind;
}

// ── Composite descriptor API (Phase 7) ───────────────────────────────────────
// Force DOFs for each kind. Used by resolveKindDescriptor for combined supports.
const _KIND_DOFS = {
  REST:     { Fy: true },
  GUIDE:    { Fx: true, Fz: true },
  LINESTOP: { Fz: true },
  LIMIT:    { Fz: true },
  ANCHOR:   { Fx: true, Fy: true, Fz: true, Mx: true, My: true, Mz: true },
  SPRING:   { Fy: true },
};

// Catalog codes that represent composite (multi-kind) supports.
// CA100 = Rest + Guide: vertical load bearing AND lateral constraint, no axial freedom.
const _COMPOSITE = {
  CA100: { primaryKind: 'REST', kinds: ['REST', 'GUIDE'] },
};

/**
 * Returns a kind descriptor: { primaryKind, kinds[], dofs } for an attribute bag.
 * For single-kind supports, kinds has one entry. For composites (CA100), kinds has several.
 * Accepts the same options as resolveKindPure.
 *
 * @param {object} attrs
 * @param {object} [options] - same as resolveKindPure options
 * @returns {{ primaryKind: string, kinds: string[], dofs: object }}
 */
export function resolveKindDescriptor(attrs, options = {}) {
  const skey = String(attrs?.SKEY || attrs?.['SUPPORT-SKEY'] || '').toUpperCase().trim();
  const composite = _COMPOSITE[skey];
  if (composite) {
    const dofs = composite.kinds.reduce((acc, k) => ({ ...acc, ...(_KIND_DOFS[k] || {}) }), {});
    return { primaryKind: composite.primaryKind, kinds: [...composite.kinds], dofs };
  }
  const kind = resolveKindPure(attrs, options);
  return {
    primaryKind: kind || '',
    kinds:       kind ? [kind] : [],
    dofs:        _KIND_DOFS[kind] || {},
  };
}
