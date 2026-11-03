export function evidenceFixtures(resultCount = 2) {
  const graph = {
    schema: 'UniversalSourceGraph.v1', sourceFileId: 'source-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    sourceRevision: 3, contentHash: 'b'.repeat(64), validation: { ok: true, errors: [], warnings: [] },
    entities: [
      { entityId: 'entity-1', sourceOrder: 0, sourcePath: '/Root[1]/Item[1]' },
      { entityId: 'entity-2', sourceOrder: 1, sourcePath: '/Root[1]/Item[2]' },
    ],
  };
  const config = {
    schema: 'ExtractionConfig.v1', configId: 'extract-config-cccccccccccccccccccccccccccccccc',
    validation: { ok: true, errors: [], warnings: [] },
    rules: [
      { ruleId: 'extract-rule-1', fieldKey: 'field-a', enabled: true, sourceOrder: 0 },
      { ruleId: 'extract-rule-2', fieldKey: 'field-b', enabled: true, sourceOrder: 1 },
      { ruleId: 'extract-rule-empty', fieldKey: 'field-empty', enabled: true, sourceOrder: 2 },
    ],
  };
  const base = [
    { ruleId: 'extract-rule-1', fieldKey: 'field-a', entityId: 'entity-1', sourcePath: '/Root[1]/Item[1]', input: 'A-100', status: 'matched', value: 'A', winningStrategyIndex: 0,
      attempts: [{ strategyIndex: 0, kind: 'regex', input: 'A-100', outcome: 'matched', candidate: 'A', reason: '' }] },
    { ruleId: 'extract-rule-2', fieldKey: 'field-b', entityId: 'entity-2', sourcePath: '/Root[1]/Item[2]', input: 'bad', status: 'rejected', value: null, winningStrategyIndex: null,
      attempts: [
        { strategyIndex: 0, kind: 'regex', input: 'bad', outcome: 'rejected', candidate: null, reason: 'Regex did not match.' },
        { strategyIndex: 1, kind: 'token', input: 'bad', outcome: 'rejected', candidate: null, reason: 'Token index is out of range.' },
      ] },
  ];
  const results = [];
  for (let index = 0; index < resultCount; index += 1) {
    const source = base[index % base.length];
    const entity = graph.entities[index % graph.entities.length];
    const rule = config.rules[index % 2];
    results.push({ ...structuredClone(source), ruleId: rule.ruleId, fieldKey: rule.fieldKey,
      entityId: entity.entityId, sourcePath: entity.sourcePath });
  }
  const run = {
    schema: 'ExtractionTestRun.v1', runId: 'extract-run-dddddddddddddddddddddddddddddddd',
    sourceFileId: graph.sourceFileId, sourceRevision: graph.sourceRevision,
    sourceContentHash: graph.contentHash, sourceGraphSchema: graph.schema, configId: config.configId,
    scope: { kind: 'all', entityIds: graph.entities.map((entity) => entity.entityId), requestedEntityCount: graph.entities.length },
    results, summary: { testedEntityCount: graph.entities.length, attemptCount: results.reduce((n, result) => n + result.attempts.length, 0), matchedCount: results.filter((result) => result.status === 'matched').length, rejectedCount: results.filter((result) => result.status === 'rejected').length, truncated: false },
    validation: { ok: true, errors: [], warnings: [] },
  };
  return { graph, config, run };
}
