import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('canvas presentation failure is contained without changing engineering authority', () => {
  const workspace = readFileSync(new URL('../tabs/vibration-aiv-qualification-tab.js', import.meta.url), 'utf8');
  assert.match(workspace, /try \{ canvasController\.sync\(\); \} catch \(error\) \{ showCanvasError\(error\); \}/u);
  assert.match(workspace, /Canvas unavailable:/u);
  assert.match(workspace, /Engineering tables and screening controls remain authoritative and usable/u);
  assert.match(workspace, /banner\.dataset\.aivCanvasError = 'true'/u);
});

test('AIV workspace loader uses the cache-distinct PF-01 module token', () => {
  const consoleTab = readFileSync(new URL('../tabs/engineering-calculations-tab.js', import.meta.url), 'utf8');
  assert.match(consoleTab, /vibration-aiv-qualification-tab\.js\?v=aiv-qualification-2/u);
  assert.doesNotMatch(consoleTab, /vibration-aiv-qualification-tab\.js\?v=aiv-qualification-1/u);
});
