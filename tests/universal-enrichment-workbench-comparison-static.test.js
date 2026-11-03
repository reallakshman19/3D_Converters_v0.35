import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../tabs/universal-enrichment-workbench/', import.meta.url);
const modules = [
  'comparison-identity.js','comparison-normalize.js','comparison-binding.js','comparison-index.js',
  'comparison-run.js','comparison-csv.js','comparison-template.js','comparison-renderer.js',
  'comparison-controller.js','workbench-controller.js',
];

test('UEW-006 remains isolated and exposes required contracts', async () => {
  const text = (await Promise.all(modules.map((name) => readFile(new URL(name, root), 'utf8')))).join('\n');
  for (const forbidden of ['xml-cii','model-converters','uxml/','localStorage','fuzzy','edit-distance','phonetic']) {
    assert.equal(text.toLowerCase().includes(forbidden), false, `forbidden reference: ${forbidden}`);
  }
  for (const name of [
    'normalizeMasterFieldBinding','createMasterFieldBindingId','createMasterFieldBindingConfig',
    'validateMasterFieldBindingConfig','serializeMasterFieldBindingConfig','createMasterAttachmentSetIdentity',
    'normalizeComparisonValue','buildMasterColumnIndex','compareFieldCandidate','createCandidateComparisonRun',
    'validateCandidateComparisonRun','serializeCandidateComparisonRun','summarizeCandidateComparisonRun',
    'buildCandidateComparisonCsv','buildCandidateMatchCsv',
  ]) assert.ok(text.includes(`function ${name}`), `missing ${name}`);
});

test('comparison UI is wired with bounded paging and no application action', async () => {
  const template = await readFile(new URL('comparison-template.js', root), 'utf8');
  const controller = await readFile(new URL('comparison-controller.js', root), 'utf8');
  const workbench = await readFile(new URL('workbench-controller.js', root), 'utf8');
  for (const id of ['comparison-add-binding','comparison-build-config','comparison-run','comparison-view','comparison-match-more']) {
    assert.ok(template.includes(`uew-${id}`), `missing UI id ${id}`);
  }
  assert.ok(controller.includes('COMPARISON_MATCH_STEP'));
  assert.ok(workbench.includes('getComparisonState'));
  assert.equal(template.includes('Apply'), false);
});
