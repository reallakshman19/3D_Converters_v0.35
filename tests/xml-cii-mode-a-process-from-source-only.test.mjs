import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applyModeAProcessFromReferenceToConfig,
  buildModeAProcessFromPlan,
  clearModeAProcessFromReference,
  modeAProcessFromReferenceFromConfig,
  modeAProcessFromSourceChoices,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-process-from.js';

const rows = [
  {
    sourceId: 'SRC14', fileName: 'SYS-0014.xml',
    branchName: '/ASIM-1840-3"-S8810389-91261M7-01/B1',
    lineKey: 'S8810009', lineMiss: false,
    p1: '1000', hydroPressure: '1200', t1: '100', t2: '80', t3: '5', density: '900',
  },
  {
    sourceId: 'SRC13', fileName: 'SYS-0013.xml',
    branchName: '/ASIM-1840-3"-D8810025-91261M7-01/B1',
    lineKey: 'D8810025', lineMiss: false,
    p1: '4140', hydroPressure: 'Water', t1: '260', t2: '99.5', t3: '5', density: '944',
  },
  {
    sourceId: 'SRC12', fileName: 'SYS-0012.xml',
    branchName: '/ASIM-1840-3"-S8810381-91261M7-01/B1',
    lineKey: 'S8810381', lineMiss: false,
    p1: '4300', hydroPressure: '5000', t1: '275', t2: '110', t3: '5', density: '950',
  },
];

const target = rows[0];
const choices = modeAProcessFromSourceChoices(rows, target);
assert.deepEqual(
  choices.map((choice) => `${choice.sourceId}::${choice.lineKey}`).sort(),
  ['SRC12::S8810381', 'SRC13::D8810025'],
  'current target is implicit and must not appear as its own Process From source',
);

const plan = buildModeAProcessFromPlan(
  rows,
  target,
  'SRC13',
  'D8810025',
  ['p1', 'hydroPressure', 't1', 't2', 't3', 'density'],
);
assert.equal(plan.valid, true);
assert.equal(plan.targetSourceId, 'SRC14');
assert.equal(plan.targetLineKey, 'S8810009');
assert.equal(plan.sourceSourceId, 'SRC13');
assert.equal(plan.sourceLineKey, 'D8810025');
assert.deepEqual(plan.values, {
  p1: '4140',
  t1: '260',
  t2: '99.5',
  t3: '5',
  density: '944',
});
assert.equal(plan.invalidFields.length, 1);
assert.equal(plan.invalidFields[0].field, 'hydroPressure');

const config = {
  linelist: {
    branchLineKeyMap: {
      [target.branchName]: 'S8810009',
    },
  },
  overrides: {
    processData: {
      S8810009: {
        p1: '111',
        t1: '222',
        t2: '333',
        __source: {
          processReference: {
            sourceLineKey: 'OLD-SOURCE',
            sourceSourceId: 'OLD',
            targetLineKey: 'S8810009',
            fields: ['p1', 't1', 't2'],
          },
        },
      },
    },
  },
};

applyModeAProcessFromReferenceToConfig(config, plan.change, '2026-08-14T00:00:00.000Z');
assert.equal(config.linelist.branchLineKeyMap[target.branchName], 'S8810009', 'Process From must never alter branch mapping');
assert.equal(config.overrides.processData.S8810009.p1, '4140');
assert.equal(config.overrides.processData.S8810009.t1, '260');
assert.equal(config.overrides.processData.S8810009.t2, '99.5', 'selected new source replaces old referenced field values');
assert.equal(config.overrides.processData.S8810009.density, '944');
let ref = modeAProcessFromReferenceFromConfig(config, 'S8810009');
assert.equal(ref.direction, 'from');
assert.equal(ref.sourceLineKey, 'D8810025');
assert.equal(ref.targetLineKey, 'S8810009');

const replacement = buildModeAProcessFromPlan(rows, target, 'SRC12', 'S8810381', ['p1', 't1']);
assert.equal(replacement.valid, true);
applyModeAProcessFromReferenceToConfig(config, replacement.change, '2026-08-14T00:01:00.000Z');
ref = modeAProcessFromReferenceFromConfig(config, 'S8810009');
assert.equal(ref.sourceLineKey, 'S8810381', 'new user source selection must replace the previous source reference');
assert.deepEqual(ref.fields, ['p1', 't1']);
assert.equal(config.overrides.processData.S8810009.p1, '4300');
assert.equal(config.overrides.processData.S8810009.t1, '275');
assert.equal(Object.hasOwn(config.overrides.processData.S8810009, 't2'), false, 'old reference-only fields must be removed when the new reference omits them');
assert.equal(config.linelist.branchLineKeyMap[target.branchName], 'S8810009');

clearModeAProcessFromReference(config, 'S8810009');
assert.equal(modeAProcessFromReferenceFromConfig(config, 'S8810009'), null);
assert.equal(config.linelist.branchLineKeyMap[target.branchName], 'S8810009', 'clearing Process From must retain branch identity');

const ui = fs.readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-process-from-ui.js', import.meta.url), 'utf8');
assert.match(ui, /Process From \(source\)/);
assert.match(ui, /Current target:/);
assert.doesNotMatch(ui, /Select target Line Key/);
assert.doesNotMatch(ui, /targetSelect/);

console.log('xml-cii Mode A Process From source-only tests: PASS');
