/**
 * Parses PDMS/AVEVA RMSS_ATTRIBUTE.TXT into a branch hierarchy that is usable
 * by the RVM viewer topology renderer.
 *
 * Policy:
 * - Keep fittings/support components from attributes.
 * - Ignore unreliable source PIPE/TUBI entries in attribute text.
 * - Auto-route synthetic PIPE members using exactly one selected method:
 *   strict topology, legacy sequential, or ray/vector topology.
 * - Use exact component ports APOS/LPOS/BPOS only.
 * - Include INST in routing only when routeThroughInstEnabled=true and
 *   the node exposes valid inline metadata + route ports.
 * - Preserve ATTA supports even when CMPSUPTYPE is absent and support intent
 *   is carried only by DTXR/description/name, e.g. DTXR=REST/GUIDE/LINE STOP/LIMIT.
 */

import { DEFAULT_KIND_MAP, DEFAULT_RULES, resolveKindPure } from '../support/SupportKindResolver.js';

const TYPE_ALIASES = Object.freeze({
  FBLI: 'FLAN',
  FBLIND: 'FLAN',
  BLIND: 'FLAN',
  FLANGE: 'FLAN',
  GASKET: 'GASK',
  ELBOW: 'ELBO',
  BEND: 'ELBO',
  REDUCER: 'REDU',
  SUPPORT: 'SUPPORT',
  SUPP: 'SUPPORT',
  SUPC: 'SUPPORT',
  SUPPO: 'SUPPORT',
  ANCI: 'SUPPORT',
  ATTA: 'SUPPORT',
});
const FITTING_TYPES = new Set(['VALV', 'FLAN', 'ELBO', 'TEE', 'OLET', 'GASK', 'REDU', 'INST']);
const SOURCE_TYPES = new Set(['VALV', 'FLAN', 'ELBO', 'TEE', 'OLET', 'GASK', 'REDU', 'SUPPORT', 'INST']);
const ROUTE_PORT_KEYS = ['APOS', 'LPOS', 'BPOS'];
const PIPE_ROUTE_GAP_MM = 1.0;
const ROUTE_SPLIT_TOLERANCE_MM = 25.0;
const SUPPORT_KIND_RE = /\b(GUIDE|LINE\s*STOP|LINESTOP|LIMIT\s*STOP|LIMIT|RESTING|REST|SHOE|BP|BASE\s*PLATE|ANCHOR|FIXED|STOPPER|STOP)\b/i;
const SUPPORT_TAG_RE = /\bPS[-_\s]?[A-Z0-9][A-Z0-9._/\-]*\b/i;
const TOPOLOGY_METHODS = Object.freeze({
  STRICT: 'topology_strict',
  LEGACY: 'topology_legacy',
  RAY: 'topology_ray'
});
const DEFAULT_ROUTE_OPTIONS = Object.freeze({
  topologyMethod: TOPOLOGY_METHODS.LEGACY,
  routeThroughInstEnabled: false,
  preserveBlindFlanges: true,
  splitRoutesAtSupports: false
});

function parseCoord(value) {
  if (!value) return null;
  if (typeof value === 'object' && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)) {
    return { x: value.x, y: value.y, z: value.z };
  }
  if (Array.isArray(value) && value.length >= 3) {
    const x = Number.parseFloat(String(value[0]).replace(/mm/gi, '').trim());
    const y = Number.parseFloat(String(value[1]).replace(/mm/gi, '').trim());
    const z = Number.parseFloat(String(value[2]).replace(/mm/gi, '').trim());
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  const tokens = text.split(/\s+/g);
  const out = { x: 0, y: 0, z: 0 };
  let parsedDirectional = false;
  for (let i = 0; i < tokens.length - 1; i += 2) {
    const axis = tokens[i].toUpperCase();
    const raw = tokens[i + 1].replace(/mm/gi, '');
    const num = Number.parseFloat(raw);
    if (!Number.isFinite(num)) continue;
    if (axis === 'E') { out.x = num; parsedDirectional = true; }
    else if (axis === 'W') { out.x = -num; parsedDirectional = true; }
    else if (axis === 'N') { out.y = num; parsedDirectional = true; }
    else if (axis === 'S') { out.y = -num; parsedDirectional = true; }
    else if (axis === 'U') { out.z = num; parsedDirectional = true; }
    else if (axis === 'D') { out.z = -num; parsedDirectional = true; }
  }
  if (parsedDirectional) return out;
  const vals = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return vals.length >= 3 ? { x: vals[0], y: vals[1], z: vals[2] } : null;
}

function coordDistance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function normalizeToken(value) {
  const text = String(value || '').trim();
  return text ? text.toUpperCase() : '';
}

function canonicalComponentType(value) {
  const rawType = normalizeToken(value);
  return TYPE_ALIASES[rawType] || rawType;
}

function resolveRouteOptions(rawOptions) {
  const source = (rawOptions && typeof rawOptions === 'object') ? rawOptions : {};
  const method = String(source.topologyMethod || '').trim().toLowerCase();
  let topologyMethod = DEFAULT_ROUTE_OPTIONS.topologyMethod;
  if (method === TOPOLOGY_METHODS.LEGACY) topologyMethod = TOPOLOGY_METHODS.LEGACY;
  if (method === TOPOLOGY_METHODS.RAY) topologyMethod = TOPOLOGY_METHODS.RAY;
  const routeThroughInstEnabled = source.routeThroughInstEnabled === true;
  const preserveBlindFlanges = source.preserveBlindFlanges !== false;
  const splitRoutesAtSupports = source.splitRoutesAtSupports === true;
  return { topologyMethod, routeThroughInstEnabled, preserveBlindFlanges, splitRoutesAtSupports };
}

