import assert from 'node:assert/strict';
import {
  applyModeAProcessReferenceToConfig,
  buildModeAProcessReferencePlan,
  modeAProcessReferenceFields,
  modeAProcessReferenceFromConfig,
  modeAProcessReferenceTargetGroups,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-process-reference.js';

const rows = [
  {
    sourceId: 'SRC13', fileName: 'SYS-0013.xml', branchName: '/ASIM-S8810381/B1', lineKey: 'S8810381',
    p1: '4140', hydroPressure: 'Water', t1: '260', t2: '151', t3: '5', density: '983',
  },
  { sourceId: 'SRC15', fileName: 'SYS-0015.xml', branchName: '/ASIM-S8810347/B1', lineKey: 'S8810347' },
  { sourceId: 'SRC15', fileName: 'SYS-0015.xml', branchName: '/ASIM-S8810347/B2', lineKey: 'S8810347' },
  { sourceId: 'SRC16', fileName: 'SYS-0016.xml', branchName: '/ASIM-S8810347/B1', lineKey: 'S8810347' },
];

const fields = modeAProcessReferenceFields(rows[0]);
assert.equal(fields.find((item) => item.field === 'p1').value, '4140');
assert.equal(fields.find((item) => item.field === 'hydroPressure').valid, false, 'Water must not be accepted as numeric Test Pressure');

const targets = modeAProcessReferenceTargetGroups(rows, rows[0]);
assert.equal(targets.length, 1);
assert.equal(targets[0].lineKey, 'S8810347');
assert.equal(targets[0].sources.length, 2, 'same target Line Key in different XML files must remain source-distinct');
assert.equal(targets[0].branchCount, 3);
assert.deepEqual(modeAProcessReferenceTargetGroups(rows, { ...rows[0], lineMiss: true }), [], 'unmapped source rows cannot become process references');

const plan = buildModeAProcessReferencePlan(
  rows,
  rows[0],
  'S8810347',
  ['SRC15'],
  ['p1', 'hydroPressure', 't1', 't2', 't3', 'density'],
);
assert.equal(plan.changes.length, 1, 'only explicitly selected target XML source is changed');
assert.equal(plan.changes[0].sourceId, 'SRC15');
assert.equal(plan.affectedBranchCount, 2);
assert.deepEqual(plan.values, { p1: '4140', t1: '260', t2: '151', t3: '5', density: '983' });
assert.deepEqual(plan.invalidFields.map((item) => item.field), ['hydroPressure']);

const emptyTargetPlan = buildModeAProcessReferencePlan(rows, rows[0], 'S8810347', [], ['p1']);
assert.equal(emptyTargetPlan.changes.length, 0, 'empty target XML selection must apply nowhere');
const unmappedSourcePlan = buildModeAProcessReferencePlan(rows, { ...rows[0], lineMiss: true }, 'S8810347', ['SRC15'], ['p1']);
assert.equal(unmappedSourcePlan.changes.length, 0, 'source Line Key must be mapped before reference copying');

const config = {
  linelist: { branchLineKeyMap: { '/ASIM-S8810347/B1': 'S8810347' } },
  overrides: { processData: { S8810347: { t1: '111' } } },
};
applyModeAProcessReferenceToConfig(config, plan.changes[0], '2026-08-14T00:00:00.000Z');
assert.equal(config.linelist.branchLineKeyMap['/ASIM-S8810347/B1'], 'S8810347', 'process reference must not alter line identity');
assert.equal(config.overrides.processData.S8810347.p1, '4140');
assert.equal(config.overrides.processData.S8810347.t1, '260');
assert.equal(config.overrides.processData.S8810347.hydroPressure, undefined, 'invalid Water value must not be copied');

const reference = modeAProcessReferenceFromConfig(config, 'S8810347');
assert.equal(reference.sourceLineKey, 'S8810381');
assert.equal(reference.targetLineKey, 'S8810347');
assert.deepEqual(reference.fields, ['p1', 't1', 't2', 't3', 'density']);

console.log('xml-cii Mode A process reference tests: PASS');
