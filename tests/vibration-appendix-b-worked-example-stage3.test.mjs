import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectEiAviffMechanicalExcitationCandidate } from '../converters/vibration/masters/ei-aviff-appendix-b-candidate.js';

test('EI worked example D2.4 reproduces mechanical-excitation governing LOF 0.4', async () => {
  const compressor = await inspectEiAviffMechanicalExcitationCandidate('CENTRIFUGAL_COMPRESSOR');
  const motor = await inspectEiAviffMechanicalExcitationCandidate('ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW');
  assert.equal(compressor.row.baselineLof, 0.2);
  assert.equal(motor.row.baselineLof, 0.4);
  assert.equal(Math.max(compressor.row.baselineLof, motor.row.baselineLof), 0.4);
});
