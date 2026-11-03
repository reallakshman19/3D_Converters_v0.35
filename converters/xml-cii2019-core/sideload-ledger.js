import {
  getJsonAttributes,
  getConfiguredAttribute,
  getConfiguredPositions,
  getConfiguredPsKeys,
  classifyConfiguredRestraint,
  normalizeXmlCiiSideloadJsonConfig,
} from './sideload-json-config.js';
import {
  resolveXmlCiiNodeNumber,
  resolveXmlCiiPsToNode,
  resolveXmlCiiPositionToNode,
} from './sideload-resolver.js';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

export function makeXmlCiiMatchedFact(input = {}) {
  return {
    source: input.source || 'PREVIEW_JSON',
    itemType: input.itemType || '',
    basis: input.basis || '',
    key: text(input.key),
    resolvedNodeNumber: text(input.resolvedNodeNumber),
    resolvedNodeName: text(input.resolvedNodeName),
    value: input.value,
    action: input.action || 'ADD_IF_MISSING',
    status: 'MATCHED',
    meta: input.meta || {},
    warnings: input.warnings || [],
    errors: [],
  };
}

export function makeXmlCiiRejectedFact(input = {}) {
  return {
    source: input.source || 'PREVIEW_JSON',
    itemType: input.itemType || '',
    basis: input.basis || '',
    key: text(input.key),
    resolvedNodeNumber: '',
    resolvedNodeName: '',
    value: input.value,
    action: 'NONE',
    status: input.status || 'UNRESOLVED',
    meta: input.meta || {},
    warnings: input.warnings || [],
    errors: input.errors || [],
  };
}

function walkBranches(jsonBranches, config) {
  const branches = Array.isArray(jsonBranches) ? jsonBranches : [];
  const childrenPath = config?.scope?.childrenPath || 'children';
  const rows = [];
  for (const branch of branches) {
    const children = Array.isArray(branch?.[childrenPath]) ? branch[childrenPath] : [];
    for (const child of children) rows.push({ branch, child, attrs: getJsonAttributes(child, config) });
  }
  return rows;
}

function resolveByBasis(row, basis, resolverIndex, config, options = {}) {
  const attrs = row.attrs || {};
  if (basis === 'NODE') {
    const aliases = config?.basisResolvers?.NODE?.fieldAliases || [];
    for (const alias of aliases) {
      const value = attrs[alias];
      if (text(value)) return resolveXmlCiiNodeNumber(resolverIndex, value);
    }
    return { status: 'NOT_FOUND', basis: 'NODE', key: '', resolvedNodeNumber: '' };
  }
  if (basis === 'PS') {
    const keys = getConfiguredPsKeys(attrs, config?.basisResolvers?.PS);
    for (const item of keys) {
      const result = resolveXmlCiiPsToNode(resolverIndex, item.value);
      if (result.status === 'OK') return { ...result, key: item.value, meta: { alias: item.alias } };
    }
    return { status: 'NOT_FOUND', basis: 'PS', key: keys[0]?.value || '', resolvedNodeNumber: '' };
  }
  if (basis === 'POS') {
    const positions = getConfiguredPositions(attrs, config?.basisResolvers?.POS);
    for (const item of positions) {
      const result = resolveXmlCiiPositionToNode(resolverIndex, item.value, options);
      if (result.status === 'OK_EXACT' || result.status === 'OK_NEAREST') return { ...result, key: item.raw || `${item.value.x} ${item.value.y} ${item.value.z}`, meta: { alias: item.alias } };
    }
    return { status: 'NO_NODE_WITHIN_TOLERANCE', basis: 'POS', key: positions[0]?.raw || '', resolvedNodeNumber: '' };
  }
  return { status: 'ERROR_UNSUPPORTED_BASIS', basis, key: '', resolvedNodeNumber: '' };
}

function firstResolved(row, basisPriority, resolverIndex, config, options) {
  const rejected = [];
  for (const basis of basisPriority || []) {
    const result = resolveByBasis(row, basis, resolverIndex, config, options);
    if (result.resolvedNodeNumber && String(result.status || '').startsWith('OK')) return { result, rejected };
    rejected.push(result);
  }
  return { result: rejected[0] || { status: 'UNRESOLVED', basis: '', key: '', resolvedNodeNumber: '' }, rejected };
}

function valueForItem(attrs, itemType, itemConfig) {
  if (itemType === 'RESTRAINT') {
    const classified = classifyConfiguredRestraint(attrs, itemConfig);
    return { value: classified.kind, meta: classified };
  }
  const raw = getConfiguredAttribute(attrs, itemConfig.sourceFieldAliases || []);
  if (itemType === 'RATING' && raw && itemConfig.ratingRegex) {
    const match = String(raw).match(new RegExp(itemConfig.ratingRegex, 'i'));
    return { value: match?.[1] || raw, meta: { raw } };
  }
  return { value: raw, meta: {} };
}

