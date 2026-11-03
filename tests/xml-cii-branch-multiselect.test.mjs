import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildSelectedBranchScope,
  buildXmlCiiBranchGroups,
  extractXmlCiiBranchRecords,
  normalizeXmlCiiBranchSelection,
} from '../tabs/xml-cii-2019-standalone/xml-cii-branch-scope.js';
import {
  createXmlCiiBranchScopedStateRef,
  ensureXmlCiiBranchSelectionState,
  extendXmlCiiBranchScopeReadiness,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-branch-scope.js';
import { buildXmlCiiWorkflowJobFromUiState } from '../tabs/xml-cii-2019-standalone/xml-cii-workflow-ui-adapter.js';

const SOURCE = `<?xml version="1.0"?><CAESARII>
<Branch><Branchname>/ASIM-A/B1</Branchname><Node><NodeNumber>10</NodeNumber></Node></Branch>
<Branch><Branchname>/ASIM-A/B2</Branchname><Node><NodeNumber>20</NodeNumber></Node></Branch>
<Branch><Branchname>/ASIM-B/B1</Branchname><Node><NodeNumber>30</NodeNumber></Node></Branch>
<Branch><Branchname>/ASIM-B/B2</Branchname><Node><NodeNumber>40</NodeNumber></Node></Branch>
</CAESARII>`;

const STAGED = JSON.stringify([
  { type: 'BRANCH', name: '/ASIM-A', children: [{ type: 'REST', attributes: { NAME: '/A' } }] },
  { type: 'BRANCH', name: '/ASIM-B', children: [{ type: 'GUIDE', attributes: { NAME: '/B' } }] },
  { type: 'BRANCH', name: '/ASIM-C', children: [{ type: 'REST', attributes: { NAME: '/C' } }] },
]);

const ALL = ['/ASIM-A/B1', '/ASIM-A/B2', '/ASIM-B/B1', '/ASIM-B/B2'];

test('new source defaults to all branches selected and builds hierarchy', () => {
  const records = extractXmlCiiBranchRecords(SOURCE);
  assert.deepEqual(records.map((row) => row.branchName), ALL);
  const selection = normalizeXmlCiiBranchSelection(SOURCE, {});
  assert.deepEqual(selection.selectedBranchNames, ALL);
  assert.deepEqual(buildXmlCiiBranchGroups(ALL), [
    { groupName: '/ASIM-A', branchNames: ['/ASIM-A/B1', '/ASIM-A/B2'] },
    { groupName: '/ASIM-B', branchNames: ['/ASIM-B/B1', '/ASIM-B/B2'] },
  ]);
});

test('explicit selection filters source in original order and scopes staged branches', () => {
  const scope = buildSelectedBranchScope({
    sourceText: SOURCE,
    stagedJsonText: STAGED,
    selectedBranchNames: ['/ASIM-A/B2', '/ASIM-B/B1'],
    sourceKind: 'xml',
  });
  assert.equal(scope.ok, true);
  assert.equal(scope.mode, 'explicit-selection');
  assert.deepEqual(scope.selectedBranchNames, ['/ASIM-A/B2', '/ASIM-B/B1']);
  assert.doesNotMatch(scope.filteredSourceText, /\/ASIM-A\/B1/);
  assert.match(scope.filteredSourceText, /\/ASIM-A\/B2/);
  assert.match(scope.filteredSourceText, /\/ASIM-B\/B1/);
  assert.doesNotMatch(scope.filteredSourceText, /\/ASIM-B\/B2/);
  assert(scope.filteredSourceText.indexOf('/ASIM-A/B2') < scope.filteredSourceText.indexOf('/ASIM-B/B1'));
  assert.match(scope.filteredStagedJsonText, /\/ASIM-A/);
  assert.match(scope.filteredStagedJsonText, /\/ASIM-B/);
  assert.doesNotMatch(scope.filteredStagedJsonText, /\/ASIM-C/);
  assert.equal(scope.manifest.sourceBranchCount, 4);
  assert.equal(scope.manifest.selectedBranchCount, 2);
  assert.equal(scope.manifest.excludedBranchCount, 2);
});

test('empty selection blocks processing instead of falling back to full source', () => {
  const scope = buildSelectedBranchScope({
    sourceText: SOURCE,
    stagedJsonText: STAGED,
    selectedBranchNames: [],
    sourceKind: 'xml',
  });
  assert.equal(scope.blocked, true);
  assert.equal(scope.filteredSourceText, '');
  assert.equal(scope.filteredStagedJsonText, '');
  assert.equal(scope.diagnostics[0].level, 'error');
});

test('processing-state proxy preserves the original uploaded source', () => {
  const original = ensureXmlCiiBranchSelectionState({
    activePhaseId: 'preview',
    sourceKind: 'xml',
    sourceText: SOURCE,
    sourceFile: { name: 'model.xml' },
    stagedJsonText: STAGED,
    stagedJsonFile: { name: 'model.json' },
    branchSelection: {
      ...normalizeXmlCiiBranchSelection(SOURCE, {}),
      selectedBranchNames: ['/ASIM-B/B1'],
    },
  });
  const baseRef = { current: original };
  const scopedRef = createXmlCiiBranchScopedStateRef(baseRef);
  assert.equal(scopedRef.current.sourceFile, null);
  assert.match(scopedRef.current.sourceText, /\/ASIM-B\/B1/);
  assert.doesNotMatch(scopedRef.current.sourceText, /\/ASIM-A\/B1/);
  scopedRef.current = { ...scopedRef.current, result: { ok: true } };
  assert.equal(baseRef.current.sourceText, SOURCE);
  assert.equal(baseRef.current.sourceFile.name, 'model.xml');
  assert.equal(baseRef.current.result.ok, true);
});

test('workflow job uses only selected branches and records audit scope', async () => {
  const selection = normalizeXmlCiiBranchSelection(SOURCE, {});
  selection.selectedBranchNames = ['/ASIM-A/B2'];
  const job = await buildXmlCiiWorkflowJobFromUiState({
    sourceKind: 'xml',
    sourceText: SOURCE,
    sourceFile: null,
    sourceNameOverride: 'model.xml',
    stagedJsonText: STAGED,
    stagedJsonFile: null,
    branchSelection: selection,
    supportConfigJson: '{}',
    masterContext: null,
    options: {},
  });
  assert.equal(job.sourceName, 'model.xml');
  assert.match(job.sourceText, /\/ASIM-A\/B2/);
  assert.doesNotMatch(job.sourceText, /\/ASIM-A\/B1/);
  assert.equal(job.branchSelection.selectedBranchCount, 1);
  assert.equal(JSON.parse(job.supportConfigJson).branchSelection.selectedBranches[0], '/ASIM-A/B2');
});

test('run readiness includes a blocking branch row and manifest evidence', () => {
  const selection = normalizeXmlCiiBranchSelection(SOURCE, {});
  selection.selectedBranchNames = [];
  const state = { sourceKind: 'xml', sourceText: SOURCE, stagedJsonText: STAGED, branchSelection: selection };
  const report = extendXmlCiiBranchScopeReadiness({
    summary: { blockingCount: 0 }, checklistRows: [], artifactRows: [], manifest: {}, diagnostics: [], raw: {},
  }, state);
  const row = report.checklistRows.find((item) => item.id === 'branch-selection');
  assert.equal(row.blocking, true);
  assert.equal(report.manifest.branchSelection.selectedBranchCount, 0);
  assert.equal(report.summary.blockingCount, 1);
});

test('activation chain and Source UI expose branch multiselect controls', async () => {
  const tab = await readFile(new URL('../tabs/xml-cii-2019-standalone-tab.js', import.meta.url), 'utf8');
  const shell = await readFile(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-workflow-shell-branch-scope-core.js', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-branch-scope.js', import.meta.url), 'utf8');
  assert.match(tab, /workflow-shell-branch-scope\.js\?v=20260804-branch-scope-v1/);
  assert.match(shell, /createXmlCiiBranchScopedStateRef/);
  assert.match(shell, /Branches: \$\{scope\.selectedBranchNames\.length\}/);
  assert.match(ui, /Branches to Process/);
  assert.match(ui, /Select all/);
  assert.match(ui, /Clear all/);
  assert.match(ui, /Select visible/);
  assert.match(ui, /Invert selection/);
  assert.match(ui, /Review selection/);
});