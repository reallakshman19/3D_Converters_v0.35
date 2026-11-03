import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildSelectedBranchScope,
  normalizeXmlCiiBranchSelection,
} from '../tabs/xml-cii-2019-standalone/xml-cii-branch-scope.js';
import { createXmlCiiBranchScopedStateRef } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-branch-scope-state.js';

const SOURCE = '<CAESARII><Branch><Branchname>/LINE/B1</Branchname></Branch><Branch><Branchname>/LINE/B2</Branchname></Branch></CAESARII>';
const STAGED = JSON.stringify([
  { type: 'BRANCH', name: '/LINE', children: [{ type: 'REST' }] },
  { type: 'BRANCH', name: '/LINE/B01', children: [{ type: 'GUIDE' }] },
  { type: 'BRANCH', name: '/LINE/B2', children: [{ type: 'LINESTOP' }] },
  { type: 'BRANCH', name: '/OTHER/B1', children: [{ type: 'REST' }] },
]);

test('selected B1 retains root and canonical B01 staged branches but removes B2 sibling', () => {
  const scope = buildSelectedBranchScope({
    sourceText: SOURCE,
    stagedJsonText: STAGED,
    selectedBranchNames: ['/LINE/B1'],
    sourceKind: 'xml',
  });
  const staged = JSON.parse(scope.filteredStagedJsonText);
  assert.deepEqual(staged.map((row) => row.name), ['/LINE', '/LINE/B01']);
  assert.match(scope.filteredSourceText, /\/LINE\/B1/);
  assert.doesNotMatch(scope.filteredSourceText, /\/LINE\/B2/);
});

test('changing only staged JSON in a processing phase preserves full original XML', () => {
  const selection = normalizeXmlCiiBranchSelection(SOURCE, {});
  selection.selectedBranchNames = ['/LINE/B1'];
  const originalFile = { name: 'source.xml' };
  const baseRef = { current: {
    activePhaseId: 'json-trace', sourceKind: 'xml', sourceText: SOURCE,
    sourceFile: originalFile, stagedJsonText: STAGED, stagedJsonFile: { name: 'old.json' },
    branchSelection: selection,
  } };
  const proxy = createXmlCiiBranchScopedStateRef(baseRef);
  const nextStaged = JSON.stringify([{ type: 'BRANCH', name: '/LINE', children: [] }]);
  const nextFile = { name: 'new.json' };
  proxy.current = {
    ...proxy.current,
    stagedJsonText: nextStaged,
    stagedJsonFile: nextFile,
  };
  assert.equal(baseRef.current.sourceText, SOURCE);
  assert.equal(baseRef.current.sourceFile, originalFile);
  assert.equal(baseRef.current.stagedJsonText, nextStaged);
  assert.equal(baseRef.current.stagedJsonFile, nextFile);
  assert.deepEqual(baseRef.current.branchSelection.selectedBranchNames, ['/LINE/B1']);
});

test('focus-stable panel filters in place and computes currently visible selection', async () => {
  const source = await readFile(new URL(
    '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-branch-scope-panel-v2.js',
    import.meta.url,
  ), 'utf8');
  assert.match(source, /search\.addEventListener\('input'/);
  assert.match(source, /applySearch\(list, search\.value\)/);
  assert.match(source, /visibleBranches\(list\)/);
  assert.doesNotMatch(source, /search\.addEventListener\('input'[\s\S]{0,200}render\(\)/);
});