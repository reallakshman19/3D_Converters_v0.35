import {
  resolveKindDescriptor,
  SUPPORT_KINDS,
} from '../../support/SupportKindResolver.js';

import {
  resolveKindFromAttrs,
} from '../../rvm-viewer/RvmSupportMapper.js';

import {
  migrateSupportMappingConfig,
  supportRulesFromMapping,
  normalizeXmlTypes,
} from './support-mapping-config.js';

const KIND_REF_FLAG = Symbol('xmlCiiSupportKindReference');

function toText(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseNumericMm(value) {
  const text = toText(value).replace(/mm/gi, ' ').trim();
  if (!text) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseGapValue(value) {
  const numeric = parseNumericMm(value);
  return Number.isFinite(numeric) ? String(numeric) : '';
}

function normalizeCoordinatePoint(point) {
  if (point === undefined || point === null || point === '') return null;

  if (Array.isArray(point) && point.length >= 3) {
    const x = Number(point[0]);
    const y = Number(point[1]);
    const z = Number(point[2]);
    return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
  }

  if (typeof point === 'object') {
    const x = Number(point.x ?? point.X);
    const y = Number(point.y ?? point.Y);
    const z = Number(point.z ?? point.Z);
    return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
  }

  const text = toText(point).trim();
  if (!text) return null;

  const tokens = text.split(/\s+/g);
  const directional = { x: 0, y: 0, z: 0 };
  let parsedDirectional = false;
  for (let i = 0; i < tokens.length - 1; i += 2) {
    const axis = tokens[i].toUpperCase();
    const value = parseNumericMm(tokens[i + 1]);
    if (!Number.isFinite(value)) continue;
    if (axis === 'E') { directional.x = value; parsedDirectional = true; }
    else if (axis === 'W') { directional.x = -value; parsedDirectional = true; }
    else if (axis === 'N') { directional.y = value; parsedDirectional = true; }
    else if (axis === 'S') { directional.y = -value; parsedDirectional = true; }
    else if (axis === 'U') { directional.z = value; parsedDirectional = true; }
    else if (axis === 'D') { directional.z = -value; parsedDirectional = true; }
  }
  if (parsedDirectional) return directional;

  const values = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return values.length >= 3 ? { x: values[0], y: values[1], z: values[2] } : null;
}

function normalizeDirectionVector(value) {
  if (!value) return null;
  const x = Number(value.x ?? value.X ?? value[0]);
  const y = Number(value.y ?? value.Y ?? value[1]);
  const z = Number(value.z ?? value.Z ?? value[2]);
  if (![x, y, z].every(Number.isFinite)) return null;
  const length = Math.sqrt((x * x) + (y * y) + (z * z));
  if (length <= 1e-9) return null;
  return { x: x / length, y: y / length, z: z / length };
}

function parseDirectionVectorText(value) {
  const nums = toText(value).match(/[-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return nums.length >= 3 ? normalizeDirectionVector({ x: nums[0], y: nums[1], z: nums[2] }) : null;
}

function xmlLocalName(node) {
  return toText(node?.localName || node?.nodeName).replace(/^.*:/, '');
}

function xmlChildrenByName(parent, localName) {
  return [...(parent?.childNodes || [])]
    .filter((child) => child.nodeType === 1 && xmlLocalName(child) === localName);
}

function xmlFirstChild(parent, localName) {
  return xmlChildrenByName(parent, localName)[0] || null;
}

function xmlText(parent, localName) {
  return toText(xmlFirstChild(parent, localName)?.textContent).trim();
}

function xmlSetText(document, parent, localName, value) {
  let element = xmlFirstChild(parent, localName);
  if (!element) {
    element = parent?.namespaceURI
      ? document.createElementNS(parent.namespaceURI, localName)
      : document.createElement(localName);
    parent.appendChild(element);
  }
  element.textContent = toText(value);
  return element;
}

function xmlPositionKey(positionText, tolerance) {
  const point = normalizeCoordinatePoint(positionText);
  if (!point) return '';
  const tol = toFiniteNumber(tolerance, 1) || 1;
  return [point.x, point.y, point.z]
    .map((value) => Math.round(value / tol))
    .join('|');
}

function walkStagedComponents(value, branchName = '', out = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkStagedComponents(item, branchName, out));
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  const attrs = value.attributes && typeof value.attributes === 'object' ? value.attributes : {};
  const type = toText(value.type || attrs.TYPE).toUpperCase();
  const currentBranch = (type === 'BRANCH' || Array.isArray(value.children))
    ? toText(value.name || attrs.NAME || branchName)
    : branchName;
  out.push({ component: value, attrs, branchName: currentBranch });
  if (Array.isArray(value.children)) value.children.forEach((child) => walkStagedComponents(child, currentBranch, out));
  return out;
}

export function normalizeSupportTag(value) {
  const text = toText(value).trim().toUpperCase().replace(/^\/+/, '').replace(/\s+/g, ' ');
  const match = text.match(/PS-\d+(?:\.\d+)?/i);
  return match ? match[0].toUpperCase() : '';
}

function supportTagBase(value) {
  return normalizeSupportTag(value).replace(/\.\d+$/, '');
}

function supportTagsFromText(value) {
  const tags = new Set();
  for (const match of toText(value).matchAll(/\/?PS-\d+(?:\.\d+)?/ig)) {
    const tag = normalizeSupportTag(match[0]);
    if (tag) tags.add(tag);
  }
  return [...tags];
}

function supportTagsFromAttrs(attrs, componentName = '') {
  const tags = new Set(supportTagsFromText(componentName));
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value && typeof value === 'object') continue;
    for (const tag of supportTagsFromText(`${key} ${value}`)) tags.add(tag);
  }
  return [...tags];
}

export function xmlNodeSupportTags(node) {
  const parts = [xmlText(node, 'NodeName'), xmlText(node, 'ComponentRefNo')];
  for (const child of xmlChildrenByName(node, 'SupportTag')) parts.push(toText(child.textContent));
  return [...new Set(parts.flatMap(supportTagsFromText))];
}

function dtxrPositionOffset(config = {}) {
  const option = config?.dtxrPositionOffset || {};
  return {
    enabled: option.enabled === true,
    xOffset: toFiniteNumber(option.xOffset, 0),
    yOffset: toFiniteNumber(option.yOffset, 0),
    zOffset: toFiniteNumber(option.zOffset, 0),
  };
}

function applyDtxrPositionOffset(point, config = {}) {
  if (!point) return null;
  const option = dtxrPositionOffset(config);
  if (!option.enabled) return point;
  return { x: point.x + option.xOffset, y: point.y + option.yOffset, z: point.z + option.zOffset };
}

function pointWithOffset(point, offset) {
  if (!point || !offset) return null;
  return { x: point.x + offset.x, y: point.y + offset.y, z: point.z + offset.z };
}

function attrsWithoutGeneratedSupportKind(attrs = {}) {
  const stripped = {};
  for (const [key, value] of Object.entries(attrs || {})) {
    const normalized = toText(key).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (['SUPPORTKIND', 'SUPPORTMAPPERKIND', 'SUPPORTTYPE'].includes(normalized)) continue;
    stripped[key] = value;
  }
  return stripped;
}

function supportDescriptorFromKind(kind, attrs, source) {
  const normalized = normalizeSupportKind(kind);
  return normalized ? { primaryKind: normalized, kinds: [normalized], dofs: {}, source, attrs } : null;
}

function normalizeSupportKind(value) {
  const kind = toText(value).toUpperCase().replace(/\s+/g, '');
  return SUPPORT_KINDS.includes(kind) ? kind : '';
}

function createKindReference(descriptor, attrs) {
  const ref = new String(descriptor.primaryKind || '');
  ref[KIND_REF_FLAG] = true;
  ref.primaryKind = descriptor.primaryKind || '';
  ref.kinds = descriptor.kinds?.length ? [...descriptor.kinds] : (descriptor.primaryKind ? [descriptor.primaryKind] : []);
  ref.attrs = attrs || {};
  ref.toString = () => descriptor.primaryKind || '';
  ref.valueOf = () => descriptor.primaryKind || '';
  ref[Symbol.toPrimitive] = () => descriptor.primaryKind || '';
  return ref;
}

function isKindReference(value) {
  return !!(value && typeof value === 'object' && value[KIND_REF_FLAG]);
}

export function resolveXmlCiiSupportDescriptor(attrs, config = {}) {
  const direct = normalizeSupportKind(attrs?.SUPPORT_KIND || attrs?.SUPPORT_MAPPER_KIND || attrs?.SUPPORT_TYPE);
  const directDescriptor = supportDescriptorFromKind(direct, attrs, 'explicit');
  if (direct && direct !== 'REST') return directDescriptor;

  const supportMapping = migrateSupportMappingConfig(config);
  const rules = supportRulesFromMapping(supportMapping);
  const ruleAttrs = attrsWithoutGeneratedSupportKind(attrs);
  if (rules.length) {
    const descriptor = resolveKindDescriptor(ruleAttrs, {
      userRules: rules,
      defaultRules: [],
      kindMap: {},
      defaultKind: '',
    });
    if (descriptor?.primaryKind) return { ...descriptor, source: 'supportMapping' };
  }

  const legacyKind = normalizeSupportKind(resolveKindFromAttrs(ruleAttrs));
  if (legacyKind) return { primaryKind: legacyKind, kinds: [legacyKind], dofs: {}, source: 'legacyRvmSupportMapper' };
  if (directDescriptor) return directDescriptor;
  return { primaryKind: '', kinds: [], dofs: {}, source: 'none' };
}

export function resolveXmlCiiSupportKind(attrs, config = {}) {
  return resolveXmlCiiSupportDescriptor(attrs, config).primaryKind || '';
}

export function buildStagedSupportIndex(stagedJsonText, config = {}, diagnostics = []) {
  const empty = { byCoord: new Map(), byTag: new Map(), byBaseTag: new Map(), items: [], count: 0 };
  const supportMapping = migrateSupportMappingConfig(config);
  if (supportMapping.useJsonForRestraints === false) {
    diagnostics.push({ type: 'staged-support-index', supports: 0, coordinateKeys: 0, psTagKeys: 0, disabled: true });
    return empty;
  }
  if (!toText(stagedJsonText).trim()) return empty;

  let parsed = null;
  try { parsed = JSON.parse(stagedJsonText); } catch (error) {
    diagnostics.push({ type: 'staged-json-parse-error', message: toText(error?.message || error) });
    return empty;
  }

  const byCoord = new Map();
  const byTag = new Map();
  const byBaseTag = new Map();
  const items = [];
  const tolerance = toFiniteNumber(config.coordinateTolerance, 1);
  let count = 0;

  for (const entry of walkStagedComponents(parsed)) {
    const attrs = entry.attrs || {};
    const descriptor = resolveXmlCiiSupportDescriptor(attrs, config);
    if (!descriptor.primaryKind) continue;

    let point = null;
    let rawPoint = null;
    for (const key of ['SUPPORTCOORD', 'SUPPORT_COORD', 'POS', 'POSI', 'BPOS', 'APOS', 'LPOS', 'CPOS', 'HPOS', 'TPOS']) {
      rawPoint = normalizeCoordinatePoint(attrs[key]);
      point = key === 'POSI' ? applyDtxrPositionOffset(rawPoint, config) : rawPoint;
      if (point) break;
    }

    const kindRef = createKindReference(descriptor, attrs);
    const supportTags = supportTagsFromAttrs(attrs, entry.component?.name || '');
    const supportBaseTags = [...new Set(supportTags.map(supportTagBase).filter(Boolean))];
    const indexed = {
      ...entry,
      kind: kindRef,
      primaryKind: descriptor.primaryKind,
      kinds: descriptor.kinds?.length ? descriptor.kinds : [descriptor.primaryKind],
      dofs: descriptor.dofs || {},
      supportDescriptorSource: descriptor.source,
      supportTags,
      supportBaseTags,
      point,
      rawPoint,
    };
    items.push(indexed);

    if (point) {
      const coordinateKey = xmlPositionKey(`${point.x} ${point.y} ${point.z}`, tolerance);
      if (coordinateKey) {
        if (!byCoord.has(coordinateKey)) byCoord.set(coordinateKey, []);
        byCoord.get(coordinateKey).push(indexed);
      }
    }

    for (const tag of supportTags) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(indexed);
      const baseTag = supportTagBase(tag);
      if (baseTag) {
        if (!byBaseTag.has(baseTag)) byBaseTag.set(baseTag, []);
        byBaseTag.get(baseTag).push(indexed);
      }
    }
    count += 1;
  }

  diagnostics.push({ type: 'staged-support-index', supports: count, coordinateKeys: byCoord.size, psTagKeys: byTag.size });
  return { byCoord, byTag, byBaseTag, items, count };
}