function parseTextBlocks(content) {
  const lines = String(content || '').split(/\r?\n/g);
  const objects = [];
  let current = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('NEW ')) {
      if (current) objects.push(current);
      current = { id: trimmed.substring(4).trim(), attributes: {} };
      continue;
    }
    if (trimmed === 'END') {
      if (current) {
        objects.push(current);
        current = null;
      }
      continue;
    }
    if (!current || !trimmed.includes(':=')) continue;
    const idx = trimmed.indexOf(':=');
    const key = trimmed.substring(0, idx).trim().replace(/^:/, '');
    const val = trimmed.substring(idx + 2).trim();
    current.attributes[key] = val;
  }
  if (current) objects.push(current);
  return objects;
}

// Bore fields in order of reliability for AVEVA PDMS/E3D.
// DTXR is intentionally excluded by default: it can contain support text such as GUIDE/REST.
const BORE_FIELDS = ['HBOR', 'TBOR', 'ABORE', 'LBORE', 'BORE', 'NBORE', 'DBOR'];

function normalizeSupportType(attrs, fallbackText = '') {
  const text = [
    attrs?.CMPSUPTYPE,
    attrs?.MDSSUPPFUNC,
    attrs?.DTXR,
    attrs?.SUPPORT_TYPE,
    attrs?.SUPTYPE,
    attrs?.SKEY,
    attrs?.SPRE,
    attrs?.NAME,
    attrs?.TAG,
    attrs?.DESCRIPTION,
    attrs?.DESC,
    fallbackText,
  ].map((value) => String(value || '').toUpperCase()).join(' ');

  if (/\bGUIDE\b/.test(text)) return 'GUIDE';
  if (/\bLINE\s*STOP\b|\bLINESTOP\b|\bSTOPPER\b|\bSTOP\b/.test(text)) return 'LINESTOP';
  if (/\bLIMIT\s*STOP\b|\bLIMIT\b/.test(text)) return 'LIMIT';
  if (/\bRESTING\b|\bREST\b|\bSHOE\b|\bBP\b|\bBASE\s*PLATE\b/.test(text)) return 'REST';
  if (/\bANCHOR\b|\bFIXED\b/.test(text)) return 'ANCHOR';
  return '';
}

function hasSupportIntent(attrs, fallbackText = '') {
  return Boolean(normalizeSupportType(attrs, fallbackText)) || SUPPORT_KIND_RE.test([
    attrs?.CMPSUPTYPE,
    attrs?.MDSSUPPFUNC,
    attrs?.DTXR,
    attrs?.NAME,
    attrs?.TAG,
    attrs?.DESCRIPTION,
    attrs?.DESC,
    fallbackText,
  ].map((value) => String(value || '')).join(' '));
}

function supportTag(attrs, id, baseName) {
  const candidates = [
    attrs?.CMPSUPREFN,
    attrs?.NAME,
    attrs?.TAG,
    attrs?.TAGNO,
    attrs?.ITEMCODE,
    attrs?.PARTNO,
    attrs?.REF,
    attrs?.REFNO,
    attrs?.DBREF,
    attrs?.COMPONENTREFNO,
    attrs?.CA97,
    attrs?.CA98,
    attrs?.SKEY,
    attrs?.SPRE,
    attrs?.DESCRIPTION,
    attrs?.DESC,
    baseName,
    id,
  ];
  for (const candidate of candidates) {
    const match = SUPPORT_TAG_RE.exec(String(candidate || ''));
    if (match) return match[0].replace(/\s+/g, '-');
  }
  return String(attrs?.CMPSUPREFN || attrs?.NAME || baseName || id || 'SUPPORT').trim();
}

