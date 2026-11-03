const assert = require('assert');
const test = require('node:test');
const { loadEsm, FakeContainer, FakeDocument, createUrlHarness } = require('./universal-enrichment-workbench-test-helpers.js');

function setupOptions(documentRef, urlHarness, downloads) {
  return {
    document: documentRef, BlobCtor: Blob, urlApi: urlHarness.api,
    triggerDownload: (url, name) => downloads.push({ url, name }),
    now: () => '2026-07-14T03:57:07.000Z',
  };
}

test('renderer supports file intake, edited authority and matching displayed download', async () => {
  const { renderUniversalEnrichmentWorkbench } = await loadEsm('tabs/universal-enrichment-workbench/workbench-controller.js');
  const documentRef = new FakeDocument();
  const container = new FakeContainer(documentRef);
  const urlHarness = createUrlHarness();
  const downloads = [];
  const cleanup = renderUniversalEnrichmentWorkbench(container, setupOptions(documentRef, urlHarness, downloads));
  const file = container.querySelector('#uew-file');
  const editor = container.querySelector('#uew-source-text');
  file.files = [{ name: 'loaded.xml', text: async () => '<Root><Old/></Root>' }];
  await file.dispatch('change');
  editor.value = '<Root><Edited/></Root>';
  await editor.dispatch('input');
  await container.querySelector('#uew-generate').dispatch('click');
  const displayedHash = container.querySelector('#uew-content-hash').textContent;
  assert.strictEqual(container.querySelector('#uew-revision').textContent, '2');
  assert.strictEqual(container.querySelector('#uew-origin').textContent, 'editor');
  assert.strictEqual(container.querySelector('#uew-download').disabled, false);
  await container.querySelector('#uew-download').dispatch('click');
  const downloaded = JSON.parse(await urlHarness.blobs.get(downloads[0].url).text());
  assert.strictEqual(downloaded.sourceText, '<Root><Edited/></Root>');
  assert.strictEqual(downloaded.contentHash, displayedHash);
  cleanup();
  assert.deepStrictEqual(urlHarness.revoked, [downloads[0].url]);
});

test('paste intake, invalid blocking, clear/reset and cleanup are deterministic', async () => {
  const { renderUniversalEnrichmentWorkbench } = await loadEsm('tabs/universal-enrichment-workbench/workbench-controller.js');
  const documentRef = new FakeDocument();
  const container = new FakeContainer(documentRef);
  const urlHarness = createUrlHarness();
  const cleanup = renderUniversalEnrichmentWorkbench(container, setupOptions(documentRef, urlHarness, []));
  const editor = container.querySelector('#uew-source-text');
  await editor.dispatch('paste');
  editor.value = '{bad';
  await editor.dispatch('input');
  await container.querySelector('#uew-generate').dispatch('click');
  assert.strictEqual(container.querySelector('#uew-origin').textContent, 'paste');
  assert.strictEqual(container.querySelector('#uew-status').textContent, 'Invalid');
  assert.strictEqual(container.querySelector('#uew-download').disabled, true);
  await container.querySelector('#uew-clear').dispatch('click');
  assert.strictEqual(editor.value, '');
  assert.strictEqual(container.querySelector('#uew-revision').textContent, '0');
  cleanup();
  assert.strictEqual(container.innerHTML, '');
});


test('an in-flight envelope cannot overwrite a newer edited revision', async () => {
  const { renderUniversalEnrichmentWorkbench } = await loadEsm('tabs/universal-enrichment-workbench/workbench-controller.js');
  const documentRef = new FakeDocument();
  const container = new FakeContainer(documentRef);
  let releaseHash;
  const gate = new Promise((resolve) => { releaseHash = resolve; });
  const hashText = async (value) => {
    await gate;
    const bytes = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  };
  const cleanup = renderUniversalEnrichmentWorkbench(container, {
    ...setupOptions(documentRef, createUrlHarness(), []), hashText,
  });
  const editor = container.querySelector('#uew-source-text');
  editor.value = '<Root><First/></Root>';
  await editor.dispatch('input');
  const generating = container.querySelector('#uew-generate').dispatch('click');
  editor.value = '<Root><Second/></Root>';
  await editor.dispatch('input');
  releaseHash();
  await generating;
  assert.strictEqual(container.querySelector('#uew-content-hash').textContent, '—');
  assert.strictEqual(container.querySelector('#uew-download').disabled, true);
  cleanup();
});

test('tab launcher installs and removes only its module stylesheet', async () => {
  const { renderUniversalEnrichmentWorkbenchTab } = await loadEsm('tabs/universal-enrichment-workbench-tab.js');
  const documentRef = new FakeDocument();
  const container = new FakeContainer(documentRef);
  const cleanup = renderUniversalEnrichmentWorkbenchTab(container, setupOptions(documentRef, createUrlHarness(), []));
  assert(documentRef.getElementById('uew-stylesheet'));
  assert.match(container.innerHTML, /Universal Enrichment Workbench/);
  cleanup();
  assert.strictEqual(documentRef.getElementById('uew-stylesheet'), null);
});
