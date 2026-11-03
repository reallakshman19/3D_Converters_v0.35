import { xmlCiiTypeEntriesFromSupportKind } from './support-mapping.js';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function xmlLocalName(node) {
  return text(node?.localName || node?.nodeName).replace(/^.*:/, '');
}

function xmlChildrenByName(parent, localName) {
  return [...(parent?.childNodes || [])]
    .filter((child) => child.nodeType === 1 && xmlLocalName(child) === localName);
}

function xmlFirstChild(parent, localName) {
  return xmlChildrenByName(parent, localName)[0] || null;
}

function xmlText(parent, localName) {
  return text(xmlFirstChild(parent, localName)?.textContent);
}

function createElement(document, parent, localName) {
  return parent?.namespaceURI
    ? document.createElementNS(parent.namespaceURI, localName)
    : document.createElement(localName);
}

function appendText(document, parent, localName, value) {
  const child = createElement(document, parent, localName);
  child.textContent = value === undefined || value === null ? '' : String(value);
  parent.appendChild(child);
  return child;
}

function normalizeAppliedType(type) {
  const upper = text(type).toUpperCase();
  const aliases = {
    GUIDE: 'GUI',
    GUI: 'GUI',
    X: 'GUI',
    LINESTOP: 'LIM',
    'LINE STOP': 'LIM',
    LIMIT: 'LIM',
    LIM: 'LIM',
    Z: 'LIM',
  };
  return aliases[upper] || upper;
}

function xmlTypeAllowsRealFriction(type) {
  const upper = normalizeAppliedType(type);
  return upper === '+Y' || upper === 'Y';
}

function frictionForManualEntry(entry, type, config = {}) {
  if (text(entry?.friction)) return text(entry.friction);
  const mode = text(entry?.frictionMode || 'default').toLowerCase();
  const defaultFriction = text(config.defaultFriction || '0.3') || '0.3';
  if (mode === 'fixed' && text(entry?.fixedFriction)) return text(entry.fixedFriction);
  if (mode === 'sentinel' && config.useFrictionSentinelForNonYSupports !== false && !xmlTypeAllowsRealFriction(type)) return '-1.010100';
  return defaultFriction;
}

function nodeMapByNumber(document) {
  const map = new Map();
  for (const node of [...document.getElementsByTagName('Node')]) {
    const nodeNumber = xmlText(node, 'NodeNumber');
    if (nodeNumber) map.set(nodeNumber, node);
  }
  return map;
}

function existingTypeSet(nodeElement) {
  const out = new Set();
  for (const restraint of xmlChildrenByName(nodeElement, 'Restraint')) {
    const type = normalizeAppliedType(xmlText(restraint, 'Type'));
    if (type) out.add(type);
  }
  return out;
}

function entriesForFact(fact, config = {}) {
  const supportEntries = xmlCiiTypeEntriesFromSupportKind(fact.value, config) || [];
  const entries = supportEntries.length ? supportEntries : [{ type: fact.value }];
  return entries
    .map((entry) => (typeof entry === 'string' ? { type: entry } : entry))
    .filter((entry) => text(entry?.type));
}

function appendManualRestraint(document, nodeElement, fact, entry, config = {}) {
  const restraint = createElement(document, nodeElement, 'Restraint');
  restraint.setAttribute('source', 'MANUAL_SIDELOAD');
  restraint.setAttribute('basis', fact.basis || '');
  restraint.setAttribute('resolvedKey', fact.key || '');

  const type = normalizeAppliedType(entry.type);
  appendText(document, restraint, 'Type', type);
  appendText(document, restraint, 'Stiffness', text(entry.stiffness) || text(config.defaultStiffness) || '1.751270E+12');
  appendText(document, restraint, 'Gap', text(entry.gap) || '0');
  appendText(document, restraint, 'Friction', frictionForManualEntry(entry, type, config));
  appendText(document, restraint, 'OriginalText', fact.meta?.rawLine || fact.value || '');
  appendText(document, restraint, 'ResolvedFrom', fact.basis || '');
  appendText(document, restraint, 'ResolvedKey', fact.key || '');
  appendText(document, restraint, 'SideloadRow', fact.meta?.rowNo || '');

  const direction = entry.direction;
  if (direction && Number.isFinite(Number(direction.x)) && Number.isFinite(Number(direction.y)) && Number.isFinite(Number(direction.z))) {
    appendText(document, restraint, 'DirectionCosineX', Number(direction.x).toFixed(9));
    appendText(document, restraint, 'DirectionCosineY', Number(direction.y).toFixed(9));
    appendText(document, restraint, 'DirectionCosineZ', Number(direction.z).toFixed(9));
  }

  nodeElement.appendChild(restraint);
  return restraint;
}

function parseXml(xmlText) {
  if (typeof DOMParser === 'undefined') {
    throw new Error('Manual sideload XML apply requires DOMParser.');
  }
  const document = new DOMParser().parseFromString(String(xmlText || ''), 'application/xml');
  const parseErrors = document.getElementsByTagName('parsererror');
  if (parseErrors.length) throw new Error(`Unable to parse enriched XML for sideload apply: ${text(parseErrors[0].textContent).slice(0, 160)}`);
  return document;
}

function serializeXml(document) {
  if (typeof XMLSerializer === 'undefined') {
    throw new Error('Manual sideload XML apply requires XMLSerializer.');
  }
  return new XMLSerializer().serializeToString(document);
}

export function applyManualMatchedFactsToEnrichedXml(xmlInput, matchedFacts = [], config = {}, options = {}) {
  const document = typeof xmlInput === 'string' ? parseXml(xmlInput) : xmlInput;
  const byNodeNumber = nodeMapByNumber(document);
  const appliedFacts = [];
  const rejectedFacts = [];
  const policy = options.policy || 'ADD_IF_MISSING';

  for (const fact of matchedFacts || []) {
    if (fact?.source !== 'MANUAL_SIDELOAD' || fact?.itemType !== 'RESTRAINT' || fact?.status !== 'MATCHED') continue;

    const node = byNodeNumber.get(text(fact.resolvedNodeNumber));
    if (!node) {
      rejectedFacts.push({ ...fact, status: 'TARGET_NODE_MISSING', action: 'SKIP' });
      continue;
    }

    const existing = existingTypeSet(node);
    const entries = entriesForFact(fact, config);
    let appliedForFact = 0;
    let skippedForFact = 0;

    for (const entry of entries) {
      const type = normalizeAppliedType(entry.type);
      if (!type) continue;
      if (policy === 'ADD_IF_MISSING' && existing.has(type)) {
        skippedForFact += 1;
        continue;
      }
      appendManualRestraint(document, node, fact, { ...entry, type }, config);
      existing.add(type);
      appliedForFact += 1;
    }

    if (appliedForFact > 0) {
      appliedFacts.push({ ...fact, status: 'APPLIED', appliedCount: appliedForFact, skippedCount: skippedForFact });
    } else {
      rejectedFacts.push({ ...fact, status: 'SKIPPED_ALREADY_EXISTS', action: 'SKIP', skippedCount: skippedForFact });
    }
  }

  return {
    xmlText: typeof xmlInput === 'string' ? serializeXml(document) : '',
    document,
    appliedFacts,
    rejectedFacts,
    stats: {
      appliedManualRestraints: appliedFacts.reduce((sum, fact) => sum + Number(fact.appliedCount || 0), 0),
      skippedManualRestraints: rejectedFacts.length,
    },
  };
}
