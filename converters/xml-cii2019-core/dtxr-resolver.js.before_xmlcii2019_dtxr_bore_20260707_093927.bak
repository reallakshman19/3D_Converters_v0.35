function toText(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function xmlLocalName(node) {
  return toText(node?.localName || node?.nodeName).replace(/^.*:/, '');
}

function xmlChildrenByName(parent, localName) {
  return [...(parent?.childNodes || [])].filter((child) => child.nodeType === 1 && xmlLocalName(child) === localName);
}

function xmlFirstChild(parent, localName) {
  return xmlChildrenByName(parent, localName)[0] || null;
}

function xmlText(parent, localName) {
  return toText(xmlFirstChild(parent, localName)?.textContent).trim();
}

function xmlSetText(document, parent, localName, value) {
  if (!document || !parent || !toText(localName)) return null;
  let element = xmlFirstChild(parent, localName);
  if (!element) {
    element = parent?.namespaceURI ? document.createElementNS(parent.namespaceURI, localName) : document.createElement(localName);
    parent.appendChild(element);
  }
  element.textContent = toText(value);
  return element;
}

export function getXmlNodeProperty(node, name) {
  if (!node) return '';
  if (typeof node.querySelector === 'function') return node.querySelector(name)?.textContent?.trim() || '';
  if (typeof node.getElementsByTagName === 'function') return xmlText(node, name);
  return String(node[name] ?? node[name.toLowerCase()] ?? node[name.toUpperCase()] ?? '').trim();
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
  const parts = [];
  if (typeof node?.getElementsByTagName === 'function') {
    parts.push(xmlText(node, 'NodeName'), xmlText(node, 'ComponentRefNo'));
    for (const child of xmlChildrenByName(node, 'SupportTag')) parts.push(toText(child.textContent));
  } else {
    parts.push(getXmlNodeProperty(node, 'NodeName'), getXmlNodeProperty(node, 'ComponentRefNo'));
    const tagsVal = node?.SupportTag || node?.supportTag || '';
    if (Array.isArray(tagsVal)) parts.push(...tagsVal.map(toText));
    else if (tagsVal) parts.push(toText(tagsVal));
  }
  return [...new Set(parts.flatMap(supportTagsFromText))];
}

function parseNumericMm(value) {
  const text = toText(value).replace(/mm/gi, ' ').trim();
  if (!text) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizePoint(point) {
  if (point === undefined || point === null || point === '') return null;
  if (Array.isArray(point) && point.length >= 3) {
    const x = Number(point[0]);
    const y = Number(point[1]);
    const z = Number(point[2]);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
  }
  if (typeof point === 'object') {
    const x = Number(point.x ?? point.X);
    const y = Number(point.y ?? point.Y);
    const z = Number(point.z ?? point.Z);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
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

function decodeEntities(value) {
  return toText(value).replace(/&quot;/gi, '"').replace(/&#34;/g, '"').replace(/&apos;/gi, "'").replace(/&#39;/g, "'").replace(/&amp;/gi, '&');
}

function normalizeOwnerBranchName(value) {
  return decodeEntities(value)
    .replace(/<\/?Branchname[^>]*>/gi, '')
    .replace(/^\s*=\s*/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\s+/g, '')
    .replace(/\/B0*(\d+)$/i, '/B$1')
    .replace(/^\/*/, '/')
    .toUpperCase();
}

function ownerBranchVariants(value) {
  const full = normalizeOwnerBranchName(value);
  const variants = new Set();
  if (full) variants.add(full);
  if (full.endsWith('/')) variants.add(full.slice(0, -1));
  const noBranch = full.replace(/\/B\d+$/i, '');
  if (noBranch && noBranch !== full) variants.add(noBranch);
  const noQuotes = full.replace(/["']/g, '');
  if (noQuotes && noQuotes !== full) variants.add(noQuotes);
  const noQuotesNoBranch = noQuotes.replace(/\/B\d+$/i, '');
  if (noQuotesNoBranch && noQuotesNoBranch !== noQuotes) variants.add(noQuotesNoBranch);
  return [...variants].filter(Boolean);
}

function ownerBranchSimilarity(left, right) {
  const a = ownerBranchVariants(left)[0] || '';
  const b = ownerBranchVariants(right)[0] || '';
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aNoB = a.replace(/\/B\d+$/i, '');
  const bNoB = b.replace(/\/B\d+$/i, '');
  if (aNoB && aNoB === bNoB) return 0.98;
  const aNoQ = aNoB.replace(/["']/g, '');
  const bNoQ = bNoB.replace(/["']/g, '');
  if (aNoQ && aNoQ === bNoQ) return 0.95;
  const aTokens = aNoQ.split('-').filter(Boolean);
  const bTokens = new Set(bNoQ.split('-').filter(Boolean));
  if (!aTokens.length || !bTokens.size) return 0;
  const common = aTokens.filter((token) => bTokens.has(token)).length;
  return common / Math.max(aTokens.length, bTokens.size);
}

function walkStagedComponents(value, branchName = '', out = [], _path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, idx) => walkStagedComponents(item, branchName, out, `${_path}[${idx}]`));
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  const attrs = value.attributes && typeof value.attributes === 'object' ? value.attributes : {};
  const type = toText(value.type || attrs.TYPE).toUpperCase();
  const currentBranch = (type === 'BRANCH' || Array.isArray(value.children)) ? toText(value.name || attrs.NAME || attrs.OWNER || branchName) : branchName;
  out.push({ component: value, attrs, branchName: currentBranch, type, _path });
  if (Array.isArray(value.children)) value.children.forEach((child, idx) => walkStagedComponents(child, currentBranch, out, `${_path}.children[${idx}]`));
  return out;
}

function stagedAttr(indexed, names = []) {
  const attrs = indexed?.attrs || indexed?.raw?.attrs || {};
  for (const wanted of names) {
    const upper = toText(wanted).toUpperCase();
    for (const [key, value] of Object.entries(attrs)) {
      if (toText(key).toUpperCase() === upper && toText(value).trim()) return toText(value).trim();
    }
  }
  return '';
}

function stagedComponentDtxr(indexed) {
  const attrs = indexed?.attrs || {};
  return toText(attrs.DTXR_POS || attrs.DTXR || attrs.DESC || attrs.DESCRIPTION || attrs.NAME || indexed?.component?.name || '').trim();
}

function stagedComponentDtxrPs(indexed) {
  const attrs = indexed?.attrs || {};
  return stagedAttr({ attrs }, ['DTXR_PS', 'DTXRPS', 'DTXR', 'DESC', 'DESCRIPTION']);
}

function stagedOwnerValue(indexed) {
  const attrs = indexed?.attrs || {};
  return toText(attrs.OWNER || attrs.Owner || attrs.owner || indexed?.component?.OWNER || indexed?.branchName || '').trim();
}

function cleanDtxr(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/[;,/|]+/g, '+').replace(/\++/g, '+').replace(/^\+|\+$/g, '').trim().toUpperCase();
}

function canonKey(value) {
  return String(value ?? '').trim().replace(/\s+/g, '').replace(/^=/, '').toUpperCase();
}

function coordKey(coord, precision = 1) {
  if (!coord) return '';
  return [coord.x, coord.y, coord.z].map((v) => Math.round(v / precision)).join('|');
}

function addArrayMap(map, key, item) {
  const cleaned = canonKey(key);
  if (!cleaned) return;
  if (!map.has(cleaned)) map.set(cleaned, []);
  map.get(cleaned).push(item);
}

function addOwnerIndex(map, item, owner) {
  for (const key of ownerBranchVariants(owner)) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
}

function stagedTypeOf(indexed) {
  return toText(indexed?.type || indexed?.raw?.type || indexed?.attrs?.TYPE || indexed?.attrs?.ComponentType || indexed?.attrs?.COMPONENTTYPE || indexed?.component?.type || '').trim().toUpperCase();
}

export function buildStagedDtxrIndex(stagedJson, config = {}) {
  let walked = [];
  try {
    const parsed = typeof stagedJson === 'string' ? JSON.parse(stagedJson) : stagedJson;
    walked = walkStagedComponents(parsed);
  } catch {}

  const byComponentRefNo = new Map();
  const byPsTag = new Map();
  const byPsBaseTag = new Map();
  const byNodeNumber = new Map();
  const byNodeName = new Map();
  const byCoordKey = new Map();
  const byOwnerBranch = new Map();
  const ownerItems = [];
  const items = [];

  for (const item of walked) {
    const dtxr = stagedComponentDtxr(item);
    const dtxrPs = stagedComponentDtxrPs(item);
    const cmpSupGap = stagedAttr(item, ['CMPSUPGAP']);
    if (!dtxr && !dtxrPs && !cmpSupGap) continue;

    const attrs = item.attrs || {};
    const indexedItem = {
      raw: item,
      attrs,
      dtxr,
      dtxrPs,
      cmpSupGap,
      owner: stagedOwnerValue(item),
      ownerNorm: normalizeOwnerBranchName(stagedOwnerValue(item)),
      coord: null,
      type: stagedTypeOf(item),
      component: item.component,
      _path: item._path || '',
      _jsonSeq: items.length,
    };
    items.push(indexedItem);

    for (const ref of [attrs.ComponentRefNo, attrs.COMPONENTREFNO, attrs.componentRefNo, attrs.RefNo, attrs.REFNO, attrs.REF, attrs.NAME, item.componentRefNo, item.refNo, item.component?.refNo]) addArrayMap(byComponentRefNo, ref, indexedItem);
    for (const tag of supportTagsFromAttrs(attrs, item.component?.name || '')) {
      addArrayMap(byPsTag, tag, indexedItem);
      const baseTag = supportTagBase(tag);
      if (baseTag) addArrayMap(byPsBaseTag, baseTag, indexedItem);
    }

    const nodeNo = attrs.NodeNumber || attrs.NODE || '';
    if (nodeNo) byNodeNumber.set(String(nodeNo).trim(), indexedItem);
    const nodeName = attrs.NodeName || '';
    if (nodeName) byNodeName.set(canonKey(nodeName), indexedItem);

    if (indexedItem.ownerNorm && indexedItem.dtxrPs) {
      ownerItems.push(indexedItem);
      addOwnerIndex(byOwnerBranch, indexedItem, indexedItem.owner);
    }

    let coord = null;
    for (const key of ['SUPPORTCOORD', 'POS', 'POSI', 'BPOS', 'APOS', 'LPOS', 'CPOS', 'HPOS', 'TPOS']) {
      const rawCoord = normalizePoint(attrs[key]);
      coord = key === 'POSI' ? xmlCiiApplyDtxrPositionOffset(rawCoord, config) : rawCoord;
      if (coord) break;
    }
    if (coord) {
      indexedItem.coord = coord;
      const precisionKey = coordKey(coord, config.coordinatePrecision ?? 1);
      if (!byCoordKey.has(precisionKey)) byCoordKey.set(precisionKey, []);
      byCoordKey.get(precisionKey).push(indexedItem);
    }
  }

  return { items, byComponentRefNo, byPsTag, byPsBaseTag, byNodeNumber, byNodeName, byCoordKey, byOwnerBranch, ownerItems };
}

export function buildDtxrContext(stagedJsonText, config = {}) {
  const stagedIndex = buildStagedDtxrIndex(stagedJsonText, config);
  return { stagedIndex, ...stagedIndex };
}

function chooseBestDtxrCandidate(candidates, xmlNode, config = {}) {
  const list = (Array.isArray(candidates) ? candidates : []).filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const xmlType = getXmlNodeProperty(xmlNode, 'ComponentType').toUpperCase();
  for (const cand of list) if (stagedTypeOf(cand) && stagedTypeOf(cand) === xmlType) return cand;
  const allowed = config?._allowedStagedTypes || [];
  if (allowed.length) {
    const typed = list.find((cand) => allowed.includes(stagedTypeOf(cand)));
    if (typed) return typed;
  }
  return list[0];
}

function candidateArrayFromMap(map, key) {
  if (!map || !key) return [];
  const direct = map.get(canonKey(key));
  return Array.isArray(direct) ? direct : (direct ? [direct] : []);
}

function sameDtxrPositionEvidence(xmlNode, indexed, config = {}) {
  const xmlDtxrPos = cleanDtxr(getXmlNodeProperty(xmlNode, 'DTXR_POS') || getXmlNodeProperty(xmlNode, 'DtxrPos'));
  const stagedDtxrPos = cleanDtxr(indexed?.dtxr || stagedComponentDtxr(indexed?.raw || indexed) || '');
  if (xmlDtxrPos && stagedDtxrPos && xmlDtxrPos === stagedDtxrPos) return true;

  const xmlPoint = normalizePoint(getXmlNodeProperty(xmlNode, 'Position'));
  const stagedPoint = indexed?.coord || null;
  if (!xmlPoint || !stagedPoint) return false;
  const tolerances = [
    toFiniteNumber(config?.dtxrPositionOffset?.tolerance, null),
    toFiniteNumber(config?.dtxrCoordinateToleranceMm, null),
    toFiniteNumber(config?.coordinateTolerance, 1),
  ].filter(Number.isFinite);
  const tolerance = Math.max(...tolerances, 0);
  return xmlCiiPositionsMatch(xmlPoint, stagedPoint, tolerance || 1);
}

function relaxedPsTagCandidates(stagedIndex, xmlNode, tag, config = {}) {
  const baseTag = supportTagBase(tag);
  if (!baseTag || baseTag === normalizeSupportTag(tag)) return [];
  return candidateArrayFromMap(stagedIndex?.byPsBaseTag, baseTag)
    .filter((candidate) => sameDtxrPositionEvidence(xmlNode, candidate, config));
}

function emptyDtxrResult(reason = 'not-found') {
  return { canonicalText: '', value: '', dtxrPos: '', dtxrPs: '', teeDesc: '', cmpSupGap: '', supportTags: [], source: reason, matchedBy: '', matchedKey: '', stagedType: '', componentRefNo: '', confidence: 0, suppressed: false, suppressionReason: '', candidates: [] };
}

function resultFromStagedItem(indexed, { source, matchedBy, matchedKey, purpose, confidence = 1 } = {}) {
  const dtxrPos = cleanDtxr(indexed?.dtxr || stagedComponentDtxr(indexed?.raw || indexed) || '');
  const dtxrPs = cleanDtxr(indexed?.dtxrPs || stagedComponentDtxrPs(indexed?.raw || indexed) || '');
  const cmpSupGap = toText(indexed?.cmpSupGap || stagedAttr(indexed?.raw || indexed, ['CMPSUPGAP']) || '').trim();
  const stagedType = stagedTypeOf(indexed);
  const canonicalText = purpose === 'support-restraint' ? (dtxrPs || dtxrPos) : (dtxrPos || dtxrPs);
  return { ...emptyDtxrResult(source || 'staged'), canonicalText, value: canonicalText, dtxrPos, dtxrPs, teeDesc: purpose === 'tee-description' ? dtxrPos : '', cmpSupGap, supportTags: [], source: source || 'staged', matchedBy: matchedBy || '', matchedKey: String(matchedKey || ''), stagedType, componentRefNo: toText(indexed?.attrs?.ComponentRefNo || indexed?.attrs?.COMPONENTREFNO || '').trim(), confidence, _sourcePath: indexed?._path || '' };
}

function resultFromExistingXml(xmlNode, { purpose, source, matchedBy, confidence = 0.75 } = {}) {
  const nodeNumber = getXmlNodeProperty(xmlNode, 'NodeNumber');
  const dtxrPos = cleanDtxr(getXmlNodeProperty(xmlNode, 'DTXR_POS') || getXmlNodeProperty(xmlNode, 'DtxrPos'));
  const dtxrPs = cleanDtxr(getXmlNodeProperty(xmlNode, 'DTXR_PS') || getXmlNodeProperty(xmlNode, 'DtxrPs'));
  const canonicalText = purpose === 'support-restraint' ? (dtxrPs || dtxrPos) : (dtxrPos || dtxrPs);
  if (!canonicalText) return null;
  return { ...emptyDtxrResult(source || 'xml-existing'), canonicalText, value: canonicalText, dtxrPos, dtxrPs, source: source || (dtxrPs ? 'xml-dtxr-ps' : 'xml-dtxr-pos'), matchedBy: matchedBy || (dtxrPs ? 'xml-dtxr-ps' : 'xml-dtxr-pos'), matchedKey: `NodeNumber:${nodeNumber}`, confidence };
}

export const DTXR_PURPOSE_RULES = Object.freeze({
  'weight-review': { allowExistingXmlDtxr: true, allowComponentRef: true, allowPsTag: false, allowNodeNumber: false, allowNodeNameAsDtxr: false, allowCoordinate: true, allowNearestCoordinate: false, allowOwnerFallback: false, allowedStagedTypes: ['RIGID', 'FLAN', 'FLANGE', 'VALV', 'VALVE', 'VLV'], suppressTextPatterns: [/\bTEE\b/i, /\bELBOW\b|\bBEND\b/i, /\bPIPE\s*REST\b|\bSUPPORT\b|\bGUIDE\b|\bSTOP\b|\bWEAR\s*PLATE\b/i, /\bRESTRAINT\b|\bSHOE\b|\bANCHOR\b|\bLINE\s*STOP\b/i] },
  'tee-description': { allowExistingXmlDtxr: true, allowComponentRef: true, allowPsTag: false, allowNodeNumber: true, allowNodeNameAsDtxr: true, allowCoordinate: true, allowNearestCoordinate: true, allowOwnerFallback: true, allowedStagedTypes: ['TEE'], suppressTextPatterns: [/\bPIPE\s*REST\b|\bSUPPORT\b|\bGUIDE\b|\bSTOP\b|\bWEAR\s*PLATE\b/i] },
  'support-restraint': { allowExistingXmlDtxr: true, allowComponentRef: true, allowPsTag: true, allowNodeNumber: true, allowNodeNameAsDtxr: true, allowCoordinate: true, allowNearestCoordinate: true, allowOwnerFallback: true, allowedStagedTypes: ['SUPPORT', 'ATTA', 'REST', 'RESTRAINT'], suppressTextPatterns: [] },
  'component-description': { allowExistingXmlDtxr: true, allowComponentRef: true, allowPsTag: false, allowNodeNumber: true, allowNodeNameAsDtxr: true, allowCoordinate: true, allowNearestCoordinate: false, allowOwnerFallback: false, allowedStagedTypes: [], suppressTextPatterns: [] },
});

export function dtxrPurposeForComponentType(componentType, fallback = 'component-description') {
  const type = toText(componentType).trim().toUpperCase();
  if (type === 'TEE') return 'tee-description';
  if (['ATTA', 'REST', 'RESTRAINT', 'SUPPORT'].includes(type)) return 'support-restraint';
  if (type === 'RIGID' || /^FLAN/.test(type) || ['VALV', 'VALVE', 'VLV'].includes(type)) return 'component-description';
  return fallback;
}

function suppressIfUnsafe(result, { xmlNode, purpose, rules }) {
  if (!result || (!result.canonicalText && !result.dtxrPs && !result.dtxrPos && !result.cmpSupGap)) return result;
  const xmlType = getXmlNodeProperty(xmlNode, 'ComponentType').toUpperCase();
  const stagedType = toText(result.stagedType).toUpperCase();
  const text = toText(result.canonicalText || result.dtxrPos || result.dtxrPs).toUpperCase();
  const allowed = Array.isArray(rules?.allowedStagedTypes) ? rules.allowedStagedTypes : [];
  const badStagedType = !!stagedType && allowed.length > 0 && !allowed.includes(stagedType) && result.matchedBy !== 'component-refno';
  const unsafeStagedForWeight = purpose === 'weight-review' && ['RIGID', 'FLAN', 'VALV', 'VALVE', 'VLV'].some((prefix) => xmlType === prefix || xmlType.startsWith(prefix)) && ['TEE', 'ELBO', 'ELBOW', 'BEND', 'SUPPORT', 'ATTA', 'PIPE', 'GASK'].includes(stagedType) && result.matchedBy !== 'component-refno';
  const unsafeText = Array.isArray(rules?.suppressTextPatterns) && rules.suppressTextPatterns.some((re) => re.test(text));
  if (badStagedType || unsafeStagedForWeight || unsafeText) return { ...result, canonicalText: '', value: '', suppressed: true, suppressionReason: badStagedType ? `unsafe staged type ${stagedType} for ${purpose}` : (unsafeStagedForWeight ? `unsafe staged type ${stagedType} for ${purpose}` : `text suppressed for ${purpose}`) };
  return result;
}

function dtxrPsByOwnerBranch(branchName, stagedIndex, config = {}) {
  if (!branchName || !stagedIndex?.byOwnerBranch) return null;
  for (const key of ownerBranchVariants(branchName)) {
    const exact = stagedIndex.byOwnerBranch.get(key);
    if (exact?.length) return resultFromStagedItem(exact[0], { purpose: 'support-restraint', source: 'staged-owner-dtxr-ps', matchedBy: 'owner-branch', matchedKey: `OWNER:${exact[0].owner}`, confidence: 1 });
  }
  const threshold = toFiniteNumber(config.dtxrOwnerFuzzyThreshold, 0.86);
  let best = null;
  for (const item of stagedIndex.ownerItems || []) {
    const score = ownerBranchSimilarity(branchName, item.owner);
    if (score >= threshold && (!best || score > best.score)) best = { item, score };
  }
  return best ? resultFromStagedItem(best.item, { purpose: 'support-restraint', source: 'staged-owner-dtxr-ps-fuzzy', matchedBy: 'owner-branch-fuzzy', matchedKey: `OWNER:${best.item.owner} · ${Math.round(best.score * 100)}%`, confidence: best.score }) : null;
}

function xmlAncestorBranchName(node) {
  let current = node?.parentNode || null;
  while (current) {
    if (current.nodeType === 1 && xmlLocalName(current) === 'Branch') return xmlText(current, 'Branchname');
    current = current.parentNode || null;
  }
  return '';
}

function findNearestCoordinateMatch(target, items, tolerance) {
  let nearestItem = null;
  let nearestDist = Infinity;
  for (const item of items || []) {
    let itemCoord = item.coord;
    if (!itemCoord) {
      const attrs = item.attrs || {};
      for (const key of ['SUPPORTCOORD', 'POS', 'POSI', 'BPOS', 'APOS', 'LPOS', 'CPOS', 'HPOS', 'TPOS']) {
        itemCoord = normalizePoint(attrs[key]);
        if (itemCoord) break;
      }
    }
    if (!itemCoord) continue;
    const dx = itemCoord.x - target.x;
    const dy = itemCoord.y - target.y;
    const dz = itemCoord.z - target.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist <= tolerance && dist < nearestDist) { nearestDist = dist; nearestItem = item; }
  }
  return nearestItem ? { item: nearestItem, distanceMm: nearestDist } : null;
}

export function resolveDtxrForXmlNode({ xmlNode, context, purpose = 'component-description', config = {}, trustExistingXmlDtxr = true } = {}) {
  const rules = DTXR_PURPOSE_RULES[purpose] || DTXR_PURPOSE_RULES['component-description'];
  const stagedIndex = context?.stagedIndex || context;
  if (!xmlNode) return emptyDtxrResult('not-found');
  const attempts = [];
  const accept = (result) => {
    if (!result) return null;
    const checked = suppressIfUnsafe(result, { xmlNode, purpose, rules });
    attempts.push(checked);
    return checked.suppressed ? null : checked;
  };
  const xmlType = getXmlNodeProperty(xmlNode, 'ComponentType').toUpperCase();
  const allowStagedConfig = { ...config, _allowedStagedTypes: rules.allowedStagedTypes || [] };

  const resolveByPsTags = () => {
    if (!rules.allowPsTag || !stagedIndex) return null;
    const tags = xmlNodeSupportTags(xmlNode);
    for (const tag of tags) {
      const byPs = chooseBestDtxrCandidate(candidateArrayFromMap(stagedIndex.byPsTag, tag), xmlNode, allowStagedConfig);
      if (byPs) {
        const hit = accept(resultFromStagedItem(byPs, { purpose, source: 'staged-ps-tag', matchedBy: 'ps-tag', matchedKey: tag, confidence: 1 }));
        if (hit) return { ...hit, supportTags: tags, candidates: attempts };
      }
    }
    for (const tag of tags) {
      const byRelaxedPs = chooseBestDtxrCandidate(relaxedPsTagCandidates(stagedIndex, xmlNode, tag, config), xmlNode, allowStagedConfig);
      if (byRelaxedPs) {
        const hit = accept(resultFromStagedItem(byRelaxedPs, { purpose, source: 'staged-ps-tag-relaxed-same-dtxr-pos', matchedBy: 'ps-tag-relaxed-same-dtxr-pos', matchedKey: `${tag} -> ${supportTagBase(tag)}`, confidence: 0.95 }));
        if (hit) return { ...hit, supportTags: tags, candidates: attempts };
      }
    }
    if (purpose === 'support-restraint' && tags.length) return { ...emptyDtxrResult('not-found'), stagedType: xmlType, supportTags: tags, matchedBy: 'ps-tag', matchedKey: tags.join('|'), candidates: attempts };
    return null;
  };

  const psHit = resolveByPsTags();
  if (psHit) return psHit;

  if (rules.allowComponentRef && stagedIndex) {
    const componentRefNo = getXmlNodeProperty(xmlNode, 'ComponentRefNo');
    const byRef = chooseBestDtxrCandidate(candidateArrayFromMap(stagedIndex.byComponentRefNo, componentRefNo), xmlNode, allowStagedConfig);
    if (byRef) {
      const hit = accept(resultFromStagedItem(byRef, { purpose, source: 'staged-component-refno', matchedBy: 'component-refno', matchedKey: componentRefNo, confidence: 1 }));
      if (hit) return { ...hit, supportTags: xmlNodeSupportTags(xmlNode), candidates: attempts };
    }
  }

  if (rules.allowCoordinate && stagedIndex) {
    const coord = normalizePoint(getXmlNodeProperty(xmlNode, 'Position'));
    if (coord) {
      const precisionKey = coordKey(coord, config.coordinatePrecision ?? 1);
      const exact = chooseBestDtxrCandidate(stagedIndex.byCoordKey?.get(precisionKey) || [], xmlNode, allowStagedConfig);
      if (exact) {
        const hit = accept(resultFromStagedItem(exact, { purpose, source: 'staged-coordinate-key', matchedBy: 'coordinate', matchedKey: precisionKey, confidence: 0.9 }));
        if (hit) return { ...hit, supportTags: xmlNodeSupportTags(xmlNode), candidates: attempts };
      }
      if (rules.allowNearestCoordinate) {
        const nearest = findNearestCoordinateMatch(coord, stagedIndex.items, config.dtxrCoordinateToleranceMm ?? 2.0);
        if (nearest) {
          const hit = accept(resultFromStagedItem(nearest.item, { purpose, source: 'staged-nearest-coordinate', matchedBy: 'nearest-coordinate', matchedKey: `${nearest.distanceMm.toFixed(3)} mm`, confidence: 0.65 }));
          if (hit) return { ...hit, supportTags: xmlNodeSupportTags(xmlNode), candidates: attempts };
        }
      }
    }
  }

  if (trustExistingXmlDtxr && rules.allowExistingXmlDtxr !== false) {
    const hit = accept(resultFromExistingXml(xmlNode, { purpose }));
    if (hit) return { ...hit, supportTags: xmlNodeSupportTags(xmlNode), candidates: attempts };
  }

  if (rules.allowNodeNumber && stagedIndex) {
    const nodeNumber = getXmlNodeProperty(xmlNode, 'NodeNumber');
    const byNode = nodeNumber ? stagedIndex.byNodeNumber?.get(nodeNumber) : null;
    if (byNode) {
      const hit = accept(resultFromStagedItem(byNode, { purpose, source: 'staged-node-number', matchedBy: 'node-number', matchedKey: nodeNumber, confidence: 0.75 }));
      if (hit) return { ...hit, supportTags: xmlNodeSupportTags(xmlNode), candidates: attempts };
    }
  }

  if (rules.allowNodeNameAsDtxr && stagedIndex) {
    const nodeName = getXmlNodeProperty(xmlNode, 'NodeName');
    const byName = nodeName ? stagedIndex.byNodeName?.get(canonKey(nodeName)) : null;
    if (byName) {
      const hit = accept(resultFromStagedItem(byName, { purpose, source: 'staged-node-name', matchedBy: 'node-name', matchedKey: nodeName, confidence: 0.7 }));
      if (hit) return { ...hit, supportTags: xmlNodeSupportTags(xmlNode), candidates: attempts };
    }
  }

  if (rules.allowOwnerFallback && stagedIndex) {
    const hit = accept(dtxrPsByOwnerBranch(xmlAncestorBranchName(xmlNode), stagedIndex, config));
    if (hit) return { ...hit, supportTags: xmlNodeSupportTags(xmlNode), candidates: attempts };
  }

  return { ...emptyDtxrResult('not-found'), stagedType: xmlType, supportTags: xmlNodeSupportTags(xmlNode), candidates: attempts };
}

export function applyDtxrAnnotations(document, node, resolved, purpose = 'component-description') {
  if (!document || !node || !resolved || resolved.suppressed) return 0;
  let count = 0;
  if (purpose === 'tee-description') {
    const text = resolved.teeDesc || resolved.dtxrPos || resolved.canonicalText;
    if (text) { xmlSetText(document, node, 'TEEDESC_POS', text); xmlSetText(document, node, 'DTXR_SOURCE', resolved.source); count += 1; }
    return count;
  }
  if (purpose === 'support-restraint') {
    const text = resolved.dtxrPs || resolved.canonicalText;
    if (text) { xmlSetText(document, node, 'DTXR_PS', text); xmlSetText(document, node, 'DTXR_SOURCE', resolved.source); count += 1; }
    if (resolved.cmpSupGap) { xmlSetText(document, node, 'CMPSUPGAP_PS', resolved.cmpSupGap); if (!xmlText(node, 'CMPSUPGAP')) xmlSetText(document, node, 'CMPSUPGAP', resolved.cmpSupGap); count += 1; }
    return count;
  }
  const text = resolved.dtxrPos || resolved.canonicalText;
  if (text) { xmlSetText(document, node, 'DTXR_POS', text); xmlSetText(document, node, 'DTXR_SOURCE', resolved.source); count += 1; }
  return count;
}

export function resolveXmlCiiNodeDtxr(xmlNode, stagedIndex, config = {}) {
  const result = resolveDtxrForXmlNode({ xmlNode, context: stagedIndex, purpose: 'component-description', config, trustExistingXmlDtxr: config.trustExistingXmlDtxr !== false });
  return { value: result.canonicalText || result.value || '', source: result.source, confidence: result.confidence, matchedKey: result.matchedKey, matchedBy: result.matchedBy, stagedType: result.stagedType, suppressed: result.suppressed, suppressionReason: result.suppressionReason, sourcePath: result._sourcePath || '' };
}

function componentDescPrefix(node) {
  const type = getXmlNodeProperty(node, 'ComponentType').toUpperCase();
  return type === 'TEE' ? 'TEEDESC' : '';
}

function annotateComponentDtxr(node, sourceSuffix, value) {
  const prefix = componentDescPrefix(node);
  const text = toText(value).trim();
  if (!prefix || !text) return;
  xmlSetText(node.ownerDocument, node, `${prefix}_${sourceSuffix}`, text);
}

function annotateCmpSupGap(node, suffix, value) {
  const text = toText(value).trim();
  if (!text) return;
  xmlSetText(node.ownerDocument, node, `CMPSUPGAP_${suffix}`, text);
  if (!xmlText(node, 'CMPSUPGAP')) xmlSetText(node.ownerDocument, node, 'CMPSUPGAP', text);
}

function annotateFromRefAndTags(node, index) {
  const componentRefNo = getXmlNodeProperty(node, 'ComponentRefNo');
  const ref = chooseBestDtxrCandidate(candidateArrayFromMap(index?.byComponentRefNo, componentRefNo), node, {}) || null;
  if (ref?.dtxr) annotateComponentDtxr(node, 'REFBASIS', ref.dtxr);
  const tagCandidates = [];
  for (const tag of xmlNodeSupportTags(node)) tagCandidates.push(...candidateArrayFromMap(index?.byPsTag, tag));
  const ps = chooseBestDtxrCandidate(tagCandidates, node, {}) || null;
  if (ps?.cmpSupGap) annotateCmpSupGap(node, 'PS', ps.cmpSupGap);
  return { ref, ps };
}

export function xmlCiiDtxrPsForNode(node, stagedComponentIndex) {
  if (!stagedComponentIndex || stagedComponentIndex.count <= 0) return { text: '', tags: [], values: [] };
  const tags = xmlNodeSupportTags(node);
  const values = [];
  const gapValues = [];
  for (const tag of tags) {
    const matches = stagedComponentIndex.byTag.get(tag) || [];
    for (const match of matches) {
      const dtxr = stagedComponentDtxrPs(match) || stagedComponentDtxr(match);
      const gap = stagedAttr(match, ['CMPSUPGAP']);
      if (dtxr && !values.includes(dtxr)) values.push(dtxr);
      if (gap && !gapValues.includes(gap)) gapValues.push(gap);
    }
  }
  if (gapValues.length) annotateCmpSupGap(node, 'PS', gapValues[0]);
  return { text: values.join('|'), tags, values, cmpSupGap: gapValues[0] || '' };
}

export function xmlCiiDtxrPositionOffset(config) {
  const option = config?.dtxrPositionOffset || {};
  return { enabled: option.enabled === true, xOffset: toFiniteNumber(option.xOffset, 0), yOffset: toFiniteNumber(option.yOffset, 0), zOffset: toFiniteNumber(option.zOffset, 0), tolerance: Math.max(toFiniteNumber(option.tolerance, 0.5), 0) };
}

export function xmlCiiApplyDtxrPositionOffset(point, config) {
  if (!point) return null;
  const option = xmlCiiDtxrPositionOffset(config);
  if (!option.enabled) return point;
  return { x: point.x + option.xOffset, y: point.y + option.yOffset, z: point.z + option.zOffset };
}

function pointWithOffset(point, offset) {
  if (!point || !offset) return null;
  return { x: point.x + offset.x, y: point.y + offset.y, z: point.z + offset.z };
}

export function xmlCiiPositionsMatch(left, right, tolerance) {
  if (!left || !right) return false;
  return Math.abs(left.x - right.x) <= tolerance && Math.abs(left.y - right.y) <= tolerance && Math.abs(left.z - right.z) <= tolerance;
}

export function buildStagedDtxrPositionIndex(stagedJsonText, config) {
  const empty = { entries: [], byTag: new Map(), count: 0 };
  if (!toText(stagedJsonText).trim()) return empty;
  let parsed = null;
  try { parsed = JSON.parse(stagedJsonText); } catch { return empty; }
  const entries = [];
  const byTag = new Map();
  for (const entry of walkStagedComponents(parsed)) {
    const attrs = entry.attrs || {};
    const dtxrPos = stagedComponentDtxr(entry);
    const dtxrPs = stagedComponentDtxrPs(entry);
    const dtxr = dtxrPos || dtxrPs;
    const cmpSupGap = stagedAttr(entry, ['CMPSUPGAP']);
    const rawPoint = normalizePoint(attrs.POSI);
    const point = xmlCiiApplyDtxrPositionOffset(rawPoint, config);
    const supportTags = supportTagsFromAttrs(attrs, entry.component?.name || '');
    if (!dtxr && !cmpSupGap) continue;
    if (!point) continue;
    const indexed = { ...entry, dtxr, dtxrPos, dtxrPs, cmpSupGap, point, rawPoint, supportTags, _path: entry._path || '' };
    entries.push(indexed);
    for (const tag of supportTags) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(indexed);
    }
  }
  return { entries, byTag, count: entries.length };
}

function xmlCiiDtxrPositionAutoCalibration(config = {}) {
  const option = config?.dtxrPositionOffset || {};
  return {
    enabled: option.enabled !== false && option.autoCalibrate !== false,
    precision: Math.max(toFiniteNumber(option.autoCalibratePrecision, 1), 0.001),
    minSamples: Math.max(Math.round(toFiniteNumber(option.autoCalibrateMinSamples, 2)), 1),
  };
}

function offsetKey(offset, precision) {
  return [offset.x, offset.y, offset.z].map((value) => Math.round(value / precision)).join('|');
}

function inferDtxrPositionOffsetFromXml(document, dtxrPositionIndex, config = {}) {
  const calibration = xmlCiiDtxrPositionAutoCalibration(config);
  if (!calibration.enabled || !document || !dtxrPositionIndex?.byTag) return null;
  const nodes = typeof document.getElementsByTagName === 'function'
    ? [...document.getElementsByTagName('Node')]
    : [];
  const grouped = new Map();
  for (const node of nodes) {
    const target = normalizePoint(xmlText(node, 'Position'));
    if (!target) continue;
    for (const tag of xmlNodeSupportTags(node)) {
      for (const entry of dtxrPositionIndex.byTag.get(tag) || []) {
        if (!entry?.rawPoint) continue;
        const offset = {
          x: target.x - entry.rawPoint.x,
          y: target.y - entry.rawPoint.y,
          z: target.z - entry.rawPoint.z,
        };
        const key = offsetKey(offset, calibration.precision);
        const group = grouped.get(key) || { count: 0, x: 0, y: 0, z: 0, tags: new Set() };
        group.count += 1;
        group.x += offset.x;
        group.y += offset.y;
        group.z += offset.z;
        group.tags.add(tag);
        grouped.set(key, group);
      }
    }
  }

  let best = null;
  for (const [key, group] of grouped.entries()) {
    if (group.count < calibration.minSamples) continue;
    if (!best || group.count > best.group.count) best = { key, group };
  }
  if (!best) return null;
  return {
    x: best.group.x / best.group.count,
    y: best.group.y / best.group.count,
    z: best.group.z / best.group.count,
    samples: best.group.count,
    uniqueTags: best.group.tags.size,
    precision: calibration.precision,
    key: best.key,
  };
}

export function xmlCiiCalibrateDtxrPositionIndex(dtxrPositionIndex, document, config = {}) {
  const inferred = inferDtxrPositionOffsetFromXml(document, dtxrPositionIndex, config);
  if (!inferred) return dtxrPositionIndex;
  const offset = { x: inferred.x, y: inferred.y, z: inferred.z };
  const entries = [];
  const byTag = new Map();
  for (const entry of dtxrPositionIndex.entries || []) {
    const point = pointWithOffset(entry.rawPoint, offset) || entry.point || null;
    const indexed = { ...entry, point, inferredOffset: offset };
    entries.push(indexed);
    for (const tag of indexed.supportTags || []) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(indexed);
    }
  }
  return { ...dtxrPositionIndex, entries, byTag, count: entries.length, inferredOffset: offset, calibration: inferred };
}

export function xmlCiiDtxrPosForNode(node, dtxrPositionIndex, config) {
  if (!dtxrPositionIndex || dtxrPositionIndex.count <= 0) return { text: '', values: [] };
  const target = normalizePoint(xmlText(node, 'Position'));
  if (!target) return { text: '', values: [] };
  const tolerance = xmlCiiDtxrPositionOffset(config).tolerance;
  const values = [];
  const gapValues = [];
  let matchedPath = '';
  for (const entry of dtxrPositionIndex.entries) {
    if (!xmlCiiPositionsMatch(entry.point, target, tolerance)) continue;
    if (!matchedPath && entry._path) matchedPath = entry._path;
    if (entry.dtxr && !values.includes(entry.dtxr)) values.push(entry.dtxr);
    if (entry.cmpSupGap && !gapValues.includes(entry.cmpSupGap)) gapValues.push(entry.cmpSupGap);
  }
  if (values[0]) annotateComponentDtxr(node, 'POS', values[0]);
  if (gapValues[0]) annotateCmpSupGap(node, 'POS', gapValues[0]);
  return { text: values.join('|'), values, cmpSupGap: gapValues[0] || '', matchedPath };
}

export function annotateXmlCiiNodeFromStagedDtxr(node, stagedIndex) {
  if (!node || !stagedIndex) return;
  annotateFromRefAndTags(node, stagedIndex);
}
