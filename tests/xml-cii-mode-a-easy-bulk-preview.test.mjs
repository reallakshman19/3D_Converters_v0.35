import assert from 'node:assert/strict';
import {
  buildModeAPreviewFillPlan,
  buildModeAProjectDataMatchPlan,
  modeAPreviewFillGroupKey,
  modeAPreviewFillRule,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-bulk-preview.js';

const rows = [
  { sourceId: 'A', fileName: 'A.xml', branchName: '/A/B1', lineKey: 'L100', pipingClass: 'PC1', size: '80mm', p1: '4140', p1Source: 'line-list', wallThickness: '7.62', wallThicknessSource: 'piping-class' },
  { sourceId: 'A', fileName: 'A.xml', branchName: '/A/B2', lineKey: 'L100', pipingClass: 'PC1', size: '80mm', p1: '0', p1Source: 'default-zero', wallThickness: '', wallThicknessSource: 'none' },
  { sourceId: 'B', fileName: 'B.xml', branchName: '/B/B1', lineKey: 'L100', pipingClass: 'PC1', size: '80mm', p1: '5000', p1Source: 'line-list', wallThickness: '', wallThicknessSource: 'none' },
  { sourceId: 'B', fileName: 'B.xml', branchName: '/B/B2', lineKey: 'L200', pipingClass: 'PC1', size: '100mm', p1: '0', p1Source: 'default-zero', wallThickness: '', wallThicknessSource: 'none' },
];

assert.deepEqual(modeAPreviewFillRule('p1'), { field: 'p1', scope: 'line', label: 'Same Line Key' });
assert.deepEqual(modeAPreviewFillRule('wallThickness'), { field: 'wallThickness', scope: 'class-size', label: 'Same Piping Class + Size' });
assert.equal(modeAPreviewFillGroupKey(rows[0], 'p1'), 'LINE:L100');
assert.equal(modeAPreviewFillGroupKey(rows[0], 'wallThickness'), 'PC:PC1|DN:80');

const processPlan = buildModeAPreviewFillPlan(rows, rows[0], 'p1');
assert.equal(processPlan.changes.length, 1, 'only the same-Line-Key default row should be filled');
assert.equal(processPlan.changes[0].sourceId, 'A');
assert.equal(processPlan.changes[0].branchName, '/A/B2');
assert.equal(processPlan.changes[0].value, '4140');
assert(processPlan.skipped.some((row) => row.sourceId === 'B' && row.branchName === '/B/B1'), 'stronger existing line-list value must be preserved');

const wallPlan = buildModeAPreviewFillPlan(rows, rows[0], 'wallThickness');
assert.equal(wallPlan.changes.length, 2, 'Class + Size fill may cross XML files but only within the exact class/size group');
assert(wallPlan.changes.every((row) => row.groupKey === 'PC:PC1|DN:80'));
assert(!wallPlan.changes.some((row) => row.branchName === '/B/B2'), 'different size must not be filled');

const duplicateBranchRows = [
  { sourceId: 'A', fileName: 'A.xml', branchName: '/ASIM-SAME/B1', lineMiss: true },
  { sourceId: 'B', fileName: 'B.xml', branchName: '/ASIM-SAME/B1', lineMiss: true },
  { sourceId: 'B', fileName: 'B.xml', branchName: '/AMB/B2', lineMiss: true },
];
const sourceKeys = { A: ['LINE-A'], B: ['LINE-B', 'ALT-B'] };
const resolver = (branchName, keys) => {
  if (branchName === '/AMB/B2') return { status: 'ambiguous', key: '', candidates: keys };
  return { status: 'match', key: keys[0], candidates: [keys[0]] };
};
const matchPlan = buildModeAProjectDataMatchPlan(duplicateBranchRows, sourceKeys, resolver);
assert.equal(matchPlan.changes.length, 2);
assert.deepEqual(matchPlan.changes.map((row) => [row.sourceId, row.lineKey]), [['A', 'LINE-A'], ['B', 'LINE-B']]);
assert.equal(matchPlan.ambiguous.length, 1);
assert.equal(matchPlan.affectedSourceCount, 2);

console.log('xml-cii Mode A easy bulk Preview tests: PASS');
