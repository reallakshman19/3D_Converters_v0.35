import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  aivCanvasLineLabelAnchor,
  aivCanvasPathLabelAnchor,
  renderAivCanvasControlIcon,
} from '../tabs/vibration-aiv-canvas-presentation.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const unifiedModules = [
  'tabs/vibration-aiv-unified-canvas-projection.js',
  'tabs/vibration-aiv-unified-canvas-view.js',
  'tabs/vibration-aiv-unified-canvas-controller.js',
  'tabs/vibration-aiv-unified-canvas-author.js',
  'tabs/vibration-aiv-unified-canvas-author-view.js',
  'tabs/vibration-aiv-unified-canvas-inspector.js',
  'tabs/vibration-aiv-unified-canvas-editor.js',
  'tabs/vibration-aiv-unified-canvas-editor-controller.js',
  'tabs/vibration-aiv-unified-canvas-editor-view.js',
  'tabs/vibration-aiv-unified-canvas-table-author.js',
  'tabs/vibration-aiv-unified-canvas-labels.js',
  'tabs/vibration-aiv-canvas-presentation.js',
];

test('production input workspace renders the unified view and no duplicate flare/canvas view', async () => {
  const input = await read('tabs/vibration-aiv-input-view.js');
  assert.equal(input.includes('renderAivUnifiedCanvasWorkspaceHtml'), true);
  assert.equal(input.includes('renderAivCanvasWorkspaceHtml'), false);
  assert.equal(input.includes('renderAivFlareNetworkAuthoringHtml'), false);
  assert.equal(input.includes('vibration-aiv-canvas-view.js'), false);
  assert.equal(input.includes('vibration-aiv-flare-network-view.js'), false);
});

test('qualification creates one unified controller and no legacy canvas/flare controller', async () => {
  const qualification = await read('tabs/vibration-aiv-qualification-tab.js');
  assert.equal(qualification.includes('createAivUnifiedCanvasController'), true);
  assert.equal(qualification.includes('createAivCanvasInteractionController'), false);
  assert.equal(qualification.includes('createAivFlareNetworkAuthoringController'), false);
  assert.equal(qualification.includes('vibration-aiv-canvas-controller.js'), false);
  assert.equal(qualification.includes('vibration-aiv-flare-network-controller.js'), false);
  assert.equal(qualification.includes('canvasController.destroy();'), true);
});

test('unified renderer owns one SVG while the visible editor and label controls add no second SVG', async () => {
  const [view, authorView, editorView, labels] = await Promise.all([
    read('tabs/vibration-aiv-unified-canvas-view.js'),
    read('tabs/vibration-aiv-unified-canvas-author-view.js'),
    read('tabs/vibration-aiv-unified-canvas-editor-view.js'),
    read('tabs/vibration-aiv-unified-canvas-labels.js'),
  ]);
  assert.equal((view.match(/<svg\b/gu) ?? []).length, 1);
  assert.equal((authorView.match(/<svg\b/gu) ?? []).length, 0);
  assert.equal((editorView.match(/<svg\b/gu) ?? []).length, 0);
  assert.equal((labels.match(/<svg\b/gu) ?? []).length, 0);
  assert.equal(view.includes('data-aiv-unified-canvas-svg="true"'), true);
  assert.equal(view.includes('data-aiv-canvas-segment'), true);
  assert.equal(view.includes('AIV Network Canvas Editor'), true);
});

test('visible editor exposes graph, table and engineering label controls on the one-canvas surface', async () => {
  const [authorView, editorView, controller, qualification, view] = await Promise.all([
    read('tabs/vibration-aiv-unified-canvas-author-view.js'),
    read('tabs/vibration-aiv-unified-canvas-editor-view.js'),
    read('tabs/vibration-aiv-unified-canvas-controller.js'),
    read('tabs/vibration-aiv-qualification-tab.js'),
    read('tabs/vibration-aiv-unified-canvas-view.js'),
  ]);
  assert.equal(authorView.includes('data-aiv-canvas-editor-tool="PLACE_NODE"'), true);
  assert.equal(authorView.includes('data-aiv-canvas-editor-tool="CONNECT_SEGMENT"'), true);
  assert.equal(authorView.includes('data-aiv-canvas-editor-action="delete-selected"'), true);
  assert.equal(authorView.includes('data-aiv-canvas-table-action="add-source"'), true);
  assert.equal(authorView.includes('data-aiv-canvas-table-action="add-assessment"'), true);
  assert.equal(editorView.includes('data-aiv-network-node-path'), true);
  assert.equal(editorView.includes('data-aiv-network-segment-field'), true);
  assert.equal(editorView.includes('data-aiv-table-cell'), true);
  assert.equal(controller.includes('createAivUnifiedCanvasEditorController'), true);
  assert.equal(controller.includes('setLabelModePresentation'), true);
  assert.equal(qualification.includes('addAivUnifiedCanvasTableRow'), true);
  assert.equal((view.match(/data-aiv-canvas-label-mode=/gu) ?? []).length > 0, true);
  for (const mode of ['NORMAL', 'PROCESS', 'GEOMETRY', 'RESULTS', 'COMPLETENESS']) assert.equal(view.includes(mode), true);
});