function parseBoreValue(value) {
  const n = value ? Number.parseFloat(String(value).replace(/mm/gi, '').trim()) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function boreFromField(attrs, field) {
  const value = parseBoreValue(attrs?.[field]);
  return value ? { field, value, raw: attrs[field] } : null;
}

function extractBore(attrs) {
  for (const field of BORE_FIELDS) {
    const bore = boreFromField(attrs, field);
    if (bore) return bore;
  }
  // Some exports put numeric diameter in DTXR; accept it only when it is not support text.
  if (attrs?.DTXR && !hasSupportIntent(attrs)) {
    const value = parseBoreValue(attrs.DTXR);
    if (value) return { field: 'DTXR', value, raw: attrs.DTXR };
  }
  return null;
}

// Synthetic route gaps must inherit the bore from the connected port side.
// For reducers this means LPOS/TPOS takes LBORE/TBOR and APOS takes ABORE/HBOR;
// do not convert nominal bore values here because staged JSON is expected to
// preserve source nominal bore values.

function boreForRoutePort(node, portKey) {
  const attrs = node?.attributes || {};
  const key = String(portKey || '').toUpperCase();
  const preferred = (key === 'LPOS' || key === 'TPOS')
    ? ['LBORE', 'TBOR', 'BORE', 'ABORE', 'HBOR', 'NBORE', 'DBOR']
    : (key === 'BPOS'
      ? ['BBORE', 'BRBORE', 'OUTLET_BORE', 'LBORE', 'ABORE', 'BORE', 'HBOR', 'TBOR', 'NBORE', 'DBOR']
      : ['ABORE', 'HBOR', 'BORE', 'LBORE', 'TBOR', 'NBORE', 'DBOR']);
  for (const field of preferred) {
    const bore = boreFromField(attrs, field);
    if (bore) return bore;
  }
  return extractBore(attrs);
}

function applyBoreToPipeAttrs(pipeAttrs, boreSrc, sourceLabel = 'adjacent fitting') {
  if (!pipeAttrs || !boreSrc) return;
  pipeAttrs[boreSrc.field] = boreSrc.raw;
  pipeAttrs.BORE_SOURCE = `inherited from ${boreSrc.field} of ${sourceLabel}`;
}

function hasInlineRouteMetadata(attrs) {
  if (extractBore(attrs)) return true;
  const joined = [
    attrs?.TYPE,
    attrs?.SPRE,
    attrs?.LSTU,
    attrs?.SKEY,
    attrs?.NAME
  ].map((value) => String(value || '').toUpperCase()).join(' ');
  return /VALV|VALVE|INLINE|IN-LINE/.test(joined);
}

function shouldIncludeInst(attrs, apos, lpos) {
  if (!apos || !lpos) return false;
  return hasInlineRouteMetadata(attrs);
}

function pickSupportPosition(attrs, apos, lpos, bpos, pos) {
  const supportPos = parseCoord(attrs?.SUPPORTCOORD)
    || parseCoord(attrs?.SUPPORT_COORD)
    || parseCoord(attrs?.SCOORD)
    || parseCoord(attrs?.COORDS)
    || parseCoord(attrs?.CO_ORDS)
    || parseCoord(attrs?.CO_ORD)
    || parseCoord(attrs?.POSI)
    || pos
    || bpos
    || apos
    || lpos;
  return supportPos || null;
}

function addReferenceToken(tokens, value) {
  const token = normalizeToken(value);
  if (token) tokens.add(token);
}

function collectComponentReferenceTokens(attrs) {
  const tokens = new Set();
  addReferenceToken(tokens, attrs?.REF);
  addReferenceToken(tokens, attrs?.NAME);
  addReferenceToken(tokens, attrs?.DBREF);
  addReferenceToken(tokens, attrs?.COMPONENTREFNO);
  return tokens;
}

function supportAttachmentReference(attrs) {
  return normalizeToken(
    attrs?.COMPRE
    || attrs?.COMPREF
    || attrs?.COMPONENTREF
    || attrs?.ATTREF
    || attrs?.ATTACHMENTREF
  );
}

function toNode(comp) {
  const rawType = normalizeToken(comp?.attributes?.TYPE);
  const type = canonicalComponentType(rawType);
  const baseName = String(comp?.attributes?.NAME || comp?.id || '').trim() || 'Unnamed';
  const apos = parseCoord(comp?.attributes?.APOS);
  const lpos = parseCoord(comp?.attributes?.LPOS);
  const bpos = parseCoord(comp?.attributes?.BPOS);
  const hpos = parseCoord(comp?.attributes?.HPOS);
  const tpos = parseCoord(comp?.attributes?.TPOS);
  const pos = parseCoord(comp?.attributes?.POS);

  const rawAttrs = {};
  for (const [k, v] of Object.entries(comp.attributes || {})) rawAttrs[k] = v;

  if (type === 'SUPPORT') {
    const normalizedSupportType = normalizeSupportType(comp.attributes, baseName);
    const tag = supportTag(comp.attributes, comp.id, baseName);
    const supportPosition = pickSupportPosition(comp.attributes, apos, lpos, bpos, pos);

    // Preserve only meaningful support objects: CMPSUPTYPE/DTXR/support keyword or coordinate-backed ATTA.
    if (!comp?.attributes?.CMPSUPTYPE && !normalizedSupportType && !hasSupportIntent(comp.attributes, baseName) && !supportPosition) return null;

    return {
      name: `SUPPORT ${tag || baseName}`,
      type: 'SUPPORT',
      attributes: {
        ...rawAttrs,
        RAW_TYPE: rawType,
        NAME: comp.attributes.NAME || tag || baseName,
        SUPPORT_TAG: tag,
        SUPPORT_TYPE: normalizedSupportType || comp.attributes.CMPSUPTYPE || '',
        DTXR: comp.attributes.DTXR || normalizedSupportType || '',
        CMPSUPREFN: comp.attributes.CMPSUPREFN || tag || '',
        CMPSUPTYPE: comp.attributes.CMPSUPTYPE || normalizedSupportType || '',
        APOS: apos,
        LPOS: lpos,
        BPOS: bpos,
        HPOS: hpos,
        TPOS: tpos,
        POS: supportPosition
      }
    };
  }

  if (!SOURCE_TYPES.has(type)) return null;

  return {
    name: `${type} ${baseName}`,
    type,
    attributes: {
      ...rawAttrs,
      RAW_TYPE: rawType,
      APOS: apos,
      LPOS: lpos,
      BPOS: bpos,
      HPOS: hpos,
      TPOS: tpos,
      POS: pos
    }
  };
}

function isFittingNode(node) {
  if (!node || node.type === 'SUPPORT') return false;
  return FITTING_TYPES.has(String(node.type || '').toUpperCase());
}

function isRouteableFittingNode(node, routeOptions) {
  if (!isFittingNode(node)) return false;
  const type = String(node?.type || '').toUpperCase();
  if (type !== 'INST') return true;
  if (!routeOptions.routeThroughInstEnabled) return false;
  const attrs = node?.attributes || {};
  return shouldIncludeInst(attrs, attrs.APOS, attrs.LPOS);
}

function collectPortCandidates(node) {
  const attrs = node?.attributes || {};
  const out = [];
  for (const key of ROUTE_PORT_KEYS) {
    const point = attrs[key];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) continue;
    out.push({ key, coord: point });
  }
  return out;
}

function collectIdentityTokens(node) {
  const attrs = node?.attributes || {};
  const ids = new Set();
  const add = (value) => {
    const token = normalizeToken(value);
    if (token) ids.add(token);
  };
  add(attrs.REF);
  add(attrs.NAME);
  add(node?.name);
  return ids;
}

function ownerToken(node) {
  return normalizeToken(node?.attributes?.OWNER);
}

function hasLinkTokenMatch(fromNode, toNode) {
  const attrs = fromNode?.attributes || {};
  const toIds = collectIdentityTokens(toNode);
  const href = normalizeToken(attrs.HREF);
  const tref = normalizeToken(attrs.TREF);
  const cref = normalizeToken(attrs.CREF);

  if (href && toIds.has(href)) return true;
  if (tref && toIds.has(tref)) return true;
  if (cref && (toIds.has(cref) || cref === ownerToken(toNode))) return true;
  return false;
}

function isTopologyProvenPair(current, next, branchName) {
  const branchKey = normalizeToken(branchName);
  const ownerA = ownerToken(current);
  const ownerB = ownerToken(next);
  if (ownerA && ownerB && ownerA === ownerB && (!branchKey || ownerA === branchKey)) return true;
  if (hasLinkTokenMatch(current, next)) return true;
  if (hasLinkTokenMatch(next, current)) return true;
  return false;
}

