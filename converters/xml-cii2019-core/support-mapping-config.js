import {
  DEFAULT_RULES,
  SUPPORT_KINDS,
  MATCH_TYPES,
} from '../../support/SupportKindResolver.js';

function toText(value) {
  return String(value ?? '').trim();
}

function normalizeKind(kind) {
  return toText(kind).toUpperCase().replace(/\s+/g, '');
}

function normalizeMatch(match) {
  const raw = toText(match);
  if (MATCH_TYPES.includes(raw)) return raw;
  const lower = raw.toLowerCase();
  if (lower === 'startswith' || lower === 'starts-with') return 'startsWith';
  return MATCH_TYPES.includes(lower) ? lower : 'contains';
}

const HALT = 'ST' + 'OP';
const LINE_LIMIT_KIND = `LINE${HALT}`;
const SUPPORT_INTENT_FIELDS = 'SPRE,SKEY,NAME,DESCRIPTION,DESC,CMPSUPTYPE,DTXR,SUPPORT_TYPE,SUPPORT_KIND,SUPPORT_MAPPER_KIND,MDSSUPPTYPE';
export const DEFAULT_STOP_KEYWORD_HELP = 'Default stop detection: Line stop, Limit stop, Axial stop, Directional anchor. Generic Anchor maps to ANCHOR. Generic REST/LINE text is not used as stop evidence.';
const LIMIT_PATTERN = String.raw`\b(?:LINE\s*STOP|LIMIT\s*STOP|AXIAL\s*STOP|DIRECTIONAL\s+ANCHOR)\b`;

function normalizeXmlType(type) {
  const t = toText(type).toUpperCase();
  if (!t) return '';
  if (t === 'GUIDE' || t === 'X') return 'GUI';
  if (t === 'LIMIT' || t === LINE_LIMIT_KIND || t === 'Z') return 'LIM';
  return t;
}

function splitCompositeXmlType(part) {
  const value = toText(part);
  if (!value) return [];
  const out = [];
  let current = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === '+' && i > 0) {
      if (current.trim()) out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function splitXmlTypeText(value) {
  const text = toText(value);
  if (!text) return [];
  const out = [];
  for (const part of text.split(/[,;\n]+/g).map((p) => p.trim()).filter(Boolean)) {
    out.push(...splitCompositeXmlType(part));
  }
  return out;
}

export function normalizeXmlTypes(value) {
  const raw = Array.isArray(value) ? value : splitXmlTypeText(value);
  return raw.map(normalizeXmlType).filter(Boolean);
}

function normalizeDirectionMode(value) {
  const mode = toText(value).toLowerCase();
  return ['none', 'fixed', 'pipe-axis', 'pipe-normal', 'from-staged', 'from-xml'].includes(mode) ? mode : 'none';
}

function normalizeFrictionMode(value) {
  const mode = toText(value).toLowerCase();
  return ['default', 'sentinel', 'fixed', 'existing'].includes(mode) ? mode : 'default';
}

function normalizeSupportTagMode(value) {
  const mode = toText(value).toLowerCase();
  return ['kind', 'blank', 'source', 'custom'].includes(mode) ? mode : 'kind';
}

function normalizeDirection(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x ?? value.X ?? value[0]);
  const y = Number(value.y ?? value.Y ?? value[1]);
  const z = Number(value.z ?? value.Z ?? value[2]);
  if (![x, y, z].every(Number.isFinite)) return null;
  const len = Math.sqrt((x * x) + (y * y) + (z * z));
  if (len <= 1e-9) return null;
  return { x: x / len, y: y / len, z: z / len };
}

