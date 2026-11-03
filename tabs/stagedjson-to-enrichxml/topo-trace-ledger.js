import { canonicalSemanticJson, deepFreeze } from '../../contracts/topo-enriched-xml/contract-core.js';
import { TOPOTOPOLOGYINDEX_V1 } from '../../contracts/topo-enriched-xml/contracts.js';
import { computeTopoTopologyIndexHash } from './topo-topology-index.js';
import { validateStrictBundleEvidence } from './topo-topology-index-views.js';

const SCHEMA = 'TopoTraceLedger.v1';
const SEMANTIC_KEYS = [
  'schema', 'projectId', 'zoneId', 'topologyIndexHash', 'nodePlanHash',
  'occurrencePlanHash', 'serializationPlanHash', 'branchProjectionId', 'projectionKind',
  'xmlHash', 'traceHash', 'bundleHash', 'sourceTrace', 'coverage',
];

export async function buildTopoTraceLedger({ topologyIndex, strictWriterBundle }) {
  requireObject(topologyIndex, 'topologyIndex');
  requireObject(strictWriterBundle, 'strictWriterBundle');
  const state = { blockers: [], reviewItems: [], warnings: [] };
  const verified = await validateRoots(state, topologyIndex, strictWriterBundle);
  const lookup = buildLookup(state, topologyIndex);
  const sourceTrace = buildRows(state, lookup, topologyIndex, strictWriterBundle);
  validateCoverage(state, topologyIndex, verified, sourceTrace);
  const candidate = {
    schema: SCHEMA, projectId: topologyIndex.projectId, zoneId: topologyIndex.zoneId,
    topologyIndexHash: topologyIndex.topologyIndexHash, nodePlanHash: topologyIndex.nodePlanHash,
    occurrencePlanHash: topologyIndex.occurrencePlanHash,
    serializationPlanHash: text(strictWriterBundle.serializationPlanHash),
    branchProjectionId: text(strictWriterBundle.branchProjectionId),
    projectionKind: text(strictWriterBundle.projectionKind),
    xmlHash: text(strictWriterBundle.xmlHash), traceHash: text(strictWriterBundle.traceHash),
    bundleHash: text(strictWriterBundle.bundleHash), sourceTrace,
    coverage: coverage(topologyIndex, verified, sourceTrace),
  };
  candidate.validation = validation(state);
  candidate.traceLedgerHash = await computeTopoTraceLedgerHash(candidate);
  return deepFreeze(candidate);
}

export async function computeTopoTraceLedgerHash(ledger) {
  return hash(Object.fromEntries(SEMANTIC_KEYS.map((key) => [key, ledger?.[key]])));
}

async function validateRoots(state, index, bundle) {
  const contractErrors = TOPOTOPOLOGYINDEX_V1.validate(index);
  if (contractErrors.length) block(state, 'TOPOLOGY_INDEX_CONTRACT_INVALID', { errors: contractErrors });
  const actual = await computeTopoTopologyIndexHash(index);
  if (actual !== text(index.topologyIndexHash)) block(state, 'TOPOLOGY_INDEX_HASH_MISMATCH', { expected: actual, actual: text(index.topologyIndexHash) });
  if (index.validation?.status === 'BLOCKED') block(state, 'TOPOLOGY_INDEX_NOT_PASS', { blockers: index.validation.blockers || [] });
  if (index.validation?.status === 'REVIEW_REQUIRED') state.reviewItems.push(issue('TOPOLOGY_INDEX_REVIEW_REQUIRED', { reviewItems: index.validation.reviewItems || [] }));
  const verified = await validateStrictBundleEvidence(bundle, {
    projectId: index.projectId, zoneId: index.zoneId,
    nodePlanHash: index.nodePlanHash, occurrencePlanHash: index.occurrencePlanHash,
  });
  verified.issues.forEach((row) => block(state, row.code, row.evidence));
  return verified;
}

function buildLookup(state, index) {
  return {
    occurrences: uniqueMap(state, index.occurrences, 'occurrenceId', 'DUPLICATE_OCCURRENCE_OWNER'),
    nodes: uniqueMap(state, index.logicalNodes, 'logicalNodeId', 'DUPLICATE_LOGICAL_NODE_ID'),
    entities: uniqueMap(state, index.sourceEntities, 'sourceEntityId', 'DUPLICATE_SOURCE_ENTITY_ID'),
    ports: uniqueMap(state, index.sourcePorts, 'sourcePortId', 'DUPLICATE_SOURCE_PORT_ID'),
  };
}

