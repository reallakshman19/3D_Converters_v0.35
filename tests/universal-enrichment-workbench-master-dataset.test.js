const assert = require('assert');
const test = require('node:test');
const { loadEsm } = require('./universal-enrichment-workbench-test-helpers.js');

const CSV = 'Name,Code\nAlpha,A1\nBeta,B2';

async function modules() {
  const dataset = await loadEsm('tabs/universal-enrichment-workbench/master-dataset.js');
  const registry = await loadEsm('tabs/universal-enrichment-workbench/master-registry.js');
  return { ...dataset, ...registry };
}

async function make(overrides = {}) {
  const { createMasterDataset } = await modules();
  return createMasterDataset({
    sourceText: CSV, sourceKind: 'csv', datasetRole: 'custom', sourceName: 'master.csv', ...overrides,
  });
}

test('dataset, column and row identities are deterministic and filename-independent', async () => {
  const first = await make({ sourceName: 'first.csv' });
  const second = await make({ sourceName: 'renamed.csv' });
  assert.strictEqual(first.datasetId, second.datasetId);
  assert.strictEqual(first.contentHash, second.contentHash);
  assert.deepStrictEqual(first.columns.map((item) => item.columnId), second.columns.map((item) => item.columnId));
  assert.deepStrictEqual(first.rows.map((item) => item.rowId), second.rows.map((item) => item.rowId));
});

test('role, cell, row order, column order and source kind affect identity', async () => {
  const base = await make();
  const variants = [
    await make({ datasetRole: 'line-list' }),
    await make({ sourceText: 'Name,Code\nAlpha,A9\nBeta,B2' }),
    await make({ sourceText: 'Name,Code\nBeta,B2\nAlpha,A1' }),
    await make({ sourceText: 'Code,Name\nA1,Alpha\nB2,Beta' }),
    await make({ sourceKind: 'tsv', sourceText: 'Name\tCode\nAlpha\tA1\nBeta\tB2' }),
  ];
  variants.forEach((dataset) => assert.notStrictEqual(dataset.datasetId, base.datasetId));
});

test('dataset artifacts are deeply immutable and serialize round-trip', async () => {
  const { serializeMasterDataset } = await modules();
  const dataset = await make();
  assert(Object.isFrozen(dataset));
  assert(Object.isFrozen(dataset.columns));
  assert(Object.isFrozen(dataset.rows[0].values));
  const columnId = dataset.columns[0].columnId;
  const original = dataset.rows[0].values[columnId];
  dataset.rows[0].values[columnId] = 'Changed';
  assert.strictEqual(dataset.rows[0].values[columnId], original);
  assert.deepStrictEqual(JSON.parse(serializeMasterDataset(dataset)), dataset);
});

test('duplicate rows remain present and produce warning evidence', async () => {
  const dataset = await make({ sourceText: 'Name,Code\nAlpha,A1\nAlpha,A1' });
  assert.strictEqual(dataset.rows.length, 2);
  assert.strictEqual(dataset.summary.duplicateRowCount, 1);
  assert.strictEqual(dataset.validation.ok, true);
  assert.match(dataset.validation.warnings.join(' '), /duplicate row/i);
});

test('dataset validation detects structural, reference, order and identity faults', async () => {
  const { validateMasterDataset } = await modules();
  const dataset = await make();
  const broken = JSON.parse(JSON.stringify(dataset));
  broken.schema = 'Wrong';
  broken.datasetRole = 'unsupported';
  broken.columns[1].columnId = broken.columns[0].columnId;
  broken.rows[1].rowId = broken.rows[0].rowId;
  broken.rows[0].sourceOrder = 4;
  broken.rows[0].values.unknown = 'x';
  const validation = await validateMasterDataset(broken);
  const text = validation.errors.join(' ');
  assert.match(text, /schema/i);
  assert.match(text, /role/i);
  assert.match(text, /duplicate column IDs/i);
  assert.match(text, /duplicate row IDs/i);
  assert.match(text, /unknown column/i);
  assert.match(text, /sourceOrder/i);
});

test('content hash and dataset ID mismatches are recomputed and rejected', async () => {
  const { validateMasterDataset } = await modules();
  const broken = JSON.parse(JSON.stringify(await make()));
  broken.contentHash = '0'.repeat(64);
  broken.datasetId = 'master-' + '1'.repeat(32);
  const validation = await validateMasterDataset(broken);
  assert.match(validation.errors.join(' '), /contentHash/i);
  assert.match(validation.errors.join(' '), /Dataset ID/i);
});

test('registry deduplicates without mutating existing datasets', async () => {
  const { createMasterRegistry, addMasterDataset, removeMasterDataset } = await modules();
  const dataset = await make();
  const empty = createMasterRegistry();
  const added = addMasterDataset(empty, dataset);
  const duplicate = addMasterDataset(added.registry, dataset);
  assert.strictEqual(empty.datasets.length, 0);
  assert.strictEqual(added.registry.datasets.length, 1);
  assert.strictEqual(duplicate.registry, added.registry);
  assert.strictEqual(duplicate.duplicate, true);
  const removed = removeMasterDataset(added.registry, dataset.datasetId);
  assert.strictEqual(removed.registry.datasets.length, 0);
  assert.strictEqual(added.registry.datasets.length, 1);
});


test('registry supports multiple typed immutable datasets', async () => {
  const { createMasterRegistry, addMasterDataset } = await modules();
  const custom = await make();
  const lineList = await make({ datasetRole: 'line-list' });
  const first = addMasterDataset(createMasterRegistry(), custom).registry;
  const second = addMasterDataset(first, lineList).registry;
  assert.strictEqual(second.datasets.length, 2);
  assert.deepStrictEqual(second.datasets.map((item) => item.datasetRole), ['custom', 'line-list']);
  assert.strictEqual(first.datasets.length, 1);
});


test('validation recomputes duplicate evidence and rejects malformed collections', async () => {
  const { validateMasterDataset } = await modules();
  const duplicated = JSON.parse(JSON.stringify(await make({ sourceText: 'A\n1\n1' })));
  duplicated.summary.duplicateRowCount = 0;
  const duplicateValidation = await validateMasterDataset(duplicated);
  assert.match(duplicateValidation.errors.join(' '), /summary duplicateRowCount/i);
  assert.match(duplicateValidation.warnings.join(' '), /duplicate row/i);
  const malformed = { ...duplicated, columns: {}, rows: {} };
  const malformedValidation = await validateMasterDataset(malformed);
  assert.strictEqual(malformedValidation.ok, false);
  assert.match(malformedValidation.errors.join(' '), /columns must be an array/i);
  assert.match(malformedValidation.errors.join(' '), /rows must be an array/i);
});
