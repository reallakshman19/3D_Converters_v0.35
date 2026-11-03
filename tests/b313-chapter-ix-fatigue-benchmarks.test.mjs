import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateChapterIxPressureCycleStress } from '../converters/b313-chapter-ix/cycle-stress.js';
import { interpolateChapterIxFatigueCurve } from '../converters/b313-chapter-ix/fatigue-curve.js';
import { calculateChapterIxCumulativeDamage } from '../converters/b313-chapter-ix/cumulative-damage.js';

const SYNTH_POINTS = [
  { nCycles: 1000, alternatingStressMpa: 200 },
  { nCycles: 10000, alternatingStressMpa: 100 },
  { nCycles: 100000, alternatingStressMpa: 50 },
];

function close(actual, expected, relativeTolerance = 1e-4) {
  const limit = Math.max(Math.abs(expected) * relativeTolerance, 1e-12);
  assert(Math.abs(actual - expected) <= limit, `${actual} != ${expected} within ${limit}`);
}

test('HP-AN-001 independent analytical Salt benchmark', () => {
  const result = calculateChapterIxPressureCycleStress({
    outsideDiameterMm: 114.3,
    effectiveWallMm: 8.80375,
    fromPressureMpa: 2,
    toPressureMpa: 20,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  close(result.stressIntensityRangeMpa, 126.598991621);
  close(result.alternatingStressIntensityMpa, 63.299495811);
});

test('HP-CRV-002 independent log-log curve benchmark', () => {
  const result = interpolateChapterIxFatigueCurve({
    equivalentAlternatingStressMpa: 70.710678119,
    points: SYNTH_POINTS,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  close(result.permissibleCycles, 31622.776602);
});

test('HP-CRV-003 and HP-CRV-004 independent no-extrapolation guards', () => {
  const upper = interpolateChapterIxFatigueCurve({ equivalentAlternatingStressMpa: 250, points: SYNTH_POINTS });
  const lower = interpolateChapterIxFatigueCurve({ equivalentAlternatingStressMpa: 40, points: SYNTH_POINTS });
  assert.equal(upper.code, 'BLOCKED_NO_EXTRAPOLATION');
  assert.equal(lower.code, 'BLOCKED_NO_EXTRAPOLATION');
});

test('HP-CRV-005 independent Miner benchmark', () => {
  const result = calculateChapterIxCumulativeDamage({
    cycles: [
      { cycleId: 'B1', appliedCycles: 1000, permissibleCycles: 10000 },
      { cycleId: 'B2', appliedCycles: 5000, permissibleCycles: 50000 },
    ],
  });
  assert.equal(result.ok, true);
  close(result.contributions[0].usage, 0.1);
  close(result.contributions[1].usage, 0.1);
  close(result.cumulativeUsage, 0.2);
});

test('HP-AN-004 zero-range analytical benchmark has zero fatigue damage', () => {
  const cycle = calculateChapterIxPressureCycleStress({
    outsideDiameterMm: 88.9,
    effectiveWallMm: 6.06,
    fromPressureMpa: 15,
    toPressureMpa: 15,
  });
  assert.equal(cycle.ok, true, JSON.stringify(cycle));
  assert.equal(cycle.stressIntensityRangeMpa, 0);
  assert.equal(cycle.alternatingStressIntensityMpa, 0);
  const damage = calculateChapterIxCumulativeDamage({
    cycles: [{ cycleId: 'HP-AN-004', appliedCycles: 25000, permissibleCycles: null, zeroDamage: true }],
  });
  assert.equal(damage.ok, true, JSON.stringify(damage));
  assert.equal(damage.cumulativeUsage, 0);
});
