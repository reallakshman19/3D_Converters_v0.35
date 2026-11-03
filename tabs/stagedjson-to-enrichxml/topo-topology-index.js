import { canonicalSemanticJson, computeSemanticHash } from '../../contracts/topo-enriched-xml/contract-core.js';
import {
  PSIWRITEROCCURRENCEPLAN_V1, TOPOLOGICALGRAPH_V1, TOPONODEHISTORYMATCHRESULT_V1,
  TOPONODEPLAN_V1, TOPOSOURCEINVENTORY_V1, TOPOTOPOLOGYINDEX_V1,
} from '../../contracts/topo-enriched-xml/contracts.js';
import { computeOccurrencePlanHash } from './psi-serialization-plan.js';
import {
  buildTopologyIndexViews, exactOccurrencePortIds, traceSemanticRows,
  validateStrictBundleEvidence,
} from './topo-topology-index-views.js';

const SCHEMA = 'TopoTopologyIndex.v1';
const INPUTS = [
  ['sourceInventory', TOPOSOURCEINVENTORY_V1], ['logicalGraph', TOPOLOGICALGRAPH_V1],
  ['occurrencePlan', PSIWRITEROCCURRENCEPLAN_V1], ['nodePlan', TOPONODEPLAN_V1],
];
const SEMANTIC_KEYS = [
  'schema', 'projectId', 'zoneId', 'sourceInventoryHash', 'logicalTopologyHash',
  'occurrencePlanHash', 'nodePlanHash', 'historyMatchResultHash', 'sourceEntities',
  'sourcePorts', 'logicalNodes', 'logicalEdges', 'occurrences', 'histories',
  'engineeringNumbers', 'sourceBranches', 'canonicalLines', 'aliases',
  'sourceToLogical', 'logicalToSource', 'logicalToOccurrences', 'occurrenceToLogical',
  'emittedTraceOccurrences', 'unresolvedReferences', 'conflicts', 'coverage',
];

export async function buildTopoTopologyIndex(input) {
  requireInputs(input);
  const state = createState(input);
  await validateInputs(state);
  const source = buildSource(state);
  const graph = buildGraph(state, source);
  const plan = buildPlan(state, source, graph);
  const trace = await validateTrace(state, plan);
  const indexes = buildTopologyIndexViews({
    state, source, graph, plan, trace,
    reportUnresolved: (code, type, id, evidence) => unresolved(state, code, type, id, evidence),
  });
  const candidate = { schema: SCHEMA, projectId: state.projectId, zoneId: state.zoneId, ...state.hashes, ...indexes };
  candidate.validation = validation(state);
  candidate.topologyIndexHash = await computeTopoTopologyIndexHash(candidate);
  const errors = TOPOTOPOLOGYINDEX_V1.validate(candidate);
  if (errors.length) throw new TypeError(`${SCHEMA} validation failed: ${errors.join('; ')}`);
  return TOPOTOPOLOGYINDEX_V1.freeze(candidate);
}

export async function computeTopoTopologyIndexHash(index) {
  return hash(Object.fromEntries(SEMANTIC_KEYS.map((key) => [key, index?.[key]])));
}

function requireInputs(input) { for (const [name] of INPUTS) if (!isObject(input?.[name])) throw new TypeError(`${name} is required.`); }
function createState(input) {
  return { input, projectId: text(input.sourceInventory.projectId), zoneId: text(input.sourceInventory.zoneId), blockers: [], reviewItems: [], warnings: [], conflicts: [], unresolved: [], hashes: {} };
}

