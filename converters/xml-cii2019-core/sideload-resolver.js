// Resolver core for XML -> CII(2019) side-load workflows.
// Supports DOM documents and plain XML text to keep Node benchmark tests dependency-free.

import { parsePositionText, normalizePositionObject } from './sideload-json-config.js';

function asText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function stripNs(name) {
  return String(name || '').replace(/^.*:/, '');
}

function childText(node, localName) {
  if (!node) return '';
  if (typeof node.getElementsByTagName === 'function') {
    const direct = Array.from(node.childNodes || []).find((child) => child.nodeType === 1 && stripNs(child.localName || child.nodeName) === localName);
    return asText(direct?.textContent);
  }
  return asText(node?.[localName]);
}

function parseNodeBlocks(xmlText) {
  const text = asText(xmlText);
  if (!text) return [];
  const blocks = [];
  const re = new RegExp('\\x3cNode\\b[^>]*>([\\s\\S]*?)\\x3c\\/Node>', 'gi');
  for (const match of text.matchAll(re)) {
    const body = match[1];
    const get = (tag) => asText(body.match(new RegExp(`\\x3c${tag}\\b[^>]*>([\\s\\S]*?)\\x3c\\/${tag}>`, 'i'))?.[1]);
    blocks.push({
      nodeNumber: get('NodeNumber'),
      nodeName: get('NodeName'),
      componentRefNo: get('ComponentRefNo'),
      positionText: get('Position'),
      componentType: get('ComponentType'),
      nodeEl: null,
    });
  }
  return blocks;
}

function rowsFromXmlInput(xmlInput) {
  if (!xmlInput) return [];
  if (typeof xmlInput === 'string') return parseNodeBlocks(xmlInput);
  const nodes = Array.from(xmlInput.getElementsByTagName?.('Node') || []);
  return nodes.map((nodeEl) => ({
    nodeEl,
    nodeNumber: childText(nodeEl, 'NodeNumber'),
    nodeName: childText(nodeEl, 'NodeName'),
    componentRefNo: childText(nodeEl, 'ComponentRefNo'),
    positionText: childText(nodeEl, 'Position'),
    componentType: childText(nodeEl, 'ComponentType'),
  }));
}

export function normalizePsKey(value) {
  let text = asText(value).toUpperCase();
  if (!text) return '';
  text = text.replace(/^\/+/, '').replace(/\s+/g, '');
  text = text.replace(/\(REF\)$/i, '');
  text = text.replace(/\/DATUM$/i, '').replace(/\/SREF$/i, '');
  const match = text.match(/^PS-?(\d+(?:\.\d+)?)$/i) || text.match(/PS-?(\d+(?:\.\d+)?)/i);
  return match ? `PS${match[1]}` : text;
}

export function psCandidateKeys(value) {
  const exact = normalizePsKey(value);
  return exact ? [exact] : [];
}

export function parseXmlCiiPosition(value) {
  if (typeof value === 'object' && value !== null) return normalizePositionObject(value);
  return parsePositionText(value);
}

export function formatPositionKey(point, toleranceMm = 1) {
  if (!point) return '';
  const tol = Number(toleranceMm) || 1;
  return [point.x, point.y, point.z].map((v) => String(Math.round(Number(v) / tol))).join('|');
}

function addMulti(map, key, row) {
  if (!key) return;
  const existing = map.get(key);
  if (!existing) map.set(key, [row]);
  else existing.push(row);
}

export function buildXmlCiiNodeResolverIndex(xmlInput, options = {}) {
  const exactToleranceMm = Number(options.exactToleranceMm ?? options.toleranceMm ?? 1);
  const rows = rowsFromXmlInput(xmlInput).map((row) => ({ ...row, position: parseXmlCiiPosition(row.positionText) }));

  const index = {
    rows,
    byNodeNumber: new Map(),
    byPs: new Map(),
    byPosition: new Map(),
    stats: { nodeCount: rows.length, nodeNumberKeys: 0, psKeys: 0, positionKeys: 0 },
  };

  for (const row of rows) {
    if (row.nodeNumber) {
      index.byNodeNumber.set(String(row.nodeNumber), row);
      index.stats.nodeNumberKeys += 1;
    }

    const psSources = [row.nodeName, row.componentRefNo];
    for (const source of psSources) {
      const sourceText = asText(source);
      for (const match of sourceText.matchAll(/\/?PS[-]?\d+(?:\.\d+)?(?:\/DATUM|\/SREF)?/ig)) {
        addMulti(index.byPs, normalizePsKey(match[0]), row);
      }
    }

    const posKey = formatPositionKey(row.position, exactToleranceMm);
    if (posKey) addMulti(index.byPosition, posKey, row);
  }

  index.stats.psKeys = index.byPs.size;
  index.stats.positionKeys = index.byPosition.size;
  return index;
}

