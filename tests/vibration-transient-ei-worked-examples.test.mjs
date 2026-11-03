import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateDryGasRapidOpening } from '../converters/vibration/transients/dry-gas-opening.js';

function near(actual, expected, relative = 0.015) {
  assert(Math.abs(actual - expected) <= Math.abs(expected) * relative,
    `expected ${actual} within ${relative * 100}% of ${expected}`);
}

const shared = {
  massFlowKgS: 14.86,
  gamma: 1.33,
  gasConstantJPerKmolK: 8314,
  upstreamTemperatureK: 410,
  molecularWeightKgPerKmol: 21.75,
  supportStiffness: 'MEDIUM_STIFF',
};

test('EI D2 relief-upstream dry-gas rapid opening reproduces Fmax, Flim and LOF', () => {
  const result = calculateDryGasRapidOpening({
    ...shared,
    outsideDiameterMm: 114.3,
    insideDiameterMm: 92.1,
    wallThicknessMm: 11.1,
    schedule40ThicknessMm: 6.02,
  });
  near(result.peakForceKn, 6.28, 0.003);
  near(result.limitForceKn, 1.67, 0.01);
  near(result.lof, 3.77, 0.01);
});

test('EI D2 relief-downstream dry-gas rapid opening reproduces Fmax, Flim and LOF', () => {
  const result = calculateDryGasRapidOpening({
    ...shared,
    outsideDiameterMm: 168.3,
    insideDiameterMm: 154.1,
    wallThicknessMm: 7.11,
    schedule40ThicknessMm: 7.11,
  });
  near(result.peakForceKn, 6.28, 0.003);
  near(result.limitForceKn, 3.55, 0.005);
  near(result.lof, 1.77, 0.01);
});

test('support factor is explicit and unknown stiffness fails closed', () => {
  assert.throws(() => calculateDryGasRapidOpening({
    ...shared,
    supportStiffness: 'UNKNOWN',
    outsideDiameterMm: 114.3,
    insideDiameterMm: 92.1,
    wallThicknessMm: 11.1,
    schedule40ThicknessMm: 6.02,
  }), /Unsupported support stiffness/u);
});
