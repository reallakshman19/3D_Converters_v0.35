export const BROWSER_RVM_ATT_PARSER_SCHEMA = 'browser-rvm-att-parser/v1';

const MAX_ATT_LINES = 20000;
const MAX_ATTRS_PER_OWNER = 400;

export function parseBrowserRvmAttText(text = '') {
  const src = String(text || '');
  const result = {
    schemaVersion: BROWSER_RVM_ATT_PARSER_SCHEMA,
    globals: {},
    owners: [],
    diagnostics: {
      schemaVersion: BROWSER_RVM_ATT_PARSER_SCHEMA,
      lineCount: 0,
      globalAttributeCount: 0,
      ownerCount: 0,
      ownerAttributeCount: 0,
      ignoredLineCount: 0
    }
  };
  if (!src.trim()) return result;

  let currentOwner = null;
  const ownerByKey = new Map();
  const lines = src.split(/\r?\n/g).slice(0, MAX_ATT_LINES);
  result.diagnostics.lineCount = lines.length;

  for (const rawLine of lines) {
    const line = stripAttComment(rawLine).trim();
    if (!line) continue;

    const header = parseOwnerHeader(line);
    if (header) {
      currentOwner = ensureOwner(result, ownerByKey, header);
      continue;
    }

    const inline = parseInlineOwnerAttribute(line);
    if (inline) {
      currentOwner = ensureOwner(result, ownerByKey, inline.owner);
      addAttribute(currentOwner.attributes, inline.key, inline.value);
      currentOwner.attributeCount = Object.keys(currentOwner.attributes).length;
      continue;
    }

    const kv = parseAttributeLine(line);
    if (kv) {
      if (currentOwner) {
        addAttribute(currentOwner.attributes, kv.key, kv.value);
        currentOwner.attributeCount = Object.keys(currentOwner.attributes).length;
      } else {
        addAttribute(result.globals, kv.key, kv.value);
      }
      continue;
    }

    const named = parseLooseNamedOwner(line);
    if (named) {
      currentOwner = ensureOwner(result, ownerByKey, named.owner);
      if (named.key) addAttribute(currentOwner.attributes, named.key, named.value);
      currentOwner.attributeCount = Object.keys(currentOwner.attributes).length;
      continue;
    }

    result.diagnostics.ignoredLineCount += 1;
  }

  result.diagnostics.globalAttributeCount = Object.keys(result.globals).length;
  result.diagnostics.ownerCount = result.owners.length;
  result.diagnostics.ownerAttributeCount = result.owners.reduce((sum, owner) => sum + Object.keys(owner.attributes || {}).length, 0);
  return result;
}

export function matchBrowserRvmAttAttributes(parsedAtt, ownerName = '') {
  const parsed = parsedAtt && typeof parsedAtt === 'object' ? parsedAtt : parseBrowserRvmAttText('');
  const canonicalOwner = canonicalOwnerKey(ownerName);
  const out = { ...(parsed.globals || {}) };
  if (!canonicalOwner) return prefixAttAttributes(out, 'ATT_');

  let best = null;
  let bestScore = 0;
  for (const owner of Array.isArray(parsed.owners) ? parsed.owners : []) {
    const score = ownerMatchScore(canonicalOwner, owner.canonicalName || canonicalOwnerKey(owner.name));
    if (score > bestScore) {
      best = owner;
      bestScore = score;
    }
  }
  if (best && bestScore >= 0.72) Object.assign(out, best.attributes || {});
  return prefixAttAttributes(out, 'ATT_');
}

export function summarizeBrowserRvmAtt(parsedAtt) {
  const parsed = parsedAtt && typeof parsedAtt === 'object' ? parsedAtt : parseBrowserRvmAttText('');
  return {
    schemaVersion: BROWSER_RVM_ATT_PARSER_SCHEMA,
    globalAttributeCount: Object.keys(parsed.globals || {}).length,
    ownerCount: Array.isArray(parsed.owners) ? parsed.owners.length : 0,
    ownerAttributeCount: (parsed.owners || []).reduce((sum, owner) => sum + Object.keys(owner.attributes || {}).length, 0)
  };
}