export function calibrateStagedSupportIndexCoordinates(stagedSupportIndex, offset, config = {}) {
  const normalizedOffset = normalizeCoordinatePoint(offset);
  if (!normalizedOffset || !stagedSupportIndex || !Array.isArray(stagedSupportIndex.items)) return stagedSupportIndex;

  const byCoord = new Map();
  const byTag = new Map();
  const byBaseTag = new Map();
  const tolerance = toFiniteNumber(config.coordinateTolerance, 1);
  const items = stagedSupportIndex.items.map((item) => {
    const point = pointWithOffset(item.rawPoint, normalizedOffset) || item.point || null;
    const indexed = { ...item, point, inferredOffset: normalizedOffset };

    if (point) {
      const coordinateKey = xmlPositionKey(`${point.x} ${point.y} ${point.z}`, tolerance);
      if (coordinateKey) {
        if (!byCoord.has(coordinateKey)) byCoord.set(coordinateKey, []);
        byCoord.get(coordinateKey).push(indexed);
      }
    }

    for (const tag of indexed.supportTags || []) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(indexed);
      const baseTag = supportTagBase(tag);
      if (baseTag) {
        if (!byBaseTag.has(baseTag)) byBaseTag.set(baseTag, []);
        byBaseTag.get(baseTag).push(indexed);
      }
    }
    return indexed;
  });

  return { ...stagedSupportIndex, byCoord, byTag, byBaseTag, items, inferredOffset: normalizedOffset };
}