function buildRows(state, lookup, index, bundle) {
  return array(bundle.trace).map((trace, ordinal) => {
    const occurrenceId = text(trace.occurrenceId), occurrence = lookup.occurrences.get(occurrenceId);
    if (!occurrence) {
      block(state, 'OCCURRENCE_MAPPING_MISSING', { occurrenceId, traceIndex: ordinal });
      return unresolvedRow(trace, index, ordinal);
    }
    if (occurrence.disposition !== 'EMITTED') block(state, 'RESERVED_OCCURRENCE_EMITTED', { occurrenceId });
    const nodeId = text(occurrence.resolvedLogicalNodeId), node = lookup.nodes.get(nodeId);
    if (!node) block(state, 'LOGICAL_NODE_MAPPING_MISSING', { occurrenceId, logicalNodeId: nodeId });
    validateTraceIdentity(state, trace, occurrence, bundle);
    const entityId = text(occurrence.sourceEntityId), entity = lookup.entities.get(entityId);
    const portIds = unique(array(occurrence.sourcePortIds).map(text).filter(Boolean)).sort(compareText);
    const ports = portIds.map((id) => lookup.ports.get(id)).filter(Boolean);
    for (const portId of portIds) {
      const port = lookup.ports.get(portId);
      if (!port) block(state, 'SOURCE_PORT_MAPPING_MISSING', { occurrenceId, sourcePortId: portId });
      else if (text(port.sourceEntityId) !== entityId || text(port.resolvedLogicalNodeId) !== nodeId) block(state, 'SOURCE_PORT_OWNERSHIP_MISMATCH', { occurrenceId, sourcePortId: portId, entityId, logicalNodeId: nodeId });
    }
    const sourcePaths = unique([
      ...array(entity?.sourcePaths), entity?.sourcePath,
      ...ports.flatMap((row) => [...array(row.sourcePaths), row.sourcePath]),
    ].map(text).filter(Boolean)).sort(compareText);
    if (!entity || !entityId || !sourcePaths.length) block(state, 'SOURCE_ENTITY_MAPPING_MISSING', { occurrenceId, sourceEntityId: entityId, sourcePaths });
    if (!portIds.length) block(state, 'SOURCE_PORT_MAPPING_MISSING', { occurrenceId, logicalNodeId: nodeId, sourceEntityId: entityId });
    return traceRow(trace, index, occurrence, node, entity, portIds, sourcePaths, ordinal);
  });
}

function validateTraceIdentity(state, trace, occurrence, bundle) {
  const mismatches = [], expected = {
    logicalNodeId: occurrence.resolvedLogicalNodeId,
    componentProjectionId: occurrence.componentProjectionId,
    sourceEntityId: occurrence.sourceEntityId,
    engineeringNodeNumber: occurrence.engineeringNodeNumber,
    psiComponentType: occurrence.psiComponentType,
    projectionRole: occurrence.projectionRole, endpoint: occurrence.endpoint,
    branchProjectionId: bundle.branchProjectionId, projectionKind: bundle.projectionKind,
  };
  for (const field of Object.keys(expected)) if (trace[field] !== expected[field]) mismatches.push({ field, expected: expected[field], actual: trace[field] });
  if (!Number.isInteger(trace.engineeringNodeNumber)) mismatches.push({ field: 'engineeringNodeNumberType', actual: trace.engineeringNodeNumber });
  if (mismatches.length) block(state, 'OCCURRENCE_MAPPING_MISSING', { occurrenceId: occurrence.occurrenceId, mismatches });
}

function traceRow(trace, index, occurrence, node, entity, sourcePortIds, sourcePaths, ordinal) {
  return {
    traceIndex: integer(trace.traceIndex, ordinal), branchIndex: integer(trace.branchIndex, -1),
    nodeIndexInBranch: integer(trace.nodeIndexInBranch, -1),
    branchProjectionId: text(trace.branchProjectionId), branchName: text(trace.branchName) || null,
    projectionKind: text(trace.projectionKind), occurrenceId: occurrence.occurrenceId,
    logicalNodeId: occurrence.resolvedLogicalNodeId, historyNodeId: occurrence.historyNodeId,
    nodeNumber: occurrence.engineeringNodeNumber, engineeringNodeNumber: occurrence.engineeringNodeNumber,
    sourceEntityIds: [occurrence.sourceEntityId], sourcePortIds, sourcePaths,
    sourceBranches: unique([occurrence.sourceBranch, ...array(entity?.sourceBranches), entity?.sourceBranch].map(text).filter(Boolean)).sort(compareText),
    canonicalLines: unique([occurrence.canonicalMainLine].filter(Boolean)).sort(compareText),
    componentProjectionId: occurrence.componentProjectionId, projectionRole: occurrence.projectionRole,
    endpoint: occurrence.endpoint, psiComponentType: occurrence.psiComponentType,
    nodePlanHash: index.nodePlanHash, occurrencePlanHash: index.occurrencePlanHash,
    topologyIndexHash: index.topologyIndexHash,
  };
}

