import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIT_PROCESS_BASIS_AUTHORITY,
  FIT_PROCESS_BASIS_AUTHORITY_SCHEMA,
  evaluateFitProcessBasisAuthority,
  validateFitProcessBasisAuthority,
} from '../converters/vibration/fit/process-basis-authority.js';

test('P01-P03 STANDARD and NORMAL actualization remain explicitly blocked while ACTUAL needs no conversion', () => {
  assert.equal(FIT_PROCESS_BASIS_AUTHORITY.schema, FIT_PROCESS_BASIS_AUTHORITY_SCHEMA);
  assert.equal(FIT_PROCESS_BASIS_AUTHORITY.state, 'BLOCKED_PROCESS_ACTUALIZATION_AUTHORITY');
  assert.equal(FIT_PROCESS_BASIS_AUTHORITY.targetBasis, 'ACTUAL');

  const actual = evaluateFitProcessBasisAuthority('ACTUAL');
  assert.equal(actual.state, 'DIRECT_ACTUAL_BASIS');
  assert.equal(actual.conversionRequired, false);
  assert.equal(actual.productionExecutionAllowed, true);

  for (const basis of ['STANDARD', 'NORMAL']) {
    const result = evaluateFitProcessBasisAuthority(basis);
    assert.equal(result.sourceBasis, basis);
    assert.equal(result.targetBasis, 'ACTUAL');
    assert.equal(result.state, 'BLOCKED_SOURCE_AUTHORITY');
    assert.equal(result.blocker, 'PROCESS_ACTUALIZATION_METHOD_NOT_AUTHORIZED');
    assert.equal(result.conversionRequired, true);
    assert.equal(result.productionExecutionAllowed, false);
  }
});

test('P04-P07 blocked conversion authority contains no hidden reference T/P/Z or gas-law model', () => {
  const record = FIT_PROCESS_BASIS_AUTHORITY;
  assert.equal(record.referenceConditions, null);
  assert.equal(record.conversionModel, null);
  assert.equal(record.compressibilityModel, null);
  assert.equal(record.gasConstant, null);
  assert.equal(record.atmosphericPressure, null);
  assert.equal(record.pressureReferenceRule, null);
  assert.equal(record.invariantQuantityRule, null);
  assert.equal(record.productionExecutionAllowed, false);
});

test('P05 STANDARD and NORMAL remain distinct source bases', () => {
  assert.deepEqual(FIT_PROCESS_BASIS_AUTHORITY.sourceBases, ['STANDARD', 'NORMAL']);
  assert.notEqual(
    evaluateFitProcessBasisAuthority('STANDARD').sourceBasis,
    evaluateFitProcessBasisAuthority('NORMAL').sourceBasis,
  );
});

test('P08-P09 unit conversion and worked examples are explicitly non-adopted conversion authorities', () => {
  const foreign = new Map(FIT_PROCESS_BASIS_AUTHORITY.foreignAuthorities.map((row) => [row.id, row]));
  assert.equal(foreign.get('ENGINEERING_UNIT_CONVERSION').adopted, false);
  assert.equal(foreign.get('VIBRATION_UI_UNIT_EDITING').adopted, false);
  assert.equal(foreign.get('FIT_WORKED_EXAMPLE_ACTUAL_VECTORS').adopted, false);
});

test('blocked validator rejects leaked process actualization constants or models', () => {
  for (const patch of [
    { referenceConditions: { temperature: 15, pressure: 1.01325 } },
    { conversionModel: 'IDEAL_GAS' },
    { compressibilityModel: 'Z_EQUALS_1' },
    { gasConstant: 8.314462618 },
    { atmosphericPressure: 101325 },
    { pressureReferenceRule: 'ASSUME_ABSOLUTE' },
    { invariantQuantityRule: 'MASS_FLOW_CONSERVED' },
    { productionExecutionAllowed: true },
  ]) {
    assert.throws(
      () => validateFitProcessBasisAuthority({ ...FIT_PROCESS_BASIS_AUTHORITY, ...patch }),
      (error) => error.code === 'FIT_PROCESS_BASIS_AUTHORITY_INVALID',
    );
  }
});

test('source pins preserve the current fail-closed process-basis seam without runtime adoption', () => {
  const pins = FIT_PROCESS_BASIS_AUTHORITY.sourcePins;
  assert.equal(pins.familyGovernance.issue, 429);
  assert.equal(pins.engineeringBasis.path, 'converters/vibration/facility/fit-engineering-basis.js');
  assert.equal(pins.engineeringBasis.blob, 'bc673ad368f2b88d0228ca31437adfde9700b962');
  assert.equal(pins.datasetSchema.blob, 'cf893f3c7f6defba0f2e8d4f5162656361ee1182');
  assert.equal(pins.fitMethod.blob, '31942bb400ff2cc065a4afa3423d23d05aa685a6');
});
