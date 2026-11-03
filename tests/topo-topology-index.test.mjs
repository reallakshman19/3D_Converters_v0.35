import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalSemanticJson, computeSemanticHash } from '../contracts/topo-enriched-xml/contract-core.js';
import { computeOccurrencePlanHash } from '../tabs/stagedjson-to-enrichxml/psi-serialization-plan.js';
import { buildTopoTopologyIndex, computeTopoTopologyIndexHash } from '../tabs/stagedjson-to-enrichxml/topo-topology-index.js';
import { buildTopoTraceLedger, computeTopoTraceLedgerHash } from '../tabs/stagedjson-to-enrichxml/topo-trace-ledger.js';

const V = () => ({ status: 'PASS', blockers: [], reviewItems: [], warnings: [] });
const clone = structuredClone;

async function fixture() {
  const sourceInventory = {
    schema: 'TopoSourceInventory.v1', projectId: 'P', zoneId: 'Z', coordinateFrameId: 'F',
    sourceIdentity: { sourceHash: 'sha256:source' },
    branches: [{ sourceBranch: '/P/B1', canonicalMainLine: '/P' }, { sourceBranch: '/P/B2', canonicalMainLine: '/P' }],
    entities: [entity('E1', 'pipe', '/P/B1', 'DUP-TAG'), entity('E2', 'tee', '/P/B1', 'TEE-1'), entity('E3', 'reducer', '/P/B2', 'RED-1'), entity('E4', 'support', '/P/B1', 'SUP-1'), entity('E5', 'boundary', '/P/B2', 'DUP-TAG')],
    ports: [port('P1', 'E1', 'APOS'), port('P2', 'E1', 'LPOS'), port('P3', 'E2', 'HPOS'), port('P4', 'E2', 'BPOS'), port('P5', 'E3', 'APOS'), port('P6', 'E3', 'LPOS'), port('P7', 'E4', 'POS'), port('P8', 'E5', 'APOS'), port('P9', 'E5', 'LPOS')],
    validation: V(), evaluatedAt: '2026-07-20T01:00:00Z',
  };
  const sourceInventoryHash = await computeSemanticHash(sourceInventory, 'sourceInventoryHash');
  const logicalGraph = {
    schema: 'TopoLogicalGraph.v1', projectId: 'P', zoneId: 'Z', coordinateFrameId: 'F', sourceInventoryHash,
    nodes: ['LN1', 'LN2', 'LN3', 'LN4', 'LN5'].map((logicalNodeId) => ({ logicalNodeId })),
    edges: [edge('LE1', 'LN1', 'LN2', 'E1', ['P1', 'P2'], '/P/B1'), edge('LE2', 'LN2', 'LN3', 'E2', ['P3', 'P4'], '/P/B1'), edge('LE3', 'LN3', 'LN4', 'E3', ['P5', 'P6'], '/P/B2'), edge('LE4', 'LN4', 'LN5', 'E5', ['P8', 'P9'], '/P/B2')],
    junctions: [], boundaries: [], supports: [{ sourceEntityId: 'E4', logicalNodeId: 'LN2' }], validation: V(),
  };
  const logicalTopologyHash = await computeSemanticHash(logicalGraph, 'logicalTopologyHash');
  const occurrences = [
    occ('O1', 'E1', 'CP1', 'ARRIVE', 1, 'PIPE', 'EMITTED', '/P/B1'), occ('O2', 'E1', 'CP1', 'LEAVE', 2, 'PIPE', 'EMITTED', '/P/B1'),
    occ('O3', 'E2', 'CP2', 'RESERVED_BEFORE', 'RESERVED', 'BRAN', 'RESERVED', '/P/B1'), occ('O4', 'E2', 'CP2', 'BRANCH_LEAVE', 1, 'BRAN', 'EMITTED', '/P/B1'),
    occ('O5', 'E3', 'CP3', 'RESERVED_BEFORE', 'RESERVED', 'REDU', 'RESERVED', '/P/B2'), occ('O6', 'E3', 'CP3', 'LEAVE', 2, 'REDU', 'EMITTED', '/P/B2'),
    occ('O7', 'E4', 'CP4', 'PRIMARY', 1, 'ATTA', 'EMITTED', '/P/B1'), occ('O8', 'E5', 'CP5', 'BOUNDARY_IN', 1, 'FLAN', 'EMITTED', '/P/B2'), occ('O9', 'E5', 'CP5', 'BOUNDARY_OUT', 2, 'FLAN', 'EMITTED', '/P/B2'),
  ];
  const occurrencePlan = { schema: 'PsiWriterOccurrencePlan.v1', projectId: 'P', zoneId: 'Z', sourceInventoryHash, logicalTopologyHash, sequencePlanHash: 'sha256:sequence', occurrences, componentProjection: projectionRows(occurrences), validation: V(), evaluatedAt: '2026-07-20T01:00:00Z' };
  occurrencePlan.occurrencePlanHash = await computeOccurrencePlanHash(occurrencePlan);
  const allocations = [alloc('O1', 'LN1', 'CP1', 100), alloc('O2', 'LN2', 'CP1', 110), alloc('O3', 'LN2', 'CP2', 110), alloc('O4', 'LN3', 'CP2', 120), alloc('O5', 'LN3', 'CP3', 120), alloc('O6', 'LN4', 'CP3', 130), alloc('O7', 'LN2', 'CP4', 110), alloc('O8', 'LN4', 'CP5', 130), alloc('O9', 'LN5', 'CP5', 140)];
  const nodePlan = {
    schema: 'TopoNodePlan.v1', projectId: 'P', zoneId: 'Z', sourceInventoryHash, logicalTopologyHash,
    sequencePlanHash: 'sha256:sequence', baseRegistrySnapshotHash: 'sha256:registry', configHash: 'sha256:config',
    logicalNodes: [{ logicalNodeId: 'LN1', historyNodeId: 'H1' }, ...['LN2', 'LN3', 'LN4', 'LN5'].map((logicalNodeId) => ({ logicalNodeId }))],
    emittedOccurrences: allocations.filter((row) => !['O3', 'O5'].includes(row.occurrenceId)), reservedOccurrences: allocations.filter((row) => ['O3', 'O5'].includes(row.occurrenceId)),
    rawPortMappings: [map('P1', 'LN1'), map('P2', 'LN2'), map('P3', 'LN2'), map('P4', 'LN3'), map('P5', 'LN3'), map('P6', 'LN4'), map('P7', 'LN2'), map('P8', 'LN4'), map('P9', 'LN5')],
    componentProjection: nodeProjectionRows(occurrences), validation: V(), evaluatedAt: '2026-07-20T01:00:00Z',
  };
  nodePlan.nodePlanHash = await computeSemanticHash(nodePlan, 'nodePlanHash');
  const historyMatchResult = { schema: 'TopoNodeHistoryMatchResult.v1', projectId: 'P', zoneId: 'Z', mainLineKey: '/P', coordinateFrameId: 'F', logicalTopologyHash, baseRegistrySnapshotHash: 'sha256:registry', matches: [{ logicalNodeId: 'LN1', historyNodeId: 'H1' }], newNodes: [], ambiguous: [], conflicts: [], reactivated: [], retirementCandidates: [], validation: V() };
  historyMatchResult.historyMatchResultHash = await computeSemanticHash(historyMatchResult, 'historyMatchResultHash');
  const trace = emittedTrace(occurrences, allocations), xmlText = xml(trace);
  const strictWriterBundle = await materializeBundle({ projectId: 'P', zoneId: 'Z', nodePlanHash: nodePlan.nodePlanHash, occurrencePlanHash: occurrencePlan.occurrencePlanHash, trace, xmlText });
  return { sourceInventory, logicalGraph, occurrencePlan, nodePlan, historyMatchResult, strictWriterBundle };
}

