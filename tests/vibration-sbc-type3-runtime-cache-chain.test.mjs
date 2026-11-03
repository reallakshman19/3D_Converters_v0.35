import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SBC_KEY = '20260815-sbc-pf05-cache-1';
const AIV_KEY = '20260815-aiv-pf01-cache-1';

function source(path) {
  return readFileSync(`${root}/${path}`, 'utf8');
}

const EDGES = Object.freeze([
  ['tabs/engineering-calculations-tab.js', `./vibration-integrity-tab.js?v=${SBC_KEY}`],
  ['tabs/vibration-integrity-tab.js', `./vibration-integrity-user-data-shell.js?v=${SBC_KEY}`],

  ['tabs/vibration-integrity-user-data-shell.js', `../converters/vibration/sbc/type3-user-data.js?v=${SBC_KEY}`],
  ['tabs/vibration-integrity-user-data-shell.js', `./vibration-integrity-sbc-type3-controller.js?v=${SBC_KEY}`],
  ['tabs/vibration-integrity-user-data-shell.js', `./vibration-integrity-sbc-type3-state.js?v=${SBC_KEY}`],
  ['tabs/vibration-integrity-user-data-shell.js', `./vibration-integrity-sbc-type3-view.js?v=${SBC_KEY}`],
  ['tabs/vibration-integrity-user-data-shell.js', `./vibration-integrity-view.js?v=${SBC_KEY}`],

  ['tabs/vibration-integrity-sbc-type3-controller.js', `../converters/vibration/sbc/type3-master-assisted-candidate.js?v=${SBC_KEY}`],
  ['tabs/vibration-integrity-sbc-type3-controller.js', `../converters/vibration/sbc/type3-master-assisted-derivation.js?v=${SBC_KEY}`],
  ['tabs/vibration-integrity-sbc-type3-controller.js', `./vibration-integrity-sbc-candidate-currentness.js?v=${SBC_KEY}`],
  ['tabs/vibration-integrity-sbc-type3-controller.js', `./vibration-integrity-sbc-type3-state.js?v=${SBC_KEY}`],

  ['tabs/vibration-integrity-sbc-type3-state.js', `../converters/vibration/sbc/type3-user-data.js?v=${SBC_KEY}`],
  ['tabs/vibration-integrity-sbc-type3-state.js', `./vibration-integrity-sbc-candidate-currentness.js?v=${SBC_KEY}`],

  ['converters/vibration/sbc/type3-master-assisted-candidate.js', `./type3-combination.js?v=${SBC_KEY}`],
  ['converters/vibration/sbc/type3-master-assisted-candidate.js', `./type3-master-assisted-derivation.js?v=${SBC_KEY}`],
  ['converters/vibration/sbc/type3-master-assisted-candidate.js', `./type3-user-data.js?v=${SBC_KEY}`],

  ['converters/vibration/sbc/type3-master-assisted-derivation.js', `./type3-user-data.js?v=${SBC_KEY}`],
  ['converters/vibration/sbc/type3-master-assisted-derivation.js', `./type3-noncurve-candidate-data.js?v=${SBC_KEY}`],
  ['converters/vibration/sbc/type3-user-data.js', `./type3-combination.js?v=${SBC_KEY}`],

  ['tabs/vibration-integrity-view.js', `./vibration-integrity-mechanisms.js?v=${SBC_KEY}`],
  ['tabs/vibration-integrity-mechanisms.js', `../converters/vibration/sbc/facility.js?v=${SBC_KEY}`],
  ['tabs/vibration-integrity-mechanisms.js', `../converters/vibration/mechanisms/index.js?v=${SBC_KEY}`],
  ['converters/vibration/mechanisms/index.js', `./sbc.js?v=${SBC_KEY}`],
  ['converters/vibration/mechanisms/sbc.js', `../sbc/facility.js?v=${SBC_KEY}`],
  ['converters/vibration/sbc/facility.js', `./type3-user-data.js?v=${SBC_KEY}`],
]);

test('PF-005 versions every changed SBC runtime edge with one cache identity', () => {
  for (const [path, expected] of EDGES) {
    assert.ok(source(path).includes(expected), `${path} must contain ${expected}`);
  }
});

test('shared Engineering Calculations entry preserves current-main AIV cache custody', () => {
  const engineering = source('tabs/engineering-calculations-tab.js');
  assert.ok(engineering.includes(`./vibration-aiv-qualification-tab.js?v=${AIV_KEY}`));
  assert.equal(engineering.includes('vibration-integrity-fit-placeholder-1'), false);
  assert.equal(engineering.includes('vibration-aiv-qualification-tab.js?v=aiv-qualification-2'), false);
});

test('PF-005 cache identity is specific and does not version untouched Mechanical dependencies', () => {
  const shell = source('tabs/vibration-integrity-user-data-shell.js');
  const matrix = source('tabs/vibration-integrity-mechanisms.js');
  assert.ok(shell.includes("from './vibration-integrity-mechanical-controller.js'"));
  assert.ok(shell.includes("from './vibration-integrity-mechanical-view.js'"));
  assert.ok(matrix.includes("from '../converters/vibration/mechanical/facility.js'"));
  assert.equal(shell.includes(`vibration-integrity-mechanical-controller.js?v=${SBC_KEY}`), false);
  assert.equal(matrix.includes(`vibration/mechanical/facility.js?v=${SBC_KEY}`), false);
});
