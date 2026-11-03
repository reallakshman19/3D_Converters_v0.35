/**
 * Resolver result builder for CSV/XLS alternatives to staged JSON trace data.
 * Table rows are grouped by branch-compatible coordinates before XML matching,
 * then adapted into the same one-record-per-XML-node ledger contract.
 */
import {
  REQUIRED_TRACE_TABLE_FIELD_NAMES,
  autoMapTraceTableFields,
  headersFromTraceRows,
  mapTraceTableRows,
  parseTraceTableText,
} from './xml-cii-table-trace-table.js';
import {
  buildTraceTableRowIndex,
  findTraceTablePsRow,
  matchTraceTableNode,
  traceTableMatchSummary,
} from './xml-cii-table-trace-match.js';
import { parseStandaloneDtxrXmlNodes } from './xml-cii-trace-resolution-ledger.js';

export {
  TRACE_TABLE_FIELDS,
  autoMapTraceTableFields,
  headersFromTraceRows,
  parseTraceTableText,
  rowsToTraceTableText,
} from './xml-cii-table-trace-table.js';

const TABLE_LEDGER_SCHEMA = 'xml-cii-table-trace-resolution-ledger/v1';

function text(value) { return String(value ?? '').trim(); }
function normText(value) { return text(value).replace(/\s+/g, ' ').toUpperCase(); }

