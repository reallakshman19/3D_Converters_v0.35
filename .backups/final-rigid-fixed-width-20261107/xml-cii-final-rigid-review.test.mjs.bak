import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseFinalCiiRigidInventory,
  splitFinalCiiSections,
} from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js';
import { finalRigidReviewAvailable } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js';

function element(from, to, pointer) {
  const block = [
    `${from} ${to} 0 0 0 100`,
    ...Array.from({ length: 11 }, () => '0 0 0 0 0 0'),
    `0 ${pointer} 0 0 0 0`,
    '0 0 0 0 0 0',
    '0 0 0',
  ];
  assert.equal(block.length, 15);
  return block.join('\n');
}
function file({ p1 = 1, p2 = 2, p3 = 2, declaredRigid = 3,
  rigidLines = ['120.500000 0.000000', '0.000000 0.000000', '-5.200000 0.000000'] } = {}) {
  return [
    '#$ VERSION', '2019', '#$ CONTROL',
    '3 0 0 0 0 0', `0 ${declaredRigid} 0 0 0 0`,
    '0 0 0 0 0 0', '0',
    '#$ ELEMENTS', element(1119, 10020, p1), element(10020, 1120, p2),
    element(1120, 1130, p3),
    '#$ RIGID', ...rigidLines,
  ].join('\r\n') + '\r\n';
}

const original = file();
const sections = splitFinalCiiSections(original);
assert.equal(sections.get('RIGID').length, 3);
assert.equal(sections.get('ELEMENTS').length, 45);
const parsed = parseFinalCiiRigidInventory(original);
assert.equal(parsed.rows.length, 3, 'every final RIGID record appears, even without ELEMENTS linkage');
assert.deepEqual(parsed.rows.map((r) => r.rigidPointer), [1, 2, 3]);
assert.deepEqual(parsed.rows.map((r) => r.weight), [120.5, 0, -5.2]);
assert.equal(parsed.rows[0].rawWeight, '120.500000', 'preserve exact exported weight token');
assert.deepEqual(parsed.rows[0].linkedElements.map((r) => [r.index, r.fromNode, r.toNode]), [[1, '1119', '10020']]);
assert.deepEqual(parsed.rows[1].linkedElements.map((r) => [r.index, r.fromNode, r.toNode]),
  [[2, '10020', '1120'], [3, '1120', '1130']]);
assert.equal(parsed.rows[1].status, 'SHARED_POINTER');
assert.equal(parsed.rows[2].status, 'UNREFERENCED');
assert.equal(parsed.nonpositiveCount, 2);
assert.equal(parsed.sharedCount, 1);
assert.equal(parsed.unreferencedCount, 1);
assert.equal(original, file(), 'reading review does not alter emitted CII bytes');

const clean = parseFinalCiiRigidInventory(file({ p3: 3, rigidLines: [
  '1.00000E+02 0.000000', '2.00000E+01 0.000000', '3.00000E+01 0.000000',
] }));
assert.equal(clean.rows.length, 3);
assert.equal(clean.rows[2].status, 'LINKED');
assert.equal(clean.rows[0].weight, 100);

assert.throws(() => parseFinalCiiRigidInventory(file({ p1: 4 })), /points to RIGID 4/);
assert.throws(() => parseFinalCiiRigidInventory(file({ declaredRigid: 2 })), /declares 2 RIGID records/);
assert.throws(() => parseFinalCiiRigidInventory(file().replace('#$ RIGID', '#$ NO_RIGID')), /missing RIGID section/);
assert.throws(() => parseFinalCiiRigidInventory(file().replace('120.500000', 'NaN')), /not finite/);
assert.throws(() => parseFinalCiiRigidInventory(file().replace('#$ ELEMENTS', '#$ ELEMENTS\n0')), /not a multiple of 15/);
assert.throws(() => parseFinalCiiRigidInventory(file() + '#$ RIGID\n'), /duplicate section/);
assert.throws(() => parseFinalCiiRigidInventory(''), /no generated CII file/);
assert.equal(finalRigidReviewAvailable({ result: { ok: true, ciiText: original } }), true);
assert.equal(finalRigidReviewAvailable({ running: true, result: { ok: true, ciiText: original } }), false);
assert.equal(finalRigidReviewAvailable({ result: { ok: false, ciiText: original } }), false);
assert.equal(finalRigidReviewAvailable({ result: { ok: true, enrichedText: '<xml/>' } }), false);

const panel = readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-output-run.js', import.meta.url), 'utf8');
const popup = readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js', import.meta.url), 'utf8');
assert.match(panel, /createFinalRigidWeightReviewButton\(state\)/, 'button must appear in Output / Run panel');
assert.match(popup, /Review Final weight/);
assert.match(popup, /Rigid pointer/);
assert.match(popup, /data-final-rigid-search/);
assert.match(popup, /data-final-rigid-filter/);
assert.doesNotMatch(popup, /saveMasterContext|rigidWeightOverrides|applyXmlCiiRigidWeightOverrides/,
  'final CII review must not change source weights or export');
console.log('Final CII rigid pointer review tests: PASS');
