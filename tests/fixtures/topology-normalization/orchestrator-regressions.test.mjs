import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLogicalTopologyShadow } from '../../../tabs/stagedjson-to-enrichxml/topology-normalization/topology-normalizer-shadow.js';
import { collectNodeReferences } from '../../../tabs/stagedjson-to-enrichxml/topology-normalization/topology-node-references.js';
import { makeShadowFixture, rehash } from './shadow-fixture.mjs';

const codes = (result) => result.validation.blockers.map((row) => row.code);

test('array and nested node references enforce junction, boundary and support exclusions', async () => {
  const scenarios = [
    ['junctions', { junctionId: 'J-ARRAY', endpointLogicalNodeIds: ['N0', 'N1'] }, 'BRANCH_OR_JUNCTION_COLLAPSE_PROHIBITED'],
    ['boundaries', { boundaryId: 'B-ARRAY', topology: { logicalNodeIds: ['N1', 'N9'] } }, 'BOUNDARY_COLLAPSE_PROHIBITED'],
    ['supports', { supportId: 'S-ARRAY', connectedLogicalNodeIds: ['N1'] }, 'SUPPORT_OR_ANCHOR_COLLAPSE_PROHIBITED'],
  ];
  for (const [collection, row, code] of scenarios) {
    const input = await makeShadowFixture(); input.logicalGraph[collection].push(row); await rehash(input);
    const result = await normalizeLogicalTopologyShadow(input);
    assert.ok(codes(result).includes(code), `${collection}: ${code}`);
    assert.equal(result.normalization.actions.find((action) => action.sourceEntityId === 'E-MIC').disposition, 'BLOCKED_CONFLICT');
  }
});

test('approved normalization remaps active references while preserving consumed-node lineage', async () => {
  const input = await makeShadowFixture();
  input.logicalGraph.junctions.push({ junctionId: 'J-UNRELATED', endpointLogicalNodeIds: ['N0', 'N4'] });
  input.logicalGraph.boundaries.push({ boundaryId: 'B-UNRELATED', topology: { logicalNodeIds: ['N4'] } });
  await rehash(input);
  const result = await normalizeLogicalTopologyShadow(input);
  assert.equal(result.validation.status, 'PASS');
  const graph = result.proposedLogicalGraph;
  const active = [...graph.edges, ...graph.junctions, ...graph.boundaries, ...graph.supports]
    .flatMap(collectNodeReferences);
  assert.equal(active.includes('N2'), false);
  assert.equal(active.includes('N6'), false);
  assert.ok(graph.nodes.some((row) => row.consumedLogicalNodeIds?.includes('N2')));
  assert.ok(graph.nodes.some((row) => row.consumedLogicalNodeIds?.includes('N6')));
  assert.deepEqual(graph.junctions[0].endpointLogicalNodeIds, ['N0', 'N4']);
});

test('timezone-less and invalid evaluatedAt values block shadow normalization', async () => {
  for (const evaluatedAt of ['2026-07-20T10:00:00', '2026-13-40T25:99:99Z']) {
    const input = await makeShadowFixture(); input.evaluatedAt = evaluatedAt;
    const result = await normalizeLogicalTopologyShadow(input);
    assert.ok(codes(result).includes('EVALUATED_AT_INVALID'), evaluatedAt);
    assert.equal(result.selectable, false);
  }
});