async function validateInputs(state) {
  for (const [name, api] of INPUTS) validateContract(state, name, api, state.input[name]);
  if (state.input.historyMatchResult) validateContract(state, 'historyMatchResult', TOPONODEHISTORYMATCHRESULT_V1, state.input.historyMatchResult);
  validateScope(state);
  const sourceHash = await computeSemanticHash(state.input.sourceInventory, 'sourceInventoryHash');
  const logicalHash = await computeSemanticHash(state.input.logicalGraph, 'logicalTopologyHash');
  const occurrenceHash = await computeOccurrencePlanHash(state.input.occurrencePlan);
  const nodeHash = await computeSemanticHash(state.input.nodePlan, 'nodePlanHash');
  const historyHash = state.input.historyMatchResult ? await computeSemanticHash(state.input.historyMatchResult, 'historyMatchResultHash') : '';
  state.hashes = { sourceInventoryHash: sourceHash, logicalTopologyHash: logicalHash, occurrencePlanHash: occurrenceHash, nodePlanHash: nodeHash, ...(historyHash ? { historyMatchResultHash: historyHash } : {}) };
  compareHash(state, 'SOURCE_INVENTORY_HASH_MISMATCH', sourceHash, ['logicalGraph', 'occurrencePlan', 'nodePlan'], 'sourceInventoryHash');
  compareHash(state, 'LOGICAL_TOPOLOGY_HASH_MISMATCH', logicalHash, ['occurrencePlan', 'nodePlan'], 'logicalTopologyHash');
  compareDirect(state, 'OCCURRENCE_PLAN_HASH_MISMATCH', occurrenceHash, state.input.occurrencePlan.occurrencePlanHash, 'occurrencePlan');
  compareDirect(state, 'NODE_PLAN_HASH_MISMATCH', nodeHash, state.input.nodePlan.nodePlanHash, 'nodePlan');
  if (state.input.historyMatchResult) {
    compareDirect(state, 'HISTORY_MATCH_RESULT_HASH_MISMATCH', historyHash, state.input.historyMatchResult.historyMatchResultHash, 'historyMatchResult');
    compareDirect(state, 'LOGICAL_TOPOLOGY_HASH_MISMATCH', logicalHash, state.input.historyMatchResult.logicalTopologyHash, 'historyMatchResult');
  }
}

function validateContract(state, name, api, value) {
  const errors = api.validate(value);
  if (errors.length) block(state, `${constant(name)}_CONTRACT_INVALID`, { errors });
  const status = text(value?.validation?.status);
  if (status === 'BLOCKED') block(state, 'UPSTREAM_ARTIFACT_BLOCKED', { artifact: name, blockers: value.validation.blockers || [] });
  if (status === 'REVIEW_REQUIRED') state.reviewItems.push(issue('UPSTREAM_ARTIFACT_REVIEW_REQUIRED', { artifact: name, reviewItems: value.validation.reviewItems || [] }));
  state.warnings.push(...array(value?.validation?.warnings));
}
function validateScope(state) {
  for (const [name] of INPUTS) {
    const value = state.input[name];
    if (text(value.projectId) !== state.projectId || text(value.zoneId) !== state.zoneId) block(state, 'ARTIFACT_SCOPE_MISMATCH', { artifact: name });
  }
  const history = state.input.historyMatchResult;
  if (history && (text(history.projectId) !== state.projectId || text(history.zoneId) !== state.zoneId)) block(state, 'ARTIFACT_SCOPE_MISMATCH', { artifact: 'historyMatchResult' });
}
function compareHash(state, code, expected, names, field) { for (const name of names) compareDirect(state, code, expected, state.input[name]?.[field], name); }
function compareDirect(state, code, expected, actual, artifact) { if (text(actual) !== text(expected)) block(state, code, { artifact, expected: text(expected), actual: text(actual) }); }