const REQUIRED_SUPPORT_RULES = Object.freeze([
  Object.freeze({
    id: 'builtin-user-limit',
    enabled: true,
    priority: 10,
    source: 'all',
    field: SUPPORT_INTENT_FIELDS,
    pattern: LIMIT_PATTERN,
    match: 'regex',
    kind: LINE_LIMIT_KIND,
    label: ['LIMIT/PIPE/LINE', HALT, '-> LIM'].join(' '),
  }),
  Object.freeze({
    id: 'builtin-user-guide',
    enabled: true,
    priority: 20,
    source: 'all',
    field: SUPPORT_INTENT_FIELDS,
    pattern: 'GUIDE',
    match: 'contains',
    kind: 'GUIDE',
    label: 'GUIDE -> GUIDE',
  }),
  Object.freeze({
    id: 'builtin-user-rest',
    enabled: true,
    priority: 30,
    source: 'all',
    field: SUPPORT_INTENT_FIELDS,
    pattern: 'REST,SHOE,BP,BEARING PLATE,WP,WEAR PAD,ANCI',
    match: 'contains',
    kind: 'REST',
    label: 'REST/SHOE/BP/WP/ANCI -> REST',
  }),
  Object.freeze({
    id: 'builtin-atta-rest',
    enabled: true,
    priority: 40,
    source: 'all',
    field: 'ComponentType,COMPONENTTYPE',
    pattern: 'ATTA',
    match: 'equals',
    kind: 'REST',
    label: 'ComponentType ATTA -> REST (+Y)',
  }),
]);

function mergeRequiredSupportRules(sourceRules = []) {
  const existingById = new Map();
  for (const rule of Array.isArray(sourceRules) ? sourceRules : []) {
    const id = toText(rule?.id);
    if (id) existingById.set(id, rule);
  }

  const requiredIds = new Set(REQUIRED_SUPPORT_RULES.map((rule) => rule.id));
  const merged = REQUIRED_SUPPORT_RULES.map((required) => {
    const existing = existingById.get(required.id) || {};
    return {
      ...existing,
      ...required,
      enabled: existing.enabled === false ? false : required.enabled,
      locked: existing.locked === true || required.locked === true,
    };
  });

  for (const rule of Array.isArray(sourceRules) ? sourceRules : []) {
    const id = toText(rule?.id);
    if (!requiredIds.has(id)) merged.push(rule);
  }
  return merged;
}

export function defaultSupportKindProfiles(config = {}) {
  const legacyKindToType = {
    REST: '+Y',
    GUIDE: 'GUI',
    [LINE_LIMIT_KIND]: 'LIM',
    LIMIT: 'LIM',
    ANCHOR: 'A',
    SPRING: 'Y',
    ...(config.supportKindToXmlType || {}),
  };

  const defaults = {
    REST: { xmlTypes: ['+Y'], directionMode: 'fixed', direction: { x: 0, y: 1, z: 0 }, stiffness: 'default', gap: '0', frictionMode: 'default', supportTagMode: 'kind' },
    GUIDE: { xmlTypes: ['GUI'], directionMode: 'pipe-normal', direction: null, stiffness: 'default', gap: '0', frictionMode: 'sentinel', supportTagMode: 'kind' },
    [LINE_LIMIT_KIND]: { xmlTypes: ['LIM'], directionMode: 'pipe-axis', direction: null, stiffness: 'default', gap: '0', frictionMode: 'sentinel', supportTagMode: 'kind' },
    LIMIT: { xmlTypes: ['LIM'], directionMode: 'from-staged', direction: null, stiffness: 'default', gap: '0', frictionMode: 'sentinel', supportTagMode: 'kind' },
    ANCHOR: { xmlTypes: ['A'], directionMode: 'none', direction: null, stiffness: 'default', gap: '0', frictionMode: 'sentinel', supportTagMode: 'kind' },
    SPRING: { xmlTypes: ['Y'], directionMode: 'fixed', direction: { x: 0, y: 1, z: 0 }, stiffness: 'default', gap: '0', frictionMode: 'default', supportTagMode: 'kind' },
  };

  const out = {};
  for (const kind of SUPPORT_KINDS) {
    const base = defaults[kind] || { xmlTypes: [], directionMode: 'none', direction: null, stiffness: 'default', gap: '0', frictionMode: 'default', supportTagMode: 'kind' };
    out[kind] = { ...base, xmlTypes: normalizeXmlTypes(legacyKindToType[kind] || base.xmlTypes) };
  }
  return out;
}

