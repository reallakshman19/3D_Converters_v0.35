/**
 * Functionality: walks the StagedJSON hierarchy tree and produces
 * a flat list of component records, each with resolved attributes,
 * type, bore, position, canonical branch context, and support metadata.
 * Parameters: parsed JSON array/object. Outputs: ComponentRecord[].
 * No side effects. Pure functional traversal.
 */

import { mapComponentType, isSupportType } from './sj-type-mapper.js';
import { resolveBranchIdentity } from './sj-branch-identity.js';

/** Types treated as hierarchy containers (not emitted as components) */
const CONTAINER_TYPES = new Set(['BRANCH', 'SITE', 'ZONE', 'GROUP', 'WORLD']);
const EMPTY_BRANCH = Object.freeze({ sourceName: '', owner: '', canonicalName: '', suffix: '' });

/**
 * Parse and flatten a StagedJSON hierarchy into component records.
 * @param {Array|Object} stagedJson  — parsed JSON root
 * @param {Object} config
 * @param {Record<string,string>} config.typeOverrides
 * @returns {ComponentRecord[]}
 */
export function parseStagedJson(stagedJson, config = {}) {
  const root = Array.isArray(stagedJson) ? stagedJson : (stagedJson.objects || [stagedJson]);
  const records = [];
  walkNodes(root, [], EMPTY_BRANCH, records, config);
  return records;
}

/** Count components by mapped type. */
export function tallyByType(records) {
  const tally = {};
  for (const record of records) {
    const type = record.componentType || 'UNKNOWN';
    tally[type] = (tally[type] || 0) + 1;
  }
  return tally;
}

/**
 * Group by canonical owner/root branch. Source /B1, /B2, ... identity remains
 * available on each record for trace and diagnostics.
 */
export function groupByBranch(records) {
  const map = new Map();
  for (const record of records) {
    const branch = record.branchName || '/UNMAPPED';
    if (!map.has(branch)) map.set(branch, []);
    map.get(branch).push(record);
  }
  return map;
}

function walkNodes(nodes, ancestorPath, inheritedBranch, output, config) {
  nodes.forEach((node, index) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const attrs = flatAttrs(node);
    const rawType = text(node.type || attrs.TYPE || attrs.RAW_TYPE).toUpperCase();
    const branch = rawType === 'BRANCH'
      ? resolveBranchIdentity({ sourceName: text(node.name || attrs.NAME), owner: attrs.OWNER })
      : inheritedBranch;
    const path = [...ancestorPath, index];

    if (!CONTAINER_TYPES.has(rawType) || rawType === 'BRANCH') {
      if (rawType !== 'BRANCH') output.push(buildRecord(node, rawType, path, branch, config));
    }

    const children = Array.isArray(node.children) ? node.children : [];
    walkNodes(children, [...path, 'children'], branch, output, config);
  });
}

function buildRecord(node, rawType, path, branch, config) {
  const attrs = flatAttrs(node);
  const enrichedAttributes = plain(node.enrichedAttributes);
  const componentType = mapComponentType(
    attrs.RAW_TYPE || rawType,
    config.typeOverrides || {}
  );
  const isSupport = isSupportType(componentType);
  const boreMm = finiteNumber(enrichedAttributes.nominalBoreMm) ?? parseBore(attrs);
  const dtxr = text(attrs.DTXR || '');
  const spre = text(attrs.SPRE || '');

  return {
    path,
    name: text(node.name),
    branchName: branch.canonicalName,
    sourceBranchName: branch.sourceName,
    branchOwner: branch.owner,
    branchSuffix: branch.suffix,
    rawType,
    componentType,
    isSupport,
    boreMm,
    attrs,
    enrichedAttributes: Object.keys(enrichedAttributes).length ? enrichedAttributes : null,
    dtxr,
    spre,
    ispe: text(attrs.ISPE || ''),
    mtxx: text(attrs.MTXX || ''),
    mesc: text(attrs['MESC OF SPREF'] || ''),
    insuMm: finiteNumber(enrichedAttributes.insulationThicknessMm) ?? parseMm(attrs.INSU),
    anglDeg: parseDeg(attrs.ANGL),
    ref: text(attrs.REF || attrs.COMPRE || ''),
    trackingNo: text(attrs['TRACKING_NO.'] || ''),
    supportTag: text(attrs.SUPPORT_TAG || ''),
    supportKind: text(attrs.SUPPORT_KIND || attrs.SUPPORT_MAPPER_KIND || ''),
    supportType: text(attrs.SUPPORT_TYPE || ''),
    cmpStressN: text(attrs.CMPSTRESSN || ''),
    cmpSupRefN: text(attrs.CMPSUPREFN || ''),
    nodegap: parseMm(attrs.NODEGAP),
    nodestiff: parseNum(attrs.NODESTIFF),
    nodefriction: parseNum(attrs.NODEFRICTION),
    sourceWeightKg: firstNumber(attrs.CMPWEIGHTDRY, attrs.NWEI, attrs.WEIGHT) ?? 0,
    resolved: null,
  };
}

function flatAttrs(node) {
  const attributes = node?.attributes;
  return attributes && typeof attributes === 'object' && !Array.isArray(attributes) ? attributes : {};
}

function parseBore(attrs) {
  const keys = ['ABORE', 'HBORE', 'LBORE', 'BORE', 'HBOR', 'TBOR', 'COMPBORE'];
  for (const key of keys) {
    const value = parseMm(attrs[key]);
    if (value !== null && value > 0) return value;
  }
  return null;
}

function parseMm(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/mm|in|ft/gi, '').replace(/,/g, '').trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseDeg(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/degree|deg|°/gi, '').trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseNum(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/[^0-9.-]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = parseNum(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function plain(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? '').trim();
}