function unresolvedRow(trace, index, ordinal) {
  return {
    traceIndex: integer(trace.traceIndex, ordinal), branchIndex: integer(trace.branchIndex, -1),
    nodeIndexInBranch: integer(trace.nodeIndexInBranch, -1), occurrenceId: text(trace.occurrenceId),
    nodePlanHash: index.nodePlanHash, occurrencePlanHash: index.occurrencePlanHash,
    topologyIndexHash: index.topologyIndexHash, unresolved: true,
  };
}

function validateCoverage(state, index, verified, rows) {
  const expected = array(index.occurrences).filter((row) => row.disposition === 'EMITTED').map((row) => row.occurrenceId).sort(compareText);
  const actual = rows.map((row) => row.occurrenceId).sort(compareText);
  if (canonicalSemanticJson(expected) !== canonicalSemanticJson(actual)) block(state, 'TRACE_COVERAGE_INCOMPLETE', { expected, actual });
  const duplicates = duplicateValues(actual);
  if (duplicates.length) block(state, 'DUPLICATE_OCCURRENCE_OWNER', { occurrenceIds: duplicates });
  if (verified.xmlNodes.length !== rows.length) block(state, 'XML_TRACE_CARDINALITY_MISMATCH', { xmlNodeCount: verified.xmlNodes.length, traceCount: rows.length });
  for (let position = 0; position < Math.min(verified.xmlNodes.length, rows.length); position += 1) {
    const xml = verified.xmlNodes[position], row = rows[position];
    if (xml.engineeringNodeNumber !== row.engineeringNodeNumber || xml.psiComponentType !== row.psiComponentType) block(state, 'XML_TRACE_IDENTITY_MISMATCH', { position, xml, trace: { engineeringNodeNumber: row.engineeringNodeNumber, psiComponentType: row.psiComponentType } });
  }
}

function coverage(index, verified, rows) {
  return {
    emittedOccurrenceCount: array(index.occurrences).filter((row) => row.disposition === 'EMITTED').length,
    reservedOccurrenceCount: array(index.occurrences).filter((row) => row.disposition === 'RESERVED').length,
    traceCount: rows.length, xmlNodeCount: verified.xmlNodes.length,
    completeSourcePathRows: rows.filter((row) => array(row.sourcePaths).length > 0).length,
    completeSourcePortRows: rows.filter((row) => array(row.sourcePortIds).length > 0).length,
  };
}

function uniqueMap(state, rows, field, code) {
  const groups = new Map();
  for (const row of array(rows)) {
    const key = text(row?.[field]), bucket = groups.get(key) || [];
    bucket.push(row); groups.set(key, bucket);
  }
  const result = new Map();
  for (const [key, bucket] of groups) {
    if (bucket.length === 1) result.set(key, bucket[0]);
    else block(state, code, { key, claims: bucket });
  }
  return result;
}
function duplicateValues(values) { const seen = new Set(), duplicates = new Set(); for (const value of values) seen.has(value) ? duplicates.add(value) : seen.add(value); return [...duplicates].sort(compareText); }
function validation(state) { const blockers = sortIssues(dedupe(state.blockers)), reviewItems = sortIssues(dedupe(state.reviewItems)); return { status: blockers.length ? 'BLOCKED' : (reviewItems.length ? 'REVIEW_REQUIRED' : 'PASS'), blockers, reviewItems, warnings: sortIssues(dedupe(state.warnings)) }; }
function dedupe(values) { const seen = new Set(); return array(values).filter((row) => { const key = canonicalSemanticJson(row); if (seen.has(key)) return false; seen.add(key); return true; }); }
function sortIssues(values) { return [...values].sort((a, b) => `${a.code}|${canonicalSemanticJson(a.evidence)}`.localeCompare(`${b.code}|${canonicalSemanticJson(b.evidence)}`)); }
function block(state, code, evidence = {}) { state.blockers.push(issue(code, evidence)); }
function issue(code, evidence = {}) { return { code, evidence }; }
function unique(values) { return [...new Set(values)]; }
function compareText(a, b) { return String(a ?? '').localeCompare(String(b ?? '')); }
function integer(value, fallback) { return Number.isInteger(value) ? value : fallback; }
function requireObject(value, name) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} is required.`); }
function array(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
async function hash(value) { const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalSemanticJson(value))); return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`; }
