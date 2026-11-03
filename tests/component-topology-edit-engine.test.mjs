/** Real command replay tests for editable canonical topology. */

import assert from 'node:assert/strict';
import { stampArtifactHash } from '../tabs/model-converters/converters/component-topology/topology-deterministic-hash.js';
import {
  appendTopologyEditCommand,
  appendTopologyEditTransaction,
  createTopologyEditDraft,
  materializeTopologyEditDraft,
  redoTopologyEditCommand,
  undoTopologyEditCommand,
} from '../tabs/model-converters/converters/component-topology/topology-edit-engine.js';

const position = (x, y, z) => ({ x, y, z });
const node = (id, inputXmlNodeId, value) => ({
  id,
  position: value,
  sourcePortIds: [`PORT-${id}`],
  sourceEntityIds: ['SRC-PIPE', 'BRANCH-1'],
  sourcePaths: ['$[0].children[0]'],
  branchIds: ['BRANCH-1'],
  inputXmlNodeIds: [inputXmlNodeId],
  positionAuthority: '$[0].children[0]',
  connectionAuthority: ['$[0].children[0]'],
  connectionResidual: 0,
});
const edge = (id, inputXmlElementId, fromNodeId, toNodeId) => ({
  id,
  fromNodeId,
  toNodeId,
  sourceEntityIds: ['SRC-PIPE', 'BRANCH-1'],
  sourcePortIds: [`PORT-${fromNodeId}`, `PORT-${toNodeId}`],
  sourcePaths: ['$[0].children[0]'],
  branchIds: ['BRANCH-1'],
  sourceTypes: ['PIPE', 'BRANCH'],
  inputXmlElementIds: [inputXmlElementId],
  segmentRole: 'PIPE',
  topologyOperation: 'PIPE',
  connectionAuthority: 'SOURCE_COMPONENT_GEOMETRY',
  connectionResidual: 0,
  projectionCardinality: 'ONE_TO_ONE',
  projectionMergeAuthority: '',
  mergeSourceEntityIds: [],
});

function fixture() {
  return stampArtifactHash({
    schema: 'CanonicalTopology.v1',
    sourceIdentity: { sourceName: 'edit-engine-fixture.json' },
    coordinateFrame: { schema: 'ManagedStage.XYZ.v1', unit: 'mm', axisFabrication: false },
    toleranceMm: 0.1,
    nodes: [
      node('CN-1', '10010', position(0, 0, 0)),
      node('CN-2', '10020', position(100, 0, 0)),
      node('CN-3', '10030', position(200, 0, 0)),
      node('CN-4', '10040', position(100, 100, 0)),
      node('CN-5', '10050', position(200, 100, 0)),
      node('CN-6', '10060', position(300, 0, 0)),
    ],
    edges: [
      edge('CE-1', 'PE-1', 'CN-1', 'CN-2'),
      edge('CE-2', 'PE-2', 'CN-2', 'CN-3'),
      edge('CE-3', 'PE-3', 'CN-2', 'CN-4'),
      edge('CE-4', 'PE-4', 'CN-4', 'CN-5'),
      edge('CE-5', 'PE-5', 'CN-3', 'CN-6'),
    ],
    pointFeatures: [],
    junctions: [{
      id: 'CJ-1', kind: 'TEE', nodeId: 'CN-2', position: position(100, 0, 0), expectedDegree: 3,
      participatingEdgeIds: ['CE-1', 'CE-2', 'CE-3'], sourceEntityIds: ['SRC-TEE'], sourcePaths: ['$[0].children[1]'], branchIds: ['BRANCH-1'],
    }],
    boundaries: [],
    supports: [{
      id: 'SA-1', nodeId: 'CN-3', inputXmlNodeId: '10030', position: position(200, 0, 0),
      sourcePosition: position(200, 10, 0), attachmentPosition: position(200, 0, 0),
      attachmentAuthority: 'FIXTURE', attachmentReferences: [], attachedComponentEntityIds: ['SRC-PIPE'],
      attachmentEdgeSourcePath: '$[0].children[0]', tag: 'PS-1', sourceEntityIds: ['SRC-SUPPORT'],
      sourcePaths: ['$[0].children[2]'], branchIds: ['BRANCH-1'], restraints: [{ type: '+Y' }], connectionResidual: 10,
    }],
    rigids: [{
      edgeId: 'CE-1', inputXmlElementId: 'PE-1', inputXmlNodeId: '10020', sourceEntityId: 'SRC-RIGID',
      sourceEntityIds: ['SRC-RIGID'], sourcePath: '$[0].children[3]', sourcePaths: ['$[0].children[3]'],
      branchIds: ['BRANCH-1'], componentType: 'VALV', weightKg: 10, connectionResidual: 0,
    }],
    buildIssues: [],
  }, 'canonicalTopologyHash');
}

