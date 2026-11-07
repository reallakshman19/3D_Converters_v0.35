import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installSimpleXmlDom, _test } from './helpers/simple-xml-dom.mjs';
import {
  allRigidReviewCounts,
  annotateRigidReferenceGroups,
  collectAllSourceRigidWeightRows,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-all-rigid-weight-inventory.js';

// The lightweight XML fixture does not expose browser DOM nodeType/childNodes.
// Supply only those DOM interfaces that the production collector actually reads.
Object.defineProperty(_test.SimpleElement.prototype, 'nodeType', { get() { return 1; } });
Object.defineProperty(_test.SimpleElement.prototype, 'childNodes', { get() { return this.children; } });
installSimpleXmlDom();

const node = (fields) => '<Node>' + Object.entries(fields)
  .map(([key, value]) => '<' + key + '>' + value + '</' + key + '>').join('') + '</Node>';
const xml = '<Root><Branch><Branchname>/L1/B1</Branchname>' +
  node({ ComponentType: 'FLAN', ComponentRefNo: '=/28064', NodeNumber: '-1', Endpoint: '1', Position: '0 0 0', ElementLengthMm: '3', Weight: '10.2' }) +
  node({ ComponentType: 'RIGID', Rigid: '2', ComponentRefNo: '/28064', NodeNumber: '10020', Endpoint: '2', Position: '12.7 0 0', ElementLengthMm: '3', Weight: '0' }) +
  node({ ComponentType: 'PCOM', Rigid: '2', ComponentRefNo: '/28062', NodeNumber: '10021', Endpoint: '2', ElementLengthMm: '19.1', Weight: '0' }) +
  '</Branch><Branch><Branchname>/L2/B1</Branchname>' +
  node({ ComponentType: 'RIGID', ComponentRefNo: '/28064', NodeNumber: '10022', Endpoint: '2', Weight: '4.4' }) +
  '</Branch></Root>';
const config = { overrides: { rigidWeight: { '/L1/B1::10020': 9.7 } } };
const before = JSON.stringify(config);
const rows = collectAllSourceRigidWeightRows(xml, config);
assert.equal(JSON.stringify(config), before, 'inventory must never mutate approved weight overrides');
assert.equal(rows.length, 4, 'include short FLAN, RIGID, PCOM-with-Rigid=2 and other branches');
assert.deepEqual(rows.map((row) => row.sharedRefCount), [2, 2, 1, 1],
  'split/shared refs are scoped by branch, not combined across lines');
assert.deepEqual(rows.map((row) => row.originalWeight), [10.2, 0, 0, 4.4]);
assert.equal(rows[1].overrideWeight, 9.7);
assert.equal(rows[1].effectiveWeight, 9.7, 'saved override shown separately from XML source');
assert.equal(rows[0].lengthMm, 12.7, 'physical component span is shown when opposite endpoints establish it');
assert.equal(rows[1].lengthMm, 12.7);
assert.equal(rows[2].lengthMm, 19.1, 'short/missing endpoint has explicit length fallback');
assert.equal(rows[2].status, 'missing');
assert.deepEqual(allRigidReviewCounts(rows), { total: 4, assigned: 3, missing: 1, shared: 2 });
assert(!rows.some((row) => Object.hasOwn(row, 'summedWeight')),
  'no sum of duplicated physical component weights');

const grouped = annotateRigidReferenceGroups([
  { branchName: '/A', componentRefNo: '/1' },
  { branchName: '/A', componentRefNo: '=/1' },
  { branchName: '/B', componentRefNo: '/1' },
  { branchName: '/A', componentRefNo: '' },
]);
assert.deepEqual(grouped.map((row) => row.sharedRefCount), [2, 2, 1, 1]);

assert.throws(() => collectAllSourceRigidWeightRows('', config), /empty/, 'empty input must not be described as a clean inventory');
const wired = readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-events-smart.js', import.meta.url), 'utf8');
assert.match(wired, /openStandaloneAllRigidWeightInventory\(state, config\)/,
  'standalone Run must show the all-rigid source inventory');
assert.match(wired, /await runWorkflowFromUi\(stateRef, render\)/,
  'Continue must retain the original missing-weight review/run authority');
for (const path of [
  '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-run-workflow-mode-a-fast.js',
  '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-run-workflow-mode-a-consolidated-review-v2.js',
]) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  assert(!source.includes('openStandaloneAllRigidWeightInventory'),
    'Mode A keeps its own one-time consolidated gate without per-model popup');
}
console.log('xml-cii all-rigid inventory tests: PASS');
