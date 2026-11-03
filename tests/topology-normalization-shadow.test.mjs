import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { canonicalSemanticJson } from '../contracts/topo-enriched-xml/contract-core.js';
import { normalizeLogicalTopologyShadow, computeTopologyNormalizationHash } from '../tabs/stagedjson-to-enrichxml/topology-normalization/topology-normalizer-shadow.js';
import { makeShadowFixture, rehash, addGapCandidate, addNodePort } from './fixtures/topology-normalization/shadow-fixture.mjs';

const clone = structuredClone;
const codes = (result) => result.validation.blockers.map((row) => row.code);
const action = (result, id) => result.normalization.actions.find((row) => row.sourceEntityId === id);

 test('consumes an authorized micro-component and snaps an authorized explicit micro-gap in SHADOW only', async () => {
  const data = await makeShadowFixture();
  const result = await normalizeLogicalTopologyShadow(data);
  assert.equal(result.validation.status, 'PASS');
  assert.deepEqual([result.operatingMode, result.authoritative, result.selectable], ['SHADOW', false, false]);
  assert.equal(action(result, 'E-MIC').disposition, 'CONSUME_MICRO_COMPONENT');
  assert.equal(action(result, 'E-MIC').survivorLogicalNodeId, 'N1');
  assert.equal(action(result, 'E-GAP').disposition, 'SNAP_MICRO_GAP');
  assert.equal(action(result, 'E-GAP').survivorLogicalNodeId, 'N5');
  assert.deepEqual([result.comparison.inputNodeCount, result.comparison.outputNodeCount], [8, 6]);
  assert.deepEqual([result.comparison.inputEdgeCount, result.comparison.outputEdgeCount], [5, 4]);
  const mappings = new Map(result.normalization.rawPortMappings.map((row) => [row.sourcePortId, row.logicalNodeId]));
  assert.deepEqual([mappings.get('P2'), mappings.get('P3'), mappings.get('P6'), mappings.get('P7')], ['N1', 'N1', 'N5', 'N5']);
  assert.equal(await computeTopologyNormalizationHash(result.normalization), result.normalization.normalizationHash);
});

test('preserves a short ordinary pipe and blocks an explicitly requested distance-only component', async () => {
  const ordinary = await makeShadowFixture();
  Object.assign(ordinary.sourceInventory.entities.find((row) => row.sourceEntityId === 'E-MIC'), { rawComponentType: 'PIPE', normalizedComponentType: 'PIPE', normalizationRequested: false });
  await rehash(ordinary);
  const preserved = await normalizeLogicalTopologyShadow(ordinary);
  assert.equal(action(preserved, 'E-MIC').disposition, 'PRESERVE');
  assert.equal(action(preserved, 'E-MIC').evidence.reasonCode, 'DISTANCE_ONLY_COLLAPSE_PROHIBITED');

  const requested = clone(ordinary);
  Object.assign(requested.sourceInventory.entities.find((row) => row.sourceEntityId === 'E-MIC'), { rawComponentType: 'UNKNOWN_SHORT', normalizedComponentType: 'UNKNOWN_SHORT', normalizationRequested: true });
  await rehash(requested);
  const blocked = await normalizeLogicalTopologyShadow(requested);
  assert.ok(codes(blocked).includes('MICRO_COMPONENT_AUTHORITY_MISSING'));
  assert.equal(action(blocked, 'E-MIC').disposition, 'BLOCKED_CONFLICT');
});

test('blocks branch, boundary, support, restraint and anchor semantics independently', async () => {
  const cases = [
    (d) => d.logicalGraph.junctions.push({ junctionId: 'J1', logicalNodeId: 'N1' }),
    (d) => d.logicalGraph.boundaries.push({ boundaryId: 'B1', logicalNodeId: 'N1' }),
    (d) => d.logicalGraph.supports.push({ supportId: 'S1', logicalNodeId: 'N1' }),
    (d) => { d.logicalGraph.nodes.find((row) => row.logicalNodeId === 'N1').restraints = [{ type: 'ANC' }]; },
    (d) => { d.logicalGraph.nodes.find((row) => row.logicalNodeId === 'N1').isAnchor = true; },
  ];
  const expected = ['BRANCH_OR_JUNCTION_COLLAPSE_PROHIBITED', 'BOUNDARY_COLLAPSE_PROHIBITED', 'SUPPORT_OR_ANCHOR_COLLAPSE_PROHIBITED', 'SUPPORT_OR_ANCHOR_COLLAPSE_PROHIBITED', 'SUPPORT_OR_ANCHOR_COLLAPSE_PROHIBITED'];
  for (let i = 0; i < cases.length; i += 1) {
    const data = await makeShadowFixture(); cases[i](data); await rehash(data);
    const result = await normalizeLogicalTopologyShadow(data);
    assert.ok(codes(result).includes(expected[i]), expected[i]);
  }
});

