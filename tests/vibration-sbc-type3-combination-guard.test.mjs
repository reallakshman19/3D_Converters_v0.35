import assert from 'node:assert/strict';
import test from 'node:test';
import { combineSbcType3Terms } from '../converters/vibration/sbc/type3-combination.js';

function d7Terms() {
  return {
    hasMass: true,
    c: 0.68,
    d: 0.2,
    e: 0.7,
    firstLocation: 1,
    f: 0.6,
    g: 0.2,
    mainlineLof: 1,
    multiplier: 1.42,
  };
}

const REQUIRED_NUMERIC_TERMS = Object.freeze([
  'c', 'd', 'e', 'firstLocation', 'f', 'g', 'mainlineLof', 'multiplier',
]);

for (const key of REQUIRED_NUMERIC_TERMS) {
  for (const value of [null, undefined, '']) {
    test(`${key} fails closed for ${String(value)}`, () => {
      const terms = { ...d7Terms(), [key]: value };
      const result = combineSbcType3Terms(terms);
      assert.equal(result.ok, false);
      assert.equal(result.status, 'NOT_READY');
    });
  }
}

for (const value of [null, undefined, '']) {
  test(`missing mass state fails closed for ${String(value)}`, () => {
    const result = combineSbcType3Terms({ ...d7Terms(), hasMass: value });
    assert.equal(result.ok, false);
    assert(result.problems.some((problem) => problem.term === 'firstSpanHasUnsupportedMass'));
  });
}

test('D7 preserves the locked Type-3 max/min chain', () => {
  const result = combineSbcType3Terms(d7Terms());
  assert.equal(result.ok, true);
  assert.equal(result.firstSpan.c, 0.68);
  assert.equal(result.firstSpan.geometryLof, 0.7);
  assert.equal(result.firstSpan.modifier, 0.7);
  assert.equal(result.subsequentSpans.geometryLof, 0.6);
  assert.equal(result.subsequentSpans.modifier, 0.6);
  assert.equal(result.overallModifier, 0.7);
  assert.equal(result.mainline.adjustedLof, 1.42);
  assert.equal(result.lof, 0.7);
});

test('explicit no-mass path is the only automatic C=0 case', () => {
  const result = combineSbcType3Terms({
    hasMass: false,
    c: null,
    d: 0.4,
    e: 0.2,
    firstLocation: 0.8,
    f: 0.3,
    g: 0.2,
    mainlineLof: 0.2,
    multiplier: 1.42,
  });
  assert.equal(result.ok, true);
  assert.equal(result.firstSpan.c, 0);
  assert.equal(result.firstSpan.geometryLof, 0.4);
  assert.equal(result.lof, 0.284);
});

test('negative and non-finite numeric terms fail closed', () => {
  for (const value of [-0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = combineSbcType3Terms({ ...d7Terms(), d: value });
    assert.equal(result.ok, false);
  }
});