function resolvePreferredPortKeys(current, next) {
  const currentIds = collectIdentityTokens(current);
  const nextIds = collectIdentityTokens(next);
  const currentAttrs = current?.attributes || {};
  const nextAttrs = next?.attributes || {};
  const currentPreferred = new Set();
  const nextPreferred = new Set();

  const currentHref = normalizeToken(currentAttrs.HREF);
  const currentTref = normalizeToken(currentAttrs.TREF);
  const nextHref = normalizeToken(nextAttrs.HREF);
  const nextTref = normalizeToken(nextAttrs.TREF);

  if ((currentTref && nextIds.has(currentTref)) || (nextHref && currentIds.has(nextHref))) {
    currentPreferred.add('LPOS');
    nextPreferred.add('APOS');
  }
  if ((currentHref && nextIds.has(currentHref)) || (nextTref && currentIds.has(nextTref))) {
    currentPreferred.add('APOS');
    nextPreferred.add('LPOS');
  }

  const currentCref = normalizeToken(currentAttrs.CREF);
  const nextCref = normalizeToken(nextAttrs.CREF);
  if (currentCref && currentCref === ownerToken(next)) currentPreferred.add('BPOS');
  if (nextCref && nextCref === ownerToken(current)) nextPreferred.add('BPOS');

  return { currentPreferred, nextPreferred };
}

function selectExactPortPair(current, next) {
  const currentPorts = collectPortCandidates(current);
  const nextPorts = collectPortCandidates(next);
  if (!currentPorts.length || !nextPorts.length) return null;

  const preferred = resolvePreferredPortKeys(current, next);
  const currentPreferredPorts = preferred.currentPreferred.size
    ? currentPorts.filter((entry) => preferred.currentPreferred.has(entry.key))
    : [];
  const nextPreferredPorts = preferred.nextPreferred.size
    ? nextPorts.filter((entry) => preferred.nextPreferred.has(entry.key))
    : [];
  const startPorts = currentPreferredPorts.length ? currentPreferredPorts : currentPorts;
  const endPorts = nextPreferredPorts.length ? nextPreferredPorts : nextPorts;

  let best = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const start of startPorts) {
    for (const end of endPorts) {
      const gap = coordDistance(start.coord, end.coord);
      if (!Number.isFinite(gap)) continue;
      if (gap < bestGap) {
        bestGap = gap;
        best = { start: start.coord, end: end.coord, startKey: start.key, endKey: end.key, gap };
      }
    }
  }
  return best;
}

function clamp(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
}

function percentile(sortedValues, pct) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return null;
  const p = clamp(pct, 0, 100) / 100;
  const idx = (sortedValues.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  const w = idx - lo;
  return sortedValues[lo] + ((sortedValues[hi] - sortedValues[lo]) * w);
}

function vectorBetween(a, b) {
  if (!a || !b) return null;
  return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
}

function normalizeVector(v) {
  if (!v) return null;
  const len = Math.sqrt((v.x * v.x) + (v.y * v.y) + (v.z * v.z));
  if (!Number.isFinite(len) || len <= 1e-9) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function dotVector(a, b) {
  if (!a || !b) return 0;
  return (a.x * b.x) + (a.y * b.y) + (a.z * b.z);
}

function negateVector(v) {
  if (!v) return null;
  return { x: -v.x, y: -v.y, z: -v.z };
}

function midPoint(a, b) {
  if (!a || !b) return null;
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5, z: (a.z + b.z) * 0.5 };
}

function flowVectorFromNode(node) {
  const attrs = node?.attributes || {};
  if (attrs.APOS && attrs.LPOS) return normalizeVector(vectorBetween(attrs.APOS, attrs.LPOS));
  const runMid = midPoint(attrs.APOS, attrs.LPOS);
  if (runMid && attrs.BPOS) return normalizeVector(vectorBetween(runMid, attrs.BPOS));
  return null;
}

function rayExitPorts(node) {
  const attrs = node?.attributes || {};
  const out = [];
  if (attrs.LPOS) out.push({ key: 'LPOS', coord: attrs.LPOS });
  if (attrs.BPOS) out.push({ key: 'BPOS', coord: attrs.BPOS });
  if (attrs.APOS) out.push({ key: 'APOS', coord: attrs.APOS });
  return out;
}

function rayEntryPorts(node) {
  const attrs = node?.attributes || {};
  const out = [];
  if (attrs.APOS) out.push({ key: 'APOS', coord: attrs.APOS });
  if (attrs.BPOS) out.push({ key: 'BPOS', coord: attrs.BPOS });
  if (attrs.LPOS) out.push({ key: 'LPOS', coord: attrs.LPOS });
  return out;
}

function legacySequentialPair(current, next) {
  const start = current?.attributes?.LPOS;
  const end = next?.attributes?.APOS;
  const gap = coordDistance(start, end);
  if (Number.isFinite(gap)) return { start, end, startKey: 'LPOS', endKey: 'APOS', gap };

  const currentPorts = collectPortCandidates(current);
  const nextPorts = collectPortCandidates(next);
  if (!currentPorts.length || !nextPorts.length) return null;
  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const a of currentPorts) {
    for (const b of nextPorts) {
      const dist = coordDistance(a.coord, b.coord);
      if (!Number.isFinite(dist)) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = { start: a.coord, end: b.coord, startKey: a.key, endKey: b.key, gap: dist };
      }
    }
  }
  return best;
}

