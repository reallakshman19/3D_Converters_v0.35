import assert from 'node:assert/strict';
import { pointSegmentDistance } from '../tabs/model-converters/converters/component-topology/topology-geometry-distance.js';
import { stampArtifactHash } from '../tabs/model-converters/converters/component-topology/topology-deterministic-hash.js';
import {
  appendTopologyEditCommand,
  createTopologyEditDraft,
  materializeTopologyEditDraft,
  undoTopologyEditCommand,
} from '../tabs/model-converters/converters/component-topology/topology-edit-engine.js';

const point = (x, y = 0, z = 0) => ({ x, y, z });
const carrierPath = '$[0].children[0]';
const sourcePosition = point(199.979, 10, 0);
const initialAttachment = point(199.979, 0, 0);

const base = stampArtifactHash({
  schema: 'CanonicalTopology.v1',
  sourceIdentity: { sourceName: 'support-reprojection-fixture.json' },
  coordinateFrame: { schema: 'ManagedStage.XYZ.v1', unit: 'mm', axisFabrication: false },
  toleranceMm: 0.1,
  nodes: [
    {
      id: 'CN-1', position: point(0), sourcePortIds: ['PORT-1'], sourceEntityIds: ['SRC-PIPE'],
      sourcePaths: [carrierPath], branchIds: ['BRANCH-1'], inputXmlNodeIds: ['10010'],
      positionAuthority: carrierPath, connectionAuthority: [carrierPath], connectionResidual: 0,
    },
    {
      id: 'CN-2', position: point(200), sourcePortIds: ['PORT-2'], sourceEntityIds: ['SRC-PIPE', 'SRC-SUPPORT'],
      sourcePaths: [carrierPath, '$[0].children[1]'], branchIds: ['BRANCH-1'], inputXmlNodeIds: ['10020'],
      positionAuthority: carrierPath, connectionAuthority: [carrierPath], connectionResidual: 0.021,
    },
  ],
  edges: [{
    id: 'CE-1', fromNodeId: 'CN-1', toNodeId: 'CN-2', sourceEntityIds: ['SRC-PIPE', 'BRANCH-1'],
    sourcePortIds: ['PORT-1', 'PORT-2'], sourcePaths: [carrierPath], branchIds: ['BRANCH-1'],
    sourceTypes: ['PIPE', 'BRANCH'], inputXmlElementIds: ['PE-1'], segmentRole: 'PIPE_SUPPORT_SPLIT',
    topologyOperation: 'PIPE_SUPPORT_SPLIT', connectionAuthority: 'SOURCE_COMPONENT_GEOMETRY',
    connectionResidual: 0, projectionCardinality: 'ONE_TO_ONE', projectionMergeAuthority: '', mergeSourceEntityIds: [],
  }],
  pointFeatures: [], junctions: [], boundaries: [], rigids: [], bends: [],
  supports: [{
    id: 'SA-1', nodeId: 'CN-2', inputXmlNodeId: '10020', position: point(200),
    sourcePosition, attachmentPosition: initialAttachment,
    attachmentAuthority: 'OWNING_BRANCH_PROXIMITY', attachmentReferences: [],
    attachedComponentEntityIds: ['SRC-PIPE'], attachmentEdgeSourcePath: carrierPath,
    tag: 'PS-OFFSET', sourceEntityIds: ['SRC-SUPPORT'], sourcePaths: ['$[0].children[1]'],
    branchIds: ['BRANCH-1'], restraints: [{ type: '+Y' }], connectionResidual: 10,
  }],
  buildIssues: [],
}, 'canonicalTopologyHash');

const settings = Object.freeze({ projection: 'XY', snapToleranceMm: 0.1, showOriginal: true });
const movedPosition = point(200, 20, 0);
const draft = appendTopologyEditCommand(createTopologyEditDraft(base, settings), 'MOVE_NODE', {
  nodeId: 'CN-2', position: movedPosition,
});
const result = materializeTopologyEditDraft(base, draft);
const support = result.canonicalTopology.supports[0];
const expected = pointSegmentDistance(sourcePosition, point(0), movedPosition);

assert.deepEqual(result.canonicalTopology.nodes.find((row) => row.id === 'CN-2').position, movedPosition);
assert.deepEqual(support.position, movedPosition, 'support canonical position follows its attachment node');
assert.deepEqual(support.sourcePosition, sourcePosition, 'support source position remains immutable evidence');
assert.deepEqual(support.attachmentPosition, expected.projected, 'support attachment is reprojected to the edited carrier');
assert.equal(support.connectionResidual, expected.distanceMm);
assert.notDeepEqual(support.attachmentPosition, support.position, 'offset projected attachment must not be collapsed onto the node');
assert.equal(support.attachmentEdgeSourcePath, carrierPath);
assert.equal(support.inputXmlNodeId, '10020');

const undone = materializeTopologyEditDraft(base, undoTopologyEditCommand(draft));
assert.equal(undone.canonicalTopology.canonicalTopologyHash, base.canonicalTopologyHash);

console.log('component topology edit support reprojection passed: immutable source evidence, authoritative carrier projection, and exact undo verified.');
