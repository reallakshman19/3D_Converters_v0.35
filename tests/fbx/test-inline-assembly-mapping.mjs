import assert from 'node:assert/strict';
import { executeMapping, successCounts } from '../../tabs/model-converters/converters/fbx/conversion-core.js';

const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const direction = (vector) => ({ authority: 'world-vector', vector });

function mappedEntry({ id, model, geometry, family, engineering }) {
  const mappedPort = (role, vertexIndex, vector) => ({
    portId: `${id}-${role}`, role, authority: 'mesh-vertex', geometryObjectId: geometry,
    vertexIndex, direction: direction(vector), connections: [],
  });
  return {
    mappingEntryId: `map-${id}`, logicalComponentId: id,
    sourceModelObjectId: model, sourceOccurrenceId: `occ:${model}`,
    sourceGeometryObjectIds: [geometry], componentType: family, scopeDisposition: 'promote',
    ports: {
      A: mappedPort('A', 0, [-1, 0, 0]),
      L: mappedPort('L', 1, [1, 0, 0]),
    },
    engineering,
  };
}

const specs = [
  {
    id: 'GASKET-1', model: '1', geometry: '10', family: 'GASKET',
    verticesMm: [[0, 0, 0], [3, 0, 0]],
    engineering: { nominalDiameterMm: 100, thicknessMm: 3, gasketType: 'SPIRAL_WOUND' },
  },
  {
    id: 'INST-2', model: '2', geometry: '20', family: 'INSTRUMENT',
    verticesMm: [[100, 0, 0], [150, 0, 0]],
    engineering: {
      nominalDiameterMm: 40, faceToFaceMm: 50,
      instrumentType: 'FLOW_METER', tag: 'FIT-1001',
    },
  },
];

const mapping = {
  schema: 'FbxStagedMapping.v2',
  inScopeSourceObjectIds: specs.map((item) => item.model),
  entries: specs.map(mappedEntry),
  exclusions: [],
};
const graph = {
  schema: 'FbxSourceGraph.v2',
  sourceObjects: specs.flatMap((item) => [
    { sourceObjectId: item.model, ufbxElementType: 'NODE' },
    { sourceObjectId: item.geometry, ufbxElementType: 'MESH' },
  ]),
  occurrences: specs.map((item) => ({
    sourceOccurrenceId: `occ:${item.model}`, sourceModelObjectId: item.model,
    geometryObjectIds: [item.geometry], inheritMode: 0, geometryMatrixMm: identity,
  })),
  geometries: specs.map((item) => ({
    geometryObjectId: item.geometry, kind: 'MESH', verticesMm: item.verticesMm,
    ownerOccurrenceIds: [`occ:${item.model}`],
  })),
};

const execution = executeMapping(mapping, graph, graph);
assert.equal(execution.v2, true);
assert.equal(execution.accepted.entries.length, 2);
assert.equal(execution.links.length, 0);
const children = execution.staged.flatMap((branch) => branch.children);
assert.deepEqual(children.map((child) => child.type).sort(), ['GASK', 'INST']);
assert.equal(children.find((child) => child.type === 'GASK')
  .attributes.mappingEngineering.thicknessMm, 3);
assert.equal(children.find((child) => child.type === 'INST')
  .attributes.mappingEngineering.tag, 'FIT-1001');
assert.deepEqual(successCounts(execution).promotedByFamily, {
  PIPE: 0, ELBOW: 0, TEE: 0, REDUCER: 0, BRANCH_FITTING: 0,
  FLANGE: 0, GASKET: 1, VALVE: 0, INSTRUMENT: 1,
});
console.log('PASS test-inline-assembly-mapping');
