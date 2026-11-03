import { buildAivCanvasReadinessIndex } from './aiv-canvas-readiness-projection.js';
import {
  buildAivCanvasAssessmentResultSummary,
  buildAivCanvasResultIndex,
} from './aiv-canvas-result-projection.js';

export const AIV_CANVAS_PROJECTION_SCHEMA = 'AivCanvasProjection.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function text(value) { return String(value ?? '').trim(); }

function tableRecords(table) {
  if (!Array.isArray(table?.header) || !Array.isArray(table?.rows)) return [];
  return table.rows.map((row, rowIndex) => ({
    rowIndex,
    values: Object.fromEntries(table.header.map((column, columnIndex) => [column, text(row?.[columnIndex])])),
  }));
}

function workingTables(input) { return input.assumptionResolution?.tables ?? input.tables ?? {}; }
function topologyElements(topology) { return Array.isArray(topology?.elements) ? topology.elements : []; }
function topologyById(topology) { return new Map(topologyElements(topology).map((item) => [text(item.canonicalId), item])); }

function assumptionsByRow(resolution) {
  const map = new Map();
  for (const item of resolution?.assumptions ?? []) {
    const tableKind = text(item.tableKind);
    const rowIndex = Number(item.rowIndex);
    if (!tableKind || !Number.isInteger(rowIndex) || rowIndex < 0) continue;
    const key = `${tableKind}:${rowIndex}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      tableKind, rowIndex, column: text(item.column), assumedValue: text(item.assumedValue),
      profilePath: text(item.profilePath), reason: text(item.reason),
    });
  }
  for (const assumptions of map.values()) assumptions.sort((a, b) => a.column.localeCompare(b.column));
  return map;
}

function rowAssumptions(context, tableKind, rowIndex) { return context.assumptions.get(`${tableKind}:${rowIndex}`) ?? []; }

function sourceIcon(type) {
  return ({
    RELIEF_VALVE: 'RELIEF_VALVE', CONTROL_VALVE: 'CONTROL_VALVE',
    RESTRICTION_ORIFICE: 'RESTRICTION_ORIFICE', PRESSURE_REDUCING_BRANCH_CONNECTION: 'PRESSURE_REDUCING_DEVICE',
  })[text(type)] ?? 'UNKNOWN_SOURCE';
}

function assessmentIcon(type) {
  return ({
    WELDOLET: 'WELDOLET', WELDED_TEE: 'WELDED_TEE', WELDED_SUPPORT: 'WELDED_SUPPORT',
    OTHER_WELDED_DISCONTINUITY: 'OTHER_WELDED_DISCONTINUITY',
  })[text(type)] ?? 'UNKNOWN_ASSESSMENT';
}

function readinessGlyphs(status) {
  const value = text(status);
  if (['NOT_READY', 'METHOD_GAP'].includes(value)) return ['WARNING', 'INPUT_INCOMPLETE'];
  return [];
}

function sourceStatusGlyphs(values, result, assumptions, readinessStatus) {
  const glyphs = [];
  const state = text(values['Source State']);
  if (state === 'CLOSED') glyphs.push('CLOSED');
  else if (state) glyphs.push('ACTIVE');
  const sonic = text(values['Sonic State']);
  if (sonic === 'SONIC') glyphs.push('SONIC');
  else if (sonic === 'NON_SONIC') glyphs.push('NON_SONIC');
  if (text(values['Low Noise Trim State']) === 'MANUFACTURER_REDUCTION') glyphs.push('TRIMMED');
  if (assumptions.length) glyphs.push('ASSUMPTION');
  glyphs.push(...readinessGlyphs(readinessStatus));
  if (result) glyphs.push('RESULT_AVAILABLE');
  if (text(values.Source) || text(values['Source Revision']) || text(values['Record ID'])) glyphs.push('TRACE_AVAILABLE');
  return [...new Set(glyphs)];
}

function assessmentStatusGlyphs(values, results, assumptions, readinessStatus) {
  const glyphs = [];
  if (assumptions.length) glyphs.push('ASSUMPTION');
  glyphs.push(...readinessGlyphs(readinessStatus));
  if (results.length) glyphs.push('RESULT_AVAILABLE');
  if (text(values.Source) || text(values['Source Revision']) || text(values['Record ID'])) glyphs.push('TRACE_AVAILABLE');
  return [...new Set(glyphs)];
}

function relationshipStatusGlyphs(values, contribution, assumptions, readinessStatus) {
  const glyphs = [];
  const applicability = text(values['Applicability Disposition']);
  if (applicability === 'APPLICABLE') glyphs.push('APPLICABLE');
  else if (applicability === 'NOT_APPLICABLE') glyphs.push('NOT_APPLICABLE');
  else glyphs.push('UNRESOLVED');
  if (assumptions.length) glyphs.push('ASSUMPTION');
  glyphs.push(...readinessGlyphs(readinessStatus));
  if (contribution) glyphs.push('RESULT_AVAILABLE');
  if (text(values['Distance Source']) || text(values.Source) || text(values['Record ID'])) glyphs.push('TRACE_AVAILABLE');
  return [...new Set(glyphs)];
}

function relationshipCasesByAssessment(records) {
  const map = new Map();
  for (const { values } of records) {
    const id = text(values['Assessment Canonical ID']);
    const caseId = text(values['Operating Case']);
    if (!id || !caseId) continue;
    if (!map.has(id)) map.set(id, new Set());
    map.get(id).add(caseId);
  }
  return map;
}

function assessmentCaseIds(context, canonicalId, results) {
  const ids = [
    ...results.map((item) => text(item.caseId)),
    ...(context.readiness.assessmentCaseIds.get(canonicalId) ?? []),
    ...(context.relationshipCases.get(canonicalId) ?? []),
  ].filter(Boolean);
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

function sourceNodes(records, context) {
  return records.flatMap(({ rowIndex, values }) => {
    const canonicalId = text(values['Source Canonical ID']);
    const caseId = text(values['Operating Case']);
    if (!canonicalId || !caseId) return [];
    const topo = context.topology.get(canonicalId) ?? {};
    const result = context.sourceResults.get(`${canonicalId}\u0000${caseId}`) ?? null;
    const assumptions = rowAssumptions(context, 'sources', rowIndex);
    const readinessStatus = context.readiness.sourceStatus.get(`${canonicalId}\u0000${caseId}`) ?? null;
    return [{
      nodeKey: `SOURCE:${canonicalId}:${caseId}`, canonicalId, caseId, caseIds: [caseId], nodeKind: 'SOURCE',
      iconType: sourceIcon(values['Source Device Type']), tag: text(topo.tag) || canonicalId, line: text(topo.line) || null,
      sourceState: text(values['Source State']) || null, sonicState: text(values['Sonic State']) || null,
      trimState: text(values['Low Noise Trim State']) || null, readinessStatus,
      assumptionCount: assumptions.length, assumptions, inputValues: { ...values },
      statusGlyphs: sourceStatusGlyphs(values, result, assumptions, readinessStatus),
      screeningStatus: result ? text(result.status) || 'AVAILABLE' : null,
      resultSummary: result ? {
        status: text(result.status) || null, resultScope: text(result.resultScope) || 'SOURCE',
        rawSourcePwlDb: result.rawSourcePwlDb ?? null, sonicFlowFactorDb: result.sonicFlowFactorDb ?? null,
        trimReductionDb: result.trimReductionDb ?? null, effectiveSourcePwlDb: result.effectiveSourcePwlDb ?? null,
        authority: result.authority ? { ...result.authority } : null, trace: result.trace ? { ...result.trace } : null,
      } : null,
      tableRowIndex: rowIndex,
    }];
  });
}

function assessmentNodes(records, context) {
  return records.flatMap(({ rowIndex, values }) => {
    const canonicalId = text(values['Assessment Canonical ID']);
    if (!canonicalId) return [];
    const topo = context.topology.get(canonicalId) ?? {};
    const results = context.assessmentResults.get(canonicalId) ?? [];
    const assumptions = rowAssumptions(context, 'assessments', rowIndex);
    const readinessStatus = context.readiness.assessmentStatus.get(canonicalId) ?? null;
    return [{
      nodeKey: `ASSESSMENT:${canonicalId}`, canonicalId, caseId: null,
      caseIds: assessmentCaseIds(context, canonicalId, results), nodeKind: 'ASSESSMENT',
      iconType: assessmentIcon(values['Assessment Type']), tag: text(topo.tag) || canonicalId, line: text(topo.line) || null,
      readinessStatus, assumptionCount: assumptions.length, assumptions, inputValues: { ...values },
      statusGlyphs: assessmentStatusGlyphs(values, results, assumptions, readinessStatus),
      screeningStatus: results.length ? 'AVAILABLE' : null,
      resultSummary: buildAivCanvasAssessmentResultSummary(results), tableRowIndex: rowIndex,
    }];
  });
}

function pathKind(element) {
  const type = text(element?.type).toUpperCase();
  if (/VESSEL|TANK|BOUNDARY|TERMINATION/u.test(type)) return 'BOUNDARY';
  if (/PIPE|BRANCH|JUNCTION|CONNECTION|NODE|OFF.?PAGE/u.test(type)) return 'PATH';
  return null;
}

function pathIcon(element, nodeKind) {
  if (nodeKind === 'BOUNDARY') return 'BOUNDARY';
  const type = text(element?.type).toUpperCase();
  if (/OFF.?PAGE/u.test(type)) return 'OFF_PAGE';
  if (/BRANCH|JUNCTION/u.test(type)) return 'JUNCTION';
  if (/CONNECTION|NODE/u.test(type)) return 'CONNECTION_NODE';
  return 'PIPE_PATH';
}

function pathNodes(topology, excludedIds) {
  return topologyElements(topology).flatMap((element) => {
    const canonicalId = text(element.canonicalId);
    const nodeKind = pathKind(element);
    if (!canonicalId || !nodeKind || excludedIds.has(canonicalId)) return [];
    return [{
      nodeKey: `${nodeKind}:${canonicalId}`, canonicalId, caseId: null, caseIds: [], nodeKind,
      iconType: pathIcon(element, nodeKind), tag: text(element.tag) || canonicalId,
      line: text(element.line) || null, readinessStatus: null, assumptionCount: 0, assumptions: [],
      statusGlyphs: [], inputValues: {}, screeningStatus: null, resultSummary: null, tableRowIndex: null,
    }];
  });
}

function relationshipRows(records, context) {
  return records.flatMap(({ rowIndex, values }) => {
    const sourceCanonicalId = text(values['Source Canonical ID']);
    const assessmentCanonicalId = text(values['Assessment Canonical ID']);
    const caseId = text(values['Operating Case']);
    if (!sourceCanonicalId || !assessmentCanonicalId || !caseId) return [];
    const key = `${sourceCanonicalId}\u0000${assessmentCanonicalId}\u0000${caseId}`;
    const selectionKey = `REL:${sourceCanonicalId}:${assessmentCanonicalId}:${caseId}`;
    const ready = context.readiness.relationship.get(key) ?? null;
    const assumptions = rowAssumptions(context, 'relationships', rowIndex);
    const assessmentLine = text(context.topology.get(assessmentCanonicalId)?.line);
    const sourceLine = text(context.topology.get(sourceCanonicalId)?.line);
    const contribution = context.contributions.get(key) ?? null;
    const readinessStatus = text(ready?.status) || null;
    return [{
      rowKey: text(ready?.rowKey) || selectionKey, selectionKey, sourceCanonicalId, assessmentCanonicalId,
      caseId, caseIds: [caseId], line: assessmentLine || sourceLine || null,
      applicabilityDisposition: text(values['Applicability Disposition']) || 'UNRESOLVED',
      physicalDistance: text(values['Physical Distance']) || null,
      physicalDistanceUnit: text(values['Physical Distance Unit']) || null,
      distanceSource: text(values['Distance Source']) || null,
      distanceSourceRevision: text(values['Distance Source Revision']) || null,
      simultaneousSourceGroup: text(values['Simultaneous Source Group']) || null,
      assumptionCount: assumptions.length, assumptions, inputValues: { ...values },
      screeningContribution: contribution, readinessStatus, tableRowIndex: rowIndex,
      statusGlyphs: relationshipStatusGlyphs(values, contribution, assumptions, readinessStatus),
    }];
  });
}

function sortNodes(a, b) {
  return a.nodeKind.localeCompare(b.nodeKind) || String(a.caseId ?? '').localeCompare(String(b.caseId ?? ''))
    || a.canonicalId.localeCompare(b.canonicalId) || a.nodeKey.localeCompare(b.nodeKey);
}

function sortRelationships(a, b) {
  return a.caseId.localeCompare(b.caseId) || a.sourceCanonicalId.localeCompare(b.sourceCanonicalId)
    || a.assessmentCanonicalId.localeCompare(b.assessmentCanonicalId);
}

export function buildAivCanvasProjection(input = {}) {
  const tables = workingTables(input);
  const relationshipsInput = tableRecords(tables.relationships);
  const resultIndex = buildAivCanvasResultIndex(input.screeningResult);
  const context = {
    topology: topologyById(input.topology), readiness: buildAivCanvasReadinessIndex(input.readinessEnvelope),
    assumptions: assumptionsByRow(input.assumptionResolution), relationshipCases: relationshipCasesByAssessment(relationshipsInput),
    sourceResults: resultIndex.sourceResults, assessmentResults: resultIndex.assessmentResults,
    contributions: resultIndex.contributions,
  };
  const sources = sourceNodes(tableRecords(tables.sources), context);
  const assessments = assessmentNodes(tableRecords(tables.assessments), context);
  const excluded = new Set([...sources, ...assessments].map((node) => node.canonicalId));
  const nodes = [...sources, ...pathNodes(input.topology, excluded), ...assessments].sort(sortNodes);
  const relationships = relationshipRows(relationshipsInput, context).sort(sortRelationships);
  return deepFreeze({
    schema: AIV_CANVAS_PROJECTION_SCHEMA, methodId: 'VIB.AIV.ACOUSTIC', presentationOnly: true,
    nodes, relationships, lineCaseSummaries: resultIndex.lineCaseSummaries,
  });
}
