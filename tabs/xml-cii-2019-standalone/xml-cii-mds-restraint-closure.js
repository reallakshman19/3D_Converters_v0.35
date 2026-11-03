import {
  applyXmlRestraints,
  restraintEntriesFromSupportKind,
} from '../../converters/xml-cii2019-core/support-mapping.js';
import { migrateSupportMappingConfig } from '../../converters/xml-cii2019-core/support-mapping-config.js';
import { buildStandaloneDtxrResolutionLedger } from './xml-cii-trace-resolution-ledger.js';
import { decorateJsonTraceLedger } from './xml-cii-json-trace-fields.js';

const CARRIER_TYPES = new Set(['ANCI', 'ATTA']);
const GOVERNED_KINDS = Object.freeze(['REST', 'GUIDE', 'LINESTOP']);
const EXPECTED_XML_TYPE = Object.freeze({ REST: '+Y', GUIDE: 'GUI', LINESTOP: 'LIM' });

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function localName(node) {
  return text(node?.localName || node?.nodeName).replace(/^.*:/, '');
}

function childrenByName(parent, name) {
  return [...(parent?.childNodes || parent?.children || [])]
    .filter((node) => node?.nodeType === undefined || node.nodeType === 1)
    .filter((node) => localName(node) === name);
}

function firstChild(parent, name) {
  return childrenByName(parent, name)[0] || null;
}

function childText(parent, name) {
  return text(firstChild(parent, name)?.textContent);
}

function parserFailed(document) {
  return !!(document?.querySelector?.('parsererror') || document?.getElementsByTagName?.('parsererror')?.length);
}