function buildSource(state) {
  const entities = grouped(state.input.sourceInventory.entities, 'sourceEntityId');
  const ports = grouped(state.input.sourceInventory.ports, 'sourcePortId');
  const mappings = grouped(state.input.nodePlan.rawPortMappings, 'sourcePortId');
  for (const [id, rows] of entities) if (rows.length > 1) conflict(state, 'DUPLICATE_SOURCE_ENTITY_ID', id, rows);
  for (const [id, rows] of ports) if (rows.length > 1) conflict(state, 'DUPLICATE_SOURCE_PORT_ID', id, rows);
  const owners = new Map();
  for (const [portId, rows] of mappings) {
    const nodeIds = unique(rows.map((row) => text(row.logicalNodeId)).filter(Boolean));
    if (nodeIds.length > 1) conflict(state, 'DUPLICATE_SOURCE_PORT_OWNER', portId, rows);
    else if (nodeIds.length === 1) owners.set(portId, nodeIds[0]);
    if (!ports.has(portId)) unresolved(state, 'SOURCE_PORT_MAPPING_MISSING', 'sourcePortId', portId, { reason: 'UNKNOWN_SOURCE_PORT' });
  }
  for (const [portId, claims] of ports) {
    if (!mappings.has(portId)) unresolved(state, 'SOURCE_PORT_MAPPING_MISSING', 'sourcePortId', portId, { reason: 'NO_LOGICAL_OWNER' });
    for (const row of claims) if (!entities.has(text(row.sourceEntityId))) unresolved(state, 'SOURCE_ENTITY_MAPPING_MISSING', 'sourcePortId', portId, { sourceEntityId: text(row.sourceEntityId) });
  }
  return { entities, ports, mappings, owners };
}

function buildGraph(state, source) {
  const nodes = grouped(state.input.logicalGraph.nodes, 'logicalNodeId');
  const edges = grouped(state.input.logicalGraph.edges, 'logicalEdgeId');
  for (const [id, rows] of nodes) if (rows.length > 1) conflict(state, 'DUPLICATE_LOGICAL_NODE_ID', id, rows);
  for (const [id, rows] of edges) {
    if (rows.length > 1) conflict(state, 'DUPLICATE_LOGICAL_EDGE_ID', id, rows);
    rows.forEach((row) => validateEdge(state, source, nodes, id, row));
  }
  for (const [portId, nodeId] of source.owners) if (!nodes.has(nodeId)) unresolved(state, 'LOGICAL_NODE_MAPPING_MISSING', 'sourcePortId', portId, { logicalNodeId: nodeId });
  return { nodes, edges };
}
function validateEdge(state, source, nodes, edgeId, edge) {
  for (const field of ['fromLogicalNodeId', 'toLogicalNodeId']) {
    const nodeId = text(edge?.[field]);
    if (!nodes.has(nodeId)) unresolved(state, 'LOGICAL_NODE_MAPPING_MISSING', 'logicalEdgeId', edgeId, { field, logicalNodeId: nodeId });
  }
  const sourceIds = edgeSourceIds(edge);
  if (!sourceIds.length) unresolved(state, 'LOGICAL_EDGE_MAPPING_MISSING', 'logicalEdgeId', edgeId, { reason: 'SOURCE_EVIDENCE_MISSING' });
  for (const id of sourceIds) if (!source.entities.has(id)) unresolved(state, 'SOURCE_ENTITY_MAPPING_MISSING', 'logicalEdgeId', edgeId, { sourceEntityId: id });
  for (const id of array(edge?.sourcePortIds).map(text).filter(Boolean)) if (!source.ports.has(id)) unresolved(state, 'SOURCE_PORT_MAPPING_MISSING', 'logicalEdgeId', edgeId, { sourcePortId: id });
}

