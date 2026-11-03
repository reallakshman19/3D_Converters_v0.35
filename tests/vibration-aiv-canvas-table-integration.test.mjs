import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(path) { return readFile(new URL(`../${path}`, import.meta.url), 'utf8'); }

const governedModules = [
  'tabs/vibration-aiv-canvas-field.js',
  'tabs/vibration-aiv-canvas-field-controller.js',
  'tabs/vibration-aiv-canvas-field-link.js',
  'tabs/vibration-aiv-unified-canvas-editor-view.js',
  'tabs/vibration-aiv-unified-canvas-inspector.js',
  'tabs/vibration-aiv-unified-canvas-view.js',
  'tabs/vibration-aiv-unified-canvas-controller.js',
];

test('canvas/table integration modules stay compact and do not introduce acoustic or SVG-distance authority', async () => {
  for (const path of governedModules) {
    const value = await source(path);
    assert.ok(value.split(/\r?\n/u).length < 300, `${path} must remain under 300 physical lines`);
    if (/field|inspector|view/u.test(path)) {
      assert.doesNotMatch(value, /Math\.log10|acoustic equation|svgPixelsAuthoritativeForDistance\s*:\s*true/iu);
    }
  }
});

test('unified view keeps one SVG and exposes docked inspector plus exact field-link attributes', async () => {
  const value = await source('tabs/vibration-aiv-unified-canvas-view.js');
  assert.equal((value.match(/data-aiv-unified-canvas-svg/g) ?? []).length, 1);
  assert.match(value, /data-aiv-canvas-inspector-dock/);
  assert.match(value, /data-aiv-canvas-field-key/);
  assert.match(value, /data-aiv-canvas-field-keys/);
  assert.match(value, /vibration-aiv-canvas-field-link\.js\?v=20260816-aiv-canvas-fields-1/);
  assert.match(value, /data-aiv-last-committed-field/);
});

test('inspector exposes active engineering owner and explicit full-table navigation', async () => {
  const value = await source('tabs/vibration-aiv-unified-canvas-inspector.js');
  assert.match(value, /NETWORK OWNER · graph edit/);
  assert.match(value, /TABLE OWNER · working row/);
  assert.match(value, /data-aiv-canvas-open-table/);
  assert.match(value, /Open generated/);
  assert.match(value, /Open full/);
});

test('engineering editor emits exact table and graph-owned field identities', async () => {
  const value = await source('tabs/vibration-aiv-unified-canvas-editor-view.js');
  assert.match(value, /data-aiv-engineering-field-key/);
  assert.match(value, /data-aiv-field-key/);
  assert.match(value, /aivCanvasNetworkNodeFieldKey/);
  assert.match(value, /aivCanvasNetworkSegmentFieldKey/);
  assert.match(value, /aivCanvasFieldKey/);
});

test('field controller handles canvas-to-field, field-to-canvas, pending and committed feedback', async () => {
  const value = await source('tabs/vibration-aiv-canvas-field-controller.js');
  assert.match(value, /focusAivCanvasField/);
  assert.match(value, /applyAivCanvasFieldHighlight/);
  assert.match(value, /data-aiv-edit-pending/);
  assert.match(value, /onFieldCommit/);
  assert.match(value, /openAivWorkingTable/);
  assert.match(value, /flashAivCanvasField/);
});

test('unified controller delegates field lifecycle without changing engineering revision authority', async () => {
  const value = await source('tabs/vibration-aiv-unified-canvas-controller.js');
  assert.match(value, /createAivCanvasFieldController/);
  assert.match(value, /fieldController\.handleClick/);
  assert.match(value, /fieldController\.noteCommit/);
  assert.match(value, /fieldController\.sync/);
  assert.doesNotMatch(value, /markAivEngineeringInputChanged/);
});

test('qualification workspace carries committed field identity across authoritative rerender', async () => {
  const value = await source('tabs/vibration-aiv-qualification-tab.js');
  assert.match(value, /onFieldCommit:\s*\(fieldKey\)/);
  assert.match(value, /lastCommittedAivFieldKey/);
  assert.match(value, /vibration-aiv-unified-canvas-controller\.js\?v=20260816-aiv-canvas-fields-1/);
  assert.match(value, /vibration-aiv-unified-canvas-inspector\.js\?v=20260816-aiv-canvas-fields-1/);
});

test('canvas selection no longer scrolls a closed bulk-table disclosure', async () => {
  const value = await source('tabs/vibration-aiv-canvas-selection.js');
  assert.match(value, /working-data-tables/);
  assert.match(value, /!disclosure \|\| disclosure\.open/);
  assert.match(value, /origin === 'table'/);
});
