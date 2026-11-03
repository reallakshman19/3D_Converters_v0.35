import assert from 'node:assert/strict';
import test from 'node:test';

import { setAivFlareNetworkSegmentLength } from '../converters/vibration/aiv/aiv-flare-network-mutations.js';
import { resolveAivFlareNetworkPath } from '../converters/vibration/aiv/aiv-flare-network.js';
import {
  aivUnifiedCanvasNextId,
  createAivUnifiedCanvasBlankNetwork,
  createAivUnifiedCanvasRvBranch,
  inspectAivUnifiedCanvasSourceCompleteness,
} from '../tabs/vibration-aiv-unified-canvas-workflow.js';
import { addAivFlareNetworkNode, addAivFlareNetworkSegment } from '../converters/vibration/aiv/aiv-flare-network-mutations.js';

function addNode(network, canonicalId, kind, x, y) {
  return addAivFlareNetworkNode(network, {
    canonicalId, kind, presentation: { x, y },
    ...(kind === 'ASSESSMENT' ? { assessmentInput: { assessmentType: 'WELDED_TEE' } } : {}),
  });
}
function addSegment(network, segmentId, fromNodeId, toNodeId, length) {
  return addAivFlareNetworkSegment(network, {
    segmentId, fromNodeId, toNodeId,
    physicalLength: { value: length, unit: 'm' },
  });
}

test('blank network starts with clean UI provenance instead of controlled mock provenance', () => {
  const network = createAivUnifiedCanvasBlankNetwork({ networkId: 'FLARE-A' });
  assert.equal(network.networkId, 'FLARE-A');
  assert.equal(network.source, 'AIV_FLARE_NETWORK_UI');
  assert.equal(network.sourceRevision, '1');
  assert.deepEqual(network.nodes, []);
  assert.deepEqual(network.segments, []);
});

test('suggested IDs advance without colliding with existing nodes or segments', () => {
  let network = createAivUnifiedCanvasBlankNetwork({ networkId: 'FLARE-A' });
  network = addNode(network, 'RV-001', 'JUNCTION', 10, 10);
  network = addSegment(addNode(network, 'J-001', 'JUNCTION', 20, 20), 'RV-002', 'RV-001', 'J-001', 1);
  assert.equal(aivUnifiedCanvasNextId(network, 'RV'), 'RV-003');
});

test('quick RV branch creates Source plus explicit physical segment in one graph commit', () => {
  let network = createAivUnifiedCanvasBlankNetwork({ networkId: 'FLARE-A' });
  network = addNode(network, 'J-SH-001', 'JUNCTION', 350, 200);
  const next = createAivUnifiedCanvasRvBranch(network, {
    canonicalId: 'RV-101', caseId: 'RELIEF-COMBINED', segmentId: 'RV101-BR',
    targetNodeId: 'J-SH-001', length: 9, unit: 'm', line: 'SH-B',
  });
  const source = next.nodes.find((item) => item.canonicalId === 'RV-101');
  const segment = next.segments.find((item) => item.segmentId === 'RV101-BR');
  assert.equal(source.kind, 'SOURCE');
  assert.equal(source.sourceInput.caseId, 'RELIEF-COMBINED');
  assert.equal(source.sourceInput.sourceDeviceType, 'RELIEF_VALVE');
  assert.deepEqual(segment.physicalLength, { value: 9, unit: 'm' });
  assert.equal(segment.toNodeId, 'J-SH-001');
});

test('late header-length correction and fourth RV produce the expected path without SVG distance inference', () => {
  let network = createAivUnifiedCanvasBlankNetwork({ networkId: 'FLARE-A' });
  network = addNode(network, 'J-SH-B', 'JUNCTION', 350, 350);
  network = addNode(network, 'J-MAIN', 'JUNCTION', 650, 270);
  network = addNode(network, 'WO-MAIN', 'ASSESSMENT', 850, 270);
  network = addSegment(network, 'SUBHEADER-B', 'J-SH-B', 'J-MAIN', 22);
  network = addSegment(network, 'MAIN-HDR', 'J-MAIN', 'WO-MAIN', 30);
  network = setAivFlareNetworkSegmentLength(network, 'SUBHEADER-B', 27, 'm');
  network = createAivUnifiedCanvasRvBranch(network, {
    canonicalId: 'RV-104', caseId: 'RELIEF-COMBINED', segmentId: 'RV104-BR',
    targetNodeId: 'J-SH-B', length: 9, unit: 'm', line: 'SH-B',
  });
  const path = resolveAivFlareNetworkPath(network, 'RV-104', 'WO-MAIN');
  assert.equal(path.status, 'RESOLVED');
  assert.equal(path.physicalDistanceM, 66);
  assert.deepEqual(path.segmentIds, ['RV104-BR', 'SUBHEADER-B', 'MAIN-HDR']);
});

test('new RV completeness guidance identifies missing authoring fields but does not claim readiness authority', () => {
  let network = createAivUnifiedCanvasBlankNetwork({ networkId: 'FLARE-A' });
  network = addNode(network, 'J-SH-B', 'JUNCTION', 350, 350);
  network = createAivUnifiedCanvasRvBranch(network, {
    canonicalId: 'RV-104', caseId: 'RELIEF-COMBINED', segmentId: 'RV104-BR',
    targetNodeId: 'J-SH-B', length: 9, unit: 'm', line: 'SH-B',
  });
  const report = inspectAivUnifiedCanvasSourceCompleteness(network.nodes.find((item) => item.canonicalId === 'RV-104'));
  assert.equal(report.complete, false);
  assert.ok(report.missing.includes('Mass flow value'));
  assert.ok(report.missing.includes('Upstream pressure value'));
  assert.ok(!report.missing.includes('Operating case'));
  assert.ok(!report.missing.includes('Device type'));
});
