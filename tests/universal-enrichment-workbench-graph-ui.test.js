const assert = require('assert');
const test = require('node:test');
const { loadEsm, FakeContainer, FakeDocument, createUrlHarness } = require('./universal-enrichment-workbench-test-helpers.js');

function options(documentRef, urlHarness, downloads, overrides = {}) {
  return {
    document: documentRef,
    BlobCtor: Blob,
    urlApi: urlHarness.api,
    triggerDownload: (url, name) => downloads.push({ url, name }),
    now: () => '2026-07-14T07:47:49.000Z',
    ...overrides,
  };
}

async function renderHarness(overrides = {}) {
  const { renderUniversalEnrichmentWorkbench } = await loadEsm('tabs/universal-enrichment-workbench/workbench-controller.js');
  const documentRef = new FakeDocument();
  const container = new FakeContainer(documentRef);
  const urlHarness = createUrlHarness();
  const downloads = [];
  const cleanup = renderUniversalEnrichmentWorkbench(container, options(documentRef, urlHarness, downloads, overrides));
  return { container, urlHarness, downloads, cleanup };
}

async function generateEnvelope(container, text, kind = 'auto') {
  const editor = container.querySelector('#uew-source-text');
  editor.value = text;
  await editor.dispatch('input');
  if (kind !== 'auto') {
    const selector = container.querySelector('#uew-kind');
    selector.value = kind;
    await selector.dispatch('change');
  }
  await container.querySelector('#uew-generate').dispatch('click');
}

test('graph build is blocked without a valid displayed envelope', async () => {
  const { container, cleanup } = await renderHarness();
  const build = container.querySelector('#uew-graph-build');
  assert.strictEqual(build.disabled, true);
  await build.dispatch('click');
  assert.strictEqual(container.querySelector('#uew-graph-status').textContent, 'Not built');
  cleanup();
});

test('builds from displayed envelope, explores hierarchy, filters table and downloads displayed graph', async () => {
  const { container, urlHarness, downloads, cleanup } = await renderHarness();
  await generateEnvelope(container, '<Root><Child id="1"/><Child id="2"><Leaf>v</Leaf></Child></Root>');
  assert.strictEqual(container.querySelector('#uew-graph-build').disabled, false);
  await container.querySelector('#uew-graph-build').dispatch('click');
  assert.strictEqual(container.querySelector('#uew-graph-status').textContent, 'Valid');
  assert.strictEqual(container.querySelector('#uew-graph-entity-count').textContent, '4');
  const tree = container.querySelector('#uew-graph-tree');
  assert.strictEqual(tree.children.length, 1, 'initial tree rendering must contain roots only');
  await tree.dispatch('click', tree.children[0].children[0]);
  assert.strictEqual(tree.children.length, 3);
  assert.strictEqual(tree.children[1].style.paddingLeft, '14px');
  const filter = container.querySelector('#uew-graph-filter');
  filter.value = 'Child[2]';
  await filter.dispatch('input');
  const table = container.querySelector('#uew-graph-table-body');
  assert.strictEqual(table.children.length, 2, 'path filter should include the selected branch and its leaf');
  await table.dispatch('click', table.children[0]);
  assert.match(container.querySelector('#uew-graph-details').textContent, /Child\[2\]/);
  await container.querySelector('#uew-graph-download').dispatch('click');
  const downloaded = JSON.parse(await urlHarness.blobs.get(downloads[0].url).text());
  assert.strictEqual(downloaded.schema, 'UniversalSourceGraph.v1');
  assert.strictEqual(downloaded.summary.entityCount, 4);
  assert.strictEqual(downloaded.contentHash, container.querySelector('#uew-content-hash').textContent);
  cleanup();
  assert.deepStrictEqual(urlHarness.revoked, [downloads[0].url]);
});

test('source edits, kind changes and clear immediately invalidate the displayed graph', async () => {
  const { container, cleanup } = await renderHarness();
  await generateEnvelope(container, '<Root><Child/></Root>');
  await container.querySelector('#uew-graph-build').dispatch('click');
  assert.strictEqual(container.querySelector('#uew-graph-status').textContent, 'Valid');
  const editor = container.querySelector('#uew-source-text');
  editor.value = '<Root><Changed/></Root>';
  await editor.dispatch('input');
  assert.strictEqual(container.querySelector('#uew-graph-status').textContent, 'Not built');
  assert.strictEqual(container.querySelector('#uew-graph-download').disabled, true);
  await container.querySelector('#uew-generate').dispatch('click');
  await container.querySelector('#uew-graph-build').dispatch('click');
  const selector = container.querySelector('#uew-kind');
  selector.value = 'xml';
  await selector.dispatch('change');
  assert.strictEqual(container.querySelector('#uew-graph-status').textContent, 'Not built');
  await container.querySelector('#uew-clear').dispatch('click');
  assert.strictEqual(container.querySelector('#uew-graph-entity-count').textContent, '0');
  assert.strictEqual(container.querySelector('#uew-graph-filter').value, '');
  cleanup();
});

test('a stale asynchronous graph build cannot replace a newer source revision', async () => {
  const { createUniversalSourceGraph } = await loadEsm('tabs/universal-enrichment-workbench/graph-projection.js');
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const createGraph = async (envelope, dependencies) => {
    await gate;
    return createUniversalSourceGraph(envelope, dependencies);
  };
  const { container, cleanup } = await renderHarness({ createGraph });
  await generateEnvelope(container, '<Root><First/></Root>');
  const building = container.querySelector('#uew-graph-build').dispatch('click');
  const editor = container.querySelector('#uew-source-text');
  editor.value = '<Root><Second/></Root>';
  await editor.dispatch('input');
  release();
  await building;
  assert.strictEqual(container.querySelector('#uew-graph-status').textContent, 'Not built');
  assert.strictEqual(container.querySelector('#uew-graph-entity-count').textContent, '0');
  cleanup();
});

test('large hierarchy rendering is bounded, pageable and does not reread file bytes', async () => {
  let reads = 0;
  const { container, cleanup } = await renderHarness();
  const file = container.querySelector('#uew-file');
  const children = Array.from({ length: 500 }, (_, index) => `<Item id="${index}"/>`).join('');
  file.files = [{ name: 'large.xml', text: async () => { reads += 1; return `<Root>${children}</Root>`; } }];
  await file.dispatch('change');
  await container.querySelector('#uew-generate').dispatch('click');
  await container.querySelector('#uew-graph-build').dispatch('click');
  assert.strictEqual(reads, 1);
  const tree = container.querySelector('#uew-graph-tree');
  const more = container.querySelector('#uew-graph-tree-more');
  assert.strictEqual(tree.children.length, 1);
  await tree.dispatch('click', tree.children[0].children[0]);
  assert.strictEqual(tree.children.length, 200);
  assert.strictEqual(more.hidden, false);
  await more.dispatch('click');
  assert.strictEqual(tree.children.length, 400);
  assert.strictEqual(more.hidden, false);
  await more.dispatch('click');
  assert.strictEqual(tree.children.length, 501);
  assert.strictEqual(more.hidden, true);
  assert.strictEqual(container.querySelector('#uew-graph-entity-count').textContent, '501');
  cleanup();
});
