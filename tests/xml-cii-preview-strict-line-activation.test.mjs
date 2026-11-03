import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (path) => readFile(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

test('standalone tab activates the strict-line workflow shell', async () => {
  const tab = await read('tabs/xml-cii-2019-standalone-tab.js');
  const shell = await read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-workflow-shell-strict-line.js');
  assert.match(tab, /workflow-shell-strict-line\.js\?v=20260804-strict-line-authority-v2/);
  assert.match(shell, /phase-panels-smart\.js\?v=20260804-strict-line-authority-v2/);
  assert.match(shell, /events-smart\.js\?v=20260803-atta-default-rest-closure-1/);
});

test('Preview UI removes Auto-Suggest and states exact authority', async () => {
  const panels = await read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-phase-panels-smart.js');
  assert.match(panels, /\.bulk-autosuggest-btn/);
  assert.match(panels, /button\?\.remove/);
  assert.match(panels, /Automatic similar line-number matching is disabled/);
  assert.match(panels, /explicit branch mapping or an exact loaded Line List key/);
});

test('strict Preview authority rejects both former fuzzy methods', async () => {
  const dryrun = await read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun.js');
  assert.match(dryrun, /similar-lineseq/);
  assert.match(dryrun, /similar-linekey/);
  assert.match(dryrun, /isAutomaticLineNumberMatchMethod/);
  assert.match(dryrun, /masterRows:\s*\[\]/);
  assert.match(dryrun, /automaticLineMatchRemoved:\s*true/);
});