function buildPlan(state, source, graph) {
  const planned = grouped(state.input.occurrencePlan.occurrences, 'occurrenceId');
  const nodeClaims = grouped(nodeOccurrenceClaims(state.input.nodePlan), 'occurrenceId');
  const logicalHistory = logicalHistories(state);
  for (const [id, rows] of planned) {
    if (rows.length > 1) conflict(state, 'DUPLICATE_OCCURRENCE_OWNER', id, rows);
    if (rows.length === 1) validateOccurrence(state, source, graph, nodeClaims, logicalHistory, id, rows[0]);
  }
  for (const [id, rows] of nodeClaims) {
    if (rows.length > 1) conflict(state, 'DUPLICATE_OCCURRENCE_OWNER', id, rows);
    if (!planned.has(id)) unresolved(state, 'OCCURRENCE_MAPPING_MISSING', 'occurrenceId', id, { reason: 'UNPLANNED_NODE_OCCURRENCE' });
  }
  validateNumberClaims(state, nodeClaims, logicalHistory);
  return { planned, nodeClaims, logicalHistory };
}
function validateOccurrence(state, source, graph, nodeClaims, logicalHistory, occurrenceId, occurrence) {
  const claims = nodeClaims.get(occurrenceId) || [];
  if (claims.length !== 1) return unresolved(state, 'OCCURRENCE_MAPPING_MISSING', 'occurrenceId', occurrenceId, { claimCount: claims.length });
  const row = claims[0], nodeId = text(row.logicalNodeId);
  if (!graph.nodes.has(nodeId)) unresolved(state, 'LOGICAL_NODE_MAPPING_MISSING', 'occurrenceId', occurrenceId, { logicalNodeId: nodeId });
  if (text(occurrence.logicalNodeId) && text(occurrence.logicalNodeId) !== nodeId) conflict(state, 'DUPLICATE_OCCURRENCE_OWNER', occurrenceId, [occurrence, row]);
  for (const field of ['componentProjectionId', 'disposition']) if (text(occurrence[field]) !== text(row[field])) conflict(state, 'OCCURRENCE_MAPPING_MISSING', occurrenceId, [occurrence, row]);
  const entityRows = source.entities.get(text(occurrence.sourceEntityId)) || [];
  if (entityRows.length !== 1) unresolved(state, 'SOURCE_ENTITY_MAPPING_MISSING', 'occurrenceId', occurrenceId, { sourceEntityId: text(occurrence.sourceEntityId), claimCount: entityRows.length });
  else if (!text(entityRows[0].sourcePath)) unresolved(state, 'SOURCE_ENTITY_MAPPING_MISSING', 'occurrenceId', occurrenceId, { sourceEntityId: text(occurrence.sourceEntityId), reason: 'SOURCE_PATH_MISSING' });
  if (occurrence.disposition === 'EMITTED' && !exactOccurrencePortIds(source, occurrence, nodeId).length) unresolved(state, 'SOURCE_PORT_MAPPING_MISSING', 'occurrenceId', occurrenceId, { logicalNodeId: nodeId, sourceEntityId: text(occurrence.sourceEntityId) });
  const rowHistory = text(row.historyNodeId), nodeHistory = text(logicalHistory.get(nodeId));
  if (rowHistory && nodeHistory && rowHistory !== nodeHistory) conflict(state, 'HISTORY_MAPPING_CONFLICT', nodeId, [row, { logicalNodeId: nodeId, historyNodeId: nodeHistory }]);
}

function logicalHistories(state) {
  const claims = new Map();
  for (const row of array(state.input.nodePlan.logicalNodes)) append(claims, text(row.logicalNodeId), text(row.historyNodeId));
  for (const row of nodeOccurrenceClaims(state.input.nodePlan)) append(claims, text(row.logicalNodeId), text(row.historyNodeId));
  for (const row of array(state.input.historyMatchResult?.matches)) append(claims, text(row.logicalNodeId), text(row.historyNodeId));
  const result = new Map(), byHistory = new Map();
  for (const [nodeId, values] of claims) {
    const histories = unique(values.filter(Boolean));
    if (histories.length > 1) conflict(state, 'HISTORY_MAPPING_CONFLICT', nodeId, histories);
    else if (histories.length === 1) { result.set(nodeId, histories[0]); append(byHistory, histories[0], nodeId); }
  }
  for (const [historyId, nodeIds] of byHistory) if (unique(nodeIds).length > 1) conflict(state, 'HISTORY_MAPPING_CONFLICT', historyId, nodeIds);
  return result;
}
function validateNumberClaims(state, nodeClaims, logicalHistory) {
  const byNode = new Map(), byNumber = new Map();
  for (const rows of nodeClaims.values()) for (const row of rows) {
    append(byNode, text(row.logicalNodeId), row.engineeringNodeNumber);
    append(byNumber, row.engineeringNodeNumber, { logicalNodeId: text(row.logicalNodeId), historyNodeId: text(row.historyNodeId || logicalHistory.get(text(row.logicalNodeId))) });
  }
  for (const [id, values] of byNode) if (unique(values).length > 1) conflict(state, 'NODE_NUMBER_MAPPING_CONFLICT', id, values);
  for (const [number, claims] of byNumber) {
    if (unique(claims.map((row) => row.logicalNodeId)).length > 1) conflict(state, 'NODE_NUMBER_MAPPING_CONFLICT', String(number), claims);
    if (unique(claims.map((row) => row.historyNodeId).filter(Boolean)).length > 1) conflict(state, 'HISTORY_MAPPING_CONFLICT', String(number), claims);
  }
}