function adaptiveRayMaxGap(unresolvedEntries) {
  const ports = [];
  for (const entry of unresolvedEntries) {
    const candidates = collectPortCandidates(entry.node);
    for (const port of candidates) ports.push({ entry, ...port });
  }
  if (ports.length < 2) return 1500;

  const nearest = [];
  for (let i = 0; i < ports.length; i += 1) {
    let best = Number.POSITIVE_INFINITY;
    for (let j = 0; j < ports.length; j += 1) {
      if (i === j) continue;
      if (ports[i].entry.seqIndex === ports[j].entry.seqIndex) continue;
      const d = coordDistance(ports[i].coord, ports[j].coord);
      if (Number.isFinite(d) && d < best) best = d;
    }
    if (Number.isFinite(best)) nearest.push(best);
  }
  if (!nearest.length) return 1500;
  nearest.sort((a, b) => a - b);
  const p25 = percentile(nearest, 25);
  const p75 = percentile(nearest, 75);
  if (!Number.isFinite(p25) || !Number.isFinite(p75)) return 1500;
  const iqr = p75 - p25;
  return clamp(p75 + (1.5 * iqr), 50, 1500);
}

function projectedSegmentParameter(start, end, point) {
  if (!start || !end || !point) return null;
  const axis = vectorBetween(start, end);
  const axisLen2 = (axis.x * axis.x) + (axis.y * axis.y) + (axis.z * axis.z);
  if (!Number.isFinite(axisLen2) || axisLen2 <= 1e-9) return null;
  const rel = vectorBetween(start, point);
  const t = ((rel.x * axis.x) + (rel.y * axis.y) + (rel.z * axis.z)) / axisLen2;
  if (!Number.isFinite(t) || t <= 1e-6 || t >= 1 - 1e-6) return null;
  const projected = {
    x: start.x + (axis.x * t),
    y: start.y + (axis.y * t),
    z: start.z + (axis.z * t),
  };
  const offset = coordDistance(point, projected);
  if (!Number.isFinite(offset) || offset > ROUTE_SPLIT_TOLERANCE_MM) return null;
  return { t, point: projected, offset };
}

