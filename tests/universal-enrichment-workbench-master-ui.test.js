const assert = require('assert');
const test = require('node:test');
const { loadEsm, FakeDocument, FakeElement, createUrlHarness } = require('./universal-enrichment-workbench-test-helpers.js');

const IDS = [
  'master-file', 'master-format', 'master-role', 'master-text', 'master-import',
  'master-import-status', 'master-errors', 'master-warnings', 'master-dataset-list',
  'master-search', 'master-prev', 'master-next', 'master-preview-count',
  'master-preview-head', 'master-preview-body', 'master-details', 'master-download',
  'master-remove', 'master-attach', 'master-attachment-list', 'master-attachment-status',
  'master-attachment-errors', 'master-attachment-warnings', 'master-attachment-download',
  'master-registry-clear',
];

function validGraph(suffix = 'a') {
  return {
    schema: 'UniversalSourceGraph.v1',
    sourceFileId: `source-${suffix.padEnd(32, '0').slice(0, 32)}`,
    sourceRevision: 1,
    contentHash: suffix.padEnd(64, '0').slice(0, 64),
    validation: { ok: true, errors: [], warnings: [] },
  };
}

function createElements() {
  const documentRef = new FakeDocument();
  return Object.fromEntries(IDS.map((id) => [id, new FakeElement('div', documentRef)]));
}

async function setup(extra = {}) {
  const { createMasterRegistryController } = await loadEsm('tabs/universal-enrichment-workbench/master-controller.js');
  const elements = createElements();
  elements['master-format'].value = 'csv';
  elements['master-role'].value = 'custom';
  const urls = createUrlHarness();
  const downloads = [];
  let graph = null;
  const controller = createMasterRegistryController(elements, {
    BlobCtor: Blob, urlApi: urls.api,
    triggerDownload: (url, name) => downloads.push({ url, name }), ...extra,
  }, () => graph);
  return { elements, urls, downloads, controller, setGraph(value) { graph = value; controller.syncGraph(value); } };
}

async function importText(harness, text) {
  harness.elements['master-text'].value = text;
  await harness.elements['master-text'].dispatch('input');
  await harness.elements['master-import'].dispatch('click');
}

test('file is read once and edited text is authoritative for import', async () => {
  let reads = 0;
  const harness = await setup();
  harness.elements['master-file'].files = [{
    name: 'source.csv', text: async () => { reads += 1; return 'A,B\nold,1'; },
  }];
  await harness.elements['master-file'].dispatch('change');
  harness.elements['master-text'].value = 'A,B\nedited,2';
  await harness.elements['master-text'].dispatch('input');
  await harness.elements['master-import'].dispatch('click');
  const dataset = harness.controller.getState().registry.datasets[0];
  assert.strictEqual(reads, 1);
  assert.strictEqual(dataset.rows[0].values[dataset.columns[0].columnId], 'edited');
  assert.strictEqual(harness.controller.getState().input.revision, 2);
  harness.controller.cleanup();
});

test('stale asynchronous import cannot register an older revision', async () => {
  const datasetModule = await loadEsm('tabs/universal-enrichment-workbench/master-dataset.js');
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const harness = await setup({
    createDataset: async (input, dependencies) => {
      await gate;
      return datasetModule.createMasterDataset(input, dependencies);
    },
  });
  harness.elements['master-text'].value = 'A\nold';
  await harness.elements['master-text'].dispatch('input');
  const importing = harness.elements['master-import'].dispatch('click');
  harness.elements['master-text'].value = 'A\nnew';
  await harness.elements['master-text'].dispatch('input');
  release();
  await importing;
  assert.strictEqual(harness.controller.getState().registry.datasets.length, 0);
  assert.strictEqual(harness.elements['master-import-status'].textContent, 'Ready to import');
  harness.controller.cleanup();
});

