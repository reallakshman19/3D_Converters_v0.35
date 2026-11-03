import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = path.join(ROOT, 'tabs', 'universal-enrichment-workbench');
const NEW_FILES = [
  'review-authority.js','review-controller.js','review-csv.js','review-draft.js','review-identity.js',
  'review-ledger.js','review-renderer.js','review-template.js',
];
const EDITED_FILES = [...NEW_FILES, 'comparison-controller.js', 'workbench-controller.js'];
const read = (name) => fs.readFileSync(path.join(MODULE, name), 'utf8');

test('review modules stay below 300 lines and use named exports only', () => {
  for (const name of EDITED_FILES) {
    const source = read(name); const lineCount = source.split(/\r?\n/).length - 1;
    assert.ok(lineCount < 300, `${name} has ${lineCount} lines`);
    assert.doesNotMatch(source, /export\s+default\b/, `${name} has a default export`);
  }
  const combined = NEW_FILES.map(read).join('\n');
  for (const symbol of [
    'normalizeComparisonReviewDraft','createComparisonReviewDecisionId','createComparisonReviewLedgerId',
    'createComparisonReviewLedger','validateComparisonReviewLedger','serializeComparisonReviewLedger',
    'summarizeComparisonReviewLedger','buildComparisonReviewCsv',
  ]) assert.match(combined, new RegExp(`export\\s+(?:async\\s+)?function\\s+${symbol}\\b`), `missing ${symbol}`);
});

test('review production is isolated from protected systems and prohibited behaviors', () => {
  const source = NEW_FILES.map(read).join('\n');
  for (const forbidden of [
    /xml-cii/i,/uxml\//i,/model-converters/i,/localStorage/i,/shared\/preview-filldown/i,
    /executeExtractionStrategy\s*\(/,/compareFieldCandidate\s*\(/,/createCandidateComparisonRun\s*\(/,/validateCandidateComparisonRun\s*\(/,
    /selectedValue\b/,/preferredValue\b/,/finalValue\b/,/resolvedValue\b/,/appliedValue\b/,
  ]) assert.doesNotMatch(source, forbidden);
  assert.doesNotMatch(source, /from\s+['"](?:\.\.\/)+/);
});

test('review template exposes complete controls without apply or finalization actions', () => {
  const source = read('review-template.js');
  for (const id of [
    'uew-review-build','uew-review-json-download','uew-review-csv-download','uew-review-view',
    'uew-review-entity-filter','uew-review-field-filter','uew-review-dataset-filter',
    'uew-review-status-filter','uew-review-search','uew-review-subject-list','uew-review-prev',
    'uew-review-next','uew-review-details','uew-review-disposition','uew-review-selected-match',
    'uew-review-note','uew-review-note-count','uew-review-match-list','uew-review-match-more',
  ]) assert.match(source, new RegExp(id));
  for (const disposition of ['unreviewed','confirm-match','reject-result','defer']) assert.match(source, new RegExp(disposition));
  assert.doesNotMatch(source, />\s*(?:Apply|Resolve|Finalize|Enrich|Write Back)\s*</i);
});

test('workbench wiring is additive and comparison lifecycle notifies review', () => {
  const workbench = read('workbench-controller.js'); const comparison = read('comparison-controller.js');
  assert.match(workbench, /createComparisonReviewController/); assert.match(workbench, /renderComparisonReviewMarkup/);
  assert.match(workbench, /reviewElements\s*=\s*collectComparisonReviewElements/);
  assert.match(workbench, /getReviewState/); assert.match(workbench, /context\.review\.cleanup\(\)/);
  assert.match(comparison, /onComparisonChange/); assert.match(comparison, /notify\(context\)/);
});

test('review code contains no placeholder handlers, persistence, ranking or source application', () => {
  const source = NEW_FILES.map(read).join('\n');
  assert.doesNotMatch(source, /TODO|FIXME|dead handler/i);
  assert.doesNotMatch(source, /rank(?:ing|ed|Candidates|Rows)|writeBack|sourceEntity\s*=/i);
  assert.doesNotMatch(source, /indexedDB|sessionStorage|localStorage/i);
});
