import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateDeadlegStandard } from '../converters/vibration/deadleg/method.js';

function near(actual, expected, relative = 0.015) {
  assert(Number.isFinite(actual));
  assert(Math.abs(actual - expected) <= Math.abs(expected) * relative,
    `expected ${actual} within ${relative * 100}% of ${expected}`);
}

const cases = [
  {
    id: 'EI-D2-DEADLEG-RECYCLE-DISCHARGE',
    input: { rhoV2Pa: 5191, densityKgM3: 62, velocityMS: Math.sqrt(5191 / 62), mainInsideDiameterMm: 182.55, branchInsideDiameterMm: 182.55, branchLengthM: 5.1, dynamicViscosityPaS: 2e-5, speedOfSoundMS: 456.4 },
    published: { excitationFrequencyHz: 52.2, acousticNaturalFrequencyHz: 18.4, frequencyRatio: 2.83, lof: 1 },
  },
  {
    id: 'EI-D2-DEADLEG-PSV-BYPASS-UPSTREAM',
    input: { rhoV2Pa: 80203, densityKgM3: 62, velocityMS: Math.sqrt(80203 / 62), mainInsideDiameterMm: 92.1, branchInsideDiameterMm: 42.85, branchLengthM: 0.3, dynamicViscosityPaS: 2e-5, speedOfSoundMS: 456.4 },
    published: { excitationFrequencyHz: 293.4, acousticNaturalFrequencyHz: 313.4, frequencyRatio: 0.94, lof: 0.29 },
  },
  {
    id: 'EI-D2-DEADLEG-PSV-BYPASS-DOWNSTREAM',
    input: { rhoV2Pa: 158823, densityKgM3: 4, velocityMS: Math.sqrt(158823 / 4), mainInsideDiameterMm: 154.1, branchInsideDiameterMm: 49.25, branchLengthM: 1.1, dynamicViscosityPaS: 1e-5, speedOfSoundMS: 428.4 },
    published: { excitationFrequencyHz: 1076.8, acousticNaturalFrequencyHz: 80.2, frequencyRatio: 13.42, lof: 1 },
  },
];

for (const item of cases) {
  test(`${item.id} reproduces T2.6 frequencies and standard LOF`, () => {
    const result = calculateDeadlegStandard(item.input);
    assert.equal(result.diameterGatePassed, true);
    near(result.excitationFrequencyHz, item.published.excitationFrequencyHz);
    near(result.acousticNaturalFrequencyHz, item.published.acousticNaturalFrequencyHz, 0.005);
    near(result.frequencyRatio, item.published.frequencyRatio, 0.02);
    assert.equal(result.lof, item.published.lof);
    assert.equal(result.advanced, null);
  });
}

test('T2.6 diameter gate returns LOF 0.2 before resonance arithmetic', () => {
  const result = calculateDeadlegStandard({
    rhoV2Pa: 1909,
    densityKgM3: 18,
    velocityMS: Math.sqrt(1909 / 18),
    mainInsideDiameterMm: 336.55,
    branchInsideDiameterMm: 50,
    branchLengthM: 1,
    dynamicViscosityPaS: 2e-5,
    speedOfSoundMS: 425.8,
  });
  assert.equal(result.diameterGatePassed, false);
  assert.equal(result.lof, 0.2);
  assert.equal(result.reynolds, undefined);
});
