/**
 * Real mutation tests on modular production source, not mock guards.
 * Run the unmutated copy first to exclude false positives.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = new URL('../tabs/xml-cii-2019-standalone/', import.meta.url);
const moduleNames = [
  'xml-cii-final-property-validation.js',
  'xml-cii-final-property-registry.js',
  'xml-cii-final-property-reader.js',
  'xml-cii-final-property-session.js',
  'xml-cii-final-property-patcher.js',
  'xml-cii-final-property-verifier.js',
  'xml-cii-final-property-audit.js',
  'xml-cii-final-property-transactions.js',
  'xml-cii-final-rigid-inventory.js',
];
const originals = Object.fromEntries(moduleNames.map((name) =>
  [name, readFileSync(new URL(name, root), 'utf8')]));
const suite = readFileSync(new URL('./xml-cii-final-property-transactions.test.mjs', import.meta.url), 'utf8')
  .replaceAll("../tabs/xml-cii-2019-standalone/", './');

const mutants = [
  ['pointer-identity', 'xml-cii-final-property-patcher.js',
    "assert(field.start === entry.start && field.end === entry.end, 'target record identity mismatch');",
    "assert(true, 'mutated pointer check');", 'tampered staged target pointer'],
  ['original-token', 'xml-cii-final-property-session.js',
    "assert(location.originalToken === edit.originalToken, 'stale original field token');",
    "assert(true, 'mutated original token');", 'stale run / source / token'],
  ['field-overflow', 'xml-cii-final-property-validation.js',
    "assert(candidate, 'field-width overflow or unrepresentable decimal precision');",
    "assert(true, 'mutated width');", 'strict decimal'],
  ['unit-validation', 'xml-cii-final-property-session.js',
    "assert(edit.unit === descriptor.unit, 'unit mismatch');",
    "assert(true, 'mutated unit');", 'stale run / source / token'],
  ['stale-run', 'xml-cii-final-property-transactions.js',
    "assert(options.runIdentity === session.runIdentity, 'stale conversion run identity');",
    "assert(true, 'mutated run authority');", 'stale run / source / token'],
  ['non-target-byte-parity', 'xml-cii-final-property-verifier.js',
    "verifyOutsideSpans(session.index.bytes, revised, entries);",
    "revised[2] = 9; // unauthorized non-target byte edit", 'one pointer'],
  ['atomic-validation', 'xml-cii-final-property-patcher.js',
    "assert(entry.unit === descriptor.unit, 'unit mismatch');",
    "assert(true, 'mutated atomic second field');", 'tampered second edit'],
  ['read-only-property', 'xml-cii-final-property-session.js',
    "assert(descriptor.access === 'editable', 'property is not editable');",
    "assert(true, 'mutated read-only policy');", 'extensibility'],
];

function runCase(name, file = '', needle = '', replacement = '') {
  const dir = mkdtempSync(join(tmpdir(), 'cii-r1-mutant-'));
  try {
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    for (const [filename, source] of Object.entries(originals)) {
      if (filename === file) {
        assert.equal(source.split(needle).length, 2, name + ' mutant anchor missing or duplicated');
        writeFileSync(join(dir, filename), source.replace(needle, replacement));
      } else writeFileSync(join(dir, filename), source);
    }
    writeFileSync(join(dir, 'xml-cii-final-property-transactions.test.mjs'), suite);
    const env = Object.fromEntries(Object.entries(process.env)
      .filter(([key]) => !key.startsWith('NODE_TEST_')));
    const result = spawnSync(process.execPath,
      ['--test', join(dir, 'xml-cii-final-property-transactions.test.mjs')],
      { cwd: dir, env, encoding: 'utf8', timeout: 115000, maxBuffer: 4 * 1024 * 1024 });
    return { status: result.status, output: (result.stdout || '') + '\n' + (result.stderr || '') };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('mutation baseline: unchanged source must be green', { timeout: 120000 }, () => {
  const run = runCase('baseline');
  assert.equal(run.status, 0, 'baseline test suite must PASS before considering any mutant killed\n' + run.output.slice(-1800));
});

for (const [name, file, needle, replacement, witness] of mutants) {
  test('safety mutant killed: ' + name, { timeout: 120000 }, () => {
    const run = runCase(name, file, needle, replacement);
    assert.notEqual(run.status, 0, 'MUTANT SURVIVED: ' + name);
    const failures = run.output.split('\n').filter((line) => /not ok \d+ - /.test(line));
    assert.ok(failures.some((line) => line.includes(witness)),
      name + ' must fail an intended witness, not an unrelated baseline/startup test.\n' + failures.join('\n'));
    console.log('KILLED MUTANT ' + name + ' by ' + witness);
  });
}
