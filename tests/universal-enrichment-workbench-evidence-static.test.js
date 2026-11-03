import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const MODULE = path.join(ROOT, 'tabs', 'universal-enrichment-workbench');
const evidenceFiles = fs.readdirSync(MODULE).filter((name) => name.startsWith('evidence-') && name.endsWith('.js'));
const productionFiles = evidenceFiles.map((name) => path.join(MODULE, name));

function text(file) { return fs.readFileSync(file, 'utf8'); }

test('evidence production remains isolated from protected pipelines and extraction executors', () => {
  const combined = productionFiles.map(text).join('\n');
  const forbidden = [
    /xml-cii/i, /uxml\//i, /model-converters/i, /localStorage/,
    /executeExtractionStrategy/, /testExtractionRule/, /from ['"]\.\/extraction-strategy\.js['"]/,
    /MasterDataset[^\n]*\.rows|master[^\n]*\.rows/i,
  ];
  forbidden.forEach((pattern) => assert.doesNotMatch(combined, pattern));
});

test('evidence modules use named exports, stay below file limit and contain required contracts', () => {
  productionFiles.forEach((file) => {
    const source = text(file);
    assert.ok(source.split(/\r?\n/).length < 300, `${path.basename(file)} exceeds 300 lines`);
    assert.doesNotMatch(source, /export\s+default/);
  });
  const combined = productionFiles.map(text).join('\n');
  [
    'createFieldCandidateEntryId', 'createFieldCandidateId', 'createFieldCandidateLedger',
    'validateFieldCandidateLedger', 'serializeFieldCandidateLedger', 'summarizeFieldCandidateLedger',
    'createExtractionEvidenceTrace', 'validateExtractionEvidenceTrace',
    'serializeExtractionEvidenceTrace', 'summarizeExtractionEvidenceTrace',
    'buildCandidateLedgerCsv', 'buildRejectedLedgerCsv',
  ].forEach((name) => assert.match(combined, new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`)));
});

test('workbench UI and lifecycle wire every evidence control without app-shell changes', () => {
  const template = text(path.join(MODULE, 'evidence-template.js'));
  const workbench = text(path.join(MODULE, 'workbench-controller.js'));
  const extraction = text(path.join(MODULE, 'extraction-controller.js'));
  [
    'evidence-build', 'evidence-ledger-download', 'evidence-trace-download',
    'evidence-candidate-csv', 'evidence-rejected-csv', 'evidence-view',
    'evidence-entity-filter', 'evidence-field-filter', 'evidence-search',
    'evidence-ledger-list', 'evidence-ledger-prev', 'evidence-ledger-next',
    'evidence-trace-tree', 'evidence-trace-more', 'evidence-entry-details', 'evidence-trace-details',
  ].forEach((id) => assert.match(template, new RegExp(`uew-${id}`)));
  assert.match(workbench, /createEvidenceLedgerController/);
  assert.match(workbench, /collectEvidenceLedgerElements/);
  assert.match(workbench, /getEvidenceState/);
  assert.match(extraction, /onExtractionChange/);
});