const settings = Object.freeze({ projection: 'XY', snapToleranceMm: 0.1, showOriginal: true });
const base = fixture();

{
  const empty = createTopologyEditDraft(base, settings);
  const noOp = materializeTopologyEditDraft(base, empty);
  assert.equal(noOp.canonicalTopology.canonicalTopologyHash, base.canonicalTopologyHash);
  assert.equal(noOp.validation.ok, true);
  assert.equal(noOp.editLedger.summary.commandCount, 0);
}

{
  const empty = createTopologyEditDraft(base, settings);
  const movedDraft = appendTopologyEditCommand(empty, 'MOVE_NODE', { nodeId: 'CN-2', position: position(100, 25, 0) });
  const moved = materializeTopologyEditDraft(base, movedDraft);
  assert.deepEqual(moved.canonicalTopology.nodes.find((row) => row.id === 'CN-2').position, position(100, 25, 0));
  assert.notEqual(moved.canonicalTopology.canonicalTopologyHash, base.canonicalTopologyHash);
  const undone = materializeTopologyEditDraft(base, undoTopologyEditCommand(movedDraft));
  assert.equal(undone.canonicalTopology.canonicalTopologyHash, base.canonicalTopologyHash);
  const redone = materializeTopologyEditDraft(base, redoTopologyEditCommand(undoTopologyEditCommand(movedDraft)));
  assert.equal(redone.canonicalTopology.canonicalTopologyHash, moved.canonicalTopology.canonicalTopologyHash);
}

{
  const draft = appendTopologyEditCommand(createTopologyEditDraft(base, settings), 'MERGE_NODES', {
    sourceNodeId: 'CN-5', targetNodeId: 'CN-6',
  });
  const result = materializeTopologyEditDraft(base, draft);
  assert.equal(result.canonicalTopology.nodes.some((row) => row.id === 'CN-5'), false);
  assert.equal(result.canonicalTopology.edges.find((row) => row.id === 'CE-4').toNodeId, 'CN-6');
  assert.equal(result.validation.ok, true);
}

{
  const draft = appendTopologyEditCommand(createTopologyEditDraft(base, settings), 'BRIDGE_GAP', {
    fromNodeId: 'CN-1', toNodeId: 'CN-4', contextEdgeId: 'CE-1',
  });
  const result = materializeTopologyEditDraft(base, draft);
  const created = result.canonicalTopology.edges.find((row) => row.id.startsWith('EDIT-CE-'));
  assert(created);
  assert.equal(created.engineeringAuthorityEdgeId, 'CE-1');
  assert.equal(result.validation.ok, true);
}

{
  const draft = appendTopologyEditCommand(createTopologyEditDraft(base, settings), 'ADD_STRAIGHT_ELEMENT', {
    fromNodeId: 'CN-6', toPosition: position(400, 0, 0), contextEdgeId: 'CE-5',
  });
  const result = materializeTopologyEditDraft(base, draft);
  assert.equal(result.canonicalTopology.nodes.length, base.nodes.length + 1);
  assert.equal(result.canonicalTopology.edges.length, base.edges.length + 1);
  assert.equal(new Set(result.canonicalTopology.nodes.flatMap((row) => row.inputXmlNodeIds)).size, result.canonicalTopology.nodes.length);
  assert.equal(result.validation.ok, true);
}

