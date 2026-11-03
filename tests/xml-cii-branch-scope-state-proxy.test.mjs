import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeXmlCiiBranchSelection } from '../tabs/xml-cii-2019-standalone/xml-cii-branch-scope.js';
import {
  createXmlCiiBranchScopedStateRef,
  ensureXmlCiiBranchSelectionState,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-branch-scope-state.js';

const SOURCE_A = '<CAESARII><Branch><Branchname>/A/B1</Branchname></Branch><Branch><Branchname>/A/B2</Branchname></Branch></CAESARII>';
const SOURCE_B = '<CAESARII><Branch><Branchname>/B/B1</Branchname></Branch></CAESARII>';

test('processing proxy retains original source and selection digest', () => {
  const selection = normalizeXmlCiiBranchSelection(SOURCE_A, {});
  selection.selectedBranchNames = ['/A/B2'];
  const baseRef = { current: ensureXmlCiiBranchSelectionState({
    activePhaseId: 'preview', sourceKind: 'xml', sourceText: SOURCE_A,
    sourceFile: { name: 'a.xml' }, stagedJsonText: '', stagedJsonFile: null,
    branchSelection: selection,
  }) };
  const proxy = createXmlCiiBranchScopedStateRef(baseRef);
  const scoped = proxy.current;
  assert.match(scoped.sourceText, /\/A\/B2/);
  assert.doesNotMatch(scoped.sourceText, /\/A\/B1/);
  assert.equal(scoped.branchSelection.sourceDigest, selection.sourceDigest);
  proxy.current = { ...scoped, result: { ok: true } };
  assert.equal(baseRef.current.sourceText, SOURCE_A);
  assert.equal(baseRef.current.branchScope, null);
  assert.equal(baseRef.current.branchSelection.sourceDigest, selection.sourceDigest);
});

test('returning to Source clears derived scope but preserves original XML', () => {
  const selection = normalizeXmlCiiBranchSelection(SOURCE_A, {});
  const baseRef = { current: {
    activePhaseId: 'run', sourceKind: 'xml', sourceText: SOURCE_A,
    sourceFile: { name: 'a.xml' }, stagedJsonText: '', stagedJsonFile: null,
    branchSelection: selection,
  } };
  const proxy = createXmlCiiBranchScopedStateRef(baseRef);
  proxy.current = { ...proxy.current, activePhaseId: 'source', activeSubTabId: 'loader' };
  assert.equal(baseRef.current.activePhaseId, 'source');
  assert.equal(baseRef.current.sourceText, SOURCE_A);
  assert.equal(baseRef.current.branchScope, null);
});

test('loading a new source through a processing-phase file input resets selection', () => {
  const oldSelection = normalizeXmlCiiBranchSelection(SOURCE_A, {});
  oldSelection.selectedBranchNames = ['/A/B2'];
  const baseRef = { current: {
    activePhaseId: 'json-trace', sourceKind: 'xml', sourceText: SOURCE_A,
    sourceFile: { name: 'a.xml' }, stagedJsonText: '', stagedJsonFile: null,
    branchSelection: oldSelection,
  } };
  const proxy = createXmlCiiBranchScopedStateRef(baseRef);
  const newFile = { name: 'b.xml' };
  proxy.current = {
    ...proxy.current,
    sourceText: SOURCE_B,
    sourceFile: newFile,
    result: null,
  };
  assert.equal(baseRef.current.sourceText, SOURCE_B);
  assert.equal(baseRef.current.sourceFile, newFile);
  assert.deepEqual(baseRef.current.branchSelection.selectedBranchNames, ['/B/B1']);
  assert.notEqual(baseRef.current.branchSelection.sourceDigest, oldSelection.sourceDigest);
});