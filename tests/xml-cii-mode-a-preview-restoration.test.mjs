import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('Smart Map Unmapped Lines exposes literal Select All without inventing Map To values', () => {
  const source = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-smart-map-select-all.js');
  assert.match(source, /Smart Map — Unmapped Lines/u);
  assert.match(source, /textContent = 'Select All'/u);
  assert.match(source, /data-smart-map-use/u);
  assert.match(source, /data-smart-map-value/u);
  assert.match(source, /withoutTarget/u);
  assert.match(source, /does not invent Map To values/u);
  assert.match(source, /rowIsVisible/u);
});

test('consolidated Mode A Preview restores both DTXR actions source-locally', () => {
  const source = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-consolidated-dtxr.js');
  assert.match(source, /Update Wall thickness based on DTXR/u);
  assert.match(source, /Fetch Rating as per DTXR/u);
  assert.match(source, /createModeASourceProcessingRef/u);
  assert.match(source, /modeAExecutionRows/u);
  assert.match(source, /__dtxrWallKeys/u);
  assert.match(source, /applyPreviewDtxrRatingOverrides/u);
  assert.match(source, /B31\.3 wall update remains source-specific/u);
});

test('individual Mode A Preview auto-build exposes native DTXR and B31.3 actions only after explicit expansion', () => {
  const source = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-individual-preview-tools.js');
  const renderer = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer.js');
  const rendererV7 = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer-v7.js');
  const b313 = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js');

  assert.match(source, /details\.open/u);
  assert.match(source, /Preview\\s\*\\\/\\s\*Review/u);
  assert.match(source, /\^Build Preview\$/u);
  assert.match(source, /MutationObserver/u);
  assert.match(renderer, /Update Wall thickness based on DTXR/u);
  assert.match(rendererV7, /Fetch Rating as per DTXR/u);
  assert.match(b313, /Update wall thickness as per B31\.3 Sec II/u);
});

test('Preview hook repairs mapped-line process authority before rebuilding', () => {
  const hook = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-consolidated-easy-ui-hook.js');
  assert.match(hook, /repairModeAExactMappedProcessAuthority/u);
  assert.match(hook, /installModeASmartMapSelectAll/u);
  assert.match(hook, /installModeAConsolidatedDtxrTools/u);
  assert.match(hook, /installModeAIndividualPreviewToolVisibility/u);
  assert.match(hook, /if \(repair\.changed\) scheduleRebuild\(build\)/u);
});