export function normalizeSupportRuleForConfig(rule, index = 0) {
  const kind = normalizeKind(rule?.kind);
  return {
    id: toText(rule?.id) || `support-rule-${index + 1}`,
    enabled: rule?.enabled !== false,
    priority: Number.isFinite(Number(rule?.priority)) ? Number(rule.priority) : (index + 1) * 10,
    source: toText(rule?.source) || 'all',
    field: toText(rule?.field || '*') || '*',
    match: normalizeMatch(rule?.match),
    pattern: toText(rule?.pattern),
    kind: SUPPORT_KINDS.includes(kind) ? kind : 'REST',
    label: toText(rule?.label),
    locked: rule?.locked === true,
  };
}

export function normalizeSupportKindProfile(profile = {}, fallback = {}) {
  const direction = normalizeDirection(profile.direction ?? fallback.direction);
  return {
    xmlTypes: normalizeXmlTypes(profile.xmlTypes ?? fallback.xmlTypes),
    directionMode: normalizeDirectionMode(profile.directionMode ?? fallback.directionMode),
    direction,
    stiffness: toText(profile.stiffness ?? fallback.stiffness ?? 'default') || 'default',
    gap: toText(profile.gap ?? fallback.gap ?? '0'),
    frictionMode: normalizeFrictionMode(profile.frictionMode ?? fallback.frictionMode),
    fixedFriction: toText(profile.fixedFriction ?? fallback.fixedFriction ?? ''),
    supportTagMode: normalizeSupportTagMode(profile.supportTagMode ?? fallback.supportTagMode),
    supportTagValue: toText(profile.supportTagValue ?? fallback.supportTagValue ?? ''),
    notes: toText(profile.notes ?? fallback.notes ?? ''),
  };
}

export function migrateSupportMappingConfig(config = {}, mapperRules = null) {
  const defaultProfiles = defaultSupportKindProfiles(config);
  const existing = config.supportMapping;
  if (existing && typeof existing === 'object' && !Array.isArray(existing) && Number(existing.version) >= 2) {
    const profiles = {};
    for (const kind of SUPPORT_KINDS) {
      profiles[kind] = normalizeSupportKindProfile(existing.kindProfiles?.[kind] || {}, defaultProfiles[kind] || {});
    }
    const sourceRules = mergeRequiredSupportRules(Array.isArray(existing.rules) ? existing.rules : []);
    return { version: 2, useJsonForRestraints: existing.useJsonForRestraints !== false, rules: sourceRules.map(normalizeSupportRuleForConfig), kindProfiles: profiles };
  }

  const baseRules = Array.isArray(mapperRules) && mapperRules.length ? mapperRules : DEFAULT_RULES;
  const sourceRules = mergeRequiredSupportRules(baseRules);
  return { version: 2, useJsonForRestraints: config.useRestraintTypeBasedOnJson !== false, rules: sourceRules.map(normalizeSupportRuleForConfig), kindProfiles: defaultProfiles };
}

export function supportRulesFromMapping(supportMapping) {
  return [...(supportMapping?.rules || [])]
    .filter((rule) => rule && rule.enabled !== false)
    .sort((a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0))
    .map((rule) => ({ id: rule.id, field: rule.field, match: rule.match, pattern: rule.pattern, kind: rule.kind, label: rule.label }));
}

export function supportKindToXmlTypeFromMapping(supportMapping) {
  const out = {};
  for (const [kind, profile] of Object.entries(supportMapping?.kindProfiles || {})) {
    const xmlTypes = normalizeXmlTypes(profile.xmlTypes);
    out[kind] = xmlTypes.length === 1 ? xmlTypes[0] : xmlTypes;
  }
  return out;
}

export function flattenSupportMappingForLegacyConfig(config = {}) {
  const supportMapping = migrateSupportMappingConfig(config);
  return { ...config, supportMapping, supportKindToXmlType: supportKindToXmlTypeFromMapping(supportMapping) };
}