async function materializeBundle(bundle) {
  const base = { schema: 'topo-enriched-xml-writer-bundle/v1', generated: true, selectable: false, operatingMode: 'SHADOW', profile: 'STRICT_PSI', evaluatedAt: '2026-07-20T01:00:00Z', serializationPlanHash: 'sha256:serialization', branchProjectionId: 'BP-CANON', projectionKind: 'CANONICAL', validation: V(), ...bundle };
  base.xmlHash = await rawHash(base.xmlText); base.traceHash = await semanticHash(base.trace);
  base.summary = { branchCount: 2, emittedOccurrenceCount: base.trace.length, reservedOccurrenceCount: 2, xmlNodeCount: base.trace.length, traceCount: base.trace.length, writerSideAllocations: 0 };
  base.bundleHash = await semanticHash(bundleSemantic(base)); return base;
}
function bundleSemantic(value) { const keys = ['schema', 'operatingMode', 'profile', 'evaluatedAt', 'projectId', 'zoneId', 'nodePlanHash', 'occurrencePlanHash', 'serializationPlanHash', 'branchProjectionId', 'projectionKind', 'xmlHash', 'traceHash']; return Object.fromEntries(keys.map((key) => [key, value[key]])); }
function entity(id, name, branch, alias) { return { sourceEntityId: id, sourcePath: `$.branches.${name}`, sourceBranch: branch, componentRefNo: alias }; }
function port(id, entityId, field) { return { sourcePortId: id, sourceEntityId: entityId, sourcePath: `$.${entityId}.${field}`, role: 'PORT', field }; }
function edge(id, from, to, entityId, ports, branch) { return { logicalEdgeId: id, fromLogicalNodeId: from, toLogicalNodeId: to, sourceEntityIds: [entityId], sourcePortIds: ports, sourceBranch: branch, canonicalMainLine: '/P' }; }
function occ(id, entityId, projectionId, role, endpoint, type, disposition, branch) { return { occurrenceId: id, sourceEntityId: entityId, sourceBranch: branch, canonicalMainLine: '/P', componentProjectionId: projectionId, projectionRole: role, endpoint, psiComponentType: type, coordinateRole: disposition === 'RESERVED' ? 'NONE' : 'BEST', disposition }; }
function alloc(occurrenceId, logicalNodeId, componentProjectionId, engineeringNodeNumber) { return { occurrenceId, logicalNodeId, componentProjectionId, engineeringNodeNumber }; }
function map(sourcePortId, logicalNodeId) { return { sourcePortId, logicalNodeId }; }
function projectionRows(rows) { return [...new Set(rows.map((row) => row.componentProjectionId))].map((id) => ({ componentProjectionId: id, occurrenceIds: rows.filter((row) => row.componentProjectionId === id).map((row) => row.occurrenceId) })); }
function nodeProjectionRows(rows) { return projectionRows(rows).map((projection) => ({ componentProjectionId: projection.componentProjectionId, sourceEntityId: rows.find((row) => row.componentProjectionId === projection.componentProjectionId).sourceEntityId, emittedOccurrenceIds: projection.occurrenceIds.filter((id) => rows.find((row) => row.occurrenceId === id).disposition === 'EMITTED'), reservedOccurrenceIds: projection.occurrenceIds.filter((id) => rows.find((row) => row.occurrenceId === id).disposition === 'RESERVED') })); }
function emittedTrace(rows, allocations) { return rows.filter((row) => row.disposition === 'EMITTED').map((row, traceIndex) => { const node = allocations.find((item) => item.occurrenceId === row.occurrenceId); return { traceIndex, branchIndex: row.sourceBranch.endsWith('B1') ? 0 : 1, nodeIndexInBranch: traceIndex, branchProjectionId: 'BP-CANON', branchName: '/P', projectionKind: 'CANONICAL', occurrenceId: row.occurrenceId, componentProjectionId: row.componentProjectionId, sourceEntityId: row.sourceEntityId, logicalNodeId: node.logicalNodeId, engineeringNodeNumber: node.engineeringNodeNumber, psiComponentType: row.psiComponentType, projectionRole: row.projectionRole, endpoint: row.endpoint }; }); }
function xml(trace) { return `<Pipe>${trace.map((row) => `<Node><NodeNumber>${row.engineeringNodeNumber}</NodeNumber><ComponentType>${row.psiComponentType}</ComponentType></Node>`).join('')}</Pipe>`; }
async function refreshBundle(data) { data.strictWriterBundle = await materializeBundle(data.strictWriterBundle); }
async function semanticHash(value) { return rawHash(canonicalSemanticJson(value)); }
async function rawHash(value) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`; }
function codes(value) { return value.validation.blockers.map((row) => row.code); }

test('builds complete exact forward/reverse index and source trace', async () => {
  const data = await fixture(), index = await buildTopoTopologyIndex(data);
  assert.equal(index.validation.status, 'PASS'); assert.equal(await computeTopoTopologyIndexHash(index), index.topologyIndexHash);
  assert.deepEqual(index.occurrences.find((row) => row.occurrenceId === 'O2').sourcePortIds, ['P2']); assert.deepEqual(index.occurrences.find((row) => row.occurrenceId === 'O7').sourcePortIds, ['P7']);
  const ledger = await buildTopoTraceLedger({ topologyIndex: index, strictWriterBundle: data.strictWriterBundle });
  assert.equal(ledger.validation.status, 'PASS'); assert.equal(await computeTopoTraceLedgerHash(ledger), ledger.traceLedgerHash);
  assert.deepEqual(ledger.sourceTrace.find((row) => row.occurrenceId === 'O2').sourceEntityIds, ['E1']); assert.deepEqual(ledger.sourceTrace.find((row) => row.occurrenceId === 'O2').sourcePortIds, ['P2']);
});

test('hash is stable under non-semantic evidence ordering while trace order remains XML-semantic', async () => {
  const data = await fixture(), shuffled = clone(data);
  shuffled.componentAliases = [{ alias: 'EXPLICIT-B', sourceEntityId: 'E2' }, { alias: 'EXPLICIT-A', sourceEntityId: 'E1' }];
  const ordered = clone(shuffled); ordered.componentAliases.reverse();
  assert.equal((await buildTopoTopologyIndex(shuffled)).topologyIndexHash, (await buildTopoTopologyIndex(ordered)).topologyIndexHash);
  const reorderedTrace = clone(data); reorderedTrace.strictWriterBundle.trace.reverse(); reorderedTrace.strictWriterBundle.traceHash = await semanticHash(reorderedTrace.strictWriterBundle.trace); reorderedTrace.strictWriterBundle.bundleHash = await semanticHash(bundleSemantic(reorderedTrace.strictWriterBundle));
  assert.ok(codes(await buildTopoTopologyIndex(reorderedTrace)).includes('XML_TRACE_IDENTITY_MISMATCH'));
});

test('preserves duplicate ownership claims without resolving a winner', async () => {
  const data = await fixture(); data.logicalGraph.nodes.push({ logicalNodeId: 'LN9' }); data.nodePlan.logicalNodes.push({ logicalNodeId: 'LN9' }); data.nodePlan.rawPortMappings.push({ sourcePortId: 'P2', logicalNodeId: 'LN9' });
  data.nodePlan.nodePlanHash = await computeSemanticHash(data.nodePlan, 'nodePlanHash'); data.strictWriterBundle.nodePlanHash = data.nodePlan.nodePlanHash; await refreshBundle(data);
  const index = await buildTopoTopologyIndex(data), portRow = index.sourcePorts.find((row) => row.sourcePortId === 'P2');
  assert.ok(codes(index).includes('DUPLICATE_SOURCE_PORT_OWNER')); assert.deepEqual(portRow.claimedLogicalNodeIds, ['LN2', 'LN9']); assert.equal(portRow.resolvedLogicalNodeId, null);
});

test('blocks stale history, trace, XML and bundle hashes independently', async () => {
  const data = await fixture(); data.historyMatchResult.historyMatchResultHash = 'sha256:stale'; data.strictWriterBundle.traceHash = 'sha256:stale'; data.strictWriterBundle.xmlHash = 'sha256:stale'; data.strictWriterBundle.bundleHash = 'sha256:stale';
  const found = codes(await buildTopoTopologyIndex(data)); ['HISTORY_MATCH_RESULT_HASH_MISMATCH', 'TRACE_HASH_MISMATCH', 'XML_HASH_MISMATCH', 'BUNDLE_HASH_MISMATCH'].forEach((code) => assert.ok(found.includes(code)));
});

test('blocks trace-field substitution and XML content substitution even with refreshed hashes', async () => {
  const data = await fixture(); data.strictWriterBundle.trace[0].sourceEntityId = 'E2'; data.strictWriterBundle.trace[1].psiComponentType = 'VALV'; data.strictWriterBundle.xmlText = data.strictWriterBundle.xmlText.replace('<NodeNumber>100</NodeNumber>', '<NodeNumber>999</NodeNumber>'); await refreshBundle(data);
  const found = codes(await buildTopoTopologyIndex(data)); assert.ok(found.includes('OCCURRENCE_MAPPING_MISSING')); assert.ok(found.includes('XML_TRACE_IDENTITY_MISMATCH'));
});

test('does not satisfy an occurrence with an unrelated port on the same logical node', async () => {
  const data = await fixture(); data.nodePlan.rawPortMappings = data.nodePlan.rawPortMappings.filter((row) => row.sourcePortId !== 'P7'); data.nodePlan.nodePlanHash = await computeSemanticHash(data.nodePlan, 'nodePlanHash'); data.strictWriterBundle.nodePlanHash = data.nodePlan.nodePlanHash; await refreshBundle(data);
  const index = await buildTopoTopologyIndex(data); assert.ok(index.unresolvedReferences.some((row) => row.code === 'SOURCE_PORT_MAPPING_MISSING' && row.evidence.referenceId === 'O7')); assert.deepEqual(index.occurrences.find((row) => row.occurrenceId === 'O7').sourcePortIds, []);
});

test('reports reserved emission, missing trace, extra trace and XML cardinality independently', async () => {
  const data = await fixture(); data.strictWriterBundle.trace = data.strictWriterBundle.trace.filter((row) => row.occurrenceId !== 'O1'); data.strictWriterBundle.trace.push({ ...data.strictWriterBundle.trace[0], occurrenceId: 'O3' }, { ...data.strictWriterBundle.trace.at(-1), occurrenceId: 'O-X' }); await refreshBundle(data);
  const found = codes(await buildTopoTopologyIndex(data)); ['TRACE_COVERAGE_INCOMPLETE', 'RESERVED_OCCURRENCE_EMITTED', 'OCCURRENCE_MAPPING_MISSING', 'XML_TRACE_CARDINALITY_MISMATCH'].forEach((code) => assert.ok(found.includes(code), code));
});

test('preserves duplicate entity claims canonically without path winner selection', async () => {
  const data = await fixture(); data.sourceInventory.entities.push({ ...data.sourceInventory.entities[0], sourcePath: '$.conflict' }); const index = await buildTopoTopologyIndex(data), row = index.sourceEntities.find((item) => item.sourceEntityId === 'E1');
  assert.ok(codes(index).includes('DUPLICATE_SOURCE_ENTITY_ID')); assert.equal(row.sourcePath, null); assert.deepEqual(row.sourcePaths, ['$.branches.pipe', '$.conflict']);
});

test('one history identity or engineering number cannot resolve to unrelated logical nodes', async () => {
  const data = await fixture(); data.historyMatchResult.matches.push({ logicalNodeId: 'LN2', historyNodeId: 'H1' }); data.nodePlan.emittedOccurrences.push({ occurrenceId: 'O7', logicalNodeId: 'LN3', componentProjectionId: 'CP4', engineeringNodeNumber: 110 }); data.nodePlan.nodePlanHash = await computeSemanticHash(data.nodePlan, 'nodePlanHash'); data.strictWriterBundle.nodePlanHash = data.nodePlan.nodePlanHash; await refreshBundle(data);
  const found = codes(await buildTopoTopologyIndex(data)); assert.ok(found.includes('HISTORY_MAPPING_CONFLICT')); assert.ok(found.includes('NODE_NUMBER_MAPPING_CONFLICT'));
});

test('does not infer missing source evidence from coordinates, aliases, adjacency or numbers', async () => {
  const data = await fixture(); data.nodePlan.rawPortMappings = data.nodePlan.rawPortMappings.filter((row) => row.sourcePortId !== 'P2'); data.sourceInventory.ports.find((row) => row.sourcePortId === 'P2').position = { x: 1, y: 2, z: 3 }; data.nodePlan.nodePlanHash = await computeSemanticHash(data.nodePlan, 'nodePlanHash'); data.strictWriterBundle.nodePlanHash = data.nodePlan.nodePlanHash; await refreshBundle(data);
  const index = await buildTopoTopologyIndex(data); assert.ok(codes(index).includes('SOURCE_PORT_MAPPING_MISSING')); assert.equal(index.sourcePorts.find((row) => row.sourcePortId === 'P2').resolvedLogicalNodeId, null);
});

test('canonical and source-sequential presentations share one topology hash but different ledgers', async () => {
  const data = await fixture(), canonical = await buildTopoTopologyIndex(data), sequentialData = clone(data); sequentialData.strictWriterBundle.branchProjectionId = 'BP-SEQ'; sequentialData.strictWriterBundle.projectionKind = 'SOURCE_SEQUENTIAL'; sequentialData.strictWriterBundle.trace.forEach((row) => { row.branchProjectionId = 'BP-SEQ'; row.projectionKind = 'SOURCE_SEQUENTIAL'; }); await refreshBundle(sequentialData);
  const sequential = await buildTopoTopologyIndex(sequentialData); assert.equal(canonical.topologyIndexHash, sequential.topologyIndexHash);
  const left = await buildTopoTraceLedger({ topologyIndex: canonical, strictWriterBundle: data.strictWriterBundle }); const right = await buildTopoTraceLedger({ topologyIndex: sequential, strictWriterBundle: sequentialData.strictWriterBundle }); assert.notEqual(left.traceLedgerHash, right.traceLedgerHash);
});

test('inputs remain unchanged and outputs are deeply frozen', async () => {
  const data = await fixture(), before = clone(data), index = await buildTopoTopologyIndex(data), ledger = await buildTopoTraceLedger({ topologyIndex: await buildTopoTopologyIndex(data), strictWriterBundle: data.strictWriterBundle });
  assert.deepEqual(data, before); assert.equal(Object.isFrozen(index.logicalNodes[0]), true); assert.equal(Object.isFrozen(ledger.sourceTrace[0]), true);
});

test('ledger independently rejects stale topology index and bundle evidence', async () => {
  const data = await fixture(), index = await buildTopoTopologyIndex(data), staleIndex = clone(index), staleBundle = clone(data.strictWriterBundle); staleIndex.topologyIndexHash = 'sha256:stale'; staleBundle.bundleHash = 'sha256:stale';
  const ledger = await buildTopoTraceLedger({ topologyIndex: staleIndex, strictWriterBundle: staleBundle }); assert.ok(codes(ledger).includes('TOPOLOGY_INDEX_HASH_MISMATCH')); assert.ok(codes(ledger).includes('BUNDLE_HASH_MISMATCH'));
});
