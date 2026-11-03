import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateChapterIxPressureStress } from '../converters/b313-chapter-ix/pressure-stress.js';
import { calculateChapterIxPressureCycleStress } from '../converters/b313-chapter-ix/cycle-stress.js';
import { resolveChapterIxTransientSpectrum } from '../converters/b313-chapter-ix/transient-spectrum.js';
import { calculateChapterIxEquivalentAlternatingStress } from '../converters/b313-chapter-ix/fatigue-equivalent.js';
import { interpolateChapterIxFatigueCurve } from '../converters/b313-chapter-ix/fatigue-curve.js';
import { calculateChapterIxCumulativeDamage } from '../converters/b313-chapter-ix/cumulative-damage.js';
import { evaluateChapterIxStraightPipeFatigueSpectrum } from '../converters/b313-chapter-ix/fatigue-spectrum.js';

const D = 114.3;
const T_EFF = 8.80375;
const SYNTH_POINTS = [
  { pointNo: 1, nCycles: 1000, alternatingStressMpa: 200, sourceLocator: 'SYNTH' },
  { pointNo: 2, nCycles: 10000, alternatingStressMpa: 100, sourceLocator: 'SYNTH' },
  { pointNo: 3, nCycles: 100000, alternatingStressMpa: 50, sourceLocator: 'SYNTH' },
];

