import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const tab = read('tabs/xml-cii-2019-standalone-tab.js');
const shell = read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-workflow-shell-mode-a-core.js');
const panel = read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-panel.js');
const branchPanel = read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-branch-scope-panel-v2.js');
const events = read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-events-mode-a.js');
const run = read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-run-workflow-mode-a.js');
const authority = read('tabs/xml-cii-2019-standalone/xml-cii-mode-a-batch.js');
const branchScope = read('tabs/xml-cii-2019-standalone/xml-cii-branch-scope.js');

assert.match(tab, /xml-cii-adapted-workflow-shell-mode-a\.js/);
assert.match(shell, /createXmlCiiModeAStateRef/);
assert.match(shell, /createXmlCiiBranchScopedStateRef/);
assert.match(panel, /input\.multiple = true/);
assert.match(panel, /Separate Models \(Mode A\)/);
assert.match(panel, /Repeated Branchname text is isolated by branch occurrence/);
assert.match(branchPanel, /selectedBranchOccurrenceIds/);
assert.match(branchPanel, /displayBranchName/);
assert.match(events, /Run Separate Models/);
assert.match(events, /stopImmediatePropagation/);
assert.match(run, /for \(let index = 0; index < enabled\.length; index \+= 1\)/);
assert.match(run, /sourceBlockingRows/);
assert.match(run, /globalBlockingRows/);
assert.match(run, /status: 'BLOCKED'/);
assert.match(run, /continue;/);
assert.match(run, /clearModeASourceCaches\(\)/);
assert.match(authority, /mode: 'separate-models'/);
assert.match(authority, /DUPLICATE_BRANCH_NAME_WITHIN_FILE/);
assert.match(authority, /DUPLICATE_BRANCH_ACROSS_FILES/);
assert.match(authority, /DUPLICATE_NODE_ACROSS_FILES/);
assert.match(branchScope, /branchOccurrenceId/);
assert.match(branchScope, /displayBranchName/);
assert.match(branchScope, /selectedBranchOccurrenceIds/);
assert.doesNotMatch(authority, /DUPLICATE_BRANCH_WITHIN_FILE/);
assert.doesNotMatch(authority, /effectiveNodeNumber/);
assert.doesNotMatch(authority, /nodeNumberOffset/);
assert.doesNotMatch(authority, /crossFileConnection/);
assert.doesNotMatch(authority, /mergedSourceText/);

console.log('xml-cii Mode A activation tests: PASS');
