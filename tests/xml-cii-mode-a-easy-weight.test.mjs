import assert from 'node:assert/strict';
import {
  buildModeAWeightFillPlan,
  buildModeAWeightProjectMatchPlan,
  buildModeAWeightUsePlan,
  modeAQualifiedExactWeightRow,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-bulk-weight.js';

const row = (overrides = {}) => ({
  sourceId: 'A', fileName: 'A.xml', branchName: '/B1', key: 'K1',
  componentType: 'RIGID', boreMm: 80, rating: '900', lengthMm: 220,
  bestWeight: 54.125, bestScore: '100%', bestDescription: 'Gate Valve',
  mapped: false, ...overrides,
});

assert.equal(modeAQualifiedExactWeightRow(row()), true);
assert.equal(modeAQualifiedExactWeightRow(row({ bestScore: '50%', bestDescription: 'Interpolated from same Bore/Rating' })), false);
assert.equal(modeAQualifiedExactWeightRow(row({ bestScore: '75%', bestDescription: 'Special Factor' })), false);
assert.equal(modeAQualifiedExactWeightRow(row({ bestWeight: 0 })), false);

const rows = [
  row(),
  row({ sourceId: 'B', fileName: 'B.xml', key: 'K2' }),
  row({ sourceId: 'C', fileName: 'C.xml', key: 'K3', bestScore: '50%', bestDescription: 'Interpolated from same Bore/Rating' }),
  row({ sourceId: 'D', fileName: 'D.xml', key: 'K4', mapped: true }),
];

const project = buildModeAWeightProjectMatchPlan(rows);
assert.equal(project.changes.length, 2);
assert.equal(project.review.length, 1);
assert.equal(project.mapped.length, 1);
assert.deepEqual(project.changes.map((item) => item.sourceId), ['A', 'B']);
assert.equal(project.affectedSourceCount, 2);

const fill = buildModeAWeightFillPlan(rows, rows[0]);
assert.equal(fill.changes.length, 1);
assert.equal(fill.changes[0].sourceId, 'B');
assert.equal(fill.changes[0].weight, 54.125);

const reviewUse = buildModeAWeightUsePlan(rows[2]);
assert.equal(reviewUse.requiresReview, true);
assert.equal(reviewUse.qualifiedExact, false);
assert.equal(reviewUse.change.sourceId, 'C');

console.log('xml-cii Mode A easy Weight Match tests: PASS');