function close(actual, expected, tolerance = 1e-9) {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('pressure stress reproduces pinned KD-2 bore identities', () => {
  const result = calculateChapterIxPressureStress({ outsideDiameterMm: D, effectiveWallMm: T_EFF, internalPressureMpa: 30 });
  assert.equal(result.ok, true, JSON.stringify(result));
  close(result.innerDiameterMm, 96.6925);
  close(result.diameterRatioY, 1.1820978876334773);
  close(result.stressIntensityMpa, 210.99831936837877);
  close(Math.abs(result.principalStressDifferenceMpa.s31), result.stressIntensityMpa);
  assert.equal(result.canUseForDesignAuthority, false);
});

test('cycle stress uses pressure range and half stress-intensity range', () => {
  const result = calculateChapterIxPressureCycleStress({
    outsideDiameterMm: D, effectiveWallMm: T_EFF, fromPressureMpa: 5, toPressureMpa: 30,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  close(result.pressureRangeMpa, 25);
  close(result.alternatingStressIntensityMpa, 87.91596640349115);
  close(result.explicitAlternatingStressIntensityMpa, 87.91596640349115);
  close(result.consistencyErrorMpa, 0, 1e-12);
});

test('transient resolver binds transitions to states in the same spectrum', () => {
  const result = resolveChapterIxTransientSpectrum({
    spectrum: { spectrumId: 'S1', designLifeYears: 20, preparedBy: 'A', checkedBy: 'B', status: 'APPROVED' },
    states: [
      { spectrumId: 'S1', stateId: 'LOW', pressureMpa: 5, materialTemperatureC: 40, structuralTemperatureC: 40 },
      { spectrumId: 'S1', stateId: 'HIGH', pressureMpa: 30, materialTemperatureC: 40, structuralTemperatureC: 40 },
    ],
    transitions: [
      { spectrumId: 'S1', cycleId: 'C1', fromStateId: 'LOW', toStateId: 'HIGH', totalCycles: 10000, cyclesPerYear: 500, category: 'PROCESS_CYCLE' },
    ],
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.cycleCount, 1);
  assert.equal(result.cycles[0].pressureRangeMpa, 25);
  assert.equal(result.totalDeclaredCycles, 10000);
});

test('synthetic route maps Salt directly to Seq', () => {
  const result = calculateChapterIxEquivalentAlternatingStress({
    alternatingStressIntensityMpa: 87.91596640349115,
    seqRoute: 'DIRECT_SALT_EQUAL_SEQ',
  });
  assert.equal(result.ok, true);
  close(result.equivalentAlternatingStressMpa, 87.91596640349115);
  assert.equal(result.routeState, 'SYNTHETIC_REFERENCE_ONLY');
});

test('CORE KD320 route is blocked instead of applying an unqualified provisional formula', () => {
  const result = calculateChapterIxEquivalentAlternatingStress({
    alternatingStressIntensityMpa: 80,
    seqRoute: 'KD320_MEAN_STRESS_CORRECTION',
    meanStressMpa: 100,
    yieldStrengthMpa: 400,
    beta: 0.2,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'KD320_CORE_ROUTE_NOT_QUALIFIED');
  assert.equal(result.details.requiredInputMode, 'USER_CALCULATED_KD3');
  assert.equal(result.canUseForDesignAuthority, false);
});

test('log-log fatigue interpolation reproduces independent synthetic oracle', () => {
  const result = interpolateChapterIxFatigueCurve({
    equivalentAlternatingStressMpa: 87.91596640349115,
    points: SYNTH_POINTS,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  close(result.permissibleCycles, 15339.206643641892, 1e-6);
  assert.equal(result.interpolation.type, 'LOG_LOG_NO_EXTRAPOLATION');
});

test('fatigue curve blocks both high- and low-stress extrapolation', () => {
  for (const stress of [250, 40]) {
    const result = interpolateChapterIxFatigueCurve({ equivalentAlternatingStressMpa: stress, points: SYNTH_POINTS });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'BLOCKED_NO_EXTRAPOLATION');
  }
});

test('Miner damage sums ni/Ni and exposes reference-only unity result', () => {
  const result = calculateChapterIxCumulativeDamage({
    cycles: [
      { cycleId: 'A', appliedCycles: 1000, permissibleCycles: 10000 },
      { cycleId: 'B', appliedCycles: 2000, permissibleCycles: 20000 },
    ],
  });
  assert.equal(result.ok, true);
  close(result.cumulativeUsage, 0.2);
  assert.equal(result.referenceStatus, 'REFERENCE_PASS');
  assert.equal(result.canUseForDesignAuthority, false);
});

test('full synthetic straight-pipe spectrum executes state -> stress -> life -> usage', () => {
  const result = evaluateChapterIxStraightPipeFatigueSpectrum({
    outsideDiameterMm: D,
    effectiveWallMm: T_EFF,
    spectrum: { spectrumId: 'SYNTH', designLifeYears: 20 },
    states: [
      { spectrumId: 'SYNTH', stateId: 'LOW', pressureMpa: 5, materialTemperatureC: 40, structuralTemperatureC: 40 },
      { spectrumId: 'SYNTH', stateId: 'HIGH', pressureMpa: 30, materialTemperatureC: 40, structuralTemperatureC: 40 },
    ],
    transitions: [
      { spectrumId: 'SYNTH', cycleId: 'C1', fromStateId: 'LOW', toStateId: 'HIGH', totalCycles: 10000, category: 'PROCESS_CYCLE' },
    ],
    fatigueRoute: {
      fatigueRouteId: 'ROUTE-KD3-SYNTH', seqRoute: 'DIRECT_SALT_EQUAL_SEQ',
      interpolationRule: 'LOG_LOG', extrapolationAllowed: false,
    },
    fatigueCurvePoints: SYNTH_POINTS,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  close(result.cycles[0].cycleStress.alternatingStressIntensityMpa, 87.91596640349115);
  close(result.cycles[0].permissibleCycles, 15339.206643641892, 1e-6);
  close(result.damage.cumulativeUsage, 10000 / 15339.206643641892, 1e-9);
  assert.equal(result.referenceStatus, 'REFERENCE_PASS');
  assert.equal(result.calculationState, 'BENCHMARK_ONLY');
  assert.equal(result.canUseForDesignAuthority, false);
});

test('zero pressure range is an explicit zero-damage cycle without curve extrapolation', () => {
  const result = evaluateChapterIxStraightPipeFatigueSpectrum({
    outsideDiameterMm: 88.9,
    effectiveWallMm: 6.06,
    spectrum: { spectrumId: 'ZERO' },
    states: [
      { spectrumId: 'ZERO', stateId: 'A', pressureMpa: 15, materialTemperatureC: 40, structuralTemperatureC: 40 },
      { spectrumId: 'ZERO', stateId: 'B', pressureMpa: 15, materialTemperatureC: 40, structuralTemperatureC: 40 },
    ],
    transitions: [{ spectrumId: 'ZERO', cycleId: 'C0', fromStateId: 'A', toStateId: 'B', totalCycles: 25000 }],
    fatigueRoute: { seqRoute: 'DIRECT_SALT_EQUAL_SEQ', interpolationRule: 'LOG_LOG', extrapolationAllowed: false },
    fatigueCurvePoints: SYNTH_POINTS,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.cycles[0].equivalentStress.equivalentAlternatingStressMpa, 0);
  assert.equal(result.cycles[0].fatigueLife.noDamage, true);
  assert.equal(result.cycles[0].fatigueLife.interpolation.type, 'ZERO_STRESS_NO_DAMAGE');
  assert.equal(result.cycles[0].usage, 0);
  assert.equal(result.damage.cumulativeUsage, 0);
});

test('full spectrum blocks production KD320 route and directs user to external calculated input', () => {
  const result = evaluateChapterIxStraightPipeFatigueSpectrum({
    outsideDiameterMm: D,
    effectiveWallMm: T_EFF,
    spectrum: { spectrumId: 'P' },
    states: [
      { spectrumId: 'P', stateId: 'A', pressureMpa: 5, materialTemperatureC: 40, structuralTemperatureC: 40 },
      { spectrumId: 'P', stateId: 'B', pressureMpa: 30, materialTemperatureC: 40, structuralTemperatureC: 40 },
    ],
    transitions: [{ spectrumId: 'P', cycleId: 'C', fromStateId: 'A', toStateId: 'B', totalCycles: 1 }],
    fatigueRoute: { seqRoute: 'KD320_MEAN_STRESS_CORRECTION', interpolationRule: 'LOG_LOG', extrapolationAllowed: false },
    fatigueCurvePoints: SYNTH_POINTS,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'KD320_CORE_ROUTE_NOT_QUALIFIED');
  assert.equal(result.details.stage, 'EQUIVALENT_STRESS');
  assert.equal(result.details.requiredInputMode, 'USER_CALCULATED_KD3');
});
