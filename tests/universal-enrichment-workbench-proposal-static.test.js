import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = path.join(ROOT, 'tabs', 'universal-enrichment-workbench');
const FILES = [
  'proposal-authority.js','proposal-controller.js','proposal-csv.js','proposal-identity.js',
  'proposal-renderer.js','proposal-set.js','proposal-template.js','review-controller.js','workbench-controller.js',
];
const read = (name) => fs.readFileSync(path.join(MODULE, name), 'utf8');

function productionText() { return FILES.map((name) => read(name)).join('\n'); }

test('proposal modules remain isolated from protected systems and persistence', () => {
  const text = productionText();
  for (const forbidden of ['xml-cii','uxml/','model-converters','localStorage','SharedWorker','new Worker(','https://','http://']) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
});

test('proposal modules expose named exports only and no default export', () => {
  for (const name of FILES) assert.equal(/export\s+default\b/.test(read(name)), false, name);
  const exports = productionText();
  for (const expected of [
    'createEnrichmentProposalId','createEnrichmentExclusionId','createEnrichmentProposalGroupId',
    'createEnrichmentProposalSetId','createEnrichmentProposalSet','validateEnrichmentProposalSet',
    'serializeEnrichmentProposalSet','summarizeEnrichmentProposalSet','buildEnrichmentProposalCsv',
    'buildEnrichmentProposalGroupCsv','buildEnrichmentExclusionCsv',
  ]) assert.match(exports, new RegExp(`export\\s+(?:async\\s+)?function\\s+${expected}\\b`), expected);
});

test('proposal UI has complete controls and no application action', () => {
  const markup = read('proposal-template.js');
  for (const id of [
    'uew-proposal-build','uew-proposal-json-download','uew-proposal-csv-download',
    'uew-proposal-group-csv-download','uew-proposal-exclusion-csv-download','uew-proposal-view',
    'uew-proposal-entity-filter','uew-proposal-field-filter','uew-proposal-dataset-filter',
    'uew-proposal-status-filter','uew-proposal-search','uew-proposal-prev','uew-proposal-next',
    'uew-proposal-entry-more',
  ]) assert.ok(markup.includes(`id="${id}"`), id);
  for (const action of ['Apply','Finalize','Choose Winner','Write Back']) assert.equal(markup.includes(`>${action}<`), false, action);
});

test('changed JavaScript files satisfy module guard', () => {
  for (const name of FILES) {
    const lines = read(name).split(/\r?\n/).length - 1;
    assert.ok(lines < 300, `${name}: ${lines}`);
  }
});

test('proposal authority never consumes transient review drafts', () => {
  const authority = read('proposal-authority.js'); const controller = read('proposal-controller.js');
  assert.equal(/reviewDraft|\.drafts\b/.test(authority), false);
  assert.equal(/\.drafts\b/.test(controller), false);
  assert.match(controller, /reviewLedger/);
});

test('workbench propagates immutable review ledger lifecycle to proposal controller', () => {
  const workbench = read('workbench-controller.js'); const review = read('review-controller.js');
  assert.match(workbench, /reviewLedger:\s*review\.ledger/);
  assert.match(workbench, /onReviewChange/);
  assert.match(workbench, /context\.proposal\?\.syncUpstream/);
  assert.match(workbench, /getProposalState/);
  assert.match(workbench, /renderEnrichmentProposalMarkup/);
  assert.match(review, /onReviewChange\?\./);
});