function ensureOwner(result, ownerByKey, ownerName) {
  const name = sanitizeOwnerName(ownerName);
  const canonical = canonicalOwnerKey(name);
  const key = canonical || `owner-${result.owners.length + 1}`;
  let owner = ownerByKey.get(key);
  if (!owner) {
    owner = {
      name,
      canonicalName: canonical,
      attributes: {},
      attributeCount: 0
    };
    ownerByKey.set(key, owner);
    result.owners.push(owner);
  }
  return owner;
}

function parseOwnerHeader(line) {
  const bracket = line.match(/^\s*\[\s*(?:OWNER|OBJECT|RVM|COMPONENT)?\s*:?\s*([^\]]{2,260})\]\s*$/i);
  if (bracket) return bracket[1];
  const owner = line.match(/^\s*(?:OWNER|OBJECT|COMPONENT|RVM_OBJECT)\s*(?:=|:)\s*(.{2,260})\s*$/i);
  if (owner) return owner[1];
  return null;
}

function parseInlineOwnerAttribute(line) {
  const match = line.match(/^\s*(?:OWNER|OBJECT|COMPONENT)\s+(.{2,220}?)\s*(?:\||;)\s*([A-Za-z_][\w .-]{0,80})\s*(?:=|:)\s*(.{0,500})\s*$/i);
  if (!match) return null;
  return { owner: match[1], key: match[2], value: match[3] };
}

function parseLooseNamedOwner(line) {
  const match = line.match(/^\s*([^=:\|;]{3,180}?(?:\bof\b[^=:\|;]{2,180})?)\s*(?:\||;)\s*([A-Za-z_][\w .-]{0,80})\s*(?:=|:)\s*(.{0,500})\s*$/i);
  if (!match) return null;
  const owner = match[1].trim();
  if (!/\b(PIPE|BRANCH|ZONE|EQUIPMENT|GASKET|FLANGE|VALVE|SUPPORT|STRUCTURE|NOZZLE|INSTRUMENT|RTORUS|TORUS)\b/i.test(owner)) return null;
  return { owner, key: match[2], value: match[3] };
}

function parseAttributeLine(line) {
  const match = line.match(/^\s*([A-Za-z_][\w .-]{0,80})\s*(?:=|:)\s*(.{0,500})\s*$/);
  if (!match) return null;
  return { key: match[1], value: match[2] };
}

function addAttribute(target, key, value) {
  if (!target || Object.keys(target).length >= MAX_ATTRS_PER_OWNER) return;
  const name = canonicalAttributeName(key);
  if (!name) return;
  const cleanValue = String(value ?? '').replace(/^['\"]|['\"]$/g, '').trim();
  if (!cleanValue && cleanValue !== '0') return;
  target[name] = cleanValue;
}

function canonicalAttributeName(key) {
  return String(key || '')
    .replace(/[^A-Za-z0-9_ -]+/g, ' ')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase()
    .slice(0, 96);
}

function sanitizeOwnerName(value) {
  return String(value || '')
    .replace(/^['\"]|['\"]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalOwnerKey(value) {
  return sanitizeOwnerName(value)
    .toUpperCase()
    .replace(/[^A-Z0-9/_.:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ownerMatchScore(query, candidate) {
  if (!query || !candidate) return 0;
  if (query === candidate) return 1;
  if (query.includes(candidate) || candidate.includes(query)) return 0.9;
  const q = new Set(query.split(/[\s/]+/).filter(Boolean));
  const c = new Set(candidate.split(/[\s/]+/).filter(Boolean));
  if (!q.size || !c.size) return 0;
  let hit = 0;
  for (const token of q) if (c.has(token)) hit += 1;
  return hit / Math.max(q.size, c.size);
}

function prefixAttAttributes(attrs, prefix) {
  const out = {};
  for (const [key, value] of Object.entries(attrs || {})) {
    const name = String(key || '').startsWith(prefix) ? key : `${prefix}${key}`;
    out[name] = String(value);
  }
  return out;
}

function stripAttComment(line) {
  return String(line || '').replace(/\s*(?:#|\/\/).*$/, '');
}
