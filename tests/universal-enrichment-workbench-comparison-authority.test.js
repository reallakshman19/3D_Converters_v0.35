import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createMasterFieldBindingConfig, validateMasterFieldBindingConfig,
} from '../tabs/universal-enrichment-workbench/comparison-binding.js';

const hashText = async (value) => createHash('sha256').update(String(value ?? '')).digest('hex');

function authorityFixture() {
  const graph = { schema: 'UniversalSourceGraph.v1', sourceFileId: 's', sourceRevision: 1,
    contentHash: 'h', validation: { ok: true, errors: [], warnings: [] } };
  const ledger = { schema: 'FieldCandidateLedger.v1', ledgerId: 'l', sourceFileId: 's',
    sourceRevision: 1, sourceContentHash: 'h', sourceGraphSchema: graph.schema,
    entries: [{ entryId: 'e', entityId: 'n', fieldKey: 'tag', status: 'candidate',
      candidates: [{ candidateId: 'c', value: 'A' }] }],
    validation: { ok: true, errors: [], warnings: [] } };
  const dataset = { schema: 'MasterDataset.v1', datasetId: 'd', datasetRole: 'line-list',
    contentHash: 'dh', columns: [{ columnId: 'col', name: 'Tag', sourceOrder: 0 }],
    rows: [{ rowId: 'r', sourceOrder: 0, values: { col: 'A' } }],
    validation: { ok: true, errors: [], warnings: [] } };
  const registry = { datasets: [dataset] };
  const attachmentSet = { schema: 'MasterAttachmentSet.v1', sourceFileId: 's', sourceRevision: 1,
    sourceContentHash: 'h', sourceGraphSchema: graph.schema,
    attachments: [{ datasetId: 'd', datasetRole: 'line-list', attachmentOrder: 0 }],
    validation: { ok: true, errors: [], warnings: [] } };
  const draft = { fieldKey: 'tag', datasetId: 'd', datasetRole: 'line-list',
    columnId: 'col', comparisonMode: 'strict' };
  return { graph, ledger, registry, attachmentSet, draft };
}

test('binding validation rejects stale graph metadata and duplicate identities', async () => {
  const f = authorityFixture();
  const config = await createMasterFieldBindingConfig(f.graph, f.ledger, f.attachmentSet, f.registry, [f.draft], { hashText });
  const stale = structuredClone(config); stale.sourceRevision = 2;
  const staleValidation = await validateMasterFieldBindingConfig(stale, f.graph, f.ledger, f.attachmentSet, f.registry, { hashText });
  assert.equal(staleValidation.ok, false);
  assert.ok(staleValidation.errors.some((error) => error.includes('sourceRevision')));
  const duplicate = structuredClone(config); duplicate.bindings.push({ ...duplicate.bindings[0], sourceOrder: 1 });
  duplicate.summary.bindingCount = 2;
  const duplicateValidation = await validateMasterFieldBindingConfig(duplicate, f.graph, f.ledger, f.attachmentSet, f.registry, { hashText });
  assert.equal(duplicateValidation.ok, false);
  assert.ok(duplicateValidation.errors.some((error) => error.includes('Duplicate binding ID')));
});

test('evidence completion is bridged into comparison invalidation', async () => {
  const root = new URL('../tabs/universal-enrichment-workbench/', import.meta.url);
  const evidence = await readFile(new URL('evidence-controller.js', root), 'utf8');
  const workbench = await readFile(new URL('workbench-controller.js', root), 'utf8');
  assert.ok(evidence.includes('onEvidenceChange?.(context.state)'));
  assert.ok(workbench.includes('onEvidenceChange: (state)'));
  assert.ok(workbench.includes('context.comparison?.syncUpstream()'));
});
