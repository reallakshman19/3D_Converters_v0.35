/**
 * Safety mutation gate. Each candidate is an actual changed copy of the
 * production transaction module, executed against independent guard tests.
 * A surviving mutation fails CI. Test-only copies live in OS temporary paths.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const base = new URL('../tabs/xml-cii-2019-standalone/', import.meta.url);
const moduleSource = readFileSync(new URL('xml-cii-final-property-transactions.js', base), 'utf8');
const inventorySource = readFileSync(new URL('xml-cii-final-rigid-inventory.js', base), 'utf8');
const testSource = readFileSync(new URL('./xml-cii-final-property-transactions.test.mjs', import.meta.url), 'utf8')
  .replace("../tabs/xml-cii-2019-standalone/xml-cii-final-property-transactions.js",
    "./xml-cii-final-property-transactions.js")
  .replace("../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js",
    "./xml-cii-final-rigid-inventory.js");

const mutants = [
  ['pointer-identity',
    "assert(field.start === entry.start && field.end === entry.end, 'target record identity mismatch');",
    "assert(true, 'mutant pointer identity disabled');"],
  ['original-field-token',
    "assert(location.originalToken === edit.originalToken, 'stale original field token');",
    "assert(true, 'mutant original token disabled');"],
  ['width-and-precision',
    "assert(candidate, 'field-width overflow or unrepresentable decimal precision');",
    "assert(true, 'mutant width disabled');"],
  ['unit-validation',
    "assert(edit.unit === descriptor.unit, 'unit mismatch');",
    "assert(true, 'mutant unit disabled');"],
  ['stale-run',
    "assert(options.runIdentity === session.runIdentity, 'stale conversion run identity');",
    "assert(true, 'mutant stale run disabled');"],
  ['non-target-byte-parity',
    "verifyOutsideSpans(session.index.bytes, revised, entries);",
    "revised[2] = 9; // benign-to-parser unauthorized byte mutation"],
  ['atomic-validation',
    "assert(entry.unit === descriptor.unit, 'unit mismatch');",
    "assert(true, 'mutant atomic second edit disabled');"],
  ['read-only-property',
    "assert(descriptor.access === 'editable', 'property is not editable');",
    "assert(true, 'mutant read-only restriction disabled');"],
];

for (const [name, target, replacement] of mutants) {
  test('safety mutation killed: ' + name, { timeout: 120000 }, () => {
    assert.equal(moduleSource.split(target).length, 2, 'mutant target must occur exactly once');
    const dir = mkdtempSync(join(tmpdir(), 'cii-r1-mutant-'));
    try {
      writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
      writeFileSync(join(dir, 'xml-cii-final-rigid-inventory.js'), inventorySource);
      writeFileSync(join(dir, 'xml-cii-final-property-transactions.js'),
        moduleSource.replace(target, replacement));
      writeFileSync(join(dir, 'xml-cii-final-property-transactions.test.mjs'), testSource);
      const run = spawnSync(process.execPath,
        ['--test', join(dir, 'xml-cii-final-property-transactions.test.mjs')],
        { cwd: dir, encoding: 'utf8', timeout: 115000, maxBuffer: 4 * 1024 * 1024 });
      assert.notEqual(run.status, 0, 'MUTANT SURVIVED: ' + name);
      const output = (run.stdout || '') + '\n' + (run.stderr || '');
      assert.match(output, /not ok|ERR_ASSERTION|test failed|SyntaxError|TypeError/,
        'Mutant must fail an executable test, not just a runner startup error');
      console.log('KILLED MUTANT ' + name + ' / child exit ' + run.status);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
