const assert = require('assert');
const test = require('node:test');
const { loadEsm } = require('./universal-enrichment-workbench-test-helpers.js');

async function modules() {
  return {
    ...(await loadEsm('tabs/universal-enrichment-workbench/extraction-rule.js')),
    ...(await loadEsm('tabs/universal-enrichment-workbench/extraction-config.js')),
    ...(await loadEsm('tabs/universal-enrichment-workbench/extraction-draft.js')),
  };
}

function rule(fieldKey = 'line-key') {
  return {
    fieldKey, enabled: true,
    sourceSelector: { entityKinds: ['xml-element'], nameEquals: 'BranchName', sourcePathPrefix: '' },
    valueSource: { kind: 'entity-value', attributeName: '' },
    strategies: [
      { kind: 'regex', pattern: '^([^-]+)-', flags: 'i', captureGroup: 1, trim: true },
      { kind: 'token', delimiterMode: 'literal', delimiter: '-', tokenIndex: 0, trim: true },
    ],
  };
}

test('ExtractionConfig and rule identities are deterministic and deeply immutable', async () => {
  const { createExtractionConfig, serializeExtractionConfig } = await modules();
  const first = await createExtractionConfig([rule()]);
  const second = await createExtractionConfig([structuredClone(rule())]);
  assert.strictEqual(first.configId, second.configId);
  assert.strictEqual(first.rules[0].ruleId, second.rules[0].ruleId);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.rules));
  assert.ok(Object.isFrozen(first.rules[0].strategies[0]));
  assert.deepStrictEqual(JSON.parse(serializeExtractionConfig(first)), first);
});

test('rule order, selector, value source and strategy changes affect identity', async () => {
  const { createExtractionConfig } = await modules();
  const base = await createExtractionConfig([rule('a'), rule('b')]);
  const reordered = await createExtractionConfig([rule('b'), rule('a')]);
  const selector = rule('a'); selector.sourceSelector.nameEquals = 'Other';
  const value = rule('a'); value.valueSource = { kind: 'source-path', attributeName: '' };
  const strategy = rule('a'); strategy.strategies[0].pattern = '(.+)';
  assert.notStrictEqual(base.configId, reordered.configId);
  assert.notStrictEqual((await createExtractionConfig([selector, rule('b')])).configId, base.configId);
  assert.notStrictEqual((await createExtractionConfig([value, rule('b')])).configId, base.configId);
  assert.notStrictEqual((await createExtractionConfig([strategy, rule('b')])).configId, base.configId);
});

test('config validation detects duplicate field keys, rule IDs and invalid order', async () => {
  const { createExtractionConfig, validateExtractionConfig } = await modules();
  const config = await createExtractionConfig([rule('a'), rule('b')]);
  const corrupt = structuredClone(config);
  corrupt.rules[1].fieldKey = 'a';
  corrupt.rules[1].ruleId = corrupt.rules[0].ruleId;
  corrupt.rules[1].sourceOrder = 0;
  const validation = await validateExtractionConfig(corrupt);
  assert.strictEqual(validation.ok, false);
  assert.ok(validation.errors.some((item) => item.includes('Field key')));
  assert.ok(validation.errors.some((item) => item.includes('Rule ID')));
  assert.ok(validation.errors.some((item) => item.includes('sourceOrder')));
});

test('all disabled rules produce a warning while remaining valid', async () => {
  const { createExtractionConfig } = await modules();
  const disabled = rule(); disabled.enabled = false;
  const config = await createExtractionConfig([disabled]);
  assert.strictEqual(config.validation.ok, true);
  assert.deepStrictEqual(config.validation.warnings, ['All extraction rules are disabled.']);
});

test('draft operations add, duplicate, remove and reorder rules and strategies', async () => {
  const m = await modules();
  let rules = [m.createDefaultExtractionRule(0)];
  rules = m.addRuleDraft(rules);
  rules = m.duplicateRuleDraft(rules, 0);
  assert.strictEqual(rules.length, 3);
  rules = m.moveRuleDraft(rules, 2, -1);
  assert.deepStrictEqual(rules.map((item) => item.sourceOrder), [0, 1, 2]);
  rules = m.addStrategyDraft(rules, 0, 'token');
  rules = m.moveStrategyDraft(rules, 0, 1, -1);
  assert.strictEqual(rules[0].strategies[0].kind, 'token');
  rules = m.removeStrategyDraft(rules, 0, 0);
  rules = m.removeRuleDraft(rules, 2);
  assert.strictEqual(rules.length, 2);
});


test('config validation rejects functions, cycles and non-plain runtime values', async () => {
  const { createExtractionConfig, validateExtractionConfig } = await modules();
  const config = structuredClone(await createExtractionConfig([rule()]));
  config.extra = () => 'hidden';
  const functionValidation = await validateExtractionConfig(config);
  assert.ok(functionValidation.errors.some((item) => item.includes('function')));
  delete config.extra;
  config.runtime = /stateful/;
  const objectValidation = await validateExtractionConfig(config);
  assert.ok(objectValidation.errors.some((item) => item.includes('non-plain')));
  delete config.runtime;
  config.self = config;
  const cycleValidation = await validateExtractionConfig(config);
  assert.ok(cycleValidation.errors.some((item) => item.includes('cycle')));
});
