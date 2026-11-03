const assert = require('assert');
const test = require('node:test');
const { loadEsm } = require('./universal-enrichment-workbench-test-helpers.js');

function validGraph(suffix = 'a') {
  return {
    schema: 'UniversalSourceGraph.v1',
    sourceFileId: `source-${suffix.padEnd(32, '0').slice(0, 32)}`,
    sourceRevision: 1,
    contentHash: suffix.padEnd(64, '0').slice(0, 64),
    validation: { ok: true, errors: [], warnings: [] },
  };
}

async function modules() {
  const dataset = await loadEsm('tabs/universal-enrichment-workbench/master-dataset.js');
  const registry = await loadEsm('tabs/universal-enrichment-workbench/master-registry.js');
  const attachments = await loadEsm('tabs/universal-enrichment-workbench/master-attachments.js');
  return { ...dataset, ...registry, ...attachments };
}

async function fixture() {
  const api = await modules();
  const dataset = await api.createMasterDataset({
    sourceText: 'A,B\n1,2', sourceKind: 'csv', datasetRole: 'custom', sourceName: 'a.csv',
  });
  const registry = api.addMasterDataset(api.createMasterRegistry(), dataset).registry;
  return { ...api, dataset, registry, graph: validGraph('a') };
}

test('attachment set contains references only and is deeply immutable', async () => {
  const { dataset, registry, graph, createMasterAttachmentSet, attachMasterDataset, serializeMasterAttachmentSet } = await fixture();
  const attached = attachMasterDataset(createMasterAttachmentSet(graph, [], registry), graph, registry, dataset);
  assert.strictEqual(attached.validation.ok, true);
  assert.deepStrictEqual(attached.attachments, [{
    datasetId: dataset.datasetId, datasetRole: dataset.datasetRole, attachmentOrder: 0,
  }]);
  assert.strictEqual('rows' in attached.attachments[0], false);
  for (const value of [attached, attached.attachments, attached.attachments[0], attached.validation, attached.validation.errors, attached.validation.warnings]) {
    assert(Object.isFrozen(value));
  }
  assert.deepStrictEqual(JSON.parse(serializeMasterAttachmentSet(attached)), attached);
});

test('duplicate attach is rejected and detach retains registry dataset', async () => {
  const { dataset, registry, graph, createMasterAttachmentSet, attachMasterDataset, detachMasterDataset } = await fixture();
  const attached = attachMasterDataset(createMasterAttachmentSet(graph, [], registry), graph, registry, dataset);
  assert.strictEqual(attachMasterDataset(attached, graph, registry, dataset), attached);
  const detached = detachMasterDataset(attached, graph, registry, dataset.datasetId);
  assert.strictEqual(detached.attachments.length, 0);
  assert.strictEqual(registry.datasets.length, 1);
});

test('attachment validation detects metadata, unknown, duplicate, role and order faults', async () => {
  const { dataset, registry, graph, validateMasterAttachmentSet } = await fixture();
  const broken = {
    schema: 'Wrong', sourceFileId: 'other', sourceRevision: 99,
    sourceGraphSchema: 'WrongGraph', sourceContentHash: 'other',
    attachments: [
      { datasetId: dataset.datasetId, datasetRole: 'line-list', attachmentOrder: 2 },
      { datasetId: dataset.datasetId, datasetRole: dataset.datasetRole, attachmentOrder: 2 },
      { datasetId: 'master-unknown', datasetRole: 'custom', attachmentOrder: 1 },
    ],
  };
  const text = validateMasterAttachmentSet(broken, graph, registry).errors.join(' ');
  assert.match(text, /schema/i);
  assert.match(text, /metadata mismatch/i);
  assert.match(text, /Duplicate attachment/i);
  assert.match(text, /role mismatch/i);
  assert.match(text, /Unknown attachment dataset/i);
  assert.match(text, /order/i);
});

test('attachment validation rejects a graph with the wrong schema even when marked valid', async () => {
  const { registry, graph, createMasterAttachmentSet } = await fixture();
  const wrongGraph = { ...graph, schema: 'OtherGraph.v1' };
  const attachmentSet = createMasterAttachmentSet(wrongGraph, [], registry);
  assert.strictEqual(attachmentSet.validation.ok, false);
  assert.match(attachmentSet.validation.errors.join(' '), /UniversalSourceGraph\.v1/i);
});

test('attachment validation rejects function and cyclic values', async () => {
  const { registry, graph, createMasterAttachmentSet, validateMasterAttachmentSet } = await fixture();
  const base = createMasterAttachmentSet(graph, [], registry);
  assert.match(validateMasterAttachmentSet({ ...base, callback() {} }, graph, registry).errors.join(' '), /unsupported type/i);
  const cyclic = { ...base }; cyclic.self = cyclic;
  assert.match(validateMasterAttachmentSet(cyclic, graph, registry).errors.join(' '), /cycle/i);
});

test('attachment validation rejects malformed attachment collections without throwing', async () => {
  const { createMasterDataset } = await modules();
  const { validateMasterAttachmentSet } = await modules();
  const dataset = await createMasterDataset({ sourceText: 'A\n1', sourceKind: 'csv', datasetRole: 'custom', sourceName: 'a.csv' });
  const registry = { schema: 'MasterRegistry.v1', datasets: [dataset] };
  const graph = validGraph();
  const validation = validateMasterAttachmentSet({ schema: 'MasterAttachmentSet.v1', attachments: {} }, graph, registry);
  assert.strictEqual(validation.ok, false);
  assert.match(validation.errors.join(' '), /Attachments must be an array/i);
});
