import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createAivCanvasLayout } from '../converters/vibration/aiv/aiv-canvas-layout-contract.js';
import {
  AIV_CANVAS_ZOOM_MAX,
  AIV_CANVAS_ZOOM_MIN,
  panAivCanvasViewport,
  reconcileAivCanvasPresentationLayout,
  zoomAivCanvasViewport,
} from '../tabs/vibration-aiv-canvas-controller.js';
import { moveAivCanvasDetailTab } from '../tabs/vibration-aiv-canvas-detail.js';

function layout(nodes, viewport = { x: 0, y: 0, zoom: 1 }) {
  return createAivCanvasLayout({ nodes, viewport });
}

const NODE_A = Object.freeze({
  nodeKey: 'SOURCE:S-1:C-1', canonicalId: 'S-1', caseId: 'C-1', nodeKind: 'SOURCE',
  x: 120, y: 90, displayOrder: 0, collapsed: false,
});
const NODE_B = Object.freeze({
  nodeKey: 'ASSESSMENT:A-1', canonicalId: 'A-1', caseId: null, nodeKind: 'ASSESSMENT',
  x: 620, y: 90, displayOrder: 1, collapsed: false,
});

function detailFixture() {
  const panels = ['summary', 'inputs', 'calculation'].map((id, index) => ({ dataset: { aivDetailPanel: id }, hidden: index !== 0 }));
  const detail = { querySelectorAll: (selector) => selector === '[data-aiv-detail-tab]' ? tabs : panels };
  const tabs = ['summary', 'inputs', 'calculation'].map((id, index) => {
    const attrs = new Map([['aria-selected', index === 0 ? 'true' : 'false'], ['tabindex', index === 0 ? '0' : '-1']]);
    return {
      dataset: { aivDetailTab: id }, focused: false,
      closest: () => detail,
      setAttribute: (name, value) => attrs.set(name, value),
      getAttribute: (name) => attrs.get(name),
      focus() { this.focused = true; },
    };
  });
  return { tabs, panels };
}

test('pan and zoom helpers mutate viewport presentation state only and clamp zoom', () => {
  const start = Object.freeze({ x: 10, y: 20, zoom: 1 });
  assert.deepEqual(panAivCanvasViewport(start, 15, -5), { x: 25, y: 15, zoom: 1 });
  assert.deepEqual(start, { x: 10, y: 20, zoom: 1 });
  assert.equal(zoomAivCanvasViewport(start, 100).zoom, AIV_CANVAS_ZOOM_MAX);
  assert.equal(zoomAivCanvasViewport(start, 0.001).zoom, AIV_CANVAS_ZOOM_MIN);
});

test('presentation reconciliation retains moved positions, drops stale nodes and adds fresh nodes', () => {
  const persisted = layout([{ ...NODE_A, x: 333, y: 444 }], { x: 12, y: -8, zoom: 1.4 });
  const fresh = layout([NODE_A, NODE_B]);
  const reconciled = reconcileAivCanvasPresentationLayout(fresh, persisted);
  assert.deepEqual(reconciled.viewport, persisted.viewport);
  assert.deepEqual(
    reconciled.nodes.map(({ nodeKey, x, y }) => ({ nodeKey, x, y })),
    [
      { nodeKey: NODE_A.nodeKey, x: 333, y: 444 },
      { nodeKey: NODE_B.nodeKey, x: 620, y: 90 },
    ],
  );
  const withoutA = reconcileAivCanvasPresentationLayout(layout([NODE_B]), reconciled);
  assert.deepEqual(withoutA.nodes.map((node) => node.nodeKey), [NODE_B.nodeKey]);
});

test('selected-detail tabs support Arrow/Home/End keyboard navigation and roving tabindex', () => {
  const { tabs, panels } = detailFixture();
  assert.equal(moveAivCanvasDetailTab(tabs[0], 'ArrowRight'), true);
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
  assert.equal(tabs[1].getAttribute('tabindex'), '0');
  assert.equal(tabs[1].focused, true);
  assert.equal(panels[1].hidden, false);
  assert.equal(moveAivCanvasDetailTab(tabs[1], 'End'), true);
  assert.equal(tabs[2].getAttribute('aria-selected'), 'true');
  assert.equal(moveAivCanvasDetailTab(tabs[2], 'Home'), true);
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
  assert.equal(moveAivCanvasDetailTab(tabs[0], 'Escape'), false);
});

test('interaction runtime is an explicit presentation boundary with no engineering mutation or calculation path', () => {
  const source = readFileSync(new URL('../tabs/vibration-aiv-canvas-controller.js', import.meta.url), 'utf8');
  assert(source.split(/\r?\n/u).length < 300);
  assert.match(source, /createAivCanvasInteractionController/u);
  assert.match(source, /pointerdown/u);
  assert.match(source, /pointermove/u);
  assert.match(source, /wheel/u);
  assert.doesNotMatch(source, /updateAivInputCell|applyTableMutation|calculateEngineering|calculateAiv/u);
  assert.doesNotMatch(source, /physicalDistance|attenuationDb|pointPwlDb|combinedPointPwlDb|\blof\b/iu);
  assert.doesNotMatch(source, /Math\.(?:log10|log|tanh|pow)|\*\*/u);
});

test('qualification controller owns only the minimal canvas interaction lifecycle hook', () => {
  const source = readFileSync(new URL('../tabs/vibration-aiv-qualification-tab.js', import.meta.url), 'utf8');
  assert.match(source, /createAivCanvasInteractionController/u);
  assert.match(source, /canvasController\.sync\(\)/u);
  assert.match(source, /canvasController\.destroy\(\)/u);
  assert.doesNotMatch(source, /canvasLayout\s*:/u);
});

test('canvas view exposes bounded zoom controls, presentation scene and keyboard-selectable objects', () => {
  const source = readFileSync(new URL('../tabs/vibration-aiv-canvas-view.js', import.meta.url), 'utf8');
  assert.match(source, /data-aiv-canvas-action="zoom-in"/u);
  assert.match(source, /data-aiv-canvas-action="zoom-out"/u);
  assert.match(source, /data-aiv-canvas-action="reset-view"/u);
  assert.match(source, /data-aiv-canvas-scene/u);
  assert.match(source, /tabindex="0"/u);
  assert.match(source, /aria-selected="false"/u);
  assert.match(source, /data-aiv-canvas-source-node/u);
  assert.match(source, /data-aiv-canvas-assessment-node/u);
  assert.match(source, /data-aiv-canvas-selected-detail-host/u);
  assert.doesNotMatch(source, /min-width:720px/u);
});