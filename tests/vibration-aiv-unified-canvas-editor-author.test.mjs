import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAivUnifiedNetworkAuthorChange,
  createAivUnifiedNetworkNodeAt,
  createAivUnifiedNetworkSegmentBetween,
  deleteAivUnifiedNetworkSelection,
} from '../tabs/vibration-aiv-unified-canvas-author.js';
import { createAivSmallFlareMockNetwork } from '../tabs/vibration-aiv-mock-flare-network.js';

function fakeEditor(values) {
  return {
    querySelector(selector) {
      return Object.hasOwn(values, selector) ? { value: values[selector] } : null;
    },
  };
}

function nodeDraft() {
  return fakeEditor({
    '[data-aiv-network-new-node-id]': 'J-NEW',
    '[data-aiv-network-new-node-kind]': 'JUNCTION',
    '[data-aiv-network-new-node-case]': '',
    '[data-aiv-network-new-node-line]': '8IN-FLARE-HEADER',
    '[data-aiv-network-new-node-tag]': 'J-NEW',
    '[data-aiv-network-new-source-device]': '',
    '[data-aiv-network-new-assessment-type]': '',
  });
}

function segmentDraft() {
  return fakeEditor({
    '[data-aiv-network-new-segment-id]': 'HEADER-EXTENSION',
    '[data-aiv-network-new-segment-length]': '5.5',
    '[data-aiv-network-new-segment-unit]': 'm',
    '[data-aiv-network-new-segment-line]': '8IN-FLARE-HEADER',
    '[data-aiv-network-new-segment-from]': '',
    '[data-aiv-network-new-segment-to]': '',
  });
}

test('PLACE_NODE commits the drafted graph node at the clicked presentation coordinate', () => {
  const base = createAivSmallFlareMockNetwork();
  const next = createAivUnifiedNetworkNodeAt(base, nodeDraft(), { x: 710, y: 410 });
  const node = next.nodes.find((item) => item.canonicalId === 'J-NEW');
  assert.ok(node);
  assert.equal(node.kind, 'JUNCTION');
  assert.deepEqual(node.presentation, { x: 710, y: 410 });
  assert.equal(next.segments.length, base.segments.length);
});

test('CONNECT_SEGMENT uses explicit engineering length and selected directed endpoints', () => {
  const withNode = createAivUnifiedNetworkNodeAt(
    createAivSmallFlareMockNetwork(), nodeDraft(), { x: 710, y: 410 },
  );
  const next = createAivUnifiedNetworkSegmentBetween(
    withNode, segmentDraft(), 'J-102', 'J-NEW',
  );
  const segment = next.segments.find((item) => item.segmentId === 'HEADER-EXTENSION');
  assert.ok(segment);
  assert.equal(segment.fromNodeId, 'J-102');
  assert.equal(segment.toNodeId, 'J-NEW');
  assert.deepEqual(segment.physicalLength, { value: 5.5, unit: 'm' });
});

test('engineering inspector change updates nested Source input without changing presentation', () => {
  const base = createAivSmallFlareMockNetwork();
  const sourceBefore = base.nodes.find((item) => item.canonicalId === 'RV-101');
  const result = applyAivUnifiedNetworkAuthorChange(base, null, {
    value: '8.25',
    dataset: {
      aivNetworkNodeId: 'RV-101',
      aivNetworkNodePath: 'sourceInput.massFlow.value',
      aivValueType: 'number',
    },
  });
  const sourceAfter = result.network.nodes.find((item) => item.canonicalId === 'RV-101');
  assert.equal(result.handled, true);
  assert.equal(sourceAfter.sourceInput.massFlow.value, 8.25);
  assert.deepEqual(sourceAfter.presentation, sourceBefore.presentation);
});

test('physical-segment inspector can change endpoints while retaining explicit length authority', () => {
  const base = createAivSmallFlareMockNetwork();
  const result = applyAivUnifiedNetworkAuthorChange(base, null, {
    value: 'AIV-ASSESS-HDR-001',
    dataset: {
      aivNetworkSegmentId: 'SUBHEADER-4IN',
      aivNetworkSegmentField: 'toNodeId',
    },
  });
  const segment = result.network.segments.find((item) => item.segmentId === 'SUBHEADER-4IN');
  assert.equal(result.handled, true);
  assert.equal(segment.toNodeId, 'AIV-ASSESS-HDR-001');
  assert.deepEqual(segment.physicalLength, { value: 12, unit: 'm' });
});

test('node deletion remains fail closed until connected physical segments are removed', () => {
  const withNode = createAivUnifiedNetworkNodeAt(
    createAivSmallFlareMockNetwork(), nodeDraft(), { x: 710, y: 410 },
  );
  const connected = createAivUnifiedNetworkSegmentBetween(
    withNode, segmentDraft(), 'J-102', 'J-NEW',
  );
  assert.throws(
    () => deleteAivUnifiedNetworkSelection(connected, 'NETWORK_NODE:J-NEW'),
    /while connected segments exist/u,
  );
  const withoutSegment = deleteAivUnifiedNetworkSelection(connected, 'SEGMENT:HEADER-EXTENSION');
  const withoutNode = deleteAivUnifiedNetworkSelection(withoutSegment, 'NETWORK_NODE:J-NEW');
  assert.equal(withoutNode.nodes.some((item) => item.canonicalId === 'J-NEW'), false);
});