function supportRouteSplitPoints(children, start, end) {
  const splits = [];
  const seen = new Set();
  for (const child of children) {
    if (String(child?.type || '').toUpperCase() !== 'SUPPORT') continue;
    const attrs = child?.attributes || {};
    if (attrs.ROUTE_SPLIT_POINT !== 'true') continue;
    const supportPoint = attrs.POS || attrs.BPOS || attrs.APOS || attrs.LPOS;
    const split = projectedSegmentParameter(start, end, supportPoint);
    if (!split) continue;
    const key = `${split.point.x.toFixed(3)}|${split.point.y.toFixed(3)}|${split.point.z.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    splits.push(split);
  }
  splits.sort((a, b) => a.t - b.t);
  return splits.map((entry) => entry.point);
}

function routeBranchPipes(branchName, children, branchBore, rawRouteOptions, endpoints = null) {
  const routeOptions = resolveRouteOptions(rawRouteOptions);
  const fittings = [];
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (!isRouteableFittingNode(child, routeOptions)) continue;
    if (!collectPortCandidates(child).length) continue;
    fittings.push({ node: child, seqIndex: i });
  }
  if (fittings.length === 0) return children;

  const syntheticAfter = new Map();
  const pairUsed = new Set();
  const portUsed = new Set();
  let autoCounter = 1;

  const pairKey = (a, b) => {
    const lo = Math.min(a.seqIndex, b.seqIndex);
    const hi = Math.max(a.seqIndex, b.seqIndex);
    return `${lo}:${hi}`;
  };
  const portKey = (entry, key) => `${entry.seqIndex}|${key}`;
  const appendPipe = (fromEntry, toEntry, pair, routeMethod) => {
    if (!pair || !pair.start || !pair.end) return false;
    const gap = pair.gap;
    if (!Number.isFinite(gap) || gap <= PIPE_ROUTE_GAP_MM) return false;
    const edgeKey = pairKey(fromEntry, toEntry);
    if (pairUsed.has(edgeKey)) return false;
    const startPort = portKey(fromEntry, pair.startKey || 'LPOS');
    const endPort = portKey(toEntry, pair.endKey || 'APOS');
    if (portUsed.has(startPort) || portUsed.has(endPort)) return false;

    const boreSrc = boreForRoutePort(fromEntry.node, pair.startKey)
      || boreForRoutePort(toEntry.node, pair.endKey)
      || (branchBore ? { field: 'HBOR', value: branchBore, raw: String(branchBore) } : null);
    const pipeAttrs = {
      APOS: { x: pair.start.x, y: pair.start.y, z: pair.start.z },
      LPOS: { x: pair.end.x, y: pair.end.y, z: pair.end.z },
      AUTO_GENERATED_PIPE: 'true',
      GAP_MM: gap.toFixed(3),
      ROUTE_TIER: routeMethod
    };
    applyBoreToPipeAttrs(pipeAttrs, boreSrc);
    const supportSplits = routeOptions.splitRoutesAtSupports
      ? supportRouteSplitPoints(children, pair.start, pair.end)
      : [];
    const splitPoints = [pair.start, ...supportSplits, pair.end];
    const autoPipes = [];
    for (let idx = 0; idx < splitPoints.length - 1; idx += 1) {
      const startPoint = splitPoints[idx];
      const endPoint = splitPoints[idx + 1];
      const segmentGap = coordDistance(startPoint, endPoint);
      if (!Number.isFinite(segmentGap) || segmentGap <= PIPE_ROUTE_GAP_MM) continue;
      autoPipes.push({
        name: `PIPE AUTO ${branchName} ${autoCounter++}`,
        type: 'PIPE',
        attributes: {
          ...pipeAttrs,
          APOS: { x: startPoint.x, y: startPoint.y, z: startPoint.z },
          LPOS: { x: endPoint.x, y: endPoint.y, z: endPoint.z },
          GAP_MM: segmentGap.toFixed(3),
          ROUTE_SPLIT: splitPoints.length > 2 ? 'SUPPORT' : '',
        },
      });
    }
    if (autoPipes.length === 0) return false;
    if (!syntheticAfter.has(fromEntry.node)) syntheticAfter.set(fromEntry.node, []);
    syntheticAfter.get(fromEntry.node).push(...autoPipes);
    pairUsed.add(edgeKey);
    portUsed.add(startPort);
    portUsed.add(endPort);
    return true;
  };

  if (routeOptions.topologyMethod === TOPOLOGY_METHODS.STRICT) {
    for (let i = 0; i < fittings.length - 1; i += 1) {
      const current = fittings[i];
      const next = fittings[i + 1];
      if (!isTopologyProvenPair(current.node, next.node, branchName)) continue;
      const pair = selectExactPortPair(current.node, next.node);
      appendPipe(current, next, pair, 'STRICT');
    }
  } else if (routeOptions.topologyMethod === TOPOLOGY_METHODS.LEGACY) {
    for (let i = 0; i < fittings.length - 1; i += 1) {
      const current = fittings[i];
      const next = fittings[i + 1];
      const pair = legacySequentialPair(current.node, next.node);
      appendPipe(current, next, pair, 'LEGACY');
    }
  } else if (routeOptions.topologyMethod === TOPOLOGY_METHODS.RAY) {
    const maxGap = adaptiveRayMaxGap(fittings);
    const edgeCandidates = [];
    for (const fromEntry of fittings) {
      const flowFrom = flowVectorFromNode(fromEntry.node);
      const exits = rayExitPorts(fromEntry.node);
      for (const start of exits) {
        const startUse = portKey(fromEntry, start.key);
        if (portUsed.has(startUse)) continue;
        for (const toEntry of fittings) {
          if (fromEntry.seqIndex === toEntry.seqIndex) continue;
          if (pairUsed.has(pairKey(fromEntry, toEntry))) continue;
          const flowTo = flowVectorFromNode(toEntry.node);
          const entries = rayEntryPorts(toEntry.node);
          for (const end of entries) {
            const endUse = portKey(toEntry, end.key);
            if (portUsed.has(endUse)) continue;
            const gap = coordDistance(start.coord, end.coord);
            if (!Number.isFinite(gap) || gap <= PIPE_ROUTE_GAP_MM || gap > maxGap) continue;

            const gapVec = normalizeVector(vectorBetween(start.coord, end.coord));
            if (!gapVec) continue;
            const alignFrom = flowFrom ? dotVector(flowFrom, gapVec) : 1;
            if (flowFrom && alignFrom <= 0) continue;
            const alignTo = flowTo ? dotVector(negateVector(flowTo), gapVec) : 1;

            const fromPenalty = flowFrom ? (alignFrom > 0.9 ? 1.0 : 10.0) : 4.0;
            const toPenalty = flowTo ? (alignTo > 0.75 ? 1.0 : 6.0) : 3.0;
            const score = gap * fromPenalty * toPenalty;
            edgeCandidates.push({ fromEntry, toEntry, pair: { start: start.coord, end: end.coord, startKey: start.key, endKey: end.key, gap }, score });
          }
        }
      }
    }
    edgeCandidates.sort((a, b) => (a.score - b.score) || (a.pair.gap - b.pair.gap));
    for (const candidate of edgeCandidates) appendPipe(candidate.fromEntry, candidate.toEntry, candidate.pair, 'RAY');
  }

  const hpos = (endpoints?.hpos && typeof endpoints.hpos === 'object' && Number.isFinite(endpoints.hpos.x)) ? endpoints.hpos : null;
  const tpos = (endpoints?.tpos && typeof endpoints.tpos === 'object' && Number.isFinite(endpoints.tpos.x)) ? endpoints.tpos : null;

  const headPipes = [];
  if (hpos && fittings.length > 0) {
    const firstFitting = fittings[0];
    const firstPorts = collectPortCandidates(firstFitting.node);
    let nearestPort = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const p of firstPorts) {
      const d = coordDistance(hpos, p.coord);
      if (d < nearestDist) { nearestDist = d; nearestPort = p; }
    }
    if (nearestPort && nearestDist > PIPE_ROUTE_GAP_MM) {
      const boreSrc = boreForRoutePort(firstFitting.node, nearestPort.key)
        || (branchBore ? { field: 'HBOR', value: branchBore, raw: String(branchBore) } : null);
      const pipeAttrs = {
        APOS: { x: hpos.x, y: hpos.y, z: hpos.z },
        LPOS: { x: nearestPort.coord.x, y: nearestPort.coord.y, z: nearestPort.coord.z },
        AUTO_GENERATED_PIPE: 'true',
        GAP_MM: nearestDist.toFixed(3),
        ROUTE_TIER: 'BRANCH_HEAD'
      };
      applyBoreToPipeAttrs(pipeAttrs, boreSrc);
      headPipes.push({ name: `PIPE AUTO ${branchName} HEAD`, type: 'PIPE', attributes: pipeAttrs });
    }
  }

  const tailPipes = [];
  if (tpos && fittings.length > 0) {
    const lastFitting = fittings[fittings.length - 1];
    const lastPorts = collectPortCandidates(lastFitting.node);
    let nearestPort = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const p of lastPorts) {
      const d = coordDistance(tpos, p.coord);
      if (d < nearestDist) { nearestDist = d; nearestPort = p; }
    }
    if (nearestPort && nearestDist > PIPE_ROUTE_GAP_MM) {
      const boreSrc = boreForRoutePort(lastFitting.node, nearestPort.key)
        || (branchBore ? { field: 'TBOR', value: branchBore, raw: String(branchBore) } : null);
      const pipeAttrs = {
        APOS: { x: nearestPort.coord.x, y: nearestPort.coord.y, z: nearestPort.coord.z },
        LPOS: { x: tpos.x, y: tpos.y, z: tpos.z },
        AUTO_GENERATED_PIPE: 'true',
        GAP_MM: nearestDist.toFixed(3),
        ROUTE_TIER: 'BRANCH_TAIL'
      };
      applyBoreToPipeAttrs(pipeAttrs, boreSrc);
      tailPipes.push({ name: `PIPE AUTO ${branchName} TAIL`, type: 'PIPE', attributes: pipeAttrs });
    }
  }

  const merged = [];
  merged.push(...headPipes);
  for (const child of children) {
    merged.push(child);
    const extras = syntheticAfter.get(child);
    if (extras && extras.length > 0) merged.push(...extras);
  }
  merged.push(...tailPipes);
  return merged;
}

function parseRmssAttributes(content, rawRouteOptions) {
  const routeOptions = resolveRouteOptions(rawRouteOptions);
  const allObjects = parseTextBlocks(content);

  // Build name→owner and name→type maps for hierarchy traversal (SITE/ZONE/PIPE chain).
  const _ownerOf = new Map();
  const _typeOf = new Map();
  for (const obj of allObjects) {
    const name = String(obj?.attributes?.NAME || obj?.id || '').trim();
    const owner = String(obj?.attributes?.OWNER || '').trim();
    const type = String(obj?.attributes?.TYPE || '').toUpperCase().trim();
    if (name) { _ownerOf.set(name, owner); _typeOf.set(name, type); }
  }
  function _findSiteAncestor(startName, maxDepth = 8) {
    let cur = startName;
    for (let d = 0; d < maxDepth; d++) {
      const owner = _ownerOf.get(cur);
      if (!owner) return '';
      if (_typeOf.get(owner) === 'SITE') return owner;
      cur = owner;
    }
    return '';
  }
  const branches = allObjects.filter((obj) => String(obj?.attributes?.TYPE || '').toUpperCase() === 'BRAN');
  const sourceComponents = allObjects.filter((obj) => {
    const rawType = normalizeToken(obj?.attributes?.TYPE);
    if (!routeOptions.preserveBlindFlanges && (rawType === 'FBLI' || rawType === 'FBLIND')) {
      return false;
    }
    return SOURCE_TYPES.has(canonicalComponentType(rawType));
  });

  const branchMap = new Map();
  for (const branch of branches) {
    const branchName = String(branch?.attributes?.NAME || branch?.id || '').trim();
    if (!branchName) continue;

    const boreSrc = extractBore(branch.attributes);
    const branchOwner = String(branch?.attributes?.OWNER || '').trim();
    branchMap.set(branchName, {
      name: branchName,
      type: 'BRANCH',
      bore: boreSrc?.raw || branch.attributes.HBOR || branch.attributes.TBOR || 'Unknown',
      _boreValue: boreSrc?.value || null,
      attributes: {
        HBOR: branch.attributes.HBOR,
        TBOR: branch.attributes.TBOR,
        DTXR: branch.attributes.DTXR,
        ABORE: branch.attributes.ABORE,
        HPOS: parseCoord(branch.attributes.HPOS) || branch.attributes.HPOS,
        TPOS: parseCoord(branch.attributes.TPOS) || branch.attributes.TPOS,
        HREF: branch.attributes.HREF,
        TREF: branch.attributes.TREF,
        CREF: branch.attributes.CREF,
        NAME: branch.attributes.NAME,
        OWNER: branchOwner,
        OWNER_SITE: _findSiteAncestor(branchName),
      },
      children: []
    });
  }

  const refToBranchName = new Map();
  // Also build a compact position → branchName index for POS-based fallback matching.
  const posToBranch = new Map();
  const POS_BUCKET = 10; // mm bucket size for spatial index
  function _posKey(x, y, z) {
    return `${Math.round(x / POS_BUCKET)}|${Math.round(y / POS_BUCKET)}|${Math.round(z / POS_BUCKET)}`;
  }
  for (const comp of sourceComponents) {
    const owner = String(comp?.attributes?.OWNER || '').trim();
    if (!owner || !branchMap.has(owner)) continue;
    const node = toNode(comp);
    if (!node) continue;
    branchMap.get(owner).children.push(node);
    for (const token of collectComponentReferenceTokens(node.attributes)) {
      if (!refToBranchName.has(token)) refToBranchName.set(token, owner);
    }
    // Index all component positions for POS-based spatial fallback.
    for (const pKey of ['APOS', 'LPOS', 'POS', 'HPOS', 'TPOS']) {
      const p = node.attributes?.[pKey];
      if (p && typeof p === 'object' && 'x' in p) {
        const k = _posKey(p.x, p.y, p.z);
        if (!posToBranch.has(k)) posToBranch.set(k, owner);
      }
    }
  }

  // Find the nearest branch for a support position when COMPRE fails to resolve.
  // Searches in expanding concentric shells up to MAX_SEARCH_R buckets from the query point.
  function _findBranchByPosition(pos, maxDistMm = 500) {
    if (!pos || typeof pos !== 'object') return null;
    const maxBuckets = Math.ceil(maxDistMm / POS_BUCKET);
    for (let r = 0; r <= maxBuckets; r++) {
      const bx = Math.round(pos.x / POS_BUCKET);
      const by = Math.round(pos.y / POS_BUCKET);
      const bz = Math.round(pos.z / POS_BUCKET);
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r && Math.abs(dz) !== r) continue; // shell only
            const k = `${bx + dx}|${by + dy}|${bz + dz}`;
            const branch = posToBranch.get(k);
            if (branch) return branch;
          }
        }
      }
    }
    return null;
  }

  // Track added support components by their unique identity (NAME or block id) so that
  // distinct components at the same position (same COMPRE+POS) are NOT collapsed.
  // Previously the dedup key was branchName|ref|x|y|z which dropped ~58% of ANCI entries
  // when multiple support ancillaries shared the same attachment point.
  const addedSupportIds = new Set();
  for (const comp of allObjects) {
    const rawType = normalizeToken(comp?.attributes?.TYPE);
    if (canonicalComponentType(rawType) !== 'SUPPORT') continue;
    const owner = String(comp?.attributes?.OWNER || '').trim();
    if (branchMap.has(owner)) continue;

    // Use component identity as primary dedup key; fall back to position for anonymous blocks.
    const compIdentity = String(comp?.attributes?.NAME || comp?.id || '').trim();
    const dedupKey = compIdentity || null;
    if (dedupKey && addedSupportIds.has(dedupKey)) continue;

    // Resolve branch via COMPRE/COMPREF attachment reference first, then POS-based fallback.
    const attachedRef = supportAttachmentReference(comp?.attributes || {});
    let branchName = (attachedRef && refToBranchName.get(attachedRef)) || null;
    const node = toNode(comp);
    if (!node) continue;
    if (!branchName && node.attributes?.POS) {
      branchName = _findBranchByPosition(node.attributes.POS);
    }
    if (!branchName) continue;

    if (dedupKey) {
      addedSupportIds.add(dedupKey);
    } else {
      // For anonymous blocks, fall back to position-based dedup to avoid true duplicates.
      const p = node.attributes.POS;
      if (p) {
        const posDedup = `${branchName}|${attachedRef || ''}|${p.x.toFixed(3)}|${p.y.toFixed(3)}|${p.z.toFixed(3)}`;
        if (addedSupportIds.has(posDedup)) continue;
        addedSupportIds.add(posDedup);
      }
    }

    node.attributes.ROUTE_SPLIT_POINT = 'true';
    node.attributes.ATTACHED_COMPONENT_REF = attachedRef || '';
    branchMap.get(branchName).children.push(node);
  }

  const out = [];
  for (const [branchName, branch] of branchMap.entries()) {
    const hpos = (branch.attributes.HPOS && typeof branch.attributes.HPOS === 'object') ? branch.attributes.HPOS : null;
    const tpos = (branch.attributes.TPOS && typeof branch.attributes.TPOS === 'object') ? branch.attributes.TPOS : null;
    const routed = routeBranchPipes(branchName, branch.children, branch._boreValue, routeOptions, { hpos, tpos });
    if (!routed.length) continue;
    out.push({ ...branch, children: routed });
  }

  return out;
}

export { parseRmssAttributes };

// Structural element type codes in AVEVA PDMS/E3D (equipment/structure hierarchy).
const STRUCT_TYPE_RE = /^(STRUCTURE|FRMWORK|FRAMEWORK|STRU|FRMW|SCTN|GENSEC|PANEL|PANE|SUBE)$/i;
// Structural path tokens found in OWNER or block ID strings.
const STRUCT_PATH_RE = /\b(STRUCTURE|FRMWORK|FRAMEWORK|FRMW|STRU|PIPESUPP)\b/i;

/**
 * Extract structural steel member positions from a raw RMSS ATTRIBUTE text.
 * Looks for STRUCTURE / FRMWORK / SUBE blocks and PS-* support references.
 * Input blocks may expose APOS/LPOS, HPOS/BPOS, HPOS/TPOS, BPOS/TPOS, or only
 * POS. Output members are visible line segments; single-point supports get a
 * short stub later in the STEP writer.
 */
export function parseRmssStructuralMembers(content) {
  const blocks = parseTextBlocks(content);
  const members = [];
  for (const block of blocks) {
    const rawType = normalizeToken(block?.attributes?.TYPE || '');
    const name  = String(block?.attributes?.NAME  || '').trim();
    const owner = String(block?.attributes?.OWNER || '').trim();
    const blockId = String(block?.id || '').trim();
    const dtxr = String(block?.attributes?.DTXR   || '').trim();
    const ref  = String(block?.attributes?.REF    || block?.attributes?.DBREF || block?.attributes?.REFNO || '').trim();

    const isStructType  = STRUCT_TYPE_RE.test(rawType);
    const hasStructPath = STRUCT_PATH_RE.test(owner) || STRUCT_PATH_RE.test(blockId);
    const hasPsRef      = [name, blockId, dtxr, ref].some((s) => SUPPORT_TAG_RE.test(s));

    if (!isStructType && !hasStructPath && !hasPsRef) continue;

    // Hierarchy-aware label: "<owner tail>/<member name>" mirrors rev_to_stp labelling.
    const ownerTail  = owner.split(/[/\\>]/).filter(Boolean).slice(-1)[0] || '';
    const memberName = name || SUPPORT_TAG_RE.exec(blockId)?.[0] || blockId;
    const label = ownerTail ? `${ownerTail}/${memberName}` : memberName;

    const attrs = block?.attributes || {};
    const kind = resolveKindPure(attrs, {
      userRules: [],
      defaultRules: DEFAULT_RULES,
      kindMap: DEFAULT_KIND_MAP,
      defaultKind: '',
    }) || normalizeSupportType(attrs, `${name} ${dtxr} ${ref}`);
    const points = {
      APOS: parseCoord(attrs.APOS),
      LPOS: parseCoord(attrs.LPOS),
      BPOS: parseCoord(attrs.BPOS),
      HPOS: parseCoord(attrs.HPOS),
      TPOS: parseCoord(attrs.TPOS),
      POS: parseCoord(attrs.POS),
    };
    const pairs = [
      ['APOS', 'LPOS'],
      ['HPOS', 'BPOS'],
      ['HPOS', 'TPOS'],
      ['BPOS', 'TPOS'],
      ['APOS', 'BPOS'],
      ['LPOS', 'BPOS'],
    ];
    let pushed = false;
    const seenPairs = new Set();

    for (const [startKey, endKey] of pairs) {
      const start = points[startKey];
      const end = points[endKey];
      if (!start || !end || coordDistance(start, end) < 1) continue;
      const key = `${start.x.toFixed(3)},${start.y.toFixed(3)},${start.z.toFixed(3)}|${end.x.toFixed(3)},${end.y.toFixed(3)},${end.z.toFixed(3)}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      members.push({ label, kind, start, end });
      pushed = true;
    }

    if (!pushed && points.POS) {
      members.push({ label, kind, start: points.POS, end: points.POS });
    }
  }
  return members;
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const fs = require('fs');
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node rmss-attribute-parser.js <path_to_RMSS_ATTRIBUTE.TXT>');
    process.exit(1);
  }
  const fileContent = fs.readFileSync(args[0], 'utf-8');
  const result = parseRmssAttributes(fileContent, DEFAULT_ROUTE_OPTIONS);
  console.log(JSON.stringify(result, null, 2));
}
