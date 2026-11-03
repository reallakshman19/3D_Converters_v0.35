'use strict';

const assert = require('assert');
const {
  resolveStrictTopology,
  REQUEST_SCHEMA,
  RESULT_SCHEMA,
} = require('../scripts/inputxml_compiler/strict_root_topology.cjs');

function node(path, number, position, componentType = 'PIPE') {
  return {
    sourcePath: path,
    sequence: number,
    nodeNumber: number,
    nodeNumberLexical: String(number),
    position: position.map(String),
    fields: { ComponentType: componentType, ComponentRefNo: `C-${number}` },
    fieldPaths: { ComponentType: `${path}/ComponentType[1]` },
    restraints: [],
  };
}

function request(overrides = {}) {
  const branchPath = '/Root[1]/Branch[1]';
  const value = {
    schema: REQUEST_SCHEMA,
    profileId: 'xml-builder-root-branch-node',
    adapterId: 'xml-cii-node-to-canonical',
    sourceHashSha256: 'a'.repeat(64),
    sourceDocumentIdentity: {
      rootPath: '/Root[1]',
      profileId: 'xml-builder-root-branch-node',
      producer: '',
      sourceIdentity: '',
    },
    context: { version: '11.00', jobName: 'T', north: [0, 1, 0] },
    branches: [{
      sourcePath: branchPath,
      sequence: 1,
      lineIdentity: 'L1',
      fields: {},
      fieldPaths: {},
      nodes: [
        node(`${branchPath}/Node[1]`, 10, [0, 0, 0]),
        node(`${branchPath}/Node[2]`, 20, [1000, 0, 0]),
        node(`${branchPath}/Node[3]`, 30, [1000, 1000, 0]),
      ],
    }],
    sourceInventorySummary: {
      inventoryCount: 30,
      elementCount: 20,
      attributeCount: 10,
      duplicateInventoryIdentityCount: 0,
    },
    engineOptions: {
      adjacencyAuthority: 'DIRECT_NODE_CHILD_ORDER_REGISTERED_PRODUCER_V1',
      coordinateCoalescing: false,
      shortFillers: false,
      rayFillers: false,
      secondPassFillers: false,
      midspanSplits: false,
      syntheticNodes: false,
    },
  };
  return Object.assign(value, overrides);
}

(function testResolvedContractAndDeterminism() {
  const first = resolveStrictTopology(request());
  const second = resolveStrictTopology(request());
  assert.deepStrictEqual(first, second);
  assert.strictEqual(first.schema, RESULT_SCHEMA);
  assert.strictEqual(first.resolutionStatus, 'RESOLVED');
  assert.strictEqual(first.nodes.length, 3);
  assert.strictEqual(first.edges.length, 2);
  assert.strictEqual(first.elementMappings.length, 2);
  assert.strictEqual(first.topologyProof.syntheticTopologyCount, 0);
  for (const key of [
    'duplicateNodeDroppedCount',
    'fillerCount',
    'shortFillerCount',
    'rayFillerCount',
    'raySplitNodeCount',
    'syntheticNodeCount',
    'droppedRouteNodeCount',
  ]) assert.strictEqual(first.metrics[key], 0, key);
})();

(function testCoordinateCoalescingCannotBeEnabled() {
  const value = request();
  value.engineOptions.coordinateCoalescing = true;
  const result = resolveStrictTopology(value);
  assert.strictEqual(result.resolutionStatus, 'BLOCKED');
  assert.strictEqual(result.diagnostics[0].code, 'PROHIBITED_COORDINATE_COALESCING');
})();

(function testFillerOperationsCannotBeEnabled() {
  for (const key of ['shortFillers', 'rayFillers', 'secondPassFillers', 'midspanSplits', 'syntheticNodes']) {
    const value = request();
    value.engineOptions[key] = true;
    const result = resolveStrictTopology(value);
    assert.strictEqual(result.resolutionStatus, 'BLOCKED', key);
    assert.ok(['PROHIBITED_FILLER_TOPOLOGY', 'SYNTHETIC_NODE_PROHIBITED'].includes(result.diagnostics[0].code));
  }
})();

(function testDuplicateNodeNumberCannotOverwrite() {
  const value = request();
  value.branches[0].nodes[2].nodeNumber = 20;
  const result = resolveStrictTopology(value);
  assert.strictEqual(result.resolutionStatus, 'BLOCKED');
  assert.strictEqual(result.diagnostics[0].code, 'DUPLICATE_NODE_NUMBER');
})();

(function testEqualCoordinatesDoNotCoalesce() {
  const value = request();
  value.branches[0].nodes[1].position = ['0', '0', '0'];
  const result = resolveStrictTopology(value);
  assert.strictEqual(result.resolutionStatus, 'BLOCKED');
  assert.strictEqual(result.diagnostics[0].code, 'EDGE_ZERO_LENGTH');
  assert.strictEqual(result.metrics.duplicateNodeDroppedCount, 0);
})();

(function testProfileAndHashAreEchoedExactly() {
  const value = request({
    profileId: 'seljson-custom-root',
    adapterId: 'seljson-custom-model-to-canonical',
    sourceHashSha256: 'b'.repeat(64),
  });
  value.sourceDocumentIdentity.profileId = 'seljson-custom-root';
  const result = resolveStrictTopology(value);
  assert.strictEqual(result.resolutionStatus, 'RESOLVED');
  assert.strictEqual(result.profileId, value.profileId);
  assert.strictEqual(result.adapterId, value.adapterId);
  assert.strictEqual(result.sourceHashSha256, value.sourceHashSha256);
})();

console.log('strict Root topology engine tests passed');
