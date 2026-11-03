const assert = require('assert');
const test = require('node:test');
const { loadEsm } = require('./universal-enrichment-workbench-test-helpers.js');

async function modules() {
  const authority = await loadEsm('tabs/universal-enrichment-workbench/source-authority.js');
  const envelope = await loadEsm('tabs/universal-enrichment-workbench/source-envelope.js');
  return { ...authority, ...envelope };
}

test('file intake reads the selected file exactly once into authoritative state', async () => {
  const { createWorkbenchState, readSourceFile, acceptAuthoritativeText } = await modules();
  let reads = 0;
  const file = { name: 'source.xml', text: async () => { reads += 1; return '<Root/>'; } };
  const loaded = await readSourceFile(file);
  const state = acceptAuthoritativeText(createWorkbenchState(), { ...loaded, origin: 'file' });
  assert.strictEqual(reads, 1);
  assert.strictEqual(state.origin, 'file');
  assert.strictEqual(state.revision, 1);
  assert.strictEqual(state.normalizedText, '<Root/>');
});

test('pasted and edited text replace authority and increment revision only on normalized change', async () => {
  const { createWorkbenchState, acceptAuthoritativeText } = await modules();
  const pasted = acceptAuthoritativeText(createWorkbenchState(), { sourceText: '{"a":1}', origin: 'paste' });
  const unchanged = acceptAuthoritativeText(pasted, { sourceText: '  {"a":1}\r\n', origin: 'editor' });
  const edited = acceptAuthoritativeText(unchanged, { sourceText: '{"a":2}', origin: 'editor' });
  assert.strictEqual(pasted.revision, 1);
  assert.strictEqual(unchanged.revision, 1);
  assert.strictEqual(edited.revision, 2);
  assert.strictEqual(edited.origin, 'editor');
});

test('changed authoritative content changes content hash and source identity', async () => {
  const { createSourceEnvelope } = await modules();
  const common = { sourceKind: 'stagedjson', sourceName: 'stage.json', origin: 'editor' };
  const first = await createSourceEnvelope({ ...common, sourceText: '{"a":1}', revision: 1 });
  const second = await createSourceEnvelope({ ...common, sourceText: '{"a":2}', revision: 2 });
  assert.notStrictEqual(first.contentHash, second.contentHash);
  assert.notStrictEqual(first.sourceFileId, second.sourceFileId);
});
