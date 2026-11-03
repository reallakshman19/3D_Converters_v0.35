const assert = require('assert');
const test = require('node:test');
const { loadEsm } = require('./universal-enrichment-workbench-test-helpers.js');

async function validFixture() {
  const { createSourceEnvelope } = await loadEsm('tabs/universal-enrichment-workbench/source-envelope.js');
  const { createUniversalSourceGraph } = await loadEsm('tabs/universal-enrichment-workbench/graph-projection.js');
  const envelope = await createSourceEnvelope({
    sourceText: '<Root><Child/><Child/></Root>', sourceKind: 'xml',
    sourceName: 'source.xml', origin: 'paste', revision: 1,
  }, { now: () => '2026-07-14T00:00:00.000Z' });
  return { envelope, graph: await createUniversalSourceGraph(envelope) };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function codes(validation) { return new Set(validation.errors.map((error) => error.code)); }

async function validate(graph, envelope) {
  const { validateUniversalSourceGraph } = await loadEsm('tabs/universal-enrichment-workbench/graph-validation.js');
  return validateUniversalSourceGraph(graph, envelope);
}

test('detects schema and source metadata mismatch', async () => {
  const { graph, envelope } = await validFixture();
  const corrupt = clone(graph);
  corrupt.schema = 'Other.v1';
  corrupt.contentHash = 'wrong';
  const result = await validate(corrupt, envelope);
  assert(codes(result).has('SCHEMA_INVALID'));
  assert(codes(result).has('SOURCE_METADATA_MISMATCH'));
});

test('detects duplicate IDs and invalid or duplicate source order', async () => {
  const { graph, envelope } = await validFixture();
  const corrupt = clone(graph);
  corrupt.entities[1].entityId = corrupt.entities[0].entityId;
  corrupt.entities[1].sourceOrder = corrupt.entities[0].sourceOrder;
  const result = await validate(corrupt, envelope);
  assert(codes(result).has('ENTITY_ID_DUPLICATE'));
  assert(codes(result).has('SOURCE_ORDER_DUPLICATE'));
});

test('detects missing parent and child references', async () => {
  const { graph, envelope } = await validFixture();
  const corrupt = clone(graph);
  corrupt.entities[1].parentEntityId = 'entity-missing-parent';
  corrupt.entities[0].childEntityIds.push('entity-missing-child');
  const result = await validate(corrupt, envelope);
  assert(codes(result).has('PARENT_REFERENCE_MISSING'));
  assert(codes(result).has('CHILD_REFERENCE_MISSING'));
});

test('detects parent-child disagreement and duplicate child references', async () => {
  const { graph, envelope } = await validFixture();
  const corrupt = clone(graph);
  const childId = corrupt.entities[1].entityId;
  corrupt.entities[0].childEntityIds.push(childId);
  corrupt.entities[2].parentEntityId = null;
  const result = await validate(corrupt, envelope);
  assert(codes(result).has('CHILD_REFERENCE_DUPLICATE'));
  assert(codes(result).has('CHILD_PARENT_DISAGREEMENT'));
});

test('detects cycles and unreachable entities', async () => {
  const { graph, envelope } = await validFixture();
  const corrupt = clone(graph);
  const root = corrupt.entities[0];
  const child = corrupt.entities[1];
  child.childEntityIds.push(root.entityId);
  root.parentEntityId = child.entityId;
  corrupt.rootEntityIds = [corrupt.entities[2].entityId];
  corrupt.entities[2].parentEntityId = null;
  const result = await validate(corrupt, envelope);
  assert(codes(result).has('GRAPH_CYCLE'));
  assert(codes(result).has('ENTITY_UNREACHABLE'));
});

test('detects non-serializable functions, DOM-like values and object cycles without throwing', async () => {
  const { graph, envelope } = await validFixture();
  const corrupt = clone(graph);
  corrupt.entities[0].evidence.fn = () => {};
  corrupt.entities[1].value = { nodeType: 1, nodeName: 'DIV' };
  corrupt.entities[2].attributes.self = corrupt.entities[2].attributes;
  corrupt.entities[0].attributes.date = new Date('2026-01-01T00:00:00.000Z');
  const result = await validate(corrupt, envelope);
  assert(codes(result).has('VALUE_NON_SERIALIZABLE'));
  assert(codes(result).has('DOM_VALUE_FORBIDDEN'));
  assert(codes(result).has('VALUE_CYCLE'));
  assert(codes(result).has('VALUE_NON_PLAIN_OBJECT'));
});