function uniqueValues(values) {
  const seen = new Set();
  const output = [];
  for (const value of values.map(text).filter(Boolean)) {
    const key = normText(value);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function normalizeSupportTag(value) {
  const match = text(value).toUpperCase().match(/\/?PS-?\d+(?:\.\d+)?/);
  return match ? match[0].replace(/^\/+/, '').replace(/^PS-/i, 'PS') : '';
}

function pointLabel(point, raw = '') {
  if (!point) return text(raw);
  const format = (value) => String(Math.round(Number(value) * 1000) / 1000);
  return `E=${format(point.x)} N=${format(point.y)} EL=${format(point.z)}`;
}

function extractXmlTraceNodes(sourceText) {
  return parseStandaloneDtxrXmlNodes(sourceText).map((node) => ({
    ...node,
    nodeNumber: node.xmlNodeNumber || node.nodeKeys?.[0] || '',
    nodeName: node.xmlNodeName || node.psKey || '',
    nodeKeys: node.nodeKeys?.length ? node.nodeKeys : [node.xmlNodeNumber || '-1'],
    psKey: node.psKey || node.xmlNodeName || node.componentRefNo || '',
    posPoint: node.posPoint || node.xmlPoint || null,
    posKey: node.posKey || pointLabel(node.xmlPoint, node.xmlPosition),
    branchName: node.xmlBranch || node.branchName || '',
  }));
}

function labeledDtxrPos(row) {
  const value = text(row.dtxrPos);
  if (!value) return '';
  const name = text(row.nodeName);
  if (!name || /\bNAME\s*=/i.test(value)) return value;
  return `${value}(NAME=${name})`;
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

function rowMember(row) {
  return {
    jsonNodeNo: text(row.sourceRowNo || row._rowIndex),
    sourceRowNo: text(row.sourceRowNo || row._rowIndex),
    sourcePath: row.sourcePath || `table[${row._rowIndex}]`,
    branchName: row.branchName,
    bore: row.bore,
    point: row.positionPoint || null,
    type: row.componentType,
    name: row.nodeName,
    dtxrPosValue: labeledDtxrPos(row),
    dtxrPsValue: text(row.dtxrPs),
    cmpSupGap: row.cmpSupGap,
    componentRefNo: row.componentRefNo,
    supportReference: row.supportReference,
    componentSpec: row.componentSpec,
    site: row.site,
    raw: row.raw,
  };
}

function candidatePreview(candidates) {
  return (Array.isArray(candidates) ? candidates : []).slice(0, 10).map((row) => ({
    rowIndex: row._rowIndex,
    componentRefNo: row.componentRefNo,
    nodeName: row.nodeName,
    position: row.position,
    componentType: row.componentType,
    branchName: row.branchName,
    dtxrPos: row.dtxrPos,
  }));
}

function controlledOutcome(decision, dtxrPosValue, dtxrPsValue) {
  if (decision.status === 'ambiguous' || decision.status === 'review') {
    return { matchType: 'POS_AMBIGUOUS', status: 'AMBIGUOUS_REVIEW' };
  }
  if (!dtxrPosValue && dtxrPsValue) return { matchType: 'PS_FALLBACK', status: 'RESOLVED_PS_FALLBACK' };
  if (!dtxrPosValue) return { matchType: 'NONE', status: 'UNRESOLVED' };
  const coordinate = decision.method.startsWith('coordinate-group');
  if (coordinate && dtxrPsValue) return { matchType: 'POS_PS', status: 'RESOLVED_POS_PS' };
  if (coordinate) return { matchType: 'POS', status: 'RESOLVED_POS' };
  if (dtxrPsValue) return { matchType: 'KEY_PS', status: 'RESOLVED_KEY_PS' };
  return { matchType: 'KEY', status: 'RESOLVED_KEY' };
}

function recordForNode(node, decision, rowIndex, traceConfig) {
  const acceptedRows = decision.status === 'accepted' ? decision.rows || [] : [];
  const psMatch = findTraceTablePsRow(node, rowIndex, acceptedRows);
  const psRow = psMatch?.row || null;
  const dtxrPosValues = uniqueValues(acceptedRows.map(labeledDtxrPos));
  const dtxrPosValue = dtxrPosValues.join(' | ');
  const dtxrPsValue = psRow ? text(psRow.dtxrPs || psRow.supportReference || psRow.dtxrPos) : '';
  const outcome = controlledOutcome(decision, dtxrPosValue, dtxrPsValue);
  const effectiveDtxr = dtxrPosValue || dtxrPsValue;
  const members = acceptedRows.length ? acceptedRows : (psRow ? [psRow] : []);
  const relationship = decision.relationship || psMatch?.relationship || null;
  const selectedGroup = decision.group || null;
  const sourceRows = uniqueValues(members.map((row) => row.sourceRowNo || row._rowIndex));
  const psSourceRows = psRow ? [text(psRow.sourceRowNo || psRow._rowIndex)] : [];
  return {
    schema: TABLE_LEDGER_SCHEMA,
    xmlIndex: node.xmlIndex,
    xmlNodeNumber: node.nodeNumber,
    nodeNumber: node.nodeNumber,
    xmlNodeName: node.nodeName,
    nodeName: node.nodeName,
    componentType: node.componentType,
    componentRefNo: node.componentRefNo,
    xmlBranch: node.branchName,
    branchName: node.branchName,
    xmlPosition: node.xmlPosition || node.posKey,
    xmlPoint: node.posPoint,
    sourceKind: 'table',
    sourceBranch: selectedGroup?.branch?.original || acceptedRows[0]?.branchName || psRow?.branchName || '',
    stagedBranch: selectedGroup?.branch?.original || acceptedRows[0]?.branchName || psRow?.branchName || '',
    branchRelationship: relationship?.method || '',
    coordinateToleranceMm: Number(traceConfig.coordinateTolerance) || 0,
    toleranceMm: Number(traceConfig.coordinateTolerance) || 0,
    matchedPosition: selectedGroup?.anchor || acceptedRows[0]?.positionPoint || psRow?.positionPoint || null,
    positionDistanceMm: Number.isFinite(Number(decision.distance)) ? Number(decision.distance) : null,
    distanceMm: Number.isFinite(Number(decision.distance)) ? Number(decision.distance) : null,
    maxInternalDistanceMm: selectedGroup?.maxInternalDistanceMm ?? null,
    dtxrPosNodeNumbers: acceptedRows.length ? sourceRows : [],
    dtxrPsNodeNumbers: psSourceRows,
    sourceRowNumbers: sourceRows,
    positionMembers: members.map(rowMember),
    sourcePaths: members.map((row) => row.sourcePath || `table[${row._rowIndex}]`),
    dtxrPosValue,
    dtxrPos: dtxrPosValue,
    dtxrPosValues,
    dtxrPsName: normalizeSupportTag(node.nodeName || node.psKey || node.componentRefNo),
    dtxrPsValue,
    dtxrPs: dtxrPsValue,
    effectiveDtxr,
    effectiveSource: dtxrPosValue ? 'DTXR_POS' : (dtxrPsValue ? 'DTXR_PS_FALLBACK' : 'NONE'),
    fallbackUsed: !dtxrPosValue && !!dtxrPsValue,
    derivedSupportTypes: supportKinds(effectiveDtxr),
    matchMethod: decision.method,
    matchType: outcome.matchType,
    status: outcome.status,
    candidateCount: decision.groupCandidates?.length || decision.candidates?.length || acceptedRows.length,
    groupId: selectedGroup?.id || '',
    rejectedCandidates: outcome.status === 'AMBIGUOUS_REVIEW' ? candidatePreview(decision.candidates) : [],
  };
}

function factFromRecord(record, node) {
  const members = record.positionMembers || [];
  const first = members[0] || {};
  const matched = record.status.startsWith('RESOLVED_');
  return {
    ...node,
    matchedBy: matched ? [record.matchMethod] : [],
    matchStatus: record.status,
    candidateCount: record.candidateCount,
    hitCount: matched ? Math.max(1, members.length) : 0,
    xmlHits: matched ? [record.xmlIndex] : [],
    path: record.sourcePaths.join(' | '),
    stagedBranchKey: record.sourceBranch,
    stagedBore: first.bore || '',
    dtxrPosValue: record.dtxrPosValue,
    dtxrPsValue: record.dtxrPsValue,
    dtxrPsName: record.dtxrPsName,
    cmpSupGap: members.find((member) => text(member.cmpSupGap))?.cmpSupGap || '',
    sourcePosition: pointLabel(record.matchedPosition, ''),
    sourceComponentType: first.type || '',
    componentSpec: first.componentSpec || '',
    site: first.site || '',
    jsonNodeNosDtxrPos: record.dtxrPosNodeNumbers,
    jsonNodeNosDtxrPs: record.dtxrPsNodeNumbers,
    jsonNodeNoDtxrPos: record.dtxrPosNodeNumbers.join('|'),
    jsonNodeNoDtxrPs: record.dtxrPsNodeNumbers.join('|'),
    effectiveDtxr: record.effectiveDtxr,
    effectiveSource: record.effectiveSource,
    fallbackUsed: record.fallbackUsed,
    derivedSupportTypes: record.derivedSupportTypes,
    matchType: record.matchType,
    status: record.status,
    positionDistanceMm: record.positionDistanceMm,
    coordinateToleranceMm: record.coordinateToleranceMm,
    branchRelationship: record.branchRelationship,
    groupId: record.groupId,
    sourcePaths: record.sourcePaths,
    positionMembers: record.positionMembers,
    ledgerRecord: record,
    rejectedCandidates: record.rejectedCandidates,
    raw: first.raw || null,
  };
}

function missingRequired(fieldMap) {
  return REQUIRED_TRACE_TABLE_FIELD_NAMES.filter((fieldName) => !text(fieldMap?.[fieldName]));
}

function missingMatchBasis(fieldMap) {
  return ['componentRefNo', 'nodeName', 'position'].every((fieldName) => !text(fieldMap?.[fieldName]));
}

export function buildTraceTableResolverResult(input) {
  const safeInput = input || {};
  const traceConfig = safeInput.traceConfig || {};
  const rawRows = Array.isArray(safeInput.rawRows) ? safeInput.rawRows : parseTraceTableText(safeInput.tableText);
  const headers = headersFromTraceRows(rawRows);
  const fieldMap = safeInput.fieldMap && Object.keys(safeInput.fieldMap).length ? safeInput.fieldMap : autoMapTraceTableFields(headers, rawRows, traceConfig);
  const mappedRows = mapTraceTableRows(rawRows, fieldMap).filter((row) => row.componentRefKey || row.nodeNameKey || row.position || row.componentType || row.dtxrPos);
  const nodes = extractXmlTraceNodes(safeInput.sourceText || '');
  const rowIndex = buildTraceTableRowIndex(mappedRows, traceConfig);
  const matchSummary = traceTableMatchSummary(headers, rowIndex, traceConfig);
  const records = nodes.map((node) => recordForNode(node, matchTraceTableNode(node, rowIndex, traceConfig), rowIndex, matchSummary));
  const nodeByIndex = new Map(nodes.map((node) => [node.xmlIndex, node]));
  const resolvedFacts = records.map((record) => factFromRecord(record, nodeByIndex.get(record.xmlIndex)));
  const matchedFacts = resolvedFacts.filter((fact) => fact.hitCount > 0);
  const rejectedFacts = resolvedFacts.filter((fact) => fact.hitCount <= 0);
  const missing = missingRequired(fieldMap);
  const diagnostics = [
    { type: 'resolver-table-trace-source-kind', sourceKind: 'table' },
    { type: 'resolver-table-trace-profile', ...matchSummary },
    { type: 'resolver-table-trace-coordinate-groups', groups: rowIndex.coordinateGroups.length, rows: matchSummary.coordinateRowCount, toleranceMm: matchSummary.coordinateTolerance },
    { type: 'resolver-table-trace-rows', rows: rawRows.length, mappedRows: mappedRows.length },
    { type: 'resolver-table-trace-matched-facts', rows: matchedFacts.length },
    { type: 'resolver-table-trace-rejected-facts', rows: rejectedFacts.length },
  ];
  if (missing.length) diagnostics.unshift({ type: 'resolver-table-trace-required-map-missing', fields: missing, level: 'warning' });
  if (missingMatchBasis(fieldMap)) diagnostics.unshift({ type: 'resolver-table-trace-match-basis-missing', fields: ['componentRefNo', 'nodeName', 'position'], level: 'warning' });
  return {
    sourceKind: 'table',
    nodes,
    rawRows,
    fieldMap,
    mappedRows: rowIndex.rows,
    traceConfig: matchSummary,
    indexStats: {
      xmlNodeCount: nodes.length,
      nodeKeyCount: nodes.filter((node) => node.nodeNumber).length,
      psKeyCount: nodes.filter((node) => node.psKey).length,
      posKeyCount: nodes.filter((node) => node.posKey).length,
    },
    positionIndex: { groups: rowIndex.coordinateGroups, entries: rowIndex.rows, count: rowIndex.rows.length },
    resolutionLedger: records,
    traceResolutionLedger: {
      schema: TABLE_LEDGER_SCHEMA,
      records,
      ledger: records,
      groups: rowIndex.coordinateGroups,
      diagnostics,
    },
    resolvedFacts,
    matchedFacts,
    rejectedFacts,
    diagnostics,
    traceRows: matchedFacts.flatMap((fact) => fact.positionMembers.map((member) => ({
      Branch: member.branchName || fact.stagedBranchKey || fact.branchName,
      Bore: member.bore,
      POS: pointLabel(member.point, fact.posKey),
      DTXR_POS: member.dtxrPosValue,
    }))),
  };
}

function factValues(fact) {
  return [fact?.dtxrPosValue, fact?.dtxrPsValue].map(normText).filter(Boolean);
}

function evidenceTokens(value) {
  return uniqueValues(text(value).split(/\s*\|\s*/).map(normText).filter(Boolean));
}

export function compareTraceResultsByComponentRef(jsonResult, tableResult) {
  const jsonByIndex = new Map();
  for (const fact of jsonResult?.matchedFacts || []) {
    if (!jsonByIndex.has(fact.xmlIndex)) jsonByIndex.set(fact.xmlIndex, []);
    jsonByIndex.get(fact.xmlIndex).push(fact);
  }
  const compared = [];
  for (const tableFact of tableResult?.matchedFacts || []) {
    const expectedTokens = evidenceTokens(tableFact.dtxrPosValue);
    if (!expectedTokens.length) continue;
    const jsonValues = (jsonByIndex.get(tableFact.xmlIndex) || []).flatMap(factValues);
    const matched = expectedTokens.every((expected) => jsonValues.some((value) => value === expected || value.includes(expected) || expected.includes(value)));
    compared.push({
      xmlIndex: tableFact.xmlIndex,
      nodeNumber: tableFact.nodeNumber,
      componentRefNo: tableFact.componentRefNo,
      expected: tableFact.dtxrPosValue,
      expectedTokens,
      matched,
      jsonValues,
    });
  }
  const matched = compared.filter((row) => row.matched).length;
  const percent = compared.length ? (matched / compared.length) * 100 : 0;
  return { compared: compared.length, matched, mismatched: compared.length - matched, percent, rows: compared };
}