const XML_CII_NATIVE_RESTRAINT_TYPE_ALIASES = Object.freeze({
  GUI: 'GUI',
  GUIDE: 'GUI',
  X: 'GUI',
  LIM: 'LIM',
  LIMIT: 'LIM',
  LINESTOP: 'LIM',
  Z: 'LIM',
});

export function normalizeExistingXmlCiiRestraintType(typeText, config = {}) {
  const raw = toText(typeText).trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  const nativeType = XML_CII_NATIVE_RESTRAINT_TYPE_ALIASES[upper];
  if (nativeType) return nativeType;
  const sign = upper.startsWith('+') || upper.startsWith('-') ? upper[0] : '';
  const unsigned = sign ? upper.slice(1) : upper;
  const mapped = config.xmlAxisToCiiAxis?.[upper] || config.xmlAxisToCiiAxis?.[unsigned];
  return mapped ? toText(mapped).trim().toUpperCase() : upper;
}

function vectorFromAttrs(attrs, keys) {
  for (const key of keys || []) {
    const value = attrs?.[key];
    const parsed = value && typeof value === 'object' ? normalizeDirectionVector(value) : parseDirectionVectorText(value);
    if (parsed) return parsed;
  }
  return null;
}

function resolvePipeAxis(attrs) {
  return vectorFromAttrs(attrs, ['PIPE_AXIS_COSINES', 'PIPEAXISCOSINES', 'PIPE_AXIS', 'PIPEAXIS', 'PIPE_AXIS_VECTOR', 'PIPEAXISVECTOR', 'AXIS', 'DIRECTION_COSINES', 'DIRECTIONCOSINES']);
}

