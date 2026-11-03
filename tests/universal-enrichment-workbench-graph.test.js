const assert = require('assert');
const test = require('node:test');
const { loadEsm } = require('./universal-enrichment-workbench-test-helpers.js');

async function graphModules() {
  const envelope = await loadEsm('tabs/universal-enrichment-workbench/source-envelope.js');
  const projection = await loadEsm('tabs/universal-enrichment-workbench/graph-projection.js');
  const identity = await loadEsm('tabs/universal-enrichment-workbench/graph-identity.js');
  return { ...envelope, ...projection, ...identity };
}

async function envelopeFor(sourceText, sourceKind, overrides = {}) {
  const { createSourceEnvelope } = await graphModules();
  return createSourceEnvelope({
    sourceText, sourceKind, sourceName: overrides.sourceName || 'source.txt',
    origin: 'paste', revision: overrides.revision || 1,
  }, { now: () => overrides.now || '2026-07-14T00:00:00.000Z' });
}

test('projects deterministic XML hierarchy with indexed paths, namespace evidence and direct text', async () => {
  const { createUniversalSourceGraph } = await graphModules();
  const source = '<ns:Root xmlns:ns="urn:test" z="2" a="1"><ns:Item>alpha</ns:Item><ns:Item code="B"/><Other> tail </Other></ns:Root>';
  const envelope = await envelopeFor(source, 'xml');
  const first = await createUniversalSourceGraph(envelope);
  const second = await createUniversalSourceGraph(envelope);
  assert.deepStrictEqual(first, second);
  assert.strictEqual(first.validation.ok, true);
  assert.deepStrictEqual(first.entities.map((entity) => entity.sourcePath), [
    '/ns:Root[1]', '/ns:Root[1]/ns:Item[1]', '/ns:Root[1]/ns:Item[2]', '/ns:Root[1]/Other[1]',
  ]);
  assert.deepStrictEqual(first.entities[0].attributes, { a: '1', 'xmlns:ns': 'urn:test', z: '2' });
  assert.strictEqual(first.entities[1].value, 'alpha');
  assert.strictEqual(first.entities[2].value, null);
  assert.strictEqual(first.entities[0].evidence.nodeName, 'ns:Root');
  assert.strictEqual(first.entities[0].name, 'Root');
});


test('ignores comments and processing instructions while preserving following XML elements', async () => {
  const { createUniversalSourceGraph } = await graphModules();
  const source = '<?xml version="1.0"?><Root><!-- note --><A/><![CDATA[ direct ]]><?next step?><B/></Root>';
  const graph = await createUniversalSourceGraph(await envelopeFor(source, 'xml'));
  assert.deepStrictEqual(graph.entities.map((entity) => entity.sourcePath), ['/Root[1]', '/Root[1]/A[1]', '/Root[1]/B[1]']);
  assert.strictEqual(graph.entities[0].value, 'direct');
});

test('InputXML uses the XML structural adapter without engineering inference', async () => {
  const { createUniversalSourceGraph } = await graphModules();
  const source = '<CAESARII XML_TYPE="INPUT"><PIPINGMODEL><PIPINGELEMENT><FROM_NODE>10</FROM_NODE></PIPINGELEMENT></PIPINGMODEL></CAESARII>';
  const graph = await createUniversalSourceGraph(await envelopeFor(source, 'inputxml'));
  assert.strictEqual(graph.sourceKind, 'inputxml');
  assert(graph.entities.every((entity) => entity.entityKind === 'xml-element'));
  assert(graph.entities.some((entity) => entity.sourcePath.endsWith('/FROM_NODE[1]') && entity.value === '10'));
  const serialized = JSON.stringify(graph).toLowerCase();
  for (const forbidden of ['pipingclass', 'rating', 'weight', 'topology']) assert(!serialized.includes(forbidden));
});

test('projects StagedJSON objects, arrays, values, nulls and escaped keys deterministically', async () => {
  const { createUniversalSourceGraph } = await graphModules();
  const source = '{"simple":1,"a.b":{"space key":[true,null]},"bracket[key]":"x"}';
  const graph = await createUniversalSourceGraph(await envelopeFor(source, 'stagedjson'));
  assert.strictEqual(graph.validation.ok, true);
  assert.deepStrictEqual(graph.entities.map((entity) => entity.sourcePath), [
    '$', '$.simple', '$["a.b"]', '$["a.b"]["space key"]', '$["a.b"]["space key"][0]',
    '$["a.b"]["space key"][1]', '$["bracket[key]"]',
  ]);
  assert.deepStrictEqual(graph.entities.map((entity) => entity.entityKind), [
    'json-object', 'json-value', 'json-object', 'json-array', 'json-value', 'json-value', 'json-value',
  ]);
  assert.strictEqual(graph.entities[4].value, true);
  assert.strictEqual(graph.entities[5].value, null);
  assert.deepStrictEqual(graph.entities.map((entity) => entity.sourceOrder), [0, 1, 2, 3, 4, 5, 6]);
});

test('array roots preserve source order and nested source paths', async () => {
  const { createUniversalSourceGraph } = await graphModules();
  const graph = await createUniversalSourceGraph(await envelopeFor('[{"x":1},{"x":2}]', 'stagedjson'));
  assert.deepStrictEqual(graph.entities.map((entity) => entity.sourcePath), ['$', '$[0]', '$[0].x', '$[1]', '$[1].x']);
  assert.deepStrictEqual(graph.entities.filter((entity) => entity.name === 'x').map((entity) => entity.value), [1, 2]);
});

test('graph and entity identity ignore filename and time but propagate revision and changed content', async () => {
  const { createUniversalSourceGraph, createSourceEntityId } = await graphModules();
  const source = '<Root><Child/></Root>';
  const firstEnvelope = await envelopeFor(source, 'xml', { sourceName: 'a.xml', now: '2026-01-01T00:00:00.000Z', revision: 3 });
  const secondEnvelope = await envelopeFor(source, 'xml', { sourceName: 'renamed.xml', now: '2027-01-01T00:00:00.000Z', revision: 3 });
  const first = await createUniversalSourceGraph(firstEnvelope);
  const second = await createUniversalSourceGraph(secondEnvelope);
  assert.deepStrictEqual(first, second);
  assert.strictEqual(first.sourceRevision, 3);
  const expected = await createSourceEntityId(first.sourceFileId, 'xml', '/Root[1]', 'xml-element');
  assert.strictEqual(first.rootEntityIds[0], expected);
  const changed = await createUniversalSourceGraph(await envelopeFor('<Root><Changed/></Root>', 'xml', { revision: 4 }));
  assert.notStrictEqual(first.sourceFileId, changed.sourceFileId);
  assert.notStrictEqual(first.rootEntityIds[0], changed.rootEntityIds[0]);
});

test('graph serialization round-trips without DOM nodes, functions or object cycles', async () => {
  const { createUniversalSourceGraph, serializeUniversalSourceGraph } = await graphModules();
  const graph = await createUniversalSourceGraph(await envelopeFor('{"a":[1,2]}', 'stagedjson'));
  const serialized = serializeUniversalSourceGraph(graph);
  assert.deepStrictEqual(JSON.parse(serialized), graph);
  const seen = new WeakSet();
  JSON.stringify(graph, (_, value) => {
    assert.notStrictEqual(typeof value, 'function');
    if (value && typeof value === 'object') {
      assert.strictEqual(typeof value.nodeType, 'undefined');
      assert(!seen.has(value), 'graph must not contain shared or cyclic object references');
      seen.add(value);
    }
    return value;
  });
});