export function resolveConfiguredJsonFacts(jsonBranches, resolverIndex, rawConfig = {}, options = {}) {
  const config = normalizeXmlCiiSideloadJsonConfig(rawConfig);
  const matchedFacts = [];
  const rejectedFacts = [];
  const rows = walkBranches(jsonBranches, config);

  for (const row of rows) {
    for (const [itemType, itemConfig] of Object.entries(config.itemExtractors || {})) {
      if (!itemConfig?.enabled) continue;
      if (Array.isArray(itemConfig.includeOnlyTypes) && itemConfig.includeOnlyTypes.length) {
        const type = text(row.child?.type || row.attrs?.TYPE || row.attrs?.RAW_TYPE).toUpperCase();
        if (!itemConfig.includeOnlyTypes.map((x) => String(x).toUpperCase()).includes(type)) continue;
      }
      const { value, meta } = valueForItem(row.attrs, itemType, itemConfig);
      if (value === undefined || value === null || text(value) === '') continue;

      const { result, rejected } = firstResolved(row, itemConfig.basisPriority || ['PS', 'POS'], resolverIndex, config, options);
      if (result.resolvedNodeNumber && String(result.status || '').startsWith('OK')) {
        matchedFacts.push(makeXmlCiiMatchedFact({
          source: 'PREVIEW_JSON',
          itemType,
          basis: result.basis,
          key: result.key,
          resolvedNodeNumber: result.resolvedNodeNumber,
          resolvedNodeName: result.resolvedNodeName,
          value,
          meta: { ...meta, jsonName: row.child?.name, jsonType: row.child?.type, resolver: result },
        }));
      } else {
        rejectedFacts.push(makeXmlCiiRejectedFact({
          source: 'PREVIEW_JSON',
          itemType,
          basis: result.basis,
          key: result.key,
          value,
          status: result.status || 'UNRESOLVED',
          meta: { ...meta, jsonName: row.child?.name, jsonType: row.child?.type, rejectedResolvers: rejected },
        }));
      }
    }
  }

  return { matchedFacts, rejectedFacts };
}

export function mergeXmlCiiMatchedFacts(previewFacts = [], manualFacts = [], options = {}) {
  const policy = options.policy || 'ADD_IF_MISSING';
  const out = [...previewFacts];
  const rejected = [];
  const existing = new Set(out.filter((f) => f.status === 'MATCHED').map(factKey));

  for (const fact of manualFacts || []) {
    if (fact.status !== 'MATCHED') {
      rejected.push(fact);
      continue;
    }
    const key = factKey(fact);
    if (policy === 'ADD_IF_MISSING' && existing.has(key)) {
      rejected.push({ ...fact, status: 'DUPLICATE', action: 'SKIP', warnings: [`Duplicate ${fact.itemType} ${fact.value} at node ${fact.resolvedNodeNumber}`] });
      continue;
    }
    existing.add(key);
    out.push(fact);
  }

  return { matchedFacts: out, rejectedFacts: rejected };
}

function factKey(fact) {
  return `${fact.itemType}|${fact.resolvedNodeNumber}|${String(fact.value).toUpperCase()}`;
}

export function filterMatchedPreviewFacts(facts = []) {
  return facts.filter((fact) => fact.status === 'MATCHED');
}

export function filterDiagnosticsFacts(facts = []) {
  return facts.filter((fact) => fact.status !== 'MATCHED');
}

export function matchedFactsFromEnrichmentDiagnostics(diagnostics = []) {
  const facts = [];
  for (const item of Array.isArray(diagnostics) ? diagnostics : []) {
    const nodeNumber = text(item.nodeNumber || item.keptNode);
    if (!nodeNumber) continue;
    if (item.type === 'dtxr-ps') {
      facts.push(makeXmlCiiMatchedFact({
        source: 'PREVIEW_JSON',
        itemType: 'DTXR_PS',
        basis: 'PS',
        key: text(item.tags),
        resolvedNodeNumber: nodeNumber,
        resolvedNodeName: text(item.nodeName),
        value: text(item.count),
        action: 'EXISTING',
        meta: item,
      }));
    } else if (item.type === 'dtxr-pos') {
      facts.push(makeXmlCiiMatchedFact({
        source: 'PREVIEW_JSON',
        itemType: 'DTXR_POS',
        basis: 'POS',
        key: text(item.position),
        resolvedNodeNumber: nodeNumber,
        resolvedNodeName: text(item.nodeName),
        value: text(item.count),
        action: 'EXISTING',
        meta: item,
      }));
    } else if (item.type === 'support-match') {
      const values = text(item.restraintTypes || item.kind).split('+').map(text).filter(Boolean);
      for (const value of values.length ? values : ['']) {
        facts.push(makeXmlCiiMatchedFact({
          source: 'PREVIEW_JSON',
          itemType: 'RESTRAINT',
          basis: item.method === 'ps-tag' ? 'PS' : 'POS',
          key: item.method === 'ps-tag' ? text(item.tags) : text(item.stagedName),
          resolvedNodeNumber: nodeNumber,
          resolvedNodeName: text(item.nodeName),
          value,
          action: 'EXISTING',
          meta: item,
        }));
      }
    } else if (item.type === 'weight-master-match' || item.type === 'rigid-weight-manual-override') {
      facts.push(makeXmlCiiMatchedFact({
        source: item.type === 'weight-master-match' ? 'PREVIEW_MASTER' : 'MANUAL_WEIGHT_REVIEW',
        itemType: 'WEIGHT',
        basis: 'NODE',
        key: nodeNumber,
        resolvedNodeNumber: nodeNumber,
        value: item.weight,
        action: 'EXISTING',
        meta: item,
      }));
    }
  }
  return facts;
}