test('connector labels use stable segment-normal offsets and path-midpoint presentation anchors', async () => {
  const vertical = aivCanvasLineLabelAnchor({ x: 10, y: 0 }, { x: 10, y: 100 }, { offset: 16, side: 1 });
  const reversed = aivCanvasLineLabelAnchor({ x: 10, y: 100 }, { x: 10, y: 0 }, { offset: 16, side: 1 });
  assert.deepEqual(vertical, { x: -6, y: 50 });
  assert.deepEqual(reversed, vertical, 'endpoint order must not flip the visual label side');
  const diagonal = aivCanvasLineLabelAnchor({ x: 0, y: 0 }, { x: 100, y: 100 }, { offset: 18, side: 1 });
  const delta = { x: diagonal.x - 50, y: diagonal.y - 50 };
  assert.ok(Math.abs(delta.x * 100 + delta.y * 100) < 1e-9, 'label offset must be normal to the connector');
  assert.ok(Math.abs(Math.hypot(delta.x, delta.y) - 18) < 1e-9);
  const path = aivCanvasPathLabelAnchor([
    { from: { x: 0, y: 0 }, to: { x: 100, y: 0 } },
    { from: { x: 100, y: 0 }, to: { x: 100, y: 200 } },
  ], { offset: 20, side: -1 });
  assert.deepEqual(path, { x: 120, y: 50 });
  const [view, controller] = await Promise.all([
    read('tabs/vibration-aiv-unified-canvas-view.js'),
    read('tabs/vibration-aiv-unified-canvas-controller.js'),
  ]);
  assert.equal(view.includes('paint-order="stroke"'), true);
  assert.equal(controller.includes('aivCanvasPathLabelAnchor'), true);
  assert.equal(controller.includes('setLabelPosition(segment, from, to, -7)'), false);
  assert.equal(controller.includes('setLabelPosition(relation, from, to, -18)'), false);
});

test('canvas toolbar and label modes are visually icon-only with accessible names', async () => {
  const view = await read('tabs/vibration-aiv-unified-canvas-view.js');
  assert.equal(view.includes('data-aiv-canvas-icon-only="true"'), true);
  assert.equal(view.includes('aria-label="${esc(label)}"'), true);
  assert.equal(view.includes('title="${esc(label)}"'), true);
  for (const sourceCall of [
    "iconButton('Navigate'", "iconButton('Zoom +'", "iconButton('Zoom −'",
    "iconButton('Reset view'", "iconButton('Export canvas package'",
    "aria-label=\"Labels\"", "NORMAL: 'normal'", "PROCESS: 'process'",
    "GEOMETRY: 'geometry'", "RESULTS: 'results'", "COMPLETENESS: 'completeness'",
  ]) assert.equal(view.includes(sourceCall), true, `missing icon control source ${sourceCall}`);
  assert.equal(view.includes('>Navigate</button>'), false);
  assert.equal(view.includes('>Zoom +</button>'), false);
  assert.equal(view.includes('>Zoom −</button>'), false);
  assert.equal(view.includes('>Reset view</button>'), false);
  assert.equal(view.includes('>Export canvas package</button>'), false);
  assert.match(renderAivCanvasControlIcon('navigate'), /<svg/u);
});

test('unified controller keeps graph drag and label switching presentation-only', async () => {
  const controller = await read('tabs/vibration-aiv-unified-canvas-controller.js');
  assert.equal(controller.includes('moveAivFlareNetworkNodePresentation'), true);
  assert.equal(controller.includes('applyAivUnifiedNetworkAuthorAction'), true);
  assert.equal(controller.includes('applyAivUnifiedNetworkAuthorChange'), true);
  assert.equal(controller.includes('revealAivCanvasSelection'), true);
  assert.equal(controller.includes('activateAivCanvasDetailTab'), true);
  assert.equal(controller.includes('moveAivCanvasDetailTab'), true);
  assert.equal(controller.includes('focusAivCanvasField'), true);
  assert.equal(controller.includes('relationship.mode !== AIV_CANVAS_MODE.RELATIONSHIPS || isNetworkDriven(container)'), true);
  assert.equal(controller.includes('labelMode = setLabelModePresentation'), true);
  assert.equal(controller.includes('markAivEngineeringInputChanged'), false);
  assert.equal(controller.includes('createAivCanvasInteractionController'), false);
  assert.equal(controller.includes('createAivFlareNetworkAuthoringController'), false);
});

test('new unified production modules stay below 300 physical lines', async () => {
  for (const path of unifiedModules) {
    const source = await read(path);
    const lines = source.split(/\r?\n/u).length;
    assert(lines < 300, `${path} has ${lines} physical lines`);
  }
});

test('unified editor modules add no acoustic equation or pixel-distance authority', async () => {
  const sources = await Promise.all(unifiedModules.map(read));
  for (const source of sources) {
    assert.equal(source.includes('Math.log('), false);
    assert.equal(source.includes('Math.log10('), false);
    assert.equal(source.includes('svgPixelsAuthoritativeForDistance: true'), false);
    assert.equal(source.includes('physicalLength = dx'), false);
    assert.equal(source.includes('physicalLength = dy'), false);
  }
});