function cross(a, b) {
  return normalizeDirectionVector({ x: (a.y * b.z) - (a.z * b.y), y: (a.z * b.x) - (a.x * b.z), z: (a.x * b.y) - (a.y * b.x) });
}

function resolveSupportDirectionCosines({ profile, attrs, nodeElement }) {
  const mode = toText(profile.directionMode || 'none').toLowerCase();
  if (mode === 'none') return null;
  if (mode === 'fixed') return normalizeDirectionVector(profile.direction);
  if (mode === 'from-staged') return vectorFromAttrs(attrs, ['DIRECTION_COSINES', 'DIRECTIONCOSINES', 'SUPPORT_DIRECTION_COSINES', 'SUPPORTDIRECTIONCOSINES', 'DIRCOS', 'DIRECTION', 'SUPPORT_DIRECTION']);
  if (mode === 'from-xml') return normalizeDirectionVector({ x: xmlText(nodeElement, 'DirectionCosineX'), y: xmlText(nodeElement, 'DirectionCosineY'), z: xmlText(nodeElement, 'DirectionCosineZ') });
  if (mode === 'pipe-axis') return resolvePipeAxis(attrs);
  if (mode === 'pipe-normal') {
    const axis = resolvePipeAxis(attrs);
    if (!axis) return null;
    return cross(Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }, axis);
  }
  return null;
}