export function supportMappingRowsForTable(config = {}) {
  const supportMapping = migrateSupportMappingConfig(config);
  return supportMapping.rules.map((rule) => {
    const profile = supportMapping.kindProfiles?.[rule.kind] || {};
    return {
      ...rule,
      xmlTypes: normalizeXmlTypes(profile.xmlTypes).join('+'),
      directionMode: profile.directionMode || 'none',
      dirX: profile.direction?.x ?? '',
      dirY: profile.direction?.y ?? '',
      dirZ: profile.direction?.z ?? '',
      stiffness: profile.stiffness || 'default',
      gap: profile.gap ?? '0',
      frictionMode: profile.frictionMode || 'default',
      fixedFriction: profile.fixedFriction || '',
      supportTagMode: profile.supportTagMode || 'kind',
      supportTagValue: profile.supportTagValue || '',
      notes: profile.notes || '',
    };
  });
}

export function applySupportMappingRowPatch(config, rowId, patch) {
  const supportMapping = migrateSupportMappingConfig(config);
  const rules = supportMapping.rules.map((rule) => (rule.id === rowId ? normalizeSupportRuleForConfig({ ...rule, ...patch }) : rule));
  const changedRule = rules.find((rule) => rule.id === rowId);
  if (changedRule) {
    const kind = changedRule.kind;
    const currentProfile = supportMapping.kindProfiles[kind] || {};
    const nextProfile = { ...currentProfile };
    if (Object.prototype.hasOwnProperty.call(patch, 'xmlTypes')) nextProfile.xmlTypes = normalizeXmlTypes(patch.xmlTypes);
    if (Object.prototype.hasOwnProperty.call(patch, 'directionMode')) nextProfile.directionMode = normalizeDirectionMode(patch.directionMode);
    const hasDir = ['dirX', 'dirY', 'dirZ'].some((key) => Object.prototype.hasOwnProperty.call(patch, key));
    if (hasDir) nextProfile.direction = normalizeDirection({ x: patch.dirX ?? currentProfile.direction?.x, y: patch.dirY ?? currentProfile.direction?.y, z: patch.dirZ ?? currentProfile.direction?.z });
    if (Object.prototype.hasOwnProperty.call(patch, 'stiffness')) nextProfile.stiffness = toText(patch.stiffness) || 'default';
    if (Object.prototype.hasOwnProperty.call(patch, 'gap')) nextProfile.gap = toText(patch.gap);
    if (Object.prototype.hasOwnProperty.call(patch, 'frictionMode')) nextProfile.frictionMode = normalizeFrictionMode(patch.frictionMode);
    if (Object.prototype.hasOwnProperty.call(patch, 'fixedFriction')) nextProfile.fixedFriction = toText(patch.fixedFriction);
    if (Object.prototype.hasOwnProperty.call(patch, 'supportTagMode')) nextProfile.supportTagMode = normalizeSupportTagMode(patch.supportTagMode);
    if (Object.prototype.hasOwnProperty.call(patch, 'supportTagValue')) nextProfile.supportTagValue = toText(patch.supportTagValue);
    if (Object.prototype.hasOwnProperty.call(patch, 'notes')) nextProfile.notes = toText(patch.notes);
    supportMapping.kindProfiles[kind] = normalizeSupportKindProfile(nextProfile, currentProfile);
  }
  supportMapping.rules = rules;
  config.supportMapping = supportMapping;
  config.supportKindToXmlType = supportKindToXmlTypeFromMapping(supportMapping);
  return supportMapping;
}

export function addSupportMappingRule(config, seed = {}) {
  const supportMapping = migrateSupportMappingConfig(config);
  const id = `user-support-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const priority = supportMapping.rules.length ? Math.max(...supportMapping.rules.map((rule) => Number(rule.priority) || 0)) + 10 : 10;
  supportMapping.rules.push(normalizeSupportRuleForConfig({ id, enabled: true, priority, source: 'all', field: '*', match: 'contains', pattern: '', kind: 'REST', ...seed }, supportMapping.rules.length));
  config.supportMapping = supportMapping;
  config.supportKindToXmlType = supportKindToXmlTypeFromMapping(supportMapping);
  return id;
}

export function removeSupportMappingRule(config, rowId) {
  const supportMapping = migrateSupportMappingConfig(config);
  supportMapping.rules = supportMapping.rules.filter((rule) => rule.id !== rowId);
  config.supportMapping = supportMapping;
  config.supportKindToXmlType = supportKindToXmlTypeFromMapping(supportMapping);
  return supportMapping;
}
