import assert from 'node:assert/strict';
import {
  buildModeASmartMapChanges,
  buildModeASmartMapGroups,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-smart-map-v2.js';

const rows = [
  { sourceId: 'SRC15', fileName: 'SYS-0015.xml', branchName: '/ASIM-1845-3"-S8810347-91261M7-01/B1', lineKey: 'S8810112', pipingClass: 'ABC900', lineMiss: false },
  { sourceId: 'SRC15', fileName: 'SYS-0015.xml', branchName: '/ASIM-1845-3"-S8810347-91261M7-01/B2', lineKey: 'S8810347', pipingClass: 'ABC900', lineMiss: true },
  { sourceId: 'SRC15', fileName: 'SYS-0015.xml', branchName: '/ASIM-1845-3"-S8810347-91261M7-01/B3', lineKey: 'S8810347', pipingClass: 'ABC900', lineMiss: true },
];
const keys = { SRC15: ['S8810112', 'S8810347', 'S8810348'] };
const catalog = { SRC15: [
  { key: 'S8810112', service: 'S', pipingClass: 'ABC900' },
  { key: 'S8810347', service: 'S', pipingClass: 'ABC900' },
  { key: 'S8810348', service: 'S', pipingClass: 'ABC900' },
] };

const groups = buildModeASmartMapGroups(rows, keys, catalog);
assert.equal(groups.length, 1);
const group = groups[0];
assert.equal(group.branchCount, 3);
assert.equal(group.status, 'conflict');
assert.equal(group.recommended, 'S8810347');
assert.deepEqual(group.existingMappings, ['S8810112']);

const changes = buildModeASmartMapChanges(group, 'S8810347', keys);
assert.equal(changes.valid, true);
assert.deepEqual(changes.changes.map((change) => change.branchName), [
  '/ASIM-1845-3"-S8810347-91261M7-01/B1',
  '/ASIM-1845-3"-S8810347-91261M7-01/B2',
  '/ASIM-1845-3"-S8810347-91261M7-01/B3',
]);

console.log('xml-cii Mode A Smart Map v2 conflict tests: PASS');
