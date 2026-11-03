import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
function source(path) { return fs.readFileSync(new URL(path, ROOT), 'utf8'); }

test('AIV UI auto-loads the bundled pinned master snapshot and exposes visible provenance', () => {
  const view = source('tabs/vibration-aiv-master-db-view.js');
  const input = source('tabs/vibration-aiv-input-view.js');
  const tab = source('tabs/vibration-aiv-qualification-tab.js');
  const controller = source('tabs/vibration-aiv-master-db-controller.js');
  assert.doesNotMatch(view, /data-aiv-master-files/u);
  assert.match(view, /bundled with the product/u);
  assert.match(view, /End users do not load or maintain master CSVs/u);
  assert.match(view, /data-aiv-action="apply-master-data"/u);
  assert.match(view, /explicit project\/user values[\s\S]*\[M\][\s\S]*\[A\]/u);
  assert.match(input, /data-aiv-master-derived/u);
  assert.match(input, />\[M\]/u);
  assert.match(controller, /loadBundledAivMasterDatabase/u);
  assert.match(tab, /masterDbController\.loadBundled\(\)/u);
  assert.match(tab, /onDatasetLoaded:\s*\(\) => masterDbController\.apply\(\{ silent: true \}\)/u);
  assert.match(tab, /masterDbController\.prepareUserEdit/u);
});

test('AIV master resolver has no process-case or physical-distance population path', () => {
  const resolver = source('converters/vibration/aiv/aiv-master-db-resolver.js');
  for (const column of [
    'Mass Flow', 'Upstream Pressure', 'Downstream Pressure', 'Upstream Temperature',
    'Molecular Weight', 'Source State', 'Operating Case', 'Physical Distance',
    'Applicability Disposition', 'Simultaneous Source Group',
  ]) assert.doesNotMatch(resolver, new RegExp(`setBlank\\([^\\n]+['"]${column}['"]`, 'u'));
  assert.match(resolver, /processCaseValuesInvented:\s*false/u);
  assert.match(resolver, /generalTopologyDistanceInvented:\s*false/u);
  assert.match(resolver, /screeningAuthorityConferred:\s*false/u);
  assert.match(resolver, /designAuthority:\s*false/u);
});

test('new AIV master modules remain inside repository size policy', () => {
  for (const path of [
    'converters/vibration/aiv/aiv-master-db-reference.js',
    'converters/vibration/aiv/aiv-master-db.js',
    'converters/vibration/aiv/aiv-master-db-resolver.js',
    'converters/vibration/aiv/aiv-master-db-bundled.js',
    'tabs/vibration-aiv-master-db-controller.js',
    'tabs/vibration-aiv-master-db-view.js',
    'tabs/vibration-aiv-dataset-loader.js',
  ]) {
    const lineCount = source(path).split(/\r?\n/u).length;
    assert.ok(lineCount < 300, `${path} has ${lineCount} lines`);
  }
});