async function validateTrace(state, plan) {
  const bundle = state.input.strictWriterBundle;
  if (!isObject(bundle)) { unresolved(state, 'TRACE_COVERAGE_INCOMPLETE', 'trace', 'STRICT_WRITER_BUNDLE', { reason: 'MISSING' }); return emptyTrace(); }
  const verified = await validateStrictBundleEvidence(bundle, { projectId: state.projectId, zoneId: state.zoneId, nodePlanHash: state.hashes.nodePlanHash, occurrencePlanHash: state.hashes.occurrencePlanHash });
  verified.issues.forEach((row) => block(state, row.code, row.evidence));
  const groupedTrace = grouped(verified.rows, 'occurrenceId');
  for (const [id, claims] of groupedTrace) if (claims.length > 1) conflict(state, 'DUPLICATE_OCCURRENCE_OWNER', id, claims);
  const emitted = plannedIds(plan, 'EMITTED'), reserved = new Set(plannedIds(plan, 'RESERVED'));
  for (const id of emitted) if ((groupedTrace.get(id) || []).length !== 1) unresolved(state, 'TRACE_COVERAGE_INCOMPLETE', 'occurrenceId', id, { traceCount: (groupedTrace.get(id) || []).length });
  for (const [id, claims] of groupedTrace) {
    if (!plan.planned.has(id)) unresolved(state, 'OCCURRENCE_MAPPING_MISSING', 'traceOccurrenceId', id, { reason: 'UNPLANNED_TRACE' });
    if (reserved.has(id)) block(state, 'RESERVED_OCCURRENCE_EMITTED', { occurrenceId: id });
    if (claims.length === 1) validateTraceRow(state, plan, bundle, id, claims[0]);
  }
  validateXmlTrace(state, verified.xmlNodes, verified.rows);
  validateSummary(state, bundle.summary, emitted.length, reserved.size, verified.rows.length);
  if (verified.rows.length !== emitted.length) block(state, 'TRACE_COVERAGE_INCOMPLETE', { emittedCount: emitted.length, traceCount: verified.rows.length });
  return { rows: verified.rows, semanticRows: traceSemanticRows(verified.rows), xmlNodeCount: verified.xmlNodes.length };
}
function validateTraceRow(state, plan, bundle, id, trace) {
  const occurrenceRows = plan.planned.get(id) || [], nodeRows = plan.nodeClaims.get(id) || [];
  if (occurrenceRows.length !== 1 || nodeRows.length !== 1) return;
  const occurrence = occurrenceRows[0], node = nodeRows[0], mismatches = [];
  const expected = { ...occurrence, logicalNodeId: node.logicalNodeId, engineeringNodeNumber: node.engineeringNodeNumber };
  for (const field of ['logicalNodeId', 'componentProjectionId', 'sourceEntityId', 'psiComponentType', 'projectionRole', 'endpoint']) if (trace[field] !== expected[field]) mismatches.push({ field, expected: expected[field], actual: trace[field] });
  if (!Number.isInteger(trace.engineeringNodeNumber) || trace.engineeringNodeNumber !== node.engineeringNodeNumber) mismatches.push({ field: 'engineeringNodeNumber', expected: node.engineeringNodeNumber, actual: trace.engineeringNodeNumber });
  for (const field of ['branchProjectionId', 'projectionKind']) if (text(trace[field]) !== text(bundle[field])) mismatches.push({ field, expected: text(bundle[field]), actual: text(trace[field]) });
  if (![trace.traceIndex, trace.branchIndex, trace.nodeIndexInBranch].every((value) => Number.isInteger(value) && value >= 0)) mismatches.push({ field: 'tracePosition' });
  if (mismatches.length) conflict(state, 'OCCURRENCE_MAPPING_MISSING', id, mismatches);
}
function validateXmlTrace(state, nodes, rows) {
  if (nodes.length !== rows.length) block(state, 'XML_TRACE_CARDINALITY_MISMATCH', { xmlNodeCount: nodes.length, traceCount: rows.length });
  for (let index = 0; index < Math.min(nodes.length, rows.length); index += 1) if (nodes[index].engineeringNodeNumber !== rows[index].engineeringNodeNumber || nodes[index].psiComponentType !== text(rows[index].psiComponentType)) block(state, 'XML_TRACE_IDENTITY_MISMATCH', { index, xml: nodes[index], trace: { engineeringNodeNumber: rows[index].engineeringNodeNumber, psiComponentType: text(rows[index].psiComponentType) } });
}
function validateSummary(state, summary, emitted, reserved, count) {
  const expected = { emittedOccurrenceCount: emitted, reservedOccurrenceCount: reserved, xmlNodeCount: count, traceCount: count, writerSideAllocations: 0 };
  for (const [field, value] of Object.entries(expected)) if (summary?.[field] !== value) block(state, 'STRICT_WRITER_BUNDLE_SUMMARY_MISMATCH', { field, expected: value, actual: summary?.[field] });
}

