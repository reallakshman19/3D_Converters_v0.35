import assert from 'node:assert/strict';
import test from 'node:test';

import { createAivFlareNetwork, moveAivFlareNetworkNodePresentation, resolveAivFlareNetworkPath } from '../converters/vibration/aiv/aiv-flare-network.js';
import {
  addAivFlareNetworkNode,
  addAivFlareNetworkSegment,
  deleteAivFlareNetworkNode,
  deleteAivFlareNetworkSegment,
  setAivFlareNetworkSegmentLength,
  updateAivFlareNetworkNode,
} from '../converters/vibration/aiv/aiv-flare-network-mutations.js';
import { generateAivInputTablesFromFlareNetwork } from '../converters/vibration/aiv/aiv-flare-network-table-generator.js';
import { createAivFlareNetworkAuthoringController } from '../tabs/vibration-aiv-flare-network-controller.js';
import { renderAivFlareNetworkAuthoringHtml } from '../tabs/vibration-aiv-flare-network-view.js';

function empty() {
  return createAivFlareNetwork({ networkId: 'DRAWN', revision: '1', nodes: [], segments: [] });
}

function draggableTarget(node, svg, editor) {
  return {
    closest(selector) {
      if (selector === '[data-aiv-network-node]') return node;
      if (selector === '[data-aiv-flare-network-svg]') return svg;
      if (selector === '[data-aiv-network-editor]') return editor;
      return null;
    },
  };
}

function editableTarget(editor, nodeId, field, value) {
  return {
    dataset: { aivNetworkNodeId: nodeId, aivNetworkNodeField: field },
    value,
    closest(selector) { return selector === '[data-aiv-network-editor]' ? editor : null; },
  };
}

function controllerHarness(graphInput) {
  const handlers = new Map();
  const editor = { querySelector: () => null };
  let graph = graphInput;
  const container = {
    addEventListener: (type, handler) => handlers.set(type, handler),
    removeEventListener: (type) => handlers.delete(type),
  };
  const controller = createAivFlareNetworkAuthoringController(container, {
    getNetwork: () => graph,
    onNetworkChange: (next) => { graph = next; },
  });
  return { handlers, editor, controller, graph: () => graph };
}

test('authoring mutations place nodes connect segment and generate relationship only after engineering length exists', () => {
  let graph = empty();
  graph = addAivFlareNetworkNode(graph, {
    canonicalId: 'SRC-1', kind: 'SOURCE', presentation: { x: 100, y: 100 },
    sourceInput: { caseId: 'CASE-1' },
  });
  graph = addAivFlareNetworkNode(graph, {
    canonicalId: 'A-1', kind: 'ASSESSMENT', presentation: { x: 500, y: 100 }, assessmentInput: {},
  });
  graph = addAivFlareNetworkSegment(graph, { segmentId: 'PIPE-1', fromNodeId: 'SRC-1', toNodeId: 'A-1' });

  let generated = generateAivInputTablesFromFlareNetwork(graph);
  assert.equal(generated.pathEvidence[0].status, 'UNRESOLVED_LENGTH');
  assert.equal(generated.tables.relationships.rows.length, 1);

  graph = setAivFlareNetworkSegmentLength(graph, 'PIPE-1', 12.4, 'm');
  generated = generateAivInputTablesFromFlareNetwork(graph);
  assert.equal(generated.pathEvidence[0].status, 'RESOLVED');
  assert.equal(generated.pathEvidence[0].physicalDistanceM, 12.4);
  const h = generated.tables.relationships.header;
  assert.equal(generated.tables.relationships.rows[0][h.indexOf('Physical Distance')], '12.4');
  assert.equal(generated.tables.relationships.rows[0][h.indexOf('Distance Source')], 'AIV_FLARE_NETWORK_PATH_SUM');
});

test('dragging presentation and editing node properties do not mutate segment engineering length', () => {
  let graph = createAivFlareNetwork({
    networkId: 'DRAWN', revision: '1',
    nodes: [
      { canonicalId: 'SRC-1', kind: 'SOURCE', presentation: { x: 10, y: 10 }, sourceInput: { caseId: 'CASE-1', sourceDeviceType: 'RELIEF_VALVE' } },
      { canonicalId: 'A-1', kind: 'ASSESSMENT', presentation: { x: 20, y: 20 }, assessmentInput: {} },
    ],
    segments: [{ segmentId: 'PIPE-1', fromNodeId: 'SRC-1', toNodeId: 'A-1', physicalLength: { value: 4.2, unit: 'm' } }],
  });
  graph = moveAivFlareNetworkNodePresentation(graph, 'A-1', 9000, -1200);
  graph = updateAivFlareNetworkNode(graph, 'SRC-1', { tag: 'PSV-101' });
  assert.equal(resolveAivFlareNetworkPath(graph, 'SRC-1', 'A-1').physicalDistanceM, 4.2);
  assert.equal(graph.nodes.find((item) => item.canonicalId === 'SRC-1').tag, 'PSV-101');
});