test('blocks distinct exact histories, missing port ownership and cross-line ownership', async () => {
  const history = await makeShadowFixture();
  history.exactHistoryEvidence.matches.push({ logicalNodeId: 'N2', historyNodeId: 'H2' });
  await rehash(history);
  assert.ok(codes(await normalizeLogicalTopologyShadow(history)).includes('HISTORICAL_IDENTITY_COLLAPSE_CONFLICT'));

  const missing = await makeShadowFixture();
  delete missing.sourceInventory.ports.find((row) => row.sourcePortId === 'P3').logicalNodeId;
  missing.logicalGraph.nodes.find((row) => row.logicalNodeId === 'N2').sourcePortIds = ['P4'];
  await rehash(missing);
  assert.ok(codes(await normalizeLogicalTopologyShadow(missing)).includes('RAW_PORT_MAPPING_INCOMPLETE'));

  const line = await makeShadowFixture();
  line.sourceInventory.ports.find((row) => row.sourcePortId === 'P3').canonicalMainLine = '/OTHER';
  await rehash(line);
  assert.ok(codes(await normalizeLogicalTopologyShadow(line)).includes('BRANCH_OR_JUNCTION_COLLAPSE_PROHIBITED'));
});

test('blocks self-loop, duplicate-edge and disconnect defects as separate graph failures', async () => {
  const selfLoop = await makeShadowFixture();
  selfLoop.logicalGraph.edges.push({ logicalEdgeId: 'LE-PARALLEL', fromLogicalNodeId: 'N1', toLogicalNodeId: 'N2', sourceEntityIds: ['E-OTHER'] });
  selfLoop.policy.componentRules[0].allowedDegreePatterns.push([3, 3]);
  await rehash(selfLoop);
  assert.ok(codes(await normalizeLogicalTopologyShadow(selfLoop)).includes('NORMALIZATION_SELF_LOOP_CREATED'));

  const duplicate = await makeShadowFixture();
  duplicate.logicalGraph.edges = duplicate.logicalGraph.edges.filter((row) => row.logicalEdgeId !== 'LE-RIGHT');
  duplicate.logicalGraph.edges.push({ logicalEdgeId: 'LE-DUP', fromLogicalNodeId: 'N0', toLogicalNodeId: 'N2', sourceEntityIds: ['E-OTHER'] });
  await rehash(duplicate);
  assert.ok(codes(await normalizeLogicalTopologyShadow(duplicate)).includes('NORMALIZATION_DUPLICATE_EDGE_CREATED'));

  const disconnect = await makeShadowFixture();
  disconnect.logicalGraph.nodes.push({ logicalNodeId: 'N8', logicalRole: 'ROUTE', sourcePortIds: [] });
  disconnect.logicalGraph.edges.push({ logicalEdgeId: 'LE-MIC-TAIL', fromLogicalNodeId: 'N2', toLogicalNodeId: 'N8', sourceEntityIds: ['E-MIC'] });
  disconnect.policy.componentRules[0].allowedDegreePatterns.push([2, 3]);
  await rehash(disconnect);
  assert.ok(codes(await normalizeLogicalTopologyShadow(disconnect)).includes('NORMALIZATION_DISCONNECT_CREATED'));
});

test('enforces total transitive cluster diameter instead of pairwise-short acceptance', async () => {
  const data = await makeShadowFixture();
  data.policy.gapRules[0].allowedDegreePatterns.push([0, 0]);
  for (const [id, node, x, role] of [['PX1','N8',500,'FROM'],['PX2','N9',504,'TO'],['PX3','N9',504,'FROM'],['PX4','N10',508,'TO']]) {
    if (!data.logicalGraph.nodes.some((row) => row.logicalNodeId === node)) data.logicalGraph.nodes.push({ logicalNodeId: node, logicalRole: 'ROUTE', sourcePortIds: [] });
    addNodePort(data, id, `PORT-${id}`, node, x, '/L/B1', '/L', role);
  }
  addGapCandidate(data, { id: 'G1', fromPort: 'PX1', toPort: 'PX2', gapMm: 4 });
  addGapCandidate(data, { id: 'G2', fromPort: 'PX3', toPort: 'PX4', gapMm: 4 });
  await rehash(data);
  const result = await normalizeLogicalTopologyShadow(data);
  assert.ok(codes(result).includes('TRANSITIVE_CLUSTER_DIAMETER_EXCEEDED'));
  assert.equal(action(result, 'G1').disposition, 'BLOCKED_CONFLICT');
  assert.equal(action(result, 'G2').disposition, 'BLOCKED_CONFLICT');
});

