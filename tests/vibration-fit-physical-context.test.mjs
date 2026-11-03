import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIT_PHYSICAL_DERIVATIONS,
  resolveFitPhysicalContext,
  validateFitPhysicalInput,
} from '../converters/vibration/fit/physical-context.js';

const nominal = Object.freeze({
  outsideDiameterM: 0.1683,
  wallThicknessM: 0.00711,
  massFlowKgS: 11.8,
  densityKgM3: 37.4,
  maximumUnsupportedSpanM: 5.8,
});

function nearlyEqual(actual, expected, tolerance = 1e-12) {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('FIT physical context resolves only universal geometry and hydraulic quantities', () => {
  const result = resolveFitPhysicalContext(nominal);
  assert.equal(result.ok, true, JSON.stringify(result));

  const expectedId = nominal.outsideDiameterM - 2 * nominal.wallThicknessM;
  const expectedArea = Math.PI * expectedId ** 2 / 4;
  const expectedVolumetricFlow = nominal.massFlowKgS / nominal.densityKgM3;
  const expectedVelocity = expectedVolumetricFlow / expectedArea;

  nearlyEqual(result.derived.insideDiameterM, expectedId);
  nearlyEqual(result.derived.flowAreaM2, expectedArea);
  nearlyEqual(result.derived.volumetricFlowM3S, expectedVolumetricFlow);
  nearlyEqual(result.derived.meanVelocityMS, expectedVelocity);
  assert.equal(result.canonicalInput.maximumUnsupportedSpanM, 5.8);
  assert.equal(result.authority, 'PHYSICAL_CONTEXT_ONLY');
  assert.equal(Object.hasOwn(result, 'applicability'), false);
  assert.equal(Object.hasOwn(result, 'assessment'), false);
  assert.equal(Object.hasOwn(result, 'lof'), false);
});

test('FIT physical derivation evidence is explicit, deterministic and immutable', () => {
  const first = resolveFitPhysicalContext(nominal);
  const second = resolveFitPhysicalContext(nominal);
  assert.deepEqual(first, second);
  assert.deepEqual(first.evidence.map((row) => row.id), FIT_PHYSICAL_DERIVATIONS.map((row) => row.id));
  assert(first.evidence.every((row) => row.authority === 'DERIVED_PHYSICS'));
  assert(Object.isFrozen(first));
  assert(Object.isFrozen(first.canonicalInput));
  assert(Object.isFrozen(first.derived));
  assert(Object.isFrozen(first.evidence));
  assert(Object.isFrozen(first.evidence[0]));
});

test('zero mass flow is valid and resolves to zero volumetric flow and velocity', () => {
  const result = resolveFitPhysicalContext({ ...nominal, massFlowKgS: 0 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.derived.volumetricFlowM3S, 0);
  assert.equal(result.derived.meanVelocityMS, 0);
});

test('missing or malformed required physical data fail closed', () => {
  for (const field of ['outsideDiameterM', 'wallThicknessM', 'massFlowKgS', 'densityKgM3']) {
    const input = { ...nominal };
    delete input[field];
    const result = validateFitPhysicalInput(input);
    assert.equal(result.ok, false);
    assert(result.errors.some((error) => error.code === 'FIT_INPUT_REQUIRED' && error.field === field));
  }

  const stringDiameter = validateFitPhysicalInput({ ...nominal, outsideDiameterM: '0.1683' });
  assert.equal(stringDiameter.ok, false);
  assert(stringDiameter.errors.some((error) => error.field === 'outsideDiameterM' && error.code === 'FIT_INPUT_INVALID'));
});

test('impossible pipe geometry and invalid optional span fail closed', () => {
  const geometry = resolveFitPhysicalContext({ ...nominal, wallThicknessM: nominal.outsideDiameterM / 2 });
  assert.equal(geometry.ok, false);
  assert(geometry.errors.some((error) => error.field === 'wallThicknessM' && /inside diameter/u.test(error.message)));

  const span = validateFitPhysicalInput({ ...nominal, maximumUnsupportedSpanM: 0 });
  assert.equal(span.ok, false);
  assert(span.errors.some((error) => error.field === 'maximumUnsupportedSpanM'));
});

test('non-positive density and negative mass flow are rejected without defaults', () => {
  const density = validateFitPhysicalInput({ ...nominal, densityKgM3: 0 });
  assert.equal(density.ok, false);
  assert(density.errors.some((error) => error.field === 'densityKgM3'));

  const flow = validateFitPhysicalInput({ ...nominal, massFlowKgS: -0.1 });
  assert.equal(flow.ok, false);
  assert(flow.errors.some((error) => error.field === 'massFlowKgS'));
});
