import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const files = Object.fromEntries(await Promise.all([
  'tabs/xml-cii-2019-standalone-tab.js',
  'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-workflow-shell.js',
  'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-phase-panels-smart.js',
  'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-events-smart.js',
  'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-regex-smart-ui.js',
  'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-rigid-smart-fill-ui.js',
  'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-smart-icons.js',
  'tabs/xml-cii-2019-standalone/xml-cii-regex-smart-suggestions.js',
  'tabs/xml-cii-2019-standalone/xml-cii-rigid-smart-fill.js',
].map(async (path) => [path, await read(path)])));

assert.match(files['tabs/xml-cii-2019-standalone-tab.js'], /20260802-smart-ui-v1/);
assert.match(files['tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-workflow-shell.js'], /xml-cii-adapted-phase-panels-smart\.js/);
assert.match(files['tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-workflow-shell.js'], /xml-cii-adapted-events-smart\.js/);
assert.match(files['tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-phase-panels-smart.js'], /enhanceRegexSmartWorkbench/);
assert.match(files['tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-events-smart.js'], /installRigidSmartFillDashboard/);
assert.match(files['tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-regex-smart-ui.js'], /Apply safe suggestions/);
assert.match(files['tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-regex-smart-ui.js'], /Preview only/);
assert.match(files['tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-rigid-smart-fill-ui.js'], /Fill safe weight suggestions/);
assert.match(files['tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-rigid-smart-fill-ui.js'], /groupRatingPlan/);
assert.match(files['tabs/xml-cii-2019-standalone/xml-cii-regex-smart-suggestions.js'], /regex-suggestion-preflight\/v1/);
assert.match(files['tabs/xml-cii-2019-standalone/xml-cii-rigid-smart-fill.js'], /rigid-weight-smart-fill-preflight\/v1/);

for (const [path, source] of Object.entries(files)) {
  const lines = source.split(/\r?\n/).length;
  if (/smart-(?:ui|fill|suggestions|icons)|smart\.js/.test(path)) {
    assert.ok(lines <= 300, `${path} exceeds the 300-line production guard (${lines}).`);
  }
}

console.log('xml-cii smart UI integration checks passed');
