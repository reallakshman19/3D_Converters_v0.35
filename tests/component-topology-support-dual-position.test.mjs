import assert from 'node:assert/strict';
import { buildComponentTopologyArtifacts } from '../tabs/model-converters/converters/component-topology/topology-artifact-exporter.js';
import {
  SUPPORT_PROJECTION_TOLERANCE_MM,
  TOPOLOGY_TOLERANCE_MM,
} from '../tabs/model-converters/converters/component-topology/topology-values.js';

const point = (x, y = 0, z = 0) => ({ x, y, z });
const options = (sourceName) => ({
  sourceName,
  jobName: sourceName,
  toleranceMm: TOPOLOGY_TOLERANCE_MM,
  supportProjectionToleranceMm: SUPPORT_PROJECTION_TOLERANCE_MM,
  enrichmentConfig: {},
});

function sourceFixture(currentPosition, sourcePosition, configuration = {}) {
  const carrierEnd = configuration.carrierEnd ?? point(1000);
  const children = [{
    name: 'PIPE =PIPE/1', type: 'PIPE',
    attributes: {
      TYPE: 'PIPE', NAME: '=PIPE/1', REF: '=PIPE/1', OWNER: '/DUAL-POSITION/B1',
      APOS: point(0), LPOS: carrierEnd, ABORE: '100mm', LBORE: '100mm', DTXR: 'PIPE',
    },
  }];
  if (configuration.adjacentGasket) {
    children.push({
      name: 'GASK =GASK/1', type: 'GASK',
      attributes: {
        TYPE: 'GASK', NAME: '=GASK/1', REF: '=GASK/1', OWNER: '/DUAL-POSITION/B1',
        APOS: carrierEnd, POS: carrierEnd, LPOS: point(505), ABORE: '100mm', LBORE: '100mm', DTXR: 'GASK',
      },
    });
  }
  children.push({
    name: 'SUPPORT =SUPPORT/1', type: 'SUPPORT',
    attributes: {
      TYPE: 'ATTA', NAME: '=SUPPORT/1', REF: '=SUPPORT/1', OWNER: '/DUAL-POSITION/B1',
      SUPPORT_TAG: 'PS-DUAL', SUPPORT_KIND: 'REST', CMPSUPTYPE: 'REST',
      APOS: currentPosition, POS: currentPosition, LPOS: currentPosition,
      TOPOLOGY_SOURCE_POSITION: sourcePosition,
      TOPOLOGY_ATTACHMENT_EDGE_SOURCE_PATH: configuration.carrierPath ?? '$[0].children[0]',
    },
  });
  return JSON.stringify([{
    name: '/DUAL-POSITION/B1',
    type: 'BRANCH',
    attributes: {
      NAME: '/DUAL-POSITION/B1', OWNER: '/DUAL-POSITION',
      HPOS: point(0), TPOS: point(1000), HBOR: '100mm', TBOR: '100mm',
    },
    children,
  }]);
}

const artifacts = await buildComponentTopologyArtifacts(
  sourceFixture(point(495), point(500)),
  options('support-dual-position.json'),
);
assert.equal(artifacts.canonicalTopology.supports.length, 1);
const support = artifacts.canonicalTopology.supports[0];
assert.deepEqual(support.position, point(495), 'edited support node position must remain authoritative');
assert.deepEqual(support.sourcePosition, point(500), 'immutable source-position evidence must survive intake');
assert.deepEqual(support.attachmentPosition, point(500), 'carrier attachment must be projected from immutable source evidence');
assert.equal(support.connectionResidual, 0);
assert.equal(support.attachmentEdgeSourcePath, '$[0].children[0]');
assert.notDeepEqual(support.position, support.attachmentPosition, 'edited topology and source-derived attachment are distinct authorities');
assert.equal(artifacts.canonicalTopology.edges.length, 2, 'carrier must split at the edited support-node position');
const supportNode = artifacts.canonicalTopology.nodes.find((node) => node.id === support.nodeId);
assert.deepEqual(supportNode?.position, point(495));

const junction = await buildComponentTopologyArtifacts(
  sourceFixture(point(495), point(500), { carrierEnd: point(495), adjacentGasket: true }),
  options('support-dual-position-junction.json'),
);
const junctionSupport = junction.canonicalTopology.supports[0];
assert.deepEqual(junctionSupport.position, point(495));
assert.deepEqual(junctionSupport.sourcePosition, point(500));
assert.deepEqual(junctionSupport.attachmentPosition, point(495), 'source evidence must project to the retained authoritative carrier endpoint');
assert.equal(junctionSupport.connectionResidual, 5);
assert.equal(junctionSupport.attachmentEdgeSourcePath, '$[0].children[0]', 'adjacent geometry must not steal carrier authority');

await assert.rejects(
  buildComponentTopologyArtifacts(
    sourceFixture(point(495, 0, 60), point(500)),
    options('support-dual-position-off-carrier.json'),
  ),
  /TOPOLOGY_EDITED_SUPPORT_POSITION_OFF_CARRIER/,
);

const missingCarrier = JSON.parse(sourceFixture(point(495), point(500)));
delete missingCarrier[0].children.at(-1).attributes.TOPOLOGY_ATTACHMENT_EDGE_SOURCE_PATH;
await assert.rejects(
  buildComponentTopologyArtifacts(JSON.stringify(missingCarrier), options('support-dual-position-missing-carrier.json')),
  /dual-position evidence requires both TOPOLOGY_SOURCE_POSITION and TOPOLOGY_ATTACHMENT_EDGE_SOURCE_PATH/,
);

await assert.rejects(
  buildComponentTopologyArtifacts(
    sourceFixture(point(495), point(500), { carrierPath: '$[0].children[99]' }),
    options('support-dual-position-carrier-not-found.json'),
  ),
  /TOPOLOGY_ATTACHMENT_EDGE_SOURCE_PATH_NOT_FOUND/,
);

const invalid = JSON.parse(sourceFixture(point(495), point(500)));
invalid[0].children.at(-1).attributes.TOPOLOGY_SOURCE_POSITION = { x: 'invalid', y: 0, z: 0 };
await assert.rejects(
  buildComponentTopologyArtifacts(JSON.stringify(invalid), options('support-dual-position-invalid-evidence.json')),
  /invalid TOPOLOGY_SOURCE_POSITION evidence/,
);

console.log('component topology support dual-position and carrier-authority contracts passed.');
