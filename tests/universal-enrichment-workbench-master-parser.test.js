const assert = require('assert');
const test = require('node:test');
const { loadEsm } = require('./universal-enrichment-workbench-test-helpers.js');

async function modules() {
  const parser = await loadEsm('tabs/universal-enrichment-workbench/master-parser.js');
  const normalize = await loadEsm('tabs/universal-enrichment-workbench/master-normalize.js');
  return { ...parser, ...normalize };
}

test('CSV parser preserves quotes, delimiters, multiline fields and trailing cells', async () => {
  const { parseDelimitedMasterText } = await modules();
  const text = 'Name,Notes,Empty\r\n"A,1","Line1\r\nLine2",""\r\nQuote,"He said ""Hi""",\r\n';
  const parsed = parseDelimitedMasterText(text, ',');
  assert.deepStrictEqual(parsed.errors, []);
  assert.deepStrictEqual(parsed.headers, ['Name', 'Notes', 'Empty']);
  assert.deepStrictEqual(parsed.rows, [['A,1', 'Line1\nLine2', ''], ['Quote', 'He said "Hi"', '']]);
});

test('CSV parser preserves unquoted inch marks used by piping masters', async () => {
  const { parseDelimitedMasterText } = await modules();
  const parsed = parseDelimitedMasterText('NPS,Description\n2,2"\n4,4" SCH 40', ',');
  assert.deepStrictEqual(parsed.errors, []);
  assert.deepStrictEqual(parsed.rows, [['2', '2"'], ['4', '4" SCH 40']]);
});

test('TSV parser preserves empty cells and internal blank rows', async () => {
  const { parseDelimitedMasterText } = await modules();
  const parsed = parseDelimitedMasterText('A\tB\tC\n1\t\t3\n\t\t\n4\t5\t', '\t');
  assert.deepStrictEqual(parsed.rows, [['1', '', '3'], ['', '', ''], ['4', '5', '']]);
});

test('duplicate and empty headers are diagnosed without dropping cells', async () => {
  const { parseDelimitedMasterText, normalizeMasterTable } = await modules();
  const parsed = parseDelimitedMasterText('A,,A\n1,2,3,4', ',');
  assert.match(parsed.errors.join(' '), /empty/i);
  assert.match(parsed.errors.join(' '), /duplicated/i);
  const normalized = normalizeMasterTable(parsed);
  assert.strictEqual(normalized.headers.length, 4);
  assert.deepStrictEqual(normalized.rows[0], ['1', '2', '3', '4']);
});

test('JSON forms preserve first-seen columns and missing values', async () => {
  const { parseJsonMasterRows } = await modules();
  const first = parseJsonMasterRows('[{"b":2,"a":1},{"c":3,"a":4}]');
  assert.deepStrictEqual(first.headers, ['b', 'a', 'c']);
  assert.deepStrictEqual(first.rows, [[2, 1, null], [null, 4, 3]]);
  const wrapped = parseJsonMasterRows('{"rows":[{"x":true},{"y":null}]}');
  assert.deepStrictEqual(wrapped.headers, ['x', 'y']);
  assert.deepStrictEqual(wrapped.rows, [[true, null], [null, null]]);
  const normalized = (await modules()).normalizeMasterTable(wrapped);
  assert.deepStrictEqual(normalized.rows, [[true, null], [null, null]]);
});

test('malformed, scalar, mixed and nested-cell JSON are rejected safely', async () => {
  const { parseJsonMasterRows } = await modules();
  assert.match(parseJsonMasterRows('{bad').errors[0], /Malformed JSON/);
  assert.match(parseJsonMasterRows('42').errors[0], /array of row objects/i);
  assert.match(parseJsonMasterRows('[{"a":1},2]').errors[0], /Every JSON master row/i);
  assert.match(parseJsonMasterRows('[{"a":{"nested":1}}]').errors[0], /JSON-safe primitive/i);
});