function supportProfileForKind(kind, config = {}) {
  const supportMapping = migrateSupportMappingConfig(config);
  return supportMapping.kindProfiles?.[normalizeSupportKind(kind)] || {};
}

function gapForSupportKind(kind, attrs, fallbackGap) {
  const upperKind = normalizeSupportKind(kind);
  if (upperKind !== 'LINESTOP' && upperKind !== 'LIMIT') return fallbackGap;
  return parseGapValue(attrs?.CMPSUPGAP || attrs?.CMPSUPGAP_POS || attrs?.CMPSUPGAP_PS) || fallbackGap;
}

function restraintTypeUsesSupportGap(type, entry = null) {
  const restraintType = normalizeXmlType(type);
  const supportKind = normalizeSupportKind(entry?.supportKind);
  return restraintType === 'LIM' || supportKind === 'LINESTOP' || supportKind === 'LIMIT';
}

function firstNodeSupportGapText(nodeElement) {
  return toText(
    xmlText(nodeElement, 'CMPSUPGAP')
    || xmlText(nodeElement, 'CMPSUPGAP_POS')
    || xmlText(nodeElement, 'CMPSUPGAP_PS')
  ).trim();
}

function normalizeXmlType(type) {
  const upper = toText(type).trim().toUpperCase();
  return XML_CII_NATIVE_RESTRAINT_TYPE_ALIASES[upper] || upper;
}

function formatDirection(direction) {
  const vector = normalizeDirectionVector(direction);
  return vector ? `${vector.x.toFixed(9)},${vector.y.toFixed(9)},${vector.z.toFixed(9)}` : '';
}

export function supportDirectionAudit(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      if (!entry || typeof entry === 'string') return '';
      const dir = formatDirection(entry.direction);
      const mode = toText(entry.directionMode || 'none');
      if (!dir && mode === 'none') return '';
      return `${toText(entry.type || '')}:${mode}${dir ? `:${dir}` : ':missing'}`;
    })
    .filter(Boolean)
    .join('|');
}

export function supportDirectionAuditForNode(nodeElement) {
  return xmlChildrenByName(nodeElement, 'Restraint')
    .map((restraint) => {
      const type = normalizeXmlType(xmlText(restraint, 'Type'));
      const dir = formatDirection({ x: xmlText(restraint, 'DirectionCosineX'), y: xmlText(restraint, 'DirectionCosineY'), z: xmlText(restraint, 'DirectionCosineZ') });
      return dir ? `${type}:from-xml:${dir}` : '';
    })
    .filter(Boolean)
    .join('|');
}

function createRestraintEntry(fields) {
  return { ...fields, toString() { return this.type || ''; }, valueOf() { return this.type || ''; }, [Symbol.toPrimitive]() { return this.type || ''; } };
}

