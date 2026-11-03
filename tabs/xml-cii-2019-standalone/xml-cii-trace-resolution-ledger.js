const LEDGER_SCHEMA = 'xml-cii-trace-resolution-ledger/v1';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function decodeEntities(value) {
  return text(value)
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&gt;/gi, '>')
    .replace(/&lt;/gi, '<')
    .replace(/&amp;/gi, '&');
}

export function canonicalStandaloneDtxrBranch(value) {
  const full = decodeEntities(value)
    .replace(/<\/?Branchname[^>]*>/gi, '')
    .replace(/^\s*=\s*/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\+/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\s+/g, '')
    .replace(/^\/*/, '/')
    .replace(/\/$/, '')
    .replace(/\/B0*(\d+)$/i, '/B$1')
    .toUpperCase();
  const root = full.replace(/\/B\d+$/i, '');
  const suffix = full.match(/\/(B\d+)$/i)?.[1]?.toUpperCase() || '';
  return { original: text(value), full, root, suffix };
}

export function standaloneDtxrBranchRelationship(left, right) {
  const a = canonicalStandaloneDtxrBranch(left);
  const b = canonicalStandaloneDtxrBranch(right);
  if (!b.full) return { compatible: true, score: 50, method: 'unscoped-source', left: a, right: b };
  if (!a.full) return { compatible: false, score: 0, method: 'missing-xml-branch', left: a, right: b };
  if (a.full === b.full) return { compatible: true, score: 100, method: 'exact', left: a, right: b };
  if (a.root && a.root === b.root) return { compatible: true, score: 95, method: 'same-root', left: a, right: b };
  const aq = a.root.replace(/["']/g, '');
  const bq = b.root.replace(/["']/g, '');
  if (aq && aq === bq) return { compatible: true, score: 92, method: 'same-root-normalized-quotes', left: a, right: b };
  return { compatible: false, score: 0, method: 'different-root', left: a, right: b };
}

export function parseStandaloneDtxrPoint(value) {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value) && value.length >= 3) {
    const x = Number(value[0]);
    const y = Number(value[1]);
    const z = Number(value[2]);
    return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
  }
  if (typeof value === 'object') {
    const x = Number(value.x ?? value.X ?? value.E ?? value.east);
    const y = Number(value.y ?? value.Y ?? value.N ?? value.north);
    const z = Number(value.z ?? value.Z ?? value.U ?? value.EL ?? value.elev ?? value.elevation);
    return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
  }
  const source = text(value);
  if (!source) return null;
  const directional = {};
  source.replace(/\b(E|W|N|S|U|D|EL)\s*[:=]?\s*(-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?)/gi, (_, axis, raw) => {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return '';
    const key = axis.toUpperCase();
    if (key === 'E') directional.x = numeric;
    else if (key === 'W') directional.x = -numeric;
    else if (key === 'N') directional.y = numeric;
    else if (key === 'S') directional.y = -numeric;
    else if (key === 'U' || key === 'EL') directional.z = numeric;
    else if (key === 'D') directional.z = -numeric;
    return '';
  });
  if ([directional.x, directional.y, directional.z].every(Number.isFinite)) return directional;
  const values = source.match(/-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return values.length >= 3 ? { x: values[0], y: values[1], z: values[2] } : null;
}

function pointDistanceMm(left, right) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function pointLabel(point) {
  if (!point) return '';
  const format = (value) => String(Math.round(value * 1000) / 1000);
  return `E=${format(point.x)} N=${format(point.y)} EL=${format(point.z)}`;
}

function attrValue(attrs, names) {
  for (const wanted of names) {
    const upper = text(wanted).toUpperCase();
    for (const [key, value] of Object.entries(attrs || {})) {
      if (text(key).toUpperCase() === upper && text(value)) return value;
    }
  }
  return '';
}

function normalizeSupportTag(value) {
  const match = text(value).toUpperCase().match(/\/?PS-?\d+(?:\.\d+)?/);
  return match ? match[0].replace(/^\/+/, '').replace(/^PS-/i, 'PS') : '';
}

function supportTags(value) {
  const tags = new Set();
  for (const match of text(value).matchAll(/\/?PS-?\d+(?:\.\d+)?/ig)) {
    const tag = normalizeSupportTag(match[0]);
    if (tag) tags.add(tag);
  }
  return [...tags];
}

function uniqueValues(values) {
  const seen = new Set();
  const out = [];
  for (const value of values.map(text).filter(Boolean)) {
    const key = value.toUpperCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function toleranceFromConfig(config = {}) {
  const parsed = safeObject(config);
  const values = [
    parsed?.resolverJsonTrace?.coordinateTolerance,
    parsed?.jsonTrace?.coordinateTolerance,
    parsed?.dtxrCoordinateToleranceMm,
    parsed?.coordinateTolerance,
    parsed?.dtxrPositionOffset?.tolerance,
  ].map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? values[0] : 6;
}

function configuredPositionOffset(config = {}) {
  const option = safeObject(config?.dtxrPositionOffset);
  if (option.enabled !== true) return null;
  return {
    x: Number(option.xOffset) || 0,
    y: Number(option.yOffset) || 0,
    z: Number(option.zOffset) || 0,
  };
}

function offsetPoint(point, offset) {
  if (!point || !offset) return point;
  return { x: point.x + offset.x, y: point.y + offset.y, z: point.z + offset.z };
}

const POSITION_ALIASES = Object.freeze(['SUPPORTCOORD', 'SUPPORT_COORD', 'POS', 'POSI', 'BPOS', 'APOS', 'LPOS', 'CPOS', 'HPOS', 'TPOS', 'SPOS', 'EPOS', 'DTXR_POS']);

function ownPosition(attrs, value, config) {
  const configuredOffset = configuredPositionOffset(config);
  for (const alias of POSITION_ALIASES) {
    const raw = attrValue(attrs, [alias]);
    const parsed = parseStandaloneDtxrPoint(raw);
    if (!parsed) continue;
    return alias === 'POSI' ? offsetPoint(parsed, configuredOffset) : parsed;
  }
  return parseStandaloneDtxrPoint(value?.position || value?.point || '');
}

function descriptionParts(value, attrs, type, hasChildren) {
  const rawDtxrPos = attrValue(attrs, ['DTXR_POS']);
  const explicitDtxrPos = parseStandaloneDtxrPoint(rawDtxrPos)
    ? text(attrValue(attrs, ['DTXR', 'DESC', 'DESCRIPTION', 'RTEXT', 'SPRE']))
    : text(rawDtxrPos || attrValue(attrs, ['DTXR', 'DESC', 'DESCRIPTION', 'RTEXT', 'SPRE']));
  const description = explicitDtxrPos || (hasChildren ? '' : text(value?.name || type));
  const dtxrPs = text(attrValue(attrs, ['DTXR_PS', 'DTXRPS']));
  const name = text(attrValue(attrs, ['NAME', 'NodeName', 'SupportTag']));
  const componentRef = text(attrValue(attrs, ['ComponentRefNo', 'COMPONENTREFNO', 'REF', 'RefNo']));
  const labeled = description && name && !description.toUpperCase().includes('NAME=')
    ? `${description}(NAME=${name})`
    : description;
  return { description, dtxrPs, labeled, name, componentRef };
}

function sourceNodeNo(attrs, sequence) {
  const explicit = text(attrValue(attrs, ['JsonNodeNo', 'JSON_NODE_NO', 'NODE_NO', 'NodeNumber', 'NODE', 'SEQ', 'SEQUENCE']));
  return explicit || String(sequence);
}

function walkStaged(value, context, out, path, sequenceRef, config) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStaged(item, context, out, `${path}[${index}]`, sequenceRef, config));
    return;
  }
  if (!value || typeof value !== 'object') return;
  sequenceRef.value += 1;
  const sequence = sequenceRef.value;
  const attrs = value.attributes && typeof value.attributes === 'object' ? value.attributes : {};
  const type = text(value.type || attrs.TYPE).toUpperCase();
  const hasChildren = Array.isArray(value.children) && value.children.length > 0;
  const branchName = type === 'BRANCH'
    ? text(value.name || attrValue(attrs, ['OWNER', 'BRANCH', 'PIPE']) || context.branchName)
    : context.branchName;
  const directPoint = ownPosition(attrs, value, config);
  const point = directPoint || context.point || null;
  const bore = text(attrValue(attrs, ['ABORE', 'LBORE', 'HBORE', 'BORE']) || value.bore || context.bore);
  const parts = descriptionParts(value, attrs, type, hasChildren);
  const psAliasValue = text(attrValue(attrs, ['PS', 'supportPs', 'psNo']));
  const tags = supportTags([parts.name, parts.description, parts.dtxrPs, parts.labeled, psAliasValue].join(' '));
  const cmpSupGap = text(attrValue(attrs, ['CMPSUPGAP', 'SUPPORT GAP']));
  const isBranchContainer = type === 'BRANCH';
  const isCoordinateContainer = !!directPoint && hasChildren && !parts.description && !parts.dtxrPs;
  if (!isBranchContainer && !isCoordinateContainer && (parts.description || parts.dtxrPs || cmpSupGap) && point) {
    out.push({
      jsonNodeNo: sourceNodeNo(attrs, sequence),
      jsonSequence: sequence,
      branchName,
      branch: canonicalStandaloneDtxrBranch(branchName),
      point,
      bore,
      type,
      description: parts.description,
      dtxrPs: parts.dtxrPs,
      labeled: parts.labeled || parts.description,
      name: parts.name,
      componentRef: parts.componentRef,
      tags,
      cmpSupGap,
      path,
      raw: value,
    });
  }
  if (hasChildren) {
    const next = { branchName, point, bore };
    value.children.forEach((child, index) => walkStaged(child, next, out, `${path}.children[${index}]`, sequenceRef, config));
  }
}

export function buildStandaloneDtxrPositionGroups(stagedJsonText, toleranceMm = 6, config = {}) {
  let parsed;
  try { parsed = typeof stagedJsonText === 'string' ? JSON.parse(stagedJsonText) : stagedJsonText; } catch { return []; }
  const entries = [];
  walkStaged(parsed, { branchName: '', point: null, bore: '' }, entries, '$', { value: 0 }, config);
  const groups = [];
  for (const entry of entries) {
    let selected = null;
    let selectedDistance = Number.POSITIVE_INFINITY;
    for (const group of groups) {
      const sameRoot = group.branch.root === entry.branch.root;
      if (!sameRoot) continue;
      const distance = pointDistanceMm(group.anchor, entry.point);
      if (distance <= toleranceMm && distance < selectedDistance) {
        selected = group;
        selectedDistance = distance;
      }
    }
    if (!selected) {
      selected = {
        id: `DTXR-G${groups.length + 1}`,
        branch: entry.branch,
        anchor: entry.point,
        anchorJsonNodeNo: entry.jsonNodeNo,
        entries: [],
      };
      groups.push(selected);
    }
    selected.entries.push(entry);
  }
  return groups.map((group) => ({
    ...group,
    jsonNodeNos: uniqueValues(group.entries.map((entry) => entry.jsonNodeNo)),
    maxInternalDistanceMm: Math.max(0, ...group.entries.map((entry) => pointDistanceMm(group.anchor, entry.point))),
  }));
}

function attrsFromTag(tag) {
  const attrs = {};
  String(tag || '').replace(/([A-Za-z_][\w:.-]*)\s*=\s*["']([^"']*)["']/g, (_, key, value) => {
    attrs[key] = decodeEntities(value);
    return '';
  });
  return attrs;
}

function firstAttr(attrs, keys) {
  for (const key of keys) if (text(attrs[key])) return text(attrs[key]);
  return '';
}

function findXmlBranchPositions(sourceText) {
  const matches = [];
  const re = /<(Branchname|LineNo|LineKey|BranchName)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = re.exec(sourceText))) matches.push({ name: decodeEntities(match[2]), index: match.index });
  return matches;
}

function activeBranchAt(index, branchPositions) {
  let active = '';
  let bestIndex = -1;
  for (const item of branchPositions) {
    if (item.index < index && item.index > bestIndex) {
      active = item.name;
      bestIndex = item.index;
    }
  }
  return active;
}

function xmlTagValue(body, tagName) {
  const match = body.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? decodeEntities(match[1]) : '';
}

function descriptorFromNodeBlock(body, charIndex, xmlIndex, branchPositions) {
  const positionRaw = xmlTagValue(body, 'Position') || xmlTagValue(body, 'DTXR_POS') || xmlTagValue(body, 'DtxrPos');
  const xmlPoint = parseStandaloneDtxrPoint(positionRaw);
  const nodeNumber = xmlTagValue(body, 'NodeNumber');
  const nodeName = xmlTagValue(body, 'NodeName');
  const componentRefNo = xmlTagValue(body, 'ComponentRefNo');
  const existingPs = xmlTagValue(body, 'DTXR_PS') || xmlTagValue(body, 'DtxrPs');
  return {
    xmlIndex,
    tagName: 'Node',
    attrs: {},
    nodeKeys: [nodeNumber].filter(Boolean),
    xmlNodeNumber: nodeNumber,
    xmlNodeName: nodeName,
    componentType: xmlTagValue(body, 'ComponentType'),
    componentRefNo,
    xmlBranch: activeBranchAt(charIndex, branchPositions),
    branchName: activeBranchAt(charIndex, branchPositions),
    xmlPosition: positionRaw,
    xmlPoint,
    posPoint: xmlPoint,
    posKey: xmlPoint ? pointLabel(xmlPoint) : positionRaw,
    psKey: nodeName || existingPs || componentRefNo,
  };
}

export function parseStandaloneDtxrXmlNodes(sourceText) {
  const source = String(sourceText || '');
  const branchPositions = findXmlBranchPositions(source);
  const nodes = [];
  const nodeBlockRe = /<Node\b[^>]*>([\s\S]*?)<\/Node>/gi;
  let match;
  while ((match = nodeBlockRe.exec(source))) {
    nodes.push(descriptorFromNodeBlock(match[1], match.index, nodes.length + 1, branchPositions));
  }
  if (nodes.length) return nodes;

  const openingTagRe = /<\s*(?!\/|\?|!)(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)\b[^>]*>/g;
  while ((match = openingTagRe.exec(source))) {
    const attrs = attrsFromTag(match[0]);
    const nodeKeys = ['NODE', 'Node', 'node', 'FROM_NODE', 'TO_NODE', 'FromNode', 'ToNode'].map((key) => text(attrs[key])).filter(Boolean);
    const positionRaw = firstAttr(attrs, ['DTXR_POS', 'POS', 'Pos', 'position', 'Position']);
    const xyzPoint = attrs.X !== undefined && attrs.Y !== undefined && attrs.Z !== undefined
      ? parseStandaloneDtxrPoint([attrs.X, attrs.Y, attrs.Z])
      : null;
    const xmlPoint = parseStandaloneDtxrPoint(positionRaw) || xyzPoint;
    const psKey = firstAttr(attrs, ['DTXR_PS', 'PS', 'Ps', 'supportPs', 'psNo']);
    if (!nodeKeys.length && !positionRaw && !xmlPoint && !psKey) continue;
    const directBranch = firstAttr(attrs, ['LINE_ID', 'BRANCH', 'Branchname', 'PIPELINE_REF', 'LINE_NO']);
    nodes.push({
      xmlIndex: nodes.length + 1,
      tagName: match[1],
      attrs,
      nodeKeys,
      xmlNodeNumber: nodeKeys[0] || '',
      xmlNodeName: psKey,
      componentType: firstAttr(attrs, ['ComponentType', 'TYPE', 'Type']),
      componentRefNo: firstAttr(attrs, ['ComponentRefNo', 'COMPONENTREFNO', 'REF']),
      xmlBranch: directBranch || activeBranchAt(match.index, branchPositions),
      branchName: directBranch || activeBranchAt(match.index, branchPositions),
      xmlPosition: positionRaw || (xmlPoint ? pointLabel(xmlPoint) : ''),
      xmlPoint,
      posPoint: xmlPoint,
      posKey: xmlPoint ? pointLabel(xmlPoint) : positionRaw,
      psKey,
    });
  }
  return nodes;
}

function groupCandidate(xmlBranch, xmlPoint, xmlTag, groups, toleranceMm) {
  const candidates = [];
  for (const group of groups) {
    const relationship = standaloneDtxrBranchRelationship(xmlBranch, group.branch.full);
    if (!relationship.compatible) continue;
    const distance = pointDistanceMm(xmlPoint, group.anchor);
    if (distance > toleranceMm) continue;
    const tagMatch = !!xmlTag && group.entries.some((entry) => entry.tags.includes(xmlTag));
    candidates.push({ group, relationship, distance, tagMatch });
  }
  candidates.sort((a, b) => b.relationship.score - a.relationship.score
    || Number(b.tagMatch) - Number(a.tagMatch)
    || a.distance - b.distance
    || a.group.id.localeCompare(b.group.id));
  const best = candidates[0] || null;
  if (!best) return { best: null, ambiguous: false, candidates };
  const second = candidates[1];
  const ambiguous = !!second
    && second.relationship.score === best.relationship.score
    && second.tagMatch === best.tagMatch
    && Math.abs(second.distance - best.distance) < 0.001;
  return { best: ambiguous ? null : best, ambiguous, candidates };
}

function globalPsFallback(xmlBranch, xmlTag, groups) {
  if (!xmlTag) return null;
  const hits = [];
  for (const group of groups) {
    const relationship = standaloneDtxrBranchRelationship(xmlBranch, group.branch.full);
    if (!relationship.compatible) continue;
    for (const entry of group.entries) {
      if (entry.tags.includes(xmlTag)) hits.push({ group, entry, relationship });
    }
  }
  hits.sort((a, b) => b.relationship.score - a.relationship.score
    || Number(a.entry.jsonSequence) - Number(b.entry.jsonSequence));
  if (!hits.length) return null;
  if (hits.length === 1) return hits[0];
  const top = hits[0];
  const second = hits[1];
  return top.relationship.score > second.relationship.score ? top : null;
}

function supportKinds(value) {
  const source = text(value).toUpperCase();
  const kinds = [];
  if (/\b(PIPE\s*STOP|LINE\s*STOP|LINESTOP|LIMIT)\b/.test(source)) kinds.push('LINESTOP');
  if (/\bGUIDE\b/.test(source)) kinds.push('GUIDE');
  if (/\b(ANCHOR|FIXED)\b/.test(source)) kinds.push('ANCHOR');
  if (/\b(REST|PIPE\s*REST|WEAR\s*PLATE|SHOE)\b/.test(source)) kinds.push('REST');
  return uniqueValues(kinds);
}

function recordForNode(node, groups, toleranceMm) {
  const xmlTag = normalizeSupportTag(node.xmlNodeName || node.psKey || node.componentRefNo);
  const selected = node.xmlPoint
    ? groupCandidate(node.xmlBranch, node.xmlPoint, xmlTag, groups, toleranceMm)
    : { best: null, ambiguous: false, candidates: [] };
  const positional = selected.best;
  const group = positional?.group || null;
  const dtxrPosValues = group ? uniqueValues(group.entries.map((entry) => entry.labeled || entry.description)) : [];
  const psEntry = group?.entries.find((entry) => xmlTag && entry.tags.includes(xmlTag)) || null;
  const fallback = !psEntry ? globalPsFallback(node.xmlBranch, xmlTag, groups) : null;
  const effectivePsEntry = psEntry || fallback?.entry || null;
  const dtxrPsValue = effectivePsEntry ? text(effectivePsEntry.dtxrPs || effectivePsEntry.description) : '';
  const dtxrPosValue = dtxrPosValues.join(' | ');
  const effectiveDtxr = dtxrPosValue || dtxrPsValue;
  const effectiveSource = dtxrPosValue ? 'DTXR_POS' : (dtxrPsValue ? 'DTXR_PS_FALLBACK' : 'NONE');
  const fallbackUsed = effectiveSource === 'DTXR_PS_FALLBACK';
  const matchType = selected.ambiguous
    ? 'POS_AMBIGUOUS'
    : (dtxrPosValue && dtxrPsValue ? 'POS_PS' : (dtxrPosValue ? 'POS' : (dtxrPsValue ? 'PS_FALLBACK' : 'NONE')));
  const status = selected.ambiguous
    ? 'AMBIGUOUS_REVIEW'
    : (matchType === 'POS_PS' ? 'RESOLVED_POS_PS'
      : (matchType === 'POS' ? 'RESOLVED_POS'
        : (matchType === 'PS_FALLBACK' ? 'RESOLVED_PS_FALLBACK' : 'UNRESOLVED')));
  const relationship = positional?.relationship || fallback?.relationship || null;
  const selectedGroup = group || fallback?.group || null;
  const members = group?.entries || (fallback ? [fallback.entry] : []);
  return {
    schema: LEDGER_SCHEMA,
    xmlIndex: node.xmlIndex,
    xmlNodeNumber: node.xmlNodeNumber,
    nodeNumber: node.xmlNodeNumber,
    xmlNodeName: node.xmlNodeName,
    nodeName: node.xmlNodeName,
    componentType: node.componentType,
    componentRefNo: node.componentRefNo,
    xmlBranch: node.xmlBranch,
    branchName: node.xmlBranch,
    xmlPosition: node.xmlPosition,
    xmlPoint: node.xmlPoint,
    sourceKind: 'staged-json',
    sourceBranch: selectedGroup?.branch?.original || '',
    stagedBranch: selectedGroup?.branch?.original || '',
    branchRelationship: relationship?.method || '',
    coordinateToleranceMm: toleranceMm,
    toleranceMm,
    matchedPosition: selectedGroup?.anchor || null,
    positionDistanceMm: positional?.distance ?? null,
    distanceMm: positional?.distance ?? null,
    maxInternalDistanceMm: selectedGroup?.maxInternalDistanceMm ?? null,
    dtxrPosNodeNumbers: group ? group.jsonNodeNos : [],
    dtxrPsNodeNumbers: effectivePsEntry ? [effectivePsEntry.jsonNodeNo] : [],
    positionMembers: members.map((entry) => ({
      jsonNodeNo: entry.jsonNodeNo,
      sourcePath: entry.path,
      branchName: entry.branchName,
      bore: entry.bore,
      point: entry.point,
      type: entry.type,
      name: entry.name,
      dtxrPosValue: entry.labeled || entry.description,
      dtxrPsValue: entry.dtxrPs || '',
      cmpSupGap: entry.cmpSupGap,
    })),
    sourcePaths: members.map((entry) => entry.path),
    dtxrPosValue,
    dtxrPos: dtxrPosValue,
    dtxrPosValues,
    dtxrPsName: xmlTag,
    dtxrPsValue,
    dtxrPs: dtxrPsValue,
    effectiveDtxr,
    effectiveSource,
    fallbackUsed,
    derivedSupportTypes: supportKinds(effectiveDtxr),
    matchType,
    status,
    candidateCount: selected.candidates.length,
    groupId: selectedGroup?.id || '',
  };
}

function inferPositionOffset(nodes, groups, config = {}) {
  if (configuredPositionOffset(config)) return null;
  const precision = Math.max(Number(config?.resolverJsonTrace?.autoCalibratePrecision) || 0.1, 0.001);
  const minVotes = Math.max(Math.round(Number(config?.resolverJsonTrace?.autoCalibrateMinSamples) || 2), 1);
  const buckets = new Map();
  for (const node of nodes) {
    if (!node.xmlPoint) continue;
    for (const group of groups) {
      const relationship = standaloneDtxrBranchRelationship(node.xmlBranch, group.branch.full);
      if (!relationship.compatible) continue;
      const offset = {
        x: node.xmlPoint.x - group.anchor.x,
        y: node.xmlPoint.y - group.anchor.y,
        z: node.xmlPoint.z - group.anchor.z,
      };
      const key = [offset.x, offset.y, offset.z].map((value) => Math.round(value / precision)).join('|');
      const bucket = buckets.get(key) || { count: 0, x: 0, y: 0, z: 0 };
      bucket.count += 1;
      bucket.x += offset.x;
      bucket.y += offset.y;
      bucket.z += offset.z;
      buckets.set(key, bucket);
    }
  }
  const best = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!best || best.count < minVotes) return null;
  return { x: best.x / best.count, y: best.y / best.count, z: best.z / best.count, votes: best.count };
}

function applyGroupOffset(groups, offset) {
  if (!offset) return groups;
  return groups.map((group) => ({
    ...group,
    anchor: offsetPoint(group.anchor, offset),
    entries: group.entries.map((entry) => ({ ...entry, point: offsetPoint(entry.point, offset) })),
  }));
}

export function buildStandaloneDtxrResolutionLedger(sourceText, stagedJsonText, config = {}) {
  const toleranceMm = toleranceFromConfig(config);
  const nodes = parseStandaloneDtxrXmlNodes(sourceText);
  let groups = buildStandaloneDtxrPositionGroups(stagedJsonText, toleranceMm, config);
  let records = nodes.map((node) => recordForNode(node, groups, toleranceMm));
  let calibration = null;
  if (!records.some((record) => record.effectiveSource === 'DTXR_POS')) {
    calibration = inferPositionOffset(nodes, groups, config);
    if (calibration) {
      groups = applyGroupOffset(groups, calibration);
      records = nodes.map((node) => recordForNode(node, groups, toleranceMm));
    }
  }
  const diagnostics = [
    { type: 'trace-resolution-ledger', schema: LEDGER_SCHEMA, rows: records.length },
    { type: 'trace-resolution-position-groups', groups: groups.length, toleranceMm },
    { type: 'trace-resolution-status-counts', counts: records.reduce((out, record) => { out[record.status] = (out[record.status] || 0) + 1; return out; }, {}) },
  ];
  if (calibration) diagnostics.push({ type: 'trace-resolution-auto-position-offset', ...calibration });
  for (const record of records) {
    if (record.status !== 'UNRESOLVED' || record.xmlNodeName || record.xmlPoint) diagnostics.push({ type: 'standalone-dtxr-node-resolution', ...record });
  }
  return {
    schema: LEDGER_SCHEMA,
    sourceKind: 'staged-json',
    toleranceMm,
    nodes,
    groups,
    records,
    ledger: records,
    calibration,
    diagnostics,
  };
}

export { LEDGER_SCHEMA as TRACE_RESOLUTION_LEDGER_SCHEMA };