function plannedIds(plan, disposition) { return [...plan.planned].filter(([, rows]) => rows.length === 1 && rows[0].disposition === disposition).map(([id]) => id).sort(compareText); }
function nodeOccurrenceClaims(plan) { return [...array(plan.emittedOccurrences).map((row) => ({ ...row, disposition: 'EMITTED' })), ...array(plan.reservedOccurrences).map((row) => ({ ...row, disposition: 'RESERVED' }))]; }
function edgeSourceIds(edge) { return unique([...array(edge?.sourceEntityIds).map(text), text(edge?.sourceEntityId)].filter(Boolean)); }
function grouped(rows, key) { const map = new Map(); for (const row of array(rows)) append(map, typeof key === 'function' ? key(row) : text(row?.[key]), row); for (const group of map.values()) group.sort(compareCanonical); return map; }
function append(map, key, value) { if (!key && key !== 0) return; if (!map.has(key)) map.set(key, []); map.get(key).push(value); }
function conflict(state, code, key, claims) { const row = issue(code, { key: String(key), claims: canonicalClaims(claims) }); state.conflicts.push(row); state.blockers.push(row); }
function unresolved(state, code, referenceType, referenceId, evidence = {}) { const row = issue(code, { referenceType, referenceId: String(referenceId), ...evidence }); state.unresolved.push(row); state.blockers.push(row); }
function block(state, code, evidence = {}) { state.blockers.push(issue(code, evidence)); }
function validation(state) { const blockers = sortIssues(dedupe(state.blockers)), reviewItems = sortIssues(dedupe(state.reviewItems)); return { status: blockers.length ? 'BLOCKED' : (reviewItems.length ? 'REVIEW_REQUIRED' : 'PASS'), blockers, reviewItems, warnings: dedupe(state.warnings) }; }
function issue(code, evidence = {}) { return { code, evidence }; }
function canonicalClaims(values) { return array(values).map((value) => JSON.parse(canonicalSemanticJson(value))).sort(compareCanonical); }
function sortIssues(values) { return [...values].sort((a, b) => compareText(a.code, b.code) || compareCanonical(a.evidence, b.evidence)); }
function dedupe(values) { const seen = new Set(); return array(values).filter((row) => { const key = canonicalSemanticJson(row); if (seen.has(key)) return false; seen.add(key); return true; }); }
function unique(values) { return [...new Set(values)]; }
function compareCanonical(a, b) { return compareText(canonicalSemanticJson(a), canonicalSemanticJson(b)); }
function compareText(a, b) { const left = String(a ?? ''), right = String(b ?? ''); return left < right ? -1 : (left > right ? 1 : 0); }
function constant(value) { return value.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(); }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function array(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
function emptyTrace() { return { rows: [], semanticRows: [], xmlNodeCount: 0 }; }
async function hash(value) { const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalSemanticJson(value))); return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`; }