export function resolveXmlCiiNodeNumber(index, nodeNumber) {
  const key = asText(nodeNumber);
  const row = index?.byNodeNumber?.get(key);
  if (!key) return { status: 'INVALID_NODE', basis: 'NODE', key, resolvedNodeNumber: '' };
  if (!row) return { status: 'NOT_FOUND', basis: 'NODE', key, resolvedNodeNumber: '' };
  return { status: 'OK', basis: 'NODE', key, resolvedNodeNumber: row.nodeNumber, resolvedNodeName: row.nodeName, matchBy: 'NODE_NUMBER' };
}

export function resolveXmlCiiPsToNode(index, psKey) {
  const keys = psCandidateKeys(psKey);
  if (!keys.length) return { status: 'INVALID_PS', basis: 'PS', key: psKey, resolvedNodeNumber: '' };

  for (const key of keys) {
    const hits = index?.byPs?.get(key) || [];
    const unique = uniqueRowsByNode(hits);
    if (unique.length === 1) return { status: 'OK', basis: 'PS', key: psKey, normalizedKey: key, resolvedNodeNumber: unique[0].nodeNumber, resolvedNodeName: unique[0].nodeName, matchBy: 'PS_NODE_NAME_OR_COMPONENT_REF' };
    if (unique.length > 1) return { status: 'AMBIGUOUS', basis: 'PS', key: psKey, normalizedKey: key, resolvedNodeNumber: '', candidates: unique.map((row) => row.nodeNumber) };
  }

  return { status: 'NOT_FOUND', basis: 'PS', key: psKey, normalizedKey: keys[0], resolvedNodeNumber: '' };
}

function uniqueRowsByNode(rows) {
  const map = new Map();
  for (const row of rows || []) if (row?.nodeNumber && !map.has(row.nodeNumber)) map.set(row.nodeNumber, row);
  return Array.from(map.values());
}

function distanceMm(a, b) {
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  const dz = Number(a.z) - Number(b.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function resolveXmlCiiPositionToNode(index, position, options = {}) {
  const target = parseXmlCiiPosition(position);
  const exactToleranceMm = Number(options.exactToleranceMm ?? 1);
  const nearestToleranceMm = Number(options.nearestToleranceMm ?? options.toleranceMm ?? 5);
  if (!target) return { status: 'INVALID_POSITION', basis: 'POS', key: position, resolvedNodeNumber: '' };

  const exactKey = formatPositionKey(target, exactToleranceMm);
  const exactHits = uniqueRowsByNode(index?.byPosition?.get(exactKey) || []);
  if (exactHits.length === 1) return { status: 'OK_EXACT', basis: 'POS', key: position, resolvedNodeNumber: exactHits[0].nodeNumber, resolvedNodeName: exactHits[0].nodeName, distanceMm: 0, matchBy: 'POSITION_EXACT' };
  if (exactHits.length > 1) return { status: 'AMBIGUOUS', basis: 'POS', key: position, resolvedNodeNumber: '', candidates: exactHits.map((row) => row.nodeNumber), matchBy: 'POSITION_EXACT' };

  let best = null;
  for (const row of index?.rows || []) {
    if (!row.position) continue;
    const d = distanceMm(target, row.position);
    if (!best || d < best.distanceMm) best = { row, distanceMm: d };
  }
  if (best && best.distanceMm <= nearestToleranceMm) return { status: 'OK_NEAREST', basis: 'POS', key: position, resolvedNodeNumber: best.row.nodeNumber, resolvedNodeName: best.row.nodeName, distanceMm: best.distanceMm, matchBy: 'POSITION_NEAREST' };
  return { status: 'NO_NODE_WITHIN_TOLERANCE', basis: 'POS', key: position, resolvedNodeNumber: '', nearestNodeNumber: best?.row?.nodeNumber || '', nearestDistanceMm: best?.distanceMm ?? null };
}