function normalizeXmlType(value) {
  const type = text(value).toUpperCase();
  if (type === 'Y' || type === '+Y' || type === 'REST') return '+Y';
  if (type === 'GUIDE' || type === 'GUI' || type === 'X') return 'GUI';
  if (type === 'LINESTOP' || type === 'LIMIT' || type === 'LIM' || type === 'Z') return 'LIM';
  return type;
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function memberAttributes(member) {
  return safeObject(member?.raw?.attributes || member?.attributes || member?.capturedFields);
}

function supportKindFromMember(member) {
  const captured = safeObject(member?.capturedFields);
  const attrs = memberAttributes(member);
  const code = text(captured.MDSSUPPTYPE || attrs.MDSSUPPTYPE).toUpperCase();
  if (code.startsWith('GT')) return 'GUIDE';
  if (code.startsWith('ST')) return 'LINESTOP';
  if (code === 'PIPE-REST' || code.startsWith('AT')) return 'REST';
  const evidence = [
    captured.DTXR,
    captured.SPRE,
    captured.SPREF,
    member?.labeled,
    member?.description,
    member?.dtxr,
    member?.raw?.type,
  ].map(text).join(' ').toUpperCase();
  if (/\b(?:PIPE[- ]?REST|REST|SHOE|WEAR\s*PAD|BEARING\s*PLATE)\b/.test(evidence)) return 'REST';
  return '';
}

function evidenceByKind(record) {
  const result = new Map();
  for (const member of Array.isArray(record?.positionMembers) ? record.positionMembers : []) {
    const kind = supportKindFromMember(member);
    if (kind && !result.has(kind)) result.set(kind, memberAttributes(member));
  }
  for (const kind of Array.isArray(record?.derivedSupportTypes) ? record.derivedSupportTypes : []) {
    const normalized = text(kind).toUpperCase().replace(/\s+/g, '');
    if (GOVERNED_KINDS.includes(normalized) && !result.has(normalized)) result.set(normalized, {});
  }
  return result;
}

function existingTypes(node) {
  return new Set(childrenByName(node, 'Restraint')
    .map((restraint) => normalizeXmlType(childText(restraint, 'Type')))
    .filter(Boolean));
}

function createTemporaryNode(document, node) {
  return node?.namespaceURI && typeof document.createElementNS === 'function'
    ? document.createElementNS(node.namespaceURI, 'Node')
    : document.createElement('Node');
}

function appendGeneratedEntries(document, node, entries, config) {
  if (!entries.length) return 0;
  const temporary = createTemporaryNode(document, node);
  applyXmlRestraints(document, temporary, entries, config);
  const generated = [...childrenByName(temporary, 'Restraint')];
  for (const restraint of generated) node.appendChild(restraint);
  return generated.length;
}

function nodeDiagnostic(node, record, kinds, entries) {
  return {
    type: 'mds-position-restraints-materialized',
    nodeNumber: childText(node, 'NodeNumber'),
    nodeName: childText(node, 'NodeName'),
    componentType: childText(node, 'ComponentType'),
    effectiveSource: record?.effectiveSource || '',
    matchType: record?.matchType || '',
    supportKinds: kinds,
    restraintTypes: entries.map((entry) => normalizeXmlType(entry?.type || entry)),
    message: 'Missing governed restraints were appended from the matched DTXR_POS position-group MDSSUPPTYPE evidence.',
  };
}

export function closeGovernedMdsPositionRestraintsXml(xmlText, stagedJsonText, config = {}) {
  const source = String(xmlText ?? '');
  const stats = {
    mdsPositionNodesChanged: 0,
    mdsRestRestraintsAdded: 0,
    mdsGuideRestraintsAdded: 0,
    mdsLineStopRestraintsAdded: 0,
  };
  const diagnostics = [];
  const supportMapping = migrateSupportMappingConfig(config);
  if (supportMapping.useJsonForRestraints === false) {
    return { xmlText: source, changed: false, stats, diagnostics: [{ type: 'mds-position-restraint-closure-skipped', reason: 'json-restraints-disabled' }] };
  }
  if (!source.trim() || !text(stagedJsonText)) return { xmlText: source, changed: false, stats, diagnostics };
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return { xmlText: source, changed: false, stats, diagnostics: [{ type: 'mds-position-restraint-closure-skipped', reason: 'DOM unavailable' }] };
  }

  const rawLedger = buildStandaloneDtxrResolutionLedger(source, stagedJsonText, config);
  const traceConfig = {
    captureFields: ['DTXR', 'SPRE', 'SPREF', 'MDSSUPPTYPE', 'NAME', 'CMPSUPGAP'],
  };
  const ledger = decorateJsonTraceLedger(rawLedger, traceConfig);
  const byIndex = new Map((ledger.records || []).map((record) => [Number(record.xmlIndex), record]));
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (parserFailed(document)) {
    return { xmlText: source, changed: false, stats, diagnostics: [{ type: 'mds-position-restraint-closure-skipped', reason: 'XML parse failed' }] };
  }

  let xmlIndex = 0;
  for (const branch of [...document.getElementsByTagName('Branch')]) {
    for (const node of childrenByName(branch, 'Node')) {
      xmlIndex += 1;
      const componentType = childText(node, 'ComponentType').toUpperCase();
      if (!CARRIER_TYPES.has(componentType)) continue;
      const record = byIndex.get(xmlIndex);
      if (!record || !String(record.status || '').startsWith('RESOLVED_')) continue;
      const evidence = evidenceByKind(record);
      if (!evidence.size) continue;

      const present = existingTypes(node);
      const kinds = [];
      const entries = [];
      for (const kind of GOVERNED_KINDS) {
        if (!evidence.has(kind)) continue;
        const expectedType = EXPECTED_XML_TYPE[kind];
        if (present.has(expectedType)) continue;
        const generated = restraintEntriesFromSupportKind(kind, evidence.get(kind), node, config)
          .filter((entry) => !present.has(normalizeXmlType(entry?.type || entry)));
        if (!generated.length) continue;
        kinds.push(kind);
        entries.push(...generated);
        for (const entry of generated) present.add(normalizeXmlType(entry?.type || entry));
      }
      if (!entries.length) continue;

      const appended = appendGeneratedEntries(document, node, entries, config);
      if (!appended) continue;
      stats.mdsPositionNodesChanged += 1;
      if (kinds.includes('REST')) stats.mdsRestRestraintsAdded += 1;
      if (kinds.includes('GUIDE')) stats.mdsGuideRestraintsAdded += 1;
      if (kinds.includes('LINESTOP')) stats.mdsLineStopRestraintsAdded += 1;
      diagnostics.push(nodeDiagnostic(node, record, kinds, entries));
    }
  }

  const changed = stats.mdsPositionNodesChanged > 0;
  return {
    xmlText: changed ? new XMLSerializer().serializeToString(document) : source,
    changed,
    stats,
    diagnostics,
    ledger: ledger.records || [],
  };
}