test('preview is bounded, searchable and exposes later pages', async () => {
  const harness = await setup();
  const rows = Array.from({ length: 250 }, (_, index) => `row-${index}`).join('\n');
  await importText(harness, `Value\n${rows}`);
  assert.strictEqual(harness.elements['master-preview-body'].children.length, 200);
  assert.strictEqual(harness.elements['master-next'].disabled, false);
  await harness.elements['master-next'].dispatch('click');
  assert.strictEqual(harness.elements['master-preview-body'].children.length, 50);
  assert.match(harness.elements['master-preview-count'].textContent, /page 2\/2/);
  harness.elements['master-search'].value = 'row-249';
  await harness.elements['master-search'].dispatch('input');
  assert.strictEqual(harness.elements['master-preview-body'].children.length, 1);
  assert.match(harness.elements['master-preview-count'].textContent, /1 of 1/);
  const visibleRow = harness.elements['master-preview-body'].children[0];
  await harness.elements['master-preview-body'].dispatch('click', visibleRow);
  assert.match(harness.elements['master-details'].textContent, /row-249/);
  harness.controller.cleanup();
});

test('dataset and attachment downloads match displayed artifacts', async () => {
  const harness = await setup();
  await importText(harness, 'A,B\n1,2');
  const dataset = harness.controller.getState().registry.datasets[0];
  await harness.elements['master-download'].dispatch('click');
  const datasetDownload = harness.downloads[0];
  assert.deepStrictEqual(JSON.parse(await harness.urls.blobs.get(datasetDownload.url).text()), dataset);
  await harness.elements['master-download'].dispatch('click');
  const replacementDownload = harness.downloads[1];
  assert(harness.urls.revoked.includes(datasetDownload.url));
  assert.deepStrictEqual(JSON.parse(await harness.urls.blobs.get(replacementDownload.url).text()), dataset);
  await harness.elements['master-attach'].dispatch('click');
  assert.strictEqual(harness.controller.getState().attachmentSet, null);
  harness.setGraph(validGraph('g'));
  await harness.elements['master-attach'].dispatch('click');
  const attachmentSet = harness.controller.getState().attachmentSet;
  await harness.elements['master-attachment-download'].dispatch('click');
  const attachmentDownload = harness.downloads[2];
  assert.deepStrictEqual(JSON.parse(await harness.urls.blobs.get(attachmentDownload.url).text()), attachmentSet);
  harness.controller.cleanup();
  assert(harness.urls.revoked.includes(replacementDownload.url));
  assert(harness.urls.revoked.includes(attachmentDownload.url));
});

test('graph invalidation retains registry; remove detaches; clear is explicit', async () => {
  const harness = await setup();
  await importText(harness, 'A\n1');
  harness.setGraph(validGraph('x'));
  await harness.elements['master-attach'].dispatch('click');
  assert.strictEqual(harness.controller.getState().attachmentSet.attachments.length, 1);
  harness.setGraph(null);
  assert.strictEqual(harness.controller.getState().attachmentSet, null);
  assert.strictEqual(harness.controller.getState().registry.datasets.length, 1);
  harness.setGraph(validGraph('y'));
  await harness.elements['master-attach'].dispatch('click');
  await harness.elements['master-remove'].dispatch('click');
  assert.strictEqual(harness.controller.getState().registry.datasets.length, 0);
  assert.strictEqual(harness.controller.getState().attachmentSet.attachments.length, 0);
  await importText(harness, 'A\n2');
  await harness.elements['master-registry-clear'].dispatch('click');
  assert.strictEqual(harness.controller.getState().registry.datasets.length, 0);
  assert.strictEqual(harness.controller.getState().input.sourceText, 'A\n2');
  harness.controller.cleanup();
});


test('duplicate imports are visibly deduplicated', async () => {
  const harness = await setup();
  await importText(harness, 'A\n1');
  await harness.elements['master-import'].dispatch('click');
  assert.strictEqual(harness.controller.getState().registry.datasets.length, 1);
  assert.strictEqual(harness.elements['master-import-status'].textContent, 'Duplicate ignored');
  assert.match(harness.elements['master-warnings'].children[0].textContent, /already registered/i);
  harness.controller.cleanup();
});