export function restraintEntriesFromSupportKind(kind, attrs = {}, nodeElement = null, config = {}) {
  const upperKind = normalizeSupportKind(kind);
  if (!upperKind) return [];
  const profile = supportProfileForKind(upperKind, config);
  const values = normalizeXmlTypes(profile.xmlTypes || config.supportKindToXmlType?.[upperKind] || []);
  const direction = resolveSupportDirectionCosines({ profile, attrs, nodeElement });
  const gap = gapForSupportKind(upperKind, attrs, profile.gap ?? '0');
  return values.map(normalizeXmlType).filter(Boolean).map((type) => createRestraintEntry({
    type,
    stiffness: profile.stiffness && profile.stiffness !== 'default' ? profile.stiffness : config.defaultStiffness,
    gap,
    cmpSupGap: upperKind === 'LINESTOP' || upperKind === 'LIMIT' ? toText(attrs?.CMPSUPGAP || attrs?.CMPSUPGAP_POS || attrs?.CMPSUPGAP_PS).trim() : '',
    frictionMode: profile.frictionMode || 'default',
    fixedFriction: profile.fixedFriction || '',
    supportTagMode: profile.supportTagMode || 'kind',
    supportTagValue: profile.supportTagValue || '',
    direction,
    supportKind: upperKind,
    directionMode: profile.directionMode || 'none',
  }));
}

