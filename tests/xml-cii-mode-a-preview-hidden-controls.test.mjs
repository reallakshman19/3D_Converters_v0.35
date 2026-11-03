import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('native individual Preview engineering controls remain present after restoration', () => {
  const renderer = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer.js');
  const rendererV7 = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer-v7.js');
  const b313 = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js');

  assert.match(renderer, /Use staged source from JSON Trace/u);
  assert.match(renderer, /Rebuild Preview/u);
  assert.match(renderer, /Update Wall thickness based on DTXR/u);
  assert.match(rendererV7, /Fetch Rating as per DTXR/u);
  assert.match(b313, /Update wall thickness as per B31\.3 Sec II/u);
});
