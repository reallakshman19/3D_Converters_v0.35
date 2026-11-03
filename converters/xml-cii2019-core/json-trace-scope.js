export const XML_CII_JSON_TRACE_SCOPE_SCHEMA = 'xml-cii-json-trace-scope/v4';

const clean = (value) => String(value ?? '').trim();
const upper = (value) => clean(value).toUpperCase();
const stripXml = (value) => clean(value).replace(/<[^>]+>/g, ' ');
const uniq = (items = []) => [...new Set(items.map(clean).filter(Boolean))];

export function normalizeTraceText(value) {
  return stripXml(value).replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&amp;/gi, '&').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toUpperCase();
}

function decodeTraceLiteral(value) {
  return stripXml(value).replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&amp;/gi, '&').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}

export function normalizeBranchTraceKey(value) {
  const text = normalizeTraceText(value).replace(/^\s*=\s*/, '').replace(/\s+/g, '').replace(/['"]/g, '').replace(/^\/*/, '/');
  return text.replace(/\/B0*(\d+)$/i, '/B$1');
}

export function branchBaseTraceKey(value) {
  return normalizeBranchTraceKey(value).replace(/\/B\d+$/i, '');
}

export function normalizeTraceScopeOptions(options = {}) {
  return Object.freeze({ includeBranch: options.includeBranch !== false, includeDtxrPos: options.includeDtxrPos !== false, includeDtxrPs: options.includeDtxrPs !== false, includeDelimitedPs: options.includeDelimitedPs !== false, includeUnmatched: options.includeUnmatched === true });
}

export function branchContainsMatch(xmlBranchName, stagedBranchName) {
  const left = normalizeBranchTraceKey(xmlBranchName), right = normalizeBranchTraceKey(stagedBranchName);
  if (!left || !right) return null;
  if (left === right) return { matchType: 'BRANCH_EXACT', xmlBranchKey: left, stagedBranchKey: right };
  if (branchBaseTraceKey(left) && branchBaseTraceKey(left) === branchBaseTraceKey(right)) return { matchType: 'BRANCH_BASE', xmlBranchKey: left, stagedBranchKey: right };
  if (left.includes(right) || right.includes(left)) return { matchType: 'BRANCH_CONTAINS', xmlBranchKey: left, stagedBranchKey: right };
  return null;
}

export function splitDelimitedSupportTags(value) {
  return uniq(decodeTraceLiteral(value).split(/[=,;|\/\s]+/g)).filter((part) => /^PS[-A-Za-z0-9.]+$/.test(part));
}

export function normalizeSupportTraceTag(value) {
  return normalizeTraceText(value).replace(/[^A-Z0-9.]+/g, '').replace(/\.0+$/g, '');
}

function supportMatchKeys(value) {
  const literal = clean(value);
  const normalized = normalizeSupportTraceTag(literal);
  return uniq([literal, upper(literal), normalized, normalized.replace(/\.\d+$/g, ''), normalized.replace(/^PS/, 'PS-'), normalized.replace(/^PS-/, 'PS')]);
}

export function supportTagTraceVariants(value) {
  const tokens = splitDelimitedSupportTags(value);
  return uniq((tokens.length ? tokens : [value]).flatMap(supportMatchKeys));
}

function tagContent(xmlText, tagName) {
  const rows = [];
  const re = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  let match;
  while ((match = re.exec(String(xmlText || '')))) rows.push(clean(match[1]));
  return rows;
}

function nodeBlocks(xmlText) {
  const rows = [];
  const re = /<Node\b[^>]*>[\s\S]*?<\/Node>/gi;
  let match;
  while ((match = re.exec(String(xmlText || '')))) rows.push(match[0]);
  return rows;
}

function textFromBlock(block, tag) {
  return tagContent(block, tag)[0] || '';
}

export function extractXmlTraceKeysFromText(xmlText = '') {
  const branches = uniq([...tagContent(xmlText, 'Branchname'), ...tagContent(xmlText, 'LineNo')]);
  const nodes = [];
  for (const block of nodeBlocks(xmlText)) {
    const branchName = branches.find((branch) => String(xmlText).indexOf(branch) <= String(xmlText).indexOf(block)) || branches[0] || '';
    const dtxrPs = textFromBlock(block, 'DTXR_PS') || textFromBlock(block, 'DtxrPs');
    const dtxrPos = textFromBlock(block, 'DTXR_POS') || textFromBlock(block, 'DtxrPos');
    const supportSeed = [textFromBlock(block, 'NodeName'), textFromBlock(block, 'ComponentRefNo'), dtxrPs].join(' ');
    nodes.push(Object.freeze({ branchName, branchKey: normalizeBranchTraceKey(branchName), branchBaseKey: branchBaseTraceKey(branchName), nodeNumber: textFromBlock(block, 'NodeNumber'), componentRefNo: textFromBlock(block, 'ComponentRefNo'), dtxrPos, dtxrPs, supportTags: Object.freeze(supportTagTraceVariants(supportSeed)), componentType: textFromBlock(block, 'ComponentType') }));
  }
  return Object.freeze({ schema: XML_CII_JSON_TRACE_SCOPE_SCHEMA, branches: Object.freeze(branches), branchKeys: Object.freeze(uniq(branches.map(normalizeBranchTraceKey))), branchBaseKeys: Object.freeze(uniq(branches.map(branchBaseTraceKey))), nodes: Object.freeze(nodes), supportTags: Object.freeze(uniq(nodes.flatMap((node) => node.supportTags))), dtxrPosTexts: Object.freeze(uniq(nodes.map((node) => normalizeTraceText(node.dtxrPos)))), dtxrPsTexts: Object.freeze(uniq(nodes.map((node) => normalizeTraceText(node.dtxrPs)))) });
}

function traceBranch(row) {
  return row?.branchName || row?.owner || row?.sourceBranchName || '';
}

function traceValue(row) {
  return row?.finalValue || row?.sourceRawValue || row?.value || '';
}

function firstBranchMatch(row, keys) {
  for (const branch of keys.branches || []) {
    const hit = branchContainsMatch(branch, traceBranch(row));
    if (hit) return hit;
  }
  return null;
}

function firstPsMatch(row, keys) {
  const xmlTags = new Set(keys.supportTags || []);
  for (const token of splitDelimitedSupportTags(`${traceValue(row)} ${row?.sourceAttributeName || ''}`)) {
    if (supportMatchKeys(token).some((key) => xmlTags.has(key))) return { matchType: 'DTXR_PS_DELIMITED_TAG', matchedToken: token, priority: 2 };
  }
  return null;
}

function firstDtxrTextMatch(row, keys, fieldName) {
  const value = normalizeTraceText(traceValue(row));
  const hay = fieldName === 'DTXR_PS' ? keys.dtxrPsTexts : keys.dtxrPosTexts;
  const hit = (hay || []).find((item) => item && value && (item.includes(value) || value.includes(item)));
  if (!hit) return null;
  const isPs = fieldName === 'DTXR_PS';
  return { matchType: isPs ? 'DTXR_PS_CONTAINS' : 'DTXR_POS_CONTAINS', matchedText: hit, priority: isPs ? 2 : 1 };
}

function dtxrSourceText(row) {
  return upper(`${row?.field || ''} ${row?.sourceAttributeName || ''} ${row?.sourcePath || ''}`);
}

function fallbackDtxrMatch(row, opts, branch, fieldName) {
  if (!branch || !/DTXR/.test(dtxrSourceText(row))) return null;
  const value = clean(traceValue(row)).slice(0, 120);
  if (fieldName === 'DTXR_PS' && opts.includeDtxrPs) return { ...branch, matchType: 'DTXR_PS_SOURCE_ROW', matchedText: value, priority: 2 };
  if (opts.includeDtxrPos) return { ...branch, matchType: 'DTXR_POS_SOURCE_ROW', matchedText: value, priority: 1 };
  return null;
}

export function classifyTraceRowAgainstXmlKeys(row = {}, xmlTraceKeys = {}, options = {}) {
  const opts = normalizeTraceScopeOptions(options);
  const branch = opts.includeBranch ? firstBranchMatch(row, xmlTraceKeys) : null;
  const source = dtxrSourceText(row);
  const explicitPs = /DTXR[_\s-]*PS|CMPSTRESS|CMPSUP/.test(source);
  if (!explicitPs && /DTXR|DESC|DESCRIPTION|POSITION/.test(source)) {
    const textMatch = opts.includeDtxrPos ? firstDtxrTextMatch(row, xmlTraceKeys, 'DTXR_POS') : null;
    return textMatch || fallbackDtxrMatch(row, opts, branch, 'DTXR_POS') || branch;
  }
  if (explicitPs) {
    const tagMatch = opts.includeDtxrPs && opts.includeDelimitedPs ? firstPsMatch(row, xmlTraceKeys) : null;
    const textMatch = opts.includeDtxrPs ? firstDtxrTextMatch(row, xmlTraceKeys, 'DTXR_PS') : null;
    return tagMatch || textMatch || fallbackDtxrMatch(row, opts, branch, 'DTXR_PS') || branch;
  }
  return branch;
}

export function filterStagedTraceRowsForXml(traceRows = [], xmlTraceKeys = {}, options = {}) {
  const opts = normalizeTraceScopeOptions(options);
  const rows = [];
  let filteredOutRows = 0;
  for (const row of traceRows || []) {
    const match = classifyTraceRowAgainstXmlKeys(row, xmlTraceKeys, opts);
    if (!match && !opts.includeUnmatched) { filteredOutRows += 1; continue; }
    rows.push(Object.freeze({ ...row, xmlTraceScope: match?.matchType || 'UNMATCHED_FILTERED_OUT', matchedToken: match?.matchedToken || '', matchedText: match?.matchedText || '', dtxrPriority: match?.priority || '', xmlBranchKey: match?.xmlBranchKey || '', stagedBranchKey: match?.stagedBranchKey || '' }));
  }
  return Object.freeze({ schema: XML_CII_JSON_TRACE_SCOPE_SCHEMA, rows: Object.freeze(rows), summary: Object.freeze({ inputRows: traceRows.length || 0, scopedRows: rows.filter((row) => row.xmlTraceScope !== 'UNMATCHED_FILTERED_OUT').length, unmatchedRows: filteredOutRows + rows.filter((row) => row.xmlTraceScope === 'UNMATCHED_FILTERED_OUT').length, branchMatches: rows.filter((row) => /^BRANCH_/.test(row.xmlTraceScope)).length, dtxrPosMatches: rows.filter((row) => /^DTXR_POS/.test(row.xmlTraceScope)).length, dtxrPsMatches: rows.filter((row) => /^DTXR_PS/.test(row.xmlTraceScope)).length, scopeOptions: opts }) });
}

export function buildXmlTypedJsonTraceRows({ xmlText = '', traceRows = [], options = {} } = {}) {
  const xmlTraceKeys = extractXmlTraceKeysFromText(xmlText);
  return Object.freeze({ xmlTraceKeys, ...filterStagedTraceRowsForXml(traceRows, xmlTraceKeys, options) });
}
