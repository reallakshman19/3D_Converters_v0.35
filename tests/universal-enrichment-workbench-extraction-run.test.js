const assert = require('assert');
const test = require('node:test');
const { loadEsm } = require('./universal-enrichment-workbench-test-helpers.js');

async function modules() {
  return {
    ...(await loadEsm('tabs/universal-enrichment-workbench/extraction-config.js')),
    ...(await loadEsm('tabs/universal-enrichment-workbench/extraction-run.js')),
  };
}
function graph(count = 3) {
  const entities = Array.from({ length: count }, (_, index) => ({
    entityId: `entity-${index}`, entityKind: index % 2 ? 'json-value' : 'xml-element',
    sourceKind: 'xml', parentEntityId: null, childEntityIds: [], sourcePath: `/Root[1]/Item[${index + 1}]`,
    sourceOrder: index, depth: 0, name: 'Item', attributes: { CODE: `A-${index}` }, value: `A-${index}`,
    evidence: { nodeName: 'Item', valueType: 'string' },
  }));
  return { schema: 'UniversalSourceGraph.v1', sourceFileId: 'source-abc', sourceRevision: 2, contentHash: 'f'.repeat(64), entities, rootEntityIds: entities.map((e) => e.entityId), validation: { ok: true, errors: [], warnings: [] } };
}
function rules() {
  return [{
    fieldKey: 'key', enabled: true,
    sourceSelector: { entityKinds: [], nameEquals: 'Item', sourcePathPrefix: '/Root' },
    valueSource: { kind: 'entity-value', attributeName: '' },
    strategies: [
      { kind: 'regex', pattern: '^Z-(.+)$', flags: '', captureGroup: 1, trim: true },
      { kind: 'token', delimiterMode: 'literal', delimiter: '-', tokenIndex: 0, trim: true },
    ],
  }];
}

test('test run falls through regex to token and short-circuits on first success', async () => {
  const { createExtractionConfig, createExtractionTestRun } = await modules();
  const config = await createExtractionConfig(rules());
  const run = await createExtractionTestRun(graph(), config, { kind: 'selected', entityIds: ['entity-0'] });
  assert.strictEqual(run.results[0].status, 'matched');
  assert.strictEqual(run.results[0].winningStrategyIndex, 1);
  assert.strictEqual(run.results[0].attempts.length, 2);
  assert.strictEqual(run.results[0].attempts[0].outcome, 'rejected');
  assert.strictEqual(run.results[0].attempts[1].candidate, 'A');
});

test('regex success prevents later token execution and run identity is deterministic', async () => {
  const { createExtractionConfig, createExtractionTestRun, serializeExtractionTestRun } = await modules();
  const draft = rules(); draft[0].strategies[0].pattern = '^([A-Z])-(.+)$';
  const config = await createExtractionConfig(draft);
  const first = await createExtractionTestRun(graph(), config, { kind: 'selected', entityIds: ['entity-1'] });
  const second = await createExtractionTestRun(graph(), config, { kind: 'selected', entityIds: ['entity-1'] });
  assert.strictEqual(first.runId, second.runId);
  assert.strictEqual(first.results[0].attempts.length, 1);
  assert.deepStrictEqual(JSON.parse(serializeExtractionTestRun(first)), first);
  assert.ok(Object.isFrozen(first.results[0].attempts));
});

test('selected, filtered and all scopes preserve authoritative deterministic order', async () => {
  const { createExtractionConfig, createExtractionTestRun } = await modules();
  const config = await createExtractionConfig(rules());
  const selected = await createExtractionTestRun(graph(), config, { kind: 'selected', entityIds: ['entity-2'] });
  const filtered = await createExtractionTestRun(graph(), config, { kind: 'filtered', entityIds: ['entity-2', 'entity-0'] });
  const all = await createExtractionTestRun(graph(), config, { kind: 'all', entityIds: ['entity-2'] });
  assert.deepStrictEqual(selected.scope.entityIds, ['entity-2']);
  assert.deepStrictEqual(filtered.scope.entityIds, ['entity-2', 'entity-0']);
  assert.deepStrictEqual(all.scope.entityIds, ['entity-0', 'entity-1', 'entity-2']);
  assert.notStrictEqual(selected.runId, filtered.runId);
});

test('5000 entity cap and 10000 character input guard produce bounded evidence', async () => {
  const { createExtractionConfig, createExtractionTestRun } = await modules();
  const config = await createExtractionConfig(rules());
  const large = graph(5002);
  large.entities[0].value = 'x'.repeat(10001);
  const run = await createExtractionTestRun(large, config, { kind: 'all', entityIds: [] });
  assert.strictEqual(run.summary.testedEntityCount, 5000);
  assert.strictEqual(run.summary.truncated, true);
  assert.ok(run.validation.warnings.some((item) => item.includes('truncated')));
  assert.strictEqual(run.results[0].status, 'rejected');
  assert.strictEqual(run.results[0].input.length, 10000);
  assert.strictEqual(run.results[0].attempts[0].input.length, 10000);
  assert.ok(run.results[0].attempts[0].reason.includes('10000'));
});

test('run construction rejects wrong graph and configuration schemas', async () => {
  const { createExtractionConfig, createExtractionTestRun } = await modules();
  const sourceGraph = graph();
  const config = await createExtractionConfig(rules());
  await assert.rejects(
    createExtractionTestRun({ ...sourceGraph, schema: 'WrongGraph.v1' }, config, { kind: 'all', entityIds: [] }),
    /UniversalSourceGraph\.v1/,
  );
  await assert.rejects(
    createExtractionTestRun(sourceGraph, { ...config, schema: 'WrongConfig.v1' }, { kind: 'all', entityIds: [] }),
    /ExtractionConfig\.v1/,
  );
});

test('validation recomputes summary, metadata, IDs, scope and winning strategy consistency', async () => {
  const { createExtractionConfig, createExtractionTestRun, validateExtractionTestRun } = await modules();
  const sourceGraph = graph();
  const config = await createExtractionConfig(rules());
  const run = await createExtractionTestRun(sourceGraph, config, { kind: 'selected', entityIds: ['entity-0'] });
  const corrupt = structuredClone(run);
  corrupt.summary.matchedCount = 99;
  corrupt.sourceRevision = 9;
  corrupt.runId = 'extract-run-bad';
  corrupt.results[0].winningStrategyIndex = 0;
  corrupt.results[0].entityId = 'entity-1';
  const validation = await validateExtractionTestRun(corrupt, sourceGraph, config);
  assert.strictEqual(validation.ok, false);
  assert.ok(validation.errors.some((item) => item.includes('metadata')));
  assert.ok(validation.errors.some((item) => item.includes('summary')));
  assert.ok(validation.errors.some((item) => item.includes('Winning strategy')));
  assert.ok(validation.errors.some((item) => item.includes('outside the frozen scope')));
  assert.ok(validation.errors.some((item) => item.includes('run ID') || item.includes('Test run ID')));
});

test('graph and config remain unchanged after run construction', async () => {
  const { createExtractionConfig, createExtractionTestRun } = await modules();
  const sourceGraph = graph();
  const config = await createExtractionConfig(rules());
  const graphBefore = JSON.stringify(sourceGraph);
  const configBefore = JSON.stringify(config);
  await createExtractionTestRun(sourceGraph, config, { kind: 'all', entityIds: [] });
  assert.strictEqual(JSON.stringify(sourceGraph), graphBefore);
  assert.strictEqual(JSON.stringify(config), configBefore);
});
