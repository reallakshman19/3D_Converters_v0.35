import assert from 'node:assert/strict';
import { executeMapping, successCounts } from '../../tabs/model-converters/converters/fbx/conversion-core.js';

const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const direction = (vector) => ({ authority: 'world-vector', vector });

function entry(id, model, geometry, start, end) {
  const peer = id === 'p1' ? 'p2' : 'p1', local = id === 'p1' ? 'L' : 'A';
  const target = id === 'p1' ? 'A' : 'L';
  const port = (role, vertexIndex, vector) => ({
    portId: `${id}-${role}`, role, authority: 'mesh-vertex', geometryObjectId: geometry,
    vertexIndex, direction: direction(vector), connections: role === local
      ? [{ mappingEntryId: peer, portId: `${peer}-${target}` }] : [],
  });
  return {
    mappingEntryId: id, logicalComponentId: id.toUpperCase(),
    sourceModelObjectId: model, sourceOccurrenceId: `occ:${model}`,
    sourceGeometryObjectIds: [geometry], componentType: 'PIPE', scopeDisposition: 'promote',
    ports: { A: port('A', 0, [-1, 0, 0]), L: port('L', 1, [1, 0, 0]) },
    engineering: {}, verticesMm: [[start, 0, 0], [end, 0, 0]],
  };
}

function fixture(rightStart = 110) {
  const specs = [entry('p1', '1', '10', 0, 10), entry('p2', '2', '20', rightStart, rightStart + 10)];
  return {
    mapping: {
      schema: 'FbxStagedMapping.v2', inScopeSourceObjectIds: ['1', '2'],
      entries: specs.map(({ verticesMm, ...item }) => item), exclusions: [],
    },
    graph: {
      schema: 'FbxSourceGraph.v2',
      sourceObjects: specs.flatMap((item) => [
        { sourceObjectId: item.sourceModelObjectId, ufbxElementType: 'NODE' },
        { sourceObjectId: item.sourceGeometryObjectIds[0], ufbxElementType: 'MESH' },
      ]),
      occurrences: specs.map((item) => ({
        sourceOccurrenceId: item.sourceOccurrenceId, sourceModelObjectId: item.sourceModelObjectId,
        geometryObjectIds: item.sourceGeometryObjectIds, inheritMode: 0, geometryMatrixMm: identity,
      })),
      geometries: specs.map((item) => ({
        geometryObjectId: item.sourceGeometryObjectIds[0], kind: 'MESH',
        verticesMm: item.verticesMm, ownerOccurrenceIds: [item.sourceOccurrenceId],
      })),
    },
  };
}

const run = ({ mapping, graph }) => executeMapping(mapping, graph, graph);
const execution = run(fixture());
const children = execution.staged.flatMap((branch) => branch.children);
assert.equal(execution.entries.length, 3);
assert.equal(execution.links.length, 2);
assert.equal(execution.gapPipeEvidence.counts.generatedPipeCount, 1);
assert.deepEqual(children.map((child) => child.attributes.REF), ['P1', 'FBX-GAP-PIPE-0001', 'P2']);
const provenance = children[1].attributes.mappingEngineering.generationProvenance;
assert.equal(children[1].type, 'PIPE');
assert.equal(children[1].attributes.sourceOccurrenceId, null);
assert.equal(provenance.generationMethod, 'EXPLICIT_LINK_STRAIGHT_GAP_V1');
assert.deepEqual(provenance.sourceOccurrenceIds, ['occ:1', 'occ:2']);
const counts = successCounts(execution);
assert.equal(counts.promotedComponents, 2);
assert.equal(counts.releasedComponents, 3);
assert.equal(counts.generatedGapPipes, 1);
assert.equal(counts.releasedByFamily.PIPE, 3);
assert.equal(counts.explicitConnections, 2);
assert.equal(counts.branches, 1);

const coincident = run(fixture(10));
assert.equal(coincident.entries.length, 2);
assert.equal(coincident.links.length, 1);
assert.equal(coincident.gapPipeEvidence.counts.generatedPipeCount, 0);
assert.equal(Object.hasOwn(successCounts(coincident), 'generatedGapPipes'), false);
assert.equal(coincident.staged.flatMap((branch) => branch.children).length, 2);
console.log('PASS test-generated-gap-pipe-mapping');
