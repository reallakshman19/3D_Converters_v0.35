const assert = require('assert');
const test = require('node:test');
const { loadEsm } = require('./universal-enrichment-workbench-test-helpers.js');

const XML = '<PipeStressExport><Node id="1"/></PipeStressExport>';
const INPUT_XML = '<CAESARII XML_TYPE="INPUT"><PIPINGMODEL><PIPINGELEMENT/></PIPINGMODEL></CAESARII>';

async function modules() {
  const text = await loadEsm('tabs/universal-enrichment-workbench/source-text.js');
  const structure = await loadEsm('tabs/universal-enrichment-workbench/source-structure.js');
  const envelope = await loadEsm('tabs/universal-enrichment-workbench/source-envelope.js');
  return { ...text, ...structure, ...envelope };
}

test('normalizes BOM, line endings and boundary whitespace deterministically', async () => {
  const { normalizeSourceText } = await modules();
  assert.strictEqual(normalizeSourceText('\uFEFF  <A>\r\n  x\r</A>  '), '<A>\n  x\n</A>');
  assert.strictEqual(normalizeSourceText('<A>\n  x\n</A>'), '<A>\n  x\n</A>');
});

test('detects XML, structural InputXML and StagedJSON', async () => {
  const { detectSourceKind, inspectXmlStructure } = await modules();
  assert.strictEqual(detectSourceKind(XML), 'xml');
  assert.strictEqual(detectSourceKind(INPUT_XML), 'inputxml');
  assert.strictEqual(inspectXmlStructure(INPUT_XML).rootName, 'CAESARII');
  assert.strictEqual(detectSourceKind('{"elements":[]}'), 'stagedjson');
  assert.strictEqual(detectSourceKind('[{"id":1}]'), 'stagedjson');
});


test('blocks explicit XML/InputXML kind mismatches', async () => {
  const { analyzeSourceText } = await modules();
  const inputAsXml = analyzeSourceText(INPUT_XML, 'xml');
  const xmlAsInput = analyzeSourceText(XML, 'inputxml');
  assert.strictEqual(inputAsXml.ok, false);
  assert.strictEqual(xmlAsInput.ok, false);
  assert.match(inputAsXml.errors.join(' '), /inputxml structure was detected/i);
  assert.match(xmlAsInput.errors.join(' '), /xml structure was detected/i);
});

test('reports malformed XML and malformed or scalar JSON without throwing', async () => {
  const { inspectXmlStructure, inspectJsonStructure } = await modules();
  assert.strictEqual(inspectXmlStructure('<Root><Child></Root>').ok, false);
  assert.match(inspectXmlStructure('<Root><Child></Root>').errors.join(' '), /Mismatched|Unclosed/);
  assert.strictEqual(inspectJsonStructure('{bad').ok, false);
  assert.match(inspectJsonStructure('{bad').errors[0], /Malformed JSON/);
  assert.deepStrictEqual(inspectJsonStructure('42'), {
    ok: false, rootShape: 'number', errors: ['StagedJSON root must be an object or array.'], warnings: [],
  });
});

test('creates deterministic SHA-256 identity independent of filename and time', async () => {
  const { sha256Hex, createSourceEnvelope, createSourceFileId } = await modules();
  assert.strictEqual(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const base = { sourceText: XML, sourceKind: 'xml', origin: 'paste', revision: 1 };
  const first = await createSourceEnvelope({ ...base, sourceName: 'a.xml' }, { now: () => '2026-01-01T00:00:00.000Z' });
  const second = await createSourceEnvelope({ ...base, sourceName: 'renamed.xml' }, { now: () => '2027-01-01T00:00:00.000Z' });
  assert.strictEqual(first.contentHash, second.contentHash);
  assert.strictEqual(await createSourceFileId('  <A/>\r\n', 'xml'), await createSourceFileId('<A/>', 'xml'));
  assert.strictEqual(first.sourceFileId, second.sourceFileId);
  assert.notStrictEqual(first.createdAt, second.createdAt);
});

test('validates and serializes SourceEnvelope.v1 round-trip', async () => {
  const { createSourceEnvelope, validateSourceEnvelope, serializeSourceEnvelope } = await modules();
  const envelope = await createSourceEnvelope({ sourceText: INPUT_XML, sourceKind: 'inputxml', sourceName: 'input.xml', origin: 'file', revision: 1 }, { now: () => '2026-07-14T00:00:00.000Z' });
  assert.strictEqual(envelope.schema, 'SourceEnvelope.v1');
  assert.strictEqual(envelope.validation.ok, true);
  assert.deepStrictEqual(validateSourceEnvelope(envelope), envelope.validation);
  assert.deepStrictEqual(JSON.parse(serializeSourceEnvelope(envelope)), envelope);
});
