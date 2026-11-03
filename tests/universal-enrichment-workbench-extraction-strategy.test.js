const assert = require('assert');
const test = require('node:test');
const { loadEsm } = require('./universal-enrichment-workbench-test-helpers.js');

async function strategy() { return loadEsm('tabs/universal-enrichment-workbench/extraction-strategy.js'); }
const regex = (pattern, flags = '', captureGroup = 1) => ({ kind: 'regex', pattern, flags, captureGroup, trim: true });
const token = (delimiterMode = 'literal', delimiter = '-', tokenIndex = 0) => ({ kind: 'token', delimiterMode, delimiter, tokenIndex, trim: true });

test('regex supports numeric and named capture groups and deterministic flags', async () => {
  const { executeExtractionStrategy } = await strategy();
  assert.strictEqual(executeExtractionStrategy(regex('^([a-z]+)-', 'i'), 'ABC-1').candidate, 'ABC');
  assert.strictEqual(executeExtractionStrategy(regex('^(?<key>[^-]+)-', '', 'key'), 'L-1').candidate, 'L');
  assert.strictEqual(executeExtractionStrategy(regex('^a.b$', 's', 0), 'a\nb').outcome, 'matched');
  assert.strictEqual(executeExtractionStrategy(regex('^b$', 'm', 0), 'a\nb').outcome, 'matched');
  assert.strictEqual(executeExtractionStrategy(regex('^.$', 'u', 0), '𐀀').outcome, 'matched');
});

test('regex validation rejects invalid patterns, flags and undefined capture groups', async () => {
  const { executeExtractionStrategy, validateRegexStrategy } = await strategy();
  assert.ok(validateRegexStrategy(regex('(', '', 0)).length);
  assert.ok(validateRegexStrategy(regex('(a)', 'gg', 1)).some((item) => item.includes('unsupported') || item.includes('duplicated')));
  assert.ok(validateRegexStrategy(regex('a'.repeat(501), '', 0)).some((item) => item.includes('500')));
  assert.ok(validateRegexStrategy(regex('(a)', '', 2)).some((item) => item.includes('not defined')));
  assert.ok(validateRegexStrategy(regex('(?<actual>a)', '', 'missing')).some((item) => item.includes('not defined')));
  assert.deepStrictEqual(validateRegexStrategy(regex('\\((a)\\)(?:b)(?<key>c)', '', 'key')), []);
  assert.strictEqual(executeExtractionStrategy(regex('(a)', '', 2), 'a').outcome, 'rejected');
  assert.strictEqual(executeExtractionStrategy(regex('z', '', 0), 'a').reason, 'Regex did not match.');
});

test('fresh regex instances prevent state leakage between attempts', async () => {
  const { executeExtractionStrategy } = await strategy();
  const definition = regex('(a)', 'i', 1);
  assert.strictEqual(executeExtractionStrategy(definition, 'a').candidate, 'a');
  assert.strictEqual(executeExtractionStrategy(definition, 'a').candidate, 'a');
});

test('token extraction supports literal, whitespace, empty tokens and zero-based indexes', async () => {
  const { executeExtractionStrategy } = await strategy();
  assert.strictEqual(executeExtractionStrategy(token('literal', '-', 1), 'A-B').candidate, 'B');
  assert.strictEqual(executeExtractionStrategy(token('literal', '-', 1), 'A--B').candidate, '');
  assert.strictEqual(executeExtractionStrategy(token('whitespace', '', 1), ' A   B ').candidate, 'B');
  assert.strictEqual(executeExtractionStrategy(token('literal', '-', 0), 'A-B').candidate, 'A');
});

test('token extraction rejects invalid delimiter and indexes', async () => {
  const { executeExtractionStrategy, validateTokenStrategy } = await strategy();
  assert.ok(validateTokenStrategy(token('literal', '', 0)).length);
  assert.ok(validateTokenStrategy(token('literal', '-', -1)).length);
  assert.ok(validateTokenStrategy(token('literal', '-', 1.5)).length);
  assert.strictEqual(executeExtractionStrategy(token('literal', '-', 4), 'A-B').reason, 'Token index is out of range.');
});

test('structural selectors and value sources use source evidence only', async () => {
  const { matchesSourceSelector, resolveExtractionInput } = await strategy();
  const entity = { entityKind: 'xml-element', name: 'BranchName', sourcePath: '/Root[1]/BranchName[1]', value: 'A-1', attributes: { CODE: 'X-2' } };
  assert.strictEqual(matchesSourceSelector({ entityKinds: ['xml-element'], nameEquals: 'BranchName', sourcePathPrefix: '/Root' }, entity), true);
  assert.strictEqual(matchesSourceSelector({ entityKinds: ['json-value'], nameEquals: 'BranchName', sourcePathPrefix: '/Root' }, entity), false);
  assert.strictEqual(resolveExtractionInput({ kind: 'entity-name' }, entity).input, 'BranchName');
  assert.strictEqual(resolveExtractionInput({ kind: 'entity-value' }, entity).input, 'A-1');
  assert.strictEqual(resolveExtractionInput({ kind: 'source-path' }, entity).input, '/Root[1]/BranchName[1]');
  assert.strictEqual(resolveExtractionInput({ kind: 'attribute', attributeName: 'CODE' }, entity).input, 'X-2');
  assert.strictEqual(resolveExtractionInput({ kind: 'attribute', attributeName: 'MISSING' }, entity).ok, false);
  assert.strictEqual(resolveExtractionInput({ kind: 'entity-value' }, { ...entity, value: [] }).ok, false);
});

test('oversized extraction input is rejected with bounded source evidence', async () => {
  const { testExtractionRule } = await strategy();
  const rule = {
    ruleId: 'rule-1', fieldKey: 'field', enabled: true,
    sourceSelector: { entityKinds: ['xml-element'], nameEquals: 'Item', sourcePathPrefix: '' },
    valueSource: { kind: 'entity-value', attributeName: '' },
    strategies: [regex('(.+)', '', 1)],
  };
  const entity = { entityId: 'entity-1', entityKind: 'xml-element', name: 'Item', sourcePath: '/Item[1]', value: 'abcdefghijkl', attributes: {} };
  const result = testExtractionRule(rule, entity, 10);
  assert.strictEqual(result.status, 'rejected');
  assert.strictEqual(result.input, 'abcdefghij');
  assert.strictEqual(result.attempts[0].input, 'abcdefghij');
  assert.match(result.attempts[0].reason, /12.*10/);
});
