import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MECHANICAL_EXCITATION_TYPES,
  calculateMechanicalExcitation,
} from '../converters/vibration/mechanical/method.js';

const D2 = {
  sources: [
    { type: MECHANICAL_EXCITATION_TYPES.ELECTRIC_MOTOR_ALTERNATOR, powerKw: 15 },
    { type: MECHANICAL_EXCITATION_TYPES.CENTRIFUGAL_COMPRESSOR },
  ],
};

test('EI D2 mechanical excitation reproduces motor 0.40, compressor 0.20 and governing 0.40', () => {
  const result = calculateMechanicalExcitation(D2);
  assert.deepEqual(result.items.map((item) => item.lof), [0.4, 0.2]);
  assert.equal(result.governingLof, 0.4);
  assert.equal(result.qualificationState, 'BENCHMARK_ONLY');
  assert.equal(result.engineeringAuthority, 'NONE');
});

test('electric motor threshold is explicit at 15 kW', () => {
  const below = calculateMechanicalExcitation({ sources: [{
    type: MECHANICAL_EXCITATION_TYPES.ELECTRIC_MOTOR_ALTERNATOR,
    powerKw: 14.999,
  }] });
  const at = calculateMechanicalExcitation({ sources: [{
    type: MECHANICAL_EXCITATION_TYPES.ELECTRIC_MOTOR_ALTERNATOR,
    powerKw: 15,
  }] });
  assert.equal(below.governingLof, 0.2);
  assert.equal(at.governingLof, 0.4);
});

test('unsupported machinery and invalid adjacent-pipework rule fail closed', () => {
  assert.throws(() => calculateMechanicalExcitation({ sources: [{ type: 'MYSTERY_MACHINE' }] }), /Unsupported/u);
  assert.throws(() => calculateMechanicalExcitation({ sources: [{
    type: MECHANICAL_EXCITATION_TYPES.ADJACENT_PIPEWORK,
    adjacentLof: 0.49,
  }] }), />= 0.5/u);
});
