import { detectXmlCiiWorkflowSourceKind } from './xml-cii-workflow-source-detect.js';

export function createDefaultManualElementSideloadConfig() {
  return {
    policy: 'add-if-missing',
    tolerance: 0,
    delimiter: '|',
    manualText: '',
  };
}

function text(value) {
  return String(value ?? '').trim();
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function norm(value) {
  return text(value).toUpperCase().replace(/\s+/g, '');
}

function decodeXml(value) {
  return String(value ?? '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

function attrsFromTag(tag) {
  const attrs = {};
  String(tag || '').replace(/([A-Za-z_][\w:.-]*)\s*=\s*["']([^"']*)["']/g, (_, key, value) => {
    attrs[key] = decodeXml(value);
    return '';
  });
  return attrs;
}

function configFrom(input = {}) {
  const parsed = parseConfig(input.supportConfigJson);
  return { ...createDefaultManualElementSideloadConfig(), ...safeObject(parsed.manualElementSideload), ...safeObject(input.config) };
}

function parseConfig(rawJson) {
  try { return safeObject(JSON.parse(text(rawJson) || '{}')); } catch { return {}; }
}

function writeConfig(supportConfigJson, config) {
  const json = parseConfig(supportConfigJson);
  json.manualElementSideload = { policy: config.policy, tolerance: config.tolerance, delimiter: config.delimiter };
  return JSON.stringify(json, null, 2);
}

function lines(rawText) {
  return String(rawText || '').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

export function parseManualRestraintRows(rawText, delimiter = '|') {
  return lines(rawText).map((line, index) => {
    const [kind, key, restraint, note] = line.split(delimiter).map(text);
    return { rowIndex: index + 1, kind: norm(kind || 'NODE'), key, restraint, note, rawLine: line };
  });
}

function indexHits(index, key) {
  return safeObject(index)[norm(key)] || [];
}

function resolveManualRow(row, resolverResult = {}) {
  const nodeIndex = safeObject(resolverResult.nodeIndex);
  const psIndex = safeObject(resolverResult.psIndex);
  const posIndex = safeObject(resolverResult.posIndex);
  const hits = row.kind === 'PS' ? indexHits(psIndex, row.key) : row.kind === 'POS' ? indexHits(posIndex, row.key) : indexHits(nodeIndex, row.key);
  return { ...row, hitCount: hits.length, matchedBy: row.kind.toLowerCase(), xmlPreview: hits.slice(0, 3).map((hit) => ({ tagName: hit.tagName, nodeKeys: hit.nodeKeys, psKey: hit.psKey, posKey: hit.posKey })) };
}

export function runXmlManualRestraints(input = {}, config = configFrom(input)) {
  const rows = parseManualRestraintRows(input.manualText || config.manualText, config.delimiter);
  const resolved = rows.map((row) => resolveManualRow(row, input.resolverJsonTraceResult));
  const matchedFacts = resolved.filter((row) => row.hitCount > 0);
  const rejectedFacts = resolved.filter((row) => row.hitCount <= 0);
  return { manualRows: rows, matchedFacts, rejectedFacts };
}

function inputXmlElements(sourceText) {
  const rows = [];
  const pattern = /<\s*(?:[A-Za-z_][\w.-]*:)?PIPINGELEMENT\b[^>]*>/gi;
  let match;
  while ((match = pattern.exec(String(sourceText || '')))) {
    const attrs = attrsFromTag(match[0]);
    const fromNode = text(attrs.FROM_NODE || attrs.FromNode || attrs.from_node);
    const toNode = text(attrs.TO_NODE || attrs.ToNode || attrs.to_node);
    if (!fromNode || !toNode) continue;
    rows.push({ rowIndex: rows.length + 1, fromNode, toNode, key: pairKey(fromNode, toNode), attrs });
  }
  return rows;
}

function pairKey(fromNode, toNode) {
  return `${norm(fromNode)}->${norm(toNode)}`;
}

export function parseElementSideLoadRows(rawText, delimiter = '|') {
  return lines(rawText).map((line, index) => {
    const [fromNode, toNode, ps, pos, typeCode, restraint] = line.split(delimiter).map(text);
    return { rowIndex: index + 1, fromNode, toNode, key: pairKey(fromNode, toNode), ps, pos, typeCode: Number(typeCode || 0), restraint, rawLine: line };
  });
}

function derivedTypes(row) {
  if ([14, 9, 8].includes(row.typeCode)) return [row.typeCode];
  return row.restraint ? [14, 9, 8] : [];
}

function matchSideLoad(row, elementMap) {
  const element = elementMap[row.key];
  const derivedRestraints = element ? derivedTypes(row).map((typeCode) => ({ fromNode: row.fromNode, toNode: row.toNode, typeCode, ps: row.ps, pos: row.pos })) : [];
  return { ...row, matched: !!element, inheritedFields: element ? inheritedFields(element.attrs) : {}, derivedRestraints };
}

function inheritedFields(attrs) {
  return Object.fromEntries(['LINE_ID', 'FROM_NAME', 'TO_NAME', 'DTXR_PS', 'DTXR_POS'].map((key) => [key, text(attrs[key])]).filter(([, value]) => value));
}

export function runInputXmlElementSideload(input = {}, config = configFrom(input)) {
  const elements = inputXmlElements(input.sourceText);
  const elementMap = Object.fromEntries(elements.map((element) => [element.key, element]));
  const sideLoadRows = parseElementSideLoadRows(input.elementSideLoadText || '', config.delimiter);
  const matchedRows = sideLoadRows.map((row) => matchSideLoad(row, elementMap));
  return {
    elements,
    sideLoadRows,
    matchedSideLoadRows: matchedRows.filter((row) => row.matched),
    unmatchedSideLoadRows: matchedRows.filter((row) => !row.matched),
    inheritedFieldPreview: matchedRows.filter((row) => row.matched).map((row) => ({ key: row.key, inheritedFields: row.inheritedFields })),
    derivedRestraintPreview: matchedRows.flatMap((row) => row.derivedRestraints),
  };
}

function diagnosticsFor(mode, xmlResult, inputResult) {
  return [
    { type: 'manual-element-mode', mode },
    { type: 'manual-restraints-matched', rows: xmlResult?.matchedFacts?.length || 0 },
    { type: 'manual-restraints-rejected', rows: xmlResult?.rejectedFacts?.length || 0 },
    { type: 'element-sideload-matched', rows: inputResult?.matchedSideLoadRows?.length || 0 },
    { type: 'element-sideload-unmatched', rows: inputResult?.unmatchedSideLoadRows?.length || 0 },
  ];
}

export function runStandaloneManualElementSideload(input = {}) {
  const sourceText = String(input.sourceText || '');
  const sourceKind = input.sourceKind === 'auto' ? detectXmlCiiWorkflowSourceKind(sourceText) : (input.sourceKind || 'xml');
  const config = configFrom(input);
  const xmlResult = sourceKind === 'inputxml' ? emptyXmlResult() : runXmlManualRestraints(input, config);
  const inputResult = sourceKind === 'inputxml' ? runInputXmlElementSideload(input, config) : emptyInputResult();
  const diagnostics = diagnosticsFor(sourceKind, xmlResult, inputResult);
  return { mode: sourceKind, config, ...xmlResult, ...inputResult, diagnostics, supportConfigJson: writeConfig(input.supportConfigJson, config) };
}

function emptyXmlResult() {
  return { manualRows: [], matchedFacts: [], rejectedFacts: [] };
}

function emptyInputResult() {
  return { elements: [], sideLoadRows: [], matchedSideLoadRows: [], unmatchedSideLoadRows: [], inheritedFieldPreview: [], derivedRestraintPreview: [] };
}