test('existing source engineering attributes are editable through graph mutation path', () => {
  const graph = createAivFlareNetwork({
    networkId: 'DRAWN', revision: '1',
    nodes: [
      { canonicalId: 'SRC-1', kind: 'SOURCE', tag: 'PSV-101', line: 'FL-1', sourceInput: { caseId: 'CASE-1', sourceDeviceType: 'RELIEF_VALVE' } },
      { canonicalId: 'A-1', kind: 'ASSESSMENT', assessmentInput: { assessmentType: 'WELDOLET' } },
    ],
    segments: [{ segmentId: 'PIPE-1', fromNodeId: 'SRC-1', toNodeId: 'A-1', physicalLength: { value: 4.2, unit: 'm' } }],
  });
  const harness = controllerHarness(graph);
  harness.handlers.get('change')({ target: editableTarget(harness.editor, 'SRC-1', 'sourceDeviceType', 'CONTROL_VALVE') });
  harness.handlers.get('change')({ target: editableTarget(harness.editor, 'SRC-1', 'caseId', 'CASE-2') });
  harness.handlers.get('change')({ target: editableTarget(harness.editor, 'SRC-1', 'tag', 'CV-101') });
  const source = harness.graph().nodes.find((item) => item.canonicalId === 'SRC-1');
  assert.equal(source.sourceInput.sourceDeviceType, 'CONTROL_VALVE');
  assert.equal(source.sourceInput.caseId, 'CASE-2');
  assert.equal(source.tag, 'CV-101');
  assert.equal(resolveAivFlareNetworkPath(harness.graph(), 'SRC-1', 'A-1').physicalDistanceM, 4.2);
  harness.controller.destroy();
});

test('existing node table renders correction controls for engineering attributes', () => {
  const graph = createAivFlareNetwork({
    networkId: 'DRAWN', revision: '1',
    nodes: [
      { canonicalId: 'SRC-1', kind: 'SOURCE', tag: 'PSV-101', line: 'FL-1', sourceInput: { caseId: 'CASE-1', sourceDeviceType: 'RELIEF_VALVE' } },
      { canonicalId: 'A-1', kind: 'ASSESSMENT', assessmentInput: { assessmentType: 'WELDOLET' } },
    ],
    segments: [],
  });
  const html = renderAivFlareNetworkAuthoringHtml({ flareNetwork: graph, flareNetworkActive: true, generatedInputSet: null });
  assert.match(html, /data-aiv-network-node-field="sourceDeviceType"/u);
  assert.match(html, /data-aiv-network-node-field="assessmentType"/u);
  assert.match(html, /data-aiv-network-node-field="caseId"/u);
  assert.match(html, /data-aiv-network-node-field="line"/u);
  assert.match(html, /data-aiv-network-node-field="tag"/u);
});

test('node drag commits presentation only and never invokes engineering network mutation callback', () => {
  const graph = createAivFlareNetwork({
    networkId: 'DRAWN', revision: '1',
    nodes: [
      { canonicalId: 'SRC-1', kind: 'SOURCE', presentation: { x: 10, y: 10 }, sourceInput: { caseId: 'CASE-1' } },
      { canonicalId: 'A-1', kind: 'ASSESSMENT', presentation: { x: 20, y: 20 }, assessmentInput: {} },
    ],
    segments: [{ segmentId: 'PIPE-1', fromNodeId: 'SRC-1', toNodeId: 'A-1', physicalLength: { value: 4.2, unit: 'm' } }],
  });
  const handlers = new Map();
  const editor = {};
  const node = {
    dataset: { aivNetworkNode: 'A-1', aivNetworkX: '20', aivNetworkY: '20' },
    setAttribute() {},
  };
  const svg = {
    viewBox: { baseVal: { width: 1000, height: 1000 } },
    getBoundingClientRect: () => ({ width: 1000, height: 1000 }),
    querySelectorAll: () => [],
    setPointerCapture() {},
    releasePointerCapture() {},
  };
  const target = draggableTarget(node, svg, editor);
  const container = {
    addEventListener: (type, handler) => handlers.set(type, handler),
    removeEventListener: (type) => handlers.delete(type),
  };
  let engineeringMutationCount = 0;
  let presentationGraph = null;
  const controller = createAivFlareNetworkAuthoringController(container, {
    getNetwork: () => graph,
    onNetworkChange: () => { engineeringMutationCount += 1; },
    onPresentationChange: (next) => { presentationGraph = next; },
  });

  handlers.get('pointerdown')({ target, pointerId: 7, clientX: 20, clientY: 20, preventDefault() {} });
  handlers.get('pointermove')({ target, pointerId: 7, clientX: 50, clientY: 60, preventDefault() {} });
  handlers.get('pointerup')({ target, pointerId: 7 });

  assert.equal(engineeringMutationCount, 0);
  assert.ok(presentationGraph);
  const moved = presentationGraph.nodes.find((item) => item.canonicalId === 'A-1');
  assert.deepEqual(moved.presentation, { x: 50, y: 60 });
  assert.equal(resolveAivFlareNetworkPath(presentationGraph, 'SRC-1', 'A-1').physicalDistanceM, 4.2);
  controller.destroy();
});

test('node deletion requires connected segments to be removed first', () => {
  let graph = createAivFlareNetwork({
    networkId: 'DRAWN', revision: '1',
    nodes: [
      { canonicalId: 'SRC-1', kind: 'SOURCE', sourceInput: { caseId: 'CASE-1' } },
      { canonicalId: 'A-1', kind: 'ASSESSMENT', assessmentInput: {} },
    ],
    segments: [{ segmentId: 'PIPE-1', fromNodeId: 'SRC-1', toNodeId: 'A-1', physicalLength: { value: 1, unit: 'm' } }],
  });
  assert.throws(() => deleteAivFlareNetworkNode(graph, 'A-1'), /connected segments/u);
  graph = deleteAivFlareNetworkSegment(graph, 'PIPE-1');
  graph = deleteAivFlareNetworkNode(graph, 'A-1');
  assert.equal(graph.nodes.some((item) => item.canonicalId === 'A-1'), false);
});
