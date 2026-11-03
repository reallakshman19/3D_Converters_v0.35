import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  createMasterAttachmentSetIdentity, createMasterFieldBindingConfig, validateMasterFieldBindingConfig,
} from '../tabs/universal-enrichment-workbench/comparison-binding.js';
import { normalizeComparisonValue } from '../tabs/universal-enrichment-workbench/comparison-normalize.js';
import {
  createCandidateComparisonRun, validateCandidateComparisonRun,
} from '../tabs/universal-enrichment-workbench/comparison-run.js';

const hashText = async (value) => createHash('sha256').update(String(value ?? '')).digest('hex');

function fixtures() {
  const graph = {
    schema: 'UniversalSourceGraph.v1', sourceFileId: 'source-a', sourceRevision: 1,
    contentHash: 'graph-hash', validation: { ok: true, errors: [], warnings: [] },
  };
  const ledger = {
    schema: 'FieldCandidateLedger.v1', ledgerId: 'ledger-a', sourceFileId: 'source-a',
    sourceRevision: 1, sourceContentHash: 'graph-hash', sourceGraphSchema: 'UniversalSourceGraph.v1',
    validation: { ok: true, errors: [], warnings: [] },
    entries: [
      { entryId: 'e1', sourceOrder: 0, entityId: 'n1', fieldKey: 'tag', status: 'candidate', candidates: [{ candidateId: 'c1', value: ' A  B ' }] },
      { entryId: 'e2', sourceOrder: 1, entityId: 'n2', fieldKey: 'flag', status: 'candidate', candidates: [{ candidateId: 'c2', value: false }] },
      { entryId: 'e3', sourceOrder: 2, entityId: 'n3', fieldKey: 'none', status: 'candidate', candidates: [{ candidateId: 'c3', value: null }] },
      { entryId: 'e4', sourceOrder: 3, entityId: 'n4', fieldKey: 'ignored', status: 'rejected', candidates: [] },
    ],
  };
  const dataset = {
    schema: 'MasterDataset.v1', datasetId: 'd1', datasetRole: 'line-list', contentHash: 'dataset-hash',
    validation: { ok: true, errors: [], warnings: [] },
    columns: [{ columnId: 'col1', name: 'tag', sourceOrder: 0 }, { columnId: 'col2', name: 'flag', sourceOrder: 1 }],
    rows: [
      { rowId: 'r1', sourceOrder: 0, values: { col1: 'a b', col2: false } },
      { rowId: 'r2', sourceOrder: 1, values: { col1: 'A B', col2: 'false' } },
    ],
  };
  const registry = { datasets: [dataset] };
  const attachmentSet = {
    schema: 'MasterAttachmentSet.v1', sourceFileId: 'source-a', sourceRevision: 1,
    sourceContentHash: 'graph-hash', sourceGraphSchema: 'UniversalSourceGraph.v1',
    attachments: [{ datasetId: 'd1', datasetRole: 'line-list', attachmentOrder: 0 }],
    validation: { ok: true, errors: [], warnings: [] },
  };
  const drafts = [
    { fieldKey: 'tag', datasetId: 'd1', datasetRole: 'line-list', columnId: 'col1',
      comparisonMode: 'text-normalized', normalization: { trim: true, collapseWhitespace: true, caseFold: true } },
    { fieldKey: 'flag', datasetId: 'd1', datasetRole: 'line-list', columnId: 'col2', comparisonMode: 'strict' },
  ];
  return { graph, ledger, dataset, registry, attachmentSet, drafts };
}

test('normalization distinguishes null, empty, numeric, string and boolean evidence', () => {
  assert.notEqual(normalizeComparisonValue(null, 'text-exact').indexKey, normalizeComparisonValue('', 'text-exact').indexKey);
  assert.notEqual(normalizeComparisonValue(0, 'strict').indexKey, normalizeComparisonValue('0', 'strict').indexKey);
  assert.notEqual(normalizeComparisonValue(false, 'strict').indexKey, normalizeComparisonValue('false', 'strict').indexKey);
  const normalized = normalizeComparisonValue(' A  B ', 'text-normalized', { trim: true, collapseWhitespace: true, caseFold: true });
  assert.equal(normalized.normalizedValue, 'a b');
});

test('binding config is deterministic, attached-only and deeply immutable', async () => {
  const f = fixtures();
  const first = await createMasterFieldBindingConfig(f.graph, f.ledger, f.attachmentSet, f.registry, f.drafts, { hashText });
  const second = await createMasterFieldBindingConfig(f.graph, f.ledger, f.attachmentSet, f.registry, f.drafts, { hashText });
  assert.equal(first.validation.ok, true, first.validation.errors.join('\n')); assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true); assert.equal(Object.isFrozen(first.bindings[0].normalization), true);
  assert.equal(first.attachmentSetIdentity, await createMasterAttachmentSetIdentity(f.graph, f.attachmentSet, hashText));
  assert.equal((await validateMasterFieldBindingConfig(first, f.graph, f.ledger, f.attachmentSet, f.registry, { hashText })).ok, true);
});

test('comparison run preserves unique, multiple and unbound projections without ranking', async () => {
  const f = fixtures();
  const config = await createMasterFieldBindingConfig(f.graph, f.ledger, f.attachmentSet, f.registry, f.drafts, { hashText });
  const run = await createCandidateComparisonRun(f.graph, f.ledger, config, f.attachmentSet, f.registry, { hashText });
  assert.equal(run.validation.ok, true, run.validation.errors.join('\n')); assert.equal(run.results.length, 2);
  assert.equal(run.results[0].status, 'multiple-match'); assert.deepEqual(run.results[0].matches.map((item) => item.rowId), ['r1', 'r2']);
  assert.equal(run.results[1].status, 'unique-match'); assert.equal(run.unbound.length, 1); assert.equal(run.unbound[0].candidateId, 'c3');
  assert.equal(JSON.stringify(run).includes('preferred'), false); assert.equal(JSON.stringify(run).includes('finalValue'), false);
  assert.equal((await validateCandidateComparisonRun(run, f.graph, f.ledger, config, f.attachmentSet, f.registry, { hashText })).ok, true);
});
