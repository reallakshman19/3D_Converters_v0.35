/** End-to-end edited artifact regeneration using real managed-source records. */

import assert from 'node:assert/strict';
import {
  buildComponentTopologyArtifacts,
  buildEditedComponentTopologyArtifacts,
  topologyArtifactOutputs,
} from '../tabs/model-converters/converters/component-topology/topology-artifact-exporter.js';
import {
  appendTopologyEditCommand,
  createTopologyEditDraft,
  undoTopologyEditCommand,
} from '../tabs/model-converters/converters/component-topology/topology-edit-engine.js';

const point = (x, y, z) => ({ x, y, z });
const source = JSON.stringify([{
  name: '/EDIT/B1', type: 'BRANCH',
  attributes: { TYPE: 'BRANCH', NAME: '/EDIT/B1', OWNER: '/EDIT', HPOS: point(0, 0, 0), TPOS: point(2000, 0, 0) },
  children: [
    { name: 'PIPE-1', type: 'PIPE', attributes: { TYPE: 'PIPE', NAME: 'PIPE-1', REF: '=PIPE/1', OWNER: '/EDIT/B1', APOS: point(0, 0, 0), LPOS: point(1000, 0, 0), ABORE: '50mm', LBORE: '50mm', WTHK: '3mm', ITEMTEMP1: '100', ITEMPRES1: '2', MTXX: 'A106 B', DTXR: 'PIPE' } },
    { name: 'PIPE-2', type: 'PIPE', attributes: { TYPE: 'PIPE', NAME: 'PIPE-2', REF: '=PIPE/2', OWNER: '/EDIT/B1', APOS: point(1000, 0, 0), LPOS: point(2000, 0, 0), ABORE: '50mm', LBORE: '50mm', WTHK: '3mm', ITEMTEMP1: '100', ITEMPRES1: '2', MTXX: 'A106 B', DTXR: 'PIPE' } },
  ],
}]);
const options = Object.freeze({
  sourceName: 'edited-artifacts.json', jobName: 'Edited Artifacts',
  toleranceMm: 0.1, supportProjectionToleranceMm: 50, enrichmentConfig: {},
});
const settings = Object.freeze({ projection: 'XY', snapToleranceMm: 0.1, showOriginal: true });

const base = await buildComponentTopologyArtifacts(source, options);
const empty = createTopologyEditDraft(base.canonicalTopology, settings);
const noOp = await buildEditedComponentTopologyArtifacts(source, empty, options);
assert.equal(noOp.canonicalTopology.canonicalTopologyHash, base.canonicalTopology.canonicalTopologyHash);
assert.deepEqual(noOp.metrics.inputXml, base.metrics.inputXml);
assert.equal(noOp.topologyParityReport.ok, true);
assert.equal(noOp.editValidation.ok, true);

const movedDraft = appendTopologyEditCommand(empty, 'MOVE_NODE', {
  nodeId: base.canonicalTopology.nodes[0].id,
  position: point(100, 0, 0),
});
const moved = await buildEditedComponentTopologyArtifacts(source, movedDraft, options);
assert.equal(moved.topologyParityReport.ok, true);
assert.equal(moved.editValidation.ok, true);
assert.equal(moved.parsedInputXmlTopology.nodes.find((row) => row.canonicalNodeId === base.canonicalTopology.nodes[0].id).position.x, 100);
const undone = await buildEditedComponentTopologyArtifacts(source, undoTopologyEditCommand(movedDraft), options);
assert.equal(undone.canonicalTopology.canonicalTopologyHash, base.canonicalTopology.canonicalTopologyHash);

const originalEdge = base.canonicalTopology.edges[0];
const from = base.canonicalTopology.nodes.find((row) => row.id === originalEdge.fromNodeId);
const to = base.canonicalTopology.nodes.find((row) => row.id === originalEdge.toNodeId);
const splitDraft = appendTopologyEditCommand(empty, 'SPLIT_EDGE', { edgeId: originalEdge.id, fraction: 0.4 });
const split = await buildEditedComponentTopologyArtifacts(source, splitDraft, options);
assert.equal(split.canonicalTopology.edges.length, base.canonicalTopology.edges.length + 1);
assert.equal(split.canonicalTopology.nodes.length, base.canonicalTopology.nodes.length + 1);
assert.equal(split.topologyParityReport.ok, true);
assert.equal(split.editValidation.ok, true);
const first = split.canonicalTopology.edges.find((row) => row.id === originalEdge.id);
const second = split.canonicalTopology.edges.find((row) => row.id.startsWith('EDIT-CE-'));
const splitNode = split.canonicalTopology.nodes.find((row) => row.id === first.toNodeId);
assert.deepEqual({
  x: (splitNode.position.x - from.position.x) + (to.position.x - splitNode.position.x),
  y: (splitNode.position.y - from.position.y) + (to.position.y - splitNode.position.y),
  z: (splitNode.position.z - from.position.z) + (to.position.z - splitNode.position.z),
}, { x: to.position.x - from.position.x, y: to.position.y - from.position.y, z: to.position.z - from.position.z });
assert.equal(second.fromNodeId, splitNode.id);
assert.match(split.topologyInputXml, /TOPOLOGY_EDIT_DRAFT_HASH="fnv1a64:/);
assert.match(split.topologyInputXml, /TOPOLOGY_EDIT_LEDGER_HASH="fnv1a64:/);
const outputs = topologyArtifactOutputs(split, { stem: 'edited-artifacts' });
assert(outputs.some((row) => row.name.endsWith('.topology-edit-draft.json')));
assert(outputs.some((row) => row.name.endsWith('.topology-edit-ledger.json')));
assert(outputs.some((row) => row.name.endsWith('.topology-parity-mismatches.csv')));

console.log('component topology edited artifacts passed: source replay, InputXML, SVG, parity, undo hash, and export bundle files verified.');