{
  const draft = appendTopologyEditCommand(createTopologyEditDraft(base, settings), 'SPLIT_EDGE', {
    edgeId: 'CE-1', fraction: 0.25,
  });
  const result = materializeTopologyEditDraft(base, draft);
  const original = result.canonicalTopology.edges.find((row) => row.id === 'CE-1');
  const second = result.canonicalTopology.edges.find((row) => row.id.startsWith('EDIT-CE-'));
  const splitNode = result.canonicalTopology.nodes.find((row) => row.id === original.toNodeId);
  assert.deepEqual(splitNode.position, position(25, 0, 0));
  assert.equal(second.fromNodeId, splitNode.id);
  assert.equal(second.toNodeId, 'CN-2');
  assert.equal(result.canonicalTopology.rigids[0].edgeId, second.id);
  assert.equal(result.validation.ok, true);
}

{
  const draft = appendTopologyEditCommand(createTopologyEditDraft(base, settings), 'DISCONNECT_ENDPOINT', {
    edgeId: 'CE-2', endpoint: 'FROM',
  });
  const result = materializeTopologyEditDraft(base, draft);
  assert.notEqual(result.canonicalTopology.edges.find((row) => row.id === 'CE-2').fromNodeId, 'CN-2');
  assert.equal(result.canonicalTopology.nodes.length, base.nodes.length + 1);
  assert.equal(result.validation.ok, true);
}

{
  const draft = appendTopologyEditCommand(createTopologyEditDraft(base, settings), 'DELETE_EDGE', { edgeId: 'CE-2' });
  const result = materializeTopologyEditDraft(base, draft);
  assert.equal(result.canonicalTopology.edges.some((row) => row.id === 'CE-2'), false);
  assert.equal(result.canonicalTopology.supports.length, base.supports.length);
  assert.equal(result.validation.ok, true);
}

{
  const draft = appendTopologyEditCommand(createTopologyEditDraft(base, settings), 'DELETE_EDGE', { edgeId: 'CE-1' });
  assert.throws(() => materializeTopologyEditDraft(base, draft), (error) => error.code === 'EDGE_HAS_RIGIDS');
}

{
  const empty = createTopologyEditDraft(base, settings);
  const draft = appendTopologyEditTransaction(empty, [
    { type: 'ADD_BEND_DEFINITION', payload: { nodeId: 'CN-4', edgeIds: ['CE-3', 'CE-4'], radiusMm: 75, angleDeg: 90, radiusAuthority: 'CATALOG' } },
    { type: 'TRIM_EDGE', payload: { edgeId: 'CE-5', endpoint: 'TO', position: position(250, 0, 0) } },
  ], { source: 'TEST_APPROVED_FIXES' });
  const result = materializeTopologyEditDraft(base, draft);
  assert.equal(result.editLedger.summary.commandCount, 1);
  assert.equal(result.canonicalTopology.bends.length, 1);
  assert.deepEqual(result.canonicalTopology.nodes.find((row) => row.id === 'CN-6').position, position(250, 0, 0));
  const undone = materializeTopologyEditDraft(base, undoTopologyEditCommand(draft));
  assert.equal(undone.canonicalTopology.canonicalTopologyHash, base.canonicalTopologyHash);
}

{
  const withoutJunction = structuredClone(base);
  delete withoutJunction.canonicalTopologyHash;
  withoutJunction.junctions = [];
  const authority = stampArtifactHash(withoutJunction, 'canonicalTopologyHash');
  const draft = appendTopologyEditCommand(createTopologyEditDraft(authority, settings), 'ADD_JUNCTION_DEFINITION', {
    nodeId: 'CN-2', edgeIds: ['CE-1', 'CE-2', 'CE-3'], kind: 'TEE', inferenceAuthority: 'AUTHORITATIVE_DIAMETER',
  });
  const result = materializeTopologyEditDraft(authority, draft);
  assert.equal(result.canonicalTopology.junctions[0].kind, 'TEE');
  assert.equal(result.canonicalTopology.junctions[0].expectedDegree, 3);
}

console.log('component topology edit engine passed: topology surgery, engineering definitions, transactions, and exact undo/redo hashes verified.');