test('blocks a mixed-authority cluster rather than partially collapsing it', async () => {
  const data = await makeShadowFixture();
  data.policy.gapRules[0].allowedDegreePatterns.push([0, 0]);
  for (const [id, node, x, role] of [['PM1','N8',500,'FROM'],['PM2','N9',502,'TO'],['PM3','N9',502,'FROM'],['PM4','N10',504,'TO']]) {
    if (!data.logicalGraph.nodes.some((row) => row.logicalNodeId === node)) data.logicalGraph.nodes.push({ logicalNodeId: node, logicalRole: 'ROUTE', sourcePortIds: [] });
    addNodePort(data, id, `PORT-${id}`, node, x, '/L/B1', '/L', role);
  }
  addGapCandidate(data, { id: 'G-AUTH', fromPort: 'PM1', toPort: 'PM2', gapMm: 2 });
  data.sourceInventory.entities.push({ sourceEntityId: 'G-NOAUTH', sourcePath: '$.gaps.bad', sourceBranch: '/L/B1', canonicalMainLine: '/L', normalizationCandidateKind: 'UNKNOWN_GAP', normalizationRequested: true, sourcePortIds: ['PM3','PM4'], gapMm: 2 });
  data.occurrencePlan.occurrences.push({ occurrenceId:'O-BAD', sourceEntityId:'G-NOAUTH', sourceBranch:'/L/B1', canonicalMainLine:'/L', componentProjectionId:'CP-BAD', projectionRole:'PRIMARY', endpoint:1, psiComponentType:'GAP', coordinateRole:'BEST', disposition:'EMITTED' });
  data.occurrencePlan.componentProjection.push({ componentProjectionId:'CP-BAD', occurrenceIds:['O-BAD'] });
  await rehash(data);
  const result = await normalizeLogicalTopologyShadow(data);
  assert.ok(codes(result).includes('MIXED_AUTHORITY_CLUSTER_BLOCKED'));
  assert.equal(action(result, 'G-AUTH').disposition, 'BLOCKED_CONFLICT');
});

test('rejects stale source, topology, occurrence, history and policy hashes independently', async () => {
  const data = await makeShadowFixture();
  data.logicalGraph.sourceInventoryHash = 'sha256:stale-source';
  data.occurrencePlan.logicalTopologyHash = 'sha256:stale-topology';
  data.occurrencePlan.occurrencePlanHash = 'sha256:stale-occurrence';
  data.exactHistoryEvidence.historyMatchResultHash = 'sha256:stale-history';
  data.policy.policyHash = 'sha256:stale-policy';
  const result = await normalizeLogicalTopologyShadow(data);
  for (const code of ['SOURCE_INVENTORY_HASH_MISMATCH','INPUT_LOGICAL_TOPOLOGY_HASH_MISMATCH','OCCURRENCE_PLAN_HASH_MISMATCH','EXACT_HISTORY_EVIDENCE_HASH_MISMATCH','NORMALIZATION_POLICY_HASH_MISMATCH']) assert.ok(codes(result).includes(code), code);
});

test('produces stable output graph and action evidence under shuffled inputs and audit timestamps', async () => {
  const firstData = await makeShadowFixture(), secondData = clone(firstData);
  secondData.sourceInventory.entities.reverse(); secondData.sourceInventory.ports.reverse();
  secondData.logicalGraph.nodes.reverse(); secondData.logicalGraph.edges.reverse();
  secondData.occurrencePlan.occurrences.reverse(); secondData.occurrencePlan.componentProjection.reverse();
  secondData.evaluatedAt = '2099-01-01T00:00:00Z';
  await rehash(secondData);
  const first = await normalizeLogicalTopologyShadow(firstData), second = await normalizeLogicalTopologyShadow(secondData);
  assert.equal(first.normalization.outputLogicalTopologyHash, second.normalization.outputLogicalTopologyHash);
  const semanticActions = (value) => value.normalization.actions.map(({ issues, ...row }) => row);
  assert.equal(canonicalSemanticJson(semanticActions(first)), canonicalSemanticJson(semanticActions(second)));
});

test('does not mutate inputs, allocate numbers, wire production selection or expose mutable output', async () => {
  const data = await makeShadowFixture(), before = clone(data);
  const result = await normalizeLogicalTopologyShadow(data);
  assert.deepEqual(data, before);
  assert.equal(/engineeringNodeNumber|nodeCounter|startNodeNumber/.test(JSON.stringify(result)), false);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.proposedLogicalGraph.nodes) && Object.isFrozen(result.normalization.actions[0]));
});

test('keeps every TE-009 source and test file below 300 lines and free of forbidden authority', () => {
  const files = [
    '../tabs/stagedjson-to-enrichxml/topology-normalization/normalization-policy.js',
    '../tabs/stagedjson-to-enrichxml/topology-normalization/micro-candidate-builder.js',
    '../tabs/stagedjson-to-enrichxml/topology-normalization/topology-conflict-gates.js',
    '../tabs/stagedjson-to-enrichxml/topology-normalization/topology-normalizer-shadow.js',
    './topology-normalization-shadow.test.mjs',
    './fixtures/topology-normalization/shadow-fixture.mjs',
  ];
  const forbidden = [/raycast/i,/nodeCounter/,/startNodeNumber/,/engineeringNodeNumber\s*=/,/new\s+Date\s*\(/,/Date\.now\s*\(/,/buildTopoEnrichedXml\s*\(/];
  for (const relative of files) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.ok(source.split('\n').length <= 300, relative);
    if (relative.includes('topology-normalization-shadow.test')) continue;
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `${relative}: ${pattern}`);
    assert.equal(source.toLowerCase().includes('nearest' + '-coordinate'), false, relative);
  }
});
