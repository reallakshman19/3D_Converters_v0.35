import assert from 'node:assert/strict';
import {
  buildModeASmartMapChanges,
  buildModeASmartMapGroups,
  modeASmartMapBranchFamily,
  modeASmartMapGroupForRow,
  modeASmartMapSimilarity,
  modeASmartMapSummary,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-smart-map.js';

assert.equal(
  modeASmartMapBranchFamily('/ASIM-1845-3"-S8810347-91261M7-01/B3'),
  '/ASIM-1845-3"-S8810347-91261M7-01',
);
assert(modeASmartMapSimilarity('S8810450', 'S8810451') > modeASmartMapSimilarity('S8810450', 'S8810448'));

const rows = [
  {
    sourceId: 'SRC15', fileName: 'SYS-0015.xml',
    branchName: '/ASIM-1845-3"-S8810347-91261M7-01/B1',
    lineKey: 'S8810112', lineMiss: false,
  },
  {
    sourceId: 'SRC15', fileName: 'SYS-0015.xml',
    branchName: '/ASIM-1845-3"-S8810347-91261M7-01/B2',
    lineKey: 'S8810347', lineMiss: true,
  },
  {
    sourceId: 'SRC15', fileName: 'SYS-0015.xml',
    branchName: '/ASIM-1845-3"-S8810347-91261M7-01/B3',
    lineKey: 'S8810347', lineMiss: true,
  },
  {
    sourceId: 'SRC14', fileName: 'SYS-0014.xml',
    branchName: '/ASIM-1840-3"-S8810389-91261M7-01/B1',
    lineKey: 'S8810389', lineMiss: true,
  },
  {
    sourceId: 'SRC14', fileName: 'SYS-0014.xml',
    branchName: '/ASIM-1840-3"-S8810389-91261M7-01/B2',
    lineKey: 'S8810389', lineMiss: false,
  },
  {
    sourceId: 'SRC12', fileName: 'SYS-0012.xml',
    branchName: '/ASIM-1900-3"-S8810450-91261M7-01/B1',
    lineKey: 'S8810450', lineMiss: true,
  },
];

const keys = {
  SRC15: ['S8810112', 'S8810347', 'S8810348'],
  SRC14: ['S8810388', 'S8810389'],
  SRC12: ['S8810448', 'S8810451'],
};

const groups = buildModeASmartMapGroups(rows, keys);
const conflict = groups.find((group) => group.sourceId === 'SRC15');
assert(conflict, 'SRC15 line group should exist');
assert.equal(conflict.branchCount, 3, 'B1/B2/B3 must be grouped as one engineering line family');
assert.equal(conflict.unmappedCount, 2);
assert.equal(conflict.status, 'conflict', 'wrong existing sibling mapping must block exact bulk acceptance');
assert.equal(conflict.recommended, 'S8810347', 'exact project key from the branch should remain the recommendation');
assert.deepEqual(conflict.existingMappings, ['S8810112']);
assert.match(conflict.reason, /conflicts with existing mapping S8810112/);

const exact = groups.find((group) => group.sourceId === 'SRC14');
assert.equal(exact.status, 'exact');
assert.equal(exact.recommended, 'S8810389');
assert.equal(exact.branchCount, 2);
assert.equal(exact.unmappedCount, 1);

const similar = groups.find((group) => group.sourceId === 'SRC12');
assert.equal(similar.status, 'similar');
assert.equal(similar.recommended, 'S8810451');
assert(similar.candidates.some((candidate) => candidate.key === 'S8810451' && candidate.basis === 'similar'));

const summary = modeASmartMapSummary(groups);
assert.deepEqual(summary, {
  groupCount: 3,
  branchCount: 4,
  exact: 1,
  similar: 1,
  conflict: 1,
  unresolved: 0,
});

const rowGroup = modeASmartMapGroupForRow(groups, rows[1]);
assert.equal(rowGroup.groupKey, conflict.groupKey, 'row-level Smart Map must open the same grouped workbench record');

const changes = buildModeASmartMapChanges(conflict, 'S8810347', keys);
assert.equal(changes.valid, true);
assert.equal(changes.changes.length, 3, 'approved conflict correction updates wrong B1 and maps B2/B3');
assert(changes.changes.every((change) => change.sourceId === 'SRC15' && change.lineKey === 'S8810347'));

const exactChanges = buildModeASmartMapChanges(exact, 'S8810389', keys);
assert.equal(exactChanges.valid, true);
assert.equal(exactChanges.changes.length, 1, 'already-correct mapped sibling must keep resolver provenance instead of becoming an explicit override');
assert.equal(exactChanges.changes[0].branchName, '/ASIM-1840-3"-S8810389-91261M7-01/B1');

const invalid = buildModeASmartMapChanges(conflict, 'NOT-IN-MASTER', keys);
assert.equal(invalid.valid, false, 'manual Map To value must still exist in that source project Line List');
assert.equal(invalid.changes.length, 0);

console.log('xml-cii Mode A Smart Map tests: PASS');
