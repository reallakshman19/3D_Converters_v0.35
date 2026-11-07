import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFinalCiiRigidInventory } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js';
import {
  finalRigidWeightErrorPercent, classifyFinalRigidWeightError,
  configuredFinalRigidErrorThreshold, formatFinalRigidErrorPercent,
} from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-weight-error.js';

const writerRow = (values) => values.map((value, index) => String(value).padStart(index === 0 ? 15 : 13, ' ')).join('');
function element(from, to, pointer, dx, dy, dz) {
  return [
    writerRow([from, to, dx, dy, dz, '100.000']),
    ...Array.from({ length: 11 }, () => writerRow([0, 0, 0, 0, 0, 0])),
    writerRow([0, pointer, 0, 0, 0, 0]),
    writerRow([0, 0, 0, 0, 0, 0]),
    writerRow([0, 0, 0]),
  ].join('\n');
}
function cii(size = 180) {
  return [
    '#$ VERSION', '2019', '#$ CONTROL',
    writerRow([size, 0, 0, 0, 0, 0]), writerRow([0, size, 0, 0, 0, 0]),
    writerRow([0, 0, 0, 0, 0, 0]), writerRow([0]),
    '#$ ELEMENTS',
    ...Array.from({ length: size }, (_, i) => element(
      i === 77 ? '700.000' : String(1000 + i),
      i === 77 ? '730.000' : String(1001 + i),
      i + 1, i === 77 ? '-1.000000E-02' : '3.000000', '4.000000', '12.000000',
    )),
    '#$ RIGID',
    ...Array.from({ length: size }, (_, i) => writerRow([String(i + 1), '0.000000'])),
  ].join('\r\n') + '\r\n';
}

const output = cii();
assert.match(output, /730\.000-1\.000000E-02/, 'element 78 must reproduce adjacent signed CII fields');
const parsed = parseFinalCiiRigidInventory(output);
assert.equal(parsed.rows.length, 180, 'every final RIGID pointer remains visible');
assert.equal(parsed.rows[0].linkedElements[0].lengthMm, 13, '3-4-12 displacements give 13 mm');
assert(Math.abs(parsed.rows[77].linkedElements[0].lengthMm - Math.hypot(0.01, 4, 12)) < 1e-10);
assert.equal(parsed.rows[77].linkedElements[0].toNode, '730');
assert.equal(parsed.rows.at(-1).rigidPointer, 180);
assert.equal(parsed.rows.at(-1).weight, 180);
assert.equal(output, cii(), 'parser never changes output bytes');

assert.equal(finalRigidWeightErrorPercent(150, 100), 50);
assert.equal(finalRigidWeightErrorPercent(40, 100), -60);
assert.equal(finalRigidWeightErrorPercent(60, 100), -40);
assert.equal(finalRigidWeightErrorPercent(0, 100), -100);
assert.equal(finalRigidWeightErrorPercent(100, null), null, 'absent reference cannot yield 0%');
assert.equal(finalRigidWeightErrorPercent(100, ''), null);
assert.equal(finalRigidWeightErrorPercent(100, 0), null);
assert.equal(finalRigidWeightErrorPercent(100, 'N/A'), null);
assert.deepEqual(classifyFinalRigidWeightError(150, 100, 50), { errorPct: 50, outside: false });
assert.deepEqual(classifyFinalRigidWeightError(160, 100, 50), { errorPct: 60, outside: true });
assert.deepEqual(classifyFinalRigidWeightError(160, 100, 60), { errorPct: 60, outside: false });
assert.deepEqual(classifyFinalRigidWeightError(40, 100, 50), { errorPct: -60, outside: true });
assert.deepEqual(classifyFinalRigidWeightError(100, '', 50), { errorPct: null, outside: null });
assert.equal(configuredFinalRigidErrorThreshold('{}'), 20);
assert.equal(configuredFinalRigidErrorThreshold('{"weight":{"validatorDeviationPct":60}}'), 60);
assert.equal(configuredFinalRigidErrorThreshold('{ invalid JSON'), 20);
assert.equal(formatFinalRigidErrorPercent(50), '+50.0%');
assert.equal(formatFinalRigidErrorPercent(-60), '-60.0%');
assert.equal(formatFinalRigidErrorPercent(null), '—');

const ui = readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js', import.meta.url), 'utf8');
assert.match(ui, /Element length \(mm\)/);
assert.match(ui, /'Error %'/);
assert.match(ui, /data-final-rigid-reference/);
assert.match(ui, /data-final-rigid-limit/);
assert.match(ui, /classifyFinalRigidWeightError/);
assert.match(ui, /configuredFinalRigidErrorThreshold/);
assert.match(ui, /data-final-rigid-error/);
assert.doesNotMatch(ui, /applyXmlCiiRigidWeightOverrides/, 'review remains non-mutating');
console.log('Final CII rigid length/error tests: PASS');
