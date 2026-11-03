import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../tabs/empirical-weight-tuning-tab.js', import.meta.url), 'utf8');

test('Empirical Weight Tuning exposes the Sandbox controls and all result paths', () => {
  assert.match(source, /\['sandbox', 'Sandbox'\]/);
  assert.match(source, /data-sandbox="target"/);
  assert.match(source, /data-sandbox="family"/);
  assert.match(source, /data-sandbox="rating"/);
  assert.match(source, /data-sandbox="ns"/);
  assert.match(source, /Exact master cell/);
  assert.match(source, /Approach 1 · size-band equation/);
  assert.match(source, /Approach 2 · matrix stack/);
  assert.match(source, /Final API estimate/);
  assert.match(source, /Collaborative ratio/);
  assert.match(source, /Cross-ratio matrix/);
});
