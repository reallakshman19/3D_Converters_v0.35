function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function rows(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function pointLabel(point) {
  if (!point || typeof point !== 'object') return '';
  const values = [Number(point.x), Number(point.y), Number(point.z)];
  if (!values.every(Number.isFinite)) return '';
  const format = (value) => String(Math.round(value * 1000) / 1000);
  return `E=${format(values[0])} N=${format(values[1])} EL=${format(values[2])}`;
}

function fixedMm(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(3) : '';
}

function displayMatchType(value) {
  return {
    POS_PS: 'POS/PS',
    POS: 'POS',
    PS_FALLBACK: 'PS FALLBACK',
    POS_AMBIGUOUS: 'POS AMBIGUOUS',
    NONE: 'NONE',
  }[text(value)] || text(value).replace(/_/g, ' ');
}

function recordsFromResult(result) {
  const direct = rows(result?.resolutionLedger);
  if (direct.length) return direct;
  return rows(result?.traceResolutionLedger?.records);
}

export const XML_NODE_TRACE_HEADERS = Object.freeze([
  'XML Node',
  'XML Branch',
  'Type',
  'JsonNodeNo(DTXR_PS)',
  'JsonNodeNo(DTXR_POS)',
  'Match Type',
  'POS Basis',
  'Distance (mm)',
  'Tolerance (mm)',
  'DTXR_POS Value',
  'DTXR_PS/NAME',
  'DTXR_PS Value',
  'Effective Source',
  'Derived Restraints',
  'Status',
]);

export const EVIDENCE_TREE_HEADERS = Object.freeze([
  'Branch',
  'Bore',
  'Source Node No',
  'Position',
  'Object Type',
  'DTXR_POS',
  'NAME',
  'CMPSUPGAP',
  'ComponentRefNo',
  'Source Path',
]);

export const MATCHED_FACT_HEADERS = Object.freeze(['Path', 'Node', 'PS', 'POS', 'Hits']);

export function buildXmlNodeWiseTraceRows(result) {
  const records = recordsFromResult(result);
  if (records.length) {
    return records.map((record) => ({
      xmlNode: text(record.xmlNodeNumber || record.nodeNumber) || `Node ${record.xmlIndex || ''}`.trim(),
      xmlBranch: text(record.xmlBranch || record.branchName),
      componentType: text(record.componentType || record.tagName || 'Node'),
      jsonNodeNoDtxrPs: unique(rows(record.dtxrPsNodeNumbers)).join(' | '),
      jsonNodeNoDtxrPos: unique(rows(record.dtxrPosNodeNumbers)).join(' | '),
      matchType: displayMatchType(record.matchType),
      posBasis: pointLabel(record.matchedPosition) || text(record.xmlPosition),
      distanceMm: fixedMm(record.positionDistanceMm ?? record.distanceMm),
      toleranceMm: fixedMm(record.coordinateToleranceMm ?? record.toleranceMm),
      dtxrPosValue: text(record.dtxrPosValue || record.dtxrPos),
      dtxrPsName: text(record.dtxrPsName || record.xmlNodeName),
      dtxrPsValue: text(record.dtxrPsValue || record.dtxrPs),
      effectiveSource: text(record.effectiveSource || 'NONE'),
      derivedRestraints: unique(rows(record.derivedSupportTypes)).join(' | '),
      status: text(record.status || 'UNRESOLVED'),
    }));
  }

  return rows(result?.resolvedFacts).map((fact) => ({
    xmlNode: text(fact.nodeKeys?.[0]) || `Node ${fact.xmlIndex || ''}`.trim(),
    xmlBranch: text(fact.branchName),
    componentType: text(fact.componentType || fact.tagName || 'Node'),
    jsonNodeNoDtxrPs: text(fact.jsonNodeNoDtxrPs),
    jsonNodeNoDtxrPos: text(fact.jsonNodeNoDtxrPos),
    matchType: displayMatchType(fact.matchType || rows(fact.matchedBy).join('_').toUpperCase()),
    posBasis: text(fact.posKey),
    distanceMm: fixedMm(fact.positionDistanceMm),
    toleranceMm: fixedMm(fact.coordinateToleranceMm),
    dtxrPosValue: text(fact.dtxrPosValue),
    dtxrPsName: text(fact.dtxrPsName || fact.psKey),
    dtxrPsValue: text(fact.dtxrPsValue),
    effectiveSource: text(fact.effectiveSource || 'NONE'),
    derivedRestraints: unique(rows(fact.derivedSupportTypes)).join(' | '),
    status: text(fact.status || (Number(fact.hitCount || 0) > 0 ? 'RESOLVED_POS' : 'UNRESOLVED')),
  }));
}

function matchedEvidenceMembers(result) {
  const records = recordsFromResult(result).filter((record) => text(record.status).startsWith('RESOLVED_'));
  const directMembers = records.flatMap((record) => rows(record.positionMembers));
  if (directMembers.length) return directMembers;

  const groupIds = new Set(records.map((record) => text(record.groupId)).filter(Boolean));
  const nodeNumbers = new Set(records.flatMap((record) => [
    ...rows(record.dtxrPosNodeNumbers),
    ...rows(record.dtxrPsNodeNumbers),
  ]).map(text).filter(Boolean));
  const groups = rows(result?.traceResolutionLedger?.groups || result?.positionIndex?.groups);
  const output = [];
  for (const group of groups) {
    const groupMatched = groupIds.has(text(group?.id));
    for (const entry of rows(group?.entries)) {
      if (groupMatched || nodeNumbers.has(text(entry?.jsonNodeNo))) output.push({
        jsonNodeNo: entry.jsonNodeNo,
        sourcePath: entry.path,
        branchName: entry.branchName || group?.branch?.original || group?.branch?.full,
        bore: entry.bore,
        point: entry.point || group?.anchor,
        type: entry.type,
        name: entry.name,
        dtxrPosValue: entry.labeled || entry.description,
        cmpSupGap: entry.cmpSupGap,
        componentRefNo: entry.componentRef,
      });
    }
  }
  return output;
}

export function buildEvidenceTreeRows(result) {
  const output = [];
  const seen = new Set();
  for (const member of matchedEvidenceMembers(result)) {
    const row = {
      branch: text(member.branchName),
      bore: text(member.bore),
      sourceNodeNo: text(member.jsonNodeNo),
      position: pointLabel(member.point),
      objectType: text(member.type),
      dtxrPos: text(member.dtxrPosValue || member.labeled || member.description),
      name: text(member.name),
      cmpSupGap: text(member.cmpSupGap),
      componentRefNo: text(member.componentRefNo || member.componentRef),
      sourcePath: text(member.sourcePath || member.path),
    };
    const key = [row.sourcePath, row.sourceNodeNo, row.position, row.objectType, row.dtxrPos].join('\u001f');
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }
  return output;
}

export function buildMatchedFactsRows(result) {
  return rows(result?.matchedFacts).map((fact) => {
    const record = fact.ledgerRecord || {};
    const paths = unique(rows(fact.sourcePaths).length ? fact.sourcePaths : rows(record.sourcePaths));
    const position = pointLabel(record.matchedPosition) || text(fact.posKey || record.xmlPosition);
    return {
      path: paths.join(' | ') || text(fact.path || fact._path),
      nodeKey: text(record.xmlNodeNumber || fact.nodeKey || fact.nodeKeys?.[0]),
      psKey: text(record.dtxrPsName || fact.dtxrPsName || fact.psKey),
      posKey: position,
      hitCount: Number(fact.hitCount || 0),
    };
  });
}

function valueForHeader(row, header) {
  return {
    'XML Node': row.xmlNode,
    'XML Branch': row.xmlBranch,
    Type: row.componentType,
    'JsonNodeNo(DTXR_PS)': row.jsonNodeNoDtxrPs,
    'JsonNodeNo(DTXR_POS)': row.jsonNodeNoDtxrPos,
    'Match Type': row.matchType,
    'POS Basis': row.posBasis,
    'Distance (mm)': row.distanceMm,
    'Tolerance (mm)': row.toleranceMm,
    'DTXR_POS Value': row.dtxrPosValue,
    'DTXR_PS/NAME': row.dtxrPsName,
    'DTXR_PS Value': row.dtxrPsValue,
    'Effective Source': row.effectiveSource,
    'Derived Restraints': row.derivedRestraints,
    Status: row.status,
    Branch: row.branch,
    Bore: row.bore,
    'Source Node No': row.sourceNodeNo,
    Position: row.position,
    'Object Type': row.objectType,
    DTXR_POS: row.dtxrPos,
    NAME: row.name,
    CMPSUPGAP: row.cmpSupGap,
    ComponentRefNo: row.componentRefNo,
    'Source Path': row.sourcePath,
    Path: row.path,
    Node: row.nodeKey,
    PS: row.psKey,
    POS: row.posKey,
    Hits: row.hitCount,
  }[header] ?? row[header] ?? '';
}

function csvCell(value) {
  const source = String(value ?? '');
  return /[",\r\n]/.test(source) ? `"${source.replace(/"/g, '""')}"` : source;
}

export function serializeRowsToCsv(headers, data, options = {}) {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows(data)) lines.push(headers.map((header) => csvCell(valueForHeader(row, header))).join(','));
  return `${options.bom === false ? '' : '\uFEFF'}${lines.join('\r\n')}\r\n`;
}

export function serializeRowsToTsv(headers, data) {
  const clean = (value) => String(value ?? '').replace(/[\t\r\n]+/g, ' ');
  const lines = [headers.map(clean).join('\t')];
  for (const row of rows(data)) lines.push(headers.map((header) => clean(valueForHeader(row, header))).join('\t'));
  return `${lines.join('\n')}\n`;
}

export function buildEvidenceTreeCsv(result) {
  return serializeRowsToCsv(EVIDENCE_TREE_HEADERS, buildEvidenceTreeRows(result));
}

export function buildXmlNodeWiseTraceCsv(result) {
  return serializeRowsToCsv(XML_NODE_TRACE_HEADERS, buildXmlNodeWiseTraceRows(result));
}

export function buildMatchedFactsTsv(result) {
  return serializeRowsToTsv(MATCHED_FACT_HEADERS, buildMatchedFactsRows(result));
}
