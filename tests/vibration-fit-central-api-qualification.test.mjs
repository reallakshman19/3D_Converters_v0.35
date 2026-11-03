import assert from 'node:assert/strict';
import test from 'node:test';
import { VIBRATION_FIT_ENGINEERING_CALCULATION_DEFINITION } from '../converters/engineering-calculations/adapters/vibration-fit.js';
import { createEngineeringCalculationEngine } from '../converters/engineering-calculations/engine.js';
import { createEngineeringCalculationRegistry } from '../converters/engineering-calculations/registry.js';

const engine = createEngineeringCalculationEngine({
  registry: createEngineeringCalculationRegistry({ definitions: [VIBRATION_FIT_ENGINEERING_CALCULATION_DEFINITION] }),
  implementationRevision: 'fit-bounded-unit-qualification',
  clock: () => '2026-08-14T00:00:00.000Z',
});

function run(inputs, inputUnits) {
  return engine.calculate({
    calculationId: 'VIB.FIV.FLOW_TURBULENCE', inputs, inputUnits,
    options: { qualificationMode: 'benchmark', includeEvidence: true },
  });
}

function close(actual, expected, relativeTolerance = 1e-10, absoluteTolerance = 1e-12) {
  const tolerance = Math.max(absoluteTolerance, Math.abs(expected) * relativeTolerance);
  assert(Number.isFinite(actual), `Expected finite value, received ${actual}`);
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} within ${tolerance}`);
}

const STANDARD_CASES = Object.freeze([
  Object.freeze({
    id: 'STIFF_LIQUID',
    expected: Object.freeze({ standardFv: 36642.39693903343, standardLof: 0.027290791092728618 }),
    si: Object.freeze({
      inputs: Object.freeze({ phase: 'LIQUID', outsideDiameter: 0.1683, wallThickness: 0.00711, maximumUnsupportedSpan: 4, density: 1000, fluidVelocity: 1 }),
      units: Object.freeze({ outsideDiameter: 'm', wallThickness: 'm', maximumUnsupportedSpan: 'm', density: 'kg/m3', fluidVelocity: 'm/s' }),
    }),
    us: Object.freeze({
      inputs: Object.freeze({ phase: 'LIQUID', outsideDiameter: 6.625984251968505, wallThickness: 0.2799212598425197, maximumUnsupportedSpan: 13.123359580052492, density: 62.42796057614515, fluidVelocity: 3.280839895013123 }),
      units: Object.freeze({ outsideDiameter: 'in', wallThickness: 'in', maximumUnsupportedSpan: 'ft', density: 'lb/ft3', fluidVelocity: 'ft/s' }),
    }),
  }),
  Object.freeze({
    id: 'MEDIUM_STIFF_GAS',
    expected: Object.freeze({ standardFv: 19347.08209139288, standardLof: 0.03328603116882604 }),
    si: Object.freeze({
      inputs: Object.freeze({ phase: 'GAS', outsideDiameter: 0.3239, wallThickness: 0.00953, maximumUnsupportedSpan: 8, density: 12, gasDynamicViscosity: 0.000018, fluidVelocity: 20 }),
      units: Object.freeze({ outsideDiameter: 'm', wallThickness: 'm', maximumUnsupportedSpan: 'm', density: 'kg/m3', gasDynamicViscosity: 'Pa*s', fluidVelocity: 'm/s' }),
    }),
    us: Object.freeze({
      inputs: Object.freeze({ phase: 'GAS', outsideDiameter: 12.75196850393701, wallThickness: 0.3751968503937008, maximumUnsupportedSpan: 26.246719160104984, density: 0.7491355269137419, gasDynamicViscosity: 0.018, fluidVelocity: 65.61679790026245 }),
      units: Object.freeze({ outsideDiameter: 'in', wallThickness: 'in', maximumUnsupportedSpan: 'ft', density: 'lb/ft3', gasDynamicViscosity: 'cP', fluidVelocity: 'ft/s' }),
    }),
  }),
  Object.freeze({
    id: 'MEDIUM_SMALL_LIQUID',
    expected: Object.freeze({ standardFv: 9264.403089402875, standardLof: 0.15543365137546206 }),
    si: Object.freeze({
      inputs: Object.freeze({ phase: 'LIQUID', outsideDiameter: 0.1683, wallThickness: 0.00711, maximumUnsupportedSpan: 8.5, density: 1000, fluidVelocity: 1.2 }),
      units: Object.freeze({ outsideDiameter: 'm', wallThickness: 'm', maximumUnsupportedSpan: 'm', density: 'kg/m3', fluidVelocity: 'm/s' }),
    }),
    us: Object.freeze({
      inputs: Object.freeze({ phase: 'LIQUID', outsideDiameter: 6.625984251968505, wallThickness: 0.2799212598425197, maximumUnsupportedSpan: 27.887139107611546, density: 62.42796057614515, fluidVelocity: 3.9370078740157473 }),
      units: Object.freeze({ outsideDiameter: 'in', wallThickness: 'in', maximumUnsupportedSpan: 'ft', density: 'lb/ft3', fluidVelocity: 'ft/s' }),
    }),
  }),
  Object.freeze({
    id: 'MEDIUM_LARGE_MULTIPHASE_COMPONENT',
    expected: Object.freeze({ standardFv: 12351.484822879693, standardLof: 0.04079283113435979 }),
    si: Object.freeze({
      inputs: Object.freeze({ phase: 'MULTIPHASE', multiphaseResolutionMode: 'COMPONENT_DERIVED', outsideDiameter: 0.7112, wallThickness: 0.0127, maximumUnsupportedSpan: 17, gasMassFlow: 10, gasDensity: 20, liquidMassFlow: 100, liquidDensity: 800 }),
      units: Object.freeze({ outsideDiameter: 'm', wallThickness: 'm', maximumUnsupportedSpan: 'm', gasMassFlow: 'kg/s', gasDensity: 'kg/m3', liquidMassFlow: 'kg/s', liquidDensity: 'kg/m3' }),
    }),
    us: Object.freeze({
      inputs: Object.freeze({ phase: 'MULTIPHASE', multiphaseResolutionMode: 'COMPONENT_DERIVED', outsideDiameter: 28.000000000000004, wallThickness: 0.5, maximumUnsupportedSpan: 55.77427821522309, gasMassFlow: 79366.41438655593, gasDensity: 1.2485592115229032, liquidMassFlow: 793664.1438655593, liquidDensity: 49.94236846091613 }),
      units: Object.freeze({ outsideDiameter: 'in', wallThickness: 'in', maximumUnsupportedSpan: 'ft', gasMassFlow: 'lb/hr', gasDensity: 'lb/ft3', liquidMassFlow: 'lb/hr', liquidDensity: 'lb/ft3' }),
    }),
  }),
]);

for (const row of STANDARD_CASES) {
  test(`${row.id}: central API is SI/US invariant`, () => {
    const si = run(row.si.inputs, row.si.units);
    const us = run(row.us.inputs, row.us.units);
    assert.equal(si.ok, true, JSON.stringify(si));
    assert.equal(us.ok, true, JSON.stringify(us));
    close(si.outputs.standardFv, row.expected.standardFv);
    close(si.outputs.standardLof, row.expected.standardLof);
    close(us.outputs.standardFv, si.outputs.standardFv);
    close(us.outputs.standardLof, si.outputs.standardLof);
    assert.equal(si.qualification.effective, 'BENCHMARK_ONLY');
    assert.equal(us.qualification.effective, 'BENCHMARK_ONLY');
  });
}

const ADVANCED_CASES = Object.freeze([
  Object.freeze({
    id: 'FLEXIBLE_SMALL_ADVANCED', expected: Object.freeze({ standardLof: 1.05, refinedLof: 0.5672315785176236 }),
    si: Object.freeze({ inputs: Object.freeze({ phase: 'LIQUID', outsideDiameter: 0.1683, wallThickness: 0.00711, maximumUnsupportedSpan: 10, density: 1000, fluidVelocity: 1.6589405806551936, naturalFrequency: 2 }), units: Object.freeze({ outsideDiameter: 'm', wallThickness: 'm', maximumUnsupportedSpan: 'm', density: 'kg/m3', fluidVelocity: 'm/s', naturalFrequency: 'Hz' }) }),
    us: Object.freeze({ inputs: Object.freeze({ phase: 'LIQUID', outsideDiameter: 6.625984251968505, wallThickness: 0.2799212598425197, maximumUnsupportedSpan: 32.80839895013123, density: 62.42796057614515, fluidVelocity: 5.442718440469794, naturalFrequency: 120 }), units: Object.freeze({ outsideDiameter: 'in', wallThickness: 'in', maximumUnsupportedSpan: 'ft', density: 'lb/ft3', fluidVelocity: 'ft/s', naturalFrequency: 'rpm' }) }),
  }),
  Object.freeze({
    id: 'FLEXIBLE_LARGE_ADVANCED', expected: Object.freeze({ standardLof: 1.2, refinedLof: 0.6011490823752119 }),
    si: Object.freeze({ inputs: Object.freeze({ phase: 'LIQUID', outsideDiameter: 0.3239, wallThickness: 0.00953, maximumUnsupportedSpan: 15, density: 1000, fluidVelocity: 1.7348455398663403, naturalFrequency: 2 }), units: Object.freeze({ outsideDiameter: 'm', wallThickness: 'm', maximumUnsupportedSpan: 'm', density: 'kg/m3', fluidVelocity: 'm/s', naturalFrequency: 'Hz' }) }),
    us: Object.freeze({ inputs: Object.freeze({ phase: 'LIQUID', outsideDiameter: 12.75196850393701, wallThickness: 0.3751968503937008, maximumUnsupportedSpan: 49.212598425196845, density: 62.42796057614515, fluidVelocity: 5.691750458879069, naturalFrequency: 120 }), units: Object.freeze({ outsideDiameter: 'in', wallThickness: 'in', maximumUnsupportedSpan: 'ft', density: 'lb/ft3', fluidVelocity: 'ft/s', naturalFrequency: 'rpm' }) }),
  }),
]);

for (const row of ADVANCED_CASES) {
  test(`${row.id}: central advanced path is SI/US invariant including Hz/rpm`, () => {
    const si = run(row.si.inputs, row.si.units);
    const us = run(row.us.inputs, row.us.units);
    assert.equal(si.ok, true, JSON.stringify(si));
    assert.equal(us.ok, true, JSON.stringify(us));
    close(si.outputs.standardLof, row.expected.standardLof);
    close(si.outputs.refinedLof, row.expected.refinedLof);
    close(us.outputs.standardLof, si.outputs.standardLof);
    close(us.outputs.refinedLof, si.outputs.refinedLof);
  });
}

test('MULTIPHASE aggregate-effective central path is SI/US invariant', () => {
  const si = run({
    phase: 'MULTIPHASE', multiphaseResolutionMode: 'AGGREGATE_EFFECTIVE', outsideDiameter: 0.508,
    wallThickness: 0.009525, maximumUnsupportedSpan: 5, massFlow: 237.7711111111111,
    density: 135.99872894820464,
  }, {
    outsideDiameter: 'm', wallThickness: 'm', maximumUnsupportedSpan: 'm', massFlow: 'kg/s', density: 'kg/m3',
  });
  const us = run({
    phase: 'MULTIPHASE', multiphaseResolutionMode: 'AGGREGATE_EFFECTIVE', outsideDiameter: 20,
    wallThickness: 0.37500000000000006, maximumUnsupportedSpan: 16.404199475065614,
    massFlow: 1887104.0533596277, density: 8.490123289184371,
  }, {
    outsideDiameter: 'in', wallThickness: 'in', maximumUnsupportedSpan: 'ft', massFlow: 'lb/hr', density: 'lb/ft3',
  });
  assert.equal(si.ok, true, JSON.stringify(si));
  assert.equal(us.ok, true, JSON.stringify(us));
  close(us.outputs.standardFv, si.outputs.standardFv);
  close(us.outputs.standardLof, si.outputs.standardLof);
  assert.equal(si.provenance.inputResolution.multiphaseResolutionMode, 'AGGREGATE_EFFECTIVE');
  assert.equal(us.provenance.inputResolution.multiphaseResolutionMode, 'AGGREGATE_EFFECTIVE');
});

test('FIT central API fails closed on unsupported engineering units', () => {
  const result = run({
    phase: 'LIQUID', outsideDiameter: 168.3, wallThickness: 7.11,
    maximumUnsupportedSpan: 4, density: 1000, fluidVelocity: 1,
  }, {
    outsideDiameter: 'parsec', wallThickness: 'mm', maximumUnsupportedSpan: 'm', density: 'kg/m3', fluidVelocity: 'm/s',
  });
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === 'INPUT_UNIT_UNSUPPORTED'));
  assert.equal(Object.hasOwn(result, 'outputs'), false);
});