export function dedupeXmlCiiRestraintEntries(entries = []) {
  const seen = new Set();
  const out = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const type = normalizeXmlType(typeof entry === 'string' ? entry : entry?.type);
    if (!type) continue;
    const direction = normalizeDirectionVector(entry?.direction);
    const dir = direction ? `${direction.x.toFixed(6)},${direction.y.toFixed(6)},${direction.z.toFixed(6)}` : '';
    const key = `${type}|${dir}|${toText(entry?.stiffness)}|${toText(entry?.gap)}|${toText(entry?.frictionMode)}|${toText(entry?.fixedFriction)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

export function xmlCiiRestraintEntriesFromSupportMatch(match, nodeElement, config = {}) {
  const attrs = match?.attrs || {};
  const kinds = Array.isArray(match?.kinds) && match.kinds.length ? match.kinds : [match?.kind].filter(Boolean);
  const entries = [];
  for (const kind of kinds) {
    for (const entry of restraintEntriesFromSupportKind(kind, attrs, nodeElement, config)) {
      entries.push(entry);
    }
  }
  return dedupeXmlCiiRestraintEntries(entries);
}

export function xmlCiiTypeEntriesFromSupportKind(kind, config = {}) {
  if (isKindReference(kind)) return xmlCiiRestraintEntriesFromSupportMatch({ kind: kind.primaryKind, kinds: kind.kinds, attrs: kind.attrs }, null, config);
  return restraintEntriesFromSupportKind(kind, {}, null, config).map((entry) => entry.type);
}

function directionFromRestraint(restraint) {
  return normalizeDirectionVector({ x: xmlText(restraint, 'DirectionCosineX'), y: xmlText(restraint, 'DirectionCosineY'), z: xmlText(restraint, 'DirectionCosineZ') });
}

export function xmlCiiTypeEntryFromExistingRestraint(restraint, config = {}) {
  return {
    type: normalizeExistingXmlCiiRestraintType(xmlText(restraint, 'Type'), config),
    stiffness: xmlText(restraint, 'Stiffness'),
    gap: xmlText(restraint, 'Gap'),
    friction: xmlText(restraint, 'Friction'),
    direction: directionFromRestraint(restraint),
    directionMode: 'from-xml',
  };
}

function xmlTypeAllowsRealFriction(type) {
  const t = toText(type).toUpperCase();
  return t === '+Y' || t === 'Y';
}

function frictionForEntry(entry, type, existingFriction, config = {}) {
  if (typeof entry === 'string') return existingFriction || toText(config.defaultFriction || '0.3') || '0.3';
  if (toText(entry?.friction)) return toText(entry.friction);
  const mode = toText(entry?.frictionMode || 'default').toLowerCase();
  const defaultFriction = toText(config.defaultFriction || '0.3') || '0.3';
  if (mode === 'fixed' && toText(entry?.fixedFriction)) return toText(entry.fixedFriction);
  if (mode === 'existing' && toText(existingFriction)) return toText(existingFriction);
  if (mode === 'sentinel' && config.useFrictionSentinelForNonYSupports !== false && !xmlTypeAllowsRealFriction(type)) return '-1.010100';
  return defaultFriction;
}

export function applyXmlRestraints(document, nodeElement, entries, config = {}) {
  if (!entries || entries.length === 0) return;
  const existing = xmlChildrenByName(nodeElement, 'Restraint');
  const nodeSupportGapText = firstNodeSupportGapText(nodeElement);
  const nodeSupportGap = parseGapValue(nodeSupportGapText);
  let stiffness = config.defaultStiffness || '1.751270E+12';
  let gap = '0';
  let friction = config.defaultFriction || '0.3';
  let existingDirection = null;
  if (existing.length > 0) {
    const r0 = existing[0];
    const s = xmlText(r0, 'Stiffness');
    if (s && Number.isFinite(Number(s)) && Number(s) > 0) stiffness = s;
    gap = xmlText(r0, 'Gap') || gap;
    friction = xmlText(r0, 'Friction') || friction;
    existingDirection = directionFromRestraint(r0);
  }
  for (const r of existing) nodeElement.removeChild(r);
  for (const entry of entries) {
    const type = normalizeXmlType(typeof entry === 'string' ? entry : entry?.type);
    if (!type) continue;
    const restraint = nodeElement?.namespaceURI ? document.createElementNS(nodeElement.namespaceURI, 'Restraint') : document.createElement('Restraint');
    nodeElement.appendChild(restraint);
    xmlSetText(document, restraint, 'Type', type);
    xmlSetText(document, restraint, 'Stiffness', toText(entry?.stiffness).trim() || stiffness);
    const entryGap = toText(entry?.gap).trim();
    const usesSupportGap = restraintTypeUsesSupportGap(type, entry);
    const gapValue = usesSupportGap && (!entryGap || Number(entryGap) === 0) && nodeSupportGap
      ? String(nodeSupportGap)
      : (entryGap || gap);
    xmlSetText(document, restraint, 'Gap', gapValue);
    xmlSetText(document, restraint, 'Friction', frictionForEntry(entry, type, friction, config));
    const cmpSupGap = toText(entry?.cmpSupGap).trim() || (usesSupportGap ? nodeSupportGapText : '');
    if (cmpSupGap) xmlSetText(document, restraint, 'CMPSUPGAP', cmpSupGap);
    const direction = normalizeDirectionVector(entry?.direction) || (entry?.directionMode === 'from-xml' ? existingDirection : null);
    if (direction) {
      xmlSetText(document, restraint, 'DirectionCosineX', direction.x.toFixed(9));
      xmlSetText(document, restraint, 'DirectionCosineY', direction.y.toFixed(9));
      xmlSetText(document, restraint, 'DirectionCosineZ', direction.z.toFixed(9));
    }
  }
}

export function supportKindForOutput(attrs) {
  return toText(attrs?.SUPPORT_TYPE || attrs?.SUPPORT_KIND || '').trim().toUpperCase();
}

export function applySupportMapperToAttributes(attrs, config = {}) {
  if (!attrs || typeof attrs !== 'object') return '';
  const kind = resolveXmlCiiSupportKind(attrs, config);
  if (!kind) return '';
  attrs.SUPPORT_TYPE = kind;
  attrs.SUPPORT_KIND = kind;
  attrs.SUPPORT_MAPPER_KIND = kind;
  return kind;
}

export function enrichHierarchyWithMapperKinds(nodes, stats = { scanned: 0, mapped: 0 }, config = {}) {
  if (!Array.isArray(nodes)) return stats;
  for (const node of nodes) {
    if (!node) continue;
    const typeStr = String(node.type || node.attributes?.TYPE || '').toUpperCase();
    if (typeStr === 'SUPPORT' || typeStr === 'ATTA' || typeStr === 'ANCI') {
      const attrs = node.attributes || (node.attributes = {});
      const before = supportKindForOutput(attrs);
      const kind = applySupportMapperToAttributes(attrs, config);
      stats.scanned += 1;
      if (kind && kind !== before) stats.mapped += 1;
    }
    if (Array.isArray(node.children)) enrichHierarchyWithMapperKinds(node.children, stats, config);
    if (Array.isArray(node.items)) enrichHierarchyWithMapperKinds(node.items, stats, config);
    if (Array.isArray(node.branches)) enrichHierarchyWithMapperKinds(node.branches, stats, config);
  }
  return stats;
}
