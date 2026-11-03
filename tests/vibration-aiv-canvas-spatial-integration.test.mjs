import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const paths = [
  'tabs/vibration-aiv-unified-canvas-controller.js',
  'tabs/vibration-aiv-unified-canvas-view.js',
  'tabs/vibration-aiv-canvas-spatial-dom.js',
  'tabs/vibration-aiv-canvas-workspace.js',
  'tabs/vibration-aiv-canvas-label-layout.js',
];
async function source(path) { return readFile(new URL(`../${path}`, import.meta.url), 'utf8'); }

test('spatial modules remain presentation-only and under the AIV module-size policy', async () => {
  for (const path of paths) {
    const value = await source(path);
    assert.ok(value.split(/\r?\n/u).length < 300, `${path} must stay under 300 physical lines`);
    if (path.includes('workspace') || path.includes('label-layout') || path.includes('spatial-dom')) {
      assert.doesNotMatch(value, /markAivEngineeringInputChanged|physicalDistance|pathDistanceM|Math\.log10|acoustic/iu);
    }
  }
});

test('unified view exposes one SVG plus fit, tidy and workspace presentation controls', async () => {
  const value = await source('tabs/vibration-aiv-unified-canvas-view.js');
  assert.equal((value.match(/data-aiv-unified-canvas-svg/g) ?? []).length, 1);
  assert.match(value, /data-aiv-canvas-action="fit-network"/);
  assert.match(value, /data-aiv-canvas-action="auto-tidy"/);
  assert.match(value, /data-aiv-canvas-workspace-boundary/);
  assert.match(value, /data-aiv-canvas-semantic-level="DETAILED"/);
});

test('controller routes spatial actions through presentation-only helpers', async () => {
  const value = await source('tabs/vibration-aiv-unified-canvas-controller.js');
  assert.match(value, /vibration-aiv-canvas-spatial-dom\.js\?v=20260816-aiv-canvas-spatial-1/);
  assert.match(value, /aivCanvasClampLayoutPoint/);
  assert.match(value, /aivCanvasEventScenePoint/);
  assert.match(value, /aivCanvasFitForSvg/);
  assert.match(value, /aivCanvasTidyForDom/);
  assert.match(value, /applyAivCanvasSpatialPresentation/);
  assert.match(value, /moveAivFlareNetworkNodePresentation/);
  assert.doesNotMatch(value, /markAivEngineeringInputChanged/);
});

test('fresh cache identity is used for the changed presentation leaf graph', async () => {
  const controller = await source('tabs/vibration-aiv-unified-canvas-controller.js');
  const view = await source('tabs/vibration-aiv-unified-canvas-view.js');
  assert.match(controller, /vibration-aiv-canvas-presentation\.js\?v=20260816-aiv-canvas-spatial-1/);
  assert.match(view, /vibration-aiv-canvas-presentation\.js\?v=20260816-aiv-canvas-spatial-1/);
});
